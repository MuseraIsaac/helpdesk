/**
 * Server-side role cache.
 *
 * The role table is the source of truth for role names, descriptions, and
 * permission sets at runtime. This module:
 *
 *  - Loads role records from the DB at boot (`loadRoles`).
 *  - Pushes the resulting permission sets into the in-memory cache used by
 *    `can()` in core/constants/permission.ts via `setRolePermissions`.
 *  - Hydrates built-in roles whose `permissions` JSON is empty (first-time
 *    install or after a fresh seed) from BUILTIN_ROLE_PERMISSIONS and writes
 *    the resolved set back to the DB.
 *  - Exposes `reloadRoles` so the role editor route can re-sync the cache
 *    immediately after a save.
 */

import {
  setRolePermissions,
  BUILTIN_ROLE_PERMISSIONS,
  type Permission,
} from "core/constants/permission.ts";
import prisma from "../db";

export interface RoleRecord {
  key: string;
  name: string;
  description: string | null;
  isBuiltin: boolean;
  isSystem: boolean;
  color: string | null;
  permissions: Permission[];
  memberCount: number;
}

let _cache: Map<string, RoleRecord> | null = null;
let _inflight: Promise<RoleRecord[]> | null = null;

/**
 * Read all role records from DB and update the in-memory permission cache.
 *
 * Concurrent callers share a single in-flight promise so a burst of requests
 * on a cold cache doesn't stampede the DB.
 */
export async function loadRoles(): Promise<RoleRecord[]> {
  if (_inflight) return _inflight;
  _inflight = doLoadRoles().finally(() => { _inflight = null; });
  return _inflight;
}

async function doLoadRoles(): Promise<RoleRecord[]> {
  // Run the role list and member-count queries in parallel.
  const [rows, counts] = await Promise.all([
    prisma.role.findMany({ orderBy: { key: "asc" } }),
    prisma.user.groupBy({
      by: ["role"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
  ]);

  // Identify built-in roles with empty permission arrays — these need to be
  // hydrated from the canonical defaults so the editor and `can()` see the
  // resolved set immediately. Run the updates in parallel.
  const toHydrate = rows
    .map((row) => {
      const perms = Array.isArray(row.permissions) ? (row.permissions as Permission[]) : [];
      if (perms.length === 0 && row.isBuiltin && BUILTIN_ROLE_PERMISSIONS[row.key]) {
        return { key: row.key, defaults: BUILTIN_ROLE_PERMISSIONS[row.key]! };
      }
      return null;
    })
    .filter((x): x is { key: string; defaults: Permission[] } => x !== null);

  if (toHydrate.length > 0) {
    await Promise.all(
      toHydrate.map((h) =>
        prisma.role.update({ where: { key: h.key }, data: { permissions: h.defaults } })
      )
    );
    // Patch the in-memory rows so we don't need a second findMany.
    const overrides = new Map(toHydrate.map((h) => [h.key, h.defaults]));
    for (const row of rows) {
      const ov = overrides.get(row.key);
      if (ov) row.permissions = ov as unknown as typeof row.permissions;
    }
  }

  const countByRole = new Map(counts.map((c) => [c.role, c._count._all]));

  const records: RoleRecord[] = rows.map((r) => ({
    key:         r.key,
    name:        r.name,
    description: r.description,
    isBuiltin:   r.isBuiltin,
    isSystem:    r.isSystem,
    color:       r.color,
    permissions: Array.isArray(r.permissions) ? (r.permissions as Permission[]) : [],
    memberCount: countByRole.get(r.key) ?? 0,
  }));

  _cache = new Map(records.map((r) => [r.key, r]));

  // Push permissions into the shared cache used by `can()` middleware.
  setRolePermissions(
    Object.fromEntries(records.map((r) => [r.key, r.permissions]))
  );

  return records;
}

/** Force a fresh DB load — call after any role edit. */
export async function reloadRoles(): Promise<RoleRecord[]> {
  return loadRoles();
}

/** Returns the cached records (loading if not yet populated). */
export async function getRoles(): Promise<RoleRecord[]> {
  if (_cache) return Array.from(_cache.values());
  return loadRoles();
}

/** Single-role lookup. */
export async function getRole(key: string): Promise<RoleRecord | null> {
  if (!_cache) await loadRoles();
  return _cache?.get(key) ?? null;
}

/** Effective permission list for a role key, from the cache. */
export async function permissionsForRole(key: string): Promise<Permission[]> {
  const role = await getRole(key);
  return role?.permissions ?? [];
}
