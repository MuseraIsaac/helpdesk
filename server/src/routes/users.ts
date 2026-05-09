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
import { validatePasswordPolicy } from "../lib/security-policy";

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
  globalTicketView: true, mustChangePassword: true, createdAt: true,
} as const;

// ── /me — read-only profile fields the client needs for routing decisions ─
//
// Returns just enough for ProtectedRoute to decide whether to bounce the
// agent into the forced-change-password flow. Any authenticated non-customer
// can call it (it only ever reveals their own row).
router.get("/me", requireAuth, async (req, res) => {
  const me = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, name: true, email: true, role: true, mustChangePassword: true },
  });
  if (!me) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ user: me });
});

// ── /me/change-password — used by the forced-change flow and self-service ─
router.post("/me/change-password", requireAuth, async (req, res) => {
  const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword     = typeof req.body?.newPassword     === "string" ? req.body.newPassword     : "";

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Both current and new password are required." });
    return;
  }
  if (currentPassword === newPassword) {
    res.status(400).json({ error: "New password must be different from your current password." });
    return;
  }

  const policyError = await validatePasswordPolicy(newPassword);
  if (policyError) { res.status(400).json({ error: policyError }); return; }

  // Verify the current password against the stored credential row.
  const account = await prisma.account.findFirst({
    where: { userId: req.user.id, providerId: "credential" },
  });
  if (!account?.password) {
    res.status(400).json({ error: "This account doesn't have a password set." });
    return;
  }
  const { verifyPassword } = await import("better-auth/crypto");
  const ok = await verifyPassword({ password: currentPassword, hash: account.password });
  if (!ok) {
    res.status(400).json({ error: "Your current password is incorrect." });
    return;
  }

  const newHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.account.update({
      where: { id: account.id },
      data:  { password: newHash, updatedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: req.user.id },
      data:  { mustChangePassword: false, updatedAt: new Date() },
    }),
  ]);

  void logSystemAudit(req.user.id, "user.password_changed", {
    self: true,
    forced: true,
  });

  res.json({ ok: true });
});

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

  const { name, email, password, role, mustChangePassword } = data;
  if (!(await ensureAssignableRole(role, res))) return;

  const policyError = await validatePasswordPolicy(password);
  if (policyError) {
    res.status(400).json({ error: policyError });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "Email already exists" });
    return;
  }

  const hashedPassword = await hashPassword(password);
  const userId = crypto.randomUUID();
  const now = new Date();
  const effectiveRole = role ?? Role.agent;
  // Email verification only applies to self-served customer signups.
  // Internal users (admin, supervisor, agent, readonly, custom roles) are
  // pre-verified — admins are issuing them creds directly so the email-
  // proof step is redundant and would just block onboarding.
  const isInternalUser = effectiveRole !== Role.customer;

  await prisma.$transaction([
    prisma.user.create({
      data: {
        id: userId,
        name,
        email,
        emailVerified: isInternalUser,
        role: effectiveRole,
        mustChangePassword: mustChangePassword ?? false,
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

  // Fire off the verification email only for new customers — agents/admins
  // are pre-verified above and don't need it.
  if (!isInternalUser) {
    void (async () => {
      try {
        const { getSection } = await import("../lib/settings");
        const sec = await getSection("security");
        if (sec.requireEmailVerification) {
          const { auth } = await import("../lib/auth");
          await auth.api.sendVerificationEmail({ body: { email } });
        }
      } catch (err) {
        console.error("[users] failed to send verification email:", err);
      }
    })();
  }

  void logSystemAudit(req.user.id, "user.created", {
    userId: userId,
    name,
    email,
    role: effectiveRole,
    mustChangePassword: mustChangePassword ?? false,
  });

  res.status(201).json({ user });
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id as string;

  const data = validate(updateUserSchema, req.body, res);
  if (!data) return;

  const { name, password, role, mustChangePassword } = data;
  if (!(await ensureAssignableRole(role, res))) return;

  // Email is the user's stable identifier for sign-in and OAuth account
  // linking — changing it would orphan linked Google accounts and surprise
  // anyone who's bookmarked / muscle-memoried it. Ignore whatever the client
  // sends and keep the existing value. The form should render email as
  // read-only; this is defense in depth.
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true },
  });
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await prisma.user.update({
    where: { id: id },
    data: {
      name,
      updatedAt: new Date(),
      ...(role !== undefined && { role }),
      ...(data.globalTicketView !== undefined && { globalTicketView: data.globalTicketView }),
      ...(mustChangePassword !== undefined && { mustChangePassword }),
    },
  });

  if (password) {
    const policyError = await validatePasswordPolicy(password);
    if (policyError) {
      res.status(400).json({ error: policyError });
      return;
    }
    const hashedPassword = await hashPassword(password);
    // Update the existing credential row if there is one. If the user only
    // has OAuth accounts (e.g. signed in via Google, no credential row), the
    // updateMany would silently do nothing — so create the credential row in
    // that case so the admin-set password actually takes effect on next login.
    const updated = await prisma.account.updateMany({
      where: { userId: id, providerId: "credential" },
      data: { password: hashedPassword, updatedAt: new Date() },
    });
    if (updated.count === 0) {
      const now = new Date();
      await prisma.account.create({
        data: {
          id: crypto.randomUUID(),
          accountId: id,
          providerId: "credential",
          userId: id,
          password: hashedPassword,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    // Admin-issued passwords bypass the customer email-verification gate.
    // Rationale: when an admin manually sets a password (e.g. onboarding a
    // customer who's having trouble with the verification email), the admin
    // has already verified the user's identity out-of-band. Flipping
    // emailVerified=true here lets that user sign in to the portal
    // immediately instead of being blocked by the unverified-email banner.
    await prisma.user.update({
      where: { id },
      data:  { emailVerified: true, updatedAt: new Date() },
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: id },
    select: USER_SELECT,
  });

  const changes: string[] = [];
  if (name  !== undefined) changes.push("name");
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
