import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import {
  createTemplateSchema,
  updateTemplateSchema,
  listTemplatesQuerySchema,
} from "core/schemas/templates.ts";
import prisma from "../db";

const router = Router();

const TEMPLATE_SELECT = {
  id: true,
  title: true,
  body: true,
  bodyHtml: true,
  type: true,
  isActive: true,
  createdById: true,
  createdBy: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} as const;

router.get("/", requireAuth, requirePermission("templates.manage"), async (req, res) => {
  const query = listTemplatesQuerySchema.safeParse(req.query);
  const typeFilter = query.success && query.data.type ? query.data.type : undefined;

  const templates = await prisma.template.findMany({
    where: typeFilter ? { type: typeFilter as any } : undefined,
    select: TEMPLATE_SELECT,
    orderBy: [{ isActive: "desc" }, { type: "asc" }, { title: "asc" }],
  });
  res.json({ templates });
});

router.post("/", requireAuth, requirePermission("templates.manage"), async (req, res) => {
  const data = validate(createTemplateSchema, req.body, res);
  if (!data) return;

  const template = await prisma.template.create({
    data: {
      title: data.title,
      body: data.body,
      bodyHtml: data.bodyHtml ?? null,
      type: data.type as any,
      isActive: data.isActive ?? true,
      createdById: req.user.id,
    },
    select: TEMPLATE_SELECT,
  });

  res.status(201).json(template);
});

router.put("/:id", requireAuth, requirePermission("templates.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid template ID" });
    return;
  }

  const data = validate(updateTemplateSchema, req.body, res);
  if (!data) return;

  const existing = await prisma.template.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  const template = await prisma.template.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.body !== undefined && { body: data.body }),
      ...("bodyHtml" in data && { bodyHtml: data.bodyHtml ?? null }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
    select: TEMPLATE_SELECT,
  });

  res.json(template);
});

router.delete("/:id", requireAuth, requirePermission("templates.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid template ID" });
    return;
  }

  const existing = await prisma.template.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  await prisma.template.delete({ where: { id } });
  res.status(204).send();
});

export default router;
