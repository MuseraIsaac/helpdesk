import { z } from "zod/v4";

export const createNoteSchema = z.object({
  body: z.string().trim().min(1, "Note body is required"),
  // Future: @mention support — array of agent user IDs
  mentionedUserIds: z.array(z.string()).optional().default([]),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const updateNoteSchema = z.object({
  isPinned: z.boolean().optional(),
  body: z.string().trim().min(1, "Note body is required").optional(),
});

export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
