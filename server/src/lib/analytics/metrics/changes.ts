import type { MetricDefinition } from "../types";
import { fillDateSeries } from "../date";

const changesVolume: MetricDefinition = {
  id: "changes.volume", label: "Change Volume",
  description: "Number of change requests created or closed in the period.",
  domain: "changes", unit: "count",
  supportedVisualizations: ["number", "line", "bar"],
  defaultVisualization:    "number",

  computeFor: {
    async stat(ctx) {
      interface Row { count: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT COUNT(*) AS count FROM change_request
        WHERE "createdAt" >= ${ctx.dateRange.since} AND "createdAt" <= ${ctx.dateRange.until}
      `;
      return { type: "stat", value: Number(row?.count ?? 0), label: "Changes Opened", unit: "count" };
    },

    async time_series(ctx) {
      interface Row { day: string; count: bigint }
      const rows = await ctx.db.$queryRaw<Row[]>`
        SELECT TO_CHAR("createdAt",'YYYY-MM-DD') AS day, COUNT(*) AS count
        FROM change_request
        WHERE "createdAt" >= ${ctx.dateRange.since} AND "createdAt" <= ${ctx.dateRange.until}
        GROUP BY day ORDER BY day
      `;
      const lookup = new Map(rows.map(r => [r.day, Number(r.count)]));
      const points = fillDateSeries(ctx.dateRange.since, ctx.dateRange.until)
        .map(date => ({ date, changes: lookup.get(date) ?? 0 }));
      return { type: "time_series", series: [{ key: "changes", label: "Changes" }], points };
    },

    async grouped_count(ctx) {
      const dim = ctx.groupBy ?? "state";
      const colMap: Record<string, string> = { state: "state", changeType: `"change_type"`, risk: "risk", priority: "priority" };
      const col = colMap[dim] ?? "state";
      interface Row { key: string | null; count: bigint }
      const rows = await ctx.db.$queryRaw<Row[]>`
        SELECT COALESCE(${col}::text,'unknown') AS key, COUNT(*) AS count
        FROM change_request
        WHERE "createdAt" >= ${ctx.dateRange.since} AND "createdAt" <= ${ctx.dateRange.until}
        GROUP BY ${col} ORDER BY count DESC
      `;
      const items = rows.map(r => ({ key: r.key ?? "unknown", label: r.key ?? "Unknown", value: Number(r.count) }));
      return { type: "grouped_count", items, total: items.reduce((s, i) => s + i.value, 0) };
    },
  },
};

const changesByRisk: MetricDefinition = {
  id: "changes.by_risk", label: "Changes by Risk Level",
  description: "Distribution of changes across risk categories.",
  domain: "changes",
  supportedVisualizations: ["bar", "bar_horizontal", "donut"],
  defaultVisualization:    "bar_horizontal",

  computeFor: {
    async grouped_count(ctx) {
      interface Row { key: string | null; count: bigint }
      const rows = await ctx.db.$queryRaw<Row[]>`
        SELECT COALESCE(risk::text,'unset') AS key, COUNT(*) AS count
        FROM change_request
        WHERE "createdAt" >= ${ctx.dateRange.since} AND "createdAt" <= ${ctx.dateRange.until}
        GROUP BY risk ORDER BY count DESC
      `;
      const items = rows.map(r => ({ key: r.key ?? "unset", label: r.key ?? "Unset", value: Number(r.count) }));
      return { type: "grouped_count", items, total: items.reduce((s, i) => s + i.value, 0) };
    },
  },
};

// ── changes.approval_time ─────────────────────────────────────────────────────

const changesApprovalTime: MetricDefinition = {
  id: "changes.approval_time",
  label: "Avg Change Approval Time",
  description: "Average seconds from change submission to final approval decision.",
  domain: "changes", unit: "seconds",
  supportedVisualizations: ["number"],
  defaultVisualization: "number",

  computeFor: {
    async stat(ctx) {
      interface Row { avg_seconds: number | null }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM ("resolvedAt" - ar."createdAt")))
               FILTER (WHERE "resolvedAt" IS NOT NULL))::int AS avg_seconds
        FROM approval_request ar
        WHERE ar.subject_type = 'change_request'
          AND ar."createdAt" >= ${ctx.dateRange.since} AND ar."createdAt" <= ${ctx.dateRange.until}
      `;
      return { type: "stat", value: row?.avg_seconds ?? null, label: "Avg Approval Time", unit: "seconds" };
    },
  },
};

// ── changes.success_rate ──────────────────────────────────────────────────────

const changesSuccessRate: MetricDefinition = {
  id: "changes.success_rate",
  label: "Change Success Rate",
  description: "Percentage of implemented changes closed successfully vs failed.",
  domain: "changes", unit: "percent",
  supportedVisualizations: ["number", "gauge"],
  defaultVisualization: "number",

  computeFor: {
    async stat(ctx) {
      interface Row { total: bigint; failed: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE state = 'failed') AS failed
        FROM change_request
        WHERE "createdAt" >= ${ctx.dateRange.since} AND "createdAt" <= ${ctx.dateRange.until}
          AND state IN ('closed','failed')
      `;
      const total = Number(row?.total ?? 0);
      const failed = Number(row?.failed ?? 0);
      const rate = total > 0 ? Math.round(((total - failed) / total) * 100) : null;
      return { type: "stat", value: rate, label: "Change Success Rate", unit: "percent", sub: `${failed} failed of ${total}` };
    },
  },
};

// ── changes.by_type ───────────────────────────────────────────────────────────

const changesByType: MetricDefinition = {
  id: "changes.by_type",
  label: "Changes by Type",
  description: "Distribution of changes across standard, normal, emergency, etc.",
  domain: "changes",
  supportedVisualizations: ["donut", "bar", "bar_horizontal"],
  defaultVisualization: "donut",

  computeFor: {
    async grouped_count(ctx) {
      interface Row { key: string | null; count: bigint }
      const rows = await ctx.db.$queryRaw<Row[]>`
        SELECT COALESCE("change_type"::text,'unset') AS key, COUNT(*) AS count
        FROM change_request
        WHERE "createdAt" >= ${ctx.dateRange.since} AND "createdAt" <= ${ctx.dateRange.until}
        GROUP BY "change_type" ORDER BY count DESC
      `;
      const items = rows.map(r => ({ key: r.key ?? "unset", label: r.key ?? "Unset", value: Number(r.count) }));
      return { type: "grouped_count", items, total: items.reduce((s, i) => s + i.value, 0) };
    },
  },
};

export const CHANGE_METRICS: MetricDefinition[] = [
  changesVolume,
  changesByRisk,
  changesByType,
  changesApprovalTime,
  changesSuccessRate,
];
