/**
 * Permission Catalog — human-readable metadata for every permission.
 *
 * The Permission union in `permission.ts` is the source of truth for *which*
 * permissions exist. This file describes what each permission *means* so the
 * admin Roles UI can render meaningful toggles instead of opaque keys.
 *
 * When you add a permission to the union, add an entry here. The role-editor
 * UI will warn if any permission is missing a catalog entry.
 */

import type { Permission } from "./permission.ts";

export type PermissionCategory =
  | "dashboards"
  | "service_desk"
  | "incidents"
  | "problems"
  | "requests"
  | "changes"
  | "tasks"
  | "assets"
  | "contacts"
  | "catalog"
  | "approvals"
  | "workflows"
  | "automations"
  | "reports"
  | "knowledge"
  | "administration";

export interface PermissionMeta {
  /** Stable string id that matches the Permission union. */
  key: Permission;
  /** Short, sentence-case label shown in toggles. */
  label: string;
  /** One-sentence explanation rendered under the toggle. */
  description: string;
  /** Top-level grouping for the matrix. */
  category: PermissionCategory;
  /** Marks high-impact permissions (delete/manage/approve) so the UI can warn. */
  isDangerous?: boolean;
  /** When true, removing this permission from every role would brick the system. */
  isCriticalForAdmin?: boolean;
  /** When true, viewing this permission does not include managing it. */
  isViewOnly?: boolean;
}

export const PERMISSION_CATEGORIES: { id: PermissionCategory; label: string; description: string }[] = [
  { id: "dashboards",      label: "Dashboards",                 description: "Personal and shared analytics dashboards" },
  { id: "service_desk",    label: "Service Desk",               description: "Tickets, replies, notes, macros, templates" },
  { id: "incidents",       label: "Incident Management",        description: "Major incident records and incident response" },
  { id: "problems",        label: "Problem Management",         description: "Root cause analysis and known errors" },
  { id: "requests",        label: "Service Requests",           description: "Catalog-driven request fulfilment" },
  { id: "changes",         label: "Change Management",          description: "Change requests, CAB approvals, change calendar" },
  { id: "tasks",           label: "Tasks",                      description: "Sub-tasks attached to tickets, changes, problems" },
  { id: "assets",          label: "Assets & Configuration",     description: "Hardware, software, services, CMDB, contracts" },
  { id: "contacts",        label: "Contacts",                   description: "Customer and organization records" },
  { id: "catalog",         label: "Service Catalog",            description: "Catalog item authoring and self-service requests" },
  { id: "approvals",       label: "Approvals",                  description: "Approval queues and decision authority" },
  { id: "workflows",       label: "Workflows",                  description: "Visual workflow definitions" },
  { id: "automations",     label: "Automation & Webhooks",      description: "Rule engine, scenarios, outbound webhooks" },
  { id: "reports",         label: "Reporting & Insights",       description: "Saved reports, exports, scheduled delivery" },
  { id: "knowledge",       label: "Knowledge Base",             description: "Articles, drafts, lifecycle management" },
  { id: "administration",  label: "Platform Administration",    description: "Users, teams, integrations, audit log, ticket types" },
];

export const PERMISSION_CATALOG: PermissionMeta[] = [
  // ── Dashboards ─────────────────────────────────────────────────────────────
  { key: "dashboard.manage_own",
    label: "Manage own dashboards",
    description: "Create, edit, and delete dashboards that belong to the current user.",
    category: "dashboards" },
  { key: "dashboard.manage_shared",
    label: "Publish shared dashboards",
    description: "Publish dashboards visible org-wide, edit other people's shared dashboards.",
    category: "dashboards", isDangerous: true },
  { key: "dashboard.share_to_team",
    label: "Share dashboards with team",
    description: "Share a personal dashboard with a team the user belongs to.",
    category: "dashboards" },

  // ── Service Desk ───────────────────────────────────────────────────────────
  { key: "tickets.view",
    label: "View tickets",
    description: "Browse the ticket queue and open ticket detail pages.",
    category: "service_desk", isViewOnly: true },
  { key: "tickets.create",
    label: "Create tickets",
    description: "Open new tickets manually from the agent UI.",
    category: "service_desk" },
  { key: "tickets.update",
    label: "Update tickets",
    description: "Edit ticket fields (status, priority, assignee, custom fields).",
    category: "service_desk" },
  { key: "notes.view",
    label: "View internal notes",
    description: "Read internal notes attached to tickets and ITSM records.",
    category: "service_desk", isViewOnly: true },
  { key: "notes.create",
    label: "Create internal notes",
    description: "Post internal notes that are not visible to customers.",
    category: "service_desk" },
  { key: "notes.manage_any",
    label: "Manage all notes",
    description: "Edit or delete notes authored by other agents.",
    category: "service_desk", isDangerous: true },
  { key: "attachments.delete_any",
    label: "Delete any attachment",
    description: "Remove attachments uploaded by other users from tickets.",
    category: "service_desk", isDangerous: true },
  { key: "replies.create",
    label: "Reply to customers",
    description: "Send customer-visible replies to ticket conversations.",
    category: "service_desk" },
  { key: "macros.view",
    label: "Use macros",
    description: "Browse and apply pre-defined macro actions to tickets.",
    category: "service_desk", isViewOnly: true },
  { key: "macros.create",
    label: "Create macros",
    description: "Author new personal macros.",
    category: "service_desk" },
  { key: "macros.manage",
    label: "Manage shared macros",
    description: "Edit, delete, and publish macros shared across the team.",
    category: "service_desk", isDangerous: true },
  { key: "templates.view",
    label: "Use reply templates",
    description: "Browse and insert canned reply templates.",
    category: "service_desk", isViewOnly: true },
  { key: "templates.create",
    label: "Create reply templates",
    description: "Author new personal reply templates.",
    category: "service_desk" },
  { key: "templates.manage",
    label: "Manage shared templates",
    description: "Publish, edit, and delete shared reply templates.",
    category: "service_desk", isDangerous: true },

  // ── Incidents ──────────────────────────────────────────────────────────────
  { key: "incidents.view",
    label: "View incidents",
    description: "Browse the incident queue and incident detail pages.",
    category: "incidents", isViewOnly: true },
  { key: "incidents.manage",
    label: "Manage incidents",
    description: "Create, update, declare major, post updates, resolve, and close incidents.",
    category: "incidents" },

  // ── Service Requests ───────────────────────────────────────────────────────
  { key: "requests.view",
    label: "View service requests",
    description: "Browse the service request queue.",
    category: "requests", isViewOnly: true },
  { key: "requests.manage",
    label: "Fulfil service requests",
    description: "Update, approve fulfilment steps, complete, or cancel service requests.",
    category: "requests" },

  // ── Problems ───────────────────────────────────────────────────────────────
  { key: "problems.view",
    label: "View problems",
    description: "Browse the problem queue and problem detail pages.",
    category: "problems", isViewOnly: true },
  { key: "problems.manage",
    label: "Manage problems",
    description: "Create, assign, update root cause / workaround, complete PIR, and close problems.",
    category: "problems", isDangerous: true },

  // ── Change Management ──────────────────────────────────────────────────────
  { key: "changes.view",
    label: "View changes",
    description: "Read any change record, related tasks, and change history.",
    category: "changes", isViewOnly: true },
  { key: "changes.create",
    label: "Create change requests",
    description: "Draft and submit new change requests.",
    category: "changes" },
  { key: "changes.update",
    label: "Update change requests",
    description: "Edit change fields during draft / assess / authorize phases.",
    category: "changes" },
  { key: "changes.schedule",
    label: "Schedule changes",
    description: "Place an authorized change onto the change calendar.",
    category: "changes" },
  { key: "changes.implement",
    label: "Implement changes",
    description: "Move an authorized change into implementation and update task progress.",
    category: "changes" },
  { key: "changes.review",
    label: "Review changes",
    description: "Record post-implementation review outcomes and close review tasks.",
    category: "changes" },
  { key: "changes.close",
    label: "Close changes",
    description: "Formally close a change after PIR.",
    category: "changes", isDangerous: true },
  { key: "changes.cancel",
    label: "Cancel changes",
    description: "Cancel a change before implementation begins.",
    category: "changes", isDangerous: true },
  { key: "changes.approve",
    label: "Approve changes (CAB)",
    description: "Cast formal CAB / ECAB approval votes during the authorize phase.",
    category: "changes", isDangerous: true },
  { key: "changes.manage_conflicts",
    label: "Resolve change conflicts",
    description: "Detect and resolve schedule conflicts on the change calendar.",
    category: "changes" },
  { key: "changes.manage",
    label: "Full change administration",
    description: "Full CRUD authority over any change in any state. Implies all other change permissions.",
    category: "changes", isDangerous: true },

  // ── Tasks ──────────────────────────────────────────────────────────────────
  { key: "tasks.view",
    label: "View tasks",
    description: "Browse tasks attached to tickets, changes, and problems.",
    category: "tasks", isViewOnly: true },
  { key: "tasks.manage",
    label: "Manage tasks",
    description: "Create, assign, update, and complete tasks.",
    category: "tasks" },

  // ── Assets & Configuration ─────────────────────────────────────────────────
  { key: "cmdb.view",
    label: "View CMDB",
    description: "Browse configuration items and look up CIs while working tickets.",
    category: "assets", isViewOnly: true },
  { key: "cmdb.manage",
    label: "Manage CMDB",
    description: "Create, edit, retire, and relate configuration items.",
    category: "assets", isDangerous: true },
  { key: "assets.view",
    label: "View assets",
    description: "Browse hardware and asset inventory.",
    category: "assets", isViewOnly: true },
  { key: "assets.create",
    label: "Create assets",
    description: "Register new assets in the inventory.",
    category: "assets" },
  { key: "assets.update",
    label: "Update asset details",
    description: "Edit asset attributes (specs, tags, financial data).",
    category: "assets" },
  { key: "assets.manage_lifecycle",
    label: "Manage asset lifecycle",
    description: "Assign, deploy, place under maintenance, retire, and scrap assets.",
    category: "assets" },
  { key: "assets.manage_relationships",
    label: "Manage asset relationships",
    description: "Link assets to CIs, contracts, tickets, and other assets.",
    category: "assets" },
  { key: "assets.manage_inventory",
    label: "Manage inventory locations",
    description: "Create and edit warehouses / inventory locations.",
    category: "assets" },
  { key: "assets.manage",
    label: "Full asset administration",
    description: "Full CRUD on assets including bulk import and hard delete.",
    category: "assets", isDangerous: true },
  { key: "software.view",
    label: "View software & licenses",
    description: "Browse software licenses and SaaS subscriptions.",
    category: "assets", isViewOnly: true },
  { key: "software.create",
    label: "Register software licenses",
    description: "Register new licenses or SaaS subscriptions and assign seats.",
    category: "assets" },
  { key: "software.manage",
    label: "Manage software licenses",
    description: "Full CRUD over licenses including revoke, delete, and lifecycle.",
    category: "assets", isDangerous: true },
  { key: "services.view",
    label: "View services",
    description: "Browse service definitions in the service portfolio.",
    category: "assets", isViewOnly: true },
  { key: "services.manage",
    label: "Manage services",
    description: "Define, edit, and retire service offerings.",
    category: "assets", isDangerous: true },

  // ── Contacts ───────────────────────────────────────────────────────────────
  { key: "contacts.view",
    label: "View contacts",
    description: "Browse customers and organizations.",
    category: "contacts", isViewOnly: true },
  { key: "contacts.manage",
    label: "Manage contacts",
    description: "Create, edit, merge, and delete customers and organizations.",
    category: "contacts" },

  // ── Catalog ────────────────────────────────────────────────────────────────
  { key: "catalog.view",
    label: "View catalog",
    description: "Browse the service catalog.",
    category: "catalog", isViewOnly: true },
  { key: "catalog.manage",
    label: "Manage catalog",
    description: "Author and publish catalog items, categories, and forms.",
    category: "catalog", isDangerous: true },
  { key: "catalog.request",
    label: "Submit catalog requests",
    description: "Submit a new request through the service catalog (self or on behalf of a user).",
    category: "catalog" },

  // ── Approvals ──────────────────────────────────────────────────────────────
  { key: "approvals.view",
    label: "View approvals",
    description: "Browse approval queues and decision history.",
    category: "approvals", isViewOnly: true },
  { key: "approvals.respond",
    label: "Respond to approvals",
    description: "Approve or reject approval requests directed at the user.",
    category: "approvals" },

  // ── Workflows ──────────────────────────────────────────────────────────────
  { key: "workflows.view",
    label: "View workflows",
    description: "Read workflow definitions and execution history.",
    category: "workflows", isViewOnly: true },
  { key: "workflows.manage",
    label: "Manage workflows",
    description: "Create, edit, version, enable, and disable workflow definitions.",
    category: "workflows", isDangerous: true },

  // ── Automation Platform ────────────────────────────────────────────────────
  { key: "scenarios.run",
    label: "Run scenarios",
    description: "Manually invoke scenario automations on tickets.",
    category: "automations" },
  { key: "scenarios.manage",
    label: "Manage scenarios",
    description: "Create, edit, enable, disable, and delete scenario automations.",
    category: "automations", isDangerous: true },
  { key: "automations.view",
    label: "View automation rules",
    description: "Read automation rules, categories, and execution history.",
    category: "automations", isViewOnly: true },
  { key: "automations.manage",
    label: "Manage automation rules",
    description: "Create, edit, delete, reorder, enable, and disable automation rules.",
    category: "automations", isDangerous: true },
  { key: "automations.test",
    label: "Test automation rules",
    description: "Manually trigger an automation rule against a chosen entity for testing.",
    category: "automations" },
  { key: "webhooks.view",
    label: "View outbound webhooks",
    description: "Read outbound webhook configurations and delivery logs.",
    category: "automations", isViewOnly: true },
  { key: "webhooks.manage",
    label: "Manage outbound webhooks",
    description: "Create, edit, delete, enable, and disable outbound webhooks.",
    category: "automations", isDangerous: true },

  // ── Knowledge ──────────────────────────────────────────────────────────────
  { key: "kb.manage",
    label: "Manage knowledge base",
    description: "Author, publish, archive, and approve knowledge articles.",
    category: "knowledge", isDangerous: true },

  // ── Reports ────────────────────────────────────────────────────────────────
  { key: "reports.view",
    label: "View reports",
    description: "Browse standard reports and dashboards.",
    category: "reports", isViewOnly: true },
  { key: "reports.advanced_view",
    label: "View advanced reports",
    description: "Access drill-downs, breakdowns, and advanced analytics views.",
    category: "reports" },
  { key: "reports.manage",
    label: "Manage saved reports",
    description: "Create, edit, and delete saved or custom reports.",
    category: "reports", isDangerous: true },
  { key: "reports.share",
    label: "Share reports",
    description: "Share saved reports with other users or teams.",
    category: "reports" },
  { key: "reports.schedule",
    label: "Schedule report delivery",
    description: "Schedule recurring email delivery of saved reports.",
    category: "reports" },
  { key: "reports.export",
    label: "Export report data",
    description: "Download report results as CSV or XLSX.",
    category: "reports" },

  // ── Platform Administration ────────────────────────────────────────────────
  { key: "users.manage",
    label: "Manage users & roles",
    description: "Create, edit, deactivate users; change user roles; create and edit role definitions.",
    category: "administration", isDangerous: true, isCriticalForAdmin: true },
  { key: "teams.manage",
    label: "Manage teams",
    description: "Create, edit, and delete teams; manage team membership.",
    category: "administration", isDangerous: true },
  { key: "cab.manage",
    label: "Manage CAB groups",
    description: "Define Change Advisory Board groups, members, and approval rules.",
    category: "administration", isDangerous: true },
  { key: "integrations.manage",
    label: "Manage integrations",
    description: "Configure email channels, SSO, API keys, and third-party integrations.",
    category: "administration", isDangerous: true },
  { key: "audit.view",
    label: "View audit log",
    description: "Read the platform audit log of all logged events.",
    category: "administration", isViewOnly: true, isDangerous: true },
  { key: "ticket_types.manage",
    label: "Manage ticket types",
    description: "Define ticket type configurations, custom fields per type, and forms.",
    category: "administration", isDangerous: true },
];

/** Lookup table keyed by permission id. */
export const PERMISSION_INDEX: Map<Permission, PermissionMeta> = new Map(
  PERMISSION_CATALOG.map((p) => [p.key, p])
);

/** Returns catalog entries grouped by category, in display order. */
export function permissionsByCategory(): { category: PermissionCategory; permissions: PermissionMeta[] }[] {
  return PERMISSION_CATEGORIES.map((c) => ({
    category: c.id,
    permissions: PERMISSION_CATALOG.filter((p) => p.category === c.id),
  })).filter((g) => g.permissions.length > 0);
}
