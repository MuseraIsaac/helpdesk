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
import { registerPurgeAuditLogWorker } from "./purge-audit-log";
import { registerTimeSupervisorWorker } from "./check-time-supervisor";
import { registerInboundEmailWorker } from "./check-inbound-email";

// pg-boss runs its own pg pool (separate from Prisma's). Same connection
// hardening applies — TCP keepalive + idle recycling + a connection cap so
// the worker pool doesn't fight Prisma for the server's connection budget.
//
// `monitorStateIntervalMinutes` keeps a periodic query on each connection so
// idle workers stay warm; `maintenanceIntervalMinutes` is pg-boss's own
// archival job which also exercises the pool.
const boss = new PgBoss({
  connectionString: process.env.DATABASE_URL!,
  max:                          5,        // cap pg-boss connections
  application_name:             "pg-boss",
  monitorIntervalSeconds:       60,        // periodic activity keeps sockets warm
  // Mirror Prisma adapter: the remote DB has ~140 ms RTT and occasional
  // slow handshakes, so a 30 s connect timeout prevents boot from aborting
  // when the SASL handshake takes a few seconds.
  connectionTimeoutMillis:      30_000,
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
    boss.createQueue("purge-audit-log"),
    boss.createQueue("check-time-supervisor"),
    boss.createQueue("check-inbound-email"),
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
  await registerPurgeAuditLogWorker(boss);
  await registerTimeSupervisorWorker(boss);
  await registerInboundEmailWorker(boss);

  console.log("Job queue started");
}

export async function stopQueue(): Promise<void> {
  await boss.stop({ graceful: true, timeout: 30000 });
}
