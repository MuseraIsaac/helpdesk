import { z } from "zod/v4";

export const createQueueSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  description: z.string().trim().max(500, "Description is too long").optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a valid hex color (e.g. #6366f1)")
    .default("#6366f1"),
});

export type CreateQueueInput = z.infer<typeof createQueueSchema>;

export const updateQueueSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a valid hex color")
    .optional(),
});

export type UpdateQueueInput = z.infer<typeof updateQueueSchema>;

export const setQueueMembersSchema = z.object({
  memberIds: z.array(z.string()).max(200, "Too many members"),
});

export type SetQueueMembersInput = z.infer<typeof setQueueMembersSchema>;
