/**
 * Demo Data API Routes
 *
 * Every endpoint is double-gated:
 *   1. requireAuth + requireAdmin  — only admin-role users
 *   2. requireDemoEnabled          — the enableDemoDataTools setting must be on
 *
 * GET    /api/demo-data/modules            — module metadata for the UI
 * GET    /api/demo-data/batches            — list all batches (newest first)
 * GET    /api/demo-data/batches/:id        — single batch (for progress polling)
 * GET    /api/demo-data/batches/:id/preview— live record counts before deletion
 * POST   /api/demo-data/generate           — start an async generation run (202)
 * DELETE /api/demo-data/batches/:id        — delete one batch safely (202 async)
 * DELETE /api/demo-data/batches            — delete ALL ready/error batches (202)
 * GET    /api/demo-data/template           — download Excel template
 */

import { Router } from "express";
import { requireAuth }  from "../middleware/require-auth";
import { requireAdmin } from "../middleware/require-admin";
import { parseId }      from "../lib/parse-id";
import { getSection }   from "../lib/settings";
import prisma           from "../db";
import { runGenerator } from "../lib/demo-data/generator";
import {
  previewBatchDeletion,
  deleteDemoBatch,
  deleteAllDemoBatches,
} from "../lib/demo-data/deleter";
import { buildExcelTemplate } from "../lib/demo-data/excel";
import {
  ALL_MODULE_KEYS, MODULE_META,
  type ModuleKey, type GeneratorSize,
} from "../lib/demo-data/types";

const router = Router();

// ── Guard — feature must be enabled in settings ───────────────────────────────

async function requireDemoEnabled(
  _req: import("express").Request,
  res:  import("express").Response,
  next: import("express").NextFunction,
) {
  const settings = await getSection("demo_data");
  if (!settings.enableDemoDataTools) {
    res.status(403).json({
      error: "Demo Data Tools are not enabled. A Super Admin must enable them in Settings → Demo Data first.",
    });
    return;
  }
  next();
}

// ── GET /api/demo-data/modules ────────────────────────────────────────────────

router.get("/modules", requireAuth, requireAdmin, requireDemoEnabled, (_req, res) => {
  res.json({ modules: ALL_MODULE_KEYS.map((key) => ({ key, ...MODULE_META[key] })) });
});

// ── GET /api/demo-data/batches ────────────────────────────────────────────────

router.get("/batches", requireAuth, requireAdmin, requireDemoEnabled, async (_req, res) => {
  const batches = await prisma.demoBatch.findMany({ orderBy: { createdAt: "desc" } });
  res.json({ batches });
});

// ── GET /api/demo-data/batches/:id ────────────────────────────────────────────

router.get("/batches/:id", requireAuth, requireAdmin, requireDemoEnabled, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid batch ID" }); return; }
  const batch = await prisma.demoBatch.findUnique({ where: { id } });
  if (!batch) { res.status(404).json({ error: "Batch not found" }); return; }
  res.json({ batch });
});

// ── GET /api/demo-data/batches/:id/preview ────────────────────────────────────
// Returns live record counts for the confirmation dialog before deletion.

router.get("/batches/:id/preview", requireAuth, requireAdmin, requireDemoEnabled, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid batch ID" }); return; }

  const batch = await prisma.demoBatch.findUnique({ where: { id } });
  if (!batch)                     { res.status(404).json({ error: "Batch not found" }); return; }
  if (batch.status === "deleted") { res.status(409).json({ error: "Batch is already deleted" }); return; }

  const preview = await previewBatchDeletion(id);
  res.json({ preview });
});

// ── POST /api/demo-data/generate ─────────────────────────────────────────────

router.post("/generate", requireAuth, requireAdmin, requireDemoEnabled, async (req, res) => {
  const size: GeneratorSize = ["small","medium","large"].includes(req.body?.size)
    ? (req.body.size as GeneratorSize)
    : "medium";

  const rawModules: unknown = req.body?.modules;
  let modules: ModuleKey[];
  if (rawModules === "all" || !Array.isArray(rawModules) || rawModules.length === 0) {
    modules = [...ALL_MODULE_KEYS];
  } else {
    modules = (rawModules as string[]).filter((m): m is ModuleKey => ALL_MODULE_KEYS.includes(m as ModuleKey));
    if (modules.length > 0 && !modules.includes("foundation")) modules.unshift("foundation");
  }

  const label = (req.body?.label as string | undefined)?.trim()
    || `Demo Batch — ${size.charAt(0).toUpperCase() + size.slice(1)} · ${new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;

  const batch = await prisma.demoBatch.create({
    data: {
      label, status: "generating",
      generatedById: req.user.id, generatedByName: req.user.name,
      size, modules: modules as unknown as object,
    },
  });

  res.status(202).json({ batch });

  runGenerator({ batchId: batch.id, adminId: req.user.id, adminName: req.user.name, size, modules })
    .catch(async (err) => {
      console.error("[demo-gen] Fatal error:", err);
      await prisma.demoBatch.update({
        where: { id: batch.id },
        data:  { status: "error", errorMessage: err instanceof Error ? err.message : String(err) },
      }).catch(() => {});
    });
});

// ── DELETE /api/demo-data/batches/:id ────────────────────────────────────────
// Requires the batch to be in "ready" or "error" state.
// Body: { force?: boolean }  — required to delete an "error" batch without preview

router.delete("/batches/:id", requireAuth, requireAdmin, requireDemoEnabled, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid batch ID" }); return; }

  const batch = await prisma.demoBatch.findUnique({ where: { id } });
  if (!batch)                        { res.status(404).json({ error: "Batch not found" }); return; }
  if (batch.status === "deleted")    { res.status(409).json({ error: "Batch is already deleted" }); return; }
  if (batch.status === "generating") { res.status(409).json({ error: "Batch is still generating — wait for it to complete" }); return; }
  if (batch.status === "deleting")   { res.status(409).json({ error: "Deletion is already in progress" }); return; }
  if (batch.status === "error" && !req.body?.force) {
    res.status(409).json({ error: "Batch is in error state. Include { force: true } in the request body to delete anyway." });
    return;
  }

  const actor = { id: req.user.id, name: req.user.name };

  // Acknowledge immediately — deletion runs async to avoid gateway timeouts on large batches
  res.status(202).json({ message: "Deletion started", batchId: id });

  deleteDemoBatch(id, actor).catch((err) =>
    console.error(`[demo-delete] Batch ${id} failed:`, err)
  );
});

// ── DELETE /api/demo-data/batches — delete ALL ready / error batches ──────────
// Requires body: { confirmToken: "DELETE ALL" }
// The server validates the confirm token to prevent accidental bulk deletion
// from scripts or API clients that bypass the UI confirmation dialog.

router.delete("/batches", requireAuth, requireAdmin, requireDemoEnabled, async (req, res) => {
  if (req.body?.confirmToken !== "DELETE ALL") {
    res.status(400).json({
      error: 'Missing or incorrect confirmToken. Pass { confirmToken: "DELETE ALL" } to confirm this destructive action.',
    });
    return;
  }

  // Count candidates before starting so the response is informative
  const candidateCount = await prisma.demoBatch.count({
    where: { status: { in: ["ready", "error"] } },
  });

  if (candidateCount === 0) {
    res.status(200).json({ message: "No batches to delete", deleted: 0 });
    return;
  }

  const actor = { id: req.user.id, name: req.user.name };

  res.status(202).json({ message: "Bulk deletion started", batchCount: candidateCount });

  deleteAllDemoBatches(actor).catch((err) =>
    console.error("[demo-delete-all] Fatal error:", err)
  );
});

// ── GET /api/demo-data/template ───────────────────────────────────────────────

router.get("/template", requireAuth, requireAdmin, requireDemoEnabled, async (_req, res) => {
  const buffer   = await buildExcelTemplate();
  const filename = `itsm-demo-data-template-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
});

export default router;
