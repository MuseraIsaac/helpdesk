import { z } from "zod/v4";
import { customFieldTypes } from "../constants/custom-field-types";
import { formEntityTypes } from "../constants/form-fields";

export const createCustomFieldSchema = z.object({
  entityType:   z.enum(formEntityTypes as [string, ...string[]]),
  ticketTypeId: z.number().int().positive().optional(),
  label:        z.string().trim().min(1, "Label is required").max(120),
  fieldType:    z.enum([...customFieldTypes] as [string, ...string[]]),
  placeholder:  z.string().max(255).optional(),
  helpText:     z.string().max(500).optional(),
  required:     z.boolean().default(false),
  options:      z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  displayOrder: z.number().int().min(0).optional(),
});

export type CreateCustomFieldInput = z.infer<typeof createCustomFieldSchema>;

export const updateCustomFieldSchema = z.object({
  label:        z.string().trim().min(1).max(120).optional(),
  fieldType:    z.enum([...customFieldTypes] as [string, ...string[]]).optional(),
  placeholder:  z.string().max(255).optional().nullable(),
  helpText:     z.string().max(500).optional().nullable(),
  required:     z.boolean().optional(),
  visible:      z.boolean().optional(),
  options:      z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  displayOrder: z.number().int().min(0).optional(),
});

export type UpdateCustomFieldInput = z.infer<typeof updateCustomFieldSchema>;

/** Shape of the customFields JSON stored on entity rows. */
export type CustomFieldValues = Record<string, string | number | boolean | string[] | null>;
