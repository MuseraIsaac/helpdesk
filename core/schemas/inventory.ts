import { z } from "zod/v4";
import { INVENTORY_LOCATION_TYPES, ASSET_MOVEMENT_TYPES } from "../constants/inventory.ts";

type LocationType = typeof INVENTORY_LOCATION_TYPES[number];
type MovementType = typeof ASSET_MOVEMENT_TYPES[number];

// ── Inventory Location CRUD ───────────────────────────────────────────────────

export const createLocationSchema = z.object({
  name:        z.string().min(1, "Name is required").max(100),
  code:        z.string().max(50).nullish(),
  locationType: z.enum(INVENTORY_LOCATION_TYPES as [LocationType, ...LocationType[]]).default("stockroom"),
  description: z.string().max(2000).nullish(),
  site:        z.string().max(100).nullish(),
  building:    z.string().max(100).nullish(),
  room:        z.string().max(100).nullish(),
});

export type CreateLocationInput = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = createLocationSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

// ── Receive ───────────────────────────────────────────────────────────────────
// Asset arrives from vendor / external source into a managed stockroom.

export const receiveAssetSchema = z.object({
  toLocationId: z.number().int().positive(),
  fromLabel:    z.string().max(200).nullish(),   // e.g. "Vendor DHL", "Return from HQ"
  reference:    z.string().max(200).nullish(),   // PO#, delivery ref
  notes:        z.string().max(2000).nullish(),
});

export type ReceiveAssetInput = z.infer<typeof receiveAssetSchema>;

// ── Transfer ──────────────────────────────────────────────────────────────────
// Move between internal managed locations (no lifecycle change).

export const transferAssetSchema = z.object({
  toLocationId: z.number().int().positive(),
  notes:        z.string().max(2000).nullish(),
});

export type TransferAssetInput = z.infer<typeof transferAssetSchema>;

// ── Issue ─────────────────────────────────────────────────────────────────────
// Issue to a user. Creates an assignment and transitions to deployed or in_use.

export const issueAssetSchema = z.object({
  userId:    z.string().min(1),
  newStatus: z.enum(["deployed", "in_use"]).default("deployed"),
  notes:     z.string().max(2000).nullish(),
  reference: z.string().max(200).nullish(),
});

export type IssueAssetInput = z.infer<typeof issueAssetSchema>;

// ── Return ────────────────────────────────────────────────────────────────────
// User returns the asset to a stockroom. Closes assignment, transitions to in_stock.

export const returnAssetSchema = z.object({
  toLocationId: z.number().int().positive(),
  notes:        z.string().max(2000).nullish(),
});

export type ReturnAssetInput = z.infer<typeof returnAssetSchema>;

// ── Send to repair ────────────────────────────────────────────────────────────
// Dispatch for maintenance. Transitions to under_maintenance.

export const sendRepairSchema = z.object({
  toLocationId: z.number().int().positive().nullish(),  // nullable = external vendor
  toLabel:      z.string().max(200).nullish(),           // e.g. "HP Service Center"
  reference:    z.string().max(200).nullish(),           // Repair ticket #, RMA #
  notes:        z.string().max(2000).nullish(),
});

export type SendRepairInput = z.infer<typeof sendRepairSchema>;

// ── Complete repair ───────────────────────────────────────────────────────────
// Asset back from repair, returned to a stockroom. Transitions to in_stock.

export const completeRepairSchema = z.object({
  toLocationId: z.number().int().positive(),
  notes:        z.string().max(2000).nullish(),
});

export type CompleteRepairInput = z.infer<typeof completeRepairSchema>;
