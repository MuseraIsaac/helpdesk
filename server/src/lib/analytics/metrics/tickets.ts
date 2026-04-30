/**
 * Ticket-domain metric definitions.
 *
 * Each MetricDefinition implements computeFor.<resultType> functions that
 * receive a ComputeContext and return the matching QueryResult.
 */
import type { MetricDefinition, ComputeContext } from "../types";
import { buildFilterSQL, TICKET_FIELD_MAP } from "../filters";
import { fillDateSeries, toISODate } from "../date";
import { AI_AGENT_ID } from "core/constants/ai-agent.ts";

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Build a WHERE fragment for ticket queries.  $1 = since, $2 = until. */
function ticketDateWhere(ctx: ComputeContext): { clause: string; params: unknown[] } {
  const base = `WHERE "createdAt" >= $1 AND "createdAt" <= $2 AND status NOT IN ('new','processing')`;
  const { clause, params } = buildFilterSQL(ctx.filters, TICKET_FIELD_MAP, 3);
  return { clause: base + clause, params };
}

type RawCount = { count: bigint };

// ── tickets.volume ────────────────────────────────────────────────────────────

const ticketsVolume: MetricDefinition = {
  id:    "tickets.volume",
  label: "Ticket Volume",
  description: "Number of tickets created per day over the selected period.",
  domain: "tickets",
  unit:  "count",

  supportedVisualizations: ["line", "area", "bar", "number"],
  defaultVisualization:    "line",
  supportedGroupBys:       ["priority", "category", "status", "source", "team"],

  filterFields: [
    { key: "priority", label: "Priority", type: "enum",
      options: [
        { value: "urgent", label: "Urgent" }, { value: "high", label: "High" },
        { value: "medium", label: "Medium" }, { value: "low", label: "Low" },
      ] },
    { key: "category", label: "Category", type: "enum", options: [] },
    { key: "source",   label: "Channel",  type: "enum",
      options: [
        { value: "email", label: "Email" }, { value: "portal", label: "Portal" },
        { value: "agent", label: "Agent" },
      ] },
    { key: "teamId",       label: "Team",       type: "id" },
    { key: "assignedToId", label: "Assignee",   type: "id" },
  ],

  computeFor: {
    async stat(ctx) {
      const { clause, params } = ticketDateWhere(ctx);
      interface Row { count: bigint }
      const [row] = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT COUNT(*) AS count FROM ticket ${clause}`,
        ctx.dateRange.since, ctx.dateRange.until, ...params,
      );
      return {
        type:  "stat",
        value: Number(row?.count ?? 0),
        label: "Total tickets",
        unit:  "count",
      };
    },

    async time_series(ctx) {
      const { clause, params } = ticketDateWhere(ctx);
      interface Row { day: string; count: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT TO_CHAR("createdAt", 'YYYY-MM-DD') AS day, COUNT(*) AS count
         FROM ticket ${clause}
         GROUP BY day ORDER BY day`,
        ctx.dateRange.since, ctx.dateRange.until, ...params,
      );
      const lookup = new Map(rows.map(r => [r.day, Number(r.count)]));
      const points = fillDateSeries(ctx.dateRange.since, ctx.dateRange.until).map(date => ({
        date,
        tickets: lookup.get(date) ?? 0,
      }));
      return { type: "time_series", series: [{ key: "tickets", label: "Tickets" }], points };
    },

    async grouped_count(ctx) {
      const dim   = ctx.groupBy ?? "priority";
      const colMap: Record<string, string> = {
        priority: "priority", category: "category", status: "status",
        source: "source", team: `"queueId"`,
      };
      const col = colMap[dim] ?? "priority";
      const { clause, params } = ticketDateWhere(ctx);
      interface Row { key: string | null; count: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT COALESCE(${col}::text, 'unset') AS key, COUNT(*) AS count
         FROM ticket ${clause}
         GROUP BY ${col} ORDER BY count DESC`,
        ctx.dateRange.since, ctx.dateRange.until, ...params,
      );
      const items = rows.map(r => ({
        key:   r.key ?? "unset",
        label: r.key ?? "Unset",
        value: Number(r.count),
      }));
      return { type: "grouped_count", items, total: items.reduce((s, i) => s + i.value, 0) };
    },
  },
};

// ── tickets.backlog ───────────────────────────────────────────────────────────

const ticketsBacklog: MetricDefinition = {
  id:    "tickets.backlog",
  label: "Backlog Trend",
  description: "Tickets opened vs closed per day. When opened > closed the backlog grows.",
  domain: "tickets",
  supportedVisualizations: ["line", "area", "bar"],
  defaultVisualization:    "line",

  computeFor: {
    async time_series(ctx) {
      interface Row { date: string; opened: bigint; closed: bigint }
      const rows = await ctx.db.$queryRaw<Row[]>`
        WITH days AS (
          SELECT generate_series(
            ${ctx.dateRange.since}::timestamp,
            ${ctx.dateRange.until}::timestamp,
            '1 day'::interval
          )::date AS day
        ),
        events AS (
          SELECT "createdAt"::date AS day, 1 AS opened, 0 AS closed
          FROM ticket
          WHERE status NOT IN ('new','processing')
            AND "createdAt" >= ${ctx.dateRange.since} AND "createdAt" <= ${ctx.dateRange.until}
          UNION ALL
          SELECT "resolvedAt"::date AS day, 0 AS opened, 1 AS closed
          FROM ticket
          WHERE "resolvedAt" IS NOT NULL AND status IN ('resolved','closed')
            AND "resolvedAt" >= ${ctx.dateRange.since} AND "resolvedAt" <= ${ctx.dateRange.until}
        )
        SELECT TO_CHAR(d.day,'YYYY-MM-DD') AS date,
               COALESCE(SUM(e.opened),0)::bigint AS opened,
               COALESCE(SUM(e.closed),0)::bigint AS closed
        FROM days d LEFT JOIN events e ON e.day = d.day
        GROUP BY d.day ORDER BY d.day
      `;
      const points = rows.map(r => ({
        date:   r.date,
        opened: Number(r.opened),
        closed: Number(r.closed),
      }));
      return {
        type: "time_series",
        series: [{ key: "opened", label: "Opened" }, { key: "closed", label: "Closed" }],
        points,
      };
    },
  },
};

// ── tickets.sla_compliance ────────────────────────────────────────────────────

const ticketsSlaCompliance: MetricDefinition = {
  id:    "tickets.sla_compliance",
  label: "SLA Compliance",
  description: "Percentage of tickets with an SLA target that were resolved within SLA.",
  domain: "tickets",
  unit:  "percent",
  supportedVisualizations: ["number", "number_change", "gauge", "bar_horizontal"],
  defaultVisualization:    "number",
  supportedGroupBys:       ["priority", "category", "team"],

  computeFor: {
    async stat(ctx) {
      const { clause, params } = ticketDateWhere(ctx);

      interface Row {
        total_with_sla: bigint;
        breached: bigint;
      }
      // SLA Compliance uses the standard ITSM definition: only counts
      // resolved/closed tickets (those with a determined SLA outcome) and
      // computes breach from BOTH the persistent flag AND the actual
      // resolved-vs-deadline comparison (the latter catches late
      // resolutions that the 5-minute cron missed).
      const [row] = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT
           COUNT(*) FILTER (WHERE status IN ('resolved','closed')
                              AND "resolutionDueAt" IS NOT NULL)       AS total_with_sla,
           COUNT(*) FILTER (WHERE status IN ('resolved','closed')
                              AND "resolutionDueAt" IS NOT NULL
                              AND ("slaBreached" = true OR
                                   "resolvedAt" > "resolutionDueAt"))
                                                                       AS breached
         FROM ticket ${clause}`,
        ctx.dateRange.since, ctx.dateRange.until, ...params,
      );

      const total   = Number(row?.total_with_sla ?? 0);
      const breached = Number(row?.breached ?? 0);
      const rate     = total > 0 ? Math.round(((total - breached) / total) * 100) : null;

      if (ctx.comparison) {
        const { clause: pc, params: pp } = buildFilterSQL(ctx.filters, TICKET_FIELD_MAP, 3);
        const prevWhere = `WHERE "createdAt" >= $1 AND "createdAt" <= $2 AND status NOT IN ('new','processing')${pc}`;
        const [prevRow] = await ctx.db.$queryRawUnsafe<Row[]>(
          `SELECT COUNT(*) FILTER (WHERE status IN ('resolved','closed')
                                      AND "resolutionDueAt" IS NOT NULL) AS total_with_sla,
                  COUNT(*) FILTER (WHERE status IN ('resolved','closed')
                                      AND "resolutionDueAt" IS NOT NULL
                                      AND ("slaBreached" = true OR
                                           "resolvedAt" > "resolutionDueAt"))
                                                                          AS breached
           FROM ticket ${prevWhere}`,
          ctx.comparison.since, ctx.comparison.until, ...pp,
        );
        const pt = Number(prevRow?.total_with_sla ?? 0);
        const pb = Number(prevRow?.breached ?? 0);
        const prevRate = pt > 0 ? Math.round(((pt - pb) / pt) * 100) : null;
        const chg = rate != null && prevRate != null ? rate - prevRate : null;
        return {
          type: "stat_change",
          value: rate, previousValue: prevRate,
          changePercent: chg,
          changeDirection: chg == null ? null : chg > 0 ? "up" : chg < 0 ? "down" : "neutral",
          label: "SLA Compliance", unit: "percent",
          sub: `${breached} breached of ${total}`,
        };
      }

      return {
        type: "stat", value: rate, label: "SLA Compliance", unit: "percent",
        sub: `${breached} breached of ${total}`,
      };
    },

    async grouped_count(ctx) {
      const dim = ctx.groupBy ?? "priority";
      const colMap: Record<string, string> = {
        priority: "priority", category: "category",
        team: `COALESCE(q.name,'Unassigned')`,
      };
      const groupCol = colMap[dim] ?? "priority";
      const { clause, params } = ticketDateWhere(ctx);

      interface Row { key: string | null; total_with_sla: bigint; breached: bigint }

      let rows: Row[];
      if (dim === "team") {
        rows = await ctx.db.$queryRawUnsafe<Row[]>(
          `SELECT COALESCE(q.name,'Unassigned') AS key,
                  COUNT(*) FILTER (WHERE t.status IN ('resolved','closed')
                                      AND t."resolutionDueAt" IS NOT NULL) AS total_with_sla,
                  COUNT(*) FILTER (WHERE t.status IN ('resolved','closed')
                                      AND t."resolutionDueAt" IS NOT NULL
                                      AND (t."slaBreached" = true OR
                                           t."resolvedAt" > t."resolutionDueAt"))
                                                                            AS breached
           FROM ticket t LEFT JOIN queue q ON q.id = t."queueId"
           ${clause.replace('WHERE', 'WHERE t.')} GROUP BY q.name ORDER BY total_with_sla DESC`,
          ctx.dateRange.since, ctx.dateRange.until, ...params,
        );
      } else {
        rows = await ctx.db.$queryRawUnsafe<Row[]>(
          `SELECT COALESCE(${groupCol}::text,'unset') AS key,
                  COUNT(*) FILTER (WHERE status IN ('resolved','closed')
                                      AND "resolutionDueAt" IS NOT NULL) AS total_with_sla,
                  COUNT(*) FILTER (WHERE status IN ('resolved','closed')
                                      AND "resolutionDueAt" IS NOT NULL
                                      AND ("slaBreached" = true OR
                                           "resolvedAt" > "resolutionDueAt"))
                                                                          AS breached
           FROM ticket ${clause} GROUP BY ${groupCol} ORDER BY total_with_sla DESC`,
          ctx.dateRange.since, ctx.dateRange.until, ...params,
        );
      }

      const items = rows.map(r => {
        const t = Number(r.total_with_sla);
        const b = Number(r.breached);
        const pct = t > 0 ? Math.round(((t - b) / t) * 100) : null;
        return {
          key:   r.key ?? "unset",
          label: r.key ?? "Unset",
          value: pct ?? 0,
          totalWithSla: t,
          breached: b,
        };
      });
      return { type: "grouped_count", items, total: items.length };
    },
  },
};

// ── tickets.resolution_time ───────────────────────────────────────────────────

const ticketsResolutionTime: MetricDefinition = {
  id:    "tickets.resolution_time",
  label: "Avg Resolution Time",
  description: "Average time from ticket creation to resolution.",
  domain: "tickets",
  unit:  "seconds",
  supportedVisualizations: ["number", "histogram"],
  defaultVisualization:    "number",

  computeFor: {
    async stat(ctx) {
      const { clause, params } = ticketDateWhere(ctx);
      interface Row { avg_seconds: number | null }
      const [row] = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT ROUND(AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")))
               FILTER (WHERE "resolvedAt" IS NOT NULL AND status IN ('resolved','closed')))::int
               AS avg_seconds
         FROM ticket ${clause}`,
        ctx.dateRange.since, ctx.dateRange.until, ...params,
      );
      return { type: "stat", value: row?.avg_seconds ?? null, label: "Avg Resolution Time", unit: "seconds" };
    },

    async distribution(ctx) {
      const { clause, params } = ticketDateWhere(ctx);
      interface Row { bucket: string; count: bigint; sort: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT
           CASE
             WHEN EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) < 3600   THEN '< 1 hour'
             WHEN EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) < 14400  THEN '1–4 hours'
             WHEN EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) < 28800  THEN '4–8 hours'
             WHEN EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) < 86400  THEN '8–24 hours'
             WHEN EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) < 259200 THEN '1–3 days'
             WHEN EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) < 604800 THEN '3–7 days'
             ELSE '> 7 days'
           END AS bucket,
           COUNT(*) AS count,
           CASE
             WHEN EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) < 3600   THEN 1
             WHEN EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) < 14400  THEN 2
             WHEN EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) < 28800  THEN 3
             WHEN EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) < 86400  THEN 4
             WHEN EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) < 259200 THEN 5
             WHEN EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) < 604800 THEN 6
             ELSE 7
           END AS sort
         FROM ticket ${clause}
           AND "resolvedAt" IS NOT NULL AND status IN ('resolved','closed')
         GROUP BY bucket, sort ORDER BY sort`,
        ctx.dateRange.since, ctx.dateRange.until, ...params,
      );
      return {
        type: "distribution",
        buckets: rows.map(r => ({
          bucket: r.bucket, label: r.bucket,
          count: Number(r.count), sort: Number(r.sort),
        })),
      };
    },
  },
};

// ── tickets.first_response_time ───────────────────────────────────────────────

const ticketsFirstResponseTime: MetricDefinition = {
  id:    "tickets.first_response_time",
  label: "Avg First Response Time",
  description: "Average seconds between ticket creation and first agent reply.",
  domain: "tickets",
  unit:  "seconds",
  supportedVisualizations: ["number", "number_change"],
  defaultVisualization:    "number",

  computeFor: {
    async stat(ctx) {
      const { clause, params } = ticketDateWhere(ctx);
      interface Row { avg_seconds: number | null }
      const [row] = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT ROUND(AVG(EXTRACT(EPOCH FROM ("firstRespondedAt" - "createdAt")))
               FILTER (WHERE "firstRespondedAt" IS NOT NULL))::int AS avg_seconds
         FROM ticket ${clause}`,
        ctx.dateRange.since, ctx.dateRange.until, ...params,
      );
      return { type: "stat", value: row?.avg_seconds ?? null, label: "Avg First Response Time", unit: "seconds" };
    },
  },
};

// ── tickets.aging ─────────────────────────────────────────────────────────────

const ticketsAging: MetricDefinition = {
  id:    "tickets.aging",
  label: "Open Ticket Aging",
  description: "Currently-open tickets bucketed by how long they have been waiting (live snapshot).",
  domain: "tickets",
  supportedVisualizations: ["histogram", "bar"],
  defaultVisualization:    "histogram",

  computeFor: {
    async distribution(_ctx) {
      interface Row { bucket: string; count: bigint; sort: number }
      const rows = await _ctx.db.$queryRaw<Row[]>`
        SELECT
          CASE
            WHEN "createdAt" >= NOW() - INTERVAL '1 day'  THEN '< 24h'
            WHEN "createdAt" >= NOW() - INTERVAL '3 days' THEN '1–3 days'
            WHEN "createdAt" >= NOW() - INTERVAL '7 days' THEN '3–7 days'
            ELSE '> 7 days'
          END AS bucket,
          COUNT(*) AS count,
          CASE
            WHEN "createdAt" >= NOW() - INTERVAL '1 day'  THEN 1
            WHEN "createdAt" >= NOW() - INTERVAL '3 days' THEN 2
            WHEN "createdAt" >= NOW() - INTERVAL '7 days' THEN 3
            ELSE 4
          END AS sort
        FROM ticket WHERE status = 'open'
        GROUP BY bucket, sort ORDER BY sort
      `;
      return {
        type: "distribution",
        buckets: rows.map(r => ({
          bucket: r.bucket, label: r.bucket,
          count: Number(r.count), sort: Number(r.sort),
        })),
      };
    },
  },
};

// ── tickets.fcr ───────────────────────────────────────────────────────────────

const ticketsFcr: MetricDefinition = {
  id:    "tickets.fcr",
  label: "First Contact Resolution",
  description: "% of resolved tickets where the customer sent no follow-up reply.",
  domain: "tickets",
  unit:  "percent",
  supportedVisualizations: ["number", "gauge"],
  defaultVisualization:    "number",

  computeFor: {
    async stat(ctx) {
      interface Row { total: bigint; first_contact: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        WITH customer_replies AS (
          SELECT "ticketId",
            COUNT(*) FILTER (WHERE "senderType" = 'customer') AS customer_reply_count
          FROM reply GROUP BY "ticketId"
        )
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE COALESCE(cr.customer_reply_count, 0) = 0) AS first_contact
        FROM ticket t LEFT JOIN customer_replies cr ON cr."ticketId" = t.id
        WHERE t.status IN ('resolved','closed')
          AND t."createdAt" >= ${ctx.dateRange.since}
          AND t."createdAt" <= ${ctx.dateRange.until}
      `;
      const total = Number(row?.total ?? 0);
      const fc    = Number(row?.first_contact ?? 0);
      const rate  = total > 0 ? Math.round((fc / total) * 100) : null;
      return { type: "stat", value: rate, label: "FCR Rate", unit: "percent", sub: `${fc} of ${total} resolved` };
    },
  },
};

// ── tickets.ai_resolution_rate ────────────────────────────────────────────────

const ticketsAiResolutionRate: MetricDefinition = {
  id:    "tickets.ai_resolution_rate",
  label: "AI Auto-Resolved",
  description: "Percentage of resolved tickets that were auto-resolved by the AI agent.",
  domain: "tickets",
  unit:  "percent",
  supportedVisualizations: ["number", "gauge"],
  defaultVisualization:    "number",

  computeFor: {
    async stat(ctx) {
      interface Row { resolved: bigint; by_ai: bigint }
      const [row] = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'resolved') AS resolved,
           COUNT(*) FILTER (WHERE status = 'resolved' AND "assignedToId" = $3) AS by_ai
         FROM ticket
         WHERE "createdAt" >= $1 AND "createdAt" <= $2`,
        ctx.dateRange.since, ctx.dateRange.until, AI_AGENT_ID,
      );
      const resolved = Number(row?.resolved ?? 0);
      const byAi     = Number(row?.by_ai ?? 0);
      const rate     = resolved > 0 ? Math.round((byAi / resolved) * 100) : 0;
      return { type: "stat", value: rate, label: "AI Auto-Resolved", unit: "percent", sub: `${byAi} of ${resolved}` };
    },
  },
};

// ── tickets.top_open ──────────────────────────────────────────────────────────

const ticketsTopOpen: MetricDefinition = {
  id:    "tickets.top_open",
  label: "Longest-Waiting Open Tickets",
  description: "The oldest currently-open tickets (live snapshot).",
  domain: "tickets",
  supportedVisualizations: ["table"],
  defaultVisualization:    "table",

  computeFor: {
    async table(ctx) {
      const limit = ctx.limit ?? 10;
      interface Row {
        id: number; ticket_number: string; subject: string; priority: string | null;
        sla_breached: boolean; resolution_due_at: Date | null; created_at: Date;
        assignee_name: string; days_open: number;
      }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT t.id, t.ticket_number, t.subject, t.priority::text,
                t."slaBreached" AS sla_breached, t."resolutionDueAt" AS resolution_due_at,
                t."createdAt" AS created_at,
                COALESCE(u.name,'Unassigned') AS assignee_name,
                FLOOR(EXTRACT(EPOCH FROM (NOW() - t."createdAt")) / 86400)::int AS days_open
         FROM ticket t LEFT JOIN "user" u ON u.id = t."assignedToId"
         WHERE t.status = 'open'
         ORDER BY t."createdAt" ASC LIMIT $1`,
        limit,
      );
      const now = Date.now();
      return {
        type: "table",
        rows: rows.map(r => ({
          id:            r.id,
          ticketNumber:  r.ticket_number,
          subject:       r.subject,
          priority:      r.priority,
          slaBreached:   r.sla_breached,
          assigneeName:  r.assignee_name,
          daysOpen:      r.days_open,
          resolutionDueAt: r.resolution_due_at?.toISOString() ?? null,
        })),
        columnDefs: [
          { key: "ticketNumber", label: "Ticket",     sortable: false },
          { key: "subject",      label: "Subject",    sortable: false },
          { key: "priority",     label: "Priority",   sortable: true },
          { key: "assigneeName", label: "Assignee",   sortable: false },
          { key: "daysOpen",     label: "Days Open",  sortable: true },
        ],
        total: rows.length,
      };
    },
  },
};

// ── tickets.status_distribution ───────────────────────────────────────────────

const ticketsStatusDistribution: MetricDefinition = {
  id:    "tickets.status_distribution",
  label: "Ticket Status Distribution",
  description: "Breakdown of tickets by status for the selected period.",
  domain: "tickets",
  supportedVisualizations: ["donut", "bar", "bar_horizontal"],
  defaultVisualization:    "donut",

  computeFor: {
    async grouped_count(ctx) {
      const { clause, params } = ticketDateWhere(ctx);
      interface Row { key: string | null; count: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT COALESCE(status::text,'unknown') AS key, COUNT(*) AS count
         FROM ticket ${clause}
         GROUP BY status ORDER BY count DESC`,
        ctx.dateRange.since, ctx.dateRange.until, ...params,
      );
      const STATUS_LABELS: Record<string, string> = {
        open: "Open", in_progress: "In Progress", resolved: "Resolved", closed: "Closed",
      };
      const items = rows.map(r => ({
        key:   r.key ?? "unknown",
        label: STATUS_LABELS[r.key ?? ""] ?? r.key ?? "Unknown",
        value: Number(r.count),
      }));
      return { type: "grouped_count", items, total: items.reduce((s, i) => s + i.value, 0) };
    },
  },
};

// ── tickets.priority_distribution ────────────────────────────────────────────

const ticketsPriorityDistribution: MetricDefinition = {
  id:    "tickets.priority_distribution",
  label: "Ticket Priority Distribution",
  description: "Breakdown of tickets by priority level for the selected period.",
  domain: "tickets",
  supportedVisualizations: ["donut", "bar", "bar_horizontal"],
  defaultVisualization:    "donut",

  computeFor: {
    async grouped_count(ctx) {
      const { clause, params } = ticketDateWhere(ctx);
      interface Row { key: string | null; count: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT COALESCE(priority::text,'unset') AS key, COUNT(*) AS count
         FROM ticket ${clause}
         GROUP BY priority ORDER BY count DESC`,
        ctx.dateRange.since, ctx.dateRange.until, ...params,
      );
      const PRIORITY_LABELS: Record<string, string> = {
        urgent: "Urgent", high: "High", medium: "Medium", low: "Low", unset: "Unset",
      };
      const items = rows.map(r => ({
        key:   r.key ?? "unset",
        label: PRIORITY_LABELS[r.key ?? "unset"] ?? r.key ?? "Unset",
        value: Number(r.count),
      }));
      return { type: "grouped_count", items, total: items.reduce((s, i) => s + i.value, 0) };
    },
  },
};

// ── tickets.by_team ───────────────────────────────────────────────────────────

const ticketsByTeam: MetricDefinition = {
  id:    "tickets.by_team",
  label: "Tickets by Team",
  description: "Ticket count per team/queue for the selected period.",
  domain: "tickets",
  supportedVisualizations: ["bar_horizontal", "bar", "donut"],
  defaultVisualization:    "bar_horizontal",

  computeFor: {
    async grouped_count(ctx) {
      interface Row { key: string; count: bigint }
      const rows = await ctx.db.$queryRaw<Row[]>`
        SELECT COALESCE(q.name, 'Unassigned') AS key, COUNT(*) AS count
        FROM ticket t LEFT JOIN queue q ON q.id = t."queueId"
        WHERE t."createdAt" >= ${ctx.dateRange.since} AND t."createdAt" <= ${ctx.dateRange.until}
          AND t.status NOT IN ('new','processing')
        GROUP BY q.name ORDER BY count DESC LIMIT 15
      `;
      const items = rows.map(r => ({ key: r.key, label: r.key, value: Number(r.count) }));
      return { type: "grouped_count", items, total: items.reduce((s, i) => s + i.value, 0) };
    },
  },
};

// ── tickets.by_agent ──────────────────────────────────────────────────────────

const ticketsByAgent: MetricDefinition = {
  id:    "tickets.by_agent",
  label: "Tickets by Agent",
  description: "Ticket count per assigned agent for the selected period.",
  domain: "tickets",
  supportedVisualizations: ["bar_horizontal", "leaderboard"],
  defaultVisualization:    "bar_horizontal",

  computeFor: {
    async grouped_count(ctx) {
      interface Row { key: string; label: string; count: bigint }
      const rows = await ctx.db.$queryRaw<Row[]>`
        SELECT t."assignedToId" AS key, COALESCE(u.name, 'Unknown') AS label, COUNT(*) AS count
        FROM ticket t LEFT JOIN "user" u ON u.id = t."assignedToId"
        WHERE t."createdAt" >= ${ctx.dateRange.since} AND t."createdAt" <= ${ctx.dateRange.until}
          AND t.status NOT IN ('new','processing')
          AND t."assignedToId" IS NOT NULL
        GROUP BY t."assignedToId", u.name ORDER BY count DESC LIMIT 15
      `;
      const items = rows.map(r => ({ key: r.key, label: r.label, value: Number(r.count) }));
      return { type: "grouped_count", items, total: items.reduce((s, i) => s + i.value, 0) };
    },

    async leaderboard(ctx) {
      const limit = ctx.limit ?? 15;
      interface Row { key: string; label: string; count: bigint; resolved: bigint; open: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT t."assignedToId" AS key, COALESCE(u.name,'Unknown') AS label,
                COUNT(*) AS count,
                COUNT(*) FILTER (WHERE t.status IN ('resolved','closed')) AS resolved,
                COUNT(*) FILTER (WHERE t.status = 'open') AS open
         FROM ticket t LEFT JOIN "user" u ON u.id = t."assignedToId"
         WHERE t."createdAt" >= $1 AND t."createdAt" <= $2
           AND t.status NOT IN ('new','processing') AND t."assignedToId" IS NOT NULL
         GROUP BY t."assignedToId", u.name ORDER BY count DESC LIMIT $3`,
        ctx.dateRange.since, ctx.dateRange.until, limit,
      );
      return {
        type: "leaderboard",
        entries: rows.map((r, i) => ({
          rank: i + 1, key: r.key, label: r.label,
          primaryValue: Number(r.count),
          columns: { total: Number(r.count), resolved: Number(r.resolved), open: Number(r.open) },
        })),
        columnDefs: [
          { key: "total",    label: "Total",    unit: "count" },
          { key: "resolved", label: "Resolved", unit: "count" },
          { key: "open",     label: "Open",     unit: "count" },
        ],
      };
    },
  },
};

// ── tickets.overdue ───────────────────────────────────────────────────────────

const ticketsOverdue: MetricDefinition = {
  id:    "tickets.overdue",
  label: "Overdue Open Tickets",
  description: "Open tickets that have breached their SLA deadline (live snapshot).",
  domain: "tickets",
  unit:  "count",
  supportedVisualizations: ["number"],
  defaultVisualization:    "number",

  computeFor: {
    async stat(_ctx) {
      interface Row { count: bigint }
      const [row] = await _ctx.db.$queryRaw<Row[]>`
        SELECT COUNT(*) AS count FROM ticket
        WHERE status IN ('open','in_progress') AND "slaBreached" = true
      `;
      return { type: "stat", value: Number(row?.count ?? 0), label: "Overdue Open Tickets", unit: "count" };
    },
  },
};

// ── tickets.assigned_not_replied ──────────────────────────────────────────────

const ticketsAssignedNotReplied: MetricDefinition = {
  id:    "tickets.assigned_not_replied",
  label: "Assigned Without Reply",
  description: "Assigned open tickets where no agent has sent a reply yet (live snapshot).",
  domain: "tickets",
  unit:  "count",
  supportedVisualizations: ["number"],
  defaultVisualization:    "number",

  computeFor: {
    async stat(_ctx) {
      interface Row { count: bigint }
      const [row] = await _ctx.db.$queryRaw<Row[]>`
        SELECT COUNT(*) AS count FROM ticket t
        WHERE t.status IN ('open','in_progress')
          AND t."assignedToId" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM reply r
            WHERE r."ticketId" = t.id AND r."senderType" = 'agent'
          )
      `;
      return { type: "stat", value: Number(row?.count ?? 0), label: "Assigned Without Reply", unit: "count" };
    },
  },
};

// ── Export ────────────────────────────────────────────────────────────────────

export const TICKET_METRICS: MetricDefinition[] = [
  ticketsVolume,
  ticketsBacklog,
  ticketsSlaCompliance,
  ticketsResolutionTime,
  ticketsFirstResponseTime,
  ticketsAging,
  ticketsFcr,
  ticketsAiResolutionRate,
  ticketsTopOpen,
  ticketsStatusDistribution,
  ticketsPriorityDistribution,
  ticketsByTeam,
  ticketsByAgent,
  ticketsOverdue,
  ticketsAssignedNotReplied,
];
