/**
 * Roles route — admin CRUD for editable role definitions.
 *
 * Gated by `users.manage`. Built-in keys (admin / supervisor / agent /
 * readonly / customer) cannot be deleted. The `customer` role is hidden
 * from listings and rejected in updates because it's a portal-only role
 * managed via dedicated middleware.
 *
 * Lockout protection
 * ──────────────────
 *  - The `admin` role's `users.manage` permission cannot be removed.
 *  - A role cannot be deleted while users are still assigned to it.
 *
 * After every successful mutation the route reloads the in-memory role
 * cache so subsequent permission checks see the new state immediately,
 * and writes a `role.*` audit event.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import {
  createRoleSchema,
  updateRoleSchema,
} from "core/schemas/roles.ts";
import {
  PERMISSION_CATALOG,
  PERMISSION_CATEGORIES,
} from "core/constants/permission-catalog.ts";
import type { Permission } from "core/constants/permission.ts";
import { logSystemAudit } from "../lib/audit";
import { reloadRoles, getRoles } from "../lib/role-cache";
import { setShortCache, setLongCache } from "../lib/cache-control";
import prisma from "../db";

const router = Router();

router.use(requireAuth);

// ── Permission catalog endpoint ──────────────────────────────────────────────
//
// Public to authenticated users so the role editor and any future "what can
// this user do?" UI doesn't need to bundle the catalog client-side.

router.get("/_catalog", (_req, res) => {
  // Static data — only changes when a developer ships new permissions, so a
  // 1-hour browser cache is safe and saves a round-trip every time the role
  // editor opens.
  setLongCache(res);
  res.json({
    categories: PERMISSION_CATEGORIES,
    permissions: PERMISSION_CATALOG,
  });
});

// Valid permission keys (used to filter request bodies before persisting).
const VALID_PERMISSIONS = new Set<Permission>(PERMISSION_CATALOG.map((p) => p.key));

function sanitizePermissions(input: unknown): Permission[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<Permission>();
  for (const v of input) {
    if (typeof v === "string" && VALID_PERMISSIONS.has(v as Permission)) {
      seen.add(v as Permission);
    }
  }
  return Array.from(seen);
}

// ── List roles ───────────────────────────────────────────────────────────────

router.get("/", requirePermission("users.manage"), async (_req, res) => {
  setShortCache(res);
  const records = await getRoles();
  res.json({
    roles: records
      .filter((r) => !r.isSystem || r.key === "customer") // include customer for visibility
      .map((r) => ({
        key:          r.key,
        name:         r.name,
        description:  r.description,
        color:        r.color,
        isBuiltin:    r.isBuiltin,
        isSystem:     r.isSystem,
        permissions:  r.permissions,
        memberCount:  r.memberCount,
      })),
  });
});

// ── Get one role ─────────────────────────────────────────────────────────────

router.get("/:key", requirePermission("users.manage"), async (req, res) => {
  const key = req.params.key as string;
  const records = await getRoles();
  const role = records.find((r) => r.key === key);
  if (!role) {
    res.status(404).json({ error: "Role not found" });
    return;
  }
  res.json({ role });
});

// ── Create custom role ───────────────────────────────────────────────────────

router.post("/", requirePermission("users.manage"), async (req, res) => {
  const data = validate(createRoleSchema, req.body, res);
  if (!data) return;

  // Reserved keys
  if (["admin", "supervisor", "agent", "readonly", "customer"].includes(data.key)) {
    res.status(409).json({ error: "That role key is reserved for a built-in role." });
    return;
  }

  const exists = await prisma.role.findUnique({ where: { key: data.key } });
  if (exists) {
    res.status(409).json({ error: "A role with that key already exists." });
    return;
  }

  const cleanPerms = sanitizePermissions(data.permissions);

  const created = await prisma.role.create({
    data: {
      key:         data.key,
      name:        data.name,
      description: data.description ?? null,
      color:       data.color || null,
      isBuiltin:   false,
      isSystem:    false,
      permissions: cleanPerms,
    },
  });

  await reloadRoles();

  void logSystemAudit(req.user!.id, "role.created", {
    roleKey:     created.key,
    roleName:    created.name,
    permissions: cleanPerms,
  });

  res.status(201).json({ role: created });
});

// ── Update role (rename, recolor, edit permissions) ──────────────────────────

router.patch("/:key", requirePermission("users.manage"), async (req, res) => {
  const data = validate(updateRoleSchema, req.body, res);
  if (!data) return;

  const key = req.params.key as string;
  if (key === "customer") {
    res.status(403).json({ error: "The customer role is system-managed and cannot be edited here." });
    return;
  }

  const existing = await prisma.role.findUnique({ where: { key } });
  if (!existing) {
    res.status(404).json({ error: "Role not found" });
    return;
  }

  // Lockout protection: the admin role must always retain users.manage,
  // otherwise no one can edit roles or users again.
  let nextPerms: Permission[] | undefined;
  if (data.permissions !== undefined) {
    nextPerms = sanitizePermissions(data.permissions);
    if (key === "admin" && !nextPerms.includes("users.manage")) {
      res.status(400).json({
        error: "The admin role must keep the 'users.manage' permission to prevent lockout.",
      });
      return;
    }
  }

  const updated = await prisma.role.update({
    where: { key },
    data: {
      ...(data.name        !== undefined ? { name: data.name }                                : {}),
      ...(data.description !== undefined ? { description: data.description ?? null }          : {}),
      ...(data.color       !== undefined ? { color: data.color || null }                      : {}),
      ...(nextPerms        !== undefined ? { permissions: nextPerms }                         : {}),
    },
  });

  await reloadRoles();

  // Build a focused changelist for the audit log
  const changes: string[] = [];
  if (data.name        !== undefined && data.name !== existing.name)               changes.push("name");
  if (data.description !== undefined && (data.description ?? null) !== existing.description) changes.push("description");
  if (data.color       !== undefined && (data.color || null) !== existing.color)   changes.push("color");
  if (nextPerms !== undefined) {
    const before = new Set<Permission>(Array.isArray(existing.permissions) ? existing.permissions as Permission[] : []);
    const after  = new Set<Permission>(nextPerms);
    const added   = nextPerms.filter((p) => !before.has(p));
    const removed = Array.from(before).filter((p) => !after.has(p));
    if (added.length || removed.length) {
      void logSystemAudit(req.user!.id, "role.permissions_changed", {
        roleKey:  key,
        roleName: updated.name,
        added,
        removed,
      });
    }
  }
  if (changes.length > 0) {
    void logSystemAudit(req.user!.id, "role.updated", {
      roleKey:  key,
      roleName: updated.name,
      changes,
    });
  }

  res.json({ role: updated });
});

// ── Delete custom role ───────────────────────────────────────────────────────

router.delete("/:key", requirePermission("users.manage"), async (req, res) => {
  const key = req.params.key as string;
  const existing = await prisma.role.findUnique({ where: { key } });
  if (!existing) {
    res.status(404).json({ error: "Role not found" });
    return;
  }
  if (existing.isBuiltin) {
    res.status(403).json({ error: "Built-in roles cannot be deleted." });
    return;
  }

  const memberCount = await prisma.user.count({ where: { role: key, deletedAt: null } });
  if (memberCount > 0) {
    res.status(409).json({
      error: `Cannot delete role: ${memberCount} user${memberCount === 1 ? "" : "s"} still assigned. Reassign them first.`,
    });
    return;
  }

  await prisma.role.delete({ where: { key } });
  await reloadRoles();

  void logSystemAudit(req.user!.id, "role.deleted", {
    roleKey:  existing.key,
    roleName: existing.name,
  });

  res.json({ ok: true });
});

// ── Reset built-in role to defaults ──────────────────────────────────────────

router.post("/:key/reset", requirePermission("users.manage"), async (req, res) => {
  const key = req.params.key as string;
  const existing = await prisma.role.findUnique({ where: { key } });
  if (!existing) {
    res.status(404).json({ error: "Role not found" });
    return;
  }
  if (!existing.isBuiltin) {
    res.status(400).json({ error: "Only built-in roles can be reset to defaults." });
    return;
  }
  if (key === "customer") {
    res.status(403).json({ error: "The customer role is system-managed." });
    return;
  }

  const { BUILTIN_ROLE_PERMISSIONS } = await import("core/constants/permission.ts");
  const defaults = BUILTIN_ROLE_PERMISSIONS[key] ?? [];

  const updated = await prisma.role.update({
    where: { key },
    data:  { permissions: defaults },
  });

  await reloadRoles();

  void logSystemAudit(req.user!.id, "role.permissions_changed", {
    roleKey:  key,
    roleName: updated.name,
    reset:    true,
  });

  res.json({ role: updated });
});

export default router;
