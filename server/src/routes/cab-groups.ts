import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import {
  createCabGroupSchema,
  updateCabGroupSchema,
  setCabMembersSchema,
} from "core/schemas/cab-groups.ts";
import { getSection } from "../lib/settings";
import prisma from "../db";

const router = Router();

router.use(requireAuth);

const GROUP_SELECT = {
  id: true,
  name: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  members: {
    select: { user: { select: { id: true, name: true, email: true, role: true } }, addedAt: true },
    orderBy: { user: { name: "asc" as const } },
  },
  _count: { select: { members: true } },
} as const;

function shape(g: any) {
  return {
    id:          g.id,
    name:        g.name,
    description: g.description,
    isActive:    g.isActive,
    memberCount: g._count?.members ?? g.members?.length ?? 0,
    members:     g.members?.map((m: any) => ({ ...m.user, addedAt: m.addedAt })) ?? [],
    createdAt:   g.createdAt,
    updatedAt:   g.updatedAt,
  };
}

// GET /api/cab-groups — list all groups (any authenticated user can see who's on CAB)
router.get("/", async (_req, res) => {
  const groups = await prisma.cabGroup.findMany({
    orderBy: { name: "asc" },
    select: GROUP_SELECT,
  });
  res.json({ groups: groups.map(shape) });
});

// GET /api/cab-groups/default — return the default CAB group configured in settings
// Returns null if no default is configured.
router.get("/default", async (_req, res) => {
  const settings = await getSection("changes");
  const id = settings.defaultCabGroupId;
  if (!id) { res.json({ group: null }); return; }

  const group = await prisma.cabGroup.findUnique({ where: { id }, select: GROUP_SELECT });
  res.json({ group: group ? shape(group) : null });
});

// GET /api/cab-groups/:id
router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid group ID" }); return; }

  const group = await prisma.cabGroup.findUnique({ where: { id }, select: GROUP_SELECT });
  if (!group) { res.status(404).json({ error: "CAB group not found" }); return; }
  res.json({ group: shape(group) });
});

// POST /api/cab-groups — create (admin only)
router.post("/", requirePermission("cab.manage"), async (req, res) => {
  const data = validate(createCabGroupSchema, req.body, res);
  if (!data) return;

  const existing = await prisma.cabGroup.findUnique({ where: { name: data.name } });
  if (existing) { res.status(409).json({ error: "A CAB group with this name already exists" }); return; }

  const group = await prisma.cabGroup.create({
    data: {
      name:        data.name,
      description: data.description ?? null,
      createdById: req.user.id,
    },
    select: GROUP_SELECT,
  });

  res.status(201).json({ group: shape(group) });
});

// PATCH /api/cab-groups/:id
router.patch("/:id", requirePermission("cab.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid group ID" }); return; }

  const data = validate(updateCabGroupSchema, req.body, res);
  if (!data) return;

  const existing = await prisma.cabGroup.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "CAB group not found" }); return; }

  if (data.name && data.name !== existing.name) {
    const conflict = await prisma.cabGroup.findUnique({ where: { name: data.name } });
    if (conflict) { res.status(409).json({ error: "A CAB group with this name already exists" }); return; }
  }

  const group = await prisma.cabGroup.update({
    where: { id },
    data: {
      ...(data.name        !== undefined && { name: data.name }),
      ...("description" in data          && { description: data.description ?? null }),
      ...(data.isActive    !== undefined && { isActive: data.isActive }),
    },
    select: GROUP_SELECT,
  });

  res.json({ group: shape(group) });
});

// DELETE /api/cab-groups/:id
router.delete("/:id", requirePermission("cab.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid group ID" }); return; }

  const existing = await prisma.cabGroup.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "CAB group not found" }); return; }

  // If this group is the default, clear the setting
  const settings = await getSection("changes");
  if (settings.defaultCabGroupId === id) {
    const { setSection } = await import("../lib/settings");
    await setSection("changes", { defaultCabGroupId: null }, req.user.id);
  }

  await prisma.cabGroup.delete({ where: { id } });
  res.status(204).send();
});

// PUT /api/cab-groups/:id/members — replace membership (idempotent)
router.put("/:id/members", requirePermission("cab.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid group ID" }); return; }

  const data = validate(setCabMembersSchema, req.body, res);
  if (!data) return;

  const group = await prisma.cabGroup.findUnique({ where: { id } });
  if (!group) { res.status(404).json({ error: "CAB group not found" }); return; }

  if (data.memberIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: data.memberIds }, deletedAt: null },
      select: { id: true, role: true },
    });
    if (users.length !== data.memberIds.length) {
      res.status(400).json({ error: "One or more user IDs are invalid" });
      return;
    }
    if (users.some((u) => u.role === "customer")) {
      res.status(400).json({ error: "Customers cannot be added to CAB groups" });
      return;
    }
  }

  await prisma.$transaction([
    prisma.cabMember.deleteMany({ where: { cabGroupId: id } }),
    ...(data.memberIds.length > 0
      ? [prisma.cabMember.createMany({
          data: data.memberIds.map((userId) => ({ cabGroupId: id, userId })),
        })]
      : []),
  ]);

  const members = await prisma.cabMember.findMany({
    where: { cabGroupId: id },
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
    orderBy: { user: { name: "asc" } },
  });

  res.json({ members: members.map((m) => m.user) });
});

export default router;
