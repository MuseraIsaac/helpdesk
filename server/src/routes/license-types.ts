/**
 * Custom license-type management — same shape as saas-categories.ts but for
 * SoftwareLicense.customLicenseTypeId. See that file's header comment for
 * conventions.
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

router.get("/", requireAuth, requirePermission("software.view"), async (_req, res) => {
  const items = await prisma.licenseCustomType.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: { id: true, name: true, color: true, isActive: true, createdAt: true },
  });
  res.json({ items });
});

router.post("/", requireAuth, requirePermission("software.manage"), async (req, res) => {
  const data = validate(createSchema, req.body, res);
  if (!data) return;

  const exists = await prisma.licenseCustomType.findUnique({ where: { name: data.name } });
  if (exists) {
    res.status(409).json({ error: "A license type with that name already exists" });
    return;
  }

  const created = await prisma.licenseCustomType.create({
    data: { name: data.name, color: data.color ?? null, createdById: req.user.id },
    select: { id: true, name: true, color: true, isActive: true, createdAt: true },
  });
  res.status(201).json({ item: created });
});

router.patch("/:id", requireAuth, requirePermission("software.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }
  const data = validate(updateSchema, req.body, res);
  if (!data) return;

  if (data.name) {
    const clash = await prisma.licenseCustomType.findFirst({
      where: { name: data.name, NOT: { id } },
      select: { id: true },
    });
    if (clash) {
      res.status(409).json({ error: "A license type with that name already exists" });
      return;
    }
  }

  try {
    const updated = await prisma.licenseCustomType.update({
      where: { id },
      data,
      select: { id: true, name: true, color: true, isActive: true, createdAt: true },
    });
    res.json({ item: updated });
  } catch {
    res.status(404).json({ error: "License type not found" });
  }
});

router.delete("/:id", requireAuth, requirePermission("software.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    await prisma.licenseCustomType.delete({ where: { id } });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: "License type not found" });
  }
});

export default router;
