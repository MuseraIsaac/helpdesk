import type { MetricDefinition } from "../types";
import { fillDateSeries } from "../date";

const csatAvgScore: MetricDefinition = {
  id: "csat.avg_score", label: "Average CSAT Score",
  description: "Mean customer satisfaction rating for tickets resolved in the period (1–5 scale).",
  domain: "csat", unit: "score",
  supportedVisualizations: ["number", "number_change", "gauge"],
  defaultVisualization:    "number",

  computeFor: {
    async stat(ctx) {
      interface Row { avg_rating: number | null; count: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT ROUND(AVG(cr.rating)::numeric, 2) AS avg_rating, COUNT(*) AS count
        FROM csat_rating cr
        WHERE cr."submittedAt" >= ${ctx.dateRange.since} AND cr."submittedAt" <= ${ctx.dateRange.until}
      `;
      const avg   = row?.avg_rating ?? null;
      const count = Number(row?.count ?? 0);

      if (ctx.comparison) {
        interface PRow { avg_rating: number | null }
        const [pr] = await ctx.db.$queryRaw<PRow[]>`
          SELECT ROUND(AVG(cr.rating)::numeric, 2) AS avg_rating
          FROM csat_rating cr
          WHERE cr."submittedAt" >= ${ctx.comparison.since} AND cr."submittedAt" <= ${ctx.comparison.until}
        `;
        const prev = pr?.avg_rating ?? null;
        const chg  = avg != null && prev != null ? +(avg - prev).toFixed(2) : null;
        return {
          type: "stat_change", value: avg, previousValue: prev,
          changePercent: chg,
          changeDirection: chg == null ? null : chg > 0 ? "up" : chg < 0 ? "down" : "neutral",
          label: "Avg CSAT Score", unit: "score",
          sub: `${count} ratings`,
        };
      }

      return { type: "stat", value: avg, label: "Avg CSAT Score", unit: "score", sub: `${count} ratings` };
    },
  },
};

const csatTrend: MetricDefinition = {
  id: "csat.trend", label: "CSAT Trend",
  description: "Daily average satisfaction score over the selected period.",
  domain: "csat", unit: "score",
  supportedVisualizations: ["line", "area"],
  defaultVisualization:    "line",

  computeFor: {
    async time_series(ctx) {
      interface Row { day: string; avg_rating: number | null; count: bigint }
      const rows = await ctx.db.$queryRaw<Row[]>`
        SELECT TO_CHAR("submittedAt",'YYYY-MM-DD') AS day,
               ROUND(AVG(rating)::numeric, 2) AS avg_rating, COUNT(*) AS count
        FROM csat_rating
        WHERE "submittedAt" >= ${ctx.dateRange.since} AND "submittedAt" <= ${ctx.dateRange.until}
        GROUP BY day ORDER BY day
      `;
      const lookup = new Map(rows.map(r => [r.day, { avg: r.avg_rating, count: Number(r.count) }]));
      const points = fillDateSeries(ctx.dateRange.since, ctx.dateRange.until).map(date => {
        const d = lookup.get(date);
        return { date, avgRating: d?.avg ?? null, count: d?.count ?? 0 };
      });
      return {
        type: "time_series",
        series: [{ key: "avgRating", label: "Avg Rating" }],
        points,
      };
    },
  },
};

const csatDistribution: MetricDefinition = {
  id: "csat.distribution", label: "CSAT Score Distribution",
  description: "Count of ratings at each star level (1–5).",
  domain: "csat",
  supportedVisualizations: ["histogram", "bar"],
  defaultVisualization:    "histogram",

  computeFor: {
    async distribution(ctx) {
      interface Row { rating: number; count: bigint }
      const rows = await ctx.db.$queryRaw<Row[]>`
        SELECT rating, COUNT(*) AS count
        FROM csat_rating
        WHERE "submittedAt" >= ${ctx.dateRange.since} AND "submittedAt" <= ${ctx.dateRange.until}
        GROUP BY rating ORDER BY rating
      `;
      const lookup = new Map(rows.map(r => [r.rating, Number(r.count)]));
      return {
        type: "distribution",
        buckets: [1, 2, 3, 4, 5].map(n => ({
          bucket: String(n),
          label:  `${n} star${n === 1 ? "" : "s"}`,
          count:  lookup.get(n) ?? 0,
          sort:   n,
        })),
      };
    },
  },
};

export const CSAT_METRICS: MetricDefinition[] = [csatAvgScore, csatTrend, csatDistribution];
