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

const router = Router();

// GET /api/me — current user + their preferences
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
    },
  });
  res.json({ user });
});

// PATCH /api/me/profile — update name + profile extras
router.patch("/profile", requireAuth, async (req, res) => {
  const data = validate(updateProfileSchema, req.body, res);
  if (!data) return;

  const { name, jobTitle, phone } = data;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: req.user.id },
      data: { name, updatedAt: new Date() },
    }),
    prisma.userPreference.upsert({
      where: { userId: req.user.id },
      create: { userId: req.user.id, jobTitle: jobTitle ?? null, phone: phone ?? null },
      update: { jobTitle: jobTitle ?? null, phone: phone ?? null },
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
