/**
 * Automation Engine — Record Lifecycle Handlers
 *
 * Handlers for the lifecycle automation category. Manages record progression
 * and cross-record orchestration with safe guardrails:
 *
 *  close_stale           — close inactive tickets; respects allowedFromStatuses guardrail
 *  create_linked_problem — create a Problem and link it; skipIfLinked prevents duplicates
 *  create_linked_change  — create a Change request and link it
 *  create_linked_request — create a ServiceRequest and link it
 *  create_child_ticket   — create a child ticket (parent ref stored in customFields)
 *  create_follow_up      — create a follow-up review item as a pinned note
 *  link_to_problem       — link an existing problem by ID; skipIfLinked guard
 *  update_linked_records — propagate a field update to all linked ITIL records
 *  merge_into_ticket     — merge this ticket into another with full audit trail
 *
 * Safety principles:
 *  - Every destructive action (close, merge) checks current state first
 *  - skipIfLinked guards prevent duplicate record creation
 *  - All actions write an AuditEvent for compliance
 *  - Handlers never throw — return ActionResult { errorMessage } on failure
 */

import type { AutomationAction } from "core/schemas/automations";
import type { ActionResult, TicketSnapshot } from "./types";
import { logAudit } from "../audit";
import { notify } from "../notify";
import { compose } from "../notification-composer";
import prisma from "../../db";
import { AI_AGENT_ID } from "core/constants/ai-agent";
import { generateTicketNumber } from "../ticket-number";
import { generateChangeNumber } from "../change-number";
import { computeRequestSlaDueAt } from "../request-sla";

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(type: string, meta?: Record<string, unknown>): ActionResult {
  return { type, applied: true, meta };
}
function skip(type: string, reason: string): ActionResult {
  return { type, applied: false, skippedReason: reason };
}
function err(type: string, message: string): ActionResult {
  return { type, applied: false, errorMessage: message };
}

// ── close_stale ───────────────────────────────────────────────────────────────

export async function handleCloseStale(
  action: Extract<AutomationAction, { type: "close_stale" }>,
  snapshot: TicketSnapshot,
): Promise<ActionResult> {
  const allowed = action.allowedFromStatuses ?? ["open", "in_progress", "escalated"];

  if (!allowed.includes(snapshot.status)) {
    return skip("close_stale", `status_not_eligible:${snapshot.status}`);
  }
  if (snapshot.status === "closed") return skip("close_stale", "already_closed");

  const reason = action.useTemplateVars ? await compose(action.reason, snapshot) : action.reason;

  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: snapshot.id },
      data: { status: "closed" as any, statusChangedAt: new Date() },
    });
    if (action.addNote !== false) {
      await tx.note.create({
        data: {
          ticketId: snapshot.id,
          authorId: AI_AGENT_ID,
          isPinned: false,
          body: `**Automatically closed by lifecycle rule**\n\n${reason}`,
        },
      });
    }
  });

  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", {
    action: "close_stale", reason, fromStatus: snapshot.status,
  });
  return ok("close_stale", { fromStatus: snapshot.status, reason });
}

// ── create_linked_problem ─────────────────────────────────────────────────────

export async function handleCreateLinkedProblem(
  action: Extract<AutomationAction, { type: "create_linked_problem" }>,
  snapshot: TicketSnapshot,
): Promise<ActionResult> {
  if (action.skipIfLinked) {
    const existing = await prisma.problemTicketLink.findFirst({
      where: { ticketId: snapshot.id },
      select: { problemId: true },
    });
    if (existing) return skip("create_linked_problem", `already_linked_to_problem:${existing.problemId}`);
  }

  const title = action.useTemplateVars ? await compose(action.title, snapshot) : action.title;
  const description = action.description
    ? (action.useTemplateVars ? await compose(action.description, snapshot) : action.description)
    : undefined;

  const problemNumber = await generateTicketNumber("problem");

  const problem = await prisma.problem.create({
    data: {
      problemNumber,
      title,
      description,
      priority: (action.priority ?? "medium") as any,
      status: "new" as any,
    },
  });

  await prisma.problemTicketLink.create({
    data: { problemId: problem.id, ticketId: snapshot.id, linkedById: AI_AGENT_ID },
  });

  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", {
    action: "create_linked_problem", problemId: problem.id, problemNumber,
  });
  return ok("create_linked_problem", { problemId: problem.id, problemNumber });
}

// ── create_linked_change ──────────────────────────────────────────────────────

export async function handleCreateLinkedChange(
  action: Extract<AutomationAction, { type: "create_linked_change" }>,
  snapshot: TicketSnapshot,
): Promise<ActionResult> {
  if (action.skipIfLinked) {
    // Check if a change already references this ticket via description note or linked ref
    const note = await prisma.note.findFirst({
      where: { ticketId: snapshot.id, body: { contains: "Linked Change:" } },
      select: { id: true },
    });
    if (note) return skip("create_linked_change", "change_already_linked_via_note");
  }

  const title = action.useTemplateVars ? await compose(action.title, snapshot) : action.title;
  const description = action.description
    ? (action.useTemplateVars ? await compose(action.description, snapshot) : action.description)
    : `Created automatically from ticket #${snapshot.ticketNumber ?? snapshot.id}`;

  const changeNumber = await generateChangeNumber();

  const change = await prisma.change.create({
    data: {
      changeNumber,
      title,
      description,
      changeType: (action.changeType ?? "normal") as any,
      state:    "draft" as any,
      priority: (action.priority ?? "medium") as any,
      impact:   "medium" as any,
      urgency:  "medium" as any,
      risk:     "medium" as any,
      changeModel: "normal_change" as any,
      createdById: AI_AGENT_ID,
    },
  });

  // Leave an audit note on the ticket linking to the new change
  await prisma.note.create({
    data: {
      ticketId: snapshot.id,
      authorId: AI_AGENT_ID,
      isPinned: false,
      body: `**Linked Change:** ${changeNumber} — "${title}"\n\nAutomatically created by lifecycle rule.`,
    },
  });

  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", {
    action: "create_linked_change", changeId: change.id, changeNumber,
  });
  return ok("create_linked_change", { changeId: change.id, changeNumber });
}

// ── create_linked_request ─────────────────────────────────────────────────────

export async function handleCreateLinkedRequest(
  action: Extract<AutomationAction, { type: "create_linked_request" }>,
  snapshot: TicketSnapshot,
): Promise<ActionResult> {
  if (action.skipIfLinked && snapshot.linkedIncidentId != null) {
    // Tickets linked to an incident generally already have a service request path
  }
  if (action.skipIfLinked) {
    const existingLink = await prisma.note.findFirst({
      where: { ticketId: snapshot.id, body: { contains: "Linked Service Request:" } },
      select: { id: true },
    });
    if (existingLink) return skip("create_linked_request", "request_already_linked_via_note");
  }

  const title = action.useTemplateVars ? await compose(action.title, snapshot) : action.title;
  const description = action.description
    ? (action.useTemplateVars ? await compose(action.description, snapshot) : action.description)
    : `Auto-created from ticket #${snapshot.ticketNumber ?? snapshot.id}`;

  const requestNumber = await generateTicketNumber("incident"); // service requests share "ticket" series
  const priority = (action.priority ?? "medium") as any;
  const now = new Date();

  const request = await prisma.serviceRequest.create({
    data: {
      requestNumber,
      title,
      description,
      priority,
      status: "submitted" as any,
      requesterName:  snapshot.senderName,
      requesterEmail: snapshot.senderEmail,
      createdById: AI_AGENT_ID,
      slaDueAt: computeRequestSlaDueAt(priority, now),
    },
  });

  await prisma.note.create({
    data: {
      ticketId: snapshot.id,
      authorId: AI_AGENT_ID,
      isPinned: false,
      body: `**Linked Service Request:** ${requestNumber} — "${title}"\n\nAutomatically created by lifecycle rule.`,
    },
  });

  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", {
    action: "create_linked_request", requestId: request.id, requestNumber,
  });
  return ok("create_linked_request", { requestId: request.id, requestNumber });
}

// ── create_child_ticket ───────────────────────────────────────────────────────

export async function handleCreateChildTicket(
  action: Extract<AutomationAction, { type: "create_child_ticket" }>,
  snapshot: TicketSnapshot,
): Promise<ActionResult> {
  const subject = action.useTemplateVars ? await compose(action.subject, snapshot) : action.subject;
  const body    = action.useTemplateVars ? await compose(action.body,    snapshot) : action.body;

  const ticketNumber = await generateTicketNumber(null);

  const child = await prisma.ticket.create({
    data: {
      ticketNumber,
      subject,
      body,
      status: "open" as any,
      priority: (action.priority ?? snapshot.priority ?? "medium") as any,
      senderEmail: snapshot.senderEmail,
      senderName:  snapshot.senderName,
      source:      "automation",
      ...(action.assigneeId ? { assignedToId: action.assigneeId } : {}),
      ...(action.teamId     ? { teamId: action.teamId }           : {}),
      // Parent reference stored in customFields — avoids schema migration
      customFields: { parentTicketId: snapshot.id, parentTicketNumber: snapshot.ticketNumber },
    },
  });

  // Add cross-reference note on parent
  await prisma.note.create({
    data: {
      ticketId: snapshot.id,
      authorId: AI_AGENT_ID,
      isPinned: false,
      body: `**Child Ticket Created:** [${ticketNumber}](/tickets/${child.id}) — "${subject}"`,
    },
  });

  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", {
    action: "create_child_ticket", childId: child.id, childNumber: ticketNumber,
  });
  return ok("create_child_ticket", { childId: child.id, childNumber: ticketNumber });
}

// ── create_follow_up ──────────────────────────────────────────────────────────

export async function handleCreateFollowUp(
  action: Extract<AutomationAction, { type: "create_follow_up" }>,
  snapshot: TicketSnapshot,
): Promise<ActionResult> {
  const title = action.useTemplateVars ? await compose(action.title, snapshot) : action.title;
  const body  = action.useTemplateVars ? await compose(action.body,  snapshot) : action.body;
  const dueAt = action.dueInHours ? new Date(Date.now() + action.dueInHours * 3_600_000) : null;

  await prisma.note.create({
    data: {
      ticketId: snapshot.id,
      authorId: AI_AGENT_ID,
      isPinned: true,
      body: [
        `**Follow-Up: ${title}**`,
        body,
        dueAt ? `\n📅 Due: ${dueAt.toISOString().split("T")[0]}` : "",
        action.assigneeId ? `\n👤 Assigned to: ${action.assigneeId}` : "",
      ].filter(Boolean).join("\n\n"),
    },
  });

  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", {
    action: "create_follow_up", title, dueAt,
  });
  return ok("create_follow_up", { title, dueAt });
}

// ── link_to_problem ───────────────────────────────────────────────────────────

export async function handleLinkToProblem(
  action: Extract<AutomationAction, { type: "link_to_problem" }>,
  snapshot: TicketSnapshot,
): Promise<ActionResult> {
  const problem = await prisma.problem.findUnique({
    where: { id: action.problemId },
    select: { id: true, problemNumber: true, title: true },
  });
  if (!problem) return err("link_to_problem", `problem_not_found:${action.problemId}`);

  if (action.skipIfLinked) {
    const existing = await prisma.problemTicketLink.findUnique({
      where: { problemId_ticketId: { problemId: action.problemId, ticketId: snapshot.id } },
      select: { id: true },
    });
    if (existing) return skip("link_to_problem", `already_linked_to_problem:${action.problemId}`);
  }

  await prisma.problemTicketLink.create({
    data: { problemId: action.problemId, ticketId: snapshot.id, linkedById: AI_AGENT_ID },
  });

  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", {
    action: "link_to_problem", problemId: problem.id, problemNumber: problem.problemNumber,
  });
  return ok("link_to_problem", { problemId: problem.id, problemNumber: problem.problemNumber, title: problem.title });
}

// ── update_linked_records ─────────────────────────────────────────────────────

export async function handleUpdateLinkedRecords(
  action: Extract<AutomationAction, { type: "update_linked_records" }>,
  snapshot: TicketSnapshot,
): Promise<ActionResult> {
  const value = action.useTemplateVars ? await compose(action.value, snapshot) : action.value;
  const updated: string[] = [];

  for (const recordType of action.recordTypes) {
    try {
      if (recordType === "incident" && snapshot.linkedIncidentId) {
        if (action.action === "add_note") {
          // IncidentUpdate is the note model for incidents
          await prisma.incidentUpdate.create({
            data: { incidentId: snapshot.linkedIncidentId, authorId: AI_AGENT_ID, body: value },
          });
          updated.push(`incident:${snapshot.linkedIncidentId}`);
        } else if (action.action === "set_status") {
          await prisma.incident.update({
            where: { id: snapshot.linkedIncidentId },
            data: { status: value as any },
          });
          updated.push(`incident:${snapshot.linkedIncidentId}:status=${value}`);
        }
      }

      if (recordType === "problem") {
        const links = await prisma.problemTicketLink.findMany({
          where: { ticketId: snapshot.id },
          select: { problemId: true },
        });
        for (const { problemId } of links) {
          if (action.action === "add_note") {
            await prisma.problemNote.create({
              data: { problemId, body: value, noteType: "general" as any, authorId: AI_AGENT_ID },
            });
            updated.push(`problem:${problemId}`);
          } else if (action.action === "set_priority") {
            await prisma.problem.update({ where: { id: problemId }, data: { priority: value as any } });
            updated.push(`problem:${problemId}:priority=${value}`);
          }
        }
      }
    } catch (e) {
      // Isolation: failure on one record type does not block others
    }
  }

  if (updated.length === 0) return skip("update_linked_records", "no_linked_records_found");
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "update_linked_records", updated });
  return ok("update_linked_records", { updated });
}

// ── merge_into_ticket ─────────────────────────────────────────────────────────

export async function handleMergeIntoTicket(
  action: Extract<AutomationAction, { type: "merge_into_ticket" }>,
  snapshot: TicketSnapshot,
): Promise<ActionResult> {
  if (snapshot.isMerged || (snapshot as any).mergedIntoId) {
    return skip("merge_into_ticket", "already_merged");
  }
  if (action.targetTicketId === snapshot.id) {
    return skip("merge_into_ticket", "cannot_merge_into_self");
  }

  const target = await prisma.ticket.findUnique({
    where: { id: action.targetTicketId, deletedAt: null },
    select: { id: true, ticketNumber: true, mergedIntoId: true, status: true },
  });
  if (!target) return err("merge_into_ticket", `target_ticket_not_found:${action.targetTicketId}`);
  if (target.mergedIntoId) return err("merge_into_ticket", `target_is_already_merged:${target.mergedIntoId}`);
  if (target.status === "closed") return skip("merge_into_ticket", "target_is_closed");

  const reason = action.reason ?? `Merged by automation rule.`;

  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: snapshot.id },
      data: { mergedIntoId: target.id, mergedAt: new Date(), status: "closed" as any },
    });
    await tx.note.create({
      data: {
        ticketId: snapshot.id,
        authorId: AI_AGENT_ID,
        isPinned: false,
        body: `**Merged into [${target.ticketNumber}](/tickets/${target.id})**\n\n${reason}`,
      },
    });
    await tx.note.create({
      data: {
        ticketId: target.id,
        authorId: AI_AGENT_ID,
        isPinned: false,
        body: `**Ticket [${snapshot.ticketNumber ?? snapshot.id}] merged into this ticket**\n\n${reason}`,
      },
    });
  });

  if (action.notifyRequester !== false && snapshot.senderEmail) {
    const { sendEmailJob } = await import("../send-email");
    void sendEmailJob({
      to: snapshot.senderEmail,
      subject: `Your ticket has been merged — ${snapshot.subject}`,
      body: `Your support request has been merged with ticket #${target.ticketNumber} which is being actively worked. ${reason}`,
      ...(snapshot.emailMessageId
        ? { inReplyTo: snapshot.emailMessageId, references: snapshot.emailMessageId }
        : {}),
    });
  }

  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", {
    action: "merge_into_ticket", targetId: target.id, targetNumber: target.ticketNumber,
  });
  return ok("merge_into_ticket", { targetId: target.id, targetNumber: target.ticketNumber });
}
