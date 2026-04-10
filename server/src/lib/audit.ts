/**
 * Audit logging helper.
 *
 * All writes are best-effort: failures are captured to Sentry and logged to
 * stderr but never throw — an audit failure must never break the main flow.
 *
 * Usage patterns:
 *   await logAudit(...)          // in route handlers — await so log is part of the response cycle
 *   void logAudit(...)           // in background jobs — fire-and-forget
 *
 * Meta conventions per action:
 *   ticket.created        { via: "agent" | "email" }
 *   ticket.status_changed { from: TicketStatus, to: TicketStatus }
 *   ticket.priority_changed { from: string|null, to: string|null }
 *   ticket.severity_changed { from: string|null, to: string|null }
 *   ticket.category_changed { from: string|null, to: string|null }
 *   ticket.assigned       { from: {id,name}|null, to: {id,name}|null }
 *   ticket.sla_breached   { type: "first_response"|"resolution" }
 *   ticket.escalated      { reason: EscalationReason }
 *   ticket.deescalated    {}
 *   reply.created         { replyId: number, senderType: "agent"|"customer" }
 *   note.created          { noteId: number }
 */

import type { AuditAction } from "core/constants/audit-event.ts";
import type { Prisma } from "../generated/prisma/client";
import prisma from "../db";
import Sentry from "./sentry";

export async function logAudit(
  ticketId: number,
  actorId: string | null,
  action: AuditAction,
  meta: Record<string, unknown> = {}
): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        ticketId,
        actorId,
        action,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { context: "audit", ticketId, action } });
    console.error(`[audit] Failed to log "${action}" for ticket ${ticketId}:`, err);
  }
}
