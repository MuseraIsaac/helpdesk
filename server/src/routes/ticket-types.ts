import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import {
  createTicketTypeSchema,
  updateTicketTypeSchema,
} from "core/schemas/ticket-types.ts";
import { saveFormDefinitionSchema } from "core/schemas/form-definitions.ts";
import { FORM_FIELD_REGISTRY } from "core/constants/form-fields.ts";
import type { FormFieldConfig } from "core/schemas/form-definitions.ts";
import prisma from "../db";

const router = Router();

/** Slugify a name: lowercase, replace non-alphanumeric runs with underscores. */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

/** Build the default form fields for a new ticket type (inherits standard ticket fields minus ticketType). */
function buildDefaultFields(): FormFieldConfig[] {
  return FORM_FIELD_REGISTRY.ticket
    .filter((f) => f.key !== "ticketType")
    .map((f) => ({
      key:         f.key,
      visible:     true,
      required:    f.required,
      label:       f.label,
      placeholder: f.placeholder,
      order:       f.order,
    }));
}

// GET /api/ticket-types
router.get("/", requireAuth, async (req, res) => {
  const types = await prisma.ticketTypeConfig.findMany({
    orderBy: { name: "asc" },
    include: { formDefinition: { select: { id: true, updatedAt: true } } },
  });
  res.json({ ticketTypes: types });
});

// POST /api/ticket-types
router.post(
  "/",
  requireAuth,
  requirePermission("ticket_types.manage"),
  async (req, res) => {
    const data = validate(createTicketTypeSchema, req.body, res);
    if (!data) return;

    const baseSlug = toSlug(data.name);

    // Ensure slug uniqueness by appending a counter if needed
    let slug = baseSlug;
    let attempt = 1;
    while (await prisma.ticketTypeConfig.findUnique({ where: { slug } })) {
      slug = `${baseSlug}_${attempt++}`;
    }

    const ticketType = await prisma.ticketTypeConfig.create({
      data: {
        name:        data.name,
        slug,
        description: data.description ?? null,
        color:       data.color ?? "#6366f1",
        createdById: req.user.id,
        formDefinition: {
          create: { fields: buildDefaultFields() },
        },
      },
      include: { formDefinition: { select: { id: true, updatedAt: true } } },
    });

    res.status(201).json({
      ticketType,
      formBuilderUrl: `/admin/forms?ticketType=${ticketType.slug}`,
    });
  }
);

// GET /api/ticket-types/:id
router.get("/:id", requireAuth, async (req, res) => {
  const id = parseId(req.params.id, res);
  if (!id) return;

  const ticketType = await prisma.ticketTypeConfig.findUnique({
    where: { id },
    include: { formDefinition: true },
  });

  if (!ticketType) {
    res.status(404).json({ error: "Ticket type not found" });
    return;
  }

  res.json({ ticketType });
});

// PUT /api/ticket-types/:id
router.put(
  "/:id",
  requireAuth,
  requirePermission("ticket_types.manage"),
  async (req, res) => {
    const id = parseId(req.params.id, res);
    if (!id) return;

    const data = validate(updateTicketTypeSchema, req.body, res);
    if (!data) return;

    const ticketType = await prisma.ticketTypeConfig.update({
      where: { id },
      data: {
        name:        data.name,
        description: data.description,
        color:       data.color,
        isActive:    data.isActive,
      },
      include: { formDefinition: { select: { id: true, updatedAt: true } } },
    });

    res.json({ ticketType });
  }
);

// DELETE /api/ticket-types/:id
router.delete(
  "/:id",
  requireAuth,
  requirePermission("ticket_types.manage"),
  async (req, res) => {
    const id = parseId(req.params.id, res);
    if (!id) return;

    await prisma.ticketTypeConfig.delete({ where: { id } });
    res.status(204).end();
  }
);

// GET /api/ticket-types/:id/form
router.get("/:id/form", requireAuth, async (req, res) => {
  const id = parseId(req.params.id, res);
  if (!id) return;

  const ticketType = await prisma.ticketTypeConfig.findUnique({
    where: { id },
    include: { formDefinition: true },
  });

  if (!ticketType) {
    res.status(404).json({ error: "Ticket type not found" });
    return;
  }

  if (!ticketType.formDefinition) {
    res.json({
      ticketTypeId: id,
      fields: buildDefaultFields(),
      isDefault: true,
    });
    return;
  }

  res.json({
    ticketTypeId: id,
    fields: ticketType.formDefinition.fields as FormFieldConfig[],
    isDefault: false,
    updatedAt: ticketType.formDefinition.updatedAt,
  });
});

// PUT /api/ticket-types/:id/form
router.put(
  "/:id/form",
  requireAuth,
  requirePermission("ticket_types.manage"),
  async (req, res) => {
    const id = parseId(req.params.id, res);
    if (!id) return;

    const exists = await prisma.ticketTypeConfig.findUnique({ where: { id } });
    if (!exists) {
      res.status(404).json({ error: "Ticket type not found" });
      return;
    }

    const data = validate(saveFormDefinitionSchema, req.body, res);
    if (!data) return;

    const formDef = await prisma.ticketTypeFormDefinition.upsert({
      where:  { ticketTypeId: id },
      create: { ticketTypeId: id, fields: data.fields },
      update: { fields: data.fields },
    });

    res.json({
      ticketTypeId: id,
      fields: formDef.fields as FormFieldConfig[],
      isDefault: false,
      updatedAt: formDef.updatedAt,
    });
  }
);

// POST /api/ticket-types/:id/form/reset
router.post(
  "/:id/form/reset",
  requireAuth,
  requirePermission("ticket_types.manage"),
  async (req, res) => {
    const id = parseId(req.params.id, res);
    if (!id) return;

    const exists = await prisma.ticketTypeConfig.findUnique({ where: { id } });
    if (!exists) {
      res.status(404).json({ error: "Ticket type not found" });
      return;
    }

    await prisma.ticketTypeFormDefinition.deleteMany({ where: { ticketTypeId: id } });

    res.json({
      ticketTypeId: id,
      fields: buildDefaultFields(),
      isDefault: true,
    });
  }
);

export default router;
