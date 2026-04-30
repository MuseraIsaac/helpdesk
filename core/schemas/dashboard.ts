/**
 * core/schemas/dashboard.ts
 *
 * Shared schema for dashboard configuration.
 * Used by both the server (validation) and the client (type safety + system default).
 *
 * To add a new widget:
 *   1. Add its id to WIDGET_IDS
 *   2. Add a WIDGET_META entry with label + description
 *   3. Add a WIDGET_PRESENTATION entry (presentation type label)
 *   4. Add it to WIDGET_CATEGORIES under the right group
 *   5. Add it to WIDGET_LAYOUT_DEFAULTS
 *   6. Add it to SYSTEM_DEFAULT_CONFIG.widgets
 *   7. Handle the new id in renderWidget() in client/src/pages/HomePage.tsx
 *   No DB migration needed — the config JSON is schema-less at the DB level.
 */
import { z } from "zod/v4";

// ── Widget registry ────────────────────────────────────────────────────────────

export const WIDGET_IDS = [
  // ── Service Desk ───────────────────────────────
  "volume",
  "performance",
  "tickets_per_day",
  "breakdowns",
  "by_assignee",
  "channel_breakdown",
  "backlog_trend",
  "top_open_tickets",
  // Atomic split-out of `volume` — single-stat tiles
  "volume_total",
  "volume_open",
  "volume_resolved",
  "volume_escalated",
  "volume_reopened",
  // Atomic split-out of `performance`
  "perf_mtta",
  "perf_mttr",
  "perf_ai_resolution",
  "perf_sla_compliance",
  "perf_sla_breached",
  // Atomic split-out of `breakdowns`
  "breakdown_category",
  "breakdown_priority",
  "breakdown_aging",
  // ── Quality & SLA ──────────────────────────────
  "sla_by_dimension",
  "csat",
  "csat_trend",
  "fcr_rate",
  "resolution_dist",
  // Atomic split-out of `csat`
  "csat_avg_rating",
  "csat_positive_rate",
  "csat_negative_rate",
  "csat_response_rate",
  "csat_distribution",
  "csat_recent",
  // ── Teams & Agents ─────────────────────────────
  "agent_leaderboard",
  // ── ITSM Modules ──────────────────────────────
  "incident_analytics",
  "request_fulfillment",
  "problem_recurrence",
  "approval_turnaround",
  // ── Change Management ─────────────────────────
  "change_analytics",
  // ── Assets & CMDB ────────────────────────────
  "asset_health",
  // ── Knowledge Base ───────────────────────────
  "kb_insights",
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];

export const WIDGET_META: Record<WidgetId, { label: string; description: string }> = {
  // Service Desk
  volume:              { label: "Volume",                    description: "Total, open, resolved, escalated, and reopened ticket counts" },
  performance:         { label: "Performance (MTTA/MTTR)",   description: "MTTA, MTTR, AI resolution rate, and SLA compliance" },
  tickets_per_day:     { label: "Tickets Per Day",           description: "Bar chart of daily ticket volume for the selected period" },
  breakdowns:          { label: "Breakdowns & Aging",        description: "Ticket distribution by category, priority, and open-ticket age buckets" },
  by_assignee:         { label: "By Assignee",               description: "Per-agent ticket load, open count, and open percentage" },
  channel_breakdown:   { label: "Channel Breakdown",         description: "Donut chart of ticket volume split by intake channel (email, portal, agent)" },
  backlog_trend:       { label: "Backlog Trend",             description: "Daily tickets opened vs. closed — shows whether backlog is growing or shrinking" },
  top_open_tickets:    { label: "Oldest Open Tickets",       description: "The 10 longest-waiting open tickets, ranked by age" },
  // Quality & SLA
  sla_by_dimension:    { label: "SLA by Dimension",          description: "SLA compliance broken down by priority, category, and team" },
  csat:                { label: "Customer Satisfaction",     description: "CSAT ratings, distribution, and recent submissions" },
  csat_trend:          { label: "CSAT Trend",                description: "Daily average satisfaction score over the selected period" },
  fcr_rate:            { label: "First Contact Resolution",  description: "Percentage of tickets resolved without the customer needing to follow up" },
  resolution_dist:     { label: "Resolution Time Distribution", description: "Histogram of how long resolved tickets take — reveals speed and outliers" },
  // Teams & Agents
  agent_leaderboard:   { label: "Agent Leaderboard",         description: "Agents ranked by tickets resolved, with avg resolution time and SLA compliance" },
  // ITSM Modules
  incident_analytics:  { label: "Incident Analytics",        description: "Incident volume, MTTA, MTTR, and breakdown by status and priority" },
  request_fulfillment: { label: "Request Fulfillment",       description: "Service request volumes, avg fulfillment time, and top catalog items" },
  problem_recurrence:  { label: "Problem Recurrence",        description: "Problem status, known errors, and recurring-incident clusters" },
  approval_turnaround: { label: "Approval Turnaround",       description: "Approval queue size, avg decision time, and oldest pending items" },
  // Change Management
  change_analytics:    { label: "Change Analytics",          description: "Change volume, success rate, emergency changes, and breakdown by type, state, and risk" },
  // Assets & CMDB
  asset_health:        { label: "Asset Health",              description: "Asset inventory totals — active, in stock, under maintenance — with type and status distribution" },
  // Knowledge Base
  kb_insights:         { label: "Knowledge Base Insights",   description: "KB search volume, zero-result rate, and top search terms" },

  // ── Atomic volume tiles (split from `volume`) ────────────────────────────
  volume_total:        { label: "Total Tickets",       description: "Total non-system tickets in the selected period" },
  volume_open:         { label: "Open Tickets",        description: "Tickets currently awaiting agent response" },
  volume_resolved:     { label: "Resolved Tickets",    description: "Tickets marked resolved or closed" },
  volume_escalated:    { label: "Escalated Tickets",   description: "Tickets that were escalated at any point" },
  volume_reopened:     { label: "Reopened Tickets",    description: "Resolved tickets that returned to open after a customer reply" },

  // ── Atomic performance tiles (split from `performance`) ─────────────────
  perf_mtta:           { label: "MTTA",                description: "Mean Time To Acknowledge — avg time from creation to first agent reply" },
  perf_mttr:           { label: "MTTR",                description: "Mean Time To Resolve — avg time from creation to resolution" },
  perf_ai_resolution:  { label: "AI Resolution Rate",  description: "Percentage of resolved tickets handled entirely by the AI agent" },
  perf_sla_compliance: { label: "SLA Compliance",      description: "% of SLA-tracked tickets resolved within deadline" },
  perf_sla_breached:   { label: "SLA Breached",        description: "Tickets that exceeded their SLA resolution deadline" },

  // ── Atomic breakdown charts (split from `breakdowns`) ───────────────────
  breakdown_category:  { label: "By Category",         description: "Ticket distribution by category — click a bar to filter" },
  breakdown_priority:  { label: "By Priority",         description: "Ticket distribution by priority — click a bar to filter" },
  breakdown_aging:     { label: "Ticket Aging",        description: "Currently open tickets bucketed by age" },

  // ── Atomic CSAT tiles & cards (split from `csat`) ───────────────────────
  csat_avg_rating:     { label: "CSAT — Avg Rating",   description: "Average CSAT score across all submitted ratings" },
  csat_positive_rate:  { label: "CSAT — Positive %",   description: "Percentage of ratings that were 4★ or 5★" },
  csat_negative_rate:  { label: "CSAT — Negative %",   description: "Percentage of ratings that were 1★ or 2★" },
  csat_response_rate:  { label: "CSAT — Response %",   description: "Percentage of resolved tickets that received a rating" },
  csat_distribution:   { label: "CSAT Rating Distribution", description: "Star-rating breakdown across all CSAT submissions" },
  csat_recent:         { label: "CSAT Recent Ratings", description: "Most recent CSAT submissions with comments" },
};

/** Human-readable presentation type shown in the widget picker */
export const WIDGET_PRESENTATION: Record<WidgetId, string> = {
  volume:              "stat cards",
  performance:         "stat cards",
  tickets_per_day:     "bar chart",
  breakdowns:          "horizontal bar",
  by_assignee:         "table",
  channel_breakdown:   "donut chart",
  backlog_trend:       "area chart",
  top_open_tickets:    "table",
  sla_by_dimension:    "table",
  csat:                "stat + table",
  csat_trend:          "line chart",
  fcr_rate:            "stat + progress",
  resolution_dist:     "histogram",
  agent_leaderboard:   "leaderboard",
  incident_analytics:  "stat + bar chart",
  request_fulfillment: "stat + table",
  problem_recurrence:  "stat + progress",
  approval_turnaround: "stat + table",
  change_analytics:    "stat + donut chart",
  asset_health:        "stat + donut chart",
  kb_insights:         "stat + table",
  // Atomic volume tiles
  volume_total:        "stat",
  volume_open:         "stat",
  volume_resolved:     "stat",
  volume_escalated:    "stat",
  volume_reopened:     "stat",
  // Atomic performance tiles
  perf_mtta:           "stat",
  perf_mttr:           "stat",
  perf_ai_resolution:  "stat",
  perf_sla_compliance: "stat",
  perf_sla_breached:   "stat",
  // Atomic breakdown charts
  breakdown_category:  "horizontal bar chart",
  breakdown_priority:  "horizontal bar chart",
  breakdown_aging:     "horizontal bar chart",
  // Atomic CSAT
  csat_avg_rating:     "stat",
  csat_positive_rate:  "stat",
  csat_negative_rate:  "stat",
  csat_response_rate:  "stat",
  csat_distribution:   "rating bars",
  csat_recent:         "list",
};

/** Widget groups for the widget picker UI */
export const WIDGET_CATEGORIES: { label: string; ids: WidgetId[] }[] = [
  {
    label: "Service Desk",
    ids: [
      "volume_total", "volume_open", "volume_resolved", "volume_escalated", "volume_reopened",
      "tickets_per_day", "by_assignee", "channel_breakdown", "backlog_trend", "top_open_tickets",
      "breakdown_category", "breakdown_priority", "breakdown_aging",
    ],
  },
  {
    label: "Performance",
    ids: ["perf_mtta", "perf_mttr", "perf_ai_resolution", "perf_sla_compliance", "perf_sla_breached"],
  },
  {
    label: "Quality & SLA",
    ids: ["sla_by_dimension", "csat_trend", "fcr_rate", "resolution_dist"],
  },
  {
    label: "CSAT Tiles & Cards",
    ids: ["csat_avg_rating", "csat_positive_rate", "csat_negative_rate", "csat_response_rate", "csat_distribution", "csat_recent"],
  },
  {
    label: "Teams & Agents",
    ids: ["agent_leaderboard"],
  },
  {
    label: "ITSM Modules",
    ids: ["incident_analytics", "request_fulfillment", "problem_recurrence", "approval_turnaround"],
  },
  {
    label: "Change Management",
    ids: ["change_analytics"],
  },
  {
    label: "Assets & CMDB",
    ids: ["asset_health"],
  },
  {
    label: "Knowledge Base",
    ids: ["kb_insights"],
  },
];

// ── Widget layout defaults ─────────────────────────────────────────────────────
//
// x/w/h define the initial grid position for each widget.
// y is omitted — react-grid-layout's vertical compaction places items
// automatically based on their x and the array order in the config.
// minW/minH constrain resize operations.
//
// Grid is 12 columns wide. rowHeight is set per density in HomePage.

export const WIDGET_LAYOUT_DEFAULTS: Record<
  WidgetId,
  { x: number; w: number; h: number; minW: number; minH: number }
> = {
  volume:              { x: 0, w: 12, h: 3, minW: 4,  minH: 2 },
  performance:         { x: 0, w: 12, h: 3, minW: 4,  minH: 2 },
  tickets_per_day:     { x: 0, w:  6, h: 4, minW: 3,  minH: 3 },
  by_assignee:         { x: 6, w:  6, h: 4, minW: 3,  minH: 3 },
  breakdowns:          { x: 0, w: 12, h: 5, minW: 6,  minH: 4 },
  channel_breakdown:   { x: 0, w:  4, h: 5, minW: 3,  minH: 3 },
  backlog_trend:       { x: 4, w:  8, h: 5, minW: 4,  minH: 3 },
  top_open_tickets:    { x: 0, w:  8, h: 5, minW: 4,  minH: 3 },
  sla_by_dimension:    { x: 0, w:  6, h: 5, minW: 4,  minH: 3 },
  csat_trend:          { x: 6, w:  6, h: 5, minW: 3,  minH: 3 },
  csat:                { x: 0, w: 12, h: 7, minW: 6,  minH: 5 },
  fcr_rate:            { x: 4, w:  4, h: 4, minW: 3,  minH: 3 },
  resolution_dist:     { x: 0, w:  6, h: 5, minW: 4,  minH: 3 },
  agent_leaderboard:   { x: 6, w:  6, h: 5, minW: 3,  minH: 3 },
  incident_analytics:  { x: 0, w: 12, h: 8, minW: 6,  minH: 5 },
  request_fulfillment: { x: 0, w:  6, h: 6, minW: 4,  minH: 4 },
  problem_recurrence:  { x: 6, w:  6, h: 6, minW: 4,  minH: 4 },
  approval_turnaround: { x: 0, w:  6, h: 6, minW: 4,  minH: 4 },
  change_analytics:    { x: 0, w: 12, h: 8, minW: 6,  minH: 5 },
  asset_health:        { x: 0, w: 12, h: 8, minW: 6,  minH: 5 },
  kb_insights:         { x: 0, w:  6, h: 6, minW: 4,  minH: 4 },
  // Atomic stat tiles — small by default (3 wide × 2 tall on the 12-col grid)
  volume_total:        { x: 0, w: 3, h: 2, minW: 2, minH: 2 },
  volume_open:         { x: 3, w: 3, h: 2, minW: 2, minH: 2 },
  volume_resolved:     { x: 6, w: 3, h: 2, minW: 2, minH: 2 },
  volume_escalated:    { x: 9, w: 3, h: 2, minW: 2, minH: 2 },
  volume_reopened:     { x: 0, w: 3, h: 2, minW: 2, minH: 2 },
  perf_mtta:           { x: 0, w: 3, h: 2, minW: 2, minH: 2 },
  perf_mttr:           { x: 3, w: 3, h: 2, minW: 2, minH: 2 },
  perf_ai_resolution:  { x: 6, w: 3, h: 2, minW: 2, minH: 2 },
  perf_sla_compliance: { x: 9, w: 3, h: 2, minW: 2, minH: 2 },
  perf_sla_breached:   { x: 0, w: 3, h: 2, minW: 2, minH: 2 },
  // Breakdown charts — wider, mid-tall
  breakdown_category:  { x: 0, w: 4, h: 4, minW: 3, minH: 3 },
  breakdown_priority:  { x: 4, w: 4, h: 4, minW: 3, minH: 3 },
  breakdown_aging:     { x: 8, w: 4, h: 4, minW: 3, minH: 3 },
  // CSAT tiles + composite sub-cards
  csat_avg_rating:     { x: 0, w: 3, h: 2, minW: 2, minH: 2 },
  csat_positive_rate:  { x: 3, w: 3, h: 2, minW: 2, minH: 2 },
  csat_negative_rate:  { x: 6, w: 3, h: 2, minW: 2, minH: 2 },
  csat_response_rate:  { x: 9, w: 3, h: 2, minW: 2, minH: 2 },
  csat_distribution:   { x: 0, w: 6, h: 4, minW: 4, minH: 3 },
  csat_recent:         { x: 6, w: 6, h: 4, minW: 4, minH: 3 },
};

// ── Widget appearance / customisation ────────────────────────────────────────

/** A single colour threshold rule: "if <metric> <op> <value> → use <color>" */
export const widgetThresholdSchema = z.object({
  metric:   z.string().max(60),
  operator: z.enum(["gt", "lt", "gte", "lte", "eq"]),
  value:    z.number(),
  color:    z.string().regex(/^#[0-9a-fA-F]{6}$/),
  label:    z.string().max(40).optional(),
});

export const widgetAppearanceSchema = z.object({
  /** Hex accent colour applied to the widget header icon and border hint */
  accentColor:   z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  /** Override the default chart/vis type for this widget */
  chartType:     z.enum(["default", "bar", "line", "area", "pie", "heatmap"]).optional(),
  /** Up to 8 numeric threshold rules that recolour metric values */
  thresholds:    z.array(widgetThresholdSchema).max(8).optional(),
  /** Optional display name override shown in the widget header */
  titleOverride: z.string().max(80).optional(),
  /** Content scale (zoom) for the widget body — scales icons and text together. 1 = default. */
  scale:         z.number().min(0.2).max(1.6).optional(),
});

export type WidgetThreshold = z.infer<typeof widgetThresholdSchema>;
export type WidgetAppearance = z.infer<typeof widgetAppearanceSchema>;

// ── Zod schemas ────────────────────────────────────────────────────────────────

export const widgetConfigSchema = z.object({
  id:      z.enum(WIDGET_IDS),
  visible: z.boolean(),
  order:   z.number().int().min(0),
  // Grid layout — optional for backwards compat with configs saved before the grid
  x: z.number().int().min(0).optional(),
  y: z.number().int().min(0).optional(),
  w: z.number().int().min(1).max(12).optional(),
  h: z.number().int().min(1).optional(),
  /** Per-widget visual customisation — colours, chart type, thresholds */
  appearance: widgetAppearanceSchema.optional(),
});

export const dashboardConfigDataSchema = z.object({
  period:     z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30),
  /** ISO date string YYYY-MM-DD. When set with customTo, overrides `period`. */
  customFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** ISO date string YYYY-MM-DD. When set with customFrom, overrides `period`. */
  customTo:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  density:    z.enum(["comfortable", "compact"]).default("comfortable"),
  widgets:    z.array(widgetConfigSchema),
});

export const createDashboardSchema = z.object({
  name:             z.string().min(1).max(100),
  description:      z.string().max(500).optional(),
  config:           dashboardConfigDataSchema,
  setAsDefault:     z.boolean().default(false),
  isShared:         z.boolean().default(false),
  visibilityTeamId: z.number().int().positive().optional(),
});

export const updateDashboardSchema = z.object({
  name:             z.string().min(1).max(100).optional(),
  description:      z.string().max(500).nullable().optional(),
  config:           dashboardConfigDataSchema.optional(),
  isShared:         z.boolean().optional(),
  visibilityTeamId: z.number().int().positive().nullable().optional(),
});

export const cloneDashboardSchema = z.object({
  name:        z.string().min(1).max(100).optional(),
  setAsDefault: z.boolean().default(false),
});

// ── Types ──────────────────────────────────────────────────────────────────────

export type WidgetConfig         = z.infer<typeof widgetConfigSchema>;
export type DashboardConfigData  = z.infer<typeof dashboardConfigDataSchema>;
export type CreateDashboardInput = z.infer<typeof createDashboardSchema>;
export type UpdateDashboardInput = z.infer<typeof updateDashboardSchema>;
export type CloneDashboardInput  = z.infer<typeof cloneDashboardSchema>;

// ── System default ─────────────────────────────────────────────────────────────

/**
 * The built-in baseline layout that all users start with.
 * Used when a user has no saved personal dashboard.
 * Not stored in the DB — always derived from this constant.
 *
 * Layout philosophy — top-to-bottom service-desk story:
 *   Row 1  (h=2)  ── Volume snapshot:         total · open · resolved · escalated
 *   Row 2  (h=2)  ── Performance snapshot:    MTTA · MTTR · SLA compliance · SLA breached
 *   Row 3  (h=5)  ── Trends:                  tickets per day · agent leaderboard
 *   Row 4  (h=5)  ── What & where:            category · priority · aging
 *   Row 5  (h=2)  ── Customer satisfaction:   avg rating · positive · negative · response rate
 *   Row 6  (h=5)  ── Quality deep-dives:      SLA by dimension · CSAT distribution
 *
 * Total height: ~21 rows. Tells a coherent story without overwhelming.
 * Less-essential ITSM-module widgets stay registered but hidden so they can
 * be toggled on with one click in the customizer.
 */
export const SYSTEM_DEFAULT_CONFIG: DashboardConfigData = {
  period:  30,
  density: "comfortable",
  widgets: [
    // ── Row 1 — Volume snapshot (4 stat tiles, full-width row, h=2) ──────────
    { id: "volume_total",        visible: true,  order: 0,  x: 0, y:  0, w: 3, h: 2 },
    { id: "volume_open",         visible: true,  order: 1,  x: 3, y:  0, w: 3, h: 2 },
    { id: "volume_resolved",     visible: true,  order: 2,  x: 6, y:  0, w: 3, h: 2 },
    { id: "volume_escalated",    visible: true,  order: 3,  x: 9, y:  0, w: 3, h: 2 },

    // ── Row 2 — Performance snapshot (4 stat tiles, full-width row, h=2) ────
    { id: "perf_mtta",           visible: true,  order: 4,  x: 0, y:  2, w: 3, h: 2 },
    { id: "perf_mttr",           visible: true,  order: 5,  x: 3, y:  2, w: 3, h: 2 },
    { id: "perf_sla_compliance", visible: true,  order: 6,  x: 6, y:  2, w: 3, h: 2 },
    { id: "perf_sla_breached",   visible: true,  order: 7,  x: 9, y:  2, w: 3, h: 2 },

    // ── Row 3 — Trend + leaderboard ─────────────────────────────────────────
    { id: "tickets_per_day",     visible: true,  order: 8,  x: 0, y:  4, w: 7, h: 4 },
    { id: "agent_leaderboard",   visible: true,  order: 9,  x: 7, y:  4, w: 5, h: 4 },

    // ── Row 4 — Category / priority / aging breakdowns ──────────────────────
    { id: "breakdown_category",  visible: true,  order: 10, x: 0, y:  8, w: 4, h: 4 },
    { id: "breakdown_priority",  visible: true,  order: 11, x: 4, y:  8, w: 4, h: 4 },
    { id: "breakdown_aging",     visible: true,  order: 12, x: 8, y:  8, w: 4, h: 4 },

    // ── Row 5 — Customer satisfaction stat tiles ────────────────────────────
    { id: "csat_avg_rating",     visible: true,  order: 13, x: 0, y: 12, w: 3, h: 2 },
    { id: "csat_positive_rate",  visible: true,  order: 14, x: 3, y: 12, w: 3, h: 2 },
    { id: "csat_negative_rate",  visible: true,  order: 15, x: 6, y: 12, w: 3, h: 2 },
    { id: "csat_response_rate",  visible: true,  order: 16, x: 9, y: 12, w: 3, h: 2 },

    // ── Row 6 — Quality deep-dives ──────────────────────────────────────────
    { id: "sla_by_dimension",    visible: true,  order: 17, x: 0, y: 14, w: 6, h: 4 },
    { id: "csat_distribution",   visible: true,  order: 18, x: 6, y: 14, w: 6, h: 4 },

    // ── Off-by-default — toggle on from the customizer when needed ──────────
    // Stat extras
    { id: "volume_reopened",     visible: false, order: 19, x: 0, w: 3, h: 2 },
    { id: "perf_ai_resolution",  visible: false, order: 20, x: 0, w: 3, h: 2 },
    // Composite originals — kept for backwards compatibility
    { id: "volume",              visible: false, order: 21, x: 0, w: 12, h: 3 },
    { id: "performance",         visible: false, order: 22, x: 0, w: 12, h: 3 },
    { id: "breakdowns",          visible: false, order: 23, x: 0, w: 12, h: 6 },
    { id: "csat",                visible: false, order: 24, x: 0, w: 12, h: 8 },
    // Service-desk extras
    { id: "by_assignee",         visible: false, order: 25, x: 0, w:  6, h: 5 },
    { id: "channel_breakdown",   visible: false, order: 26, x: 0, w:  4, h: 6 },
    { id: "backlog_trend",       visible: false, order: 27, x: 0, w:  8, h: 6 },
    { id: "top_open_tickets",    visible: false, order: 28, x: 0, w:  8, h: 6 },
    // Quality extras
    { id: "csat_trend",          visible: false, order: 29, x: 0, w:  6, h: 6 },
    { id: "csat_recent",         visible: false, order: 30, x: 0, w:  6, h: 5 },
    { id: "fcr_rate",            visible: false, order: 31, x: 0, w:  4, h: 5 },
    { id: "resolution_dist",     visible: false, order: 32, x: 0, w:  6, h: 6 },
    // ITSM module deep-dives
    { id: "incident_analytics",  visible: false, order: 33, x: 0, w: 12, h: 8 },
    { id: "request_fulfillment", visible: false, order: 34, x: 0, w:  6, h: 6 },
    { id: "problem_recurrence",  visible: false, order: 35, x: 0, w:  6, h: 6 },
    { id: "approval_turnaround", visible: false, order: 36, x: 0, w:  6, h: 6 },
    { id: "change_analytics",    visible: false, order: 37, x: 0, w: 12, h: 8 },
    { id: "asset_health",        visible: false, order: 38, x: 0, w: 12, h: 8 },
    { id: "kb_insights",         visible: false, order: 39, x: 0, w:  6, h: 6 },
  ],
};

// ── Composite → atomic mapping (used by the migration helper) ────────────────
//
// When the dashboard split was introduced these composites were broken into
// their constituent stats and charts. To preserve existing user dashboards,
// `splitCompositeWidgets` replaces any composite widget with its atomic
// equivalents, copying the composite's `visible` flag onto every atomic so
// nothing visibly disappears for the user.

const COMPOSITE_TO_ATOMIC: Partial<Record<WidgetId, readonly WidgetId[]>> = {
  volume: [
    "volume_total", "volume_open", "volume_resolved",
    "volume_escalated", "volume_reopened",
  ] as const,
  performance: [
    "perf_mtta", "perf_mttr", "perf_ai_resolution",
    "perf_sla_compliance", "perf_sla_breached",
  ] as const,
  breakdowns: [
    "breakdown_category", "breakdown_priority", "breakdown_aging",
  ] as const,
  csat: [
    "csat_avg_rating", "csat_positive_rate", "csat_negative_rate",
    "csat_response_rate", "csat_distribution", "csat_recent",
  ] as const,
};

/**
 * Idempotent migration: given a list of widget configs, replace every
 * composite (`volume`, `performance`, `breakdowns`, `csat`) with its atomic
 * equivalents and mark the composite hidden.
 *
 * Visibility of each atomic mirrors the composite's `visible` flag, *unless*
 * the atomic is already present in the input (in which case the existing
 * entry wins — protects users who already manually added an atomic).
 *
 * Layouts use `WIDGET_LAYOUT_DEFAULTS` for the new atomics; the grid engine
 * will recompact vertically on first render.
 */
export function splitCompositeWidgets(widgets: WidgetConfig[]): WidgetConfig[] {
  const seen = new Map<string, WidgetConfig>();
  for (const w of widgets) seen.set(w.id, w);

  const out: WidgetConfig[] = [];
  let nextOrder = 0;

  for (const w of widgets) {
    const atomics = COMPOSITE_TO_ATOMIC[w.id as WidgetId];
    if (atomics) {
      // Hide the composite but keep its definition for backwards compat
      out.push({ ...w, visible: false, order: nextOrder++ });

      // Append atomics (new ones get the composite's visible state)
      let xCursor = 0;
      for (const aid of atomics) {
        if (seen.has(aid)) continue; // user already has this atomic
        const def = WIDGET_LAYOUT_DEFAULTS[aid];
        if (xCursor + def.w > 12) xCursor = 0;
        out.push({
          id: aid,
          visible: w.visible,
          order: nextOrder++,
          x: xCursor,
          w: def.w,
          h: def.h,
        });
        seen.set(aid, out[out.length - 1]!);
        xCursor += def.w;
      }
    } else {
      out.push({ ...w, order: nextOrder++ });
    }
  }
  return out;
}

// ── Prebuilt dashboard templates ─────────────────────────────────────────────
//
// One-click starting points for new dashboards. Each template ships a
// hand-tuned layout of widgets coloured to tell a coherent story (executive
// summary, service-desk pulse, SLA & quality, customer experience, ITSM
// modules). Templates also lean on `appearance.chartType: "pie"` for
// breakdown widgets so the visual language stays distinct from the default
// bar-heavy layout.

export interface PrebuiltDashboard {
  /** Stable slug — used as the React key in the picker. */
  id: string;
  name: string;
  description: string;
  /** Lucide-react icon name; looked up at render time on the client. */
  iconName: string;
  /** Hex colour for the template card icon and accent. */
  accentColor: string;
  config: DashboardConfigData;
}

interface VisibleWidgetSpec {
  id: WidgetId;
  x: number;
  y: number;
  w: number;
  h: number;
  appearance?: WidgetAppearance;
}

/**
 * Build a complete DashboardConfigData from a sparse list of visible widgets.
 * Any registered WIDGET_IDS not present in `visible` are appended with
 * `visible: false` so the customizer can still surface them.
 */
function buildPrebuiltConfig(
  visible: VisibleWidgetSpec[],
  period: 7 | 30 | 90 = 30,
): DashboardConfigData {
  const visibleIds = new Set<WidgetId>(visible.map((v) => v.id));
  const widgets: WidgetConfig[] = [];
  let order = 0;

  for (const v of visible) {
    widgets.push({
      id: v.id,
      visible: true,
      order: order++,
      x: v.x,
      y: v.y,
      w: v.w,
      h: v.h,
      ...(v.appearance ? { appearance: v.appearance } : {}),
    });
  }
  for (const id of WIDGET_IDS) {
    if (visibleIds.has(id)) continue;
    const def = WIDGET_LAYOUT_DEFAULTS[id];
    widgets.push({
      id,
      visible: false,
      order: order++,
      x: 0,
      w: def.w,
      h: def.h,
    });
  }
  return { period, density: "comfortable", widgets };
}

export const PREBUILT_DASHBOARDS: PrebuiltDashboard[] = [
  // ── 1. Executive Overview ───────────────────────────────────────────────
  {
    id: "executive_overview",
    name: "Executive Overview",
    description: "High-level KPIs, SLA & CSAT pulse, plus category and priority pie charts.",
    iconName: "LineChart",
    accentColor: "#8b5cf6",
    config: buildPrebuiltConfig([
      // Row 1 — Headline volume tiles (h=2)
      { id: "volume_total",        x: 0, y:  0, w: 3, h: 2, appearance: { accentColor: "#8b5cf6" } },
      { id: "volume_open",         x: 3, y:  0, w: 3, h: 2, appearance: { accentColor: "#f97316" } },
      { id: "volume_resolved",     x: 6, y:  0, w: 3, h: 2, appearance: { accentColor: "#10b981" } },
      { id: "volume_escalated",    x: 9, y:  0, w: 3, h: 2, appearance: { accentColor: "#ef4444" } },
      // Row 2 — Performance & quality
      { id: "perf_sla_compliance", x: 0, y:  2, w: 3, h: 2, appearance: { accentColor: "#10b981" } },
      { id: "perf_mttr",           x: 3, y:  2, w: 3, h: 2, appearance: { accentColor: "#3b82f6" } },
      { id: "csat_avg_rating",     x: 6, y:  2, w: 3, h: 2, appearance: { accentColor: "#f43f5e" } },
      { id: "csat_response_rate",  x: 9, y:  2, w: 3, h: 2, appearance: { accentColor: "#06b6d4" } },
      // Row 3 — Trend + agent leaderboard
      { id: "tickets_per_day",     x: 0, y:  4, w: 8, h: 4, appearance: { chartType: "area", accentColor: "#8b5cf6" } },
      { id: "agent_leaderboard",   x: 8, y:  4, w: 4, h: 4 },
      // Row 4 — Pie charts for distribution
      { id: "breakdown_category",  x: 0, y:  8, w: 4, h: 4, appearance: { chartType: "pie", accentColor: "#8b5cf6" } },
      { id: "breakdown_priority",  x: 4, y:  8, w: 4, h: 4, appearance: { chartType: "pie", accentColor: "#f59e0b" } },
      { id: "channel_breakdown",   x: 8, y:  8, w: 4, h: 4, appearance: { accentColor: "#06b6d4" } },
    ]),
  },

  // ── 2. Service Desk Pulse ────────────────────────────────────────────────
  {
    id: "service_desk_pulse",
    name: "Service Desk Pulse",
    description: "Operational view — backlog, aging, agent load and the oldest open tickets.",
    iconName: "Activity",
    accentColor: "#10b981",
    config: buildPrebuiltConfig([
      // Row 1 — Volume + performance tiles
      { id: "volume_open",         x: 0, y:  0, w: 3, h: 2, appearance: { accentColor: "#f97316" } },
      { id: "volume_total",        x: 3, y:  0, w: 3, h: 2, appearance: { accentColor: "#10b981" } },
      { id: "perf_mtta",           x: 6, y:  0, w: 3, h: 2, appearance: { accentColor: "#3b82f6" } },
      { id: "perf_mttr",           x: 9, y:  0, w: 3, h: 2, appearance: { accentColor: "#8b5cf6" } },
      // Row 2 — Backlog trend + workload
      { id: "backlog_trend",       x: 0, y:  2, w: 8, h: 5, appearance: { accentColor: "#10b981" } },
      { id: "by_assignee",         x: 8, y:  2, w: 4, h: 5 },
      // Row 3 — Aging + priority pie + channel donut
      { id: "breakdown_aging",     x: 0, y:  7, w: 4, h: 4, appearance: { accentColor: "#f59e0b" } },
      { id: "breakdown_priority",  x: 4, y:  7, w: 4, h: 4, appearance: { chartType: "pie", accentColor: "#ef4444" } },
      { id: "channel_breakdown",   x: 8, y:  7, w: 4, h: 4, appearance: { accentColor: "#06b6d4" } },
      // Row 4 — Oldest open tickets
      { id: "top_open_tickets",    x: 0, y: 11, w: 12, h: 5 },
    ]),
  },

  // ── 3. SLA & Quality ─────────────────────────────────────────────────────
  {
    id: "sla_quality",
    name: "SLA & Quality",
    description: "SLA compliance heatmap, resolution time spread, and category/priority pies.",
    iconName: "ShieldCheck",
    accentColor: "#f59e0b",
    config: buildPrebuiltConfig([
      // Row 1 — SLA & MTT* tiles
      { id: "perf_sla_compliance", x: 0, y:  0, w: 3, h: 2, appearance: { accentColor: "#10b981" } },
      { id: "perf_sla_breached",   x: 3, y:  0, w: 3, h: 2, appearance: { accentColor: "#ef4444" } },
      { id: "perf_mtta",           x: 6, y:  0, w: 3, h: 2, appearance: { accentColor: "#3b82f6" } },
      { id: "perf_mttr",           x: 9, y:  0, w: 3, h: 2, appearance: { accentColor: "#8b5cf6" } },
      // Row 2 — SLA by dimension + resolution dist
      { id: "sla_by_dimension",    x: 0, y:  2, w: 7, h: 5, appearance: { accentColor: "#f59e0b" } },
      { id: "resolution_dist",     x: 7, y:  2, w: 5, h: 5, appearance: { accentColor: "#3b82f6" } },
      // Row 3 — Pies + first contact resolution
      { id: "breakdown_priority",  x: 0, y:  7, w: 4, h: 4, appearance: { chartType: "pie", accentColor: "#ef4444" } },
      { id: "breakdown_category",  x: 4, y:  7, w: 4, h: 4, appearance: { chartType: "pie", accentColor: "#8b5cf6" } },
      { id: "fcr_rate",            x: 8, y:  7, w: 4, h: 4, appearance: { accentColor: "#10b981" } },
    ]),
  },

  // ── 4. Customer Experience ───────────────────────────────────────────────
  {
    id: "customer_experience",
    name: "Customer Experience",
    description: "CSAT-focused view — ratings, distribution pie, trend, and recent feedback.",
    iconName: "Heart",
    accentColor: "#f43f5e",
    config: buildPrebuiltConfig([
      // Row 1 — CSAT tiles
      { id: "csat_avg_rating",     x: 0, y: 0, w: 3, h: 2, appearance: { accentColor: "#f43f5e" } },
      { id: "csat_positive_rate",  x: 3, y: 0, w: 3, h: 2, appearance: { accentColor: "#10b981" } },
      { id: "csat_negative_rate",  x: 6, y: 0, w: 3, h: 2, appearance: { accentColor: "#ef4444" } },
      { id: "csat_response_rate",  x: 9, y: 0, w: 3, h: 2, appearance: { accentColor: "#06b6d4" } },
      // Row 2 — Trend + distribution pie
      { id: "csat_trend",          x: 0, y: 2, w: 7, h: 5, appearance: { chartType: "area", accentColor: "#f43f5e" } },
      { id: "csat_distribution",   x: 7, y: 2, w: 5, h: 5, appearance: { chartType: "pie", accentColor: "#f43f5e" } },
      // Row 3 — Recent feedback + FCR
      { id: "csat_recent",         x: 0, y: 7, w: 8, h: 5 },
      { id: "fcr_rate",            x: 8, y: 7, w: 4, h: 5, appearance: { accentColor: "#10b981" } },
    ]),
  },

  // ── 5. ITSM Modules ──────────────────────────────────────────────────────
  {
    id: "itsm_modules",
    name: "ITSM Modules",
    description: "Incidents, requests, problems, changes, assets and KB — the full ITIL picture.",
    iconName: "Layers",
    accentColor: "#3b82f6",
    config: buildPrebuiltConfig([
      { id: "incident_analytics",  x: 0, y:  0, w: 12, h: 6, appearance: { accentColor: "#ef4444" } },
      { id: "request_fulfillment", x: 0, y:  6, w:  6, h: 5, appearance: { accentColor: "#3b82f6" } },
      { id: "problem_recurrence",  x: 6, y:  6, w:  6, h: 5, appearance: { accentColor: "#f59e0b" } },
      { id: "change_analytics",    x: 0, y: 11, w: 12, h: 6, appearance: { accentColor: "#8b5cf6" } },
      { id: "asset_health",        x: 0, y: 17, w:  8, h: 6, appearance: { accentColor: "#10b981" } },
      { id: "approval_turnaround", x: 8, y: 17, w:  4, h: 6, appearance: { accentColor: "#06b6d4" } },
      { id: "kb_insights",         x: 0, y: 23, w: 12, h: 5, appearance: { accentColor: "#06b6d4" } },
    ]),
  },
];
