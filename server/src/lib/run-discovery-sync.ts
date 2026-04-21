/**
 * pg-boss worker: run-discovery-sync
 *
 * Processes queued sync jobs for non-CSV connectors (Jamf, Intune, etc.).
 * CSV imports run synchronously in the HTTP handler and do not use this queue.
 *
 * Job payload: { syncRunId: number }
 */

import type { PgBoss } from "pg-boss";
import Sentry from "./sentry";
import { runDiscoverySync } from "./assets/sync-runner";

const QUEUE_NAME = "run-discovery-sync";

export async function registerDiscoverySyncWorker(boss: PgBoss): Promise<void> {
  await boss.work<{ syncRunId: number }>(QUEUE_NAME, async (jobs) => {
    const { syncRunId } = jobs[0]!.data;

    try {
      await runDiscoverySync(syncRunId);
    } catch (err) {
      Sentry.captureException(err, { tags: { context: "discovery_sync", syncRunId } });
      throw err; // re-throw so pg-boss marks job as failed and retries
    }
  });
}

/** Enqueue a sync job; returns the pg-boss job ID for traceability. */
export async function enqueueSyncJob(boss: PgBoss, syncRunId: number): Promise<string | null> {
  return boss.send(QUEUE_NAME, { syncRunId }, {
    retryLimit:  2,
    retryDelay:  30,
    retryBackoff: true,
  });
}
