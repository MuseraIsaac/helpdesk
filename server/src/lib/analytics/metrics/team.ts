/**
 * Team-domain metric definitions.
 *
 * Teams are stored as Queue rows in the DB (the table was renamed but the
 * Prisma model kept the old name). SQL references the "queue" table directly.
 */
import type { MetricDefinition } from "../types";
import { fillDateSeries } from "../date";

// ── team.tickets_resolved ─────────────────────────────────────────────────────

const teamTicketsResolved: MetricDefinition = {
  id: "team.tickets_resolved",
  label: "Tickets Resolved by Team",
  description: "Total tickets resolved per team in the period.",
  domain: "teams",
  unit: "count",
  supportedVisualizations: ["leaderboard", "bar_horizontal"],
  defaultVisualization: "leaderboard",

  computeFor: {
    async leaderboard(ctx) {
      const limit = ctx.limit ?? 10;
      interface Row { team_id: number; team_name: string; resolved: bigint; total: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT q.id AS team_id, q.name AS team_name,
                COUNT(*) FILTER (WHERE t.status IN ('resolved','closed')) AS resolved,
                COUNT(*) AS total
         FROM ticket t JOIN queue q ON q.id = t."queueId"
         WHERE t."createdAt" >= $1 AND t."createdAt" <= $2
           AND t.status NOT IN ('new','processing')
         GROUP BY q.id, q.name
         ORDER BY resolved DESC LIMIT $3`,
        ctx.dateRange.since, ctx.dateRange.until, limit,
      );
      return {
        type: "leaderboard",
        entries: rows.map((r, i) => ({
          rank: i + 1,
          key: String(r.team_id),
          label: r.team_name,
          primaryValue: Number(r.resolved),
          columns: { resolved: Number(r.resolved), total: Number(r.total) },
        })),
        columnDefs: [
          { key: "resolved", label: "Resolved", unit: "count" },
          { key: "total",    label: "Total",    unit: "count" },
        ],
      };
    },
  },
};

// ── team.avg_resolution_time ──────────────────────────────────────────────────

const teamAvgResolutionTime: MetricDefinition = {
  id: "team.avg_resolution_time",
  label: "Avg Resolution Time by Team",
  description: "Average time (seconds) from ticket creation to resolution, per team.",
  domain: "teams",
  unit: "seconds",
  supportedVisualizations: ["leaderboard", "bar_horizontal"],
  defaultVisualization: "leaderboard",

  computeFor: {
    async leaderboard(ctx) {
      const limit = ctx.limit ?? 10;
      interface Row { team_id: number; team_name: string; avg_seconds: number | null; resolved: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT q.id AS team_id, q.name AS team_name,
                ROUND(AVG(EXTRACT(EPOCH FROM (t."resolvedAt" - t."createdAt")))
                  FILTER (WHERE t."resolvedAt" IS NOT NULL))::int AS avg_seconds,
                COUNT(*) FILTER (WHERE t."resolvedAt" IS NOT NULL) AS resolved
         FROM ticket t JOIN queue q ON q.id = t."queueId"
         WHERE t."createdAt" >= $1 AND t."createdAt" <= $2
           AND t.status NOT IN ('new','processing')
         GROUP BY q.id, q.name
         HAVING COUNT(*) FILTER (WHERE t."resolvedAt" IS NOT NULL) > 0
         ORDER BY avg_seconds ASC NULLS LAST LIMIT $3`,
        ctx.dateRange.since, ctx.dateRange.until, limit,
      );
      return {
        type: "leaderboard",
        entries: rows.map((r, i) => ({
          rank: i + 1,
          key: String(r.team_id),
          label: r.team_name,
          primaryValue: r.avg_seconds ?? 0,
          columns: { avgSeconds: r.avg_seconds, resolved: Number(r.resolved) },
        })),
        columnDefs: [
          { key: "avgSeconds", label: "Avg Resolution", unit: "seconds" },
          { key: "resolved",   label: "Resolved",       unit: "count" },
        ],
      };
    },
  },
};

// ── team.sla_compliance ───────────────────────────────────────────────────────

const teamSlaCompliance: MetricDefinition = {
  id: "team.sla_compliance",
  label: "SLA Compliance by Team",
  description: "SLA compliance rate (%) for each team in the period.",
  domain: "teams",
  unit: "percent",
  supportedVisualizations: ["leaderboard", "bar_horizontal"],
  defaultVisualization: "leaderboard",

  computeFor: {
    async leaderboard(ctx) {
      const limit = ctx.limit ?? 10;
      interface Row { team_id: number; team_name: string; total_with_sla: bigint; breached: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT q.id AS team_id, q.name AS team_name,
                COUNT(*) FILTER (WHERE t."resolutionDueAt" IS NOT NULL) AS total_with_sla,
                COUNT(*) FILTER (WHERE t."slaBreached" = true)          AS breached
         FROM ticket t JOIN queue q ON q.id = t."queueId"
         WHERE t."createdAt" >= $1 AND t."createdAt" <= $2
           AND t.status NOT IN ('new','processing')
         GROUP BY q.id, q.name
         HAVING COUNT(*) FILTER (WHERE t."resolutionDueAt" IS NOT NULL) > 0
         ORDER BY total_with_sla DESC LIMIT $3`,
        ctx.dateRange.since, ctx.dateRange.until, limit,
      );
      return {
        type: "leaderboard",
        entries: rows.map((r, i) => {
          const total = Number(r.total_with_sla);
          const breached = Number(r.breached);
          const pct = total > 0 ? Math.round(((total - breached) / total) * 100) : null;
          return {
            rank: i + 1,
            key: String(r.team_id),
            label: r.team_name,
            primaryValue: pct ?? 0,
            columns: { compliance: pct, withSla: total, breached },
          };
        }),
        columnDefs: [
          { key: "compliance", label: "Compliance", unit: "percent" },
          { key: "withSla",    label: "With SLA",   unit: "count" },
          { key: "breached",   label: "Breached",   unit: "count" },
        ],
      };
    },
  },
};

// ── team.queue_depth ──────────────────────────────────────────────────────────

const teamQueueDepth: MetricDefinition = {
  id: "team.queue_depth",
  label: "Queue Depth by Team",
  description: "Currently open tickets per team (live snapshot, ignores date range).",
  domain: "teams",
  unit: "count",
  supportedVisualizations: ["leaderboard", "bar_horizontal"],
  defaultVisualization: "leaderboard",

  computeFor: {
    async leaderboard(ctx) {
      const limit = ctx.limit ?? 10;
      interface Row { team_id: number; team_name: string; open: bigint; in_progress: bigint; unassigned: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT q.id AS team_id, q.name AS team_name,
                COUNT(*) FILTER (WHERE t.status = 'open')                            AS open,
                COUNT(*) FILTER (WHERE t.status = 'in_progress')                     AS in_progress,
                COUNT(*) FILTER (WHERE t."assignedToId" IS NULL AND t.status = 'open') AS unassigned
         FROM queue q JOIN ticket t ON t."queueId" = q.id
         WHERE t.status IN ('open','in_progress')
         GROUP BY q.id, q.name
         ORDER BY (open + in_progress) DESC LIMIT $1`,
        limit,
      );
      return {
        type: "leaderboard",
        entries: rows.map((r, i) => ({
          rank: i + 1,
          key: String(r.team_id),
          label: r.team_name,
          primaryValue: Number(r.open) + Number(r.in_progress),
          columns: { open: Number(r.open), inProgress: Number(r.in_progress), unassigned: Number(r.unassigned) },
        })),
        columnDefs: [
          { key: "open",       label: "Open",        unit: "count" },
          { key: "inProgress", label: "In Progress",  unit: "count" },
          { key: "unassigned", label: "Unassigned",  unit: "count" },
        ],
      };
    },
  },
};

// ── team.csat_score ───────────────────────────────────────────────────────────

const teamCsatScore: MetricDefinition = {
  id: "team.csat_score",
  label: "CSAT Score by Team",
  description: "Average customer satisfaction score (1–5) per team in the period.",
  domain: "teams",
  unit: "score",
  supportedVisualizations: ["leaderboard", "bar_horizontal"],
  defaultVisualization: "leaderboard",

  computeFor: {
    async leaderboard(ctx) {
      const limit = ctx.limit ?? 10;
      interface Row { team_id: number; team_name: string; avg_rating: number | null; ratings: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT q.id AS team_id, q.name AS team_name,
                ROUND(AVG(cr.rating)::numeric, 2) AS avg_rating,
                COUNT(cr.id) AS ratings
         FROM ticket t
           JOIN queue q       ON q.id          = t."queueId"
           JOIN csat_rating cr ON cr."ticketId" = t.id
         WHERE cr."submittedAt" >= $1 AND cr."submittedAt" <= $2
         GROUP BY q.id, q.name
         HAVING COUNT(cr.id) > 0
         ORDER BY avg_rating DESC NULLS LAST LIMIT $3`,
        ctx.dateRange.since, ctx.dateRange.until, limit,
      );
      return {
        type: "leaderboard",
        entries: rows.map((r, i) => ({
          rank: i + 1,
          key: String(r.team_id),
          label: r.team_name,
          primaryValue: r.avg_rating ?? 0,
          columns: { avgRating: r.avg_rating, ratings: Number(r.ratings) },
        })),
        columnDefs: [
          { key: "avgRating", label: "Avg CSAT", unit: "score" },
          { key: "ratings",   label: "Ratings",  unit: "count" },
        ],
      };
    },
  },
};

// ── team.first_response_time ──────────────────────────────────────────────────

const teamFirstResponseTime: MetricDefinition = {
  id: "team.first_response_time",
  label: "Avg First Response Time by Team",
  description: "Average seconds from ticket creation to first reply, per team.",
  domain: "teams",
  unit: "seconds",
  supportedVisualizations: ["leaderboard", "bar_horizontal"],
  defaultVisualization: "leaderboard",

  computeFor: {
    async leaderboard(ctx) {
      const limit = ctx.limit ?? 10;
      interface Row { team_id: number; team_name: string; avg_seconds: number | null; count: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT q.id AS team_id, q.name AS team_name,
                ROUND(AVG(EXTRACT(EPOCH FROM (t."firstRespondedAt" - t."createdAt")))
                  FILTER (WHERE t."firstRespondedAt" IS NOT NULL))::int AS avg_seconds,
                COUNT(*) FILTER (WHERE t."firstRespondedAt" IS NOT NULL) AS count
         FROM ticket t JOIN queue q ON q.id = t."queueId"
         WHERE t."createdAt" >= $1 AND t."createdAt" <= $2
           AND t.status NOT IN ('new','processing')
         GROUP BY q.id, q.name
         HAVING COUNT(*) FILTER (WHERE t."firstRespondedAt" IS NOT NULL) > 0
         ORDER BY avg_seconds ASC NULLS LAST LIMIT $3`,
        ctx.dateRange.since, ctx.dateRange.until, limit,
      );
      return {
        type: "leaderboard",
        entries: rows.map((r, i) => ({
          rank: i + 1,
          key: String(r.team_id),
          label: r.team_name,
          primaryValue: r.avg_seconds ?? 0,
          columns: { avgSeconds: r.avg_seconds, tickets: Number(r.count) },
        })),
        columnDefs: [
          { key: "avgSeconds", label: "Avg Response", unit: "seconds" },
          { key: "tickets",    label: "Tickets",      unit: "count" },
        ],
      };
    },
  },
};

// ── team.volume_trend ─────────────────────────────────────────────────────────

const teamVolumeTrend: MetricDefinition = {
  id: "team.volume_trend",
  label: "Ticket Volume by Team (Trend)",
  description: "Daily ticket count per team, suitable for stacked bar visualisation.",
  domain: "teams",
  unit: "count",
  supportedVisualizations: ["bar", "stacked_bar", "line"],
  defaultVisualization: "bar",
  supportedGroupBys: ["team"],

  computeFor: {
    async time_series(ctx) {
      interface Row { day: string; count: bigint }
      const rows = await ctx.db.$queryRaw<Row[]>`
        SELECT TO_CHAR(t."createdAt",'YYYY-MM-DD') AS day, COUNT(*) AS count
        FROM ticket t JOIN queue q ON q.id = t."queueId"
        WHERE t."createdAt" >= ${ctx.dateRange.since} AND t."createdAt" <= ${ctx.dateRange.until}
          AND t.status NOT IN ('new','processing')
        GROUP BY day ORDER BY day
      `;
      const lookup = new Map(rows.map(r => [r.day, Number(r.count)]));
      const points = fillDateSeries(ctx.dateRange.since, ctx.dateRange.until)
        .map(date => ({ date, tickets: lookup.get(date) ?? 0 }));
      return { type: "time_series", series: [{ key: "tickets", label: "Tickets" }], points };
    },
  },
};

// ── Export ────────────────────────────────────────────────────────────────────

export const TEAM_METRICS: MetricDefinition[] = [
  teamTicketsResolved,
  teamAvgResolutionTime,
  teamSlaCompliance,
  teamQueueDepth,
  teamCsatScore,
  teamFirstResponseTime,
  teamVolumeTrend,
];
