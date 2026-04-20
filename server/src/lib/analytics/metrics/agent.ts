/**
 * Agent-domain metric definitions.
 *
 * All metrics scope to the selected date range (ticket.createdAt) unless noted.
 * Metrics that use a leaderboard result type are gated to reports.advanced_view
 * at the route level — the metric itself has no permission awareness.
 */
import type { MetricDefinition, ComputeContext } from "../types";
import { buildFilterSQL } from "../filters";
import { fillDateSeries } from "../date";
import type { FieldMap } from "../types";

// ── Field map ─────────────────────────────────────────────────────────────────

export const AGENT_TICKET_FIELD_MAP: FieldMap = {
  priority:    "priority",
  category:    "category",
  status:      "status",
  teamId:      `"queueId"`,
  assignedToId: `"assignedToId"`,
  slaBreached: `"slaBreached"`,
};

function agentTicketWhere(ctx: ComputeContext): { clause: string; params: unknown[] } {
  const { clause, params } = buildFilterSQL(ctx.filters, AGENT_TICKET_FIELD_MAP, 3);
  return {
    clause: `WHERE t."createdAt" >= $1 AND t."createdAt" <= $2
             AND t.status NOT IN ('new','processing')
             AND t."assignedToId" IS NOT NULL${clause}`,
    params,
  };
}

// ── agent.tickets_resolved ────────────────────────────────────────────────────

const agentTicketsResolved: MetricDefinition = {
  id: "agent.tickets_resolved",
  label: "Tickets Resolved by Agent",
  description: "Number of tickets resolved per agent in the period, ranked highest to lowest.",
  domain: "agents",
  unit: "count",
  supportedVisualizations: ["leaderboard", "bar_horizontal"],
  defaultVisualization: "leaderboard",

  computeFor: {
    async leaderboard(ctx) {
      const limit = ctx.limit ?? 10;
      interface Row {
        agent_id: string; agent_name: string;
        resolved: bigint; open: bigint;
      }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT u.id AS agent_id, u.name AS agent_name,
                COUNT(*) FILTER (WHERE t.status IN ('resolved','closed')) AS resolved,
                COUNT(*) FILTER (WHERE t.status = 'open')                 AS open
         FROM ticket t JOIN "user" u ON u.id = t."assignedToId"
         WHERE t."createdAt" >= $1 AND t."createdAt" <= $2
           AND t.status NOT IN ('new','processing')
           AND u.role IN ('agent','supervisor','admin')
         GROUP BY u.id, u.name
         ORDER BY resolved DESC LIMIT $3`,
        ctx.dateRange.since, ctx.dateRange.until, limit,
      );
      return {
        type: "leaderboard",
        entries: rows.map((r, i) => ({
          rank: i + 1,
          key: r.agent_id,
          label: r.agent_name,
          primaryValue: Number(r.resolved),
          columns: { resolved: Number(r.resolved), open: Number(r.open) },
        })),
        columnDefs: [
          { key: "resolved", label: "Resolved", unit: "count" },
          { key: "open",     label: "Still Open", unit: "count" },
        ],
      };
    },
  },
};

// ── agent.avg_resolution_time ─────────────────────────────────────────────────

const agentAvgResolutionTime: MetricDefinition = {
  id: "agent.avg_resolution_time",
  label: "Avg Resolution Time by Agent",
  description: "Average time (seconds) from ticket creation to resolution, broken down per agent.",
  domain: "agents",
  unit: "seconds",
  supportedVisualizations: ["leaderboard", "bar_horizontal"],
  defaultVisualization: "leaderboard",

  computeFor: {
    async leaderboard(ctx) {
      const limit = ctx.limit ?? 10;
      interface Row { agent_id: string; agent_name: string; avg_seconds: number | null; resolved: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT u.id AS agent_id, u.name AS agent_name,
                ROUND(AVG(EXTRACT(EPOCH FROM (t."resolvedAt" - t."createdAt")))
                  FILTER (WHERE t."resolvedAt" IS NOT NULL))::int AS avg_seconds,
                COUNT(*) FILTER (WHERE t."resolvedAt" IS NOT NULL) AS resolved
         FROM ticket t JOIN "user" u ON u.id = t."assignedToId"
         WHERE t."createdAt" >= $1 AND t."createdAt" <= $2
           AND t.status NOT IN ('new','processing')
           AND u.role IN ('agent','supervisor','admin')
         GROUP BY u.id, u.name
         HAVING COUNT(*) FILTER (WHERE t."resolvedAt" IS NOT NULL) > 0
         ORDER BY avg_seconds ASC NULLS LAST LIMIT $3`,
        ctx.dateRange.since, ctx.dateRange.until, limit,
      );
      return {
        type: "leaderboard",
        entries: rows.map((r, i) => ({
          rank: i + 1,
          key: r.agent_id,
          label: r.agent_name,
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

// ── agent.csat_score ──────────────────────────────────────────────────────────

const agentCsatScore: MetricDefinition = {
  id: "agent.csat_score",
  label: "CSAT Score by Agent",
  description: "Average customer satisfaction rating (1–5) per agent for tickets resolved in the period.",
  domain: "agents",
  unit: "score",
  supportedVisualizations: ["leaderboard", "bar_horizontal"],
  defaultVisualization: "leaderboard",

  computeFor: {
    async leaderboard(ctx) {
      const limit = ctx.limit ?? 10;
      interface Row { agent_id: string; agent_name: string; avg_rating: number | null; count: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT u.id AS agent_id, u.name AS agent_name,
                ROUND(AVG(cr.rating)::numeric, 2) AS avg_rating,
                COUNT(cr.id) AS count
         FROM ticket t
           JOIN "user" u   ON u.id   = t."assignedToId"
           JOIN csat_rating cr ON cr."ticketId" = t.id
         WHERE cr."submittedAt" >= $1 AND cr."submittedAt" <= $2
           AND u.role IN ('agent','supervisor','admin')
         GROUP BY u.id, u.name
         HAVING COUNT(cr.id) > 0
         ORDER BY avg_rating DESC NULLS LAST LIMIT $3`,
        ctx.dateRange.since, ctx.dateRange.until, limit,
      );
      return {
        type: "leaderboard",
        entries: rows.map((r, i) => ({
          rank: i + 1,
          key: r.agent_id,
          label: r.agent_name,
          primaryValue: r.avg_rating ?? 0,
          columns: { avgRating: r.avg_rating, ratings: Number(r.count) },
        })),
        columnDefs: [
          { key: "avgRating", label: "Avg CSAT", unit: "score" },
          { key: "ratings",   label: "Ratings",  unit: "count" },
        ],
      };
    },
  },
};

// ── agent.first_response_time ─────────────────────────────────────────────────

const agentFirstResponseTime: MetricDefinition = {
  id: "agent.first_response_time",
  label: "Avg First Response Time by Agent",
  description: "Average seconds from ticket creation to first agent reply, per agent.",
  domain: "agents",
  unit: "seconds",
  supportedVisualizations: ["leaderboard", "bar_horizontal"],
  defaultVisualization: "leaderboard",

  computeFor: {
    async leaderboard(ctx) {
      const limit = ctx.limit ?? 10;
      interface Row { agent_id: string; agent_name: string; avg_seconds: number | null; count: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT u.id AS agent_id, u.name AS agent_name,
                ROUND(AVG(EXTRACT(EPOCH FROM (t."firstRespondedAt" - t."createdAt")))
                  FILTER (WHERE t."firstRespondedAt" IS NOT NULL))::int AS avg_seconds,
                COUNT(*) FILTER (WHERE t."firstRespondedAt" IS NOT NULL) AS count
         FROM ticket t JOIN "user" u ON u.id = t."assignedToId"
         WHERE t."createdAt" >= $1 AND t."createdAt" <= $2
           AND t.status NOT IN ('new','processing')
           AND u.role IN ('agent','supervisor','admin')
         GROUP BY u.id, u.name
         HAVING COUNT(*) FILTER (WHERE t."firstRespondedAt" IS NOT NULL) > 0
         ORDER BY avg_seconds ASC NULLS LAST LIMIT $3`,
        ctx.dateRange.since, ctx.dateRange.until, limit,
      );
      return {
        type: "leaderboard",
        entries: rows.map((r, i) => ({
          rank: i + 1,
          key: r.agent_id,
          label: r.agent_name,
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

// ── agent.sla_compliance ──────────────────────────────────────────────────────

const agentSlaCompliance: MetricDefinition = {
  id: "agent.sla_compliance",
  label: "SLA Compliance by Agent",
  description: "Percentage of tickets with an SLA target resolved on time, per agent.",
  domain: "agents",
  unit: "percent",
  supportedVisualizations: ["leaderboard", "bar_horizontal"],
  defaultVisualization: "leaderboard",

  computeFor: {
    async leaderboard(ctx) {
      const limit = ctx.limit ?? 10;
      interface Row {
        agent_id: string; agent_name: string;
        total_with_sla: bigint; breached: bigint;
      }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT u.id AS agent_id, u.name AS agent_name,
                COUNT(*) FILTER (WHERE t."resolutionDueAt" IS NOT NULL) AS total_with_sla,
                COUNT(*) FILTER (WHERE t."slaBreached" = true)          AS breached
         FROM ticket t JOIN "user" u ON u.id = t."assignedToId"
         WHERE t."createdAt" >= $1 AND t."createdAt" <= $2
           AND t.status NOT IN ('new','processing')
           AND u.role IN ('agent','supervisor','admin')
         GROUP BY u.id, u.name
         HAVING COUNT(*) FILTER (WHERE t."resolutionDueAt" IS NOT NULL) > 0
         ORDER BY (COUNT(*) FILTER (WHERE t."slaBreached" = false AND t."resolutionDueAt" IS NOT NULL))::float
                  / NULLIF(COUNT(*) FILTER (WHERE t."resolutionDueAt" IS NOT NULL), 0) DESC NULLS LAST
         LIMIT $3`,
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
            key: r.agent_id,
            label: r.agent_name,
            primaryValue: pct ?? 0,
            columns: { compliance: pct, totalWithSla: total, breached },
          };
        }),
        columnDefs: [
          { key: "compliance",   label: "Compliance", unit: "percent" },
          { key: "totalWithSla", label: "With SLA",   unit: "count" },
          { key: "breached",     label: "Breached",   unit: "count" },
        ],
      };
    },
  },
};

// ── agent.fcr_rate ────────────────────────────────────────────────────────────

const agentFcrRate: MetricDefinition = {
  id: "agent.fcr_rate",
  label: "First Contact Resolution by Agent",
  description: "% of resolved tickets per agent where the customer sent no follow-up reply.",
  domain: "agents",
  unit: "percent",
  supportedVisualizations: ["leaderboard", "bar_horizontal"],
  defaultVisualization: "leaderboard",

  computeFor: {
    async leaderboard(ctx) {
      const limit = ctx.limit ?? 10;
      interface Row { agent_id: string; agent_name: string; total: bigint; first_contact: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `WITH replies AS (
           SELECT "ticketId",
             COUNT(*) FILTER (WHERE "senderType" = 'customer') AS customer_replies
           FROM reply GROUP BY "ticketId"
         )
         SELECT u.id AS agent_id, u.name AS agent_name,
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE COALESCE(r.customer_replies,0) = 0) AS first_contact
         FROM ticket t
           JOIN "user" u ON u.id = t."assignedToId"
           LEFT JOIN replies r ON r."ticketId" = t.id
         WHERE t."createdAt" >= $1 AND t."createdAt" <= $2
           AND t.status IN ('resolved','closed')
           AND u.role IN ('agent','supervisor','admin')
         GROUP BY u.id, u.name
         ORDER BY (COUNT(*) FILTER (WHERE COALESCE(r.customer_replies,0) = 0))::float
                  / NULLIF(COUNT(*), 0) DESC NULLS LAST
         LIMIT $3`,
        ctx.dateRange.since, ctx.dateRange.until, limit,
      );
      return {
        type: "leaderboard",
        entries: rows.map((r, i) => {
          const total = Number(r.total);
          const fc = Number(r.first_contact);
          const pct = total > 0 ? Math.round((fc / total) * 100) : null;
          return {
            rank: i + 1,
            key: r.agent_id,
            label: r.agent_name,
            primaryValue: pct ?? 0,
            columns: { fcrPct: pct, firstContact: fc, resolved: total },
          };
        }),
        columnDefs: [
          { key: "fcrPct",      label: "FCR Rate",  unit: "percent" },
          { key: "firstContact", label: "FCR Count", unit: "count" },
          { key: "resolved",    label: "Resolved",   unit: "count" },
        ],
      };
    },
  },
};

// ── agent.workload ────────────────────────────────────────────────────────────

const agentWorkload: MetricDefinition = {
  id: "agent.workload",
  label: "Current Agent Workload",
  description: "Currently open tickets per agent (live snapshot, ignores date range).",
  domain: "agents",
  unit: "count",
  supportedVisualizations: ["leaderboard", "bar_horizontal"],
  defaultVisualization: "leaderboard",

  computeFor: {
    async leaderboard(ctx) {
      const limit = ctx.limit ?? 10;
      interface Row { agent_id: string; agent_name: string; open: bigint; in_progress: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT u.id AS agent_id, u.name AS agent_name,
                COUNT(*) FILTER (WHERE t.status = 'open')        AS open,
                COUNT(*) FILTER (WHERE t.status = 'in_progress') AS in_progress
         FROM "user" u
           JOIN ticket t ON t."assignedToId" = u.id
         WHERE u.role IN ('agent','supervisor','admin')
           AND u."deletedAt" IS NULL
           AND t.status IN ('open','in_progress')
         GROUP BY u.id, u.name
         ORDER BY (open + in_progress) DESC LIMIT $1`,
        limit,
      );
      return {
        type: "leaderboard",
        entries: rows.map((r, i) => ({
          rank: i + 1,
          key: r.agent_id,
          label: r.agent_name,
          primaryValue: Number(r.open) + Number(r.in_progress),
          columns: { open: Number(r.open), inProgress: Number(r.in_progress) },
        })),
        columnDefs: [
          { key: "open",       label: "Open",        unit: "count" },
          { key: "inProgress", label: "In Progress",  unit: "count" },
        ],
      };
    },
  },
};

// ── agent.volume_trend ────────────────────────────────────────────────────────

const agentVolumeTrend: MetricDefinition = {
  id: "agent.volume_trend",
  label: "Agent Ticket Volume Trend",
  description: "Daily resolved ticket count across all agents combined.",
  domain: "agents",
  unit: "count",
  supportedVisualizations: ["line", "area", "bar"],
  defaultVisualization: "line",

  computeFor: {
    async time_series(ctx) {
      interface Row { day: string; count: bigint }
      const rows = await ctx.db.$queryRaw<Row[]>`
        SELECT TO_CHAR("resolvedAt",'YYYY-MM-DD') AS day, COUNT(*) AS count
        FROM ticket
        WHERE "resolvedAt" >= ${ctx.dateRange.since} AND "resolvedAt" <= ${ctx.dateRange.until}
          AND status IN ('resolved','closed')
          AND "assignedToId" IS NOT NULL
        GROUP BY day ORDER BY day
      `;
      const lookup = new Map(rows.map(r => [r.day, Number(r.count)]));
      const points = fillDateSeries(ctx.dateRange.since, ctx.dateRange.until)
        .map(date => ({ date, resolved: lookup.get(date) ?? 0 }));
      return { type: "time_series", series: [{ key: "resolved", label: "Resolved" }], points };
    },
  },
};

// ── Export ────────────────────────────────────────────────────────────────────

export const AGENT_METRICS: MetricDefinition[] = [
  agentTicketsResolved,
  agentAvgResolutionTime,
  agentCsatScore,
  agentFirstResponseTime,
  agentSlaCompliance,
  agentFcrRate,
  agentWorkload,
  agentVolumeTrend,
];
