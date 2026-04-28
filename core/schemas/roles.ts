import { z } from "zod/v4";

/**
 * Role key — lowercase letters, digits, and underscores; 1–48 chars.
 * Mirrors the DB column type and prevents accidental keys like "Admin Role".
 */
export const roleKeySchema = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, digits, and underscores. Must start with a letter.");

const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value like #3b82f6")
  .optional()
  .or(z.literal(""));

/** Body for `POST /api/roles` — admin creating a custom role. */
export const createRoleSchema = z.object({
  key:         roleKeySchema,
  name:        z.string().min(1).max(128),
  description: z.string().max(2000).optional(),
  color:       colorSchema,
  /**
   * Permission strings — validated as plain strings here so a stale client
   * doesn't fail validation when the catalog grows. The server filters to
   * the current Permission union before persisting.
   */
  permissions: z.array(z.string()).default([]),
});

/** Body for `PATCH /api/roles/:key` — partial edit of an existing role. */
export const updateRoleSchema = z.object({
  name:        z.string().min(1).max(128).optional(),
  description: z.string().max(2000).optional().nullable(),
  color:       colorSchema.nullable(),
  permissions: z.array(z.string()).optional(),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
