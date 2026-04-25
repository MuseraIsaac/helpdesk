/**
 * Shared types for the Demo Data generation engine.
 */

// ── Module registry ───────────────────────────────────────────────────────────

export const ALL_MODULE_KEYS = [
  "foundation",   // users · teams · organisations · customers  (always required)
  "knowledge",    // KB categories + articles
  "macros",       // response macros / templates
  "catalog",      // catalog items · CAB group
  "tickets",      // support tickets · notes · replies · CSAT
  "incidents",    // incidents · timeline updates · CI links
  "requests",     // service requests · fulfillment tasks
  "problems",     // problems · incident links · notes
  "changes",      // changes · tasks · CAB approvals
  "assets",       // IT assets · asset-ITSM cross-links
  "cmdb",         // config items · CI relationships
  "software",     // SaaS subscriptions + software licenses
  "duty_plans",   // duty plans · shifts · assignments
  "ticket_config",// custom ticket types + custom ticket statuses
] as const;

export type ModuleKey = (typeof ALL_MODULE_KEYS)[number];

export const MODULE_META: Record<ModuleKey, { label: string; description: string; icon: string; dependsOn: ModuleKey[] }> = {
  foundation: {
    label:       "Foundation",
    description: "Users, teams, organisations and customers — required by all other modules",
    icon:        "Users",
    dependsOn:   [],
  },
  knowledge: {
    label:       "Knowledge Base",
    description: "KB categories and published articles covering common IT topics",
    icon:        "BookOpen",
    dependsOn:   ["foundation"],
  },
  macros: {
    label:       "Macros & Templates",
    description: "Pre-written response macros for common support scenarios",
    icon:        "Wrench",
    dependsOn:   ["foundation"],
  },
  catalog: {
    label:       "Service Catalog",
    description: "Catalog items and Change Advisory Board group",
    icon:        "ShoppingBag",
    dependsOn:   ["foundation"],
  },
  tickets: {
    label:       "Tickets",
    description: "Support tickets from customers with notes, replies and CSAT ratings",
    icon:        "Ticket",
    dependsOn:   ["foundation"],
  },
  incidents: {
    label:       "Incidents",
    description: "ITIL incidents with timeline updates, priority levels and asset links",
    icon:        "AlertTriangle",
    dependsOn:   ["foundation"],
  },
  requests: {
    label:       "Service Requests",
    description: "Service requests linked to catalog items and fulfillment teams",
    icon:        "Inbox",
    dependsOn:   ["foundation", "catalog"],
  },
  problems: {
    label:       "Problems",
    description: "Root-cause problem records linked to incidents and KB workarounds",
    icon:        "AlertCircle",
    dependsOn:   ["foundation", "incidents"],
  },
  changes: {
    label:       "Changes",
    description: "Standard, normal and emergency changes with CAB approval workflows",
    icon:        "ArrowUpDown",
    dependsOn:   ["foundation", "catalog"],
  },
  assets: {
    label:       "Assets",
    description: "IT asset inventory — laptops, servers, network gear — linked to incidents and changes",
    icon:        "Server",
    dependsOn:   ["foundation", "incidents", "changes"],
  },
  cmdb: {
    label:       "CMDB",
    description: "Configuration items with relationships, linked to incidents and changes",
    icon:        "Database",
    dependsOn:   ["foundation", "incidents", "changes"],
  },
  software: {
    label:       "Software & SaaS",
    description: "SaaS subscriptions and software license inventory with vendor and cost data",
    icon:        "Key",
    dependsOn:   ["foundation"],
  },
  duty_plans: {
    label:       "Duty Plans",
    description: "Shift schedules for each team — morning, afternoon, and night rotations with agent assignments",
    icon:        "CalendarDays",
    dependsOn:   ["foundation"],
  },
  ticket_config: {
    label:       "Ticket Configuration",
    description: "Custom ticket types (Bug, Feature Request, etc.) and custom workflow statuses",
    icon:        "Tag",
    dependsOn:   ["foundation"],
  },
};

// ── Size presets ──────────────────────────────────────────────────────────────

export type GeneratorSize = "small" | "medium" | "large";

export interface SizeParams {
  users:          number;
  teams:          number;
  orgs:           number;
  customers:      number;
  kbCats:         number;
  kbArts:         number;
  macros:         number;
  catalog:        number;
  tickets:        number;
  incidents:      number;
  requests:       number;
  problems:       number;
  changes:        number;
  assets:         number;
  ci:             number;
  saas:           number;
  licenses:       number;
  ticketTypes:    number;
  ticketStatuses: number;
}

export const SIZE_PARAMS: Record<GeneratorSize, SizeParams> = {
  small: {
    users: 6, teams: 2, orgs: 2, customers: 6,
    kbCats: 2, kbArts: 6, macros: 4, catalog: 3,
    tickets: 8, incidents: 6, requests: 6, problems: 3,
    changes: 4, assets: 8, ci: 4,
    saas: 8, licenses: 6, ticketTypes: 5, ticketStatuses: 5,
  },
  medium: {
    users: 10, teams: 4, orgs: 5, customers: 12,
    kbCats: 4, kbArts: 12, macros: 8, catalog: 6,
    tickets: 15, incidents: 10, requests: 10, problems: 5,
    changes: 8, assets: 15, ci: 8,
    saas: 14, licenses: 10, ticketTypes: 7, ticketStatuses: 7,
  },
  large: {
    users: 15, teams: 6, orgs: 8, customers: 22,
    kbCats: 5, kbArts: 20, macros: 12, catalog: 10,
    tickets: 30, incidents: 20, requests: 20, problems: 10,
    changes: 15, assets: 28, ci: 14,
    saas: 20, licenses: 18, ticketTypes: 10, ticketStatuses: 10,
  },
};

// ── Generator config + context ────────────────────────────────────────────────

export interface GeneratorConfig {
  batchId:   number;
  adminId:   string;
  adminName: string;
  size:      GeneratorSize;
  modules:   ModuleKey[];
}

/** Mutable context shared across all module generators. */
export interface GeneratorContext {
  adminId:        string;
  size:           GeneratorSize;
  params:         SizeParams;
  // Foundation
  userIds:        string[];
  supervisorIds:  string[];
  agentIds:       string[];
  teamIds:        number[];
  orgIds:         number[];
  customerIds:    number[];
  // Content
  kbCategoryIds:  number[];
  kbArticleIds:   number[];
  macroIds:       number[];
  // Service layer
  catalogItemIds: number[];
  cabGroupIds:    number[];
  // Operations
  ticketIds:      number[];
  incidentIds:    number[];
  requestIds:     number[];
  problemIds:     number[];
  changeIds:      number[];
  assetIds:       number[];
  ciIds:          number[];
  // Sub-records
  noteIds:           number[];
  replyIds:          number[];
  csatRatingIds:     number[];
  incidentUpdateIds: number[];
  approvalRequestIds:number[];
  // Software & SaaS
  saasIds:           number[];
  licenseIds:        number[];
  // Duty plans
  dutyPlanIds:       number[];
  // Ticket config
  ticketTypeIds:     number[];
  ticketStatusIds:   number[];
}

export function emptyContext(adminId: string, size: GeneratorSize): GeneratorContext {
  return {
    adminId, size, params: SIZE_PARAMS[size],
    userIds: [], supervisorIds: [], agentIds: [],
    teamIds: [], orgIds: [], customerIds: [],
    kbCategoryIds: [], kbArticleIds: [],
    macroIds: [], catalogItemIds: [], cabGroupIds: [],
    ticketIds: [], incidentIds: [], requestIds: [],
    problemIds: [], changeIds: [], assetIds: [], ciIds: [],
    noteIds: [], replyIds: [], csatRatingIds: [],
    incidentUpdateIds: [], approvalRequestIds: [],
    saasIds: [], licenseIds: [],
    dutyPlanIds: [],
    ticketTypeIds: [], ticketStatusIds: [],
  };
}

// ── Progress types ────────────────────────────────────────────────────────────

export type ModuleStatus = "pending" | "running" | "done" | "error" | "skipped";

export interface ModuleProgress {
  status:      ModuleStatus;
  count:       number;
  startedAt?:  string;
  completedAt?: string;
  error?:      string;
}

export type BatchProgress = Partial<Record<ModuleKey, ModuleProgress>>;

// ── RecordIds (what gets stored in batch.recordIds) ───────────────────────────

export interface RecordIds {
  userIds:            string[];
  teamIds:            number[];
  orgIds:             number[];
  customerIds:        number[];
  kbCategoryIds:      number[];
  kbArticleIds:       number[];
  macroIds:           number[];
  cabGroupIds:        number[];
  catalogItemIds:     number[];
  ticketIds:          number[];
  incidentIds:        number[];
  requestIds:         number[];
  problemIds:         number[];
  changeIds:          number[];
  assetIds:           number[];
  ciIds:              number[];
  noteIds:            number[];
  replyIds:           number[];
  csatRatingIds:      number[];
  incidentUpdateIds:  number[];
  approvalRequestIds: number[];
  saasIds:            number[];
  licenseIds:         number[];
  dutyPlanIds:        number[];
  ticketTypeIds:      number[];
  ticketStatusIds:    number[];
}

export function contextToRecordIds(ctx: GeneratorContext): RecordIds {
  return {
    userIds:            ctx.userIds,
    teamIds:            ctx.teamIds,
    orgIds:             ctx.orgIds,
    customerIds:        ctx.customerIds,
    kbCategoryIds:      ctx.kbCategoryIds,
    kbArticleIds:       ctx.kbArticleIds,
    macroIds:           ctx.macroIds,
    cabGroupIds:        ctx.cabGroupIds,
    catalogItemIds:     ctx.catalogItemIds,
    ticketIds:          ctx.ticketIds,
    incidentIds:        ctx.incidentIds,
    requestIds:         ctx.requestIds,
    problemIds:         ctx.problemIds,
    changeIds:          ctx.changeIds,
    assetIds:           ctx.assetIds,
    ciIds:              ctx.ciIds,
    noteIds:            ctx.noteIds,
    replyIds:           ctx.replyIds,
    csatRatingIds:      ctx.csatRatingIds,
    incidentUpdateIds:  ctx.incidentUpdateIds,
    approvalRequestIds: ctx.approvalRequestIds,
    saasIds:            ctx.saasIds,
    licenseIds:         ctx.licenseIds,
    dutyPlanIds:        ctx.dutyPlanIds,
    ticketTypeIds:      ctx.ticketTypeIds,
    ticketStatusIds:    ctx.ticketStatusIds,
  };
}

export function computeRecordCounts(ids: RecordIds): Record<string, number> {
  return Object.fromEntries(
    Object.entries(ids).map(([k, v]) => [k, (v as unknown[]).length])
  );
}
