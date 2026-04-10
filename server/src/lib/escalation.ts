/**
 * Escalation Service
 *
 * Central authority for all escalation logic. No route or worker should
 * write escalation fields directly — they call this module instead.
 *
 * Architecture notes:
 *  - Idempotent per (ticketId, reason): calling escalateTicket() twice with the
 *    same reason is safe — the second call is a no-op.
 *  - isEscalated is a live "currently escalated" flag; escalationEvents is the
 *    append-only audit trail.
 *  - escalatedAt and escalationReason capture the FIRST escalation only.
 *    Subsequent reasons are recorded in escalationEvents.
 *  - ACTIVE_CHANNELS is the extension point for Phase 2 notifications
 *    (email, Slack, PagerDuty). No channel is active yet.
 */

import type { EscalationReason } from "../generated/prisma/client";
import prisma from "../db";
import Sentry from "./sentry";

// ─── Notification channel interface ────────────────────────────────────────
// Phase 2: implement EmailChannel, SlackChannel, PagerDutyChannel, etc.

interface EscalationChannel {
  name: string;
  notify(ticketId: number, reason: EscalationReason): Promise<void>;
}

// Add channel instances here to activate notifications
const ACTIVE_CHANNELS: EscalationChannel[] = [];

// ─── Core escalation function ──────────────────────────────────────────────

/**
 * Escalate a ticket for a given reason.
 *
 * @returns true if a new escalation event was created; false if already
 *          escalated for this exact reason (idempotent guard).
 */
export async function escalateTicket(
  ticketId: number,
  reason: EscalationReason
): Promise<boolean> {
  // Idempotency check — one event per (ticket, reason)
  const existing = await prisma.escalationEvent.findFirst({
    where: { ticketId, reason },
  });
  if (existing) return false;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { isEscalated: true },
  });
  if (!ticket) return false;

  const isFirstEscalation = !ticket.isEscalated;
  const now = new Date();

  await prisma.$transaction([
    prisma.escalationEvent.create({ data: { ticketId, reason } }),
    prisma.ticket.update({
      where: { id: ticketId },
      data: {
        isEscalated: true,
        // Only stamp the first escalation — history goes in escalationEvents
        ...(isFirstEscalation && { escalatedAt: now, escalationReason: reason }),
      },
    }),
  ]);

  // Fire-and-forget notification channels (errors are logged, not thrown)
  for (const channel of ACTIVE_CHANNELS) {
    channel.notify(ticketId, reason).catch((err) => {
      Sentry.captureException(err, {
        tags: { queue: "escalation", channel: channel.name, ticketId },
      });
      console.error(
        `[escalation] Channel "${channel.name}" failed for ticket ${ticketId}:`,
        err
      );
    });
  }

  return true;
}

/**
 * Remove the escalation flag (manual de-escalation by an agent).
 * Does NOT delete escalation events — the history is preserved.
 */
export async function deescalateTicket(ticketId: number): Promise<void> {
  await prisma.ticket.update({
    where: { id: ticketId },
    data: { isEscalated: false },
  });
}

// ─── Auto-escalation checks ────────────────────────────────────────────────

type TicketEscalationSnapshot = {
  id: number;
  status: string;
  priority: string | null;
  severity: string | null;
  firstRespondedAt: Date | null;
  firstResponseDueAt: Date | null;
  resolvedAt: Date | null;
  resolutionDueAt: Date | null;
};

/**
 * Evaluate all auto-escalation conditions for a ticket and escalate for each
 * applicable reason. Safe to call repeatedly — idempotent per reason.
 *
 * Does NOT escalate terminal tickets (resolved / closed).
 */
export async function checkAndEscalate(
  ticket: TicketEscalationSnapshot
): Promise<void> {
  const isTerminal =
    ticket.status === "resolved" || ticket.status === "closed";
  if (isTerminal) return;

  const now = new Date();
  const tasks: Promise<boolean>[] = [];

  // First response SLA breach
  if (
    !ticket.firstRespondedAt &&
    ticket.firstResponseDueAt &&
    now > ticket.firstResponseDueAt
  ) {
    tasks.push(escalateTicket(ticket.id, "first_response_sla_breach"));
  }

  // Resolution SLA breach
  if (
    !ticket.resolvedAt &&
    ticket.resolutionDueAt &&
    now > ticket.resolutionDueAt
  ) {
    tasks.push(escalateTicket(ticket.id, "resolution_sla_breach"));
  }

  // Priority-based: urgent tickets are always escalated
  if (ticket.priority === "urgent") {
    tasks.push(escalateTicket(ticket.id, "urgent_priority"));
  }

  // Severity-based: sev1 tickets are always escalated
  if (ticket.severity === "sev1") {
    tasks.push(escalateTicket(ticket.id, "sev1_severity"));
  }

  await Promise.allSettled(tasks);
}

/**
 * Find all active tickets that have newly breached SLA deadlines and escalate
 * them. Called from the check-sla background job after marking slaBreached.
 */
export async function escalateBreachedTickets(): Promise<number> {
  const now = new Date();

  const tickets = await prisma.ticket.findMany({
    where: {
      status: { notIn: ["resolved", "closed"] },
      OR: [
        { firstResponseDueAt: { lt: now }, firstRespondedAt: null },
        { resolutionDueAt: { lt: now }, resolvedAt: null },
      ],
    },
    select: {
      id: true,
      status: true,
      priority: true,
      severity: true,
      firstRespondedAt: true,
      firstResponseDueAt: true,
      resolvedAt: true,
      resolutionDueAt: true,
    },
  });

  let escalated = 0;
  for (const ticket of tickets) {
    const before = escalated;
    await checkAndEscalate(ticket);
    // Count tickets that had at least one new escalation
    if (escalated > before) escalated++;
  }

  return tickets.length;
}
