/**
 * Enterprise ITSM Platform — Navigation Configuration
 *
 * Single source of truth for the left sidebar navigation.
 * Every section and item declares its own visibility rules so Layout.tsx
 * can render a permission-correct sidebar without scattered inline checks.
 *
 * Adding a new module:
 *   1. Add a NavSection (or a new NavItem in an existing section) below.
 *   2. Add the matching route in App.tsx.
 *   3. If the module needs a new permission, add it to core/constants/permission.ts.
 */

import {
  LayoutDashboard,
  Ticket,
  Inbox,
  AlertTriangle,
  AlertCircle,
  ArrowUpDown,
  Server,
  Database,
  BookOpen,
  FileText,
  BarChart2,
  Zap,
  Users,
  Wrench,
  UserCog,
  CheckSquare,
  ShoppingBag,
  Contact,
  Building2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { can, type Permission } from "core/constants/permission.ts";
import type { Role } from "core/constants/role.ts";

// ── Types ──────────────────────────────────────────────────────────────────────

/** Small decorative pill rendered next to a nav item's label. */
export type NavBadge = "beta" | "new";

export interface NavItem {
  id: string;
  /** React Router destination */
  to: string;
  label: string;
  icon: LucideIcon;
  /**
   * When true, the item only matches when the path is exactly `to`.
   * Mirrors React Router's <NavLink end> prop.
   */
  end?: boolean;
  /**
   * Item is visible only when the user has this permission.
   * Combined with `roles` → both must pass.
   */
  permission?: Permission;
  /**
   * Item is visible only when the user's role is in this list.
   * Combined with `permission` → both must pass.
   */
  roles?: readonly Role[];
  /** Optional decorative pill rendered next to the item label. */
  badge?: NavBadge;
}

export interface NavSection {
  id: string;
  /** Heading displayed above the section's items in the sidebar. */
  label: string;
  items: NavItem[];
  /** If set, the entire section is hidden unless the user has this permission. */
  permission?: Permission;
  /** If set, the entire section is hidden unless the user's role is in this list. */
  roles?: readonly Role[];
}

// ── Navigation structure ───────────────────────────────────────────────────────

/**
 * Ordered list of navigation sections rendered in the sidebar.
 * Sections and items are filtered at render-time by role and permission.
 */
export const NAV_SECTIONS: NavSection[] = [
  // ── Service Desk ───────────────────────────────────────────────────────────
  {
    id: "service-desk",
    label: "Service Desk",
    items: [
      {
        id: "dashboard",
        to: "/",
        end: true,
        label: "Dashboard",
        icon: LayoutDashboard,
      },
      {
        id: "tickets",
        to: "/tickets",
        label: "Tickets",
        icon: Ticket,
        permission: "tickets.view",
      },
    ],
  },

  // ── ITSM Modules ───────────────────────────────────────────────────────────
  {
    id: "itsm",
    label: "ITSM",
    items: [
      {
        id: "requests",
        to: "/requests",
        label: "Service Requests",
        icon: Inbox,
        permission: "requests.view",
      },
      {
        id: "incidents",
        to: "/incidents",
        label: "Incidents",
        icon: AlertTriangle,
        permission: "incidents.view",
      },
      {
        id: "problems",
        to: "/problems",
        label: "Problems",
        icon: AlertCircle,
        permission: "problems.view",
      },
      {
        id: "changes",
        to: "/changes",
        label: "Changes",
        icon: ArrowUpDown,
        permission: "changes.view",
      },
      {
        id: "cmdb",
        to: "/cmdb",
        label: "CMDB",
        icon: Database,
        permission: "cmdb.view",
      },
      {
        id: "catalog",
        to: "/catalog",
        label: "Service Catalog",
        icon: ShoppingBag,
        permission: "catalog.view",
      },
      {
        id: "assets",
        to: "/assets",
        label: "Assets",
        icon: Server,
        permission: "assets.view",
        badge: "beta",
      },
      {
        id: "approvals",
        to: "/approvals",
        label: "Approvals",
        icon: CheckSquare,
        permission: "approvals.view",
      },
    ],
  },

  // ── Contacts ───────────────────────────────────────────────────────────────
  {
    id: "contacts",
    label: "Contacts",
    permission: "contacts.view",
    items: [
      {
        id: "customers",
        to: "/customers",
        label: "Customers",
        icon: Contact,
        permission: "contacts.view",
      },
      {
        id: "organizations",
        to: "/organizations",
        label: "Organizations",
        icon: Building2,
        permission: "contacts.view",
      },
    ],
  },

  // ── Knowledge ──────────────────────────────────────────────────────────────
  {
    id: "knowledge",
    label: "Knowledge",
    items: [
      {
        id: "kb",
        to: "/kb",
        label: "Knowledge Base",
        icon: BookOpen,
        permission: "kb.manage",
      },
      {
        id: "templates",
        to: "/templates",
        label: "Templates",
        icon: FileText,
        roles: ["admin"],
      },
    ],
  },

  // ── Analytics ──────────────────────────────────────────────────────────────
  {
    id: "analytics",
    label: "Analytics",
    permission: "reports.view",
    items: [
      {
        id: "reports",
        to: "/reports",
        label: "Reports",
        icon: BarChart2,
        permission: "reports.view",
      },
    ],
  },

  // ── Administration ─────────────────────────────────────────────────────────
  // The entire section is admin-only via the section-level `roles` gate.
  {
    id: "administration",
    label: "Administration",
    roles: ["admin"],
    items: [
      {
        id: "automations",
        to: "/automations",
        label: "Automations",
        icon: Zap,
      },
      {
        id: "teams",
        to: "/teams",
        label: "Teams",
        icon: Users,
      },
      {
        id: "users",
        to: "/users",
        label: "Users",
        icon: UserCog,
      },
      {
        id: "macros",
        to: "/macros",
        label: "Macros",
        icon: Wrench,
      },
    ],
  },
];

// ── Visibility helpers (used by Layout.tsx) ────────────────────────────────────

/** Returns true if the given user role can see this nav item. */
export function isNavItemVisible(item: NavItem, role: string): boolean {
  if (item.permission && !can(role, item.permission)) return false;
  if (item.roles && !item.roles.includes(role as Role)) return false;
  return true;
}

/**
 * Returns true if the given user role can see at least one item in the section
 * and passes any section-level gates.
 */
export function isNavSectionVisible(section: NavSection, role: string): boolean {
  if (section.permission && !can(role, section.permission)) return false;
  if (section.roles && !section.roles.includes(role as Role)) return false;
  return section.items.some((item) => isNavItemVisible(item, role));
}

// ── Module breadcrumb ──────────────────────────────────────────────────────────

/**
 * Returns a human-readable breadcrumb string for the current route.
 * Example: "/problems" → "ITSM · Problems"
 */
export function resolveModuleBreadcrumb(pathname: string, role: string): string {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (!isNavItemVisible(item, role)) continue;
      const matched = item.end
        ? pathname === item.to
        : pathname === item.to || pathname.startsWith(item.to + "/");
      if (matched) return `${section.label}  ·  ${item.label}`;
    }
  }
  if (pathname.startsWith("/settings")) return "Administration  ·  Settings";
  if (pathname.startsWith("/profile")) return "Account  ·  Profile";
  if (pathname.startsWith("/customers")) return "Contacts  ·  Customers";
  if (pathname.startsWith("/organizations")) return "Contacts  ·  Organizations";
  if (pathname.startsWith("/notifications")) return "Account  ·  Notifications";
  return "ITSM Platform";
}
