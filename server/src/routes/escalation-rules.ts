import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import prisma from "../db";

const router = Router();

const conditionSchema = z.object({
  field:    z.string().min(1).max(50),
  operator: z.enum(["equals", "not_equals", "in"]),
  value:    z.string().min(1).max(200),
});

const createRuleSchema = z.object({
  name:              z.string().trim().min(1).max(120),
  module:            z.enum(["incident", "request", "ticket"]),
  conditions:        z.array(conditionSchema).min(1).max(10),
  conditionLogic:    z.enum(["AND", "OR"]).default("AND"),
  escalateToTeamId:  z.number().int().positive().nullable().optional(),
  escalateToUserId:  z.string().nullable().optional(),
  position:          z.number().int().min(0).default(0),
  isActive:          z.boolean().default(true),
  notifyByEmail:     z.boolean().default(false),
  notifyInApp:       z.boolean().default(true),
  notificationNote:  z.string().max(500).nullable().optional(),
});

const updateRuleSchema = createRuleSchema.partial();

const RULE_SELECT = {
  id: true, name: true, module: true, conditions: true, conditionLogic: true,
  escalateToTeamId: true, escalateToUserId: true, position: true, isActive: true,
  notifyByEmail: true, notifyInApp: true, notificationNote: true,
  createdAt: true, updatedAt: true,
} as const;

// GET /api/escalation-rules?module=incident
router.get("/", requireAuth, async (req, res) => {
  const module = req.query.module as string | undefined;
  const rules = await prisma.escalationRule.findMany({
    where: module ? { module: module as any } : undefined,
    orderBy: [{ module: "asc" }, { position: "asc" }, { createdAt: "asc" }],
    select: RULE_SELECT,
  });
  res.json({ rules });
});

// POST /api/escalation-rules
router.post("/", requireAuth, requirePermission("ticket_types.manage"), async (req, res) => {
  const data = validate(createRuleSchema, req.body, res);
  if (!data) return;

  if (!data.escalateToTeamId && !data.escalateToUserId) {
    res.status(400).json({ error: "Rule must have at least one escalation target (team or agent)" });
    return;
  }

  const rule = await prisma.escalationRule.create({
    data: {
      name:             data.name,
      module:           data.module as any,
      conditions:       data.conditions as any,
      conditionLogic:   data.conditionLogic,
      escalateToTeamId: data.escalateToTeamId ?? null,
      escalateToUserId: data.escalateToUserId ?? null,
      position:         data.position ?? 0,
      isActive:         data.isActive ?? true,
      notifyByEmail:    data.notifyByEmail ?? false,
      notifyInApp:      data.notifyInApp ?? true,
      notificationNote: data.notificationNote ?? null,
      createdById:      req.user.id,
    },
    select: RULE_SELECT,
  });

  res.status(201).json({ rule });
});

// PUT /api/escalation-rules/:id
router.put("/:id", requireAuth, requirePermission("ticket_types.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const data = validate(updateRuleSchema, req.body, res);
  if (!data) return;

  const rule = await prisma.escalationRule.update({
    where: { id },
    data: {
      ...(data.name             !== undefined && { name: data.name }),
      ...(data.conditions       !== undefined && { conditions: data.conditions as any }),
      ...(data.conditionLogic   !== undefined && { conditionLogic: data.conditionLogic }),
      ...(data.escalateToTeamId !== undefined && { escalateToTeamId: data.escalateToTeamId }),
      ...(data.escalateToUserId !== undefined && { escalateToUserId: data.escalateToUserId }),
      ...(data.position         !== undefined && { position: data.position }),
      ...(data.isActive         !== undefined && { isActive: data.isActive }),
      ...(data.notifyByEmail    !== undefined && { notifyByEmail: data.notifyByEmail }),
      ...(data.notifyInApp      !== undefined && { notifyInApp: data.notifyInApp }),
      ...(data.notificationNote !== undefined && { notificationNote: data.notificationNote }),
    },
    select: RULE_SELECT,
  });

  res.json({ rule });
});

// DELETE /api/escalation-rules/:id
router.delete("/:id", requireAuth, requirePermission("ticket_types.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  await prisma.escalationRule.delete({ where: { id } });
  res.status(204).end();
});

export default router;
