/**
 * Asset Discovery API
 *
 * Manages connectors, triggers syncs, exposes run history, and handles CSV imports.
 *
 * Routes:
 *  GET  /api/discovery/connectors            list connectors + last run summary
 *  POST /api/discovery/connectors            register a new connector
 *  GET  /api/discovery/connectors/:id        connector detail + recent runs
 *  PATCH /api/discovery/connectors/:id       update connector
 *  DELETE /api/discovery/connectors/:id      remove connector
 *  POST /api/discovery/connectors/:id/sync   trigger a manual sync (queued)
 *  GET  /api/discovery/runs                  all sync runs (paginated)
 *  GET  /api/discovery/runs/:id              run detail + per-asset errors
 *  POST /api/discovery/import/csv            upload and process a CSV file
 *  POST /api/discovery/import/csv/validate   validate CSV without importing
 */

import express, { Router } from "express";
import ExcelJS from "exceljs";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import {
  createConnectorSchema,
  updateConnectorSchema,
  csvImportOptionsSchema,
  listSyncRunsQuerySchema,
} from "core/schemas/discovery.ts";
import { createAndRunSync } from "../lib/assets/sync-runner";
import { validateCsvContent } from "../lib/assets/connectors/csv-connector";
import { boss } from "../lib/queue";
import { enqueueSyncJob } from "../lib/run-discovery-sync";
import prisma from "../db";
import type { Prisma } from "../generated/prisma/client";

// Parse every import request body as a raw Buffer so we can handle both CSV
// (text) and Excel (binary) with the same middleware.
const parseImportBody = express.raw({ type: "*/*", limit: "20mb" });

// ── xlsx magic-byte detection ─────────────────────────────────────────────────

/** Returns true if the buffer starts with the PK zip signature (xlsx/xlsm) or
 *  the legacy CFB signature (xls). Both are Excel variants we can handle. */
function isXlsxBuffer(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  // xlsx / xlsm: PK\x03\x04
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return true;
  // xls (BIFF): D0 CF 11 E0
  if (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) return true;
  return false;
}

// ── xlsx → CSV converter ──────────────────────────────────────────────────────

function xlsCellToString(cell: ExcelJS.CellValue): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "object") {
    if ("richText" in cell) return (cell as ExcelJS.CellRichTextValue).richText.map(r => r.text).join("");
    if ("result"  in cell) return xlsCellToString((cell as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ("text"    in cell) return String((cell as { text: string }).text);
    if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  }
  return String(cell);
}

function csvEscapeCell(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n") || v.includes("\r")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/**
 * Converts an xlsx Buffer to a CSV string that the CsvDiscoveryAdapter can consume.
 *
 * Header detection handles our two-row template format:
 *   Row 1 → descriptions (long text, not column names) → skip
 *   Row 2 → actual column headers like "externalId *", "name *"
 * Also handles plain single-header-row xlsx files.
 */
async function xlsxBufferToCSV(buf: Buffer | ArrayBuffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  // ExcelJS expects a Node-compatible Buffer; coerce from Bun's Buffer<ArrayBufferLike>
  const nodeBuf: Buffer = Buffer.from(buf instanceof ArrayBuffer ? buf : buf.buffer, buf instanceof ArrayBuffer ? 0 : buf.byteOffset, buf instanceof ArrayBuffer ? buf.byteLength : buf.byteLength);
  await (wb.xlsx as unknown as { load(b: unknown): Promise<ExcelJS.Workbook> }).load(nodeBuf);

  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Excel file has no worksheets");

  // Collect non-empty rows as string arrays
  const allRows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = (row.values as ExcelJS.CellValue[]).slice(1); // ExcelJS is 1-indexed
    allRows.push(vals.map(xlsCellToString));
  });

  if (allRows.length === 0) return "";

  // Determine which row holds the column headers.
  // Strip asterisks/spaces and lowercase for comparison.
  const KNOWN = new Set(["externalid", "external_id", "id", "name", "asset_name"]);
  function looksLikeHeaderRow(row: string[]): boolean {
    return row.some(cell => KNOWN.has(cell.trim().toLowerCase().replace(/[*\s]/g, "")));
  }

  let headerRowIdx = 0;
  if (!looksLikeHeaderRow(allRows[0]!)) {
    // Row 0 is descriptions (our template). Check row 1.
    if (allRows.length >= 2 && looksLikeHeaderRow(allRows[1]!)) {
      headerRowIdx = 1;
    }
    // else fall back to row 0 as headers (unknown format)
  }

  // Strip asterisks from header cells (our template adds " *" to required columns)
  const headerRow = allRows[headerRowIdx]!.map(h => h.trim().replace(/\s*\*\s*$/, ""));
  const dataRows  = allRows.slice(headerRowIdx + 1).filter(r => r.some(c => c !== ""));

  const lines = [
    headerRow.map(csvEscapeCell).join(","),
    ...dataRows.map(row => row.map(csvEscapeCell).join(",")),
  ];
  return lines.join("\n");
}

const router = Router();
router.use(requireAuth);


// ── SELECT projections ────────────────────────────────────────────────────────

const CONNECTOR_SELECT = {
  id: true, source: true, label: true, isEnabled: true,
  scheduleExpression: true, syncPolicy: true, config: true,
  lastSyncAt: true, nextSyncAt: true, totalSynced: true,
  description: true, createdAt: true,
  syncRuns: {
    orderBy: { createdAt: "desc" as const },
    take:    1,
    select: {
      id: true, status: true, triggerType: true,
      startedAt: true, completedAt: true,
      assetsDiscovered: true, assetsCreated: true, assetsUpdated: true,
      assetsSkipped: true, assetsFailed: true, assetsStale: true,
      errorMessage: true,
      triggeredByUser: { select: { id: true, name: true } },
      createdAt: true,
    },
  },
} as const;

const RUN_SUMMARY_SELECT = {
  id: true, source: true, status: true, triggerType: true,
  startedAt: true, completedAt: true,
  assetsDiscovered: true, assetsCreated: true, assetsUpdated: true,
  assetsSkipped: true, assetsFailed: true, assetsStale: true,
  errorMessage: true, jobId: true,
  triggeredByUser: { select: { id: true, name: true } },
  connector:       { select: { id: true, label: true } },
  createdAt: true,
  _count: { select: { errors: true } },
} as const;

function normaliseRun(
  raw: Prisma.DiscoverySyncRunGetPayload<{ select: typeof RUN_SUMMARY_SELECT }>,
) {
  const { _count, connector, ...rest } = raw;
  const durationMs = rest.startedAt && rest.completedAt
    ? rest.completedAt.getTime() - rest.startedAt.getTime()
    : null;
  return { ...rest, durationMs, errorCount: _count.errors, connectorLabel: connector.label };
}

// ── GET /connectors ───────────────────────────────────────────────────────────

router.get("/connectors", requirePermission("assets.view"), async (req, res) => {
  const connectors = await prisma.discoveryConnector.findMany({
    orderBy: [{ isEnabled: "desc" }, { label: "asc" }],
    select:  CONNECTOR_SELECT,
  });

  res.json(connectors.map(c => ({
    ...c,
    recentRun: c.syncRuns[0] ?? null,
    syncRuns: undefined,
  })));
});

// ── POST /connectors ──────────────────────────────────────────────────────────

router.post("/connectors", requirePermission("assets.manage"), async (req, res) => {
  const data = validate(createConnectorSchema, req.body, res);
  if (!data) return;

  const existing = await prisma.discoveryConnector.findUnique({ where: { source: data.source } });
  if (existing) {
    return res.status(422).json({ error: `A connector for source "${data.source}" already exists.` });
  }

  const connector = await prisma.discoveryConnector.create({
    data: {
      source:             data.source,
      label:              data.label,
      isEnabled:          data.isEnabled,
      scheduleExpression: data.scheduleExpression ?? null,
      syncPolicy:         data.syncPolicy,
      config:             data.config as Prisma.InputJsonValue,
      description:        data.description ?? null,
      createdById:        req.user.id,
    },
    select: CONNECTOR_SELECT,
  });

  res.status(201).json({ ...connector, recentRun: null });
});

// ── GET /connectors/:id ───────────────────────────────────────────────────────

router.get("/connectors/:id", requirePermission("assets.view"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const connector = await prisma.discoveryConnector.findUnique({
    where:  { id },
    select: {
      ...CONNECTOR_SELECT,
      syncRuns: {
        orderBy: { createdAt: "desc" as const },
        take:    10,
        select:  {
          id: true, status: true, triggerType: true,
          startedAt: true, completedAt: true,
          assetsDiscovered: true, assetsCreated: true, assetsUpdated: true,
          assetsSkipped: true, assetsFailed: true, assetsStale: true,
          errorMessage: true, createdAt: true,
          triggeredByUser: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!connector) return res.status(404).json({ error: "Connector not found" });

  const { syncRuns, ...rest } = connector;
  res.json({ ...rest, recentRun: syncRuns[0] ?? null, recentRuns: syncRuns });
});

// ── PATCH /connectors/:id ─────────────────────────────────────────────────────

router.patch("/connectors/:id", requirePermission("assets.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const data = validate(updateConnectorSchema, req.body, res);
  if (!data) return;

  const connector = await prisma.discoveryConnector.update({
    where: { id },
    data:  {
      ...(data.label              !== undefined && { label: data.label }),
      ...(data.isEnabled          !== undefined && { isEnabled: data.isEnabled }),
      ...(data.scheduleExpression !== undefined && { scheduleExpression: data.scheduleExpression }),
      ...(data.syncPolicy         !== undefined && { syncPolicy: data.syncPolicy }),
      ...(data.config             !== undefined && { config: data.config as Prisma.InputJsonValue }),
      ...(data.description        !== undefined && { description: data.description }),
    },
    select: CONNECTOR_SELECT,
  });

  res.json({ ...connector, recentRun: connector.syncRuns[0] ?? null, syncRuns: undefined });
});

// ── DELETE /connectors/:id ────────────────────────────────────────────────────

router.delete("/connectors/:id", requirePermission("assets.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  await prisma.discoveryConnector.delete({ where: { id } });
  res.status(204).end();
});

// ── POST /connectors/:id/sync (trigger manual sync) ──────────────────────────

router.post("/connectors/:id/sync", requirePermission("assets.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const connector = await prisma.discoveryConnector.findUnique({
    where:  { id },
    select: { id: true, source: true, isEnabled: true },
  });

  if (!connector)          return res.status(404).json({ error: "Connector not found" });
  if (!connector.isEnabled) return res.status(422).json({ error: "Connector is disabled." });

  if (connector.source === "csv") {
    return res.status(422).json({
      error: "CSV connector does not support triggered syncs. Use POST /api/discovery/import/csv instead.",
    });
  }

  const run = await prisma.discoverySyncRun.create({
    data: {
      connectorId:      id,
      source:           connector.source,
      triggerType:      "manual",
      triggeredByUserId: req.user.id,
      status:           "pending",
    },
    select: { id: true },
  });

  const jobId = await enqueueSyncJob(boss, run.id);

  if (jobId) {
    await prisma.discoverySyncRun.update({ where: { id: run.id }, data: { jobId } });
  }

  res.status(202).json({ syncRunId: run.id, jobId: jobId ?? null });
});

// ── GET /runs ─────────────────────────────────────────────────────────────────

router.get("/runs", requirePermission("assets.view"), async (req, res) => {
  const q = validate(listSyncRunsQuerySchema, req.query, res);
  if (!q) return;

  const where: Prisma.DiscoverySyncRunWhereInput = {};
  if (q.source)      where.source      = q.source;
  if (q.connectorId) where.connectorId = q.connectorId;
  if (q.status)      where.status      = q.status as any;

  const skip = (q.page - 1) * q.pageSize;
  const [runs, total] = await Promise.all([
    prisma.discoverySyncRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take:    q.pageSize,
      select:  RUN_SUMMARY_SELECT,
    }),
    prisma.discoverySyncRun.count({ where }),
  ]);

  res.json({
    items:      runs.map(normaliseRun),
    total,
    page:       q.page,
    pageSize:   q.pageSize,
    totalPages: Math.ceil(total / q.pageSize),
  });
});

// ── GET /runs/:id ─────────────────────────────────────────────────────────────

router.get("/runs/:id", requirePermission("assets.view"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const run = await prisma.discoverySyncRun.findUnique({
    where:  { id },
    select: {
      ...RUN_SUMMARY_SELECT,
      errors: {
        orderBy: { createdAt: "asc" },
        take:    200,
        select:  { id: true, externalId: true, errorMessage: true, rawData: true, createdAt: true },
      },
    },
  });

  if (!run) return res.status(404).json({ error: "Sync run not found" });

  const { _count, connector, errors, ...rest } = run;
  const durationMs = rest.startedAt && rest.completedAt
    ? rest.completedAt.getTime() - rest.startedAt.getTime()
    : null;

  res.json({
    ...rest,
    durationMs,
    connectorId:    connector.id,
    connectorLabel: connector.label,
    errorCount:     _count.errors,
    errors,
  });
});

// ── GET /import/csv/template — download Excel import template ─────────────────

router.get("/import/csv/template", requirePermission("assets.view"), async (_req, res) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Zentra ITSM";
  wb.created = new Date();

  const ws = wb.addWorksheet("Asset Import", { views: [{ state: "frozen", ySplit: 2 }] });

  const COLS = [
    { key: "externalId",      header: "externalId *",      width: 22, note: "Required. Unique ID for upsert identity (e.g. serial number, BIOS UUID, or your own ID)." },
    { key: "name",            header: "name *",             width: 32, note: "Required. Human-readable asset name." },
    { key: "type",            header: "type",               width: 14, note: "Optional. One of: computer, printer, network, software, other. Defaults to 'other'." },
    { key: "serialNumber",    header: "serialNumber",       width: 22, note: "Hardware serial number (alias: serial_number, serial)." },
    { key: "assetTag",        header: "assetTag",           width: 16, note: "Barcode or asset tag label (alias: asset_tag, tag)." },
    { key: "manufacturer",    header: "manufacturer",       width: 20, note: "Make / manufacturer name (alias: make)." },
    { key: "model",           header: "model",              width: 24, note: "Model name or number." },
    { key: "status",          header: "status",             width: 14, note: "One of: active, in_repair, retired, lost." },
    { key: "condition",       header: "condition",          width: 14, note: "One of: new, good, fair, poor." },
    { key: "location",        header: "location",           width: 24, note: "Physical location or room number." },
    { key: "site",            header: "site",               width: 20, note: "Site or building name." },
    { key: "assignedToEmail", header: "assignedToEmail",   width: 30, note: "Email of the assigned user (alias: assigned_to_email, email). Must match an existing agent account." },
  ] as const;

  ws.columns = COLS.map(c => ({ key: c.key, width: c.width }));

  // Row 1: field descriptions (light grey, italic, smaller font)
  const descRow = ws.addRow(COLS.map(c => c.note));
  descRow.height = 45;
  descRow.eachCell((cell) => {
    cell.font       = { italic: true, size: 8, color: { argb: "FF6B7280" } };
    cell.fill       = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
    cell.alignment  = { wrapText: true, vertical: "top" };
    cell.border     = { bottom: { style: "thin", color: { argb: "FFE5E7EB" } } };
  });

  // Row 2: column headers (indigo background, white bold text)
  const headerRow = ws.addRow(COLS.map(c => c.header));
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font      = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border    = { bottom: { style: "medium", color: { argb: "FF3730A3" } } };
  });

  // Freeze after the header row (rows 1 + 2)
  ws.views = [{ state: "frozen", ySplit: 2, xSplit: 0 }];

  // Row 3+: example data rows
  const examples = [
    {
      externalId: "ASSET-001", name: "MacBook Pro 16-inch (2023)", type: "computer",
      serialNumber: "C02X1234JKLM", assetTag: "TAG-001", manufacturer: "Apple",
      model: "MacBook Pro 16 M3 Max", status: "active", condition: "good",
      location: "Floor 2, Desk 24", site: "HQ Building", assignedToEmail: "jane.doe@company.com",
    },
    {
      externalId: "ASSET-002", name: "HP LaserJet Pro M404dn", type: "printer",
      serialNumber: "VNB3Q01234", assetTag: "TAG-002", manufacturer: "HP",
      model: "LaserJet Pro M404dn", status: "active", condition: "good",
      location: "Floor 1, Print Room", site: "HQ Building", assignedToEmail: "",
    },
    {
      externalId: "ASSET-003", name: "Cisco Catalyst 9200 Switch", type: "network",
      serialNumber: "FCW2345A678", assetTag: "TAG-003", manufacturer: "Cisco",
      model: "Catalyst 9200-24P", status: "active", condition: "good",
      location: "Server Room", site: "HQ Building", assignedToEmail: "",
    },
  ];

  examples.forEach((row, i) => {
    const r = ws.addRow(row);
    r.height = 18;
    r.eachCell((cell) => {
      cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: i % 2 === 0 ? "FFFFFFFF" : "FFF8FAFF" } };
      cell.font      = { size: 10 };
      cell.alignment = { vertical: "middle" };
    });
  });

  // Required columns get a light amber tint for the header cells
  [1, 2].forEach(colIdx => {
    const cell = headerRow.getCell(colIdx);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6D28D9" } };
  });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="asset-import-template.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

// ── POST /import/csv ─────────────────────────────────────────────────────────
// Accepts both CSV (text/plain) and Excel (xlsx/xls) files.

router.post(
  "/import/csv",
  requirePermission("assets.manage"),
  parseImportBody,
  async (req, res) => {
    const opts = validate(csvImportOptionsSchema, req.query, res);
    if (!opts) return;

    const buf = req.body as Buffer;
    if (!buf || buf.length === 0) {
      return res.status(400).json({ error: "No file body received" });
    }

    let csvContent: string;
    if (isXlsxBuffer(buf)) {
      csvContent = await xlsxBufferToCSV(buf);
    } else {
      csvContent = buf.toString("utf8").trim();
    }

    if (!csvContent.trim()) {
      return res.status(400).json({ error: "File is empty or could not be parsed" });
    }

    // Ensure a connector exists for this source slug
    let connector = await prisma.discoveryConnector.findUnique({
      where: { source: opts.source },
      select: { id: true },
    });

    if (!connector) {
      // Auto-create a CSV connector if one doesn't exist yet
      connector = await prisma.discoveryConnector.create({
        data: {
          source:      opts.source,
          label:       opts.source === "csv" ? "CSV Import" : `CSV — ${opts.source}`,
          isEnabled:   true,
          syncPolicy:  opts.syncPolicy,
          createdById: req.user.id,
        },
        select: { id: true },
      });
    }

    const result = await createAndRunSync({
      connectorId:       connector.id,
      source:            opts.source,
      triggerType:       "import",
      triggeredByUserId: req.user.id,
      csvContent,
    });

    res.json(result);
  },
);

// ── POST /import/csv/validate ─────────────────────────────────────────────────

router.post(
  "/import/csv/validate",
  requirePermission("assets.manage"),
  parseImportBody,
  async (req, res) => {
    const buf = req.body as Buffer;
    if (!buf || buf.length === 0) {
      return res.status(400).json({ error: "No file body received" });
    }

    let csvContent: string;
    if (isXlsxBuffer(buf)) {
      csvContent = await xlsxBufferToCSV(buf);
    } else {
      csvContent = buf.toString("utf8").trim();
    }

    if (!csvContent.trim()) {
      return res.status(400).json({ error: "File is empty or could not be parsed" });
    }

    const report = validateCsvContent(csvContent);
    res.json(report);
  },
);

export default router;
