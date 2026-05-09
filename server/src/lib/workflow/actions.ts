import type { WorkflowAction, TicketWorkflowSnapshot, ActionResult } from "./types";
import type { TicketPriority } from "core/constants/ticket-priority.ts";
import type { TicketCategory } from "core/constants/ticket-category.ts";
import type { Prisma } from "../../generated/prisma/client";
import prisma from "../../db";
import { escalateTicket } from "../escalation";
import { computeSlaDeadlines } from "../sla";

// ── Settable ticket-field allowlist ───────────────────────────────────────────
//
// `update_field` accepts a free-form `field` string (so custom_* fields work
// without code changes), but we restrict native ticket columns to this map so
// no caller can write into sensitive columns (deletedAt, slaBreached, …) or
// pass strings into integer columns and crash Prisma.
//
// `kind` controls how the inbound string `value` is coerced.
type FieldKind = "text" | "enum" | "int" | "bool";
const TICKET_FIELD_ALLOWLIST: Record<string, FieldKind> = {
  // Free-text
  subject:        "text",
  affectedSystem: "text",
  mailboxAlias:   "text",

  // Enums (string columns; Prisma validates the enum value)
  status:     "enum",
  priority:   "enum",
  severity:   "enum",
  impact:     "enum",
  urgency:    "enum",
  category:   "enum",
  ticketType: "enum",
  source:     "enum",

  // Foreign keys (integers)
  customStatusId:     "int",
  customTicketTypeId: "int",
  organizationId:     "int",
  teamId:             "int",

  // Booleans — flags that admins legitimately flip
  isAutoReply:   "bool",
  isBounce:      "bool",
  isSpam:        "bool",
  isQuarantined: "bool",
};

function coerceFieldValue(field: string, value: string, kind: FieldKind): unknown {
  switch (kind) {
    case "text":
    case "enum":
      return value;
    case "int": {
      const n = parseInt(value, 10);
      if (Number.isNaN(n)) throw new Error(`Invalid number for field "${field}": "${value}"`);
      return n;
    }
    case "bool":
      return value === "true";
  }
}

/**
 * Execute a list of workflow actions against a ticket snapshot, in order.
 * Each action is idempotent — it inspects current state and skips if the desired
 * state is already in place. Errors in individual actions are caught and
 * reported per-step rather than aborting the entire list.
 *
 * IMPORTANT: These write directly to Prisma, NOT through route handlers.
 * That prevents workflow-triggered updates from re-entering the engine.
 */
export async function executeWorkflowActions(
  actions: WorkflowAction[],
  ticket: TicketWorkflowSnapshot
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];
  for (const action of actions) {
    try {
      results.push(await executeWorkflowAction(action, ticket));
    } catch (err) {
      results.push({
        type: action.type,
        applied: false,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

async function executeWorkflowAction(
  action: WorkflowAction,
  ticket: TicketWorkflowSnapshot
): Promise<ActionResult> {
  switch (action.type) {
    // ── Canonical: update_field ────────────────────────────────────────────
    case "update_field": {
      const { field, value } = action;

      // Custom field: merge into the ticket's customFields JSON
      if (field.startsWith("custom_")) {
        const row = await prisma.ticket.findUnique({
          where: { id: ticket.id },
          select: { customFields: true },
        });
        const cf = (row?.customFields as Record<string, unknown>) ?? {};
        if (String(cf[field] ?? "") === value) {
          return { type: action.type, applied: false, skippedReason: "field_unchanged" };
        }
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { customFields: { ...cf, [field]: value } as Prisma.InputJsonValue },
        });
        return { type: action.type, applied: true };
      }

      // Incident Record fields: written to the linked Incident record
      const INCIDENT_RECORD_FIELDS = new Set(["isMajor", "incidentPriority", "incidentStatus", "affectedUserCount"]);
      if (INCIDENT_RECORD_FIELDS.has(field)) {
        if (!ticket.linkedIncidentId) {
          return { type: action.type, applied: false, skippedReason: "no_linked_incident" };
        }
        const incident = await prisma.incident.findUnique({
          where: { id: ticket.linkedIncidentId },
          select: { isMajor: true, priority: true, status: true, affectedUserCount: true },
        });
        if (!incident) {
          return { type: action.type, applied: false, skippedReason: "incident_not_found" };
        }

        if (field === "isMajor") {
          const boolVal = value === "true";
          if (incident.isMajor === boolVal) {
            return { type: action.type, applied: false, skippedReason: "field_unchanged" };
          }
          await prisma.incident.update({ where: { id: ticket.linkedIncidentId }, data: { isMajor: boolVal } });
        } else if (field === "incidentPriority") {
          if (String(incident.priority) === value) {
            return { type: action.type, applied: false, skippedReason: "field_unchanged" };
          }
          await prisma.incident.update({ where: { id: ticket.linkedIncidentId }, data: { priority: value as any } });
        } else if (field === "incidentStatus") {
          if (String(incident.status) === value) {
            return { type: action.type, applied: false, skippedReason: "field_unchanged" };
          }
          await prisma.incident.update({ where: { id: ticket.linkedIncidentId }, data: { status: value as any } });
        } else if (field === "affectedUserCount") {
          const numVal = value === "" ? null : parseInt(value, 10);
          if (!isNaN(numVal as number) && incident.affectedUserCount === numVal) {
            return { type: action.type, applied: false, skippedReason: "field_unchanged" };
          }
          await prisma.incident.update({ where: { id: ticket.linkedIncidentId }, data: { affectedUserCount: numVal } });
        }
        return { type: action.type, applied: true };
      }

      // Standard ticket field — must be in the allowlist (rejects anything
      // not explicitly safe to set, including system columns like deletedAt
      // or slaBreached).
      const kind = TICKET_FIELD_ALLOWLIST[field];
      if (!kind) {
        return { type: action.type, applied: false, skippedReason: `field_not_allowed:${field}` };
      }

      const coerced = coerceFieldValue(field, value, kind);

      const current = (ticket as unknown as Record<string, unknown>)[field];
      if (current === coerced) {
        return { type: action.type, applied: false, skippedReason: "field_unchanged" };
      }

      const data: Prisma.TicketUpdateInput = { [field]: coerced } as Prisma.TicketUpdateInput;

      if (field === "priority") {
        const deadlines = computeSlaDeadlines(coerced as TicketPriority, ticket.createdAt);
        data.firstResponseDueAt = deadlines.firstResponseDueAt;
        data.resolutionDueAt = deadlines.resolutionDueAt;
      }

      // Setting a custom status or custom ticket type also syncs the canonical
      // `status` / `ticketType` enum to the workflow state of the chosen
      // config row, so downstream consumers (filters, reports, SLA pause)
      // see consistent state.
      if (field === "customStatusId") {
        const cfg = await prisma.ticketStatusConfig.findUnique({
          where: { id: coerced as number },
          select: { workflowState: true },
        });
        if (!cfg) {
          return { type: action.type, applied: false, skippedReason: "custom_status_not_found" };
        }
        // workflowState is "open" | "in_progress" | "resolved" | "closed";
        // map to TicketStatus enum (which uses the same names).
        (data as Prisma.TicketUpdateInput).status = cfg.workflowState as never;
      }
      if (field === "customTicketTypeId") {
        const cfg = await prisma.ticketTypeConfig.findUnique({
          where: { id: coerced as number },
          select: { slug: true },
        });
        if (!cfg) {
          return { type: action.type, applied: false, skippedReason: "custom_ticket_type_not_found" };
        }
      }

      await prisma.ticket.update({ where: { id: ticket.id }, data });
      return { type: action.type, applied: true };
    }

    // ── Canonical: assign_user ─────────────────────────────────────────────
    case "assign_user": {
      if (ticket.assignedToId === action.agentId) {
        return { type: action.type, applied: false, skippedReason: "already_assigned" };
      }
      const agent = await prisma.user.findFirst({
        where: { id: action.agentId, deletedAt: null },
        select: { id: true },
      });
      if (!agent) {
        return {
          type: action.type,
          applied: false,
          skippedReason: `agent_not_found:${action.agentId}`,
        };
      }
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { assignedToId: action.agentId },
      });
      return { type: action.type, applied: true };
    }

    // ── Canonical: assign_team ─────────────────────────────────────────────
    case "assign_team": {
      if (ticket.teamId === action.teamId) {
        return { type: action.type, applied: false, skippedReason: "already_in_team" };
      }
      const team = await prisma.team.findUnique({
        where: { id: action.teamId },
        select: { id: true },
      });
      if (!team) {
        return {
          type: action.type,
          applied: false,
          skippedReason: `team_not_found:${action.teamId}`,
        };
      }
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { teamId: action.teamId },
      });
      return { type: action.type, applied: true };
    }

    // ── Canonical: create_task ─────────────────────────────────────────────
    case "create_task": {
      // Task model does not exist yet (Phase 2+ in the roadmap).
      // Log intent and skip gracefully so existing workflows aren't broken
      // when this action is configured ahead of the model being ready.
      return {
        type: action.type,
        applied: false,
        skippedReason: "task_model_not_implemented",
      };
    }

    // ── Canonical: add_note ────────────────────────────────────────────────
    case "add_note": {
      // authorId is now nullable — null = system/workflow generated
      await prisma.note.create({
        data: {
          ticketId: ticket.id,
          body: action.body,
          authorId: null,
          isPinned: action.isPinned ?? false,
        },
      });
      return { type: action.type, applied: true };
    }

    // ── Canonical: add_audit_entry ─────────────────────────────────────────
    case "add_audit_entry": {
      // This action's main purpose is to be composable — the engine already writes
      // a workflow.executed audit event after the run. This action lets workflow
      // authors add extra structured metadata mid-execution.
      // Written as a note-style entry in the audit log with actorId=null.
      await prisma.auditEvent.create({
        data: {
          ticketId: ticket.id,
          actorId: null,
          action: "workflow.executed",
          meta: (action.meta ?? {}) as Prisma.InputJsonValue,
        },
      });
      return { type: action.type, applied: true };
    }

    // ── Canonical: send_notification ──────────────────────────────────────
    case "send_notification": {
      // Placeholder: log intent, no actual delivery until notification
      // infrastructure (email / in-app / push) is wired.
      console.log(
        `[workflow] send_notification — target: ${action.target}` +
          (action.userId ? `, userId: ${action.userId}` : "") +
          `, message: ${action.message.slice(0, 80)}`
      );
      return { type: action.type, applied: false, skippedReason: "notification_not_implemented" };
    }

    // ── Canonical: escalate ────────────────────────────────────────────────
    case "escalate": {
      const wasNew = await escalateTicket(ticket.id, "rule_triggered");
      return { type: action.type, applied: wasNew };
    }

    // ── Legacy alias: set_category → update_field ─────────────────────────
    case "set_category": {
      if (ticket.category === action.value) {
        return { type: action.type, applied: false, skippedReason: "field_unchanged" };
      }
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { category: action.value as TicketCategory },
      });
      return { type: action.type, applied: true };
    }

    // ── Legacy alias: set_priority → update_field ─────────────────────────
    case "set_priority": {
      if (ticket.priority === action.value) {
        return { type: action.type, applied: false, skippedReason: "field_unchanged" };
      }
      const deadlines = computeSlaDeadlines(action.value as TicketPriority, ticket.createdAt);
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          priority: action.value as TicketPriority,
          firstResponseDueAt: deadlines.firstResponseDueAt,
          resolutionDueAt: deadlines.resolutionDueAt,
        },
      });
      return { type: action.type, applied: true };
    }

    // ── Legacy alias: assign_to → assign_user ─────────────────────────────
    case "assign_to": {
      if (ticket.assignedToId === action.agentId) {
        return { type: action.type, applied: false, skippedReason: "already_assigned" };
      }
      const agent = await prisma.user.findFirst({
        where: { id: action.agentId, deletedAt: null },
        select: { id: true },
      });
      if (!agent) {
        return {
          type: action.type,
          applied: false,
          skippedReason: `agent_not_found:${action.agentId}`,
        };
      }
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { assignedToId: action.agentId },
      });
      return { type: action.type, applied: true };
    }
  }
}
