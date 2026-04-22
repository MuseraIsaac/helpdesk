import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import { Role } from "core/constants/role.ts";
import {
  createSavedViewSchema,
  updateSavedViewSchema,
} from "core/schemas/ticket-view.ts";
import prisma from "../db";

const router = Router();
router.use(requireAuth);

// ── List ──────────────────────────────────────────────────────────────────────
// GET /api/ticket-views
// Returns personal views (owned by user) and all shared views.
// The active default is whichever personal view has isDefault: true.

router.get("/", async (req, res) => {
  const [personal, shared] = await Promise.all([
    prisma.savedTicketView.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.savedTicketView.findMany({
      where: { isShared: true, userId: { not: req.user.id } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  res.json({ personal, shared });
});

// ── Create ────────────────────────────────────────────────────────────────────
// POST /api/ticket-views

router.post("/", async (req, res) => {
  const data = validate(createSavedViewSchema, req.body, res);
  if (!data) return;

  if (data.isShared && req.user.role !== Role.admin) {
    res.status(403).json({ error: "Only admins can create shared views" });
    return;
  }

  // If setAsDefault, unset any existing personal default first
  if (data.setAsDefault) {
    await prisma.savedTicketView.updateMany({
      where: { userId: req.user.id, isDefault: true },
      data:  { isDefault: false },
    });
  }

  const view = await prisma.savedTicketView.create({
    data: {
      userId:    req.user.id,
      name:      data.name,
      emoji:     data.emoji ?? null,
      isShared:  data.isShared,
      isDefault: data.setAsDefault,
      config:    data.config as object,
    },
  });

  res.status(201).json({ view });
});

// ── Clear default (specific route must precede /:id) ──────────────────────────
// POST /api/ticket-views/clear-default
// Reverts the user to the system default view.

router.post("/clear-default", async (req, res) => {
  await prisma.savedTicketView.updateMany({
    where: { userId: req.user.id, isDefault: true },
    data:  { isDefault: false },
  });
  res.json({ ok: true });
});

// ── Get single ────────────────────────────────────────────────────────────────
// GET /api/ticket-views/:id

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid view ID" }); return; }

  const view = await prisma.savedTicketView.findUnique({ where: { id } });
  if (!view) { res.status(404).json({ error: "View not found" }); return; }

  const canView = view.userId === req.user.id || view.isShared;
  if (!canView) { res.status(404).json({ error: "View not found" }); return; }

  res.json({ view });
});

// ── Update ────────────────────────────────────────────────────────────────────
// PUT /api/ticket-views/:id
// Users can only update their own personal views.

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid view ID" }); return; }

  const data = validate(updateSavedViewSchema, req.body, res);
  if (!data) return;

  const existing = await prisma.savedTicketView.findUnique({ where: { id } });
  if (!existing || existing.userId !== req.user.id) {
    res.status(404).json({ error: "View not found" }); return;
  }

  // Only admins/supervisors can share views
  const canShare = req.user.role === "admin" || req.user.role === "supervisor";

  const view = await prisma.savedTicketView.update({
    where: { id },
    data: {
      ...(data.name     !== undefined && { name: data.name }),
      ...(data.emoji    !== undefined && { emoji: data.emoji }),
      ...(data.config   !== undefined && { config: data.config as object }),
      ...(data.isShared !== undefined && canShare && { isShared: data.isShared }),
    },
  });

  res.json({ view });
});

// ── Delete ────────────────────────────────────────────────────────────────────
// DELETE /api/ticket-views/:id
// Users can delete their own personal views.

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid view ID" }); return; }

  const existing = await prisma.savedTicketView.findUnique({ where: { id } });
  if (!existing || existing.userId !== req.user.id) {
    res.status(404).json({ error: "View not found" }); return;
  }

  await prisma.savedTicketView.delete({ where: { id } });

  res.status(204).send();
});

// ── Set as default ────────────────────────────────────────────────────────────
// POST /api/ticket-views/:id/set-default
// Sets an owned personal view as the user's active column layout.

router.post("/:id/set-default", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid view ID" }); return; }

  const view = await prisma.savedTicketView.findUnique({ where: { id } });
  if (!view || view.userId !== req.user.id) {
    res.status(404).json({ error: "View not found" }); return;
  }

  // Unset all existing defaults, then set this one
  await prisma.savedTicketView.updateMany({
    where: { userId: req.user.id, isDefault: true },
    data:  { isDefault: false },
  });
  await prisma.savedTicketView.update({
    where: { id },
    data:  { isDefault: true },
  });

  res.json({ ok: true });
});

export default router;
