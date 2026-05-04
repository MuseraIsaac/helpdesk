import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import { createCustomFieldSchema, updateCustomFieldSchema } from "core/schemas/custom-fields.ts";
import { formEntityTypeSchema } from "core/schemas/form-definitions.ts";
import type { FormEntityType } from "core/constants/form-fields.ts";
import prisma from "../db";

const router = Router();

/** Slugify a label into a stable, DB-safe key with custom_ prefix. */
function toKey(label: string): string {
  const slug = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
  return `custom_${slug}`;
}

/** If the generated key already exists for this scope, append a counter. */
async function uniqueKey(entityType: string, base: string, ticketTypeId?: number): Promise<string> {
  let key = base;
  let n = 1;
  if (ticketTypeId != null) {
    while (await prisma.customField.findUnique({ where: { ticketTypeId_key: { ticketTypeId, key } } })) {
      key = `${base}_${n++}`;
    }
  } else {
    while (await prisma.customField.findUnique({ where: { entityType_key: { entityType: entityType as any, key } } })) {
      key = `${base}_${n++}`;
    }
  }
  return key;
}

const FIELD_SELECT = {
  id: true, entityType: true, ticketTypeId: true, key: true, label: true, fieldType: true,
  placeholder: true, helpText: true, required: true, visible: true,
  options: true, displayOrder: true, createdAt: true, updatedAt: true,
} as const;

// GET /api/custom-fields/all
//
// Returns every custom field across all entity types — for use cases that
// need a global registry (e.g. the dashboard widget library, where admins
// can add a distribution widget for any custom field they've defined).
// Entity-type-scoped widgets shouldn't use this — it's intentionally
// unfiltered.
router.get("/all", requireAuth, async (_req, res) => {
  const fields = await prisma.customField.findMany({
    where: { ticketTypeId: null, visible: true },
    select: FIELD_SELECT,
    orderBy: [{ entityType: "asc" }, { displayOrder: "asc" }, { createdAt: "asc" }],
  });
  res.json({ fields });
});

// GET /api/custom-fields?entityType=ticket[&ticketTypeId=5]
router.get("/", requireAuth, async (req, res) => {
  const parsed = formEntityTypeSchema.safeParse(req.query.entityType);
  if (!parsed.success) {
    res.status(400).json({ error: "entityType query param is required and must be valid" });
    return;
  }
  const entityType = parsed.data as FormEntityType;
  const ticketTypeId = req.query.ticketTypeId ? parseInt(req.query.ticketTypeId as string, 10) : undefined;

  const fields = await prisma.customField.findMany({
    where: {
      entityType: entityType as any,
      ticketTypeId: ticketTypeId != null ? ticketTypeId : null,
    },
    select: FIELD_SELECT,
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });

  res.json({ fields });
});

// POST /api/custom-fields — create a custom field definition
router.post("/", requireAuth, requirePermission("templates.manage"), async (req, res) => {
  const data = validate(createCustomFieldSchema, req.body, res);
  if (!data) return;

  if ((data.fieldType === "select" || data.fieldType === "multiselect") && data.options.length === 0) {
    res.status(400).json({ error: "Select fields require at least one option" });
    return;
  }

  const baseKey = toKey(data.label);
  const key = await uniqueKey(data.entityType, baseKey, data.ticketTypeId);

  const field = await prisma.customField.create({
    data: {
      entityType:   data.entityType as any,
      ticketTypeId: data.ticketTypeId ?? null,
      key,
      label:        data.label,
      fieldType:    data.fieldType as any,
      placeholder:  data.placeholder ?? null,
      helpText:     data.helpText ?? null,
      required:     data.required ?? false,
      options:      data.options ?? [],
      displayOrder: data.displayOrder ?? 0,
      createdById:  req.user.id,
    },
    select: FIELD_SELECT,
  });

  res.status(201).json({ field });
});

// PUT /api/custom-fields/:id — update label, placeholder, required, visible, options, etc.
// The key is immutable once set.
router.put("/:id", requireAuth, requirePermission("templates.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid field ID" }); return; }

  const data = validate(updateCustomFieldSchema, req.body, res);
  if (!data) return;

  const existing = await prisma.customField.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Custom field not found" }); return; }

  if (
    (data.fieldType === "select" || data.fieldType === "multiselect" ||
     existing.fieldType === "select" || existing.fieldType === "multiselect") &&
    data.options !== undefined && data.options.length === 0
  ) {
    res.status(400).json({ error: "Select fields require at least one option" });
    return;
  }

  const field = await prisma.customField.update({
    where: { id },
    data: {
      ...(data.label        !== undefined && { label: data.label }),
      ...(data.fieldType    !== undefined && { fieldType: data.fieldType as any }),
      ...("placeholder"  in data && { placeholder: data.placeholder ?? null }),
      ...("helpText"     in data && { helpText: data.helpText ?? null }),
      ...(data.required     !== undefined && { required: data.required }),
      ...(data.visible      !== undefined && { visible: data.visible }),
      ...(data.options      !== undefined && { options: data.options }),
      ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder }),
    },
    select: FIELD_SELECT,
  });

  res.json({ field });
});

// DELETE /api/custom-fields/:id
router.delete("/:id", requireAuth, requirePermission("templates.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid field ID" }); return; }

  const existing = await prisma.customField.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Custom field not found" }); return; }

  await prisma.customField.delete({ where: { id } });
  res.status(204).send();
});

export default router;
