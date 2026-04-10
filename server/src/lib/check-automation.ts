/**
 * check-automation background job
 *
 * Runs every 5 minutes via pg-boss schedule.
 * Evaluates all automation rules with trigger "ticket.age" against every
 * active (non-terminal, non-system) ticket.
 *
 * This is intentionally kept simple — the rule engine skips no-ops, so
 * running against all active tickets is safe and predictable.
 */

import type { PgBoss } from "pg-boss";
import prisma from "../db";
import Sentry from "./sentry";
import { runRules } from "./automation";

const QUEUE_NAME = "check-automation";
const CRON_SCHEDULE = "*/5 * * * *";

export async function registerAutomationCheckerWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue(QUEUE_NAME);

  await boss.work(QUEUE_NAME, async () => {
    try {
      // Fetch all tickets that are in an agent-visible, active state.
      // Excludes "new" and "processing" — those are AI-managed.
      const tickets = await prisma.ticket.findMany({
        where: {
          status: { in: ["open"] },
        },
        select: {
          id: true,
          subject: true,
          body: true,
          status: true,
          category: true,
          priority: true,
          severity: true,
          senderEmail: true,
          assignedToId: true,
          createdAt: true,
        },
      });

      if (tickets.length === 0) return;

      let rulesFired = 0;
      for (const ticket of tickets) {
        const before = rulesFired;
        await runRules(ticket, { trigger: "ticket.age" });
        if (rulesFired > before) rulesFired++;
      }

      console.log(
        `[check-automation] Evaluated ${tickets.length} ticket(s) against ticket.age rules`
      );
    } catch (error) {
      Sentry.captureException(error, { tags: { queue: QUEUE_NAME } });
      throw error;
    }
  });

  await boss.schedule(QUEUE_NAME, CRON_SCHEDULE);
}
