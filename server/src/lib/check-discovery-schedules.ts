/**
 * pg-boss worker: check-discovery-schedules
 *
 * Runs every 5 minutes. Finds enabled connectors whose nextSyncAt has passed
 * and enqueues a run-discovery-sync job for each.
 *
 * Schedule expression format: standard 5-part cron (minute hour dom month dow).
 * Uses a simple "last-fired + period" approach for now (not a full cron evaluator).
 * For full cron-expression scheduling, replace parseCronNextFire() with cronstrue/cron-parser.
 */

import type { PgBoss } from "pg-boss";
import prisma from "../db";
import Sentry from "./sentry";
import { enqueueSyncJob } from "./run-discovery-sync";

const QUEUE_NAME   = "check-discovery-schedules";
const CRON_EXPR    = "*/5 * * * *";

export async function registerCheckDiscoverySchedulesWorker(boss: PgBoss): Promise<void> {
  await boss.schedule(QUEUE_NAME, CRON_EXPR);

  await boss.work(QUEUE_NAME, async () => {
    const now = new Date();
    try {
      const dueConnectors = await prisma.discoveryConnector.findMany({
        where: {
          isEnabled:  true,
          source:     { not: "csv" }, // CSV is always manual
          nextSyncAt: { lte: now },
        },
        select: { id: true, source: true, scheduleExpression: true },
      });

      for (const connector of dueConnectors) {
        try {
          const run = await prisma.discoverySyncRun.create({
            data: {
              connectorId:  connector.id,
              source:       connector.source,
              triggerType:  "schedule",
              status:       "pending",
            },
            select: { id: true },
          });

          const jobId = await enqueueSyncJob(boss, run.id);

          await prisma.discoverySyncRun.update({
            where: { id: run.id },
            data:  { jobId: jobId ?? undefined },
          });

          // Compute next fire time (simple interval fallback — 24h if cron is unset)
          const nextMs = parseIntervalMs(connector.scheduleExpression) ?? 24 * 60 * 60 * 1000;
          await prisma.discoveryConnector.update({
            where: { id: connector.id },
            data:  { nextSyncAt: new Date(now.getTime() + nextMs) },
          });
        } catch (err) {
          Sentry.captureException(err, { tags: { context: "discovery_scheduler", connectorId: connector.id } });
        }
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { context: "discovery_scheduler" } });
      throw err;
    }
  });
}

/**
 * Very basic cron → millisecond interval heuristic.
 * Supports `*\/N * * * *` (every N minutes) and `0 H * * *` (daily at H).
 * For production-grade cron evaluation, use the cron-parser package.
 */
function parseIntervalMs(expr: string | null): number | null {
  if (!expr) return null;

  // Match "*/N * * * *" → every N minutes
  const everyN = expr.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (everyN) return parseInt(everyN[1]!, 10) * 60_000;

  // Match "0 H * * *" → daily (24h)
  if (/^0\s+\d+\s+\*\s+\*\s+\*$/.test(expr)) return 24 * 60 * 60_000;

  // Match "0 H * * W" → weekly (7d)
  if (/^0\s+\d+\s+\*\s+\*\s+\d+$/.test(expr)) return 7 * 24 * 60 * 60_000;

  return null;
}
