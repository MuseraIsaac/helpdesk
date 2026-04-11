/**
 * Permission system for the helpdesk.
 *
 * Permission matrix:
 * ┌──────────────────────┬───────┬────────────┬───────┬──────────┐
 * │ Permission           │ admin │ supervisor │ agent │ readonly │
 * ├──────────────────────┼───────┼────────────┼───────┼──────────┤
 * │ tickets.view         │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ tickets.create       │   ✓   │     ✓      │   ✓   │          │
 * │ tickets.update       │   ✓   │     ✓      │   ✓   │          │
 * │ notes.view           │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ notes.create         │   ✓   │     ✓      │   ✓   │          │
 * │ notes.manage_any     │   ✓   │     ✓      │       │          │
 * │ attachments.delete_any│  ✓   │     ✓      │       │          │
 * │ replies.create       │   ✓   │     ✓      │   ✓   │          │
 * │ macros.view          │   ✓   │     ✓      │   ✓   │    ✓     │
 * │ macros.manage        │   ✓   │            │       │          │
 * │ users.manage         │   ✓   │            │       │          │
 * │ teams.manage         │   ✓   │            │       │          │
 * │ kb.manage            │   ✓   │     ✓      │       │          │
 * │ reports.view         │   ✓   │     ✓      │   ✓   │    ✓     │
 * └──────────────────────┴───────┴────────────┴───────┴──────────┘
 */

export type Permission =
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
  | "users.manage"
  | "teams.manage"
  | "kb.manage"
  | "reports.view";

const ADMIN_PERMISSIONS: Permission[] = [
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
  "users.manage",
  "teams.manage",
  "kb.manage",
  "reports.view",
];

const SUPERVISOR_PERMISSIONS: Permission[] = [
  "tickets.view",
  "tickets.create",
  "tickets.update",
  "notes.view",
  "notes.create",
  "notes.manage_any",
  "attachments.delete_any",
  "replies.create",
  "macros.view",
  "kb.manage",
  "reports.view",
];

const AGENT_PERMISSIONS: Permission[] = [
  "tickets.view",
  "tickets.create",
  "tickets.update",
  "notes.view",
  "notes.create",
  "replies.create",
  "macros.view",
  "reports.view",
];

const READONLY_PERMISSIONS: Permission[] = [
  "tickets.view",
  "notes.view",
  "macros.view",
  "reports.view",
];

export const ROLE_PERMISSIONS: Record<string, Set<Permission>> = {
  admin: new Set(ADMIN_PERMISSIONS),
  supervisor: new Set(SUPERVISOR_PERMISSIONS),
  agent: new Set(AGENT_PERMISSIONS),
  readonly: new Set(READONLY_PERMISSIONS),
  customer: new Set<Permission>(),
};

/** Returns true if the given role has the specified permission. */
export function can(role: string, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}
