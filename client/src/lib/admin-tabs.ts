/**
 * Administration Hub — tab definitions
 *
 * Single source of truth for the items rendered inside the Administration
 * hub page (`/admin`). Each tab maps 1:1 to a route already declared in
 * App.tsx; the hub layout renders these as a horizontal tab bar and the
 * overview page renders them as cards grouped by `group`.
 */

import {
  Tag,
  CircleDot,
  Settings2,
  ShieldCheck,
  Zap,
  Users,
  UserCog,
  KeyRound,
  Wrench,
  ScrollText,
  Package,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type AdminTabGroup =
  | "Configuration"
  | "Workflow"
  | "People & Access"
  | "System";

export interface AdminTab {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  group: AdminTabGroup;
  description: string;
}

export const ADMIN_TABS: AdminTab[] = [
  // ── Configuration ─────────────────────────────────────────────────────────
  {
    id: "ticket-types",
    label: "Ticket Types",
    to: "/admin/ticket-types",
    icon: Tag,
    group: "Configuration",
    description: "Define the ticket categories agents can pick from.",
  },
  {
    id: "ticket-statuses",
    label: "Ticket Statuses",
    to: "/admin/ticket-statuses",
    icon: CircleDot,
    group: "Configuration",
    description: "Customize the lifecycle states tickets move through.",
  },
  {
    id: "form-builder",
    label: "Form Builder",
    to: "/admin/forms",
    icon: Settings2,
    group: "Configuration",
    description: "Design the request and incident intake forms.",
  },

  // ── Workflow ──────────────────────────────────────────────────────────────
  {
    id: "cab-groups",
    label: "CAB Groups",
    to: "/admin/cab-groups",
    icon: ShieldCheck,
    group: "Workflow",
    description: "Configure change advisory boards and approver pools.",
  },
  {
    id: "automations",
    label: "Automations",
    to: "/automations",
    icon: Zap,
    group: "Workflow",
    description: "Rules, routing and outbound webhooks.",
  },
  {
    id: "macros",
    label: "Macros",
    to: "/macros",
    icon: Wrench,
    group: "Workflow",
    description: "Reusable agent shortcuts for common replies and actions.",
  },

  // ── People & Access ───────────────────────────────────────────────────────
  {
    id: "teams",
    label: "Teams",
    to: "/teams",
    icon: Users,
    group: "People & Access",
    description: "Organize agents into teams and assign queues.",
  },
  {
    id: "users",
    label: "Users",
    to: "/users",
    icon: UserCog,
    group: "People & Access",
    description: "Invite, deactivate and manage agent accounts.",
  },
  {
    id: "roles",
    label: "Roles & Permissions",
    to: "/admin/roles",
    icon: KeyRound,
    group: "People & Access",
    description: "Fine-tune who can see and do what.",
  },

  // ── System ────────────────────────────────────────────────────────────────
  {
    id: "audit-log",
    label: "Audit Log",
    to: "/admin/audit-log",
    icon: ScrollText,
    group: "System",
    description: "Review every privileged action taken in the platform.",
  },
  {
    id: "updates",
    label: "Updates",
    to: "/admin/updates",
    icon: Package,
    group: "System",
    description: "Track platform releases and rolling changes.",
  },
];

export const ADMIN_TAB_GROUPS: AdminTabGroup[] = [
  "Configuration",
  "Workflow",
  "People & Access",
  "System",
];

/**
 * Returns the tab whose `to` is the longest prefix of `pathname`.
 * Used by the hub layout to highlight the active tab even on sub-routes
 * like `/automations/rules/new`.
 */
export function findActiveAdminTab(pathname: string): AdminTab | undefined {
  let best: AdminTab | undefined;
  for (const tab of ADMIN_TABS) {
    if (pathname === tab.to || pathname.startsWith(tab.to + "/")) {
      if (!best || tab.to.length > best.to.length) best = tab;
    }
  }
  return best;
}
