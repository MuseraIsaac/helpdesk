/**
 * Client-side TypeScript types for the analytics engine API responses.
 * Mirror the server's AnalyticsQueryResponse / BatchQueryResponse shapes.
 */

// ── Result types ──────────────────────────────────────────────────────────────

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
  date: string;
  [key: string]: string | number | null;
}

export interface SeriesDef {
  key: string;
  label: string;
}

export interface TimeSeriesResult {
  type: "time_series";
  series: SeriesDef[];
  points: TimeSeriesPoint[];
}

export interface GroupedCountItem {
  key: string;
  label: string;
  value: number;
  [col: string]: string | number | null;
}

export interface GroupedCountResult {
  type: "grouped_count";
  items: GroupedCountItem[];
  total: number;
}

export interface DistributionBucket {
  bucket: string;
  label: string;
  count: number;
  sort: number;
}

export interface DistributionResult {
  type: "distribution";
  buckets: DistributionBucket[];
}

export interface LeaderboardEntry {
  rank: number;
  key: string;
  label: string;
  primaryValue: number;
  columns: Record<string, string | number | null>;
}

export interface ColumnDef {
  key: string;
  label: string;
  unit?: string;
  sortable?: boolean;
}

export interface LeaderboardResult {
  type: "leaderboard";
  entries: LeaderboardEntry[];
  columnDefs: ColumnDef[];
}

export interface TableRow {
  [key: string]: string | number | boolean | null;
}

export interface TableResult {
  type: "table";
  rows: TableRow[];
  columnDefs: ColumnDef[];
  total: number;
}

export type QueryResult =
  | StatResult
  | StatChangeResult
  | TimeSeriesResult
  | GroupedCountResult
  | DistributionResult
  | LeaderboardResult
  | TableResult;

// ── Response envelopes ────────────────────────────────────────────────────────

export interface AnalyticsQueryResponse {
  metricId: string;
  label: string;
  domain: string;
  unit?: string;
  resultType: string;
  visualization: string;
  dateRange: { since: string; until: string };
  result: QueryResult;
}

export interface BatchQueryResponse {
  results: Record<string, AnalyticsQueryResponse | { error: string }>;
}
