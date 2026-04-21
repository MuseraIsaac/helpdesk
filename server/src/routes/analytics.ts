/**
 * /api/analytics â€" unified analytics API.
 *
 * Endpoints
 * â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
 *   GET  /api/analytics/metrics              List all metric definitions (metadata only)
 *   POST /api/analytics/query                Run a single metric query
 *   POST /api/analytics/batch                Run up to 30 metric queries in one request
 *
 *   GET  /api/analytics/reports              List saved reports visible to the caller
 *   POST /api/analytics/reports              Create a saved report
 *   GET  /api/analytics/reports/:id          Get one saved report with its config
 *   PUT  /api/analytics/reports/:id          Update a saved report
 *   DELETE /api/analytics/reports/:id        Delete a saved report (owner or admin)
 *   POST /api/analytics/reports/:id/share    Share a report with a user or team
 *
 *   GET  /api/analytics/schedules            List schedules for reports the caller owns
 *   POST /api/analytics/schedules            Create a report schedule
 *   PUT  /api/analytics/schedules/:id        Update a schedule
 *   DELETE /api/analytics/schedules/:id      Delete a schedule
 *
 *   POST /api/analytics/export               Export a query result as CSV/XLSX
 */
import { Router } from "express";
import { requireAuth }       from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate }          from "../lib/validate";
import { parseId }           from "../lib/parse-id";
import prisma                from "../db";
import { runQuery, runBatch }   from "../lib/analytics/engine";
import { listMetrics, toMetricMeta } from "../lib/analytics/registry";
import { AnalyticsError }    from "../lib/analytics/types";
import type { QueryResult }  from "../lib/analytics/types";
import { buildStyledWorkbook } from "../lib/excel-export";
import {
  buildCsv, buildFilename, isoDate, isoTs,
  type Sheet, type CellValue, type ColType, type ExportMeta,
} from "../lib/export-metadata";
import {
  analyticsQuerySchema,
  batchQuerySchema,
  createSavedReportSchema,
  updateSavedReportSchema,
  createReportScheduleSchema,
  updateReportScheduleSchema,
} from "core/schemas/analytics.ts";
import { z } from "zod/v4";

// xlsx (SheetJS 0.18) is CommonJS-only; require() avoids ESM parse issues in Bun
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const XLSX: any = require("xlsx");

const router = Router();
router.use(requireAuth);

// â"€â"€ Metric catalog â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

/**
 * GET /api/analytics/metrics
 * Returns all available metric definitions (no compute functions, just metadata).
 * Optional ?domain=tickets filter.
 */
router.get("/metrics", requirePermission("reports.view"), (req, res) => {
  const domain = typeof req.query.domain === "string" ? req.query.domain : undefined;
  const metrics = listMetrics(domain).map(toMetricMeta);
  res.json({ metrics });
});

// â"€â"€ Single query â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

/**
 * POST /api/analytics/query
 * Body: AnalyticsQueryRequest (analyticsQuerySchema)
 */
router.post("/query", requirePermission("reports.view"), async (req, res) => {
  const body = validate(analyticsQuerySchema, req.body, res);
  if (!body) return;

  try {
    const result = await runQuery(prisma, body);
    res.json(result);
  } catch (err) {
    if (err instanceof AnalyticsError) {
      res.status(400).json({ error: err.message, code: err.code });
    } else {
      throw err;
    }
  }
});

// â"€â"€ Batch query â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

/**
 * POST /api/analytics/batch
 * Body: BatchQueryRequest (batchQuerySchema)
 */
router.post("/batch", requirePermission("reports.view"), async (req, res) => {
  const body = validate(batchQuerySchema, req.body, res);
  if (!body) return;

  const result = await runBatch(prisma, body);
  res.json(result);
});

// â"€â"€ Saved reports â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

/**
 * GET /api/analytics/reports
 * Returns reports visible to the caller (own + shared with team/org + curated).
 */
router.get("/reports", requirePermission("reports.view"), async (req, res) => {
  const userId = req.user!.id;
  const isAdmin = req.user!.role === "admin";
  const teamIds = (await prisma.teamMember.findMany({
    where: { userId },
    select: { teamId: true },
  })).map(m => m.teamId);

  const reports = await prisma.savedReport.findMany({
    where: {
      OR: [
        { ownerId: userId },
        { visibility: "org" },
        { visibility: "team", teamId: { in: teamIds } },
        ...(isAdmin ? [{ isCurated: true }] : [{ isCurated: true, visibility: "org" }]),
      ],
    },
    orderBy: [{ isCurated: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true, name: true, description: true, visibility: true,
      isCurated: true, ownerId: true, teamId: true,
      createdAt: true, updatedAt: true,
      owner: { select: { id: true, name: true } },
    },
  });

  res.json({ reports });
});

/**
 * POST /api/analytics/reports
 * Body: createSavedReportSchema
 */
router.post("/reports", requirePermission("reports.manage"), async (req, res) => {
  const body = validate(createSavedReportSchema, req.body, res);
  if (!body) return;

  const report = await prisma.savedReport.create({
    data: {
      name:        body.name,
      description: body.description,
      config:      body.config as object,
      visibility:  body.visibility,
      teamId:      body.visibilityTeamId ?? null,
      ownerId:     req.user!.id,
      isCurated:   false,
    },
  });

  res.status(201).json({ report });
});

/**
 * GET /api/analytics/reports/:id
 */
router.get("/reports/:id", requirePermission("reports.view"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

  const report = await prisma.savedReport.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true } },
      schedules: { select: { id: true, name: true, cronExpr: true, isActive: true, nextRunAt: true } },
    },
  });

  if (!report) { res.status(404).json({ error: "Report not found" }); return; }

  const userId = req.user!.id;
  const isOwner = report.ownerId === userId;
  const isAdmin = req.user!.role === "admin" || req.user!.role === "supervisor";

  if (!isOwner && !isAdmin && report.visibility === "private") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json({ report });
});

/**
 * PUT /api/analytics/reports/:id
 */
router.put("/reports/:id", requirePermission("reports.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

  const body = validate(updateSavedReportSchema, req.body, res);
  if (!body) return;

  const existing = await prisma.savedReport.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Report not found" }); return; }

  const isOwner = existing.ownerId === req.user!.id;
  const isAdmin = req.user!.role === "admin";
  if (!isOwner && !isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  const report = await prisma.savedReport.update({
    where: { id },
    data: {
      ...(body.name        !== undefined ? { name:        body.name }        : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.config      !== undefined ? { config:      body.config as object } : {}),
      ...(body.visibility  !== undefined ? { visibility:  body.visibility }  : {}),
      ...(body.visibilityTeamId !== undefined ? { teamId: body.visibilityTeamId } : {}),
    },
  });

  res.json({ report });
});

/**
 * DELETE /api/analytics/reports/:id
 */
router.delete("/reports/:id", requirePermission("reports.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

  const existing = await prisma.savedReport.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Report not found" }); return; }

  const isOwner = existing.ownerId === req.user!.id;
  const isAdmin = req.user!.role === "admin";
  if (!isOwner && !isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }
  if (existing.isCurated && !isAdmin) { res.status(403).json({ error: "Cannot delete curated reports" }); return; }

  await prisma.savedReport.delete({ where: { id } });
  res.status(204).end();
});

// â"€â"€ Report sharing â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

// ── Report clone ──────────────────────────────────────────────────────────────

/**
 * POST /api/analytics/reports/:id/clone
 * Creates a personal copy of any visible report (including curated ones).
 */
router.post("/reports/:id/clone", requirePermission("reports.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

  const source = await prisma.savedReport.findUnique({ where: { id } });
  if (!source) { res.status(404).json({ error: "Report not found" }); return; }

  const userId  = req.user!.id;
  const isAdmin = req.user!.role === "admin" || req.user!.role === "supervisor";

  if (!source.isCurated && source.ownerId !== userId && !isAdmin && source.visibility === "private") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const bodyName = typeof (req.body as { name?: unknown }).name === "string"
    ? (req.body as { name: string }).name
    : `${source.name} (Copy)`;

  const report = await prisma.savedReport.create({
    data: {
      name:        bodyName,
      description: source.description,
      config:      source.config as object,
      visibility:  "private",
      ownerId:     userId,
      isCurated:   false,
    },
  });

  res.status(201).json({ report });
});

const shareSchema = z.object({
  sharedToId: z.string().optional(),
  teamId:     z.number().int().positive().optional(),
  canEdit:    z.boolean().default(false),
});

/**
 * POST /api/analytics/reports/:id/share
 */
router.post("/reports/:id/share", requirePermission("reports.share"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

  const body = validate(shareSchema, req.body, res);
  if (!body) return;

  if (!body.sharedToId && !body.teamId) {
    res.status(400).json({ error: "Provide sharedToId or teamId" });
    return;
  }

  const existing = await prisma.savedReport.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Report not found" }); return; }

  const isOwner = existing.ownerId === req.user!.id;
  const isAdmin = req.user!.role === "admin" || req.user!.role === "supervisor";
  if (!isOwner && !isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  const share = await prisma.reportShare.create({
    data: {
      reportId:   id,
      sharedById: req.user!.id,
      sharedToId: body.sharedToId ?? null,
      teamId:     body.teamId ?? null,
      canEdit:    body.canEdit,
    },
  });

  res.status(201).json({ share });
});

// â"€â"€ Schedules â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

/**
 * GET /api/analytics/schedules
 * Returns schedules for reports owned by or shared with the caller.
 */
router.get("/schedules", requirePermission("reports.schedule"), async (req, res) => {
  const schedules = await prisma.reportSchedule.findMany({
    where: { createdById: req.user!.id },
    orderBy: { createdAt: "desc" },
    include: { report: { select: { id: true, name: true } } },
  });
  res.json({ schedules });
});

/**
 * POST /api/analytics/schedules
 * Body: createReportScheduleSchema
 */
router.post("/schedules", requirePermission("reports.schedule"), async (req, res) => {
  const body = validate(createReportScheduleSchema, req.body, res);
  if (!body) return;

  const reportId = parseInt(body.reportId, 10);
  if (isNaN(reportId)) { res.status(400).json({ error: "Invalid reportId" }); return; }

  const report = await prisma.savedReport.findUnique({ where: { id: reportId } });
  if (!report) { res.status(404).json({ error: "Report not found" }); return; }

  const isOwner = report.ownerId === req.user!.id;
  const isAdmin = req.user!.role === "admin" || req.user!.role === "supervisor";
  if (!isOwner && !isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  const schedule = await prisma.reportSchedule.create({
    data: {
      reportId,
      name:        body.name ?? null,
      cronExpr:    body.cronExpr,
      timezone:    body.timezone,
      format:      body.format,
      recipients:  body.recipients,
      isActive:    body.isActive,
      createdById: req.user!.id,
    },
  });

  res.status(201).json({ schedule });
});

/**
 * PUT /api/analytics/schedules/:id
 */
router.put("/schedules/:id", requirePermission("reports.schedule"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

  const body = validate(updateReportScheduleSchema, req.body, res);
  if (!body) return;

  const existing = await prisma.reportSchedule.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Schedule not found" }); return; }

  const isOwner = existing.createdById === req.user!.id;
  const isAdmin = req.user!.role === "admin";
  if (!isOwner && !isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  const schedule = await prisma.reportSchedule.update({
    where: { id },
    data: {
      ...(body.name       !== undefined ? { name:       body.name }       : {}),
      ...(body.cronExpr   !== undefined ? { cronExpr:   body.cronExpr }   : {}),
      ...(body.timezone   !== undefined ? { timezone:   body.timezone }   : {}),
      ...(body.format     !== undefined ? { format:     body.format }     : {}),
      ...(body.recipients !== undefined ? { recipients: body.recipients } : {}),
      ...(body.isActive   !== undefined ? { isActive:   body.isActive }   : {}),
    },
  });

  res.json({ schedule });
});

/**
 * DELETE /api/analytics/schedules/:id
 */
router.delete("/schedules/:id", requirePermission("reports.schedule"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

  const existing = await prisma.reportSchedule.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Schedule not found" }); return; }

  const isOwner = existing.createdById === req.user!.id;
  const isAdmin = req.user!.role === "admin";
  if (!isOwner && !isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  await prisma.reportSchedule.delete({ where: { id } });
  res.status(204).end();
});

// â"€â"€ Export â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

/**
 * POST /api/analytics/export
 * Runs a query and streams the result as CSV or XLSX.
 * For simplicity, CSV is returned inline; XLSX requires a separate library.
 */
router.post("/export", requirePermission("reports.export"), async (req, res) => {
  const body = validate(analyticsQuerySchema, req.body, res);
  if (!body) return;

  const format = (req.query.format as string) ?? "csv";

  let result;
  try {
    result = await runQuery(prisma, body);
  } catch (err) {
    if (err instanceof AnalyticsError) {
      res.status(400).json({ error: err.message, code: err.code });
    } else {
      throw err;
    }
    return;
  }

  const filename = `${body.metricId}-${result.dateRange.since}-${result.dateRange.until}`;

  if (format === "xlsx") {
    const wb  = resultToWorkbook(result.result, result.label);
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.xlsx"`);
    res.send(buf);
  } else {
    const csv = resultToCsv(result.result);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`);
    res.send(csv);
  }
});

// â"€â"€ CSV serialiser â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function resultToCsv(result: QueryResult): string {
  switch (result.type) {
    case "stat":
      return `label,value,unit\n"${result.label}",${result.value ?? ""},${result.unit ?? ""}`;

    case "stat_change":
      return `label,value,previousValue,changePercent\n"${result.label}",${result.value ?? ""},${result.previousValue ?? ""},${result.changePercent ?? ""}`;

    case "time_series": {
      const keys = ["date", ...result.series.map(s => s.key)];
      const header = keys.map(k => `"${k}"`).join(",");
      const rows = result.points.map(p => keys.map(k => p[k] ?? "").join(","));
      return [header, ...rows].join("\n");
    }

    case "grouped_count": {
      const header = '"key","label","value"';
      const rows = result.items.map(i => `"${i.key}","${i.label}",${i.value}`);
      return [header, ...rows].join("\n");
    }

    case "distribution": {
      const header = '"bucket","label","count"';
      const rows = result.buckets.map(b => `"${b.bucket}","${b.label}",${b.count}`);
      return [header, ...rows].join("\n");
    }

    case "leaderboard": {
      const colKeys = result.columnDefs.map(c => c.key);
      const header = ["rank", "key", "label", ...colKeys].map(k => `"${k}"`).join(",");
      const rows = result.entries.map(e =>
        [e.rank, `"${e.key}"`, `"${e.label}"`, ...colKeys.map(k => e.columns[k] ?? "")].join(","),
      );
      return [header, ...rows].join("\n");
    }

    case "table": {
      const colKeys = result.columnDefs.map(c => c.key);
      const header = colKeys.map(k => `"${k}"`).join(",");
      const rows = result.rows.map(r => colKeys.map(k => {
        const v = r[k];
        return typeof v === "string" ? `"${v}"` : (v ?? "");
      }).join(","));
      return [header, ...rows].join("\n");
    }

    default:
      return "No CSV representation available for this result type";
  }
}

// ── XLSX workbook builder ──────────────────────────────────────────────────────

function resultToWorkbook(result: QueryResult, sheetName: string): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  let rows: Record<string, unknown>[] = [];

  switch (result.type) {
    case "stat":
      rows = [{ label: result.label, value: result.value ?? "", unit: result.unit ?? "" }];
      break;

    case "stat_change":
      rows = [{
        label: result.label,
        value: result.value ?? "",
        previousValue: result.previousValue ?? "",
        changePercent: result.changePercent ?? "",
      }];
      break;

    case "time_series":
      rows = result.points.map(p => {
        const row: Record<string, unknown> = { date: p["date"] };
        for (const s of result.series) row[s.label] = p[s.key] ?? "";
        return row;
      });
      break;

    case "grouped_count":
      rows = result.items.map(i => ({ key: i.key, label: i.label, value: i.value }));
      break;

    case "distribution":
      rows = result.buckets.map(b => ({ bucket: b.bucket, label: b.label, count: b.count }));
      break;

    case "leaderboard":
      rows = result.entries.map(e => {
        const row: Record<string, unknown> = { rank: e.rank, name: e.label };
        for (const col of result.columnDefs) row[col.label] = e.columns[col.key] ?? "";
        return row;
      });
      break;

    case "table":
      rows = result.rows.map(r => {
        const row: Record<string, unknown> = {};
        for (const col of result.columnDefs) row[col.label] = r[col.key] ?? "";
        return row;
      });
      break;

    default:
      rows = [{ note: "No spreadsheet representation for this result type" }];
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  return wb;
}

// ── Saved-report export ───────────────────────────────────────────────────────
//
// POST /api/analytics/reports/:id/export
//
// Loads a saved report's widget config, executes every widget query via the
// analytics engine, converts each QueryResult into a typed Sheet, then builds
// a styled Excel workbook (ExcelJS) or a structured CSV.
//
// This is the correct export path for the Report Library and CustomReportPage.
// It replaces the old broken behaviour of always exporting "section=overview".

// ── QueryResult → Sheet converter ────────────────────────────────────────────
// isoDate() imported from export-metadata — do not redefine here.

/** Heuristic: detect numeric columns from their key name or unit string. */
function guessColType(key: string, unit?: string): ColType {
  if (unit?.includes("%") || key.endsWith("_pct") || key.endsWith("_rate"))   return "percent";
  if (unit === "s"        || key.endsWith("_s")  || key.includes("_seconds")) return "seconds";
  if (key.includes("count") || key.includes("total") || key === "rank")        return "integer";
  return "decimal_2";
}

function queryResultToSheet(result: QueryResult, widgetTitle: string): Sheet {
  const name = widgetTitle.slice(0, 31) || "Widget";

  switch (result.type) {

    case "stat":
      return {
        name,
        headers: ["Metric", "Value", ...(result.unit ? ["Unit"] : [])],
        keys:    ["metric", "value", ...(result.unit ? ["unit"] : [])],
        types:   ["string", "decimal_2", ...(result.unit ? ["string"] as ColType[] : [])],
        rows:    [[result.label, result.value ?? null, ...(result.unit ? [result.unit] : [])]],
      };

    case "stat_change":
      return {
        name,
        headers: ["Metric", "Current Value", "Previous Value", "Change (%)", ...(result.unit ? ["Unit"] : [])],
        keys:    ["metric", "current_value", "previous_value", "change_pct", ...(result.unit ? ["unit"] : [])],
        types:   ["string", "decimal_2", "decimal_2", "decimal_1", ...(result.unit ? ["string"] as ColType[] : [])],
        rows:    [[
          result.label,
          result.value        ?? null,
          result.previousValue ?? null,
          result.changePercent ?? null,
          ...(result.unit ? [result.unit] : []),
        ]],
      };

    case "time_series": {
      const seriesKeys  = result.series.map(s => s.key);
      const seriesLabels = result.series.map(s => s.label);
      return {
        name,
        headers: ["Date", ...seriesLabels],
        keys:    ["date", ...seriesKeys],
        types:   ["date_iso", ...seriesKeys.map(() => "decimal_2" as ColType)],
        rows: result.points.map(p => [
          p["date"] as string,
          ...seriesKeys.map(k => (p[k] ?? null) as CellValue),
        ]),
      };
    }

    case "grouped_count": {
      const total = result.total;
      // Extra columns beyond key/label/value (e.g., secondary breakdowns)
      const extraKeys = Object.keys(result.items[0] ?? {}).filter(
        k => !["key", "label", "value"].includes(k),
      );
      return {
        name,
        headers: ["Rank", "Key", "Label", "Count", "Share (%)", ...extraKeys.map(k => k.replace(/_/g, " "))],
        keys:    ["rank", "key", "label", "count", "share_pct", ...extraKeys],
        types:   ["integer", "string", "string", "integer", "percent", ...extraKeys.map(() => "decimal_2" as ColType)],
        rows: result.items.map((item, i) => [
          i + 1,
          item.key,
          item.label,
          item.value,
          total > 0 ? Math.round((item.value / total) * 100) : null,
          ...extraKeys.map(k => (item[k] ?? null) as CellValue),
        ]),
      };
    }

    case "distribution":
      return {
        name,
        headers: ["Bucket", "Label", "Count"],
        keys:    ["bucket", "label", "count"],
        types:   ["string", "string", "integer"],
        rows: result.buckets.map(b => [b.bucket, b.label, b.count]),
      };

    case "leaderboard":
      return {
        name,
        headers: ["Rank", "Name", ...result.columnDefs.map(c => c.label)],
        keys:    ["rank", "name", ...result.columnDefs.map(c => c.key)],
        types:   ["integer", "string", ...result.columnDefs.map(c => guessColType(c.key, c.unit))],
        rows: result.entries.map(e => [
          e.rank,
          e.label,
          ...result.columnDefs.map(c => (e.columns[c.key] ?? null) as CellValue),
        ]),
      };

    case "table":
      return {
        name,
        headers: result.columnDefs.map(c => c.label),
        keys:    result.columnDefs.map(c => c.key),
        types:   result.columnDefs.map(c => guessColType(c.key, c.unit)),
        rows: result.rows.map(r => result.columnDefs.map(c => (r[c.key] ?? null) as CellValue)),
      };

    default:
      return {
        name,
        headers: ["Note"],
        keys:    ["note"],
        types:   ["string"],
        rows:    [["No tabular representation available for this widget type."]],
      };
  }
}

/** Ensure no two sheets share the same name (Excel rejects duplicates). */
function deduplicateSheetNames(sheets: Sheet[]): Sheet[] {
  const seen = new Map<string, number>();
  return sheets.map(s => {
    const base  = s.name.slice(0, 28);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? { ...s, name: base } : { ...s, name: `${base} (${count})` };
  });
}

router.post(
  "/reports/:id/export",
  requirePermission("reports.view"),
  async (req, res) => {
    const reportId = parseId(req.params.id);
    if (reportId === null) { res.status(400).json({ error: "Invalid report ID" }); return; }

    const format: "csv" | "xlsx" = req.body.format === "csv" ? "csv" : "xlsx";

    // ── Optional date-range override from the request ────────────────────
    // Sent by ReportLibraryPage when the user has a specific date range
    // selected.  Takes precedence over the report's saved dateRange.
    const bodyFrom:   string | undefined = typeof req.body.from   === "string" ? req.body.from   : undefined;
    const bodyTo:     string | undefined = typeof req.body.to     === "string" ? req.body.to     : undefined;
    const bodyPeriod: string | undefined = typeof req.body.period === "string" ? req.body.period : undefined;

    const dateOverride: { preset?: string; from?: string; to?: string } | null =
      bodyFrom && bodyTo
        ? { preset: "custom", from: bodyFrom, to: bodyTo }
        : bodyPeriod
          ? { preset: bodyPeriod }
          : null;

    // ── Load the saved report ────────────────────────────────────────────
    const report = await prisma.savedReport.findUnique({
      where:  { id: reportId },
      select: {
        id: true, name: true, isCurated: true, ownerId: true,
        config: true, owner: { select: { name: true } },
      },
    });

    if (!report) { res.status(404).json({ error: "Report not found" }); return; }

    // Access check: owner, admin, or shared visibility already handled by
    // requirePermission; additionally guard curated reports (public, no check needed).
    const userId  = req.user!.id;
    const isAdmin = req.user!.role === "admin";
    if (!report.isCurated && report.ownerId !== userId && !isAdmin) {
      res.status(403).json({ error: "Not authorised to export this report" });
      return;
    }

    // ── Parse widget config ──────────────────────────────────────────────
    const config = report.config as {
      dateRange?: { preset?: string; from?: string; to?: string };
      widgets?:   {
        id: string; metricId: string; title?: string;
        dateRange?: { preset?: string };
        filters?: unknown; groupBy?: string;
        sort?: { field: string; direction: string };
        limit?: number;
        x?: number; y?: number;
      }[];
    };

    const widgets  = config.widgets ?? [];
    // dateOverride (from request body) wins over the report's saved dateRange
    const sharedDR = dateOverride ?? config.dateRange ?? { preset: "last_30_days" as const };

    if (widgets.length === 0) {
      res.status(422).json({ error: "This report has no widgets configured yet." });
      return;
    }

    // ── Run each widget query ────────────────────────────────────────────
    const sheets: Sheet[] = [];

    // Determine a safe preset string that matches the analytics engine's accepted values
    const KNOWN_PRESETS = new Set([
      "last_30_days","today","yesterday","last_7_days","last_90_days",
      "this_week","last_week","this_month","last_month",
      "this_quarter","last_quarter","this_year","last_year",
    ]);

    function safeDateRange(raw?: { preset?: string; from?: string; to?: string }) {
      if (!raw) return { preset: "last_30_days" as const };
      if (raw.from && raw.to) return { preset: "custom" as const, from: raw.from, to: raw.to };
      const p = raw.preset ?? "last_30_days";
      return { preset: (KNOWN_PRESETS.has(p) ? p : "last_30_days") as "last_30_days" };
    }

    await Promise.all(
      widgets.map(async (w) => {
        // When the caller provides a date override, apply it to every widget
        // so the entire export covers the same time window.
        const dateRange = safeDateRange(dateOverride ?? w.dateRange ?? sharedDR);
        try {
          const queryResult = await runQuery(prisma, {
            metricId:            w.metricId,
            dateRange,
            groupBy:             w.groupBy,
            sort:                w.sort as { field: string; direction: "asc" | "desc" } | undefined,
            limit:               w.limit ?? 50,
            compareWithPrevious: false,
          });
          const widgetLabel = w.title?.trim() || queryResult.label;
          sheets.push(queryResultToSheet(queryResult.result, widgetLabel));
        } catch {
          // Widget query failed — add an error placeholder sheet
          sheets.push({
            name:    (w.title || w.metricId).slice(0, 28),
            headers: ["Note"],
            keys:    ["note"],
            types:   ["string"],
            rows:    [[`Query failed for metric: ${w.metricId}`]],
          });
        }
      }),
    );

    // Sort sheets to match the visual widget order (y then x)
    const sortedWidgets = [...widgets].sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));
    const orderedSheets = sortedWidgets
      .map(w => {
        const widgetLabel = w.title?.trim() || w.metricId;
        return sheets.find(s => s.name.startsWith(widgetLabel.slice(0, 20)));
      })
      .filter((s): s is Sheet => s !== undefined);

    const finalSheets = deduplicateSheetNames(orderedSheets.length > 0 ? orderedSheets : sheets);

    // ── Build export metadata ────────────────────────────────────────────
    const dr       = sharedDR as { preset?: string; from?: string; to?: string };
    const dateLabel = dr.from && dr.to
      ? `${isoDate(dr.from)} to ${isoDate(dr.to)}`
      : `preset: ${dr.preset ?? "last_30_days"}`;
    const exportedAt = isoTs();
    const filename   = buildFilename(report.name, exportedAt, format);

    const meta: ExportMeta = {
      title:      report.name,
      section:    "custom",
      dateLabel,
      filterDesc: "None",
      exportedBy: req.user!.name,
      exportedAt,
    };

    if (format === "xlsx") {
      const buffer = await buildStyledWorkbook({ ...meta, sheets: finalSheets });
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } else {
      const csv = buildCsv(meta, finalSheets);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.send(csv);
    }
  },
);

export default router;

