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

export default router;

