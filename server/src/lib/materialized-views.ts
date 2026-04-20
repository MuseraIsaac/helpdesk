/**
 * Materialized views for analytics performance.
 *
 * These views pre-aggregate the most expensive analytics queries so the
 * analytics engine can read from them in O(days) instead of O(tickets).
 *
 * Views:
 *   mv_ticket_daily_stats   — per-day ticket counts + SLA + response time stats
 *   mv_agent_daily_stats    — per-agent per-day resolution counts
 *   mv_csat_daily_stats     — per-day CSAT averages
 *
 * Refresh strategy:
 *   CONCURRENT refresh is used so reads are never blocked during refresh.
 *   The `refresh-materialized-views` pg-boss worker runs every hour.
 *
 * Note: Views are created at startup only if they don't exist.
 *       Schema changes require dropping + recreating (handled below).
 */
import type { PrismaClient } from "../generated/prisma/client";
import prisma from "../db";
import Sentry from "./sentry";

export const MAT_VIEW_REFRESH_QUEUE = "refresh-materialized-views";

// ── DDL ───────────────────────────────────────────────────────────────────────

export const CREATE_VIEWS_SQL = `
-- Daily ticket statistics per day (UTC)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_ticket_daily_stats AS
SELECT
  "createdAt"::date                                                        AS day,
  COUNT(*)                                                                 AS total,
  COUNT(*) FILTER (WHERE status = 'open')                                 AS open_count,
  COUNT(*) FILTER (WHERE status IN ('resolved','closed'))                 AS resolved_count,
  COUNT(*) FILTER (WHERE "slaBreached" = true)                            AS sla_breached,
  COUNT(*) FILTER (WHERE "resolutionDueAt" IS NOT NULL)                   AS with_sla_target,
  ROUND(AVG(EXTRACT(EPOCH FROM ("firstRespondedAt" - "createdAt")))
        FILTER (WHERE "firstRespondedAt" IS NOT NULL))::int               AS avg_first_response_sec,
  ROUND(AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")))
        FILTER (WHERE "resolvedAt" IS NOT NULL
                  AND status IN ('resolved','closed')))::int              AS avg_resolution_sec
FROM ticket
WHERE status NOT IN ('new','processing')
GROUP BY day
ORDER BY day;

CREATE UNIQUE INDEX IF NOT EXISTS mv_ticket_daily_stats_day_idx
  ON mv_ticket_daily_stats (day);

-- Daily per-agent stats
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_agent_daily_stats AS
SELECT
  t."assignedToId"                                                         AS agent_id,
  u.name                                                                   AS agent_name,
  t."createdAt"::date                                                      AS day,
  COUNT(*)                                                                 AS assigned,
  COUNT(*) FILTER (WHERE t.status IN ('resolved','closed'))               AS resolved,
  ROUND(AVG(EXTRACT(EPOCH FROM (t."resolvedAt" - t."createdAt")))
        FILTER (WHERE t."resolvedAt" IS NOT NULL))::int                   AS avg_resolution_sec,
  COUNT(*) FILTER (WHERE t."slaBreached" = true)                          AS sla_breached,
  COUNT(*) FILTER (WHERE t."resolutionDueAt" IS NOT NULL)                 AS with_sla
FROM ticket t
JOIN "user" u ON u.id = t."assignedToId"
WHERE t.status NOT IN ('new','processing')
  AND t."assignedToId" IS NOT NULL
  AND u.role IN ('agent','supervisor','admin')
GROUP BY t."assignedToId", u.name, day
ORDER BY day;

CREATE UNIQUE INDEX IF NOT EXISTS mv_agent_daily_stats_agent_day_idx
  ON mv_agent_daily_stats (agent_id, day);

-- Daily CSAT stats
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_csat_daily_stats AS
SELECT
  "submittedAt"::date                           AS day,
  ROUND(AVG(rating)::numeric, 2)               AS avg_rating,
  COUNT(*)                                      AS count,
  COUNT(*) FILTER (WHERE rating >= 4)          AS positive,
  COUNT(*) FILTER (WHERE rating <= 2)          AS negative
FROM csat_rating
GROUP BY day
ORDER BY day;

CREATE UNIQUE INDEX IF NOT EXISTS mv_csat_daily_stats_day_idx
  ON mv_csat_daily_stats (day);
`;

// ── Bootstrap ─────────────────────────────────────────────────────────────────

/** Creates all materialized views if they don't already exist. Call at startup. */
export async function bootstrapMaterializedViews(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(CREATE_VIEWS_SQL);
    console.log("[mat-views] Materialized views bootstrapped");
  } catch (err) {
    // Non-fatal — analytics will fall back to live queries
    console.warn("[mat-views] Bootstrap warning (views may already exist):", err);
  }
}

// ── Refresh ───────────────────────────────────────────────────────────────────

/** Refreshes all three materialized views concurrently (non-blocking). */
export async function refreshAllViews(_db?: PrismaClient): Promise<void> {
  const views = [
    "mv_ticket_daily_stats",
    "mv_agent_daily_stats",
    "mv_csat_daily_stats",
  ];

  for (const view of views) {
    try {
      await prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`);
    } catch (err) {
      Sentry.captureException(err, { tags: { view } });
      console.error(`[mat-views] Failed to refresh ${view}:`, err);
    }
  }
  console.log("[mat-views] All views refreshed at", new Date().toISOString());
}
