import { z } from "zod/v4";

// Roles that can be assigned by an admin (customers are created via the portal)
export const assignableRoles = ["admin", "supervisor", "agent", "readonly"] as const;
export type AssignableRole = (typeof assignableRoles)[number];

export const createUserSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters"),
  email: z.email("Invalid email address"),
  password: z.string().trim().min(8, "Password must be at least 8 characters"),
  role: z.enum(assignableRoles).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters"),
  email: z.email("Invalid email address"),
  password: z.union([
    z.literal(""),
    z.string().trim().min(8, "Password must be at least 8 characters"),
  ]),
  role: z.enum(assignableRoles).optional(),
  globalTicketView: z.boolean().optional(),
});

export const patchUserSchema = z.object({
  globalTicketView: z.boolean(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
