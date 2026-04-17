/**
 * core/schemas/dashboard.ts
 *
 * Shared schema for dashboard configuration.
 * Used by both the server (validation) and the client (type safety + system default).
 *
 * To add a new widget:
 *   1. Add its id to WIDGET_IDS
 *   2. Add a WIDGET_META entry with label + description
 *   3. Add it to SYSTEM_DEFAULT_CONFIG.widgets
 *   4. Handle the new id in renderWidget() in client/src/pages/HomePage.tsx
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
  // ── SLA & Quality ──────────────────────────────
  "sla_by_dimension",
  "csat",
  "csat_trend",
  // ── ITSM Modules ──────────────────────────────
  "incident_analytics",
  "request_fulfillment",
  "problem_recurrence",
  "approval_turnaround",
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];

export const WIDGET_META: Record<WidgetId, { label: string; description: string }> = {
  // Service Desk
  volume:             { label: "Volume",                  description: "Total, open, resolved, escalated, and reopened ticket counts" },
  performance:        { label: "Performance (MTTA/MTTR)", description: "MTTA, MTTR, AI resolution rate, and SLA compliance" },
  tickets_per_day:    { label: "Tickets Per Day",         description: "Bar chart of daily ticket volume for the selected period" },
  breakdowns:         { label: "Breakdowns & Aging",      description: "Ticket distribution by category, priority, and open-ticket age buckets" },
  by_assignee:        { label: "By Assignee",             description: "Per-agent ticket load, open count, and open percentage" },
  // SLA & Quality
  sla_by_dimension:   { label: "SLA by Dimension",        description: "SLA compliance broken down by priority, category, and team" },
  csat:               { label: "Customer Satisfaction",   description: "CSAT ratings, distribution, and recent submissions" },
  csat_trend:         { label: "CSAT Trend",              description: "Daily average satisfaction score over the selected period" },
  // ITSM Modules
  incident_analytics: { label: "Incident Analytics",      description: "Incident volume, MTTA, MTTR, and breakdown by status and priority" },
  request_fulfillment:{ label: "Request Fulfillment",     description: "Service request volumes, avg fulfillment time, and top catalog items" },
  problem_recurrence: { label: "Problem Recurrence",      description: "Problem status, known errors, and recurring-incident clusters" },
  approval_turnaround:{ label: "Approval Turnaround",     description: "Approval queue size, avg decision time, and oldest pending items" },
};

// ── Zod schemas ────────────────────────────────────────────────────────────────

export const widgetConfigSchema = z.object({
  id:      z.enum(WIDGET_IDS),
  visible: z.boolean(),
  order:   z.number().int().min(0),
});

export const dashboardConfigDataSchema = z.object({
  period:  z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30),
  density: z.enum(["comfortable", "compact"]).default("comfortable"),
  widgets: z.array(widgetConfigSchema),
});

export const createDashboardSchema = z.object({
  name:        z.string().min(1).max(100),
  config:      dashboardConfigDataSchema,
  setAsDefault: z.boolean().default(false),
  isShared:    z.boolean().default(false),
});

export const updateDashboardSchema = z.object({
  name:   z.string().min(1).max(100).optional(),
  config: dashboardConfigDataSchema.optional(),
});

// ── Types ──────────────────────────────────────────────────────────────────────

export type WidgetConfig        = z.infer<typeof widgetConfigSchema>;
export type DashboardConfigData = z.infer<typeof dashboardConfigDataSchema>;
export type CreateDashboardInput = z.infer<typeof createDashboardSchema>;
export type UpdateDashboardInput = z.infer<typeof updateDashboardSchema>;

// ── System default ─────────────────────────────────────────────────────────────

/**
 * The built-in baseline layout that all users start with.
 * Used when a user has no saved personal dashboard.
 * Not stored in the DB — always derived from this constant.
 *
 * New ITSM widgets are off by default so the dashboard doesn't become
 * overwhelming for users who only manage tickets. They can be enabled
 * per-dashboard via the Customize dialog.
 */
export const SYSTEM_DEFAULT_CONFIG: DashboardConfigData = {
  period:  30,
  density: "comfortable",
  widgets: [
    // Service Desk (on by default)
    { id: "volume",              visible: true,  order: 0 },
    { id: "performance",         visible: true,  order: 1 },
    { id: "tickets_per_day",     visible: true,  order: 2 },
    { id: "breakdowns",          visible: true,  order: 3 },
    { id: "by_assignee",         visible: true,  order: 4 },
    // SLA & Quality (on by default)
    { id: "sla_by_dimension",    visible: true,  order: 5 },
    { id: "csat",                visible: true,  order: 6 },
    { id: "csat_trend",          visible: false, order: 7 },
    // ITSM Modules (off by default — enable per role/dashboard)
    { id: "incident_analytics",  visible: false, order: 8 },
    { id: "request_fulfillment", visible: false, order: 9 },
    { id: "problem_recurrence",  visible: false, order: 10 },
    { id: "approval_turnaround", visible: false, order: 11 },
  ],
};
