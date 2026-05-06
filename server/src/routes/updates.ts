/**
 * /api/updates — full Phase 3+ surface.
 *
 *   GET    /api/updates/current               — bundled manifest + installed history
 *   GET    /api/updates/check                 — hits the release server (HMAC-signed)
 *   GET    /api/updates/history               — recent app_version transitions
 *   GET    /api/updates/runs                  — recent UpdateRun rows (live + finished)
 *   GET    /api/updates/runs/:id              — single run + most recent events
 *   GET    /api/updates/runs/:id/stream       — SSE: live events as they happen
 *   POST   /api/updates/apply                 — start an apply attempt
 *   POST   /api/updates/runs/:id/cancel       — cancel a queued / preflight run
 *   POST   /api/updates/runs/:id/rollback     — restore from this run's backup (stub)
 *   GET    /api/updates/channel               — read settings (secret redacted)
 *   PATCH  /api/updates/channel               — update baseUrl / channel / autoCheck
 *   POST   /api/updates/channel/regenerate    — mint a new install secret
 */
import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../middleware/require-auth";
import { requireAdmin } from "../middleware/require-admin";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import { loadBundledManifest } from "../lib/release";
import {
  getChannelConfig, setChannelConfig, ensureChannelProvisioned, fetchLatestManifest,
  enrollWithLicense, clearEnrollment,
} from "../lib/update-channel";
import { enqueueApplyUpdate } from "../lib/update-orchestrator";
import { logSystemAudit } from "../lib/audit";
import {
  releaseManifestSchema,
  applyUpdateSchema,
  enrollLicenseSchema,
  type CurrentVersionResponse,
  type UpdateCheckResponse,
  type AppVersionRecord,
  type UpdateRunRecord,
  type UpdateRunEventRecord,
  type ReleaseManifest,
  type UpdateChannelSettings,
} from "core/schemas/updates.ts";
import prisma from "../db";

const router = Router();
router.use(requireAuth, requireAdmin);

// ── Shapers ──────────────────────────────────────────────────────────────────

function shapeManifest(raw: unknown): ReleaseManifest {
  const parsed = releaseManifestSchema.safeParse(raw);
  return parsed.success ? parsed.data : (raw as ReleaseManifest);
}

async function buildVersionRecord(row: {
  id: number; version: string; kind: string; fromVersion: string | null;
  manifest: unknown; appliedById: string | null; appliedAt: Date;
}): Promise<AppVersionRecord> {
  let appliedBy: AppVersionRecord["appliedBy"] = null;
  if (row.appliedById) {
    const user = await prisma.user.findUnique({
      where: { id: row.appliedById }, select: { id: true, name: true },
    });
    if (user) appliedBy = user;
  }
  return {
    id: row.id, version: row.version, kind: row.kind as AppVersionRecord["kind"],
    fromVersion: row.fromVersion, manifest: shapeManifest(row.manifest),
    appliedBy, appliedAt: row.appliedAt.toISOString(),
  };
}

async function buildRunRecord(row: {
  id: number; fromVersion: string; toVersion: string; manifest: unknown;
  state: string; currentStep: string | null; errorMessage: string | null;
  errorStep: string | null; backupPath: string | null;
  triggeredById: string | null; createdAt: Date; startedAt: Date | null;
  finishedAt: Date | null; rolledBackAt: Date | null; rollbackOfId: number | null;
}): Promise<UpdateRunRecord> {
  let triggeredBy: UpdateRunRecord["triggeredBy"] = null;
  if (row.triggeredById) {
    const user = await prisma.user.findUnique({
      where: { id: row.triggeredById }, select: { id: true, name: true },
    });
    if (user) triggeredBy = user;
  }
  return {
    id:           row.id,
    fromVersion:  row.fromVersion,
    toVersion:    row.toVersion,
    manifest:     shapeManifest(row.manifest),
    state:        row.state as UpdateRunRecord["state"],
    currentStep:  row.currentStep,
    errorMessage: row.errorMessage,
    errorStep:    row.errorStep,
    backupPath:   row.backupPath,
    triggeredBy,
    createdAt:    row.createdAt.toISOString(),
    startedAt:    row.startedAt?.toISOString()    ?? null,
    finishedAt:   row.finishedAt?.toISOString()   ?? null,
    rolledBackAt: row.rolledBackAt?.toISOString() ?? null,
    rollbackOfId: row.rollbackOfId,
  };
}

function redactChannel(cfg: UpdateChannelSettings) {
  const { installSecret: _, ...rest } = cfg;
  void _;
  return {
    ...rest,
    /** True iff a secret has been issued — surfaces "enrolled" state to the UI. */
    hasSecret: Boolean(cfg.installSecret),
  };
}

// ── GET /api/updates/current ─────────────────────────────────────────────────

router.get("/current", async (_req, res) => {
  const bundled = await loadBundledManifest();
  const latestRow = await prisma.appVersion.findFirst({ orderBy: { appliedAt: "desc" } });
  const installed = latestRow ? await buildVersionRecord(latestRow) : null;
  const pendingFinalize = !!installed && installed.version !== bundled.version;

  const body: CurrentVersionResponse = { bundled, installed, pendingFinalize };
  res.json(body);
});

// ── GET /api/updates/check ───────────────────────────────────────────────────

router.get("/check", async (_req, res) => {
  const bundled = await loadBundledManifest();
  const cfg     = await getChannelConfig();

  if (!cfg.baseUrl) {
    res.json({
      current: bundled.version, latest: null, available: null,
      checkedAt: new Date().toISOString(), status: "disabled",
    } satisfies UpdateCheckResponse);
    return;
  }
  if (!cfg.enrolled || !cfg.installSecret) {
    res.json({
      current: bundled.version, latest: null, available: null,
      checkedAt: new Date().toISOString(),
      status: "error",
      errorMessage: "This install isn't licensed yet. Activate a license key on the Channel tab.",
    } satisfies UpdateCheckResponse);
    return;
  }

  const latest = await fetchLatestManifest();
  if (!latest) {
    const refreshed = await getChannelConfig(); // updated by fetchLatestManifest
    res.json({
      current: bundled.version, latest: null, available: null,
      checkedAt: new Date().toISOString(),
      status: "error",
      errorMessage: refreshed.lastError || "Unable to reach release server",
    } satisfies UpdateCheckResponse);
    return;
  }

  const isNewer = compareSemverNum(latest.version, bundled.version) > 0;
  res.json({
    current: bundled.version,
    latest:  latest.version,
    available: isNewer ? latest : null,
    checkedAt: new Date().toISOString(),
    status: isNewer ? "available" : "ok",
  } satisfies UpdateCheckResponse);
});

// ── GET /api/updates/history ─────────────────────────────────────────────────

router.get("/history", async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const rows = await prisma.appVersion.findMany({ orderBy: { appliedAt: "desc" }, take: limit });
  const records = await Promise.all(rows.map(buildVersionRecord));
  res.json({ events: records, total: records.length });
});

// ── GET /api/updates/runs ────────────────────────────────────────────────────

router.get("/runs", async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const rows = await prisma.updateRun.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  const records = await Promise.all(rows.map(buildRunRecord));
  res.json({ runs: records });
});

// ── GET /api/updates/runs/:id ────────────────────────────────────────────────

router.get("/runs/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid run id" }); return; }

  const row = await prisma.updateRun.findUnique({ where: { id } });
  if (!row) { res.status(404).json({ error: "Run not found" }); return; }

  const events = await prisma.updateRunEvent.findMany({
    where:   { runId: id },
    orderBy: { createdAt: "asc" },
    take:    500,
  });

  const run    = await buildRunRecord(row);
  const evList: UpdateRunEventRecord[] = events.map(e => ({
    id:        e.id,
    level:     e.level as UpdateRunEventRecord["level"],
    step:      e.step,
    message:   e.message,
    data:      e.data as Record<string, unknown> | null,
    createdAt: e.createdAt.toISOString(),
  }));
  res.json({ run, events: evList });
});

// ── GET /api/updates/runs/:id/stream — SSE live progress ─────────────────────

router.get("/runs/:id/stream", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid run id" }); return; }

  res.setHeader("Content-Type",      "text/event-stream");
  res.setHeader("Cache-Control",     "no-cache, no-transform");
  res.setHeader("Connection",        "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let lastEventId = 0;
  let cancelled   = false;

  // Send initial snapshot.
  const sendInitial = async () => {
    const run    = await prisma.updateRun.findUnique({ where: { id } });
    const events = await prisma.updateRunEvent.findMany({
      where: { runId: id }, orderBy: { createdAt: "asc" }, take: 200,
    });
    if (run)    res.write(`event: state\ndata: ${JSON.stringify({ state: run.state, currentStep: run.currentStep })}\n\n`);
    for (const e of events) {
      res.write(`id: ${e.id}\nevent: log\ndata: ${JSON.stringify(e)}\n\n`);
      lastEventId = Math.max(lastEventId, e.id);
    }
  };

  await sendInitial();

  // Poll for new events every 1 s. Lightweight: scoped to this single run id,
  // and the loop exits as soon as the connection closes.
  const tick = async () => {
    while (!cancelled) {
      const fresh = await prisma.updateRunEvent.findMany({
        where:   { runId: id, id: { gt: lastEventId } },
        orderBy: { createdAt: "asc" },
        take:    50,
      });
      for (const e of fresh) {
        res.write(`id: ${e.id}\nevent: log\ndata: ${JSON.stringify(e)}\n\n`);
        lastEventId = e.id;
      }
      const run = await prisma.updateRun.findUnique({
        where: { id }, select: { state: true, currentStep: true },
      });
      if (run) {
        res.write(`event: state\ndata: ${JSON.stringify(run)}\n\n`);
        // Once terminal, send done event and close.
        if (["done", "failed", "cancelled", "rolled_back"].includes(run.state)) {
          res.write(`event: done\ndata: ${JSON.stringify(run)}\n\n`);
          res.end();
          return;
        }
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  };
  void tick();

  const heartbeat = setInterval(() => { if (!cancelled) res.write(": ping\n\n"); }, 20_000);
  req.on("close", () => { cancelled = true; clearInterval(heartbeat); });
});

// ── POST /api/updates/apply ──────────────────────────────────────────────────

router.post("/apply", async (req, res) => {
  const body = validate(applyUpdateSchema, req.body, res);
  if (!body) return;

  // Verify the requested toVersion really is the latest available — this
  // protects against stale UI clicking apply with a version that's already
  // been superseded.
  const bundled = await loadBundledManifest();
  const latest  = await fetchLatestManifest();
  if (!latest) { res.status(503).json({ error: "Could not reach release server" }); return; }
  if (latest.version !== body.toVersion) {
    res.status(409).json({ error: `Latest available is ${latest.version}, not ${body.toVersion}. Refresh and try again.` });
    return;
  }
  if (compareSemverNum(latest.version, bundled.version) <= 0) {
    res.status(400).json({ error: "Already on latest version" });
    return;
  }

  // Refuse if a non-terminal run is already underway.
  const inFlight = await prisma.updateRun.findFirst({
    where: { state: { notIn: ["done", "failed", "cancelled", "rolled_back"] } },
  });
  if (inFlight) {
    res.status(409).json({ error: `Run #${inFlight.id} is already in progress`, runId: inFlight.id });
    return;
  }

  const run = await prisma.updateRun.create({
    data: {
      fromVersion:   bundled.version,
      toVersion:     latest.version,
      manifest:      latest as object,
      state:         "queued",
      triggeredById: req.user!.id,
    },
  });

  await enqueueApplyUpdate(run.id);
  void logSystemAudit(req.user!.id, "settings.updated", {
    section: "update_channel",
    changedFields: ["apply"],
    runId: run.id, fromVersion: bundled.version, toVersion: latest.version,
  });

  res.status(201).json({ runId: run.id });
});

// ── POST /api/updates/runs/:id/cancel ────────────────────────────────────────

router.post("/runs/:id/cancel", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid run id" }); return; }

  const run = await prisma.updateRun.findUnique({ where: { id } });
  if (!run) { res.status(404).json({ error: "Run not found" }); return; }

  // Only safe to cancel before destructive steps (migrate / data_tasks).
  const cancellable = ["queued", "preflight", "backup", "maintenance_on", "fetch", "verify"];
  if (!cancellable.includes(run.state)) {
    res.status(409).json({ error: `Cannot cancel run in state ${run.state}` });
    return;
  }
  await prisma.updateRun.update({
    where: { id }, data: { state: "cancelled", finishedAt: new Date() },
  });
  await prisma.updateRunEvent.create({
    data: { runId: id, level: "warn", step: run.currentStep, message: `Cancelled by ${req.user!.name}` },
  });
  res.json({ ok: true });
});

// ── POST /api/updates/runs/:id/rollback ──────────────────────────────────────
//
// Phase 7 stub: real rollback is operator-driven (pg_restore + redeploy
// previous binary) and outside the scope of an in-process button. We record
// the intent, write an audit row, and return instructions.

router.post("/runs/:id/rollback", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid run id" }); return; }

  const run = await prisma.updateRun.findUnique({ where: { id } });
  if (!run) { res.status(404).json({ error: "Run not found" }); return; }
  if (!run.backupPath) {
    res.status(409).json({ error: "No backup recorded for this run" });
    return;
  }

  await prisma.updateRunEvent.create({
    data: { runId: id, level: "warn", step: "rollback",
      message: `Rollback initiated by ${req.user!.name}. Operator must run: pg_restore -d $DATABASE_URL ${run.backupPath}` },
  });
  res.json({
    ok: true,
    instructions: [
      "Stop the helpdesk service",
      `Restore: pg_restore -d $DATABASE_URL --clean --if-exists ${run.backupPath}`,
      `Redeploy the previous binary (version ${run.fromVersion})`,
      "Restart the helpdesk service",
    ],
  });
});

// ── Channel config ───────────────────────────────────────────────────────────

router.get("/channel", async (_req, res) => {
  const cfg = await getChannelConfig();
  res.json(redactChannel(cfg));
});

const updateChannelPatchSchema = z.object({
  baseUrl:   z.url().or(z.literal("")).optional(),
  channel:   z.enum(["stable", "beta", "nightly"]).optional(),
  autoCheck: z.enum(["off", "hourly", "daily", "weekly"]).optional(),
});

router.patch("/channel", async (req, res) => {
  const body = validate(updateChannelPatchSchema, req.body, res);
  if (!body) return;
  await setChannelConfig(body, req.user!.id);
  void logSystemAudit(req.user!.id, "settings.updated", {
    section: "update_channel",
    changedFields: Object.keys(body),
  });
  const cfg = await getChannelConfig();
  res.json(redactChannel(cfg));
});

// ── License enrollment ──────────────────────────────────────────────────────
//
// Customers paste a license key here. The route forwards it to the configured
// release server's POST /enroll endpoint, receives a per-install HMAC secret
// in return, and persists it. From then on this install is fully self-service
// — checking, applying, and rolling back updates without operator involvement.

router.post("/channel/enroll", async (req, res) => {
  const body = validate(enrollLicenseSchema, req.body, res);
  if (!body) return;
  try {
    const next = await enrollWithLicense(body.licenseKey);
    void logSystemAudit(req.user!.id, "settings.updated", {
      section: "update_channel", changedFields: ["enrolled", "licenseName"],
      licenseName: next.licenseName,
    });
    res.json(redactChannel(next));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Enrollment failed" });
  }
});

router.post("/channel/unenroll", async (req, _res) => {
  const next = await clearEnrollment();
  void logSystemAudit(req.user!.id, "settings.updated", {
    section: "update_channel", changedFields: ["enrolled"],
  });
  _res.json(redactChannel(next));
});

// First-boot mint — useful for testing; usually invoked automatically by boot.
router.post("/channel/provision", async (_req, res) => {
  const cfg = await ensureChannelProvisioned();
  res.json(redactChannel(cfg));
});

export default router;

// ── helpers ──────────────────────────────────────────────────────────────────

function compareSemverNum(a: string, b: string): number {
  const parse = (s: string) => s.split("-")[0]!.split(".").map(n => Number(n) || 0);
  const [aMaj = 0, aMin = 0, aPatch = 0] = parse(a);
  const [bMaj = 0, bMin = 0, bPatch = 0] = parse(b);
  return aMaj - bMaj || aMin - bMin || aPatch - bPatch;
}
