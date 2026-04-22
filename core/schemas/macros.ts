import { z } from "zod/v4";
import { ticketCategories } from "../constants/ticket-category";

export const macroBodySchema = z
  .string()
  .trim()
  .min(1, "Body is required")
  .max(4000, "Body must be 4000 characters or fewer");

const macroVisibilities = ["global", "personal"] as const;

export const createMacroSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120, "Title must be 120 characters or fewer"),
  body: macroBodySchema,
  category: z.enum(ticketCategories).optional().nullable(),
  isActive: z.boolean().optional().default(true),
  visibility: z.enum(macroVisibilities).optional().default("global"),
});

export type CreateMacroInput = z.infer<typeof createMacroSchema>;

export const updateMacroSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120).optional(),
  body: macroBodySchema.optional(),
  category: z.enum(ticketCategories).optional().nullable(),
  isActive: z.boolean().optional(),
  visibility: z.enum(macroVisibilities).optional(),
});

export type UpdateMacroInput = z.infer<typeof updateMacroSchema>;
