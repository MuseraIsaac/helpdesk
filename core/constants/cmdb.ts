/**
 * CMDB — Configuration Item constants and domain types.
 *
 * Shared between server (route handlers) and client (display, filtering).
 * All enum values mirror the Prisma schema enums.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type CiType =
  | "server"
  | "workstation"
  | "network_device"
  | "application"
  | "service"
  | "database"
  | "storage"
  | "virtual_machine"
  | "container"
  | "printer"
  | "mobile_device"
  | "other";

export type CiEnvironment =
  | "production"
  | "staging"
  | "development"
  | "test"
  | "disaster_recovery";

export type CiCriticality = "critical" | "high" | "medium" | "low";

export type CiStatus =
  | "active"
  | "maintenance"
  | "planned"
  | "retired"
  | "decommissioned";

export type CiRelationshipType =
  | "depends_on"
  | "hosts"
  | "is_parent_of"
  | "connects_to"
  | "backs_up";

// ── Label maps ────────────────────────────────────────────────────────────────

export const CI_TYPE_LABEL: Record<CiType, string> = {
  server:         "Server",
  workstation:    "Workstation",
  network_device: "Network Device",
  application:    "Application",
  service:        "Service",
  database:       "Database",
  storage:        "Storage",
  virtual_machine:"Virtual Machine",
  container:      "Container",
  printer:        "Printer",
  mobile_device:  "Mobile Device",
  other:          "Other",
};

export const CI_ENVIRONMENT_LABEL: Record<CiEnvironment, string> = {
  production:       "Production",
  staging:          "Staging",
  development:      "Development",
  test:             "Test",
  disaster_recovery:"DR",
};

export const CI_CRITICALITY_LABEL: Record<CiCriticality, string> = {
  critical: "Critical",
  high:     "High",
  medium:   "Medium",
  low:      "Low",
};

export const CI_STATUS_LABEL: Record<CiStatus, string> = {
  active:          "Active",
  maintenance:     "Maintenance",
  planned:         "Planned",
  retired:         "Retired",
  decommissioned:  "Decommissioned",
};

export const CI_RELATIONSHIP_LABEL: Record<CiRelationshipType, string> = {
  depends_on:   "Depends On",
  hosts:        "Hosts",
  is_parent_of: "Parent Of",
  connects_to:  "Connects To",
  backs_up:     "Backs Up",
};

// ── Ordered lists (for selects / filters) ─────────────────────────────────────

export const CI_TYPES: CiType[] = [
  "server", "workstation", "network_device", "application", "service",
  "database", "storage", "virtual_machine", "container", "printer",
  "mobile_device", "other",
];

export const CI_ENVIRONMENTS: CiEnvironment[] = [
  "production", "staging", "development", "test", "disaster_recovery",
];

export const CI_CRITICALITIES: CiCriticality[] = ["critical", "high", "medium", "low"];

export const CI_STATUSES: CiStatus[] = [
  "active", "maintenance", "planned", "retired", "decommissioned",
];

export const CI_RELATIONSHIP_TYPES: CiRelationshipType[] = [
  "depends_on", "hosts", "is_parent_of", "connects_to", "backs_up",
];

// ── Criticality styling ───────────────────────────────────────────────────────

export const CI_CRITICALITY_COLOR: Record<CiCriticality, string> = {
  critical: "text-destructive",
  high:     "text-orange-600 dark:text-orange-400",
  medium:   "text-yellow-600 dark:text-yellow-400",
  low:      "text-muted-foreground",
};

// ── Domain interfaces (returned by API) ───────────────────────────────────────

export interface CiSummary {
  id: number;
  ciNumber: string;
  name: string;
  type: CiType;
  environment: CiEnvironment;
  criticality: CiCriticality;
  status: CiStatus;
  tags: string[];
  owner: { id: string; name: string } | null;
  team: { id: number; name: string; color: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CiRelationship {
  id: number;
  type: CiRelationshipType;
  ci: CiSummary;
  direction: "outbound" | "inbound";
}

export interface CiEvent {
  id: number;
  action: string;
  meta: Record<string, unknown>;
  actor: { id: string; name: string } | null;
  createdAt: string;
}

export interface CiDetail extends CiSummary {
  description: string | null;
  relationships: CiRelationship[];
  events: CiEvent[];
}
