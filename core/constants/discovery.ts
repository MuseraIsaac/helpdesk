/**
 * Asset Discovery & Sync — constants, domain types, and label maps.
 *
 * Shared between server (sync worker, routes) and client (UI display).
 */

// ── Connector sources ─────────────────────────────────────────────────────────

export type ConnectorSource =
  | "csv"
  | "jamf"
  | "intune"
  | "sccm"
  | "snmp"
  | "custom";

export const CONNECTOR_SOURCES: ConnectorSource[] = [
  "csv", "jamf", "intune", "sccm", "snmp", "custom",
];

export const CONNECTOR_SOURCE_LABEL: Record<ConnectorSource, string> = {
  csv:    "CSV Import",
  jamf:   "Jamf Pro",
  intune: "Microsoft Intune",
  sccm:   "SCCM / ConfigMgr",
  snmp:   "SNMP Network Sweep",
  custom: "Custom Adapter",
};

export const CONNECTOR_SOURCE_DESCRIPTION: Record<ConnectorSource, string> = {
  csv:    "Upload a CSV file to create or update asset records in bulk.",
  jamf:   "Sync macOS and iOS devices managed by Jamf Pro MDM.",
  intune: "Sync Windows, macOS, iOS, and Android devices from Microsoft Intune.",
  sccm:   "Sync Windows endpoints managed by SCCM / Microsoft Endpoint Manager.",
  snmp:   "Discover network-attached devices via SNMP sweep.",
  custom: "Integrate a custom or third-party discovery source.",
};

/**
 * Env vars that must be set for each connector type (for display in UI).
 * Secrets MUST come from environment variables, never from the database config.
 */
export const CONNECTOR_REQUIRED_ENV: Record<ConnectorSource, string[]> = {
  csv:    [],
  jamf:   ["JAMF_CLIENT_ID", "JAMF_CLIENT_SECRET"],
  intune: ["INTUNE_TENANT_ID", "INTUNE_CLIENT_ID", "INTUNE_CLIENT_SECRET"],
  sccm:   ["SCCM_SERVER", "SCCM_USERNAME", "SCCM_PASSWORD"],
  snmp:   ["SNMP_COMMUNITY_STRING"],
  custom: [],
};

// ── Sync policy ───────────────────────────────────────────────────────────────

export type SyncPolicy = "merge" | "overwrite";

export const SYNC_POLICY_LABEL: Record<SyncPolicy, string> = {
  merge:     "Merge (preserve operator fields)",
  overwrite: "Overwrite (source is authoritative)",
};

export const SYNC_POLICY_DESCRIPTION: Record<SyncPolicy, string> = {
  merge:     "Only updates discovery-managed fields (name, serial, location, status). Operator-set fields (owner, team, procurement) are preserved.",
  overwrite: "Overwrites all mapped fields including location, status, and hardware details. Use only when the source is the single source of truth.",
};

// ── Sync run status ───────────────────────────────────────────────────────────

export type SyncRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export const SYNC_RUN_STATUS_LABEL: Record<SyncRunStatus, string> = {
  pending:   "Pending",
  running:   "Running",
  completed: "Completed",
  failed:    "Failed",
  cancelled: "Cancelled",
};

export const SYNC_RUN_STATUS_COLOR: Record<SyncRunStatus, string> = {
  pending:   "bg-muted       text-muted-foreground  border-muted-foreground/20",
  running:   "bg-sky-50      text-sky-700           border-sky-200      dark:bg-sky-900/30      dark:text-sky-300",
  completed: "bg-emerald-50  text-emerald-700       border-emerald-200  dark:bg-emerald-900/30  dark:text-emerald-300",
  failed:    "bg-red-50      text-red-700           border-red-200      dark:bg-red-900/30      dark:text-red-300",
  cancelled: "bg-muted       text-muted-foreground  border-muted-foreground/20",
};

export type SyncTriggerType = "schedule" | "manual" | "import";

export const SYNC_TRIGGER_LABEL: Record<SyncTriggerType, string> = {
  schedule: "Scheduled",
  manual:   "Manual",
  import:   "CSV Import",
};

// ── CSV import ────────────────────────────────────────────────────────────────

/**
 * Expected CSV column headers (case-insensitive, aliases supported).
 * The `externalId` column is required for upsert identity.
 * Source defaults to "csv" if omitted.
 */
export const CSV_COLUMN_ALIASES: Record<string, string> = {
  // Required — camelCase as typed AND lowercased (normaliseHeader lowercases all headers)
  externalid:   "externalId",
  external_id:  "externalId",
  id:           "externalId",
  // Name
  asset_name:   "name",
  // Type
  asset_type:   "type",
  // Identity — camelCase lowercased variants
  serialnumber:  "serialNumber",
  serial_number: "serialNumber",
  serial:        "serialNumber",
  assettag:     "assetTag",
  asset_tag:    "assetTag",
  tag:          "assetTag",
  // Hardware
  make:         "manufacturer",
  // Assignment — camelCase lowercased variants
  assignedtoemail:   "assignedToEmail",
  assigned_to_email: "assignedToEmail",
  assigned_email:    "assignedToEmail",
  email:             "assignedToEmail",
  // Location
  // (location, site, manufacturer, model, status, condition are direct matches)
};

// ── Domain interfaces ─────────────────────────────────────────────────────────

export interface ConnectorSummary {
  id:                 number;
  source:             ConnectorSource;
  label:              string;
  isEnabled:          boolean;
  scheduleExpression: string | null;
  syncPolicy:         SyncPolicy;
  config:             Record<string, unknown>;
  lastSyncAt:         string | null;
  nextSyncAt:         string | null;
  totalSynced:        number;
  description:        string | null;
  createdAt:          string;
  recentRun:          SyncRunSummary | null;
}

export interface SyncRunSummary {
  id:               number;
  source:           string;
  status:           SyncRunStatus;
  triggerType:      SyncTriggerType;
  startedAt:        string | null;
  completedAt:      string | null;
  durationMs:       number | null;
  assetsDiscovered: number;
  assetsCreated:    number;
  assetsUpdated:    number;
  assetsSkipped:    number;
  assetsFailed:     number;
  assetsStale:      number;
  errorMessage:     string | null;
  triggeredByUser:  { id: string; name: string } | null;
  createdAt:        string;
}

export interface SyncRunDetail extends SyncRunSummary {
  connectorId:   number;
  connectorLabel: string;
  jobId:         string | null;
  errors:        SyncErrorRecord[];
}

export interface SyncErrorRecord {
  id:           number;
  externalId:   string | null;
  errorMessage: string;
  rawData:      Record<string, unknown>;
  createdAt:    string;
}
