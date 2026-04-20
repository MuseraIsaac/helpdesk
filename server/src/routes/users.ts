import { Router } from "express";
import { hashPassword } from "better-auth/crypto";
import { createUserSchema, updateUserSchema, patchUserSchema } from "core/schemas/users.ts";
import { Role } from "core/constants/role.ts";
import { requireAuth } from "../middleware/require-auth";
import { requireAdmin } from "../middleware/require-admin";
import { validate } from "../lib/validate";
import prisma from "../db";
import { AI_AGENT_ID } from "core/constants/ai-agent.ts";

const router = Router();

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
        role: (role as Role) ?? Role.agent,
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

  res.status(201).json({ user });
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id as string;

  const data = validate(updateUserSchema, req.body, res);
  if (!data) return;

  const { name, email, password, role } = data;

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
      ...(role !== undefined && { role: role as Role }),
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

  res.json({ message: "User deleted" });
});

export default router;
