import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requireAdmin } from "../middleware/require-admin";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import { createMacroSchema, updateMacroSchema } from "core/schemas/macros.ts";
import prisma from "../db";

const router = Router();

const MACRO_SELECT = {
  id: true,
  title: true,
  body: true,
  category: true,
  isActive: true,
  createdById: true,
  createdBy: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} as const;

// List macros.
// Agents see only active macros (for the reply picker).
// Admins see all macros (for the management UI).
router.get("/", requireAuth, async (req, res) => {
  const isAdmin = req.user.role === "admin";
  const macros = await prisma.macro.findMany({
    where: isAdmin ? undefined : { isActive: true },
    select: MACRO_SELECT,
    orderBy: [{ isActive: "desc" }, { title: "asc" }],
  });
  res.json({ macros });
});

// Create a macro — admin only.
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const data = validate(createMacroSchema, req.body, res);
  if (!data) return;

  const macro = await prisma.macro.create({
    data: {
      title: data.title,
      body: data.body,
      category: data.category ?? null,
      isActive: data.isActive ?? true,
      createdById: req.user.id,
    },
    select: MACRO_SELECT,
  });

  res.status(201).json(macro);
});

// Update a macro — admin only.
router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid macro ID" });
    return;
  }

  const data = validate(updateMacroSchema, req.body, res);
  if (!data) return;

  const existing = await prisma.macro.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Macro not found" });
    return;
  }

  const macro = await prisma.macro.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.body !== undefined && { body: data.body }),
      ...("category" in data && { category: data.category ?? null }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
    select: MACRO_SELECT,
  });

  res.json(macro);
});

// Delete a macro — admin only. Hard delete: macros have no FK dependants.
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid macro ID" });
    return;
  }

  const existing = await prisma.macro.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Macro not found" });
    return;
  }

  await prisma.macro.delete({ where: { id } });
  res.status(204).send();
});

export default router;
