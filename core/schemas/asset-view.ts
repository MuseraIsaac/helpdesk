import { z } from "zod/v4";

// ── Column registry ───────────────────────────────────────────────────────────

export const ASSET_COLUMN_IDS = [
  "assetNumber",
  "name",
  "type",
  "status",
  "condition",
  "manufacturer",
  "model",
  "serialNumber",
  "assetTag",
  "assignedTo",
  "owner",
  "team",
  "location",
  "warrantyExpiry",
  "purchaseDate",
  "purchasePrice",
  "vendor",
  "discoverySource",
  "createdAt",
  "updatedAt",
] as const;

export type AssetColumnId = (typeof ASSET_COLUMN_IDS)[number];

export interface AssetColumnMeta {
  label: string;
  defaultVisible: boolean;
  sortable: boolean;
  sortKey?: string;
}

export const ASSET_COLUMN_META: Record<AssetColumnId, AssetColumnMeta> = {
  assetNumber:     { label: "#",             defaultVisible: true,  sortable: true,  sortKey: "assetNumber" },
  name:            { label: "Name",          defaultVisible: true,  sortable: true,  sortKey: "name" },
  type:            { label: "Type",          defaultVisible: true,  sortable: true,  sortKey: "type" },
  status:          { label: "Status",        defaultVisible: true,  sortable: true,  sortKey: "status" },
  condition:       { label: "Condition",     defaultVisible: true,  sortable: true,  sortKey: "condition" },
  manufacturer:    { label: "Manufacturer",  defaultVisible: true,  sortable: false },
  model:           { label: "Model",         defaultVisible: false, sortable: false },
  serialNumber:    { label: "Serial No.",    defaultVisible: false, sortable: false },
  assetTag:        { label: "Asset Tag",     defaultVisible: false, sortable: false },
  assignedTo:      { label: "Assigned To",   defaultVisible: true,  sortable: false },
  owner:           { label: "Owner",         defaultVisible: false, sortable: false },
  team:            { label: "Team",          defaultVisible: false, sortable: false },
  location:        { label: "Location",      defaultVisible: true,  sortable: false },
  warrantyExpiry:  { label: "Warranty",      defaultVisible: true,  sortable: true,  sortKey: "warrantyExpiry" },
  purchaseDate:    { label: "Purchased",     defaultVisible: false, sortable: true,  sortKey: "purchaseDate" },
  purchasePrice:   { label: "Price",         defaultVisible: false, sortable: false },
  vendor:          { label: "Vendor",        defaultVisible: false, sortable: false },
  discoverySource: { label: "Source",        defaultVisible: false, sortable: false },
  createdAt:       { label: "Created",       defaultVisible: false, sortable: true,  sortKey: "createdAt" },
  updatedAt:       { label: "Updated",       defaultVisible: false, sortable: true,  sortKey: "updatedAt" },
};

// ── Config schemas ────────────────────────────────────────────────────────────

const columnEntrySchema = z.object({
  id:      z.enum(ASSET_COLUMN_IDS),
  visible: z.boolean(),
});

/**
 * Optional filter preset embedded in a saved asset view.
 * `statuses` is a comma-separated list matching AssetStatus values.
 */
const assetViewFiltersSchema = z.object({
  type:      z.string().optional(),
  condition: z.string().optional(),
  statuses:  z.string().optional(),
}).optional();

export const assetViewConfigSchema = z.object({
  columns: z.array(columnEntrySchema),
  sort: z.object({
    by:    z.string().default("name"),
    order: z.enum(["asc", "desc"]).default("asc"),
  }),
  filters: assetViewFiltersSchema,
});

export type AssetViewConfig = z.infer<typeof assetViewConfigSchema>;

// ── System default ────────────────────────────────────────────────────────────

export const SYSTEM_DEFAULT_ASSET_VIEW_CONFIG: AssetViewConfig = {
  columns: ASSET_COLUMN_IDS.map(id => ({ id, visible: ASSET_COLUMN_META[id].defaultVisible })),
  sort: { by: "name", order: "asc" },
  filters: undefined,
};

// ── CRUD schemas ──────────────────────────────────────────────────────────────

export const createSavedAssetViewSchema = z.object({
  name:         z.string().trim().min(1, "Name is required").max(100, "Name too long"),
  emoji:        z.string().max(10).optional(),
  isShared:     z.boolean().default(false),
  setAsDefault: z.boolean().default(false),
  config:       assetViewConfigSchema,
});

export const updateSavedAssetViewSchema = z.object({
  name:   z.string().trim().min(1).max(100).optional(),
  emoji:  z.string().max(10).optional(),
  config: assetViewConfigSchema.optional(),
});
