/**
 * Custom SaaS-category management.
 *
 * Provides admin-defined extensions to the built-in SaaSCategory enum. The
 * built-in values are static (compiled into TypeScript / Prisma) and never
 * change; everything in this router operates on the parallel
 * `saas_custom_category` table. Subscription rows reference custom rows via
 * `customCategoryId`.
 */

import { Router } from "express";
import { z } from "zod/v4";
import prisma from "../db";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";

const router = Router();

const createSchema = z.object({
  name:  z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex code like #7c3aed").optional().nullable(),
});

const updateSchema = z.object({
  name:     z.string().trim().min(1).max(120).optional(),
  color:    z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  isActive: z.boolean().optional(),
});

// GET /api/saas-categories — return all custom categories (active + inactive
// are both returned so admins can manage; clients filter for pickers).
router.get("/", requireAuth, requirePermission("software.view"), async (_req, res) => {
  const items = await prisma.saaSCustomCategory.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: { id: true, name: true, color: true, isActive: true, createdAt: true },
  });
  res.json({ items });
});

// POST /api/saas-categories — create a new custom category.
router.post("/", requireAuth, requirePermission("software.manage"), async (req, res) => {
  const data = validate(createSchema, req.body, res);
  if (!data) return;

  const exists = await prisma.saaSCustomCategory.findUnique({ where: { name: data.name } });
  if (exists) {
    res.status(409).json({ error: "A category with that name already exists" });
    return;
  }

  const created = await prisma.saaSCustomCategory.create({
    data: { name: data.name, color: data.color ?? null, createdById: req.user.id },
    select: { id: true, name: true, color: true, isActive: true, createdAt: true },
  });
  res.status(201).json({ item: created });
});

// PATCH /api/saas-categories/:id — rename, recolor, or (de)activate.
router.patch("/:id", requireAuth, requirePermission("software.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }
  const data = validate(updateSchema, req.body, res);
  if (!data) return;

  if (data.name) {
    const clash = await prisma.saaSCustomCategory.findFirst({
      where: { name: data.name, NOT: { id } },
      select: { id: true },
    });
    if (clash) {
      res.status(409).json({ error: "A category with that name already exists" });
      return;
    }
  }

  try {
    const updated = await prisma.saaSCustomCategory.update({
      where: { id },
      data,
      select: { id: true, name: true, color: true, isActive: true, createdAt: true },
    });
    res.json({ item: updated });
  } catch {
    res.status(404).json({ error: "Category not found" });
  }
});

// DELETE /api/saas-categories/:id — hard delete. Subscriptions referencing
// this category have their `customCategoryId` set to NULL by the FK rule,
// falling back to the built-in `category` enum on the row.
router.delete("/:id", requireAuth, requirePermission("software.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    await prisma.saaSCustomCategory.delete({ where: { id } });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: "Category not found" });
  }
});

export default router;
