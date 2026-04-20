/**
 * Analytics execution engine.
 *
 * Resolves a query request into a typed result by:
 *   1. Looking up the metric from the registry.
 *   2. Deriving the ResultType from the requested visualisation.
 *   3. Building a ComputeContext and calling the matching computeFor handler.
 *   4. Wrapping the raw result in an AnalyticsQueryResponse envelope.
 *
 * Supports single queries and batch queries (up to 30 per batch).
 */
import type prisma from "../../db";
import type {
  AnalyticsQueryResponse,
  BatchQueryResponse,
  ComputeContext,
  QueryResult,
} from "./types";
import { AnalyticsError } from "./types";
import { resolveDateRange, resolveComparisonRange } from "./date";
import { getMetric } from "./registry";
import type {
  AnalyticsQueryRequest,
  BatchQueryRequest,
  FilterSet,
} from "core/schemas/analytics.ts";
import { VIZ_TO_RESULT_TYPE } from "core/schemas/analytics.ts";

// ── Single query ──────────────────────────────────────────────────────────────

export async function runQuery(
  db: typeof prisma,
  req: AnalyticsQueryRequest,
): Promise<AnalyticsQueryResponse> {
  const metric = getMetric(req.metricId);
  if (!metric) throw new AnalyticsError(`Unknown metric: ${req.metricId}`, "UNKNOWN_METRIC");

  const viz = req.visualization ?? metric.defaultVisualization;
  if (!metric.supportedVisualizations.includes(viz)) {
    throw new AnalyticsError(
      `Metric ${req.metricId} does not support visualisation ${viz}`,
      "UNSUPPORTED_VIZ",
    );
  }

  const resultType = VIZ_TO_RESULT_TYPE[viz as keyof typeof VIZ_TO_RESULT_TYPE];
  if (!resultType) throw new AnalyticsError(`No result type for viz ${viz}`, "UNSUPPORTED_VIZ");

  const computeFn = metric.computeFor[resultType as keyof typeof metric.computeFor];
  if (!computeFn) {
    throw new AnalyticsError(
      `Metric ${req.metricId} has no compute handler for result type ${resultType}`,
      "UNSUPPORTED_VIZ",
    );
  }

  const dateRange  = resolveDateRange(req.dateRange);
  const comparison = req.compareWithPrevious ? resolveComparisonRange(dateRange) : undefined;

  const ctx: ComputeContext = {
    db,
    dateRange,
    comparison,
    filters: req.filters ?? { logic: "and", conditions: [] },
    groupBy: req.groupBy,
    sort: req.sort,
    limit: req.limit,
    visualization: viz,
  };

  const result: QueryResult = await (computeFn as (ctx: ComputeContext) => Promise<QueryResult>)(ctx);

  return {
    metricId:      metric.id,
    label:         metric.label,
    domain:        metric.domain,
    unit:          metric.unit,
    resultType,
    visualization: viz,
    dateRange: {
      since: dateRange.since.toISOString().slice(0, 10),
      until: dateRange.until.toISOString().slice(0, 10),
    },
    result,
  };
}

// ── Batch query ───────────────────────────────────────────────────────────────

export async function runBatch(
  db: typeof prisma,
  req: BatchQueryRequest,
): Promise<BatchQueryResponse> {
  const results: BatchQueryResponse["results"] = {};

  // Resolve shared overrides
  const sharedDateRange = req.sharedDateRange;
  const sharedFilters   = req.sharedFilters;

  await Promise.all(
    req.queries.map(async item => {
      const mergedReq: AnalyticsQueryRequest = {
        ...item,
        dateRange: sharedDateRange ?? item.dateRange,
        filters:   sharedFilters
          ? mergeFilterSets(sharedFilters, item.filters)
          : item.filters,
      };
      try {
        results[item.widgetId] = await runQuery(db, mergedReq);
      } catch (err) {
        results[item.widgetId] = {
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  return { results };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mergeFilterSets(a: FilterSet, b: FilterSet | undefined): FilterSet {
  if (!b) return a;
  return {
    logic: "and",
    conditions: [...(a.conditions ?? []), ...(b.conditions ?? [])],
  };
}
