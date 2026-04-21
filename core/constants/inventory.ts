/**
 * Inventory management constants — location types and movement workflows.
 * Shared between server (route handlers) and client (display, filtering).
 */

// ── Domain types ──────────────────────────────────────────────────────────────

export type InventoryLocationType =
  | "stockroom"
  | "repair_facility"
  | "transit"
  | "deployed_site";

export type AssetMovementType =
  | "received"
  | "transferred"
  | "issued"
  | "returned"
  | "sent_to_repair"
  | "repaired"
  | "retired"
  | "disposed";

// ── Ordered arrays ────────────────────────────────────────────────────────────

export const INVENTORY_LOCATION_TYPES: InventoryLocationType[] = [
  "stockroom", "repair_facility", "transit", "deployed_site",
];

export const ASSET_MOVEMENT_TYPES: AssetMovementType[] = [
  "received", "transferred", "issued", "returned",
  "sent_to_repair", "repaired", "retired", "disposed",
];

// ── Label maps ────────────────────────────────────────────────────────────────

export const LOCATION_TYPE_LABEL: Record<InventoryLocationType, string> = {
  stockroom:       "Stockroom",
  repair_facility: "Repair Facility",
  transit:         "In Transit",
  deployed_site:   "Deployed Site",
};

export const MOVEMENT_TYPE_LABEL: Record<AssetMovementType, string> = {
  received:      "Received",
  transferred:   "Transferred",
  issued:        "Issued",
  returned:      "Returned",
  sent_to_repair: "Sent to Repair",
  repaired:      "Repaired",
  retired:       "Retired",
  disposed:      "Disposed",
};

export const MOVEMENT_TYPE_DESCRIPTION: Record<AssetMovementType, string> = {
  received:      "Asset received from vendor or supplier",
  transferred:   "Moved between internal stockrooms",
  issued:        "Issued to a user or department",
  returned:      "Returned by user to stockroom",
  sent_to_repair: "Sent for maintenance or repair",
  repaired:      "Returned from repair, back in stock",
  retired:       "Moved to end-of-life storage",
  disposed:      "Final physical disposal",
};

// ── Colour palette for movement type badges ───────────────────────────────────

export const MOVEMENT_TYPE_COLOR: Record<AssetMovementType, string> = {
  received:      "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/30",
  transferred:   "text-blue-700    bg-blue-50    border-blue-200    dark:text-blue-300    dark:bg-blue-900/30",
  issued:        "text-violet-700  bg-violet-50  border-violet-200  dark:text-violet-300  dark:bg-violet-900/30",
  returned:      "text-sky-700     bg-sky-50     border-sky-200     dark:text-sky-300     dark:bg-sky-900/30",
  sent_to_repair: "text-amber-700  bg-amber-50   border-amber-200   dark:text-amber-300   dark:bg-amber-900/30",
  repaired:      "text-teal-700    bg-teal-50    border-teal-200    dark:text-teal-300    dark:bg-teal-900/30",
  retired:       "text-muted-foreground bg-muted border-muted-foreground/20",
  disposed:      "text-muted-foreground bg-muted border-muted-foreground/20",
};

// ── Status transitions triggered by each movement type ───────────────────────
// null = no lifecycle change required

export const MOVEMENT_STATUS_TRANSITION: Record<AssetMovementType, string | null> = {
  received:      "in_stock",
  transferred:   null,
  issued:        "deployed",        // overrideable to "in_use"
  returned:      "in_stock",
  sent_to_repair: "under_maintenance",
  repaired:      "in_stock",
  retired:       "retired",
  disposed:      "disposed",
};

// ── Domain interface (shape returned by the API) ──────────────────────────────

export interface InventoryLocationSummary {
  id:           number;
  name:         string;
  code:         string | null;
  locationType: InventoryLocationType;
  site:         string | null;
  building:     string | null;
  room:         string | null;
  isActive:     boolean;
  _counts: {
    total:            number;
    in_stock:         number;
    active:           number;
    under_maintenance: number;
  };
}

export interface AssetMovementRecord {
  id:            number;
  movementType:  AssetMovementType;
  fromLocation:  { id: number; name: string; code: string | null } | null;
  toLocation:    { id: number; name: string; code: string | null } | null;
  fromLabel:     string | null;
  toLabel:       string | null;
  statusBefore:  string | null;
  statusAfter:   string | null;
  performedBy:   { id: string; name: string };
  reference:     string | null;
  notes:         string | null;
  createdAt:     string;
}
