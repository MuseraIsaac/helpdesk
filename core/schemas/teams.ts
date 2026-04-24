import { z } from "zod/v4";

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email("Must be a valid email address")
  .max(254, "Email is too long")
  .nullable()
  .optional();

export const createTeamSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  description: z.string().trim().max(500, "Description is too long").optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a valid hex color (e.g. #6366f1)")
    .default("#6366f1"),
  email: emailField,
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a valid hex color")
    .optional(),
  email: emailField,
});

export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;

export const setTeamMembersSchema = z.object({
  memberIds: z.array(z.string()).max(200, "Too many members"),
});

export type SetTeamMembersInput = z.infer<typeof setTeamMembersSchema>;
