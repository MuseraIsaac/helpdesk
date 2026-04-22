/**
 * Trash purge worker — runs nightly via pg-boss.
 *
 * Permanently hard-deletes all soft-deleted records whose deletedAt
 * is older than the configured retention period (trash.retentionDays).
 *
 * Runs sequentially per entity type to avoid locking large tables.
 */

import { PgBoss } from "pg-boss";
import prisma       from "../db";
import { getSection } from "./settings";

export async function registerPurgeTrashWorker(boss: PgBoss) {
  await boss.createQueue("purge-trash");

  boss.work("purge-trash", async () => {
    const settings = await getSection("trash");
    if (!settings.enabled || !settings.autoEmptyEnabled) return;

    const cutoff = new Date(Date.now() - settings.retentionDays * 86_400_000);
    const where  = { deletedAt: { not: null, lt: cutoff } };

    const [t, i, rq, p, c, a, kb] = await Promise.all([
      prisma.ticket.deleteMany({ where }),
      prisma.incident.deleteMany({ where }),
      prisma.serviceRequest.deleteMany({ where }),
      prisma.problem.deleteMany({ where }),
      prisma.change.deleteMany({ where }),
      prisma.asset.deleteMany({ where }),
      prisma.kbArticle.deleteMany({ where }),
    ]);

    const total = t.count + i.count + rq.count + p.count + c.count + a.count + kb.count;
    if (total > 0) {
      console.info(JSON.stringify({
        event:    "trash.purge_completed",
        cutoff:   cutoff.toISOString(),
        deleted:  { tickets: t.count, incidents: i.count, requests: rq.count, problems: p.count, changes: c.count, assets: a.count, kbArticles: kb.count },
        total,
      }));
    }
  });

  // Schedule nightly at 02:00 UTC
  await boss.schedule("purge-trash", "0 2 * * *", {}, { tz: "UTC" });
}
