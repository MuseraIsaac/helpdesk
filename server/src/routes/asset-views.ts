import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import { Role } from "core/constants/role.ts";
import {
  createSavedAssetViewSchema,
  updateSavedAssetViewSchema,
} from "core/schemas/asset-view.ts";
import prisma from "../db";

const router = Router();
router.use(requireAuth);

// GET /api/asset-views
router.get("/", async (req, res) => {
  const [personal, shared] = await Promise.all([
    prisma.savedAssetView.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.savedAssetView.findMany({
      where: { isShared: true, userId: { not: req.user.id } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  res.json({ personal, shared });
});

// POST /api/asset-views
router.post("/", async (req, res) => {
  const data = validate(createSavedAssetViewSchema, req.body, res);
  if (!data) return;

  if (data.isShared && req.user.role !== Role.admin) {
    res.status(403).json({ error: "Only admins can create shared views" });
    return;
  }

  if (data.setAsDefault) {
    await prisma.savedAssetView.updateMany({
      where: { userId: req.user.id, isDefault: true },
      data:  { isDefault: false },
    });
  }

  const view = await prisma.savedAssetView.create({
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

// POST /api/asset-views/clear-default  (must precede /:id)
router.post("/clear-default", async (req, res) => {
  await prisma.savedAssetView.updateMany({
    where: { userId: req.user.id, isDefault: true },
    data:  { isDefault: false },
  });
  res.json({ ok: true });
});

// GET /api/asset-views/:id
router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid view ID" }); return; }

  const view = await prisma.savedAssetView.findUnique({ where: { id } });
  if (!view) { res.status(404).json({ error: "View not found" }); return; }

  if (view.userId !== req.user.id && !view.isShared) {
    res.status(404).json({ error: "View not found" }); return;
  }

  res.json({ view });
});

// PUT /api/asset-views/:id
router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid view ID" }); return; }

  const data = validate(updateSavedAssetViewSchema, req.body, res);
  if (!data) return;

  const existing = await prisma.savedAssetView.findUnique({ where: { id } });
  if (!existing || existing.userId !== req.user.id) {
    res.status(404).json({ error: "View not found" }); return;
  }

  const view = await prisma.savedAssetView.update({
    where: { id },
    data: {
      ...(data.name   !== undefined && { name: data.name }),
      ...(data.emoji  !== undefined && { emoji: data.emoji }),
      ...(data.config !== undefined && { config: data.config as object }),
    },
  });

  res.json({ view });
});

// DELETE /api/asset-views/:id
router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid view ID" }); return; }

  const existing = await prisma.savedAssetView.findUnique({ where: { id } });
  if (!existing || existing.userId !== req.user.id) {
    res.status(404).json({ error: "View not found" }); return;
  }

  await prisma.savedAssetView.delete({ where: { id } });
  res.status(204).send();
});

// POST /api/asset-views/:id/set-default
router.post("/:id/set-default", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid view ID" }); return; }

  const view = await prisma.savedAssetView.findUnique({ where: { id } });
  if (!view || view.userId !== req.user.id) {
    res.status(404).json({ error: "View not found" }); return;
  }

  await prisma.savedAssetView.updateMany({
    where: { userId: req.user.id, isDefault: true },
    data:  { isDefault: false },
  });
  await prisma.savedAssetView.update({ where: { id }, data: { isDefault: true } });

  res.json({ ok: true });
});

export default router;
