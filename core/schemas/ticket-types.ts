import { z } from "zod/v4";

export const createTicketTypeSchema = z.object({
  name:        z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color").optional(),
});

export const updateTicketTypeSchema = z.object({
  name:        z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color").optional(),
  isActive:    z.boolean().optional(),
});

export type CreateTicketTypeInput = z.infer<typeof createTicketTypeSchema>;
export type UpdateTicketTypeInput = z.infer<typeof updateTicketTypeSchema>;
