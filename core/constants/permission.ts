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
 * │ macros.create                │   ✓   │     ✓      │   ✓   │          │
 * │ macros.manage                │   ✓   │     ✓      │       │          │
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
 * │ assets.create                │   ✓   │     ✓      │       │          │
 * │ assets.update                │   ✓   │     ✓      │       │          │
 * │ assets.manage_lifecycle      │   ✓   │     ✓      │   ✓   │          │
 * │ assets.manage_relationships  │   ✓   │     ✓      │       │          │
 * │ assets.manage_inventory      │   ✓   │     ✓      │       │          │
 * │ assets.manage                │   ✓   │     ✓      │       │          │
 * │ software.view                │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ software.create              │   ✓   │     ✓      │       │          │
 * │ software.manage              │   ✓   │     ✓      │       │          │
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
 * │ automations.view             │   ✓   │     ✓      │       │    ✓     │
 * │ automations.manage           │   ✓   │            │       │          │
 * │ automations.test             │   ✓   │     ✓      │       │          │
 * │ webhooks.view                │   ✓   │            │       │          │
 * │ webhooks.manage              │   ✓   │            │       │          │
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
  | "notes.manage_any"        // Delete or modify any note (not just your own)
  | "attachments.delete_any"  // Delete attachments uploaded by others
  | "macros.create"
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
  // Lifecycle permissions are scoped to the four transitions actually enforced
  // in routes today: view, create, update (during draft/assess), approve (CAB),
  // and a blanket `manage` for admins. Granular lifecycle gates that were never
  // wired (schedule / implement / review / close / cancel / manage_conflicts)
  // were removed in the permission audit — re-add them only when the matching
  // route enforcement and UI gating is implemented together.
  | "changes.view"             // Read any change, tasks, and history
  | "changes.create"           // Draft and submit new change requests
  | "changes.update"           // Edit fields during draft/assess/authorize
  | "changes.approve"          // CAB / ECAB formal approval authority
  | "changes.manage"           // Full CRUD override (admin/supervisor; implies all above)

  // ── Asset & Configuration Management ──────────────────────────────────────
  | "cmdb.view"
  | "cmdb.manage"
  | "assets.view"
  | "assets.create"
  | "assets.update"
  | "assets.manage_lifecycle"
  | "assets.manage_relationships"
  | "assets.manage_inventory"
  | "assets.manage"
  | "software.view"    // View software licenses and SaaS subscriptions
  | "software.create"  // Register new licenses / subscriptions; assign seats
  | "software.manage"  // Full CRUD including revoke, delete, lifecycle management

  // ── Contacts (Customers & Organizations) ──────────────────────────────────
  | "contacts.view"

  // ── Catalog & Workflow ─────────────────────────────────────────────────────
  | "catalog.view"
  | "catalog.manage"
  | "catalog.request"
  | "approvals.view"
  | "approvals.respond"
  | "workflows.view"
  | "scenarios.run"
  | "scenarios.manage"

  // ── Automation Platform ────────────────────────────────────────────────────
  | "automations.view"    // Read automation rules, categories, and execution history
  | "automations.manage"  // Create, edit, delete, reorder, enable/disable rules
  | "automations.test"    // Manually trigger a rule against a specific entity
  | "webhooks.view"       // View outbound webhook configs and delivery logs
  | "webhooks.manage"     // Create, edit, delete, enable/disable outbound webhooks

  // ── Platform Administration ────────────────────────────────────────────────
  | "users.manage"
  | "teams.manage"
  | "cab.manage"
  | "kb.manage"
  | "reports.view"
  | "reports.advanced_view"
  | "reports.manage"    // Create, edit, delete saved/custom reports
  | "reports.share"     // Share reports with other users or teams
  | "reports.schedule"  // Schedule report delivery via email
  | "reports.export"    // Export report data as CSV / XLSX
  | "ticket_types.manage"
  | "settings.view";    // Access the /settings/* pages (sidebar gear icon)

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
  "notes.manage_any",
  "attachments.delete_any",
  "macros.create",
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
  // Change Management — admin has the blanket override
  "changes.view",
  "changes.create",
  "changes.update",
  "changes.approve",
  "changes.manage",
  // Asset & Configuration Management
  "cmdb.view",
  "cmdb.manage",
  "assets.view",
  "assets.create",
  "assets.update",
  "assets.manage_lifecycle",
  "assets.manage_relationships",
  "assets.manage_inventory",
  "assets.manage",
  "software.view",
  "software.create",
  "software.manage",
  // Contacts
  "contacts.view",
  // Catalog & Workflow
  "catalog.view",
  "catalog.manage",
  "catalog.request",
  "approvals.view",
  "approvals.respond",
  "workflows.view",
  "scenarios.run",
  "scenarios.manage",
  // Automation Platform
  "automations.view",
  "automations.manage",
  "automations.test",
  "webhooks.view",
  "webhooks.manage",
  // Platform Administration
  "users.manage",
  "teams.manage",
  "cab.manage",
  "kb.manage",
  "reports.view",
  "reports.advanced_view",
  "reports.manage",
  "reports.share",
  "reports.schedule",
  "reports.export",
  "ticket_types.manage",
  "settings.view",
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
  "notes.manage_any",
  "attachments.delete_any",
  "macros.create",
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
  // Change Management — supervisor has CAB approval + blanket manage
  "changes.view",
  "changes.create",
  "changes.update",
  "changes.approve",
  "changes.manage",
  // Asset & Configuration Management
  "cmdb.view",
  "cmdb.manage",
  "assets.view",
  "assets.create",
  "assets.update",
  "assets.manage_lifecycle",
  "assets.manage_relationships",
  "assets.manage_inventory",
  "assets.manage",
  "software.view",
  "software.create",
  "software.manage",
  // Contacts
  "contacts.view",
  // Catalog & Workflow
  "catalog.view",
  "catalog.manage",
  "catalog.request",
  "approvals.view",
  "approvals.respond",
  "workflows.view",
  "scenarios.run",
  "scenarios.manage",
  // Automation Platform — supervisor can view and test but not manage
  "automations.view",
  "automations.test",
  // Platform Administration
  "kb.manage",
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
  "macros.create",
  "templates.view",
  "templates.create",
  // ITSM Modules
  "incidents.view",
  "incidents.manage",
  "requests.view",
  "requests.manage",
  "problems.view",
  // Change Management — agents can draft and edit but not approve
  "changes.view",
  "changes.create",
  "changes.update",
  // Asset & Configuration Management
  "cmdb.view",
  "assets.view",
  "assets.manage_lifecycle",
  "software.view",
  // Contacts
  "contacts.view",
  // Catalog & Workflow
  "catalog.view",
  "catalog.request",
  "approvals.view",
  "approvals.respond",
  "scenarios.run",
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
  "templates.view",
  // ITSM Modules
  "incidents.view",
  "requests.view",
  "problems.view",
  "changes.view",
  // Asset & Configuration Management
  "cmdb.view",
  "assets.view",
  "software.view",
  // Contacts
  "contacts.view",
  // Catalog & Workflow
  "catalog.view",
  "approvals.view",
  "workflows.view",
  // Automation Platform — readonly can see rules but not manage or test
  "automations.view",
  // Platform Administration
  "reports.view",
];

// ── Built-in role defaults ────────────────────────────────────────────────────
//
// These are the *seeds* for the four built-in roles. At runtime the server
// loads role definitions from the `role` DB table — so admins can rename
// roles, change their permission sets, or add new custom roles via the
// settings UI. The `ROLE_PERMISSIONS` map below is a mutable in-memory
// cache populated from the DB on boot and refreshed whenever the role
// editor saves.
//
// If the runtime cache is empty (e.g. during server start before the first
// load completes, or in unit tests that don't touch the DB) `can()` falls
// back to the built-in defaults so middleware never silently denies access.

export const BUILTIN_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin:      ADMIN_PERMISSIONS,
  supervisor: SUPERVISOR_PERMISSIONS,
  agent:      AGENT_PERMISSIONS,
  readonly:   READONLY_PERMISSIONS,
  customer:   [],
};

// ── Mutable role → permission set map ─────────────────────────────────────────

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

// ── Reactive change notifications ─────────────────────────────────────────────
//
// `setRolePermissions` mutates the map in place. Without a notification
// channel, React components that compute visibility via `can()` have no way
// to know the underlying data changed — they'll render once with the seed
// permissions and stay frozen even after `/api/me` syncs the real list.
//
// We expose a tiny pub/sub: every `setRolePermissions` call bumps `_version`
// and notifies subscribers. The client uses `useSyncExternalStore` over
// these two functions to make `can()` reactive in component trees.
// Server-side, no one subscribes, so the cost is a no-op `forEach`.

let _version = 0;
const _listeners = new Set<() => void>();

export function subscribeRolePermissions(listener: () => void): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

export function getRolePermissionsVersion(): number {
  return _version;
}

/**
 * Replace the runtime role cache with a fresh map.
 * Called by `server/src/lib/role-cache.ts` after loading from the DB and
 * after any admin save in the role editor.
 *
 * Custom roles (not in the built-in list) are added; built-in roles have
 * their permission sets replaced. Roles that disappear from the DB are
 * removed from the cache.
 */
export function setRolePermissions(roles: Record<string, Permission[]>): void {
  for (const key of Object.keys(ROLE_PERMISSIONS)) {
    if (!(key in roles) && !(key in BUILTIN_ROLE_PERMISSIONS)) {
      delete ROLE_PERMISSIONS[key];
    }
  }
  for (const [key, perms] of Object.entries(roles)) {
    ROLE_PERMISSIONS[key] = new Set(perms);
  }
  // Notify React subscribers (sidebar, useCan, PermissionRoute) so they
  // re-render with the new permission set instead of staying frozen on
  // whatever the BUILTIN_ROLE_PERMISSIONS seeded.
  _version++;
  for (const listener of _listeners) listener();
}

// ── Helper ────────────────────────────────────────────────────────────────────

/** Returns true if the given role has the specified permission. */
export function can(role: string, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/** All permission keys this role grants, in catalog order. */
export function permissionsFor(role: string): Permission[] {
  const set = ROLE_PERMISSIONS[role];
  return set ? Array.from(set) : [];
}
