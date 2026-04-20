/**
 * Enterprise ITSM Platform — Permission System
 *
 * Permissions are grouped by domain. Each group uses a consistent
 * `<domain>.<action>` naming convention.
 *
 * Conventions
 * ───────────
 *  *.view        Read-only access to a resource or module.
 *  *.create      Ability to submit new records in a module.
 *  *.manage      Full CRUD within a module (includes view).
 *  *.manage_any  Manage records owned by other users (elevated).
 *  *.approve     Formal approval authority (CAB, change boards, etc.).
 *  *.respond     Respond to requests directed at the user (approvals, etc.).
 *  *.request     Submit self-service requests from a catalog or form.
 *  *.delete_any  Hard-delete records owned by other users.
 *  *.advanced_*  Access to elevated features within an otherwise shared area.
 *
 * Adding a new permission
 * ───────────────────────
 *  1. Add the string literal to the `Permission` union below.
 *  2. Add it to every role array that should have access.
 *  3. Update the matrix table above the union.
 *  4. If it gates a nav item, add `permission: "new.perm"` in nav-config.ts.
 *  5. Use `requirePermission("new.perm")` in the relevant Express route.
 *
 * Customer role
 * ─────────────
 *  Customers authenticate via the portal and are blocked at the `requireAuth`
 *  middleware layer (which rejects role === "customer" on all agent routes).
 *  Portal routes use `requireCustomer` instead. For this reason, customers
 *  have an empty permission set here and are not listed in the matrix.
 *
 * ┌──────────────────────────────┬───────┬────────────┬───────┬──────────┐
 * │ Permission                   │ admin │ supervisor │ agent │ readonly │
 * ├──────────────────────────────┼───────┼────────────┼───────┼──────────┤
 * │ ── Dashboards ─────────────────────────────────────────────────────── │
 * │ dashboard.manage_own         │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ dashboard.manage_shared      │   ✓   │     ✓      │       │          │
 * │ dashboard.share_to_team      │   ✓   │     ✓      │   ✓   │          │
 * │ ── Service Desk ───────────────────────────────────────────────────── │
 * │ tickets.view                 │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ tickets.create               │   ✓   │     ✓      │   ✓   │          │
 * │ tickets.update               │   ✓   │     ✓      │   ✓   │          │
 * │ notes.view                   │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ notes.create                 │   ✓   │     ✓      │   ✓   │          │
 * │ notes.manage_any             │   ✓   │     ✓      │       │          │
 * │ attachments.delete_any       │   ✓   │     ✓      │       │          │
 * │ replies.create               │   ✓   │     ✓      │   ✓   │          │
 * │ macros.view                  │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ macros.manage                │   ✓   │            │       │          │
 * │ templates.view               │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ templates.create             │   ✓   │     ✓      │   ✓   │          │
 * │ templates.manage             │   ✓   │            │       │          │
 * │ ── ITSM Modules ───────────────────────────────────────────────────── │
 * │ incidents.view               │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ incidents.manage             │   ✓   │     ✓      │   ✓   │          │
 * │ requests.view                │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ requests.manage              │   ✓   │     ✓      │   ✓   │          │
 * │ problems.view                │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ problems.manage              │   ✓   │     ✓      │       │          │
 * │ ── Change Management ──────────────────────────────────────────────── │
 * │ changes.view                 │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ changes.create               │   ✓   │     ✓      │   ✓   │          │
 * │ changes.update               │   ✓   │     ✓      │   ✓   │          │
 * │ changes.schedule             │   ✓   │     ✓      │       │          │
 * │ changes.implement            │   ✓   │     ✓      │   ✓   │          │
 * │ changes.review               │   ✓   │     ✓      │   ✓   │          │
 * │ changes.close                │   ✓   │     ✓      │       │          │
 * │ changes.cancel               │   ✓   │     ✓      │       │          │
 * │ changes.approve              │   ✓   │     ✓      │       │          │
 * │ changes.manage_conflicts     │   ✓   │     ✓      │       │          │
 * │ changes.manage               │   ✓   │     ✓      │       │          │
 * │ tasks.view                   │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ tasks.manage                 │   ✓   │     ✓      │   ✓   │          │
 * │ ── Asset & Configuration ──────────────────────────────────────────── │
 * │ cmdb.view                    │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ cmdb.manage                  │   ✓   │     ✓      │       │          │
 * │ assets.view                  │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ assets.manage                │   ✓   │     ✓      │       │          │
 * │ services.view                │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ services.manage              │   ✓   │     ✓      │       │          │
 * │ ── Catalog & Workflow ─────────────────────────────────────────────── │
 * │ catalog.view                 │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ catalog.manage               │   ✓   │     ✓      │       │          │
 * │ catalog.request              │   ✓   │     ✓      │   ✓   │          │
 * │ approvals.view               │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ approvals.respond            │   ✓   │     ✓      │   ✓   │          │
 * │ workflows.view               │   ✓   │     ✓      │       │          │
 * │ workflows.manage             │   ✓   │            │       │          │
 * │ scenarios.run                │   ✓   │     ✓      │   ✓   │          │
 * │ scenarios.manage             │   ✓   │     ✓      │       │          │
 * │ ── Platform Administration ────────────────────────────────────────── │
 * │ users.manage                 │   ✓   │            │       │          │
 * │ teams.manage                 │   ✓   │            │       │          │
 * │ cab.manage                   │   ✓   │            │       │          │
 * │ kb.manage                    │   ✓   │     ✓      │       │          │
 * │ integrations.manage          │   ✓   │            │       │          │
 * │ audit.view                   │   ✓   │     ✓      │       │    ✓     │
 * │ reports.view                 │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ reports.advanced_view        │   ✓   │     ✓      │       │          │
 * │ reports.manage               │   ✓   │     ✓      │       │          │
 * │ reports.share                │   ✓   │     ✓      │       │          │
 * │ reports.schedule             │   ✓   │     ✓      │       │          │
 * │ reports.export               │   ✓   │     ✓      │   ✓   │          │
 * └──────────────────────────────┴───────┴────────────┴───────┴──────────┘
 *
 * Change Management permission semantics
 * ───────────────────────────────────────
 *  changes.view              — Read any change record, history, and tasks.
 *  changes.create            — Draft and submit new change requests.
 *  changes.update            — Edit fields on a change (draft/assess/authorize phases).
 *  changes.schedule          — Move an authorized change onto the change calendar.
 *  changes.implement         — Mark a change as in implementation; update task progress.
 *  changes.review            — Record PIR outcomes and close review tasks.
 *  changes.close             — Formally close a change after review.
 *  changes.cancel            — Cancel a change (any state before implement).
 *  changes.approve           — CAB / ECAB approval authority (authorize phase).
 *  changes.manage_conflicts  — Detect and resolve schedule conflicts on the change calendar.
 *  changes.manage            — Full CRUD authority over any change (admin/supervisor override).
 */

// ── Permission union ───────────────────────────────────────────────────────────

export type Permission =
  // ── Dashboards ────────────────────────────────────────────────────────────
  | "dashboard.manage_own"    // Create, edit, delete personal dashboards; set own default
  | "dashboard.manage_shared" // Publish org-wide shared dashboards (admin / supervisor)
  | "dashboard.share_to_team" // Share a dashboard to a team the user belongs to

  // ── Service Desk ──────────────────────────────────────────────────────────
  | "tickets.view"
  | "tickets.create"
  | "tickets.update"
  | "notes.view"
  | "notes.create"
  | "notes.manage_any"
  | "attachments.delete_any"
  | "replies.create"
  | "macros.view"
  | "macros.manage"
  | "templates.view"
  | "templates.create"
  | "templates.manage"

  // ── ITSM Modules ──────────────────────────────────────────────────────────
  | "incidents.view"
  | "incidents.manage"
  | "requests.view"
  | "requests.manage"
  | "problems.view"
  | "problems.manage"

  // ── Change Management ─────────────────────────────────────────────────────
  // Granular lifecycle permissions allow routes and middleware to enforce
  // phase-appropriate access without a blanket manage gate.
  | "changes.view"             // Read any change, tasks, and history
  | "changes.create"           // Draft and submit new change requests
  | "changes.update"           // Edit fields during draft/assess/authorize
  | "changes.schedule"         // Place an authorized change on the change calendar
  | "changes.implement"        // Advance to implementation; update task progress
  | "changes.review"           // Record PIR outcomes; close review tasks
  | "changes.close"            // Formally close after review
  | "changes.cancel"           // Cancel before implementation begins
  | "changes.approve"          // CAB / ECAB formal approval authority
  | "changes.manage_conflicts" // Detect and resolve change-calendar conflicts
  | "changes.manage"           // Full CRUD override (admin/supervisor; implies all above)

  | "tasks.view"
  | "tasks.manage"

  // ── Asset & Configuration Management ──────────────────────────────────────
  | "cmdb.view"
  | "cmdb.manage"
  | "assets.view"
  | "assets.manage"
  | "services.view"
  | "services.manage"

  // ── Contacts (Customers & Organizations) ──────────────────────────────────
  | "contacts.view"
  | "contacts.manage"

  // ── Catalog & Workflow ─────────────────────────────────────────────────────
  | "catalog.view"
  | "catalog.manage"
  | "catalog.request"
  | "approvals.view"
  | "approvals.respond"
  | "workflows.view"
  | "workflows.manage"
  | "scenarios.run"
  | "scenarios.manage"

  // ── Platform Administration ────────────────────────────────────────────────
  | "users.manage"
  | "teams.manage"
  | "cab.manage"
  | "kb.manage"
  | "integrations.manage"
  | "audit.view"
  | "reports.view"
  | "reports.advanced_view"
  | "reports.manage"    // Create, edit, delete saved/custom reports
  | "reports.share"     // Share reports with other users or teams
  | "reports.schedule"  // Schedule report delivery via email
  | "reports.export"    // Export report data as CSV / XLSX
  | "ticket_types.manage";

// ── Role permission arrays ─────────────────────────────────────────────────────
//
// Keep each array in the same domain order as the union above.
// When a new permission is added, decide which roles should have it here.

const ADMIN_PERMISSIONS: Permission[] = [
  // Dashboards
  "dashboard.manage_own",
  "dashboard.manage_shared",
  "dashboard.share_to_team",
  // Service Desk
  "tickets.view",
  "tickets.create",
  "tickets.update",
  "notes.view",
  "notes.create",
  "notes.manage_any",
  "attachments.delete_any",
  "replies.create",
  "macros.view",
  "macros.manage",
  "templates.view",
  "templates.create",
  "templates.manage",
  // ITSM Modules
  "incidents.view",
  "incidents.manage",
  "requests.view",
  "requests.manage",
  "problems.view",
  "problems.manage",
  // Change Management — full lifecycle authority for admin
  "changes.view",
  "changes.create",
  "changes.update",
  "changes.schedule",
  "changes.implement",
  "changes.review",
  "changes.close",
  "changes.cancel",
  "changes.approve",
  "changes.manage_conflicts",
  "changes.manage",
  "tasks.view",
  "tasks.manage",
  // Asset & Configuration Management
  "cmdb.view",
  "cmdb.manage",
  "assets.view",
  "assets.manage",
  "services.view",
  "services.manage",
  // Contacts
  "contacts.view",
  "contacts.manage",
  // Catalog & Workflow
  "catalog.view",
  "catalog.manage",
  "catalog.request",
  "approvals.view",
  "approvals.respond",
  "workflows.view",
  "workflows.manage",
  "scenarios.run",
  "scenarios.manage",
  // Platform Administration
  "users.manage",
  "teams.manage",
  "cab.manage",
  "kb.manage",
  "integrations.manage",
  "audit.view",
  "reports.view",
  "reports.advanced_view",
  "reports.manage",
  "reports.share",
  "reports.schedule",
  "reports.export",
  "ticket_types.manage",
];

/**
 * Supervisor — team lead / ITSM process owner.
 * Full ITSM module access including CAB approval authority and CMDB management.
 * Cannot manage platform-level configuration (integrations, user accounts, workflows).
 */
const SUPERVISOR_PERMISSIONS: Permission[] = [
  // Dashboards
  "dashboard.manage_own",
  "dashboard.manage_shared",
  "dashboard.share_to_team",
  // Service Desk
  "tickets.view",
  "tickets.create",
  "tickets.update",
  "notes.view",
  "notes.create",
  "notes.manage_any",
  "attachments.delete_any",
  "replies.create",
  "macros.view",
  "templates.view",
  "templates.create",
  "templates.manage",
  // ITSM Modules
  "incidents.view",
  "incidents.manage",
  "requests.view",
  "requests.manage",
  "problems.view",
  "problems.manage",
  // Change Management — supervisor has full lifecycle + CAB approval authority
  "changes.view",
  "changes.create",
  "changes.update",
  "changes.schedule",         // Supervisor governs the change calendar
  "changes.implement",
  "changes.review",
  "changes.close",
  "changes.cancel",
  "changes.approve",          // CAB / change approval authority
  "changes.manage_conflicts", // Conflict detection across the change calendar
  "changes.manage",
  "tasks.view",
  "tasks.manage",
  // Asset & Configuration Management
  "cmdb.view",
  "cmdb.manage",       // Configuration item ownership
  "assets.view",
  "assets.manage",
  "services.view",
  "services.manage",   // Service catalog curation
  // Contacts
  "contacts.view",
  "contacts.manage",
  // Catalog & Workflow
  "catalog.view",
  "catalog.manage",
  "catalog.request",
  "approvals.view",
  "approvals.respond",
  "workflows.view",    // Read-only workflow visibility; cannot edit definitions
  "scenarios.run",
  "scenarios.manage",
  // Platform Administration
  "kb.manage",
  "audit.view",
  "reports.view",
  "reports.advanced_view",
  "reports.manage",
  "reports.share",
  "reports.schedule",
  "reports.export",
];

/**
 * Agent — frontline ITSM operator.
 * Can work incidents, service requests, and tasks.
 *
 * Change Management for agents:
 *  - Can draft and submit change requests (changes.create / changes.update).
 *  - Can participate in implementation (changes.implement) and PIR (changes.review)
 *    when assigned as the implementor or reviewer.
 *  - Cannot schedule, close, cancel, approve, or manage conflicts — those
 *    actions require a supervisor or above to preserve governance integrity.
 */
const AGENT_PERMISSIONS: Permission[] = [
  // Dashboards
  "dashboard.manage_own",
  "dashboard.share_to_team",
  // Service Desk
  "tickets.view",
  "tickets.create",
  "tickets.update",
  "notes.view",
  "notes.create",
  "replies.create",
  "macros.view",
  "templates.view",
  "templates.create",
  // ITSM Modules
  "incidents.view",
  "incidents.manage",  // Agents work and resolve incidents
  "requests.view",
  "requests.manage",   // Agents fulfill service requests
  "problems.view",     // Reference only — problem management is supervisor+
  // Change Management — agents can create/implement but not approve/govern
  "changes.view",
  "changes.create",    // Draft and submit change requests on behalf of teams
  "changes.update",    // Edit own drafts during authoring phase
  "changes.implement", // Update implementation progress when assigned as implementor
  "changes.review",    // Participate in post-implementation review when assigned
  "tasks.view",
  "tasks.manage",      // Agents own and complete tasks
  // Asset & Configuration Management
  "cmdb.view",         // Look up CIs when working incidents/requests
  "assets.view",       // Look up assets when working tickets
  "services.view",     // Browse service definitions
  // Contacts
  "contacts.view",
  "contacts.manage",   // Agents can create and update customer records
  // Catalog & Workflow
  "catalog.view",
  "catalog.request",   // Submit requests on behalf of users
  "approvals.view",
  "approvals.respond", // Respond to approvals directed at the agent
  "scenarios.run",     // Invoke scenarios on tickets
  // Platform Administration
  "reports.view",
  "reports.export",
];

/**
 * Readonly — auditor / observer role.
 * Full read access across all modules including audit log.
 * Cannot create, update, manage, approve, or respond to anything.
 */
const READONLY_PERMISSIONS: Permission[] = [
  // Dashboards — readonly users can personalise their own view
  "dashboard.manage_own",
  // Service Desk
  "tickets.view",
  "notes.view",
  "macros.view",
  "templates.view",
  // ITSM Modules
  "incidents.view",
  "requests.view",
  "problems.view",
  "changes.view",
  "tasks.view",
  // Asset & Configuration Management
  "cmdb.view",
  "assets.view",
  "services.view",
  // Contacts
  "contacts.view",
  // Catalog & Workflow
  "catalog.view",
  "approvals.view",
  "workflows.view",
  // Platform Administration
  "audit.view",
  "reports.view",
];

// ── Role → permission set map ─────────────────────────────────────────────────

export const ROLE_PERMISSIONS: Record<string, Set<Permission>> = {
  admin:      new Set(ADMIN_PERMISSIONS),
  supervisor: new Set(SUPERVISOR_PERMISSIONS),
  agent:      new Set(AGENT_PERMISSIONS),
  readonly:   new Set(READONLY_PERMISSIONS),
  /**
   * Customer accounts are blocked at the requireAuth middleware and never
   * reach agent-shell routes. The portal uses requireCustomer instead.
   * The empty set is kept to make ROLE_PERMISSIONS a complete record.
   */
  customer:   new Set<Permission>(),
};

// ── Helper ────────────────────────────────────────────────────────────────────

/** Returns true if the given role has the specified permission. */
export function can(role: string, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}
