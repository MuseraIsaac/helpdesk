import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import {
  createTeamSchema,
  updateTeamSchema,
  setTeamMembersSchema,
} from "core/schemas/teams.ts";
import prisma from "../db";

const router = Router();

// All team routes require authentication
router.use(requireAuth);

// ── List teams (with members — used by ticket sidebar for agent filtering) ───

router.get("/", async (_req, res) => {
  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      createdAt: true,
      updatedAt: true,
      members: {
        select: { user: { select: { id: true, name: true } } },
        orderBy: { user: { name: "asc" } },
      },
      _count: { select: { tickets: true } },
    },
  });

  res.json({
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      color: t.color,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      ticketCount: t._count.tickets,
      memberCount: t.members.length,
      members: t.members.map((m) => m.user),
    })),
  });
});

// ── Get team detail (with full member list) ──────────────────────────────────

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid team ID" });
    return;
  }

  const team = await prisma.team.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: { user: { name: "asc" } },
      },
      _count: { select: { tickets: true } },
    },
  });

  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }

  res.json({
    team: {
      id: team.id,
      name: team.name,
      description: team.description,
      color: team.color,
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
      ticketCount: team._count.tickets,
      members: team.members.map((m) => m.user),
    },
  });
});

// ── Create team (admin only) ─────────────────────────────────────────────────

router.post("/", requirePermission("teams.manage"), async (req, res) => {

  const data = validate(createTeamSchema, req.body, res);
  if (!data) return;

  const existing = await prisma.team.findUnique({ where: { name: data.name } });
  if (existing) {
    res.status(409).json({ error: "A team with this name already exists" });
    return;
  }

  const team = await prisma.team.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      color: data.color,
    },
    select: { id: true, name: true, description: true, color: true, createdAt: true, updatedAt: true },
  });

  res.status(201).json({ team });
});

// ── Update team (admin only) ─────────────────────────────────────────────────

router.patch("/:id", requirePermission("teams.manage"), async (req, res) => {

  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid team ID" });
    return;
  }

  const data = validate(updateTeamSchema, req.body, res);
  if (!data) return;

  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }

  if (data.name && data.name !== team.name) {
    const conflict = await prisma.team.findUnique({ where: { name: data.name } });
    if (conflict) {
      res.status(409).json({ error: "A team with this name already exists" });
      return;
    }
  }

  const updated = await prisma.team.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.color !== undefined && { color: data.color }),
    },
    select: { id: true, name: true, description: true, color: true, createdAt: true, updatedAt: true },
  });

  res.json({ team: updated });
});

// ── Delete team (admin only) ─────────────────────────────────────────────────

router.delete("/:id", requirePermission("teams.manage"), async (req, res) => {

  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid team ID" });
    return;
  }

  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }

  // Tickets will have teamId set to NULL via onDelete: SetNull
  await prisma.team.delete({ where: { id } });

  res.status(204).send();
});

// ── Set team members (admin only) ────────────────────────────────────────────
// Replaces the full member list with the provided user IDs (idempotent PUT-style)

router.put("/:id/members", requirePermission("teams.manage"), async (req, res) => {

  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid team ID" });
    return;
  }

  const data = validate(setTeamMembersSchema, req.body, res);
  if (!data) return;

  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }

  // Validate that all provided user IDs exist and are not deleted
  if (data.memberIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: data.memberIds }, deletedAt: null },
      select: { id: true },
    });
    if (users.length !== data.memberIds.length) {
      res.status(400).json({ error: "One or more user IDs are invalid" });
      return;
    }
  }

  // Replace membership atomically
  await prisma.$transaction([
    prisma.teamMember.deleteMany({ where: { teamId: id } }),
    ...(data.memberIds.length > 0
      ? [
          prisma.teamMember.createMany({
            data: data.memberIds.map((userId) => ({ teamId: id, userId })),
          }),
        ]
      : []),
  ]);

  const members = await prisma.teamMember.findMany({
    where: { teamId: id },
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
    orderBy: { user: { name: "asc" } },
  });

  res.json({ members: members.map((m) => m.user) });
});

export default router;
