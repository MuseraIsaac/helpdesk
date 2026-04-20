import type { MetricDefinition } from "../types";

const problemsVolume: MetricDefinition = {
  id: "problems.volume", label: "Problem Volume",
  description: "Number of problem records created in the period.",
  domain: "problems", unit: "count",
  supportedVisualizations: ["number", "bar"],
  defaultVisualization:    "number",

  computeFor: {
    async stat(ctx) {
      interface Row { count: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT COUNT(*) AS count FROM problem
        WHERE "createdAt" >= ${ctx.dateRange.since} AND "createdAt" <= ${ctx.dateRange.until}
      `;
      return { type: "stat", value: Number(row?.count ?? 0), label: "Problems Opened", unit: "count" };
    },

    async grouped_count(ctx) {
      interface Row { key: string | null; count: bigint }
      const dim = ctx.groupBy ?? "status";
      const rows = await ctx.db.$queryRaw<Row[]>`
        SELECT COALESCE(status::text,'unknown') AS key, COUNT(*) AS count
        FROM problem
        WHERE "createdAt" >= ${ctx.dateRange.since} AND "createdAt" <= ${ctx.dateRange.until}
        GROUP BY status ORDER BY count DESC
      `;
      const items = rows.map(r => ({ key: r.key ?? "unknown", label: r.key ?? "Unknown", value: Number(r.count) }));
      return { type: "grouped_count", items, total: items.reduce((s, i) => s + i.value, 0) };
    },
  },
};

const problemsKnownErrors: MetricDefinition = {
  id: "problems.known_errors", label: "Known Errors",
  description: "Count of problems flagged as known errors (with published workarounds).",
  domain: "problems", unit: "count",
  supportedVisualizations: ["number"],
  defaultVisualization:    "number",

  computeFor: {
    async stat(ctx) {
      interface Row { count: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT COUNT(*) AS count FROM problem
        WHERE "is_known_error" = true
          AND "createdAt" >= ${ctx.dateRange.since} AND "createdAt" <= ${ctx.dateRange.until}
      `;
      return { type: "stat", value: Number(row?.count ?? 0), label: "Known Errors", unit: "count" };
    },
  },
};

const problemsRecurring: MetricDefinition = {
  id: "problems.recurring", label: "Recurring Problems",
  description: "Problems with ≥ 2 linked incidents — indicators of systemic issues.",
  domain: "problems", unit: "count",
  supportedVisualizations: ["number"],
  defaultVisualization:    "number",

  computeFor: {
    async stat(ctx) {
      interface Row { problem_id: number; linked_count: bigint }
      const rows = await ctx.db.$queryRaw<Row[]>`
        SELECT pil.problem_id, COUNT(*) AS linked_count
        FROM problem_incident_link pil
        JOIN problem p ON p.id = pil.problem_id
        WHERE p."createdAt" >= ${ctx.dateRange.since} AND p."createdAt" <= ${ctx.dateRange.until}
        GROUP BY pil.problem_id
      `;
      const recurring = rows.filter(r => Number(r.linked_count) >= 2).length;
      return { type: "stat", value: recurring, label: "Recurring Problems", unit: "count" };
    },
  },
};

const problemsAvgResolution: MetricDefinition = {
  id: "problems.avg_resolution_days", label: "Avg Problem Resolution Time",
  description: "Average days from problem creation to resolution.",
  domain: "problems", unit: "days",
  supportedVisualizations: ["number"],
  defaultVisualization:    "number",

  computeFor: {
    async stat(ctx) {
      interface Row { avg_days: number | null }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM (
          COALESCE("resolved_at","closed_at") - "createdAt"
        )) / 86400.0) FILTER (WHERE COALESCE("resolved_at","closed_at") IS NOT NULL), 1)
        AS avg_days
        FROM problem
        WHERE "createdAt" >= ${ctx.dateRange.since} AND "createdAt" <= ${ctx.dateRange.until}
      `;
      return { type: "stat", value: row?.avg_days ?? null, label: "Avg Resolution Days", unit: "days" };
    },
  },
};

export const PROBLEM_METRICS: MetricDefinition[] = [
  problemsVolume, problemsKnownErrors, problemsRecurring, problemsAvgResolution,
];
