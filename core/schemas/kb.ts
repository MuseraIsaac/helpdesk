import { z } from "zod/v4";

export const createKbCategorySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  position: z.number().int().min(0).optional(),
});

export const updateKbCategorySchema = createKbCategorySchema.partial();

export const createKbArticleSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  status: z.enum(["draft", "published"]).optional(),
  categoryId: z.number().int().positive().nullable().optional(),
});

export const updateKbArticleSchema = createKbArticleSchema.partial();

export const kbArticleSearchSchema = z.object({
  q: z.string().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  status: z.enum(["draft", "published"]).optional(),
});

export type CreateKbCategoryInput = z.infer<typeof createKbCategorySchema>;
export type UpdateKbCategoryInput = z.infer<typeof updateKbCategorySchema>;
export type CreateKbArticleInput = z.infer<typeof createKbArticleSchema>;
export type UpdateKbArticleInput = z.infer<typeof updateKbArticleSchema>;
export type KbArticleSearchInput = z.infer<typeof kbArticleSearchSchema>;
