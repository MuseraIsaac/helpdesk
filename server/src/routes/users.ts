import { Router } from "express";
import { hashPassword } from "better-auth/crypto";
import { createUserSchema, updateUserSchema, patchUserSchema } from "core/schemas/users.ts";
import { Role } from "core/constants/role.ts";
import { requireAuth } from "../middleware/require-auth";
import { requireAdmin } from "../middleware/require-admin";
import { validate } from "../lib/validate";
import prisma from "../db";
import { AI_AGENT_ID } from "core/constants/ai-agent.ts";
import { logSystemAudit } from "../lib/audit";
import { getRole } from "../lib/role-cache";

const router = Router();

/**
 * Validate that a role key resolves to a real, assignable role.
 * Rejects unknown roles and the system-only `customer` role.
 * Returns null on success or sends a 400 response and returns an error msg.
 */
async function ensureAssignableRole(role: string | undefined, res: import("express").Response): Promise<boolean> {
  if (role === undefined) return true;
  const found = await getRole(role);
  if (!found) {
    res.status(400).json({ error: `Unknown role: ${role}` });
    return false;
  }
  if (found.isSystem) {
    res.status(400).json({ error: `The "${found.name}" role cannot be assigned via the user editor.` });
    return false;
  }
  return true;
}

const USER_SELECT = {
  id: true, name: true, email: true, role: true,
  globalTicketView: true, createdAt: true,
} as const;

router.get("/", requireAuth, requireAdmin, async (req, res) => {
  const users = await prisma.user.findMany({
    where: { deletedAt: null, id: { not: AI_AGENT_ID } },
    select: USER_SELECT,
    orderBy: { createdAt: "asc" },
  });
  res.json({ users });
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const data = validate(createUserSchema, req.body, res);
  if (!data) return;

  const { name, email, password, role } = data;
  if (!(await ensureAssignableRole(role, res))) return;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "Email already exists" });
    return;
  }

  const hashedPassword = await hashPassword(password);
  const userId = crypto.randomUUID();
  const now = new Date();

  await prisma.$transaction([
    prisma.user.create({
      data: {
        id: userId,
        name,
        email,
        emailVerified: false,
        role: role ?? Role.agent,
        createdAt: now,
        updatedAt: now,
      },
    }),
    prisma.account.create({
      data: {
        id: crypto.randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: hashedPassword,
        createdAt: now,
        updatedAt: now,
      },
    }),
  ]);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  void logSystemAudit(req.user.id, "user.created", {
    userId: userId,
    name,
    email,
    role: role ?? Role.agent,
  });

  res.status(201).json({ user });
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id as string;

  const data = validate(updateUserSchema, req.body, res);
  if (!data) return;

  const { name, email, password, role } = data;
  if (!(await ensureAssignableRole(role, res))) return;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== id) {
    res.status(409).json({ error: "Email already exists" });
    return;
  }

  await prisma.user.update({
    where: { id: id },
    data: {
      name,
      email,
      updatedAt: new Date(),
      ...(role !== undefined && { role }),
      ...(data.globalTicketView !== undefined && { globalTicketView: data.globalTicketView }),
    },
  });

  if (password) {
    const hashedPassword = await hashPassword(password);
    await prisma.account.updateMany({
      where: { userId: id, providerId: "credential" },
      data: { password: hashedPassword, updatedAt: new Date() },
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: id },
    select: USER_SELECT,
  });

  const changes: string[] = [];
  if (name  !== undefined) changes.push("name");
  if (email !== undefined) changes.push("email");
  if (role  !== undefined) changes.push("role");
  if (data.globalTicketView !== undefined) changes.push("globalTicketView");
  if (password)            changes.push("password");

  void logSystemAudit(req.user.id, "user.updated", {
    userId: id,
    name: user?.name ?? "",
    changes,
  });

  res.json({ user });
});

// PATCH /:id/global-view — quick toggle for global ticket visibility (admin only)
router.patch("/:id/global-view", requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id as string;

  const data = validate(patchUserSchema, req.body, res);
  if (!data) return;

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!target) { res.status(404).json({ error: "User not found" }); return; }

  const user = await prisma.user.update({
    where: { id },
    data: { globalTicketView: data.globalTicketView, updatedAt: new Date() },
    select: USER_SELECT,
  });

  res.json({ user });
});

// ── Team membership for a user ────────────────────────────────────────────────
//
// GET /api/users/:id/teams      → list the teams this user belongs to
// PUT /api/users/:id/teams      → replace the user's team membership atomically
//
// These mirror /api/teams/:id/members but flipped — used when the user editor
// wants to assign a person to N teams in one round-trip.

router.get("/:id/teams", requireAuth, requireAdmin, async (req, res) => {
  const userId = req.params.id as string;
  const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!exists) { res.status(404).json({ error: "User not found" }); return; }

  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    include: { team: { select: { id: true, name: true, color: true } } },
    orderBy: { team: { name: "asc" } },
  });
  res.json({ teams: memberships.map((m) => m.team) });
});

router.put("/:id/teams", requireAuth, requireAdmin, async (req, res) => {
  const userId = req.params.id as string;

  const body = req.body as { teamIds?: unknown };
  const raw = Array.isArray(body?.teamIds) ? body.teamIds : null;
  if (!raw) { res.status(400).json({ error: "teamIds must be an array" }); return; }

  const teamIds = raw
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, deletedAt: true },
  });
  if (!target || target.deletedAt) { res.status(404).json({ error: "User not found" }); return; }
  if (target.role === Role.customer) {
    res.status(400).json({ error: "Customers cannot be assigned to teams" });
    return;
  }

  if (teamIds.length > 0) {
    const found = await prisma.team.findMany({
      where: { id: { in: teamIds } },
      select: { id: true },
    });
    if (found.length !== teamIds.length) {
      res.status(400).json({ error: "One or more team IDs are invalid" });
      return;
    }
  }

  const current = await prisma.teamMember.findMany({ where: { userId }, select: { teamId: true } });
  const currentIds = new Set(current.map((m) => m.teamId));
  const nextIds    = new Set(teamIds);
  const added   = teamIds.filter((id) => !currentIds.has(id));
  const removed = [...currentIds].filter((id) => !nextIds.has(id));

  await prisma.$transaction([
    prisma.teamMember.deleteMany({ where: { userId } }),
    ...(teamIds.length > 0
      ? [prisma.teamMember.createMany({ data: teamIds.map((teamId) => ({ teamId, userId })) })]
      : []),
  ]);

  for (const teamId of added) {
    void logSystemAudit(req.user.id, "team.member_added", {
      entityType: "team", entityId: teamId, entityNumber: `TEAM-${teamId}`, entityTitle: target.name,
      memberId: userId,
    });
  }
  for (const teamId of removed) {
    void logSystemAudit(req.user.id, "team.member_removed", {
      entityType: "team", entityId: teamId, entityNumber: `TEAM-${teamId}`, entityTitle: target.name,
      memberId: userId,
    });
  }

  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    include: { team: { select: { id: true, name: true, color: true } } },
    orderBy: { team: { name: "asc" } },
  });
  res.json({ teams: memberships.map((m) => m.team) });
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id as string;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.role === Role.admin) {
    res.status(403).json({ error: "Admin users cannot be deleted" });
    return;
  }

  await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await prisma.ticket.updateMany({
    where: { assignedToId: id },
    data: { assignedToId: null },
  });

  await prisma.session.deleteMany({ where: { userId: id } });

  void logSystemAudit(req.user.id, "user.deleted", {
    userId: id,
    name:  user.name,
    email: user.email,
  });

  res.json({ message: "User deleted" });
});

export default router;
