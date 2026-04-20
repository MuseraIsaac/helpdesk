import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import prisma from "../db";

const router = Router();

const AGENT_WORKFLOW_STATES = ["open", "in_progress", "resolved", "closed"] as const;
const SLA_BEHAVIORS = ["continue", "on_hold"] as const;

const createStatusConfigSchema = z.object({
  label:         z.string().trim().min(1).max(80),
  color:         z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color"),
  workflowState: z.enum(AGENT_WORKFLOW_STATES).default("open"),
  slaBehavior:   z.enum(SLA_BEHAVIORS).default("continue"),
  position:      z.number().int().min(0).optional(),
});

const updateStatusConfigSchema = z.object({
  label:         z.string().trim().min(1).max(80).optional(),
  color:         z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  workflowState: z.enum(AGENT_WORKFLOW_STATES).optional(),
  slaBehavior:   z.enum(SLA_BEHAVIORS).optional(),
  position:      z.number().int().min(0).optional(),
  isActive:      z.boolean().optional(),
});

// GET /api/ticket-status-configs
router.get("/", requireAuth, async (_req, res) => {
  const configs = await prisma.ticketStatusConfig.findMany({
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, label: true, color: true, workflowState: true,
      slaBehavior: true, position: true, isActive: true, createdAt: true,
      _count: { select: { tickets: true } },
    },
  });
  res.json({ configs });
});

// POST /api/ticket-status-configs
router.post("/", requireAuth, requirePermission("ticket_types.manage"), async (req, res) => {
  const data = validate(createStatusConfigSchema, req.body, res);
  if (!data) return;

  const existing = await prisma.ticketStatusConfig.findUnique({ where: { label: data.label } });
  if (existing) {
    res.status(409).json({ error: "A status with this label already exists" });
    return;
  }

  const config = await prisma.ticketStatusConfig.create({
    data: {
      label:         data.label,
      color:         data.color,
      workflowState: data.workflowState as any,
      slaBehavior:   data.slaBehavior as any,
      position:      data.position ?? 0,
      createdById:   req.user.id,
    },
  });

  res.status(201).json({ config });
});

// PUT /api/ticket-status-configs/:id
router.put("/:id", requireAuth, requirePermission("ticket_types.manage"), async (req, res) => {
  const id = parseId(req.params.id, res);
  if (!id) return;

  const data = validate(updateStatusConfigSchema, req.body, res);
  if (!data) return;

  if (data.label) {
    const clash = await prisma.ticketStatusConfig.findFirst({
      where: { label: data.label, id: { not: id } },
    });
    if (clash) {
      res.status(409).json({ error: "A status with this label already exists" });
      return;
    }
  }

  const config = await prisma.ticketStatusConfig.update({
    where: { id },
    data: {
      ...(data.label         !== undefined && { label: data.label }),
      ...(data.color         !== undefined && { color: data.color }),
      ...(data.workflowState !== undefined && { workflowState: data.workflowState as any }),
      ...(data.slaBehavior   !== undefined && { slaBehavior: data.slaBehavior as any }),
      ...(data.position      !== undefined && { position: data.position }),
      ...(data.isActive      !== undefined && { isActive: data.isActive }),
    },
  });

  res.json({ config });
});

// DELETE /api/ticket-status-configs/:id
router.delete("/:id", requireAuth, requirePermission("ticket_types.manage"), async (req, res) => {
  const id = parseId(req.params.id, res);
  if (!id) return;

  // Clear customStatusId on any tickets using this status before deleting
  await prisma.ticket.updateMany({ where: { customStatusId: id }, data: { customStatusId: null } });
  await prisma.ticketStatusConfig.delete({ where: { id } });

  res.status(204).end();
});

export default router;
