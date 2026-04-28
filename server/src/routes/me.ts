import { Router } from "express";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { requireAuth } from "../middleware/require-auth";
import { validate } from "../lib/validate";
import {
  updateProfileSchema,
  updatePreferencesSchema,
  changePasswordSchema,
} from "core/schemas/preferences.ts";
import prisma from "../db";
import { getSection } from "../lib/settings";
import { permissionsForRole } from "../lib/role-cache";

const router = Router();

// GET /api/me/ticket-scope — tells the UI whether this user's ticket view is team-scoped
// Used by TicketsPage to show a contextual banner when team scoping is active.
router.get("/ticket-scope", requireAuth, async (req, res) => {
  const role = req.user.role;

  // Admins and supervisors are never scoped
  if (role === "admin" || role === "supervisor") {
    res.json({ scoped: false, globalTicketView: true, teams: [] });
    return;
  }

  const { teamScopedVisibility } = await getSection("tickets");
  if (!teamScopedVisibility) {
    res.json({ scoped: false, globalTicketView: false, teams: [] });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      globalTicketView: true,
      teamMemberships: {
        select: { team: { select: { id: true, name: true, color: true } } },
      },
    },
  });

  if (!user) { res.json({ scoped: false, globalTicketView: false, teams: [] }); return; }

  const teams = user.teamMemberships.map((m) => m.team);
  res.json({
    scoped: !user.globalTicketView,
    globalTicketView: user.globalTicketView,
    teams,
  });
});

// GET /api/me — current user + their preferences + effective permissions
router.get("/", requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      preference: true,
      roleRef: { select: { name: true, color: true } },
    },
  });
  // Effective permissions reflect any admin edits to the user's role.
  const permissions = await permissionsForRole(user.role);
  res.json({ user: { ...user, permissions } });
});

// PATCH /api/me/profile — update name + profile extras
router.patch("/profile", requireAuth, async (req, res) => {
  const data = validate(updateProfileSchema, req.body, res);
  if (!data) return;

  const { name, jobTitle, phone, signature } = data;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: req.user.id },
      data: { name, updatedAt: new Date() },
    }),
    prisma.userPreference.upsert({
      where: { userId: req.user.id },
      create: { userId: req.user.id, jobTitle: jobTitle ?? null, phone: phone ?? null, signature: signature ?? null },
      update: { jobTitle: jobTitle ?? null, phone: phone ?? null, signature: signature ?? null },
    }),
  ]);

  res.json({ success: true });
});

// PATCH /api/me/preferences — update locale / UI preferences
router.patch("/preferences", requireAuth, async (req, res) => {
  const data = validate(updatePreferencesSchema, req.body, res);
  if (!data) return;

  await prisma.userPreference.upsert({
    where: { userId: req.user.id },
    create: { userId: req.user.id, ...data },
    update: data,
  });

  res.json({ success: true });
});

// PATCH /api/me/password — change own password
router.patch("/password", requireAuth, async (req, res) => {
  const data = validate(changePasswordSchema, req.body, res);
  if (!data) return;

  const account = await prisma.account.findFirst({
    where: { userId: req.user.id, providerId: "credential" },
  });

  if (!account?.password) {
    res.status(400).json({ error: "No password-based account found" });
    return;
  }

  const valid = await verifyPassword({
    hash: account.password,
    password: data.currentPassword,
  });

  if (!valid) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }

  const hashed = await hashPassword(data.newPassword);
  await prisma.account.update({
    where: { id: account.id },
    data: { password: hashed, updatedAt: new Date() },
  });

  res.json({ success: true });
});

export default router;
