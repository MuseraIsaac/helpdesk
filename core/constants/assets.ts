/**
 * IT Asset Management — constants, domain types, and label maps.
 *
 * Shared between server (route handlers) and client (display, filtering).
 * All enum values mirror the Prisma schema enums.
 *
 * ITAM vs CMDB distinction:
 *  - ConfigItem (CMDB): operational topology, dependencies, configuration state.
 *  - Asset (ITAM): procurement record, physical ownership, lifecycle, financial data.
 * An Asset links to a ConfigItem when both views apply (e.g. a server).
 */

// ── Domain types ──────────────────────────────────────────────────────────────

export type AssetType =
  | "hardware"
  | "end_user_device"
  | "software_license"
  | "network_equipment"
  | "peripheral"
  | "mobile_device"
  | "cloud_resource"
  | "iot_device"
  | "audio_visual"
  | "vehicle"
  | "furniture"
  | "consumable"
  | "other";

export type AssetStatus =
  | "ordered"
  | "in_stock"
  | "deployed"
  | "in_use"
  | "under_maintenance"
  | "in_repair"        // legacy — prefer under_maintenance for new records
  | "retired"
  | "disposed"
  | "lost_stolen";

export type AssetCondition = "new_item" | "good" | "fair" | "poor";

export type DepreciationMethod = "straight_line" | "declining_balance" | "none";

export type AssetRelationshipType =
  | "is_component_of"
  | "contains"
  | "is_installed_on"
  | "has_installed"
  | "is_connected_to"
  | "backs_up"
  | "is_spare_for"
  | "is_upgrade_of"
  | "is_hosted_on"
  | "hosts"
  | "depends_on"
  | "is_managed_by";

/** Entities an asset can be linked to (for impact/context tracking). */
export type AssetLinkTarget = "incident" | "request" | "problem" | "change" | "service";

// ── Label maps ────────────────────────────────────────────────────────────────

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  hardware:          "Hardware",
  end_user_device:   "End-User Device",
  software_license:  "Software License",
  network_equipment: "Network Equipment",
  peripheral:        "Peripheral",
  mobile_device:     "Mobile Device",
  cloud_resource:    "Cloud Resource",
  iot_device:        "IoT Device",
  audio_visual:      "Audio / Visual",
  vehicle:           "Vehicle",
  furniture:         "Furniture",
  consumable:        "Consumable",
  other:             "Other",
};

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  ordered:           "Ordered",
  in_stock:          "In Stock",
  deployed:          "Deployed",
  in_use:            "In Use",
  under_maintenance: "Under Maintenance",
  in_repair:         "In Repair",
  retired:           "Retired",
  disposed:          "Disposed",
  lost_stolen:       "Lost / Stolen",
};

export const ASSET_CONDITION_LABEL: Record<AssetCondition, string> = {
  new_item: "New",
  good:     "Good",
  fair:     "Fair",
  poor:     "Poor",
};

export const DEPRECIATION_METHOD_LABEL: Record<DepreciationMethod, string> = {
  straight_line:     "Straight-Line",
  declining_balance: "Declining Balance",
  none:              "None",
};

export const ASSET_RELATIONSHIP_LABEL: Record<AssetRelationshipType, string> = {
  is_component_of: "Is Component Of",
  contains:        "Contains",
  is_installed_on: "Is Installed On",
  has_installed:   "Has Installed",
  is_connected_to: "Is Connected To",
  backs_up:        "Backs Up",
  is_spare_for:    "Is Spare For",
  is_upgrade_of:   "Is Upgrade Of",
  is_hosted_on:    "Is Hosted On",
  hosts:           "Hosts",
  depends_on:      "Depends On",
  is_managed_by:   "Is Managed By",
};

// ── Ordered arrays (for selects / filters) ────────────────────────────────────

export const ASSET_TYPES: AssetType[] = [
  "hardware", "end_user_device", "software_license", "network_equipment",
  "peripheral", "mobile_device", "cloud_resource", "iot_device",
  "audio_visual", "vehicle", "furniture", "consumable", "other",
];

export const ASSET_STATUSES: AssetStatus[] = [
  "ordered", "in_stock", "deployed", "in_use", "under_maintenance",
  "in_repair", "retired", "disposed", "lost_stolen",
];

export const ASSET_CONDITIONS: AssetCondition[] = ["new_item", "good", "fair", "poor"];

export const DEPRECIATION_METHODS: DepreciationMethod[] = [
  "straight_line", "declining_balance", "none",
];

export const ASSET_RELATIONSHIP_TYPES: AssetRelationshipType[] = [
  "is_component_of", "contains", "is_installed_on", "has_installed",
  "is_connected_to", "backs_up", "is_spare_for", "is_upgrade_of",
  "is_hosted_on", "hosts", "depends_on", "is_managed_by",
];

// ── Badge / colour maps ───────────────────────────────────────────────────────

export const ASSET_STATUS_VARIANT: Record<
  AssetStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  ordered:           "secondary",
  in_stock:          "outline",
  deployed:          "default",
  in_use:            "default",
  under_maintenance: "secondary",
  in_repair:         "secondary",
  retired:           "secondary",
  disposed:          "secondary",
  lost_stolen:       "destructive",
};

export const ASSET_CONDITION_COLOR: Record<AssetCondition, string> = {
  new_item: "text-emerald-600 dark:text-emerald-400",
  good:     "text-blue-600 dark:text-blue-400",
  fair:     "text-yellow-600 dark:text-yellow-400",
  poor:     "text-destructive",
};

// ── Lifecycle transition map ──────────────────────────────────────────────────
//
// Used by both the state-machine service (server) and transition UI (client).
// Only the listed target statuses are valid moves from each source status.

export const LIFECYCLE_TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  ordered:           ["in_stock"],
  in_stock:          ["deployed", "in_use", "under_maintenance", "retired", "disposed", "lost_stolen"],
  deployed:          ["in_use", "in_stock", "under_maintenance", "retired", "lost_stolen"],
  in_use:            ["deployed", "in_stock", "under_maintenance", "retired", "lost_stolen"],
  under_maintenance: ["deployed", "in_use", "in_stock", "retired", "disposed"],
  in_repair:         ["deployed", "in_use", "in_stock", "retired", "disposed"],
  retired:           ["disposed", "in_stock"],
  disposed:          [],       // terminal
  lost_stolen:       ["in_stock", "disposed"],
};

// ── Domain interfaces (shapes returned by the API) ────────────────────────────

export interface AssetSummary {
  id:              number;
  assetNumber:     string;
  name:            string;
  type:            AssetType;
  status:          AssetStatus;
  condition:       AssetCondition;
  manufacturer:    string | null;
  model:           string | null;
  serialNumber:    string | null;
  assetTag:        string | null;
  location:        string | null;
  warrantyExpiry:  string | null;
  purchaseDate:    string | null;
  purchasePrice:   string | null;
  currency:        string;
  vendor:          string | null;
  contractReference: string | null;
  externalId:      string | null;
  discoverySource: string | null;
  managedBy:       string | null;
  assignedTo:  { id: string; name: string } | null;
  owner:       { id: string; name: string } | null;
  team:        { id: number; name: string; color: string } | null;
  ci:          { id: number; ciNumber: string; name: string } | null;
  inventoryLocation: { id: number; name: string; code: string | null; locationType: string } | null;
  createdAt:   string;
  updatedAt:   string;
  _counts: {
    relationships: number;
    incidents:     number;
    requests:      number;
    problems:      number;
    changes:       number;
  };
}

export interface AssetAssignmentRecord {
  id:           number;
  userId:       string;
  userName:     string;
  assignedAt:   string;
  unassignedAt: string | null;
  note:         string | null;
  assignedBy:   { id: string; name: string } | null;
}

export interface AssetRelationshipRecord {
  id:        number;
  type:      AssetRelationshipType;
  direction: "outbound" | "inbound";
  asset:     AssetSummary;
}

export interface AssetLinkedEntity {
  id:         number;
  number:     string;   // ticketNumber / incidentNumber / etc.
  title:      string;
  status:     string;
  linkedAt:   string;
}

export interface AssetEvent {
  id:        number;
  action:    string;
  meta:      Record<string, unknown>;
  actor:     { id: string; name: string } | null;
  createdAt: string;
}

export interface AssetMovementRecord {
  id:           number;
  movementType: string;
  fromLocation: { id: number; name: string; code: string | null } | null;
  toLocation:   { id: number; name: string; code: string | null } | null;
  fromLabel:    string | null;
  toLabel:      string | null;
  statusBefore: string | null;
  statusAfter:  string | null;
  performedBy:  { id: string; name: string };
  reference:    string | null;
  notes:        string | null;
  createdAt:    string;
}

export interface AssetDetail extends AssetSummary {
  contracts: import("./contracts.ts").AssetContractSummary[];
  depreciation: import("./contracts.ts").DepreciationResult | null;
  site:               string | null;
  building:           string | null;
  room:               string | null;
  poNumber:           string | null;
  invoiceNumber:      string | null;
  warrantyType:       string | null;
  receivedAt:         string | null;
  deployedAt:         string | null;
  endOfLifeAt:        string | null;
  retiredAt:          string | null;
  lastDiscoveredAt:   string | null;
  depreciationMethod: DepreciationMethod;
  usefulLifeYears:    number | null;
  salvageValue:       string | null;
  complianceNotes:    string | null;
  disposalMethod:     string | null;
  disposalCertificate: string | null;
  notes:              string | null;
  assignments:        AssetAssignmentRecord[];
  relationships:      AssetRelationshipRecord[];
  incidents:          AssetLinkedEntity[];
  requests:           AssetLinkedEntity[];
  problems:           AssetLinkedEntity[];
  changes:            AssetLinkedEntity[];
  services:           AssetLinkedEntity[];
  events:             AssetEvent[];
  movements:          AssetMovementRecord[];
}
