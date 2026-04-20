/**
 * ticket-sync.ts — bidirectional sync between Tickets and linked ITIL records.
 *
 * When a Ticket is typed as "incident" it automatically creates a linked Incident
 * record and keeps the two records in sync for shared fields. Likewise for
 * "service_request" ↔ ServiceRequest.
 *
 * ── Sync rules ────────────────────────────────────────────────────────────────
 *
 *   Ticket → Incident (one-way on ticket create/update):
 *     subject       → title
 *     body          → description
 *     affectedSystem → affectedSystem
 *     assignedToId  → assignedToId
 *     teamId        → teamId
 *     severity/priority → priority  (mapped via SEVERITY_TO_INCIDENT_PRIORITY)
 *     status        → status        (mapped via TICKET_STATUS_TO_INCIDENT_STATUS)
 *
 *   Incident → Ticket (back-sync on incident update):
 *     status        → status        (mapped via INCIDENT_STATUS_TO_TICKET_STATUS)
 *     assignedToId  → assignedToId
 *     teamId        → teamId
 *
 *   Ticket → ServiceRequest (one-way on ticket create/update):
 *     subject       → title
 *     body          → description
 *     priority      → priority
 *     assignedToId  → assignedToId
 *     teamId        → teamId
 *     senderName    → requesterName
 *     senderEmail   → requesterEmail
 *     customerId    → requesterCustomerId
 *     status        → status        (mapped via TICKET_STATUS_TO_REQUEST_STATUS)
 *
 *   ServiceRequest → Ticket (back-sync on SR update):
 *     status        → status        (mapped via REQUEST_STATUS_TO_TICKET_STATUS)
 *     assignedToId  → assignedToId
 *     teamId        → teamId
 *
 * ── Back-sync guard ───────────────────────────────────────────────────────────
 *   Both directions check whether the derived status is already current before
 *   writing to avoid infinite update loops. All sync calls are fire-and-forget
 *   (void) — they must not throw into the caller's response path.
 */

import prisma from "../db";
import { computeSlaDeadlines } from "./sla";
import { computeIncidentSlaDeadlines } from "./incident-sla";
import { generateTicketNumber } from "./ticket-number";
import { logAudit } from "./audit";
import { logIncidentEvent } from "./incident-events";
import { logRequestEvent } from "./request-events";
import { applyEscalationRules } from "./apply-escalation-rules";
import type { IncidentPriority } from "core/constants/incident-priority.ts";
import type { TicketStatus } from "core/constants/ticket-status.ts";
import type { TicketSeverity } from "core/constants/ticket-severity.ts";
import type { TicketPriority } from "core/constants/ticket-priority.ts";

// ── Priority mappings ─────────────────────────────────────────────────────────

const SEVERITY_TO_INCIDENT_PRIORITY: Record<TicketSeverity, IncidentPriority> = {
  sev1: "p1",
  sev2: "p2",
  sev3: "p3",
  sev4: "p4",
};

const PRIORITY_TO_INCIDENT_PRIORITY: Record<TicketPriority, IncidentPriority> = {
  urgent: "p1",
  high:   "p2",
  medium: "p3",
  low:    "p4",
};

function deriveIncidentPriority(
  severity: TicketSeverity | null | undefined,
  priority: TicketPriority | null | undefined
): IncidentPriority {
  if (severity) return SEVERITY_TO_INCIDENT_PRIORITY[severity];
  if (priority) return PRIORITY_TO_INCIDENT_PRIORITY[priority];
  return "p3"; // default: medium
}

// ── Status mappings ───────────────────────────────────────────────────────────

function ticketStatusToIncidentStatus(status: TicketStatus): string {
  switch (status) {
    case "new":        return "new";
    case "processing": return "new";
    case "open":       return "in_progress";
    case "resolved":   return "resolved";
    case "closed":     return "closed";
  }
}

function incidentStatusToTicketStatus(status: string): TicketStatus | null {
  switch (status) {
    case "resolved": return "resolved";
    case "closed":   return "closed";
    default:         return null; // new/acknowledged/in_progress → no change to ticket
  }
}

function ticketStatusToRequestStatus(status: TicketStatus): string {
  switch (status) {
    case "new":        return "submitted";
    case "processing": return "submitted";
    case "open":       return "in_fulfillment";
    case "resolved":   return "fulfilled";
    case "closed":     return "closed";
  }
}

function requestStatusToTicketStatus(status: string): TicketStatus | null {
  switch (status) {
    case "fulfilled":  return "resolved";
    case "closed":     return "closed";
    case "cancelled":  return "closed";
    case "rejected":   return "closed";
    default:           return null; // submitted/pending_approval/approved/in_fulfillment → no change
  }
}

// ── Create linked Incident from a Ticket ──────────────────────────────────────

export async function createLinkedIncident(
  ticketId: number,
  actorId: string | null
): Promise<number | null> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        subject: true, body: true, affectedSystem: true,
        assignedToId: true, teamId: true,
        severity: true, priority: true, impact: true, urgency: true,
        category: true, source: true, isEscalated: true, slaBreached: true,
        status: true, linkedIncidentId: true, customFields: true,
      },
    });

    if (!ticket || ticket.linkedIncidentId) return ticket?.linkedIncidentId ?? null;

    const incidentPriority = deriveIncidentPriority(
      ticket.severity as TicketSeverity | null,
      ticket.priority as TicketPriority | null
    );
    const now = new Date();
    const sla = computeIncidentSlaDeadlines(incidentPriority, now);
    const incidentNumber = await generateTicketNumber("incident", now);

    const incident = await prisma.incident.create({
      data: {
        incidentNumber,
        title: ticket.subject,
        description: ticket.body,
        affectedSystem: ticket.affectedSystem,
        priority: incidentPriority,
        status: ticketStatusToIncidentStatus(ticket.status as TicketStatus) as any,
        assignedToId: ticket.assignedToId,
        teamId: ticket.teamId,
        responseDeadline: sla.responseDeadline,
        resolutionDeadline: sla.resolutionDeadline,
        createdById: actorId,
      },
    });

    // Link the ticket to this incident
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { linkedIncidentId: incident.id },
    });

    await logIncidentEvent(incident.id, actorId, "incident.created", {
      via: "ticket",
      ticketId,
    });

    // Evaluate escalation rules with full ticket context
    const cfEntries = Object.entries(ticket.customFields as Record<string, unknown>)
      .map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)]);
    void applyEscalationRules("incident", {
      priority:          incidentPriority,
      status:            "new",
      isMajor:           "false",
      slaBreached:       "false",
      affectedSystem:    ticket.affectedSystem ?? "",
      affectedUserCount: "",
      ticketPriority:    ticket.priority  ?? "",
      severity:          ticket.severity  ?? "",
      impact:            ticket.impact    ?? "",
      urgency:           ticket.urgency   ?? "",
      category:          ticket.category  ?? "",
      source:            ticket.source    ?? "",
      ticketIsEscalated: String(ticket.isEscalated),
      ticketSlaBreached: String(ticket.slaBreached),
      ...Object.fromEntries(cfEntries),
    }).then(async (escalation) => {
      if (!escalation) return;
      const update: { teamId?: number; assignedToId?: string } = {};
      if (escalation.teamId && !ticket.teamId) update.teamId = escalation.teamId;
      if (escalation.userId && !ticket.assignedToId) update.assignedToId = escalation.userId;
      if (Object.keys(update).length === 0) return;
      await prisma.incident.update({ where: { id: incident.id }, data: update });
      await logIncidentEvent(incident.id, null, "incident.escalation_rule_applied", {
        rule: escalation.ruleName, ...update,
      });
    });

    return incident.id;
  } catch (err) {
    console.error(`[ticket-sync] createLinkedIncident failed for ticket ${ticketId}:`, err);
    return null;
  }
}

// ── Create linked ServiceRequest from a Ticket ────────────────────────────────

export async function createLinkedServiceRequest(
  ticketId: number,
  actorId: string | null
): Promise<number | null> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        subject: true, body: true,
        senderName: true, senderEmail: true, customerId: true,
        assignedToId: true, teamId: true,
        priority: true, severity: true, impact: true, urgency: true,
        category: true, source: true, slaBreached: true,
        status: true, linkedServiceRequestId: true, customFields: true,
      },
    });

    if (!ticket || ticket.linkedServiceRequestId) return ticket?.linkedServiceRequestId ?? null;

    const requestNumber = await generateTicketNumber("service_request", new Date());
    const requestStatus = ticketStatusToRequestStatus(ticket.status as TicketStatus);

    const sr = await prisma.serviceRequest.create({
      data: {
        requestNumber,
        title: ticket.subject,
        description: ticket.body,
        priority: (ticket.priority ?? "medium") as any,
        status: requestStatus as any,
        requesterName: ticket.senderName,
        requesterEmail: ticket.senderEmail,
        requesterCustomerId: ticket.customerId,
        assignedToId: ticket.assignedToId,
        teamId: ticket.teamId,
        createdById: actorId,
      },
    });

    // Link the ticket to this service request
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { linkedServiceRequestId: sr.id },
    });

    // Evaluate escalation rules with full ticket context
    const cfEntries = Object.entries(ticket.customFields as Record<string, unknown>)
      .map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)]);
    void applyEscalationRules("request", {
      priority:        ticket.priority ?? "medium",
      status:          requestStatus,
      approvalStatus:  "not_required",
      slaBreached:     "false",
      catalogItemName: "",
      ticketPriority:  ticket.priority  ?? "",
      severity:        ticket.severity  ?? "",
      impact:          ticket.impact    ?? "",
      urgency:         ticket.urgency   ?? "",
      category:        ticket.category  ?? "",
      source:          ticket.source    ?? "",
      ticketSlaBreached: String(ticket.slaBreached),
      ticketIsEscalated: "false",
      ...Object.fromEntries(cfEntries),
    }).then(async (escalation) => {
      if (!escalation) return;
      const update: { teamId?: number; assignedToId?: string } = {};
      if (escalation.teamId && !ticket.teamId) update.teamId = escalation.teamId;
      if (escalation.userId && !ticket.assignedToId) update.assignedToId = escalation.userId;
      if (Object.keys(update).length === 0) return;
      await prisma.serviceRequest.update({ where: { id: sr.id }, data: update });
      await logRequestEvent(sr.id, null, "request.escalation_rule_applied", {
        rule: escalation.ruleName, ...update,
      });
    });

    return sr.id;
  } catch (err) {
    console.error(`[ticket-sync] createLinkedServiceRequest failed for ticket ${ticketId}:`, err);
    return null;
  }
}

// ── Sync Ticket changes → Incident ────────────────────────────────────────────

interface TicketChanges {
  status?: string;
  priority?: string | null;
  severity?: string | null;
  affectedSystem?: string | null;
  assignedToId?: string | null;
  teamId?: number | null;
}

export async function syncTicketToIncident(
  incidentId: number,
  changes: TicketChanges
): Promise<void> {
  try {
    const current = await prisma.incident.findUnique({
      where: { id: incidentId },
      select: { status: true, assignedToId: true, teamId: true, priority: true },
    });
    if (!current) return;

    const updateData: Record<string, unknown> = {};

    if (changes.affectedSystem !== undefined) {
      updateData.affectedSystem = changes.affectedSystem;
    }

    // Sync assignment
    if ("assignedToId" in changes) {
      updateData.assignedToId = changes.assignedToId ?? null;
    }
    if ("teamId" in changes) {
      updateData.teamId = changes.teamId ?? null;
    }

    // Sync priority if severity or priority changed
    if (changes.severity !== undefined || changes.priority !== undefined) {
      const newPriority = deriveIncidentPriority(
        changes.severity as TicketSeverity | null,
        changes.priority as TicketPriority | null
      );
      if (newPriority !== current.priority) {
        updateData.priority = newPriority;
        // Recalculate SLA deadlines on priority change
        const sla = computeIncidentSlaDeadlines(newPriority, new Date());
        updateData.responseDeadline = sla.responseDeadline;
        updateData.resolutionDeadline = sla.resolutionDeadline;
      }
    }

    // Sync status — but only forward (resolved/closed)
    if (changes.status) {
      const targetStatus = ticketStatusToIncidentStatus(changes.status as TicketStatus);
      if (targetStatus !== current.status) {
        // Only allow forward transitions, not backwards (e.g. don't reset resolved → in_progress)
        const forwardOrder = ["new", "acknowledged", "in_progress", "resolved", "closed"];
        const currentIdx = forwardOrder.indexOf(current.status);
        const targetIdx = forwardOrder.indexOf(targetStatus);
        if (targetIdx > currentIdx) {
          updateData.status = targetStatus;
          const now = new Date();
          if (targetStatus === "resolved") updateData.resolvedAt = now;
          if (targetStatus === "closed")   updateData.closedAt   = now;
        }
      }
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.incident.update({ where: { id: incidentId }, data: updateData });
    }
  } catch (err) {
    console.error(`[ticket-sync] syncTicketToIncident failed for incident ${incidentId}:`, err);
  }
}

// ── Sync Ticket changes → ServiceRequest ─────────────────────────────────────

export async function syncTicketToServiceRequest(
  serviceRequestId: number,
  changes: TicketChanges
): Promise<void> {
  try {
    const current = await prisma.serviceRequest.findUnique({
      where: { id: serviceRequestId },
      select: { status: true, assignedToId: true, teamId: true, priority: true },
    });
    if (!current) return;

    // Don't sync into terminal service requests
    const TERMINAL = ["closed", "cancelled", "rejected", "fulfilled"] as const;
    if (TERMINAL.includes(current.status as any) && !("status" in changes && changes.status === "closed")) {
      return;
    }

    const updateData: Record<string, unknown> = {};

    if ("assignedToId" in changes) {
      updateData.assignedToId = changes.assignedToId ?? null;
    }
    if ("teamId" in changes) {
      updateData.teamId = changes.teamId ?? null;
    }
    if (changes.priority !== undefined && changes.priority !== current.priority) {
      updateData.priority = changes.priority;
    }

    // Sync status — only forward
    if (changes.status) {
      const targetStatus = ticketStatusToRequestStatus(changes.status as TicketStatus);
      if (targetStatus !== current.status) {
        const forwardOrder = [
          "draft", "submitted", "pending_approval", "approved",
          "in_fulfillment", "fulfilled", "closed",
        ];
        const currentIdx = forwardOrder.indexOf(current.status);
        const targetIdx = forwardOrder.indexOf(targetStatus);
        if (targetIdx > currentIdx) {
          updateData.status = targetStatus;
          const now = new Date();
          if (targetStatus === "fulfilled") updateData.resolvedAt = now;
          if (targetStatus === "closed")    updateData.closedAt   = now;
        }
      }
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.serviceRequest.update({ where: { id: serviceRequestId }, data: updateData });
    }
  } catch (err) {
    console.error(
      `[ticket-sync] syncTicketToServiceRequest failed for SR ${serviceRequestId}:`, err
    );
  }
}

// ── Sync Incident changes → Ticket ────────────────────────────────────────────

export async function syncIncidentToTicket(
  incidentId: number,
  changes: { status?: string; assignedToId?: string | null; teamId?: number | null }
): Promise<void> {
  try {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      select: { sourceTicket: { select: { id: true, status: true } } },
    });
    const ticket = incident?.sourceTicket;
    if (!ticket) return;

    const updateData: Record<string, unknown> = {};

    if ("assignedToId" in changes) {
      updateData.assignedToId = changes.assignedToId ?? null;
    }
    if ("teamId" in changes) {
      updateData.teamId = changes.teamId ?? null;
    }

    if (changes.status) {
      const targetStatus = incidentStatusToTicketStatus(changes.status);
      if (targetStatus && targetStatus !== ticket.status) {
        updateData.status = targetStatus;
        if (targetStatus === "resolved" || targetStatus === "closed") {
          updateData.resolvedAt = new Date();
        }
      }
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.ticket.update({ where: { id: ticket.id }, data: updateData });
      if (changes.status) {
        await logAudit(ticket.id, null, "ticket.status_changed", {
          from: ticket.status,
          to: updateData.status ?? ticket.status,
          via: "incident_sync",
          incidentId,
        });
      }
    }
  } catch (err) {
    console.error(`[ticket-sync] syncIncidentToTicket failed for incident ${incidentId}:`, err);
  }
}

// ── Sync ServiceRequest changes → Ticket ──────────────────────────────────────

export async function syncServiceRequestToTicket(
  serviceRequestId: number,
  changes: { status?: string; assignedToId?: string | null; teamId?: number | null }
): Promise<void> {
  try {
    const sr = await prisma.serviceRequest.findUnique({
      where: { id: serviceRequestId },
      select: { sourceTicket: { select: { id: true, status: true } } },
    });
    const ticket = sr?.sourceTicket;
    if (!ticket) return;

    const updateData: Record<string, unknown> = {};

    if ("assignedToId" in changes) {
      updateData.assignedToId = changes.assignedToId ?? null;
    }
    if ("teamId" in changes) {
      updateData.teamId = changes.teamId ?? null;
    }

    if (changes.status) {
      const targetStatus = requestStatusToTicketStatus(changes.status);
      if (targetStatus && targetStatus !== ticket.status) {
        updateData.status = targetStatus;
        if (targetStatus === "resolved" || targetStatus === "closed") {
          updateData.resolvedAt = new Date();
        }
      }
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.ticket.update({ where: { id: ticket.id }, data: updateData });
      if (changes.status && updateData.status) {
        await logAudit(ticket.id, null, "ticket.status_changed", {
          from: ticket.status,
          to: updateData.status,
          via: "service_request_sync",
          serviceRequestId,
        });
      }
    }
  } catch (err) {
    console.error(
      `[ticket-sync] syncServiceRequestToTicket failed for SR ${serviceRequestId}:`, err
    );
  }
}
