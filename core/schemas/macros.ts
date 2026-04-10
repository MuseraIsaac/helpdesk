import { z } from "zod/v4";
import { ticketCategories } from "../constants/ticket-category";

export const macroBodySchema = z
  .string()
  .trim()
  .min(1, "Body is required")
  .max(4000, "Body must be 4000 characters or fewer");

export const createMacroSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120, "Title must be 120 characters or fewer"),
  body: macroBodySchema,
  category: z.enum(ticketCategories).optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export type CreateMacroInput = z.infer<typeof createMacroSchema>;

export const updateMacroSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120).optional(),
  body: macroBodySchema.optional(),
  category: z.enum(ticketCategories).optional().nullable(),
  isActive: z.boolean().optional(),
});

export type UpdateMacroInput = z.infer<typeof updateMacroSchema>;
