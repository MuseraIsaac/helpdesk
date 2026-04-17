import { z } from "zod/v4";

export const createOrganizationSchema = z.object({
  name:             z.string().min(1, "Name is required").max(200),
  domain:           z.string().max(200).nullable().optional(),
  website:          z.string().max(500).nullable().optional(),
  industry:         z.string().max(200).nullable().optional(),
  employeeCount:    z.number().int().positive().nullable().optional(),
  country:          z.string().max(100).nullable().optional(),
  address:          z.string().max(500).nullable().optional(),
  supportTier:      z.enum(["free", "standard", "premium", "enterprise"]).optional(),
  accountManagerId: z.string().nullable().optional(),
  notes:            z.string().nullable().optional(),
});

export const updateOrganizationSchema = createOrganizationSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
