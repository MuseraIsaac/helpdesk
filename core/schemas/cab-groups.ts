import { z } from "zod/v4";

export const createCabGroupSchema = z.object({
  name:        z.string().trim().min(1, "Name is required").max(120),
  description: z.string().max(500).optional(),
});
export type CreateCabGroupInput = z.infer<typeof createCabGroupSchema>;

export const updateCabGroupSchema = z.object({
  name:        z.string().trim().min(1).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  isActive:    z.boolean().optional(),
});
export type UpdateCabGroupInput = z.infer<typeof updateCabGroupSchema>;

export const setCabMembersSchema = z.object({
  memberIds: z.array(z.string()).max(200),
});
export type SetCabMembersInput = z.infer<typeof setCabMembersSchema>;
