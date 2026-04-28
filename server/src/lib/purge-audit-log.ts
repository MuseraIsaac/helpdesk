/**
 * Audit log purge worker — runs nightly via pg-boss.
 *
 * Deletes audit_event rows whose createdAt is older than the configured
 * retentionDays setting. The purge only runs when audit logging is enabled;
 * disabling audit logging does not retroactively delete existing records —
 * an admin must explicitly reduce retentionDays and wait for the next run.
 */

import { PgBoss } from "pg-boss";
import prisma       from "../db";
import { getSection } from "./settings";

export async function registerPurgeAuditLogWorker(boss: PgBoss) {
  boss.work("purge-audit-log", async () => {
    const settings = await getSection("audit");

    // Only purge when audit logging is active
    if (!settings.enabled) return;

    const cutoff = new Date(Date.now() - settings.retentionDays * 86_400_000);

    const { count } = await prisma.auditEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    if (count > 0) {
      console.info(JSON.stringify({
        event:     "audit.purge_completed",
        cutoff:    cutoff.toISOString(),
        deleted:   count,
        retention: `${settings.retentionDays}d`,
      }));
    }
  });

  // Schedule nightly at 03:00 UTC (offset from trash purge at 02:00)
  await boss.schedule("purge-audit-log", "0 3 * * *", {}, { tz: "UTC" });
}
