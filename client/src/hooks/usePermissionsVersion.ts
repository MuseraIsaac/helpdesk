import { useSyncExternalStore } from "react";
import {
  subscribeRolePermissions,
  getRolePermissionsVersion,
} from "core/constants/permission.ts";

/**
 * Subscribes the calling component to the global ROLE_PERMISSIONS map.
 *
 * The permission map is a mutable in-memory cache hydrated from `/api/me`
 * (and refreshed when an admin saves Roles & Permissions). Because the
 * mutations happen outside React state, components computing visibility
 * via `can()` need an explicit subscription to re-render when the data
 * changes. This hook returns a monotonically-increasing version number;
 * the value itself isn't used — its identity is what triggers the
 * re-render. Components don't need to read the return value at all.
 *
 * Pair with `can()` like:
 *   usePermissionsVersion();
 *   const allowed = can(role, "tickets.view");
 *
 * Server-side and other non-React contexts can keep calling `can()`
 * directly; the subscription path is React-only.
 */
export function usePermissionsVersion(): number {
  return useSyncExternalStore(
    subscribeRolePermissions,
    getRolePermissionsVersion,
    // Server snapshot for SSR — never executes in this app but kept for safety
    getRolePermissionsVersion,
  );
}
