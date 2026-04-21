/**
 * server/src/lib/analytics/types.ts
 *
 * Internal TypeScript types for the Analytics Engine.
 * These are server-only — they reference Prisma and raw DB types.
 */
import type prisma from "../../db";

// ── Date range (resolved, with concrete Date objects) ─────────────────────────

export interface ResolvedDateRange {
  since: Date;
  until: Date;
  preset?: string;
}

// ── Filters ───────────────────────────────────────────────────────────────────

export type FilterOp =
  | "eq" | "neq"
  | "in" | "not_in"
  | "gt" | "gte" | "lt" | "lte"
  | "is_null" | "is_not_null";

export interface FilterCondition {
  field: string;
  op:    FilterOp;
  value?: string | number | boolean | string[] | number[];
}

export interface ResolvedFilterSet {
  logic:      "and" | "or";
  conditions: FilterCondition[];
}

/**
 * Maps logical filter-field names to SQL column expressions.
 * Handles the mix of camelCase and snake_case columns across different tables.
 *
 * Examples:
 *   { teamId: '"queueId"', slaBreached: '"slaBreached"' }        // Ticket
 *   { assignedToId: '"assigned_to_id"', isMajor: '"is_major"' }  // Incident
 */
export type FieldMap = Record<string, string>;

// ── Query result types ────────────────────────────────────────────────────────

export interface StatResult {
  type: "stat";
  value: number | null;
  unit?: string;
  label: string;
  sub?: string;
}

export interface StatChangeResult {
  type: "stat_change";
  value: number | null;
  previousValue: number | null;
  changePercent: number | null;
  changeDirection: "up" | "down" | "neutral" | null;
  unit?: string;
  label: string;
  sub?: string;
}

export interface TimeSeriesPoint {
  date:  string; // YYYY-MM-DD
  [key: string]: string | number | null;
}

export interface SeriesDef {
  key:   string;
  label: string;
}

export interface TimeSeriesResult {
  type:   "time_series";
  series: SeriesDef[];
  points: TimeSeriesPoint[];
}

export interface GroupedCountItem {
  key:   string;
  label: string;
  value: number;
  [col: string]: string | number | null;
}

export interface GroupedCountResult {
  type:  "grouped_count";
  items: GroupedCountItem[];
  total: number;
}

export interface DistributionBucket {
  bucket: string;
  label:  string;
  count:  number;
  sort:   number;
}

export interface DistributionResult {
  type:    "distribution";
  buckets: DistributionBucket[];
}

export interface LeaderboardEntry {
  rank:         number;
  key:          string;
  label:        string;
  primaryValue: number;
  columns:      Record<string, string | number | null>;
}

export interface ColumnDef {
  key:      string;
  label:    string;
  unit?:    string;
  sortable?: boolean;
}

export interface LeaderboardResult {
  type:       "leaderboard";
  entries:    LeaderboardEntry[];
  columnDefs: ColumnDef[];
}

export interface TableRow {
  [key: string]: string | number | boolean | null;
}

export interface TableResult {
  type:       "table";
  rows:       TableRow[];
  columnDefs: ColumnDef[];
  total:      number;
}

export interface DrillDownRecord {
  id: number | string;
  [key: string]: string | number | boolean | null;
}

export interface DrillDownResult {
  type:     "drill_down";
  records:  DrillDownRecord[];
  total:    number;
  page:     number;
  pageSize: number;
}

export type QueryResult =
  | StatResult
  | StatChangeResult
  | TimeSeriesResult
  | GroupedCountResult
  | DistributionResult
  | LeaderboardResult
  | TableResult
  | DrillDownResult;

// ── Compute context ───────────────────────────────────────────────────────────

export interface ComputeContext {
  db:            typeof prisma;
  dateRange:     ResolvedDateRange;
  comparison?:   ResolvedDateRange;
  filters:       ResolvedFilterSet;
  groupBy?:      string;
  sort?:         { field: string; direction: "asc" | "desc" };
  limit:         number;
  visualization: string;
}

// Per-result-type compute functions (a metric only needs to implement the types it supports)
export interface ComputeFunctions {
  stat?:          (ctx: ComputeContext) => Promise<StatResult | StatChangeResult>;
  time_series?:   (ctx: ComputeContext) => Promise<TimeSeriesResult>;
  grouped_count?: (ctx: ComputeContext) => Promise<GroupedCountResult>;
  distribution?:  (ctx: ComputeContext) => Promise<DistributionResult>;
  leaderboard?:   (ctx: ComputeContext) => Promise<LeaderboardResult>;
  table?:         (ctx: ComputeContext) => Promise<TableResult>;
  drill_down?:    (ctx: ComputeContext) => Promise<DrillDownResult>;
}

// ── Metric definition ─────────────────────────────────────────────────────────

export interface FilterFieldDef {
  key:      string;
  label:    string;
  type:     "enum" | "id" | "boolean" | "date" | "number";
  options?: { value: string; label: string }[];
}

export interface MetricDefinition {
  /** Dot-namespaced identifier, e.g. "tickets.volume". */
  id: string;
  label: string;
  description: string;
  /** Domain this metric belongs to. */
  domain: "tickets" | "incidents" | "requests" | "problems" | "changes" | "approvals" | "csat" | "agents" | "teams" | "kb" | "realtime" | "assets";
  unit?:  "count" | "percent" | "seconds" | "days" | "score" | "hours";

  /** Visualisations this metric can produce. */
  supportedVisualizations: string[];
  /** The default visualisation when caller does not specify one. */
  defaultVisualization: string;
  /** Grouping dimensions available for grouped_count results. */
  supportedGroupBys?: string[];
  /** Filter fields the metric understands. */
  filterFields?: FilterFieldDef[];

  computeFor: ComputeFunctions;
}

// ── Engine response envelope ──────────────────────────────────────────────────

export interface AnalyticsQueryResponse {
  metricId:    string;
  label:       string;
  domain:      string;
  unit?:       string;
  resultType:  string;
  visualization: string;
  dateRange: {
    since: string; // YYYY-MM-DD
    until: string;
  };
  result: QueryResult;
}

export interface BatchQueryResponse {
  results: Record<string, AnalyticsQueryResponse | { error: string }>;
}

// ── Engine errors ─────────────────────────────────────────────────────────────

export class AnalyticsError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "UNKNOWN_METRIC"
      | "UNSUPPORTED_VIZ"
      | "INVALID_FILTER"
      | "QUERY_FAILED" = "QUERY_FAILED",
  ) {
    super(message);
    this.name = "AnalyticsError";
  }
}
