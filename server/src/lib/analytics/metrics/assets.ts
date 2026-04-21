/**
 * Asset Analytics Metrics
 *
 * Ten metrics covering the full asset governance picture:
 *  assets.total              — total count with stat / time_series
 *  assets.by_status          — lifecycle state distribution
 *  assets.by_type            — asset class distribution
 *  assets.by_team            — breakdown by responsible team
 *  assets.by_location        — breakdown by physical location/site
 *  assets.warranty_expiring  — count expiring in the period window
 *  assets.retirement_due     — count approaching end-of-life
 *  assets.stale              — count flagged stale by discovery
 *  assets.discovery_trend    — new vs stale discovered over time
 *  assets.with_open_incidents — assets linked to open incidents
 */

import type { MetricDefinition, ComputeContext } from "../types";
import { buildFilterSQL, ASSET_FIELD_MAP } from "../filters";
import { fillDateSeries } from "../date";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Standard asset WHERE clause: created_at within range + optional filter conditions.
 * Most asset metrics are "point-in-time" (all assets, not created-in-period),
 * so we expose both a full-table and a time-windowed helper.
 */
function assetTimedWhere(ctx: ComputeContext): { clause: string; params: unknown[] } {
  const { clause, params } = buildFilterSQL(ctx.filters, ASSET_FIELD_MAP, 3);
  return {
    clause: `WHERE "created_at" >= $1 AND "created_at" <= $2${clause}`,
    params,
  };
}

function assetAllWhere(ctx: ComputeContext): { clause: string; params: unknown[] } {
  const { clause, params } = buildFilterSQL(ctx.filters, ASSET_FIELD_MAP, 1);
  return {
    clause: `WHERE TRUE${clause}`,
    params,
  };
}

// ── assets.total ──────────────────────────────────────────────────────────────

const assetsTotal: MetricDefinition = {
  id:          "assets.total",
  label:       "Total Assets",
  description: "Total number of registered assets. Supports time-series to show asset inventory growth.",
  domain:      "assets",
  unit:        "count",
  supportedVisualizations: ["number", "number_change", "line", "area"],
  defaultVisualization:    "number",
  filterFields: [
    { key: "type",   label: "Asset Type",   type: "enum" },
    { key: "status", label: "Status",        type: "enum" },
    { key: "teamId", label: "Team",          type: "id" },
  ],

  computeFor: {
    async stat(ctx) {
      const { clause, params } = assetAllWhere(ctx);
      interface Row { count: bigint }
      const [row] = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT COUNT(*) AS count FROM asset ${clause}`,
        ...params,
      );
      return { type: "stat", value: Number(row?.count ?? 0), label: "Total Assets", unit: "count" };
    },

    async time_series(ctx) {
      const { clause, params } = assetTimedWhere(ctx);
      interface Row { day: string; count: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT TO_CHAR("created_at",'YYYY-MM-DD') AS day, COUNT(*) AS count
         FROM asset ${clause} GROUP BY day ORDER BY day`,
        ctx.dateRange.since, ctx.dateRange.until, ...params,
      );
      const lookup = new Map(rows.map(r => [r.day, Number(r.count)]));
      const points = fillDateSeries(ctx.dateRange.since, ctx.dateRange.until)
        .map(date => ({ date, assets: lookup.get(date) ?? 0 }));
      return { type: "time_series", series: [{ key: "assets", label: "Assets Created" }], points };
    },
  },
};

// ── assets.by_status ─────────────────────────────────────────────────────────

const assetsByStatus: MetricDefinition = {
  id:          "assets.by_status",
  label:       "Assets by Lifecycle State",
  description: "Distribution of assets across lifecycle states: in_stock, deployed, in_use, retired, etc.",
  domain:      "assets",
  unit:        "count",
  supportedVisualizations: ["bar", "bar_horizontal", "donut", "table"],
  defaultVisualization:    "bar_horizontal",
  supportedGroupBys:       ["type", "condition"],
  filterFields: [
    { key: "type",   label: "Asset Type", type: "enum" },
    { key: "teamId", label: "Team",        type: "id" },
  ],

  computeFor: {
    async grouped_count(ctx) {
      const { clause, params } = assetAllWhere(ctx);
      interface Row { key: string; count: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT COALESCE(status::text,'unknown') AS key, COUNT(*) AS count
         FROM asset ${clause} GROUP BY status ORDER BY count DESC`,
        ...params,
      );
      const STATUS_ORDER = ["ordered","in_stock","deployed","in_use","under_maintenance","in_repair","retired","disposed","lost_stolen"];
      const sortedRows = [...rows].sort((a, b) =>
        STATUS_ORDER.indexOf(a.key) - STATUS_ORDER.indexOf(b.key),
      );
      const items = sortedRows.map(r => ({ key: r.key, label: r.key.replace(/_/g, " "), value: Number(r.count) }));
      return { type: "grouped_count", items, total: items.reduce((s, i) => s + i.value, 0) };
    },
  },
};

// ── assets.by_type ────────────────────────────────────────────────────────────

const assetsByType: MetricDefinition = {
  id:          "assets.by_type",
  label:       "Assets by Class",
  description: "Distribution across asset classes: hardware, end-user devices, mobile, network equipment, etc.",
  domain:      "assets",
  unit:        "count",
  supportedVisualizations: ["bar", "bar_horizontal", "donut", "table"],
  defaultVisualization:    "donut",
  filterFields: [
    { key: "status", label: "Status", type: "enum" },
    { key: "teamId", label: "Team",   type: "id" },
  ],

  computeFor: {
    async grouped_count(ctx) {
      const { clause, params } = assetAllWhere(ctx);
      interface Row { key: string; count: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT COALESCE(type::text,'other') AS key, COUNT(*) AS count
         FROM asset ${clause} GROUP BY type ORDER BY count DESC`,
        ...params,
      );
      const items = rows.map(r => ({ key: r.key, label: r.key.replace(/_/g, " "), value: Number(r.count) }));
      return { type: "grouped_count", items, total: items.reduce((s, i) => s + i.value, 0) };
    },
  },
};

// ── assets.by_team ────────────────────────────────────────────────────────────

const assetsByTeam: MetricDefinition = {
  id:          "assets.by_team",
  label:       "Assets by Team",
  description: "Number of assets assigned to each team. Unassigned assets are grouped separately.",
  domain:      "assets",
  unit:        "count",
  supportedVisualizations: ["bar", "bar_horizontal", "leaderboard", "table"],
  defaultVisualization:    "bar_horizontal",
  filterFields: [
    { key: "type",   label: "Asset Type", type: "enum" },
    { key: "status", label: "Status",      type: "enum" },
  ],

  computeFor: {
    async grouped_count(ctx) {
      const { clause, params } = assetAllWhere(ctx);
      interface Row { key: string | null; label: string | null; count: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT a."team_id"::text AS key,
                COALESCE(q.name,'Unassigned') AS label,
                COUNT(*) AS count
         FROM asset a
         LEFT JOIN queue q ON q.id = a."team_id"
         ${clause.replace("WHERE TRUE", "WHERE TRUE")}
         GROUP BY a."team_id", q.name
         ORDER BY count DESC
         LIMIT 20`,
        ...params,
      );
      const items = rows.map(r => ({
        key:   r.key ?? "unassigned",
        label: r.label ?? "Unassigned",
        value: Number(r.count),
      }));
      return { type: "grouped_count", items, total: items.reduce((s, i) => s + i.value, 0) };
    },

    async leaderboard(ctx) {
      const { clause, params } = assetAllWhere(ctx);
      interface Row { key: string | null; label: string | null; total: bigint; active: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT a."team_id"::text AS key,
                COALESCE(q.name,'Unassigned') AS label,
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE a.status IN ('deployed','in_use')) AS active
         FROM asset a
         LEFT JOIN queue q ON q.id = a."team_id"
         ${clause.replace("WHERE TRUE", "WHERE TRUE")}
         GROUP BY a."team_id", q.name
         ORDER BY total DESC
         LIMIT ${ctx.limit ?? 10}`,
        ...params,
      );
      const entries = rows.map((r, i) => ({
        rank:         i + 1,
        key:          r.key ?? "unassigned",
        label:        r.label ?? "Unassigned",
        primaryValue: Number(r.total),
        columns:      { total: Number(r.total), active: Number(r.active) },
      }));
      return {
        type:       "leaderboard",
        entries,
        columnDefs: [
          { key: "total",  label: "Total",        sortable: true },
          { key: "active", label: "Active",        sortable: true },
        ],
      };
    },
  },
};

// ── assets.by_location ────────────────────────────────────────────────────────

const assetsByLocation: MetricDefinition = {
  id:          "assets.by_location",
  label:       "Assets by Location",
  description: "Asset distribution across physical sites and locations.",
  domain:      "assets",
  unit:        "count",
  supportedVisualizations: ["bar", "bar_horizontal", "table"],
  defaultVisualization:    "bar_horizontal",
  filterFields: [
    { key: "type",   label: "Asset Type", type: "enum" },
    { key: "status", label: "Status",      type: "enum" },
  ],

  computeFor: {
    async grouped_count(ctx) {
      const { clause, params } = assetAllWhere(ctx);
      interface Row { key: string; count: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT COALESCE(NULLIF(TRIM(COALESCE(site, location)),''),'Unspecified') AS key,
                COUNT(*) AS count
         FROM asset ${clause}
         GROUP BY COALESCE(NULLIF(TRIM(COALESCE(site, location)),''),'Unspecified')
         ORDER BY count DESC LIMIT 20`,
        ...params,
      );
      const items = rows.map(r => ({ key: r.key, label: r.key, value: Number(r.count) }));
      return { type: "grouped_count", items, total: items.reduce((s, i) => s + i.value, 0) };
    },
  },
};

// ── assets.warranty_expiring ──────────────────────────────────────────────────

const assetsWarrantyExpiring: MetricDefinition = {
  id:          "assets.warranty_expiring",
  label:       "Warranty Expiring",
  description: "Assets whose warranty expires within the selected date window.",
  domain:      "assets",
  unit:        "count",
  supportedVisualizations: ["number", "number_change", "table"],
  defaultVisualization:    "number",
  filterFields: [
    { key: "type",   label: "Asset Type", type: "enum" },
    { key: "teamId", label: "Team",        type: "id" },
  ],

  computeFor: {
    async stat(ctx) {
      interface Row { count: bigint; critical: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT
          COUNT(*) FILTER (WHERE "warranty_expiry" >= ${ctx.dateRange.since}
                             AND "warranty_expiry" <= ${ctx.dateRange.until}) AS count,
          COUNT(*) FILTER (WHERE "warranty_expiry" >= NOW()
                             AND "warranty_expiry" <= NOW() + INTERVAL '30 days') AS critical
        FROM asset
        WHERE status NOT IN ('retired','disposed','lost_stolen')
          AND "warranty_expiry" IS NOT NULL
      `;
      const count    = Number(row?.count ?? 0);
      const critical = Number(row?.critical ?? 0);
      return {
        type:  "stat",
        value: count,
        label: "Warranty Expiring",
        unit:  "count",
        sub:   critical > 0 ? `${critical} expiring in 30 days` : undefined,
      };
    },

    async table(ctx) {
      const rows = await ctx.db.asset.findMany({
        where: {
          warrantyExpiry:  { gte: ctx.dateRange.since, lte: ctx.dateRange.until },
          status:          { notIn: ["retired", "disposed", "lost_stolen"] },
        },
        select: {
          id: true, assetNumber: true, name: true, type: true, status: true,
          warrantyExpiry: true, vendor: true,
          team:  { select: { name: true } },
          assignedTo: { select: { name: true } },
        },
        orderBy: { warrantyExpiry: "asc" },
        take: ctx.limit ?? 50,
      });
      return {
        type: "table",
        rows: rows.map(r => ({
          id:            r.id,
          assetNumber:   r.assetNumber,
          name:          r.name,
          type:          r.type,
          status:        r.status,
          warrantyExpiry: r.warrantyExpiry?.toISOString().slice(0, 10) ?? null,
          vendor:        r.vendor ?? null,
          team:          r.team?.name ?? null,
          assignedTo:    r.assignedTo?.name ?? null,
        })),
        columnDefs: [
          { key: "assetNumber", label: "Asset #" },
          { key: "name",        label: "Name" },
          { key: "type",        label: "Type" },
          { key: "status",      label: "Status" },
          { key: "warrantyExpiry", label: "Expires", sortable: true },
          { key: "vendor",      label: "Vendor" },
          { key: "team",        label: "Team" },
          { key: "assignedTo",  label: "Assigned To" },
        ],
        total: rows.length,
      };
    },
  },
};

// ── assets.retirement_due ─────────────────────────────────────────────────────

const assetsRetirementDue: MetricDefinition = {
  id:          "assets.retirement_due",
  label:       "Retirement Due",
  description: "Assets with an end-of-life date falling within the selected window.",
  domain:      "assets",
  unit:        "count",
  supportedVisualizations: ["number", "number_change", "table"],
  defaultVisualization:    "number",
  filterFields: [
    { key: "type",   label: "Asset Type", type: "enum" },
    { key: "teamId", label: "Team",        type: "id" },
  ],

  computeFor: {
    async stat(ctx) {
      interface Row { count: bigint; overdue: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT
          COUNT(*) FILTER (WHERE "end_of_life_at" >= ${ctx.dateRange.since}
                             AND "end_of_life_at" <= ${ctx.dateRange.until}) AS count,
          COUNT(*) FILTER (WHERE "end_of_life_at" < NOW()) AS overdue
        FROM asset
        WHERE status NOT IN ('retired','disposed','lost_stolen')
          AND "end_of_life_at" IS NOT NULL
      `;
      const count  = Number(row?.count ?? 0);
      const overdue = Number(row?.overdue ?? 0);
      return {
        type:  "stat",
        value: count,
        label: "Retirement Due",
        unit:  "count",
        sub:   overdue > 0 ? `${overdue} already past EoL` : undefined,
      };
    },

    async table(ctx) {
      const rows = await ctx.db.asset.findMany({
        where: {
          endOfLifeAt: { lte: ctx.dateRange.until },
          status:      { notIn: ["retired", "disposed", "lost_stolen"] },
        },
        select: {
          id: true, assetNumber: true, name: true, type: true, status: true,
          endOfLifeAt: true, manufacturer: true, model: true,
          team:       { select: { name: true } },
          assignedTo: { select: { name: true } },
        },
        orderBy: { endOfLifeAt: "asc" },
        take: ctx.limit ?? 50,
      });
      return {
        type: "table",
        rows: rows.map(r => ({
          id:          r.id,
          assetNumber: r.assetNumber,
          name:        r.name,
          type:        r.type,
          status:      r.status,
          endOfLifeAt: r.endOfLifeAt?.toISOString().slice(0, 10) ?? null,
          manufacturer: r.manufacturer ?? null,
          model:       r.model ?? null,
          team:        r.team?.name ?? null,
          assignedTo:  r.assignedTo?.name ?? null,
        })),
        columnDefs: [
          { key: "assetNumber", label: "Asset #" },
          { key: "name",        label: "Name" },
          { key: "type",        label: "Type" },
          { key: "status",      label: "Status" },
          { key: "endOfLifeAt", label: "End of Life", sortable: true },
          { key: "manufacturer", label: "Manufacturer" },
          { key: "team",        label: "Team" },
          { key: "assignedTo",  label: "Assigned To" },
        ],
        total: rows.length,
      };
    },
  },
};

// ── assets.stale ──────────────────────────────────────────────────────────────

const assetsStale: MetricDefinition = {
  id:          "assets.stale",
  label:       "Stale Assets",
  description: "Assets that were absent from their last discovery sync run and may be decommissioned.",
  domain:      "assets",
  unit:        "count",
  supportedVisualizations: ["number", "number_change"],
  defaultVisualization:    "number",

  computeFor: {
    async stat(ctx) {
      interface Row { stale: bigint; recent: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT
          COUNT(*) FILTER (WHERE "stale_detected_at" IS NOT NULL) AS stale,
          COUNT(*) FILTER (WHERE "last_discovered_at" >= NOW() - INTERVAL '7 days'
                             AND "stale_detected_at" IS NULL) AS recent
        FROM asset
        WHERE "discovery_source" IS NOT NULL
      `;
      return {
        type:  "stat",
        value: Number(row?.stale ?? 0),
        label: "Stale Assets",
        unit:  "count",
        sub:   `${Number(row?.recent ?? 0)} recently discovered`,
      };
    },
  },
};

// ── assets.discovery_trend ────────────────────────────────────────────────────

const assetsDiscoveryTrend: MetricDefinition = {
  id:          "assets.discovery_trend",
  label:       "Discovery Activity",
  description: "Assets first discovered vs stale detections over time — shows sync health.",
  domain:      "assets",
  unit:        "count",
  supportedVisualizations: ["line", "area", "bar"],
  defaultVisualization:    "line",

  computeFor: {
    async time_series(ctx) {
      interface Row { day: string; discovered: bigint; stale: bigint }
      const rows = await ctx.db.$queryRaw<Row[]>`
        SELECT
          TO_CHAR(day_series, 'YYYY-MM-DD') AS day,
          COUNT(a1.id) FILTER (WHERE a1."discovery_source" IS NOT NULL) AS discovered,
          COUNT(a2.id) FILTER (WHERE a2."stale_detected_at" IS NOT NULL) AS stale
        FROM generate_series(
          ${ctx.dateRange.since}::date,
          ${ctx.dateRange.until}::date,
          '1 day'::interval
        ) AS day_series
        LEFT JOIN asset a1 ON a1."created_at"::date  = day_series::date
        LEFT JOIN asset a2 ON a2."stale_detected_at"::date = day_series::date
        GROUP BY day_series
        ORDER BY day_series
      `;
      const points = rows.map(r => ({
        date:       r.day,
        discovered: Number(r.discovered),
        stale:      Number(r.stale),
      }));
      return {
        type:   "time_series",
        series: [
          { key: "discovered", label: "Newly Discovered" },
          { key: "stale",      label: "Stale Detected" },
        ],
        points,
      };
    },
  },
};

// ── assets.retirement_trend ───────────────────────────────────────────────────

const assetsRetirementTrend: MetricDefinition = {
  id:          "assets.retirement_trend",
  label:       "Retirement & Disposal Trend",
  description: "Assets transitioned to retired or disposed status over the selected period.",
  domain:      "assets",
  unit:        "count",
  supportedVisualizations: ["line", "area", "bar"],
  defaultVisualization:    "area",

  computeFor: {
    async time_series(ctx) {
      interface Row { day: string; retired: bigint; disposed: bigint }
      const rows = await ctx.db.$queryRaw<Row[]>`
        SELECT
          TO_CHAR("retired_at"::date, 'YYYY-MM-DD') AS day,
          COUNT(*) FILTER (WHERE status = 'retired') AS retired,
          COUNT(*) FILTER (WHERE status = 'disposed') AS disposed
        FROM asset
        WHERE "retired_at" >= ${ctx.dateRange.since} AND "retired_at" <= ${ctx.dateRange.until}
          AND status IN ('retired','disposed')
        GROUP BY "retired_at"::date ORDER BY "retired_at"::date
      `;
      const retiredMap  = new Map<string, number>();
      const disposedMap = new Map<string, number>();
      for (const r of rows) {
        retiredMap.set(r.day,  Number(r.retired));
        disposedMap.set(r.day, Number(r.disposed));
      }
      const points = fillDateSeries(ctx.dateRange.since, ctx.dateRange.until).map(date => ({
        date,
        retired:  retiredMap.get(date)  ?? 0,
        disposed: disposedMap.get(date) ?? 0,
      }));
      return {
        type:   "time_series",
        series: [
          { key: "retired",  label: "Retired" },
          { key: "disposed", label: "Disposed" },
        ],
        points,
      };
    },
  },
};

// ── assets.with_open_incidents ────────────────────────────────────────────────

const assetsWithOpenIncidents: MetricDefinition = {
  id:          "assets.with_open_incidents",
  label:       "Assets with Open Incidents",
  description: "Count of distinct assets linked to at least one open (non-resolved/non-closed) incident.",
  domain:      "assets",
  unit:        "count",
  supportedVisualizations: ["number"],
  defaultVisualization:    "number",

  computeFor: {
    async stat(ctx) {
      interface Row { count: bigint; incidents: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT
          COUNT(DISTINCT ail."asset_id") AS count,
          COUNT(*) AS incidents
        FROM asset_incident_link ail
        JOIN incident i ON i.id = ail."incident_id"
        WHERE i.status NOT IN ('resolved','closed')
      `;
      return {
        type:  "stat",
        value: Number(row?.count ?? 0),
        label: "Assets with Open Incidents",
        unit:  "count",
        sub:   `${Number(row?.incidents ?? 0)} open incidents total`,
      };
    },
  },
};

// ── Export ────────────────────────────────────────────────────────────────────

export const ASSET_METRICS: MetricDefinition[] = [
  assetsTotal,
  assetsByStatus,
  assetsByType,
  assetsByTeam,
  assetsByLocation,
  assetsWarrantyExpiring,
  assetsRetirementDue,
  assetsStale,
  assetsDiscoveryTrend,
  assetsRetirementTrend,
  assetsWithOpenIncidents,
];
