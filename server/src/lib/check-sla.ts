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

const QUEUE_NAME = "check-sla";
const CRON_SCHEDULE = "*/5 * * * *";

export async function registerSlaCheckerWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue(QUEUE_NAME);

  await boss.work(QUEUE_NAME, async () => {
    const now = new Date();
    try {
      // Step 1: stamp slaBreached on newly overdue tickets
      const { count } = await prisma.ticket.updateMany({
        where: {
          slaBreached: false,
          status: { notIn: ["resolved", "closed"] },
          OR: [
            { firstResponseDueAt: { lt: now }, firstRespondedAt: null },
            { resolutionDueAt: { lt: now }, resolvedAt: null },
          ],
        },
        data: { slaBreached: true },
      });

      if (count > 0) {
        console.log(`[check-sla] Marked ${count} ticket(s) as SLA breached`);
      }

      // Step 2: escalate all tickets that meet escalation criteria
      // (includes newly breached, urgent, and sev1 tickets not yet escalated)
      const escalatedCount = await escalateBreachedTickets();
      if (escalatedCount > 0) {
        console.log(`[check-sla] Checked ${escalatedCount} ticket(s) for escalation`);
      }
    } catch (error) {
      Sentry.captureException(error, { tags: { queue: QUEUE_NAME } });
      throw error;
    }
  });

  await boss.schedule(QUEUE_NAME, CRON_SCHEDULE);
}
