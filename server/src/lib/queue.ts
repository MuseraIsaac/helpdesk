import { PgBoss } from "pg-boss";
import Sentry from "./sentry";
import { registerClassifyWorker } from "./classify-ticket";
import { registerAutoResolveWorker } from "./auto-resolve-ticket";
import { registerSendEmailWorker } from "./send-email";
import { registerSlaCheckerWorker } from "./check-sla";
import { registerAutomationCheckerWorker } from "./check-automation";
import { registerCheckReportSchedulesWorker } from "./check-report-schedules";
import { registerRefreshMatViewsWorker } from "./refresh-materialized-views";
import { registerDiscoverySyncWorker } from "./run-discovery-sync";
import { registerCheckDiscoverySchedulesWorker } from "./check-discovery-schedules";
import { registerPurgeTrashWorker } from "./purge-trash";

const boss = new PgBoss({
  connectionString: process.env.DATABASE_URL!,
});

boss.on("error", (error) => {
  Sentry.captureException(error);
  console.error(error);
});

export { boss };

export async function startQueue(): Promise<void> {
  await boss.start();

  // Create all queues before registering any workers.
  // On a fresh database pg-boss needs every queue row in its local cache
  // before the first worker poll fires — registering them in a single
  // batch avoids the "Queue cache is not initialized" race condition.
  await Promise.all([
    boss.createQueue("classify-ticket",      { retryLimit: 3, retryDelay: 30, retryBackoff: true }),
    boss.createQueue("auto-resolve-ticket",  { retryLimit: 3, retryDelay: 30, retryBackoff: true }),
    boss.createQueue("send-email",           { retryLimit: 3, retryDelay: 30, retryBackoff: true }),
    boss.createQueue("check-sla"),
    boss.createQueue("check-automation"),
    boss.createQueue("check-report-schedules"),
    boss.createQueue("refresh-materialized-views"),
    boss.createQueue("run-discovery-sync",        { retryLimit: 2, retryDelay: 30, retryBackoff: true }),
    boss.createQueue("check-discovery-schedules"),
    boss.createQueue("purge-trash"),
  ]);

  await registerClassifyWorker(boss);
  await registerAutoResolveWorker(boss);
  await registerSendEmailWorker(boss);
  await registerSlaCheckerWorker(boss);
  await registerAutomationCheckerWorker(boss);
  await registerCheckReportSchedulesWorker(boss);
  await registerRefreshMatViewsWorker(boss);
  await registerDiscoverySyncWorker(boss);
  await registerCheckDiscoverySchedulesWorker(boss);
  await registerPurgeTrashWorker(boss);

  console.log("Job queue started");
}

export async function stopQueue(): Promise<void> {
  await boss.stop({ graceful: true, timeout: 30000 });
}
