import { z } from "zod/v4";
import { templateTypes } from "../constants/template";

export const createTemplateSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(255, "Title must be 255 characters or fewer"),
  body: z.string().trim().min(1, "Body is required").max(20000, "Body must be 20000 characters or fewer"),
  bodyHtml: z.string().max(40000).optional().nullable(),
  type: z.enum(templateTypes as [string, ...string[]]),
  isActive: z.boolean().optional().default(true),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(255).optional(),
  body: z.string().trim().min(1, "Body is required").max(20000).optional(),
  bodyHtml: z.string().max(40000).optional().nullable(),
  isActive: z.boolean().optional(),
});

export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const listTemplatesQuerySchema = z.object({
  type: z.enum(templateTypes as [string, ...string[]]).optional(),
});
