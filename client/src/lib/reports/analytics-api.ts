/**
 * Type-safe client functions for the analytics engine API.
 * Every function maps 1-to-1 to a server endpoint.
 */
import axios from "axios";
import type {
  AnalyticsQueryResponse,
  BatchQueryResponse,
} from "./analytics-types";

// ── Single query ──────────────────────────────────────────────────────────────

export interface QueryParams {
  metricId: string;
  dateRange: { preset: string } | { preset: "custom"; from: string; to: string };
  filters?: { logic: "and" | "or"; conditions: unknown[] };
  groupBy?: string;
  visualization?: string;
  sort?: { field: string; direction: "asc" | "desc" };
  limit?: number;
  compareWithPrevious?: boolean;
}

export async function runQuery(params: QueryParams): Promise<AnalyticsQueryResponse> {
  const { data } = await axios.post<AnalyticsQueryResponse>("/api/analytics/query", {
    ...params,
    limit: params.limit ?? 50,
    compareWithPrevious: params.compareWithPrevious ?? false,
  });
  return data;
}

// ── Batch query ───────────────────────────────────────────────────────────────

export interface BatchItem extends QueryParams {
  widgetId: string;
}

export async function runBatch(
  queries: BatchItem[],
  shared?: { dateRange?: QueryParams["dateRange"] },
): Promise<BatchQueryResponse> {
  const { data } = await axios.post<BatchQueryResponse>("/api/analytics/batch", {
    queries: queries.map(q => ({ ...q, limit: q.limit ?? 50, compareWithPrevious: q.compareWithPrevious ?? false })),
    sharedDateRange: shared?.dateRange,
  });
  return data;
}

// ── Metric catalog ────────────────────────────────────────────────────────────

export interface MetricMeta {
  id: string;
  label: string;
  description: string;
  domain: string;
  unit?: string;
  supportedVisualizations: string[];
  defaultVisualization: string;
  supportedGroupBys?: string[];
}

export async function listMetrics(domain?: string): Promise<MetricMeta[]> {
  const { data } = await axios.get<{ metrics: MetricMeta[] }>(
    "/api/analytics/metrics",
    { params: domain ? { domain } : undefined },
  );
  return data.metrics;
}

// ── Saved reports ─────────────────────────────────────────────────────────────

export interface SavedReportMeta {
  id: number;
  name: string;
  description?: string;
  visibility: string;
  isCurated: boolean;
  ownerId: string;
  teamId?: number;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; name: string };
}

export interface SavedReportDetail extends SavedReportMeta {
  config: ReportConfig;
  schedules: { id: number; name?: string; cronExpr: string; isActive: boolean; nextRunAt?: string }[];
}

export interface ReportConfig {
  dateRange: QueryParams["dateRange"];
  filters?: QueryParams["filters"];
  widgets: WidgetLayout[];
  layout: "grid" | "flow";
}

export interface WidgetLayout {
  id: string;
  metricId: string;
  title?: string;
  visualization: string;
  /** Per-widget date range override; canvas-level dateRange is used if absent. */
  dateRange?: QueryParams["dateRange"];
  filters?: QueryParams["filters"];
  groupBy?: string;
  sort?: { field: string; direction: "asc" | "desc" };
  limit: number;
  compareWithPrevious: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

export async function listReports(): Promise<SavedReportMeta[]> {
  const { data } = await axios.get<{ reports: SavedReportMeta[] }>("/api/analytics/reports");
  return data.reports;
}

export async function getReport(id: number): Promise<SavedReportDetail> {
  const { data } = await axios.get<{ report: SavedReportDetail }>(`/api/analytics/reports/${id}`);
  return data.report;
}

export async function createReport(payload: {
  name: string;
  description?: string;
  config: ReportConfig;
  visibility: string;
  visibilityTeamId?: number;
}): Promise<SavedReportDetail> {
  const { data } = await axios.post<{ report: SavedReportDetail }>("/api/analytics/reports", payload);
  return data.report;
}

export async function updateReport(
  id: number,
  payload: Partial<{
    name: string;
    description: string | null;
    config: ReportConfig;
    visibility: string;
    visibilityTeamId: number | null;
  }>,
): Promise<SavedReportDetail> {
  const { data } = await axios.put<{ report: SavedReportDetail }>(`/api/analytics/reports/${id}`, payload);
  return data.report;
}

export async function deleteReport(id: number): Promise<void> {
  await axios.delete(`/api/analytics/reports/${id}`);
}

// ── Clone report ──────────────────────────────────────────────────────────────

export async function cloneReport(id: number, name?: string): Promise<SavedReportDetail> {
  const { data } = await axios.post<{ report: SavedReportDetail }>(
    `/api/analytics/reports/${id}/clone`,
    name ? { name } : {},
  );
  return data.report;
}

// ── Dashboard templates ───────────────────────────────────────────────────────

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  /** Hex accent colour for the gallery card */
  accentColor?: string;
  /** Gallery filter category */
  category?: string;
  /** Keyword tags displayed as badges */
  tags?: string[];
  /** Mini layout preview rows for the gallery card */
  previewRows?: Array<Array<{ x: number; w: number; label: string; color: string }>>;
  widgets: {
    id: string;
    visible: boolean;
    order: number;
    x: number;
    y: number;
    w: number;
    h: number;
  }[];
  config: { period: number; density: string };
}

export async function listDashboardTemplates(): Promise<DashboardTemplate[]> {
  const { data } = await axios.get<{ templates: DashboardTemplate[] }>("/api/dashboards/templates");
  return data.templates;
}

// ── Export ────────────────────────────────────────────────────────────────────

export async function exportMetric(
  params: QueryParams,
  format: "csv" | "xlsx" = "csv",
): Promise<Blob> {
  const { data } = await axios.post(`/api/analytics/export?format=${format}`, params, {
    responseType: "blob",
  });
  return data as Blob;
}
