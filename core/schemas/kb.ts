import { z } from "zod/v4";

export const createKbCategorySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  position: z.number().int().min(0).optional(),
});

export const updateKbCategorySchema = createKbCategorySchema.partial();

export const KB_REVIEW_STATUSES = ["draft", "in_review", "approved", "archived"] as const;
export type KbReviewStatus = (typeof KB_REVIEW_STATUSES)[number];

export const KB_VISIBILITIES = ["public", "internal"] as const;
export type KbVisibility = (typeof KB_VISIBILITIES)[number];

export const createKbArticleSchema = z.object({
  title:       z.string().min(1).max(200),
  body:        z.string().min(1),
  status:      z.enum(["draft", "published"]).optional(),
  reviewStatus: z.enum(KB_REVIEW_STATUSES).optional(),
  visibility:  z.enum(KB_VISIBILITIES).optional(),
  categoryId:  z.number().int().positive().nullable().optional(),
  ownerId:     z.string().nullable().optional(),
});

export const updateKbArticleSchema = createKbArticleSchema.partial();

export const kbArticleSearchSchema = z.object({
  q:            z.string().optional(),
  categoryId:   z.coerce.number().int().positive().optional(),
  status:       z.enum(["draft", "published"]).optional(),
  reviewStatus: z.enum(KB_REVIEW_STATUSES).optional(),
  visibility:   z.enum(KB_VISIBILITIES).optional(),
});

export const submitArticleFeedbackSchema = z.object({
  helpful:   z.boolean(),
  comment:   z.string().max(500).optional(),
  sessionId: z.string().max(100).optional(),
});

export const kbWorkflowActionSchema = z.object({
  changeNote: z.string().max(500).optional(),
});

export type CreateKbCategoryInput        = z.infer<typeof createKbCategorySchema>;
export type UpdateKbCategoryInput        = z.infer<typeof updateKbCategorySchema>;
export type CreateKbArticleInput         = z.infer<typeof createKbArticleSchema>;
export type UpdateKbArticleInput         = z.infer<typeof updateKbArticleSchema>;
export type KbArticleSearchInput         = z.infer<typeof kbArticleSearchSchema>;
export type SubmitArticleFeedbackInput   = z.infer<typeof submitArticleFeedbackSchema>;
export type KbWorkflowActionInput        = z.infer<typeof kbWorkflowActionSchema>;
