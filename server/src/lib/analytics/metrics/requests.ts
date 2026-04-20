import type { MetricDefinition } from "../types";
import { fillDateSeries } from "../date";

const requestsVolume: MetricDefinition = {
  id: "requests.volume", label: "Service Request Volume",
  description: "Number of service requests created per day.",
  domain: "requests", unit: "count",
  supportedVisualizations: ["line", "area", "bar", "number"],
  defaultVisualization:    "line",

  computeFor: {
    async stat(ctx) {
      interface Row { count: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT COUNT(*) AS count FROM service_request
        WHERE "createdAt" >= ${ctx.dateRange.since} AND "createdAt" <= ${ctx.dateRange.until}
      `;
      return { type: "stat", value: Number(row?.count ?? 0), label: "Total Requests", unit: "count" };
    },

    async time_series(ctx) {
      interface Row { day: string; count: bigint }
      const rows = await ctx.db.$queryRaw<Row[]>`
        SELECT TO_CHAR("createdAt",'YYYY-MM-DD') AS day, COUNT(*) AS count
        FROM service_request
        WHERE "createdAt" >= ${ctx.dateRange.since} AND "createdAt" <= ${ctx.dateRange.until}
        GROUP BY day ORDER BY day
      `;
      const lookup = new Map(rows.map(r => [r.day, Number(r.count)]));
      const points = fillDateSeries(ctx.dateRange.since, ctx.dateRange.until)
        .map(date => ({ date, requests: lookup.get(date) ?? 0 }));
      return { type: "time_series", series: [{ key: "requests", label: "Requests" }], points };
    },

    async grouped_count(ctx) {
      const dim = ctx.groupBy ?? "status";
      interface Row { key: string | null; count: bigint }
      const rows = await ctx.db.$queryRaw<Row[]>`
        SELECT COALESCE(status::text,'unknown') AS key, COUNT(*) AS count
        FROM service_request
        WHERE "createdAt" >= ${ctx.dateRange.since} AND "createdAt" <= ${ctx.dateRange.until}
        GROUP BY status ORDER BY count DESC
      `;
      const items = rows.map(r => ({ key: r.key ?? "unknown", label: r.key ?? "Unknown", value: Number(r.count) }));
      return { type: "grouped_count", items, total: items.reduce((s, i) => s + i.value, 0) };
    },
  },
};

const requestsFulfillmentTime: MetricDefinition = {
  id: "requests.fulfillment_time", label: "Avg Fulfillment Time",
  description: "Average time from request creation to resolution or closure.",
  domain: "requests", unit: "seconds",
  supportedVisualizations: ["number"],
  defaultVisualization:    "number",

  computeFor: {
    async stat(ctx) {
      interface Row { avg_seconds: number | null }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM (
          COALESCE("resolved_at","closed_at") - "createdAt"
        ))) FILTER (WHERE COALESCE("resolved_at","closed_at") IS NOT NULL))::int AS avg_seconds
        FROM service_request
        WHERE "createdAt" >= ${ctx.dateRange.since} AND "createdAt" <= ${ctx.dateRange.until}
      `;
      return { type: "stat", value: row?.avg_seconds ?? null, label: "Avg Fulfillment Time", unit: "seconds" };
    },
  },
};

const requestsSlaCompliance: MetricDefinition = {
  id: "requests.sla_compliance", label: "Request SLA Compliance",
  description: "Percentage of service requests with an SLA target met on time.",
  domain: "requests", unit: "percent",
  supportedVisualizations: ["number", "gauge"],
  defaultVisualization:    "number",

  computeFor: {
    async stat(ctx) {
      const withSla = await ctx.db.serviceRequest.count({
        where: { createdAt: { gte: ctx.dateRange.since, lte: ctx.dateRange.until }, slaDueAt: { not: null } },
      });
      interface Row { breached: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT COUNT(*) FILTER (WHERE "sla_breached" = true) AS breached
        FROM service_request
        WHERE "createdAt" >= ${ctx.dateRange.since} AND "createdAt" <= ${ctx.dateRange.until}
      `;
      const breached = Number(row?.breached ?? 0);
      const rate = withSla > 0 ? Math.round(((withSla - breached) / withSla) * 100) : null;
      return { type: "stat", value: rate, label: "Request SLA Compliance", unit: "percent", sub: `${breached} breached` };
    },
  },
};

const requestsTopItems: MetricDefinition = {
  id: "requests.top_items", label: "Top Requested Items",
  description: "Most frequently requested catalog items.",
  domain: "requests",
  supportedVisualizations: ["leaderboard", "bar_horizontal"],
  defaultVisualization:    "leaderboard",

  computeFor: {
    async leaderboard(ctx) {
      interface Row { name: string; count: bigint; avg_seconds: number | null }
      const limit = ctx.limit ?? 8;
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT COALESCE("catalog_item_name",'Ad-hoc Request') AS name,
                COUNT(*) AS count,
                ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE("resolved_at","closed_at") - "createdAt")))
                FILTER (WHERE COALESCE("resolved_at","closed_at") IS NOT NULL))::int AS avg_seconds
         FROM service_request
         WHERE "createdAt" >= $1 AND "createdAt" <= $2
         GROUP BY "catalog_item_name" ORDER BY count DESC LIMIT $3`,
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
          { key: "count",                  label: "Requests",       unit: "count" },
          { key: "avgFulfillmentSeconds",  label: "Avg Fulfillment", unit: "seconds" },
        ],
      };
    },
  },
};

export const REQUEST_METRICS: MetricDefinition[] = [
  requestsVolume, requestsFulfillmentTime, requestsSlaCompliance, requestsTopItems,
];
