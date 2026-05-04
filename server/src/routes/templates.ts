import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { Role } from "core/constants/role.ts";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import {
  createTemplateSchema,
  updateTemplateSchema,
  listTemplatesQuerySchema,
} from "core/schemas/templates.ts";
import prisma from "../db";
import type { Prisma } from "../generated/prisma/client";

const router = Router();

const TEMPLATE_SELECT = {
  id: true,
  title: true,
  body: true,
  bodyHtml: true,
  type: true,
  isActive: true,
  visibility: true,
  teamId: true,
  fields: true,
  team: { select: { id: true, name: true, color: true } },
  createdById: true,
  createdBy: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * A template is viewable by the current user when any of:
 *   - they created it
 *   - it's shared with everyone
 *   - it's shared with a team they belong to
 *   - they're an admin/supervisor (see all)
 */
async function buildVisibilityFilter(user: { id: string; role: string }): Promise<Prisma.TemplateWhereInput> {
  const isPrivileged = user.role === Role.admin || user.role === Role.supervisor;
  if (isPrivileged) return {};

  const memberships = await prisma.teamMember.findMany({
    where: { userId: user.id },
    select: { teamId: true },
  });
  const teamIds = memberships.map((m) => m.teamId);

  const or: Prisma.TemplateWhereInput[] = [
    { createdById: user.id },
    { visibility: "everyone" },
  ];
  if (teamIds.length > 0) or.push({ visibility: "team", teamId: { in: teamIds } });

  return { OR: or };
}

async function userCanShareWithTeam(userId: string, role: string, teamId: number): Promise<boolean> {
  if (role === Role.admin || role === Role.supervisor) return true;
  const m = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
    select: { userId: true },
  });
  return m !== null;
}

// GET — any authenticated non-customer (agents included). Returns only the
// templates this user is permitted to see based on the visibility model.
router.get("/", requireAuth, requirePermission("templates.view"), async (req, res) => {
  const query = listTemplatesQuerySchema.safeParse(req.query);
  const typeFilter = query.success && query.data.type ? query.data.type : undefined;
  const visibilityFilter = await buildVisibilityFilter(req.user);

  const where: Prisma.TemplateWhereInput = {
    // Notification-event email templates are managed via /api/notification-templates;
    // they should never appear in the personal templates list.
    notificationEvent: null,
    ...visibilityFilter,
    ...(typeFilter ? { type: typeFilter as any } : {}),
  };

  const templates = await prisma.template.findMany({
    where,
    select: TEMPLATE_SELECT,
    orderBy: [{ isActive: "desc" }, { type: "asc" }, { title: "asc" }],
  });
  res.json({ templates });
});

// POST — agents with templates.create can save templates (admins have it too)
router.post("/", requireAuth, requirePermission("templates.create"), async (req, res) => {
  const data = validate(createTemplateSchema, req.body, res);
  if (!data) return;

  if (data.visibility === "team") {
    const teamId = data.teamId!;
    const allowed = await userCanShareWithTeam(req.user.id, req.user.role, teamId);
    if (!allowed) {
      res.status(403).json({ error: "You can only share templates with teams you belong to." });
      return;
    }
  }

  const template = await prisma.template.create({
    data: {
      title: data.title,
      body: data.body,
      bodyHtml: data.bodyHtml ?? null,
      type: data.type as any,
      isActive: data.isActive ?? true,
      visibility: data.visibility,
      teamId: data.visibility === "team" ? data.teamId ?? null : null,
      // Snapshot of structured ticket fields — replayed on apply.
      fields: (data.fields ?? {}) as Prisma.InputJsonValue,
      createdById: req.user.id,
    },
    select: TEMPLATE_SELECT,
  });

  res.status(201).json(template);
});

// PUT — creator can edit their own template; admins/supervisors can edit any.
router.put("/:id", requireAuth, requirePermission("templates.view"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid template ID" }); return; }

  const data = validate(updateTemplateSchema, req.body, res);
  if (!data) return;

  const existing = await prisma.template.findUnique({
    where: { id },
    select: { id: true, createdById: true, visibility: true, teamId: true },
  });
  if (!existing) { res.status(404).json({ error: "Template not found" }); return; }

  const isPrivileged = req.user.role === Role.admin || req.user.role === Role.supervisor;
  const isOwner      = existing.createdById === req.user.id;
  if (!isPrivileged && !isOwner) {
    res.status(403).json({ error: "You can only edit templates you created." });
    return;
  }

  const nextVisibility = data.visibility ?? existing.visibility;
  const nextTeamId     = data.visibility !== undefined
    ? (data.visibility === "team" ? data.teamId ?? null : null)
    : (data.teamId !== undefined ? data.teamId : existing.teamId);

  if (nextVisibility === "team") {
    if (!nextTeamId) {
      res.status(400).json({ error: "Pick a team when sharing with a team." });
      return;
    }
    const allowed = await userCanShareWithTeam(req.user.id, req.user.role, nextTeamId);
    if (!allowed) {
      res.status(403).json({ error: "You can only share templates with teams you belong to." });
      return;
    }
  }

  const template = await prisma.template.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.body !== undefined && { body: data.body }),
      ...("bodyHtml" in data && { bodyHtml: data.bodyHtml ?? null }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.fields !== undefined && { fields: data.fields as Prisma.InputJsonValue }),
      visibility: nextVisibility,
      teamId:     nextVisibility === "team" ? nextTeamId : null,
    },
    select: TEMPLATE_SELECT,
  });

  res.json(template);
});

// DELETE — creator can delete their own template; admins/supervisors can delete any.
router.delete("/:id", requireAuth, requirePermission("templates.view"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid template ID" }); return; }

  const existing = await prisma.template.findUnique({
    where: { id },
    select: { id: true, createdById: true },
  });
  if (!existing) { res.status(404).json({ error: "Template not found" }); return; }

  const isPrivileged = req.user.role === Role.admin || req.user.role === Role.supervisor;
  if (!isPrivileged && existing.createdById !== req.user.id) {
    res.status(403).json({ error: "You can only delete templates you created." });
    return;
  }

  await prisma.template.delete({ where: { id } });
  res.status(204).send();
});

export default router;
