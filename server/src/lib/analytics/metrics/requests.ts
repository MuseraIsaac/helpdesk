import type { MetricDefinition } from "../types";
import { fillDateSeries } from "../date";
import { REQUEST_UNION_CTE } from "../request-source";

// ── Service-request analytics ────────────────────────────────────────────────
//
// All queries here run against the unified_requests CTE so they aggregate
// BOTH service_request rows (standalone — internal/portal) AND ticket rows
// of type 'service_request' (the ticket itself IS the request). See
// lib/analytics/request-source.ts for the projection.

const requestsVolume: MetricDefinition = {
  id: "requests.volume", label: "Service Request Volume",
  description: "Number of service requests created per day (combined across the requests table and tickets typed as service_request).",
  domain: "requests", unit: "count",
  supportedVisualizations: ["line", "area", "bar", "number"],
  defaultVisualization:    "line",

  computeFor: {
    async stat(ctx) {
      interface Row { count: bigint }
      const [row] = await ctx.db.$queryRawUnsafe<Row[]>(
        `WITH ${REQUEST_UNION_CTE}
         SELECT COUNT(*) AS count FROM unified_requests
         WHERE created_at >= $1 AND created_at <= $2`,
        ctx.dateRange.since, ctx.dateRange.until,
      );
      return { type: "stat", value: Number(row?.count ?? 0), label: "Total Requests", unit: "count" };
    },

    async time_series(ctx) {
      interface Row { day: string; count: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `WITH ${REQUEST_UNION_CTE}
         SELECT TO_CHAR(created_at,'YYYY-MM-DD') AS day, COUNT(*) AS count
         FROM unified_requests
         WHERE created_at >= $1 AND created_at <= $2
         GROUP BY day ORDER BY day`,
        ctx.dateRange.since, ctx.dateRange.until,
      );
      const lookup = new Map(rows.map(r => [r.day, Number(r.count)]));
      const points = fillDateSeries(ctx.dateRange.since, ctx.dateRange.until)
        .map(date => ({ date, requests: lookup.get(date) ?? 0 }));
      return { type: "time_series", series: [{ key: "requests", label: "Requests" }], points };
    },

    async grouped_count(ctx) {
      interface Row { key: string | null; count: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `WITH ${REQUEST_UNION_CTE}
         SELECT COALESCE(status,'unknown') AS key, COUNT(*) AS count
         FROM unified_requests
         WHERE created_at >= $1 AND created_at <= $2
         GROUP BY status ORDER BY count DESC`,
        ctx.dateRange.since, ctx.dateRange.until,
      );
      const items = rows.map(r => ({ key: r.key ?? "unknown", label: r.key ?? "Unknown", value: Number(r.count) }));
      return { type: "grouped_count", items, total: items.reduce((s, i) => s + i.value, 0) };
    },
  },
};

const requestsFulfillmentTime: MetricDefinition = {
  id: "requests.fulfillment_time", label: "Avg Fulfillment Time",
  description: "Average time from request creation to resolution or closure across both standalone requests and service-request tickets.",
  domain: "requests", unit: "seconds",
  supportedVisualizations: ["number"],
  defaultVisualization:    "number",

  computeFor: {
    async stat(ctx) {
      interface Row { avg_seconds: number | null }
      const [row] = await ctx.db.$queryRawUnsafe<Row[]>(
        `WITH ${REQUEST_UNION_CTE}
         SELECT ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)))
                FILTER (WHERE resolved_at IS NOT NULL AND resolved_at >= created_at))::int
                AS avg_seconds
         FROM unified_requests
         WHERE created_at >= $1 AND created_at <= $2`,
        ctx.dateRange.since, ctx.dateRange.until,
      );
      return { type: "stat", value: row?.avg_seconds ?? null, label: "Avg Fulfillment Time", unit: "seconds" };
    },
  },
};

const requestsSlaCompliance: MetricDefinition = {
  id: "requests.sla_compliance", label: "Request SLA Compliance",
  description: "Percentage of service requests with an SLA target met on time, across both standalone requests and service-request tickets.",
  domain: "requests", unit: "percent",
  supportedVisualizations: ["number", "gauge"],
  defaultVisualization:    "number",

  computeFor: {
    async stat(ctx) {
      interface Row { with_sla: bigint; breached: bigint }
      const [row] = await ctx.db.$queryRawUnsafe<Row[]>(
        `WITH ${REQUEST_UNION_CTE}
         SELECT COUNT(*) FILTER (WHERE sla_due_at IS NOT NULL)              AS with_sla,
                COUNT(*) FILTER (WHERE sla_due_at IS NOT NULL
                                   AND (sla_breached = true
                                     OR (resolved_at IS NOT NULL AND resolved_at > sla_due_at))) AS breached
         FROM unified_requests
         WHERE created_at >= $1 AND created_at <= $2`,
        ctx.dateRange.since, ctx.dateRange.until,
      );
      const withSla  = Number(row?.with_sla ?? 0);
      const breached = Number(row?.breached ?? 0);
      const rate = withSla > 0 ? Math.round(((withSla - breached) / withSla) * 100) : null;
      return { type: "stat", value: rate, label: "Request SLA Compliance", unit: "percent", sub: `${breached} breached` };
    },
  },
};

const requestsTopItems: MetricDefinition = {
  id: "requests.top_items", label: "Top Requested Items",
  description: "Most frequently requested catalog items. Service-request tickets are grouped under 'Ad-hoc Request' since they have no catalog item.",
  domain: "requests",
  supportedVisualizations: ["leaderboard", "bar_horizontal"],
  defaultVisualization:    "leaderboard",

  computeFor: {
    async leaderboard(ctx) {
      interface Row { name: string; count: bigint; avg_seconds: number | null }
      const limit = ctx.limit ?? 8;
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `WITH ${REQUEST_UNION_CTE}
         SELECT COALESCE(catalog_item, 'Ad-hoc Request') AS name,
                COUNT(*) AS count,
                ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)))
                FILTER (WHERE resolved_at IS NOT NULL AND resolved_at >= created_at))::int
                AS avg_seconds
         FROM unified_requests
         WHERE created_at >= $1 AND created_at <= $2
         GROUP BY catalog_item ORDER BY count DESC LIMIT $3`,
        ctx.dateRange.since, ctx.dateRange.until, limit,
      );
      return {
        type: "leaderboard",
        entries: rows.map((r, i) => ({
          rank: i + 1, key: r.name, label: r.name,
          primaryValue: Number(r.count),
          columns: { count: Number(r.count), avgFulfillmentSeconds: r.avg_seconds },
        })),
        columnDefs: [
          { key: "count",                  label: "Requests",        unit: "count" },
          { key: "avgFulfillmentSeconds",  label: "Avg Fulfillment", unit: "seconds" },
        ],
      };
    },
  },
};

export const REQUEST_METRICS: MetricDefinition[] = [
  requestsVolume, requestsFulfillmentTime, requestsSlaCompliance, requestsTopItems,
];
