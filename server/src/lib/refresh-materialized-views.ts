/**
 * refresh-materialized-views — pg-boss worker that refreshes all analytics
 * materialized views every hour via a pg-boss schedule.
 */
import type { PgBoss } from "pg-boss";
import { MAT_VIEW_REFRESH_QUEUE, refreshAllViews } from "./materialized-views";

export async function registerRefreshMatViewsWorker(boss: PgBoss): Promise<void> {
  await boss.work(MAT_VIEW_REFRESH_QUEUE, async () => {
    await refreshAllViews();
  });
}
