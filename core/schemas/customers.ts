import { z } from "zod/v4";

export const createCustomerSchema = z.object({
  name:             z.string().min(1).max(200),
  email:            z.string().email().max(320),
  phone:            z.string().max(50).nullable().optional(),
  jobTitle:         z.string().max(200).nullable().optional(),
  timezone:         z.string().max(100).optional(),
  language:         z.string().max(10).optional(),
  preferredChannel: z.string().max(50).nullable().optional(),
  isVip:            z.boolean().optional(),
  supportTier:      z.enum(["free", "standard", "premium", "enterprise"]).optional(),
  organizationId:   z.number().int().positive().nullable().optional(),
  notes:            z.string().nullable().optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z.object({
  name:             z.string().min(1).max(200).optional(),
  phone:            z.string().max(50).nullable().optional(),
  jobTitle:         z.string().max(200).nullable().optional(),
  timezone:         z.string().max(100).optional(),
  language:         z.string().max(10).optional(),
  preferredChannel: z.string().max(50).nullable().optional(),
  isVip:            z.boolean().optional(),
  supportTier:      z.enum(["free", "standard", "premium", "enterprise"]).optional(),
  avatarUrl:        z.string().url().nullable().optional(),
  organizationId:   z.number().int().positive().nullable().optional(),
  notes:            z.string().nullable().optional(),
});

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
