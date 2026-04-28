import { z } from "zod/v4";

/**
 * Built-in roles that can be assigned by an admin without needing custom-role
 * setup. The role select in the user form fetches the live list from
 * `/api/roles` so any custom roles created in the role editor are also
 * selectable. The server validates that the role exists in the DB before
 * persisting (the `customer` role is rejected — created via the portal).
 */
export const assignableRoles = ["admin", "supervisor", "agent", "readonly"] as const;
export type AssignableRole = (typeof assignableRoles)[number];

const roleKeyField = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, "Invalid role key");

export const createUserSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters"),
  email: z.email("Invalid email address"),
  password: z.string().trim().min(8, "Password must be at least 8 characters"),
  role: roleKeyField.optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters"),
  email: z.email("Invalid email address"),
  password: z.union([
    z.literal(""),
    z.string().trim().min(8, "Password must be at least 8 characters"),
  ]),
  role: roleKeyField.optional(),
  globalTicketView: z.boolean().optional(),
});

export const patchUserSchema = z.object({
  globalTicketView: z.boolean(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
