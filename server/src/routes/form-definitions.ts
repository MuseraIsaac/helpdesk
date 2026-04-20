import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import {
  saveFormDefinitionSchema,
  formEntityTypeSchema,
} from "core/schemas/form-definitions.ts";
import { FORM_FIELD_REGISTRY } from "core/constants/form-fields.ts";
import type { FormEntityType, FieldDef } from "core/constants/form-fields.ts";
import type { FormFieldConfig } from "core/schemas/form-definitions.ts";
import prisma from "../db";

const router = Router();

/** Build default field configs from the registry for a given entity type. */
function buildDefaults(entityType: FormEntityType): FormFieldConfig[] {
  return FORM_FIELD_REGISTRY[entityType].map((f: FieldDef) => ({
    key:         f.key,
    visible:     true,
    required:    f.required,
    label:       f.label,
    placeholder: f.placeholder,
    order:       f.order,
  }));
}

// GET /api/form-definitions/:entityType
// Returns the saved definition, or synthesised defaults if none exists yet.
router.get("/:entityType", requireAuth, async (req, res) => {
  const parsed = formEntityTypeSchema.safeParse(req.params.entityType);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid entity type" });
    return;
  }
  const entityType = parsed.data as FormEntityType;

  const definition = await prisma.formDefinition.findUnique({
    where: { entityType: entityType as any },
  });

  if (!definition) {
    res.json({
      entityType,
      fields: buildDefaults(entityType),
      isDefault: true,
    });
    return;
  }

  res.json({
    id: definition.id,
    entityType: definition.entityType,
    fields: definition.fields as FormFieldConfig[],
    isDefault: false,
    updatedAt: definition.updatedAt,
  });
});

// PUT /api/form-definitions/:entityType
// Upserts the definition for this entity type.
router.put(
  "/:entityType",
  requireAuth,
  requirePermission("templates.manage"),
  async (req, res) => {
    const parsed = formEntityTypeSchema.safeParse(req.params.entityType);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid entity type" });
      return;
    }
    const entityType = parsed.data as FormEntityType;

    const data = validate(saveFormDefinitionSchema, req.body, res);
    if (!data) return;

    // Merge with registry to ensure all known fields are present (preserving
    // admin customisations for existing keys, adding defaults for new ones).
    const registry = FORM_FIELD_REGISTRY[entityType];
    const savedMap = new Map(data.fields.map((f) => [f.key, f]));

    const merged: FormFieldConfig[] = registry.map((def) => {
      const saved = savedMap.get(def.key);
      if (saved) return saved;
      return {
        key:         def.key,
        visible:     true,
        required:    def.required,
        label:       def.label,
        placeholder: def.placeholder,
        order:       def.order,
      };
    });

    const definition = await prisma.formDefinition.upsert({
      where:  { entityType: entityType as any },
      create: { entityType: entityType as any, fields: merged, createdById: req.user.id },
      update: { fields: merged },
    });

    res.json({
      id: definition.id,
      entityType: definition.entityType,
      fields: definition.fields as FormFieldConfig[],
      isDefault: false,
      updatedAt: definition.updatedAt,
    });
  }
);

// POST /api/form-definitions/:entityType/reset
// Deletes the saved definition so the form falls back to registry defaults.
router.post(
  "/:entityType/reset",
  requireAuth,
  requirePermission("templates.manage"),
  async (req, res) => {
    const parsed = formEntityTypeSchema.safeParse(req.params.entityType);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid entity type" });
      return;
    }
    const entityType = parsed.data as FormEntityType;

    await prisma.formDefinition.deleteMany({ where: { entityType: entityType as any } });

    res.json({
      entityType,
      fields: buildDefaults(entityType),
      isDefault: true,
    });
  }
);

export default router;
