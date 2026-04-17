import { z } from "zod/v4";
import { FORM_FIELD_TYPES } from "../constants/catalog.ts";

// ── Form schema definition ─────────────────────────────────────────────────────

const formFieldOptionSchema = z.object({
  label: z.string().min(1).max(100),
  value: z.string().min(1).max(100),
});

export const formFieldSchema = z.object({
  id:           z.string().min(1).max(50).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Field ID must start with a letter and contain only letters, numbers, and underscores"),
  type:         z.enum(FORM_FIELD_TYPES as [string, ...string[]]),
  label:        z.string().min(1).max(200),
  placeholder:  z.string().max(200).optional(),
  required:     z.boolean().default(false),
  helpText:     z.string().max(500).optional(),
  options:      z.array(formFieldOptionSchema).max(100).optional(),
  min:          z.number().optional(),
  max:          z.number().optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
});

export type FormFieldInput = z.infer<typeof formFieldSchema>;

export const formSchemaSchema = z.array(formFieldSchema).max(50);

// ── Catalog Categories ─────────────────────────────────────────────────────────

export const createCatalogCategorySchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  position:    z.number().int().min(0).default(0),
  isActive:    z.boolean().default(true),
});

export type CreateCatalogCategoryInput = z.infer<typeof createCatalogCategorySchema>;

export const updateCatalogCategorySchema = z.object({
  name:        z.string().min(1).max(100).optional(),
  description: z.string().max(1000).nullable().optional(),
  position:    z.number().int().min(0).optional(),
  isActive:    z.boolean().optional(),
});

export type UpdateCatalogCategoryInput = z.infer<typeof updateCatalogCategorySchema>;

// ── Catalog Items ─────────────────────────────────────────────────────────────

export const createCatalogItemSchema = z.object({
  name:                  z.string().min(1).max(200),
  shortDescription:      z.string().max(300).optional(),
  description:           z.string().max(10000).optional(),
  categoryId:            z.number().int().positive().optional(),
  isActive:              z.boolean().default(true),
  requestorInstructions: z.string().max(5000).optional(),
  fulfillmentTeamId:     z.number().int().positive().optional(),
  requiresApproval:      z.boolean().default(false),
  approvalMode:          z.enum(["all", "any"]).default("all"),
  approverIds:           z.array(z.string()).max(20).default([]),
  formSchema:            formSchemaSchema.default([]),
  position:              z.number().int().min(0).default(0),
  icon:                  z.string().max(10).optional(),
});

export type CreateCatalogItemInput = z.infer<typeof createCatalogItemSchema>;

export const updateCatalogItemSchema = z.object({
  name:                  z.string().min(1).max(200).optional(),
  shortDescription:      z.string().max(300).nullable().optional(),
  description:           z.string().max(10000).nullable().optional(),
  categoryId:            z.number().int().positive().nullable().optional(),
  isActive:              z.boolean().optional(),
  requestorInstructions: z.string().max(5000).nullable().optional(),
  fulfillmentTeamId:     z.number().int().positive().nullable().optional(),
  requiresApproval:      z.boolean().optional(),
  approvalMode:          z.enum(["all", "any"]).optional(),
  approverIds:           z.array(z.string()).max(20).optional(),
  formSchema:            formSchemaSchema.optional(),
  position:              z.number().int().min(0).optional(),
  icon:                  z.string().max(10).nullable().optional(),
});

export type UpdateCatalogItemInput = z.infer<typeof updateCatalogItemSchema>;

// ── Submit a request from a catalog item ──────────────────────────────────────

export const submitCatalogRequestSchema = z.object({
  /** Submitted form field values — keys must match the item's formSchema field IDs */
  formData:    z.record(z.string(), z.unknown()).default({}),
  description: z.string().max(5000).optional(),
  /** Optional override for priority (defaults to medium) */
  priority:    z.enum(["low", "medium", "high", "urgent"]).default("medium"),
});

export type SubmitCatalogRequestInput = z.infer<typeof submitCatalogRequestSchema>;

// ── List query ────────────────────────────────────────────────────────────────

export const listCatalogItemsQuerySchema = z.object({
  categoryId: z.coerce.number().int().positive().optional(),
  isActive:   z.string().transform((v) => v === "true").pipe(z.boolean()).optional(),
  search:     z.string().max(200).optional(),
});

export type ListCatalogItemsQuery = z.infer<typeof listCatalogItemsQuerySchema>;
