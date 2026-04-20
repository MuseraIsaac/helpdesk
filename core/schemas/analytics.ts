/**
 * core/schemas/analytics.ts
 *
 * Zod schemas for the Analytics Engine API.
 * Shared between client and server — no server-only imports.
 *
 * Hierarchy:
 *   DateRange → FilterSet → WidgetConfig → SavedReportConfig
 *   AnalyticsQueryRequest → (engine) → AnalyticsQueryResponse
 */
import { z } from "zod/v4";

// ── Date range ────────────────────────────────────────────────────────────────

export const DATE_PRESETS = [
  "today",
  "yesterday",
  "last_7_days",
  "last_30_days",
  "last_90_days",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_quarter",
  "last_quarter",
  "this_year",
  "last_year",
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const dateRangeSchema = z.union([
  // Preset shortcut — resolved server-side against request time
  z.object({ preset: z.enum(DATE_PRESETS) }),
  // Explicit range (YYYY-MM-DD)
  z.object({
    preset: z.literal("custom"),
    from:   z.string().regex(ISO_DATE, "from must be YYYY-MM-DD"),
    to:     z.string().regex(ISO_DATE, "to must be YYYY-MM-DD"),
  }),
]);
export type DateRange = z.infer<typeof dateRangeSchema>;

// ── Filters ───────────────────────────────────────────────────────────────────

export const FILTER_OPS = [
  "eq", "neq", "in", "not_in",
  "gt", "gte", "lt", "lte",
  "is_null", "is_not_null",
] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

const filterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.array(z.number()),
]);
export type FilterValue = z.infer<typeof filterValueSchema>;

export const filterConditionSchema = z.object({
  field: z.string().min(1),
  op:    z.enum(FILTER_OPS),
  value: filterValueSchema.optional(),
});
export type FilterCondition = z.infer<typeof filterConditionSchema>;

export const filterSetSchema = z.object({
  logic:      z.enum(["and", "or"]).default("and"),
  conditions: z.array(filterConditionSchema).default([]),
});
export type FilterSet = z.infer<typeof filterSetSchema>;

// ── Result & visualisation types ──────────────────────────────────────────────

export const RESULT_TYPES = [
  "stat",
  "stat_change",
  "time_series",
  "grouped_count",
  "distribution",
  "leaderboard",
  "table",
  "drill_down",
] as const;
export type ResultType = (typeof RESULT_TYPES)[number];

export const VISUALIZATION_TYPES = [
  "number",
  "number_change",
  "gauge",
  "line",
  "area",
  "bar",
  "bar_horizontal",
  "stacked_bar",
  "donut",
  "histogram",
  "leaderboard",
  "table",
] as const;
export type VisualizationType = (typeof VISUALIZATION_TYPES)[number];

/** Maps each visualisation to the result type it needs. */
export const VIZ_TO_RESULT_TYPE: Record<VisualizationType, ResultType> = {
  number:         "stat",
  number_change:  "stat_change",
  gauge:          "stat",
  line:           "time_series",
  area:           "time_series",
  bar:            "grouped_count",
  bar_horizontal: "grouped_count",
  stacked_bar:    "grouped_count",
  donut:          "grouped_count",
  histogram:      "distribution",
  leaderboard:    "leaderboard",
  table:          "table",
};

// ── Analytics query request / response ───────────────────────────────────────

export const analyticsQuerySchema = z.object({
  metricId:            z.string().min(1),
  dateRange:           dateRangeSchema,
  filters:             filterSetSchema.optional(),
  groupBy:             z.string().optional(),
  visualization:       z.enum(VISUALIZATION_TYPES).optional(),
  sort: z.object({
    field:     z.string(),
    direction: z.enum(["asc", "desc"]),
  }).optional(),
  limit:               z.number().int().min(1).max(1000).default(50),
  compareWithPrevious: z.boolean().default(false),
});
export type AnalyticsQueryRequest = z.infer<typeof analyticsQuerySchema>;

export const batchQueryItemSchema = analyticsQuerySchema.extend({
  widgetId: z.string().min(1),
});
export type BatchQueryItem = z.infer<typeof batchQueryItemSchema>;

export const batchQuerySchema = z.object({
  queries:          z.array(batchQueryItemSchema).min(1).max(30),
  sharedDateRange:  dateRangeSchema.optional(),
  sharedFilters:    filterSetSchema.optional(),
});
export type BatchQueryRequest = z.infer<typeof batchQuerySchema>;

// ── Saved report config ───────────────────────────────────────────────────────

export const widgetConfigSchema = z.object({
  id:                  z.string().min(1),       // widget instance UUID
  metricId:            z.string().min(1),
  title:               z.string().max(120).optional(),
  visualization:       z.enum(VISUALIZATION_TYPES),
  filters:             filterSetSchema.optional(),
  groupBy:             z.string().optional(),
  sort: z.object({
    field:     z.string(),
    direction: z.enum(["asc", "desc"]),
  }).optional(),
  limit:               z.number().int().min(1).max(100).default(10),
  compareWithPrevious: z.boolean().default(false),
  // Grid layout
  x: z.number().int().min(0).default(0),
  y: z.number().int().min(0).default(0),
  w: z.number().int().min(1).max(12).default(4),
  h: z.number().int().min(1).max(10).default(3),
});
export type WidgetConfig = z.infer<typeof widgetConfigSchema>;

export const savedReportConfigSchema = z.object({
  dateRange: dateRangeSchema,
  filters:   filterSetSchema.optional(),
  widgets:   z.array(widgetConfigSchema),
  layout:    z.enum(["grid", "flow"]).default("grid"),
});
export type SavedReportConfig = z.infer<typeof savedReportConfigSchema>;

export const REPORT_VISIBILITY = ["private", "team", "org"] as const;
export type ReportVisibility = (typeof REPORT_VISIBILITY)[number];

export const createSavedReportSchema = z.object({
  name:            z.string().min(1).max(100),
  description:     z.string().max(500).optional(),
  config:          savedReportConfigSchema,
  visibility:      z.enum(REPORT_VISIBILITY).default("private"),
  visibilityTeamId: z.number().int().positive().optional(),
});

export const updateSavedReportSchema = z.object({
  name:            z.string().min(1).max(100).optional(),
  description:     z.string().max(500).nullable().optional(),
  config:          savedReportConfigSchema.optional(),
  visibility:      z.enum(REPORT_VISIBILITY).optional(),
  visibilityTeamId: z.number().int().positive().nullable().optional(),
  isStarred:       z.boolean().optional(),
});

// ── Filter preset ─────────────────────────────────────────────────────────────

export const createFilterPresetSchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  domain:      z.string().min(1),
  filters:     filterSetSchema,
  isShared:    z.boolean().default(false),
});

export const updateFilterPresetSchema = z.object({
  name:        z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  filters:     filterSetSchema.optional(),
  isShared:    z.boolean().optional(),
});

// ── Report schedule ───────────────────────────────────────────────────────────

export const EXPORT_FORMATS = ["csv", "xlsx"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

const CRON_RE = /^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)$/;

export const createReportScheduleSchema = z.object({
  reportId:   z.string().min(1),
  name:       z.string().max(100).optional(),
  cronExpr:   z.string().regex(CRON_RE, "Invalid cron expression"),
  timezone:   z.string().default("UTC"),
  format:     z.enum(EXPORT_FORMATS).default("csv"),
  recipients: z.array(z.string().email()).min(1).max(20),
  isActive:   z.boolean().default(true),
});

export const updateReportScheduleSchema = z.object({
  name:       z.string().max(100).optional(),
  cronExpr:   z.string().regex(CRON_RE, "Invalid cron expression").optional(),
  timezone:   z.string().optional(),
  format:     z.enum(EXPORT_FORMATS).optional(),
  recipients: z.array(z.string().email()).min(1).max(20).optional(),
  isActive:   z.boolean().optional(),
});

// ── Export request ────────────────────────────────────────────────────────────

export const exportRequestSchema = z.object({
  reportId:  z.string().optional(),
  metricId:  z.string().optional(),
  dateRange: dateRangeSchema,
  filters:   filterSetSchema.optional(),
  widgets:   z.array(z.string()).optional(), // subset of widget IDs to export
  format:    z.enum(EXPORT_FORMATS).default("csv"),
  filename:  z.string().max(100).optional(),
});
export type ExportRequest = z.infer<typeof exportRequestSchema>;
