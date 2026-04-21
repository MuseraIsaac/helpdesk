import { z } from "zod/v4";
import { CONTRACT_TYPES, CONTRACT_STATUSES } from "../constants/contracts.ts";

type CType  = typeof CONTRACT_TYPES[number];
type CStatus = typeof CONTRACT_STATUSES[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const createContractSchema = z.object({
  title:    z.string().min(1, "Title is required").max(200),
  type:     z.enum(CONTRACT_TYPES   as [CType,   ...CType[]]),
  status:   z.enum(CONTRACT_STATUSES as [CStatus, ...CStatus[]]).default("active"),

  vendor:        z.string().max(200).nullish(),
  vendorContact: z.string().max(200).nullish(),
  vendorEmail:   z.string().max(200).nullish(),
  vendorPhone:   z.string().max(50).nullish(),

  startDate:   isoDate.nullish(),
  endDate:     isoDate.nullish(),
  renewalDate: isoDate.nullish(),
  autoRenews:  z.boolean().default(false),

  value:    z.string().regex(/^\d+(\.\d{1,2})?$/).nullish(),
  currency: z.string().length(3).regex(/^[A-Z]{3}$/).default("USD"),

  supportLevel:     z.string().max(100).nullish(),
  slaResponseHours: z.number().int().positive().nullish(),

  description: z.string().max(10000).nullish(),
  notes:       z.string().max(10000).nullish(),
});

export type CreateContractInput = z.infer<typeof createContractSchema>;

export const updateContractSchema = createContractSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type UpdateContractInput = z.infer<typeof updateContractSchema>;

export const listContractsQuerySchema = z.object({
  status:  z.enum(CONTRACT_STATUSES as [CStatus, ...CStatus[]]).optional(),
  type:    z.enum(CONTRACT_TYPES    as [CType,   ...CType[]]).optional(),
  vendor:  z.string().optional(),
  search:  z.string().max(200).optional(),
  expiringDays: z.coerce.number().int().positive().optional(),
  page:     z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type ListContractsQuery = z.infer<typeof listContractsQuerySchema>;
