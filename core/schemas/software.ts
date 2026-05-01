import { z } from "zod/v4";
import {
  SOFTWARE_LICENSE_TYPES,
  SOFTWARE_LICENSE_STATUSES,
  SOFTWARE_PLATFORMS,
  SAAS_CATEGORIES,
  SAAS_BILLING_CYCLES,
  SAAS_SUBSCRIPTION_STATUSES,
} from "../constants/software.ts";

type LicType    = typeof SOFTWARE_LICENSE_TYPES[number];
type LicStatus  = typeof SOFTWARE_LICENSE_STATUSES[number];
type Platform   = typeof SOFTWARE_PLATFORMS[number];
type SaasCategory = typeof SAAS_CATEGORIES[number];
type BillingCycle = typeof SAAS_BILLING_CYCLES[number];
type SaasStatus = typeof SAAS_SUBSCRIPTION_STATUSES[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const decimalString = z.string().regex(/^\d+(\.\d{1,2})?$/, "Expected decimal amount");

// ── Software License ──────────────────────────────────────────────────────────

export const createSoftwareLicenseSchema = z.object({
  productName:    z.string().min(1, "Product name is required").max(200),
  vendor:         z.string().max(200).nullish(),
  edition:        z.string().max(100).nullish(),
  version:        z.string().max(50).nullish(),
  platform:       z.enum(SOFTWARE_PLATFORMS as [Platform, ...Platform[]]).default("cross_platform"),
  licenseType:    z.enum(SOFTWARE_LICENSE_TYPES as [LicType, ...LicType[]]).default("perpetual"),
  /** Optional reference to an admin-defined extension of the built-in licenseType enum. */
  customLicenseTypeId: z.number().int().positive().nullable().optional(),
  status:         z.enum(SOFTWARE_LICENSE_STATUSES as [LicStatus, ...LicStatus[]]).default("active"),

  licenseKey:       z.string().max(500).nullish(),
  licenseReference: z.string().max(200).nullish(),

  totalSeats:  z.number().int().positive().nullish(),

  purchaseDate:  isoDate.nullish(),
  purchasePrice: decimalString.nullish(),
  annualCost:    decimalString.nullish(),
  currency:      z.string().length(3).regex(/^[A-Z]{3}$/).default("USD"),
  poNumber:      z.string().max(100).nullish(),
  invoiceNumber: z.string().max(100).nullish(),

  startDate:   isoDate.nullish(),
  expiryDate:  isoDate.nullish(),
  renewalDate: isoDate.nullish(),
  autoRenews:  z.boolean().default(false),

  vendorContact: z.string().max(200).nullish(),
  vendorEmail:   z.string().max(200).nullish(),

  complianceNotes: z.string().max(10000).nullish(),
  notes:           z.string().max(10000).nullish(),

  externalId:      z.string().max(200).nullish(),
  discoverySource: z.string().max(50).nullish(),

  ownerId: z.string().nullish(),
  teamId:  z.number().int().positive().nullish(),
});

export type CreateSoftwareLicenseInput = z.infer<typeof createSoftwareLicenseSchema>;

export const updateSoftwareLicenseSchema = createSoftwareLicenseSchema.partial();
export type UpdateSoftwareLicenseInput = z.infer<typeof updateSoftwareLicenseSchema>;

export const listSoftwareLicensesQuerySchema = z.object({
  status:       z.enum(SOFTWARE_LICENSE_STATUSES as [LicStatus, ...LicStatus[]]).optional(),
  licenseType:  z.enum(SOFTWARE_LICENSE_TYPES    as [LicType,   ...LicType[]]).optional(),
  platform:     z.enum(SOFTWARE_PLATFORMS        as [Platform,  ...Platform[]]).optional(),
  search:       z.string().max(200).optional(),
  expiringDays: z.coerce.number().int().positive().optional(),
  overAllocated: z.coerce.boolean().optional(),
  ownerId:      z.string().optional(),
  page:         z.coerce.number().int().positive().default(1),
  pageSize:     z.coerce.number().int().min(1).max(100).default(25),
});

export type ListSoftwareLicensesQuery = z.infer<typeof listSoftwareLicensesQuerySchema>;

export const assignLicenseSeatSchema = z.object({
  assignedToUserId:  z.string().nullish(),
  assignedToAssetId: z.number().int().positive().nullish(),
  note:              z.string().max(500).nullish(),
}).refine(
  (d) => d.assignedToUserId || d.assignedToAssetId,
  "Either assignedToUserId or assignedToAssetId is required",
);

export type AssignLicenseSeatInput = z.infer<typeof assignLicenseSeatSchema>;

// ── SaaS Subscription ─────────────────────────────────────────────────────────

export const createSaaSSubscriptionSchema = z.object({
  appName:     z.string().min(1, "App name is required").max(200),
  vendor:      z.string().max(200).nullish(),
  category:    z.enum(SAAS_CATEGORIES     as [SaasCategory,  ...SaasCategory[]]).default("other"),
  /** Optional reference to an admin-defined extension of the built-in category enum. */
  customCategoryId: z.number().int().positive().nullable().optional(),
  status:      z.enum(SAAS_SUBSCRIPTION_STATUSES as [SaasStatus, ...SaasStatus[]]).default("active"),
  plan:        z.string().max(100).nullish(),
  billingCycle: z.enum(SAAS_BILLING_CYCLES as [BillingCycle, ...BillingCycle[]]).default("annual"),

  url:        z.string().max(500).nullish(),
  adminEmail: z.string().max(200).nullish(),

  totalSeats: z.number().int().positive().nullish(),

  monthlyAmount: decimalString.nullish(),
  annualAmount:  decimalString.nullish(),
  currency:      z.string().length(3).regex(/^[A-Z]{3}$/).default("USD"),
  spendCategory: z.string().max(100).nullish(),

  startDate:        isoDate.nullish(),
  trialEndDate:     isoDate.nullish(),
  renewalDate:      isoDate.nullish(),
  cancellationDate: isoDate.nullish(),
  autoRenews:       z.boolean().default(true),

  complianceNotes: z.string().max(10000).nullish(),
  notes:           z.string().max(10000).nullish(),

  externalId:      z.string().max(200).nullish(),
  discoverySource: z.string().max(50).nullish(),

  ownerId: z.string().nullish(),
  teamId:  z.number().int().positive().nullish(),
});

export type CreateSaaSSubscriptionInput = z.infer<typeof createSaaSSubscriptionSchema>;

export const updateSaaSSubscriptionSchema = createSaaSSubscriptionSchema.partial();
export type UpdateSaaSSubscriptionInput = z.infer<typeof updateSaaSSubscriptionSchema>;

export const listSaaSSubscriptionsQuerySchema = z.object({
  status:       z.enum(SAAS_SUBSCRIPTION_STATUSES as [SaasStatus,    ...SaasStatus[]]).optional(),
  category:     z.enum(SAAS_CATEGORIES            as [SaasCategory,  ...SaasCategory[]]).optional(),
  billingCycle: z.enum(SAAS_BILLING_CYCLES        as [BillingCycle,  ...BillingCycle[]]).optional(),
  search:       z.string().max(200).optional(),
  renewingDays: z.coerce.number().int().positive().optional(),
  overAllocated: z.coerce.boolean().optional(),
  ownerId:      z.string().optional(),
  page:         z.coerce.number().int().positive().default(1),
  pageSize:     z.coerce.number().int().min(1).max(100).default(25),
});

export type ListSaaSSubscriptionsQuery = z.infer<typeof listSaaSSubscriptionsQuerySchema>;

export const assignSaaSUserSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  role:   z.string().max(50).nullish(),
  note:   z.string().max(500).nullish(),
});

export type AssignSaaSUserInput = z.infer<typeof assignSaaSUserSchema>;
