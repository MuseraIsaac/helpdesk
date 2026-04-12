import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import { Role } from "core/constants/role.ts";
import {
  createDashboardSchema,
  updateDashboardSchema,
} from "core/schemas/dashboard.ts";
import prisma from "../db";

const router = Router();
router.use(requireAuth);

// ── List ──────────────────────────────────────────────────────────────────────
// GET /api/dashboards
// Returns the user's personal dashboards, all shared dashboards, and the id
// of their currently-active config (from UserPreference.defaultDashboard).

router.get("/", async (req, res) => {
  const [personal, shared, pref] = await Promise.all([
    prisma.dashboardConfig.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.dashboardConfig.findMany({
      where: { isShared: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.userPreference.findUnique({
      where: { userId: req.user.id },
      select: { defaultDashboard: true },
    }),
  ]);

  // defaultDashboard is "overview" (system default) or a numeric string id
  const raw = pref?.defaultDashboard ?? "overview";
  const defaultDashboardId = /^\d+$/.test(raw) ? Number(raw) : null;

  res.json({ personal, shared, defaultDashboardId });
});

// ── Create ────────────────────────────────────────────────────────────────────
// POST /api/dashboards
// Creates a personal dashboard. Admins may set isShared: true to publish it
// for all users. If setAsDefault is true, updates UserPreference immediately.

router.post("/", async (req, res) => {
  const data = validate(createDashboardSchema, req.body, res);
  if (!data) return;

  // Only admins can create shared dashboards
  if (data.isShared && req.user.role !== Role.admin) {
    res.status(403).json({ error: "Only admins can create shared dashboards" });
    return;
  }

  const dashboard = await prisma.dashboardConfig.create({
    data: {
      userId:   req.user.id,
      name:     data.name,
      isShared: data.isShared,
      config:   data.config as object,
    },
  });

  if (data.setAsDefault) {
    await prisma.userPreference.upsert({
      where:  { userId: req.user.id },
      create: { userId: req.user.id, defaultDashboard: String(dashboard.id) },
      update: { defaultDashboard: String(dashboard.id) },
    });
  }

  res.status(201).json({ dashboard });
});

// ── Get single ────────────────────────────────────────────────────────────────
// GET /api/dashboards/:id

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid dashboard ID" }); return; }

  const dashboard = await prisma.dashboardConfig.findUnique({ where: { id } });
  if (!dashboard) { res.status(404).json({ error: "Dashboard not found" }); return; }

  const canView =
    dashboard.userId === req.user.id || dashboard.isShared;
  if (!canView) { res.status(404).json({ error: "Dashboard not found" }); return; }

  res.json({ dashboard });
});

// ── Update ────────────────────────────────────────────────────────────────────
// PUT /api/dashboards/:id
// Users can only update their own personal dashboards.
// Admins can also update shared dashboards they created.

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid dashboard ID" }); return; }

  const data = validate(updateDashboardSchema, req.body, res);
  if (!data) return;

  const existing = await prisma.dashboardConfig.findUnique({ where: { id } });
  if (!existing || existing.userId !== req.user.id) {
    res.status(404).json({ error: "Dashboard not found" }); return;
  }

  const dashboard = await prisma.dashboardConfig.update({
    where: { id },
    data: {
      ...(data.name   !== undefined && { name: data.name }),
      ...(data.config !== undefined && { config: data.config as object }),
    },
  });

  res.json({ dashboard });
});

// ── Delete ────────────────────────────────────────────────────────────────────
// DELETE /api/dashboards/:id
// Users can delete their own personal dashboards.
// If the deleted dashboard was the user's default, resets defaultDashboard to "overview".

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid dashboard ID" }); return; }

  const existing = await prisma.dashboardConfig.findUnique({ where: { id } });
  if (!existing || existing.userId !== req.user.id) {
    res.status(404).json({ error: "Dashboard not found" }); return;
  }

  await prisma.dashboardConfig.delete({ where: { id } });

  // If this was the user's active default, reset to system default
  await prisma.userPreference.updateMany({
    where:  { userId: req.user.id, defaultDashboard: String(id) },
    data:   { defaultDashboard: "overview" },
  });

  res.status(204).send();
});

// ── Set as default ────────────────────────────────────────────────────────────
// POST /api/dashboards/:id/set-default
// Sets any accessible dashboard (personal or shared) as the user's active default.

router.post("/:id/set-default", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid dashboard ID" }); return; }

  const dashboard = await prisma.dashboardConfig.findUnique({ where: { id } });
  const canAccess = dashboard && (dashboard.userId === req.user.id || dashboard.isShared);
  if (!canAccess) { res.status(404).json({ error: "Dashboard not found" }); return; }

  await prisma.userPreference.upsert({
    where:  { userId: req.user.id },
    create: { userId: req.user.id, defaultDashboard: String(id) },
    update: { defaultDashboard: String(id) },
  });

  res.json({ ok: true });
});

export default router;
