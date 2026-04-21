import { z } from "zod/v4";
import {
  ASSET_TYPES,
  ASSET_STATUSES,
  ASSET_CONDITIONS,
  DEPRECIATION_METHODS,
  ASSET_RELATIONSHIP_TYPES,
} from "../constants/assets.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

const isoDate     = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const optionalDate = isoDate.nullish();
const currency    = z.string().length(3).regex(/^[A-Z]{3}$/).default("USD");
const decimalStr  = z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount");

type AssetType          = typeof ASSET_TYPES[number];
type AssetStatus        = typeof ASSET_STATUSES[number];
type AssetCondition     = typeof ASSET_CONDITIONS[number];
type DepreciationMethod = typeof DEPRECIATION_METHODS[number];
type AssetRelType       = typeof ASSET_RELATIONSHIP_TYPES[number];

// ── Create ────────────────────────────────────────────────────────────────────

export const createAssetSchema = z.object({
  name:      z.string().min(1).max(200),
  type:      z.enum(ASSET_TYPES      as [AssetType,     ...AssetType[]]),
  status:    z.enum(ASSET_STATUSES   as [AssetStatus,   ...AssetStatus[]]).default("in_stock"),
  condition: z.enum(ASSET_CONDITIONS as [AssetCondition,...AssetCondition[]]).default("new_item"),

  manufacturer: z.string().max(100).nullish(),
  model:        z.string().max(100).nullish(),
  serialNumber: z.string().max(200).nullish(),
  assetTag:     z.string().max(100).nullish(),

  purchaseDate:  optionalDate,
  purchasePrice: decimalStr.nullish(),
  currency,
  poNumber:      z.string().max(100).nullish(),
  vendor:        z.string().max(200).nullish(),
  invoiceNumber: z.string().max(100).nullish(),

  warrantyExpiry: optionalDate,
  warrantyType:   z.string().max(100).nullish(),

  receivedAt:  optionalDate,
  deployedAt:  optionalDate,
  endOfLifeAt: optionalDate,

  location: z.string().max(200).nullish(),
  site:     z.string().max(100).nullish(),
  building: z.string().max(100).nullish(),
  room:     z.string().max(100).nullish(),

  depreciationMethod: z.enum(DEPRECIATION_METHODS as [DepreciationMethod,...DepreciationMethod[]]).default("none"),
  usefulLifeYears:    z.number().int().positive().nullish(),
  salvageValue:       decimalStr.nullish(),

  notes:   z.string().max(10000).nullish(),
  ownerId: z.string().nullish(),
  teamId:  z.number().int().positive().nullish(),
  ciId:    z.number().int().positive().nullish(),

  // Discovery / integration fields (populated by import pipelines, not manual UI)
  externalId:      z.string().max(200).nullish(),
  discoverySource: z.string().max(50).nullish(),
  managedBy:       z.string().max(100).nullish(),

  // Governance / compliance
  contractReference:   z.string().max(200).nullish(),
  complianceNotes:     z.string().max(5000).nullish(),
  disposalMethod:      z.string().max(100).nullish(),
  disposalCertificate: z.string().max(200).nullish(),
});

export type CreateAssetInput = z.infer<typeof createAssetSchema>;

// ── Update (all optional) ─────────────────────────────────────────────────────

export const updateAssetSchema = z.object({
  name:      z.string().min(1).max(200).optional(),
  type:      z.enum(ASSET_TYPES      as [AssetType,     ...AssetType[]]).optional(),
  condition: z.enum(ASSET_CONDITIONS as [AssetCondition,...AssetCondition[]]).optional(),

  manufacturer: z.string().max(100).nullable().optional(),
  model:        z.string().max(100).nullable().optional(),
  serialNumber: z.string().max(200).nullable().optional(),
  assetTag:     z.string().max(100).nullable().optional(),

  purchaseDate:  isoDate.nullable().optional(),
  purchasePrice: decimalStr.nullable().optional(),
  currency:      z.string().length(3).optional(),
  poNumber:      z.string().max(100).nullable().optional(),
  vendor:        z.string().max(200).nullable().optional(),
  invoiceNumber: z.string().max(100).nullable().optional(),

  warrantyExpiry: isoDate.nullable().optional(),
  warrantyType:   z.string().max(100).nullable().optional(),

  receivedAt:  isoDate.nullable().optional(),
  deployedAt:  isoDate.nullable().optional(),
  endOfLifeAt: isoDate.nullable().optional(),
  retiredAt:   isoDate.nullable().optional(),

  location: z.string().max(200).nullable().optional(),
  site:     z.string().max(100).nullable().optional(),
  building: z.string().max(100).nullable().optional(),
  room:     z.string().max(100).nullable().optional(),

  depreciationMethod: z.enum(DEPRECIATION_METHODS as [DepreciationMethod,...DepreciationMethod[]]).optional(),
  usefulLifeYears:    z.number().int().positive().nullable().optional(),
  salvageValue:       decimalStr.nullable().optional(),

  notes:   z.string().max(10000).nullable().optional(),
  ownerId: z.string().nullable().optional(),
  teamId:  z.number().int().positive().nullable().optional(),
  ciId:    z.number().int().positive().nullable().optional(),

  externalId:      z.string().max(200).nullable().optional(),
  discoverySource: z.string().max(50).nullable().optional(),
  managedBy:       z.string().max(100).nullable().optional(),

  contractReference:   z.string().max(200).nullable().optional(),
  complianceNotes:     z.string().max(5000).nullable().optional(),
  disposalMethod:      z.string().max(100).nullable().optional(),
  disposalCertificate: z.string().max(200).nullable().optional(),
});

export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;

// ── List query ────────────────────────────────────────────────────────────────

export const listAssetsQuerySchema = z.object({
  type:        z.enum(ASSET_TYPES      as [AssetType,     ...AssetType[]]).optional(),
  status:      z.enum(ASSET_STATUSES   as [AssetStatus,   ...AssetStatus[]]).optional(),
  /** Comma-separated list of AssetStatus values — overrides `status` if provided. */
  statuses:    z.string().optional(),
  condition:   z.enum(ASSET_CONDITIONS as [AssetCondition,...AssetCondition[]]).optional(),
  assignedToId:         z.string().optional(),
  ownerId:              z.string().optional(),
  teamId:               z.coerce.number().int().positive().optional(),
  inventoryLocationId:  z.coerce.number().int().positive().optional(),
  discoverySource:      z.string().optional(),
  warrantyExpiringSoon: z.coerce.boolean().optional(),
  search:               z.string().max(200).optional(),
  page:                 z.coerce.number().int().positive().default(1),
  pageSize:             z.coerce.number().int().min(1).max(100).default(25),
  sortBy:               z.enum(["name", "assetNumber", "type", "status", "condition",
                                "warrantyExpiry", "purchaseDate", "updatedAt", "createdAt"]).default("name"),
  sortOrder:            z.enum(["asc", "desc"]).default("asc"),
});

export type ListAssetsQuery = z.infer<typeof listAssetsQuerySchema>;

// ── Assign ────────────────────────────────────────────────────────────────────

export const assignAssetSchema = z.object({
  userId: z.string().min(1),
  note:   z.string().max(500).nullish(),
});

export type AssignAssetInput = z.infer<typeof assignAssetSchema>;

// ── Lifecycle transition ──────────────────────────────────────────────────────

export const lifecycleTransitionSchema = z.object({
  status: z.enum(ASSET_STATUSES as [AssetStatus, ...AssetStatus[]]),
  reason: z.string().max(500).nullish(),
});

export type LifecycleTransitionInput = z.infer<typeof lifecycleTransitionSchema>;

// ── Asset relationship ────────────────────────────────────────────────────────

export const addAssetRelationshipSchema = z.object({
  toAssetId: z.number().int().positive(),
  type:      z.enum(ASSET_RELATIONSHIP_TYPES as [AssetRelType, ...AssetRelType[]]),
});

export type AddAssetRelationshipInput = z.infer<typeof addAssetRelationshipSchema>;

// ── Entity link (generic — validated by the service per entity type) ──────────

export const linkEntitySchema = z.object({
  entityId: z.number().int().positive(),
});

export type LinkEntityInput = z.infer<typeof linkEntitySchema>;

// ── Bulk actions ─────────────────────────────────────────────────────────────

const bulkIds = z.array(z.number().int().positive()).min(1).max(100);

export const bulkAssetActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("delete"),
    ids:    bulkIds,
  }),
  z.object({
    action: z.literal("transition"),
    ids:    bulkIds,
    status: z.enum(ASSET_STATUSES as [AssetStatus, ...AssetStatus[]]),
    reason: z.string().max(500).nullish(),
  }),
  z.object({
    action: z.literal("assign"),
    ids:    bulkIds,
    userId: z.string().nullable(),
    note:   z.string().max(500).nullish(),
  }),
  z.object({
    action:  z.literal("owner"),
    ids:     bulkIds,
    ownerId: z.string().nullable(),
  }),
  z.object({
    action: z.literal("team"),
    ids:    bulkIds,
    teamId: z.number().int().positive().nullable(),
  }),
  z.object({
    action:   z.literal("location"),
    ids:      bulkIds,
    location: z.string().max(200).nullable(),
  }),
]);

export type BulkAssetAction = z.infer<typeof bulkAssetActionSchema>;

// ── Bulk upsert (for import/discovery adapters) ───────────────────────────────

export const upsertAssetSchema = createAssetSchema.extend({
  // externalId + discoverySource together uniquely identify the source record
  externalId:      z.string().min(1).max(200),
  discoverySource: z.string().min(1).max(50),
});

export type UpsertAssetInput = z.infer<typeof upsertAssetSchema>;
