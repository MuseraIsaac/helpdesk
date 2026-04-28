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
  // ── Quality & SLA ──────────────────────────────
  "sla_by_dimension",
  "csat",
  "csat_trend",
  "fcr_rate",
  "resolution_dist",
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
};

/** Widget groups for the widget picker UI */
export const WIDGET_CATEGORIES: { label: string; ids: WidgetId[] }[] = [
  {
    label: "Service Desk",
    ids: ["volume", "performance", "tickets_per_day", "by_assignee", "breakdowns", "channel_breakdown", "backlog_trend", "top_open_tickets"],
  },
  {
    label: "Quality & SLA",
    ids: ["sla_by_dimension", "csat", "csat_trend", "fcr_rate", "resolution_dist"],
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
  tickets_per_day:     { x: 0, w:  6, h: 5, minW: 3,  minH: 3 },
  by_assignee:         { x: 6, w:  6, h: 5, minW: 3,  minH: 3 },
  breakdowns:          { x: 0, w: 12, h: 6, minW: 6,  minH: 4 },
  channel_breakdown:   { x: 0, w:  4, h: 6, minW: 3,  minH: 4 },
  backlog_trend:       { x: 4, w:  8, h: 6, minW: 4,  minH: 3 },
  top_open_tickets:    { x: 0, w:  8, h: 6, minW: 4,  minH: 3 },
  sla_by_dimension:    { x: 0, w:  6, h: 6, minW: 4,  minH: 3 },
  csat_trend:          { x: 6, w:  6, h: 6, minW: 3,  minH: 3 },
  csat:                { x: 0, w: 12, h: 8, minW: 6,  minH: 5 },
  fcr_rate:            { x: 4, w:  4, h: 5, minW: 3,  minH: 3 },
  resolution_dist:     { x: 0, w:  6, h: 6, minW: 4,  minH: 3 },
  agent_leaderboard:   { x: 6, w:  6, h: 6, minW: 3,  minH: 3 },
  incident_analytics:  { x: 0, w: 12, h: 8, minW: 6,  minH: 5 },
  request_fulfillment: { x: 0, w:  6, h: 6, minW: 4,  minH: 4 },
  problem_recurrence:  { x: 6, w:  6, h: 6, minW: 4,  minH: 4 },
  approval_turnaround: { x: 0, w:  6, h: 6, minW: 4,  minH: 4 },
  change_analytics:    { x: 0, w: 12, h: 8, minW: 6,  minH: 5 },
  asset_health:        { x: 0, w: 12, h: 8, minW: 6,  minH: 5 },
  kb_insights:         { x: 0, w:  6, h: 6, minW: 4,  minH: 4 },
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
 * Core service-desk widgets are on by default.
 * New ITSM module widgets and analytics widgets are off by default so the
 * dashboard doesn't overwhelm users who only manage basic tickets.
 * They can be enabled per-dashboard via the widget picker in edit mode.
 */
export const SYSTEM_DEFAULT_CONFIG: DashboardConfigData = {
  period:  30,
  density: "comfortable",
  widgets: [
    // Service Desk core (on by default)
    { id: "volume",              visible: true,  order: 0,  x: 0, w: 12, h: 3 },
    { id: "performance",         visible: true,  order: 1,  x: 0, w: 12, h: 3 },
    { id: "tickets_per_day",     visible: true,  order: 2,  x: 0, w:  6, h: 5 },
    { id: "by_assignee",         visible: true,  order: 3,  x: 6, w:  6, h: 5 },
    { id: "breakdowns",          visible: true,  order: 4,  x: 0, w: 12, h: 6 },
    // Service Desk extras (off by default)
    { id: "channel_breakdown",   visible: false, order: 5,  x: 0, w:  4, h: 6 },
    { id: "backlog_trend",       visible: false, order: 6,  x: 4, w:  8, h: 6 },
    { id: "top_open_tickets",    visible: false, order: 7,  x: 0, w:  8, h: 6 },
    // Quality & SLA (sla + csat on by default; others off)
    { id: "sla_by_dimension",    visible: true,  order: 8,  x: 0, w:  6, h: 6 },
    { id: "csat_trend",          visible: false, order: 9,  x: 6, w:  6, h: 6 },
    { id: "csat",                visible: true,  order: 10, x: 0, w: 12, h: 8 },
    { id: "fcr_rate",            visible: false, order: 11, x: 0, w:  4, h: 5 },
    { id: "resolution_dist",     visible: false, order: 12, x: 4, w:  8, h: 6 },
    // Teams & Agents (off by default)
    { id: "agent_leaderboard",   visible: false, order: 13, x: 0, w:  6, h: 6 },
    // ITSM Modules (off by default)
    { id: "incident_analytics",  visible: false, order: 14, x: 0, w: 12, h: 8 },
    { id: "request_fulfillment", visible: false, order: 15, x: 0, w:  6, h: 6 },
    { id: "problem_recurrence",  visible: false, order: 16, x: 6, w:  6, h: 6 },
    { id: "approval_turnaround", visible: false, order: 17, x: 0, w:  6, h: 6 },
    // New modules (off by default)
    { id: "change_analytics",    visible: false, order: 18, x: 0, w: 12, h: 8 },
    { id: "asset_health",        visible: false, order: 19, x: 0, w: 12, h: 8 },
    { id: "kb_insights",         visible: false, order: 20, x: 0, w:  6, h: 6 },
  ],
};
