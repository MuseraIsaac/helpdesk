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
 * ┌────────────────────────────┬───────┬────────────┬───────┬──────────┐
 * │ Permission                 │ admin │ supervisor │ agent │ readonly │
 * ├────────────────────────────┼───────┼────────────┼───────┼──────────┤
 * │ ── Service Desk ─────────────────────────────────────────────────── │
 * │ tickets.view               │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ tickets.create             │   ✓   │     ✓      │   ✓   │          │
 * │ tickets.update             │   ✓   │     ✓      │   ✓   │          │
 * │ notes.view                 │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ notes.create               │   ✓   │     ✓      │   ✓   │          │
 * │ notes.manage_any           │   ✓   │     ✓      │       │          │
 * │ attachments.delete_any     │   ✓   │     ✓      │       │          │
 * │ replies.create             │   ✓   │     ✓      │   ✓   │          │
 * │ macros.view                │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ macros.manage              │   ✓   │            │       │          │
 * │ ── ITSM Modules ─────────────────────────────────────────────────── │
 * │ incidents.view             │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ incidents.manage           │   ✓   │     ✓      │   ✓   │          │
 * │ requests.view              │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ requests.manage            │   ✓   │     ✓      │   ✓   │          │
 * │ problems.view              │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ problems.manage            │   ✓   │     ✓      │       │          │
 * │ changes.view               │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ changes.manage             │   ✓   │     ✓      │       │          │
 * │ changes.approve            │   ✓   │     ✓      │       │          │
 * │ tasks.view                 │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ tasks.manage               │   ✓   │     ✓      │   ✓   │          │
 * │ ── Asset & Configuration ────────────────────────────────────────── │
 * │ cmdb.view                  │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ cmdb.manage                │   ✓   │     ✓      │       │          │
 * │ assets.view                │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ assets.manage              │   ✓   │     ✓      │       │          │
 * │ services.view              │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ services.manage            │   ✓   │     ✓      │       │          │
 * │ ── Catalog & Workflow ───────────────────────────────────────────── │
 * │ catalog.view               │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ catalog.manage             │   ✓   │     ✓      │       │          │
 * │ catalog.request            │   ✓   │     ✓      │   ✓   │          │
 * │ approvals.view             │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ approvals.respond          │   ✓   │     ✓      │   ✓   │          │
 * │ workflows.view             │   ✓   │     ✓      │       │          │
 * │ workflows.manage           │   ✓   │            │       │          │
 * │ ── Platform Administration ──────────────────────────────────────── │
 * │ users.manage               │   ✓   │            │       │          │
 * │ teams.manage               │   ✓   │            │       │          │
 * │ kb.manage                  │   ✓   │     ✓      │       │          │
 * │ integrations.manage        │   ✓   │            │       │          │
 * │ audit.view                 │   ✓   │     ✓      │       │    ✓     │
 * │ reports.view               │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ reports.advanced_view      │   ✓   │     ✓      │       │          │
 * └────────────────────────────┴───────┴────────────┴───────┴──────────┘
 */

// ── Permission union ───────────────────────────────────────────────────────────

export type Permission =
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

  // ── ITSM Modules ──────────────────────────────────────────────────────────
  | "incidents.view"
  | "incidents.manage"
  | "requests.view"
  | "requests.manage"
  | "problems.view"
  | "problems.manage"
  | "changes.view"
  | "changes.manage"
  | "changes.approve"
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

  // ── Platform Administration ────────────────────────────────────────────────
  | "users.manage"
  | "teams.manage"
  | "kb.manage"
  | "integrations.manage"
  | "audit.view"
  | "reports.view"
  | "reports.advanced_view";

// ── Role permission arrays ─────────────────────────────────────────────────────
//
// Keep each array in the same domain order as the union above.
// When a new permission is added, decide which roles should have it here.

const ADMIN_PERMISSIONS: Permission[] = [
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
  // ITSM Modules
  "incidents.view",
  "incidents.manage",
  "requests.view",
  "requests.manage",
  "problems.view",
  "problems.manage",
  "changes.view",
  "changes.manage",
  "changes.approve",
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
  // Platform Administration
  "users.manage",
  "teams.manage",
  "kb.manage",
  "integrations.manage",
  "audit.view",
  "reports.view",
  "reports.advanced_view",
];

/**
 * Supervisor — team lead / ITSM process owner.
 * Full ITSM module access including CAB approval authority and CMDB management.
 * Cannot manage platform-level configuration (integrations, user accounts, workflows).
 */
const SUPERVISOR_PERMISSIONS: Permission[] = [
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
  // ITSM Modules
  "incidents.view",
  "incidents.manage",
  "requests.view",
  "requests.manage",
  "problems.view",
  "problems.manage",
  "changes.view",
  "changes.manage",
  "changes.approve",   // CAB / change approval authority
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
  // Platform Administration
  "kb.manage",
  "audit.view",        // Compliance and audit access
  "reports.view",
  "reports.advanced_view",
];

/**
 * Agent — frontline ITSM operator.
 * Can work incidents, service requests, and tasks. View-only access to
 * problems, changes, CMDB, and assets (reference data; agents don't own these).
 * Can respond to approvals directed at them and request from the catalog.
 */
const AGENT_PERMISSIONS: Permission[] = [
  // Service Desk
  "tickets.view",
  "tickets.create",
  "tickets.update",
  "notes.view",
  "notes.create",
  "replies.create",
  "macros.view",
  // ITSM Modules
  "incidents.view",
  "incidents.manage",  // Agents work and resolve incidents
  "requests.view",
  "requests.manage",   // Agents fulfill service requests
  "problems.view",     // Reference only — problem management is supervisor+
  "changes.view",      // Reference only — change approval is supervisor+
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
  // Platform Administration
  "reports.view",
];

/**
 * Readonly — auditor / observer role.
 * Full read access across all modules including audit log.
 * Cannot create, update, manage, approve, or respond to anything.
 */
const READONLY_PERMISSIONS: Permission[] = [
  // Service Desk
  "tickets.view",
  "notes.view",
  "macros.view",
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
