/**
 * check-sla background job
 *
 * Runs every 5 minutes via pg-boss schedule.
 *  1. Marks slaBreached = true on tickets whose deadlines have passed.
 *  2. Triggers escalation for all breached and escalation-eligible tickets.
 */

import type { PgBoss } from "pg-boss";
import prisma from "../db";
import Sentry from "./sentry";
import { escalateBreachedTickets } from "./escalation";
import { logAudit } from "./audit";
import { notify } from "./notify";

const QUEUE_NAME = "check-sla";
const CRON_SCHEDULE = "*/5 * * * *";

export async function registerSlaCheckerWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue(QUEUE_NAME);

  await boss.work(QUEUE_NAME, async () => {
    const now = new Date();
    try {
      // Step 1: find tickets about to be marked breached, then stamp + audit each one.
      // Using find-then-update (instead of a bare updateMany) so we can emit one
      // audit event per ticket per breach type without a second query after the bulk update.
      const breachingTickets = await prisma.ticket.findMany({
        where: {
          slaBreached: false,
          status: { notIn: ["resolved", "closed"] },
          OR: [
            { firstResponseDueAt: { lt: now }, firstRespondedAt: null },
            { resolutionDueAt: { lt: now }, resolvedAt: null },
          ],
        },
        select: {
          id: true,
          firstResponseDueAt: true,
          firstRespondedAt: true,
          resolutionDueAt: true,
          resolvedAt: true,
        },
      });

      if (breachingTickets.length > 0) {
        await prisma.ticket.updateMany({
          where: { id: { in: breachingTickets.map((t) => t.id) } },
          data: { slaBreached: true },
        });

        // Fire audit events fire-and-forget; never block the job on logging
        for (const t of breachingTickets) {
          if (!t.firstRespondedAt && t.firstResponseDueAt && now > t.firstResponseDueAt) {
            void logAudit(t.id, null, "ticket.sla_breached", { type: "first_response" });
          }
          if (!t.resolvedAt && t.resolutionDueAt && now > t.resolutionDueAt) {
            void logAudit(t.id, null, "ticket.sla_breached", { type: "resolution" });
          }
        }

        console.log(`[check-sla] Marked ${breachingTickets.length} ticket(s) as SLA breached`);
      }

      // Step 2: escalate all tickets that meet escalation criteria
      // (includes newly breached, urgent, and sev1 tickets not yet escalated)
      const escalatedCount = await escalateBreachedTickets();
      if (escalatedCount > 0) {
        console.log(`[check-sla] Checked ${escalatedCount} ticket(s) for escalation`);
      }

      // Step 3: SLA warning notifications — notify assignees of tickets
      // approaching their deadlines (within 1 hour for first response, 2 hours for resolution)
      await sendSlaWarningNotifications(now);
    } catch (error) {
      Sentry.captureException(error, { tags: { queue: QUEUE_NAME } });
      throw error;
    }
  });

  await boss.schedule(QUEUE_NAME, CRON_SCHEDULE);
}

// ── SLA Warning Notifications ─────────────────────────────────────────────────

/** Window within which we send a "warning" notification before an SLA deadline. */
const FIRST_RESPONSE_WARNING_WINDOW_MS = 60 * 60 * 1000;  // 1 hour
const RESOLUTION_WARNING_WINDOW_MS     = 2 * 60 * 60 * 1000; // 2 hours

/**
 * We track which warnings have already been sent via a simple DB check:
 * if a "sla.first_response_warning" or "sla.resolution_warning" notification
 * already exists for the ticket (by entityId), skip it.
 */
async function sendSlaWarningNotifications(now: Date): Promise<void> {
  const firstResponseDeadline = new Date(now.getTime() + FIRST_RESPONSE_WARNING_WINDOW_MS);
  const resolutionDeadline    = new Date(now.getTime() + RESOLUTION_WARNING_WINDOW_MS);

  // Tickets approaching first response SLA
  const firstResponseWarning = await prisma.ticket.findMany({
    where: {
      slaBreached: false,
      status: { notIn: ["resolved", "closed", "new", "processing"] },
      firstRespondedAt: null,
      firstResponseDueAt: { gte: now, lte: firstResponseDeadline },
      assignedToId: { not: null },
    },
    select: { id: true, ticketNumber: true, subject: true, assignedToId: true, firstResponseDueAt: true },
  });

  // Tickets approaching resolution SLA
  const resolutionWarning = await prisma.ticket.findMany({
    where: {
      slaBreached: false,
      status: { notIn: ["resolved", "closed", "new", "processing"] },
      resolvedAt: null,
      resolutionDueAt: { gte: now, lte: resolutionDeadline },
      assignedToId: { not: null },
    },
    select: { id: true, ticketNumber: true, subject: true, assignedToId: true, resolutionDueAt: true },
  });

  for (const ticket of firstResponseWarning) {
    if (!ticket.assignedToId) continue;
    // Check if we already sent a warning for this ticket (avoid spam)
    const existing = await prisma.notification.count({
      where: { userId: ticket.assignedToId, event: "sla.first_response_warning", entityId: String(ticket.id) },
    });
    if (existing > 0) continue;

    void notify({
      event: "sla.first_response_warning",
      recipientIds: [ticket.assignedToId],
      title: "SLA warning: first response due soon",
      body: `#${ticket.ticketNumber} — ${ticket.subject}`,
      entityType: "ticket",
      entityId: String(ticket.id),
      entityUrl: `/tickets/${ticket.id}`,
    });
  }

  for (const ticket of resolutionWarning) {
    if (!ticket.assignedToId) continue;
    const existing = await prisma.notification.count({
      where: { userId: ticket.assignedToId, event: "sla.resolution_warning", entityId: String(ticket.id) },
    });
    if (existing > 0) continue;

    void notify({
      event: "sla.resolution_warning",
      recipientIds: [ticket.assignedToId],
      title: "SLA warning: resolution due soon",
      body: `#${ticket.ticketNumber} — ${ticket.subject}`,
      entityType: "ticket",
      entityId: String(ticket.id),
      entityUrl: `/tickets/${ticket.id}`,
    });
  }
}
