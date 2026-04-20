import type { MetricDefinition, ComputeContext } from "../types";
import { buildFilterSQL, INCIDENT_FIELD_MAP } from "../filters";
import { fillDateSeries } from "../date";

function incidentWhere(ctx: ComputeContext): { clause: string; params: unknown[] } {
  const { clause, params } = buildFilterSQL(ctx.filters, INCIDENT_FIELD_MAP, 3);
  return {
    clause: `WHERE "createdAt" >= $1 AND "createdAt" <= $2${clause}`,
    params,
  };
}

const incidentsVolume: MetricDefinition = {
  id: "incidents.volume", label: "Incident Volume",
  description: "Number of incidents created per day.",
  domain: "incidents", unit: "count",
  supportedVisualizations: ["line", "area", "bar", "number"],
  defaultVisualization:    "line",

  computeFor: {
    async stat(ctx) {
      const { clause, params } = incidentWhere(ctx);
      interface Row { count: bigint }
      const [row] = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT COUNT(*) AS count FROM incident ${clause}`,
        ctx.dateRange.since, ctx.dateRange.until, ...params,
      );
      return { type: "stat", value: Number(row?.count ?? 0), label: "Total Incidents", unit: "count" };
    },

    async time_series(ctx) {
      const { clause, params } = incidentWhere(ctx);
      interface Row { day: string; count: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT TO_CHAR("createdAt",'YYYY-MM-DD') AS day, COUNT(*) AS count
         FROM incident ${clause} GROUP BY day ORDER BY day`,
        ctx.dateRange.since, ctx.dateRange.until, ...params,
      );
      const lookup = new Map(rows.map(r => [r.day, Number(r.count)]));
      const points = fillDateSeries(ctx.dateRange.since, ctx.dateRange.until)
        .map(date => ({ date, incidents: lookup.get(date) ?? 0 }));
      return { type: "time_series", series: [{ key: "incidents", label: "Incidents" }], points };
    },

    async grouped_count(ctx) {
      const dim = ctx.groupBy ?? "status";
      const { clause, params } = incidentWhere(ctx);
      interface Row { key: string | null; count: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT COALESCE(${dim}::text,'unknown') AS key, COUNT(*) AS count
         FROM incident ${clause} GROUP BY ${dim} ORDER BY count DESC`,
        ctx.dateRange.since, ctx.dateRange.until, ...params,
      );
      const items = rows.map(r => ({ key: r.key ?? "unknown", label: r.key ?? "Unknown", value: Number(r.count) }));
      return { type: "grouped_count", items, total: items.reduce((s, i) => s + i.value, 0) };
    },
  },
};

const incidentsMtta: MetricDefinition = {
  id: "incidents.mtta", label: "MTTA",
  description: "Mean time to acknowledge — average seconds from creation to acknowledgement.",
  domain: "incidents", unit: "seconds",
  supportedVisualizations: ["number", "number_change"],
  defaultVisualization:    "number",

  computeFor: {
    async stat(ctx) {
      interface Row { mtta: number | null }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM ("acknowledged_at" - "createdAt")))
               FILTER (WHERE "acknowledged_at" IS NOT NULL))::int AS mtta
        FROM incident
        WHERE "createdAt" >= ${ctx.dateRange.since} AND "createdAt" <= ${ctx.dateRange.until}
      `;
      return { type: "stat", value: row?.mtta ?? null, label: "MTTA", unit: "seconds" };
    },
  },
};

const incidentsMttr: MetricDefinition = {
  id: "incidents.mttr", label: "MTTR",
  description: "Mean time to resolve — average seconds from creation to resolution.",
  domain: "incidents", unit: "seconds",
  supportedVisualizations: ["number", "number_change"],
  defaultVisualization:    "number",

  computeFor: {
    async stat(ctx) {
      interface Row { mttr: number | null }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM ("resolved_at" - "createdAt")))
               FILTER (WHERE "resolved_at" IS NOT NULL AND status IN ('resolved','closed')))::int AS mttr
        FROM incident
        WHERE "createdAt" >= ${ctx.dateRange.since} AND "createdAt" <= ${ctx.dateRange.until}
      `;
      return { type: "stat", value: row?.mttr ?? null, label: "MTTR", unit: "seconds" };
    },
  },
};

const incidentsSlaCompliance: MetricDefinition = {
  id: "incidents.sla_compliance", label: "Incident SLA Compliance",
  description: "Percentage of incidents that did not breach their SLA.",
  domain: "incidents", unit: "percent",
  supportedVisualizations: ["number", "gauge"],
  defaultVisualization:    "number",

  computeFor: {
    async stat(ctx) {
      interface Row { total: bigint; breached: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE "sla_breached" = true) AS breached
        FROM incident
        WHERE "createdAt" >= ${ctx.dateRange.since} AND "createdAt" <= ${ctx.dateRange.until}
      `;
      const t = Number(row?.total ?? 0);
      const b = Number(row?.breached ?? 0);
      const rate = t > 0 ? Math.round(((t - b) / t) * 100) : null;
      return { type: "stat", value: rate, label: "Incident SLA Compliance", unit: "percent", sub: `${b} breached of ${t}` };
    },
  },
};

const incidentsMajorCount: MetricDefinition = {
  id: "incidents.major_count", label: "Major Incidents",
  description: "Count of incidents flagged as major (P1/SEV1).",
  domain: "incidents", unit: "count",
  supportedVisualizations: ["number"],
  defaultVisualization:    "number",

  computeFor: {
    async stat(ctx) {
      interface Row { count: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT COUNT(*) AS count FROM incident
        WHERE "is_major" = true
          AND "createdAt" >= ${ctx.dateRange.since} AND "createdAt" <= ${ctx.dateRange.until}
      `;
      return { type: "stat", value: Number(row?.count ?? 0), label: "Major Incidents", unit: "count" };
    },
  },
};

export const INCIDENT_METRICS: MetricDefinition[] = [
  incidentsVolume, incidentsMtta, incidentsMttr,
  incidentsSlaCompliance, incidentsMajorCount,
];
