/**
 * Knowledge-base metric definitions.
 *
 * Covers kb_article and kb_article_feedback tables.
 * viewCount / helpfulCount / notHelpfulCount are denormalized counters on
 * kb_article — the feedback table holds the raw votes for trend queries.
 */
import type { MetricDefinition } from "../types";
import { fillDateSeries } from "../date";

// ── kb.article_count ──────────────────────────────────────────────────────────

const kbArticleCount: MetricDefinition = {
  id: "kb.article_count",
  label: "Published Articles",
  description: "Total number of KB articles, broken down by status and visibility.",
  domain: "kb",
  unit: "count",
  supportedVisualizations: ["number", "bar", "donut"],
  defaultVisualization: "number",
  supportedGroupBys: ["status", "visibility", "review_status"],

  computeFor: {
    async stat(ctx) {
      interface Row { count: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT COUNT(*) AS count FROM kb_article WHERE status = 'published'
      `;
      return { type: "stat", value: Number(row?.count ?? 0), label: "Published Articles", unit: "count" };
    },

    async grouped_count(ctx) {
      const dim = ctx.groupBy ?? "status";
      const colMap: Record<string, string> = {
        status: "status",
        visibility: "visibility",
        review_status: `"reviewStatus"`,
      };
      const col = colMap[dim] ?? "status";
      interface Row { key: string; count: bigint }
      const rows = await ctx.db.$queryRaw<Row[]>`
        SELECT COALESCE(${col}::text,'unknown') AS key, COUNT(*) AS count
        FROM kb_article GROUP BY ${col} ORDER BY count DESC
      `;
      const items = rows.map(r => ({ key: r.key, label: r.key, value: Number(r.count) }));
      return { type: "grouped_count", items, total: items.reduce((s, i) => s + i.value, 0) };
    },
  },
};

// ── kb.view_count ─────────────────────────────────────────────────────────────

const kbViewCount: MetricDefinition = {
  id: "kb.view_count",
  label: "Total Article Views",
  description: "Sum of viewCount across all published articles.",
  domain: "kb",
  unit: "count",
  supportedVisualizations: ["number"],
  defaultVisualization: "number",

  computeFor: {
    async stat(_ctx) {
      interface Row { views: bigint }
      const [row] = await _ctx.db.$queryRaw<Row[]>`
        SELECT COALESCE(SUM("viewCount"),0) AS views FROM kb_article WHERE status = 'published'
      `;
      return { type: "stat", value: Number(row?.views ?? 0), label: "Total Views", unit: "count" };
    },
  },
};

// ── kb.helpful_ratio ──────────────────────────────────────────────────────────

const kbHelpfulRatio: MetricDefinition = {
  id: "kb.helpful_ratio",
  label: "Helpful Vote Ratio",
  description: "Percentage of feedback votes marked as helpful across all published articles.",
  domain: "kb",
  unit: "percent",
  supportedVisualizations: ["number", "gauge"],
  defaultVisualization: "number",

  computeFor: {
    async stat(ctx) {
      interface Row { helpful: bigint; not_helpful: bigint }
      // The kb_article_feedback table uses `submittedAt`, not `createdAt`
      // (no @map alias on the Prisma model). The previous query referenced
      // `"createdAt"` which doesn't exist — Postgres raised undefined-column
      // and the analytics runner returned an empty result, so the widget
      // looked permanently zero.
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT
          COUNT(*) FILTER (WHERE helpful = true)  AS helpful,
          COUNT(*) FILTER (WHERE helpful = false) AS not_helpful
        FROM kb_article_feedback
        WHERE "submittedAt" >= ${ctx.dateRange.since}
          AND "submittedAt" <= ${ctx.dateRange.until}
      `;
      const h = Number(row?.helpful ?? 0);
      const n = Number(row?.not_helpful ?? 0);
      const total = h + n;
      const rate = total > 0 ? Math.round((h / total) * 100) : null;
      return {
        type: "stat", value: rate, label: "Helpful Ratio", unit: "percent",
        sub: `${h} helpful / ${n} not helpful`,
      };
    },
  },
};

// ── kb.feedback_trend ─────────────────────────────────────────────────────────

const kbFeedbackTrend: MetricDefinition = {
  id: "kb.feedback_trend",
  label: "KB Feedback Trend",
  description: "Daily helpful vs. not-helpful votes over the selected period.",
  domain: "kb",
  supportedVisualizations: ["line", "area", "bar"],
  defaultVisualization: "line",

  computeFor: {
    async time_series(ctx) {
      interface Row { day: string; helpful: bigint; not_helpful: bigint }
      // Same fix as kb.helpful_ratio — column is `submittedAt`, not `createdAt`.
      const rows = await ctx.db.$queryRaw<Row[]>`
        SELECT TO_CHAR("submittedAt",'YYYY-MM-DD') AS day,
               COUNT(*) FILTER (WHERE helpful = true)  AS helpful,
               COUNT(*) FILTER (WHERE helpful = false) AS not_helpful
        FROM kb_article_feedback
        WHERE "submittedAt" >= ${ctx.dateRange.since}
          AND "submittedAt" <= ${ctx.dateRange.until}
        GROUP BY day ORDER BY day
      `;
      const lookup = new Map(rows.map(r => [r.day, { helpful: Number(r.helpful), notHelpful: Number(r.not_helpful) }]));
      const points = fillDateSeries(ctx.dateRange.since, ctx.dateRange.until).map(date => {
        const d = lookup.get(date);
        return { date, helpful: d?.helpful ?? 0, notHelpful: d?.notHelpful ?? 0 };
      });
      return {
        type: "time_series",
        series: [
          { key: "helpful",    label: "Helpful" },
          { key: "notHelpful", label: "Not Helpful" },
        ],
        points,
      };
    },
  },
};

// ── kb.top_articles ───────────────────────────────────────────────────────────

const kbTopArticles: MetricDefinition = {
  id: "kb.top_articles",
  label: "Top Articles by Views",
  description: "Most viewed published articles, ranked by viewCount.",
  domain: "kb",
  supportedVisualizations: ["leaderboard", "table"],
  defaultVisualization: "leaderboard",

  computeFor: {
    async leaderboard(ctx) {
      const limit = ctx.limit ?? 10;
      interface Row { id: number; title: string; view_count: number; helpful: number; not_helpful: number }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT a.id, a.title, a."viewCount" AS view_count,
                a."helpfulCount" AS helpful, a."notHelpfulCount" AS not_helpful
         FROM kb_article a
         WHERE a.status = 'published'
         ORDER BY a."viewCount" DESC LIMIT $1`,
        limit,
      );
      return {
        type: "leaderboard",
        entries: rows.map((r, i) => ({
          rank: i + 1,
          key: String(r.id),
          label: r.title,
          primaryValue: r.view_count,
          columns: { views: r.view_count, helpful: r.helpful, notHelpful: r.not_helpful },
        })),
        columnDefs: [
          { key: "views",      label: "Views",       unit: "count" },
          { key: "helpful",    label: "Helpful",     unit: "count" },
          { key: "notHelpful", label: "Not Helpful", unit: "count" },
        ],
      };
    },
  },
};

// ── kb.most_helpful ───────────────────────────────────────────────────────────

const kbMostHelpful: MetricDefinition = {
  id: "kb.most_helpful",
  label: "Most Helpful Articles",
  description: "Articles ranked by helpful vote ratio (helpfulCount / total votes).",
  domain: "kb",
  supportedVisualizations: ["leaderboard"],
  defaultVisualization: "leaderboard",

  computeFor: {
    async leaderboard(ctx) {
      const limit = ctx.limit ?? 10;
      interface Row { id: number; title: string; helpful: number; not_helpful: number; total: number }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT a.id, a.title,
                a."helpfulCount"    AS helpful,
                a."notHelpfulCount" AS not_helpful,
                (a."helpfulCount" + a."notHelpfulCount") AS total
         FROM kb_article a
         WHERE a.status = 'published'
           AND (a."helpfulCount" + a."notHelpfulCount") > 0
         ORDER BY (a."helpfulCount"::float / (a."helpfulCount" + a."notHelpfulCount")) DESC
         LIMIT $1`,
        limit,
      );
      return {
        type: "leaderboard",
        entries: rows.map((r, i) => {
          const pct = r.total > 0 ? Math.round((r.helpful / r.total) * 100) : 0;
          return {
            rank: i + 1,
            key: String(r.id),
            label: r.title,
            primaryValue: pct,
            columns: { helpfulPct: pct, helpful: r.helpful, total: r.total },
          };
        }),
        columnDefs: [
          { key: "helpfulPct", label: "Helpful %", unit: "percent" },
          { key: "helpful",    label: "Helpful",   unit: "count" },
          { key: "total",      label: "Total Votes", unit: "count" },
        ],
      };
    },
  },
};

// ── kb.articles_published_trend ───────────────────────────────────────────────

const kbPublishedTrend: MetricDefinition = {
  id: "kb.published_trend",
  label: "Articles Published Over Time",
  description: "Number of KB articles published per day in the selected period.",
  domain: "kb",
  unit: "count",
  supportedVisualizations: ["line", "area", "bar"],
  defaultVisualization: "line",

  computeFor: {
    async time_series(ctx) {
      interface Row { day: string; count: bigint }
      const rows = await ctx.db.$queryRaw<Row[]>`
        SELECT TO_CHAR("publishedAt",'YYYY-MM-DD') AS day, COUNT(*) AS count
        FROM kb_article
        WHERE "publishedAt" >= ${ctx.dateRange.since} AND "publishedAt" <= ${ctx.dateRange.until}
          AND status = 'published'
        GROUP BY day ORDER BY day
      `;
      const lookup = new Map(rows.map(r => [r.day, Number(r.count)]));
      const points = fillDateSeries(ctx.dateRange.since, ctx.dateRange.until)
        .map(date => ({ date, articles: lookup.get(date) ?? 0 }));
      return { type: "time_series", series: [{ key: "articles", label: "Published" }], points };
    },
  },
};

// ── Export ────────────────────────────────────────────────────────────────────

export const KB_METRICS: MetricDefinition[] = [
  kbArticleCount,
  kbViewCount,
  kbHelpfulRatio,
  kbFeedbackTrend,
  kbTopArticles,
  kbMostHelpful,
  kbPublishedTrend,
];
