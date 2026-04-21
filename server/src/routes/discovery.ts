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

import { Router } from "express";
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

const router = Router();
router.use(requireAuth);

// ── Inline multipart/form-data parser for CSV upload (no multer dep) ─────────
// Uses the raw body; assumes the client sends multipart with one `file` field.
// For production-grade file handling, add multer to server/package.json.

async function readRawBody(req: import("express").Request): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end",  () => resolve(body));
    req.on("error", reject);
  });
}

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

// ── POST /import/csv ──────────────────────────────────────────────────────────

router.post(
  "/import/csv",
  requirePermission("assets.manage"),
  async (req, res) => {
    // Parse options from query string
    const opts = validate(csvImportOptionsSchema, req.query, res);
    if (!opts) return;

    // Read raw body (CSV text)
    const csvContent = await readRawBody(req);
    if (!csvContent.trim()) {
      return res.status(400).json({ error: "Empty CSV body" });
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
  async (req, res) => {
    const csvContent = await readRawBody(req);
    if (!csvContent.trim()) {
      return res.status(400).json({ error: "Empty CSV body" });
    }

    const report = validateCsvContent(csvContent);
    res.json(report);
  },
);

export default router;
