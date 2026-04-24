/**
 * /api/automations — Enterprise Automation Rule endpoints.
 *
 * Automation rules are organized into 9 categories covering the full
 * service-desk automation lifecycle. Only admins can manage rules;
 * supervisors can view rules and manually test them.
 *
 * Endpoints:
 *   GET    /api/automations                    — list rules (optionally filtered by category)
 *   POST   /api/automations                    — create rule
 *   GET    /api/automations/:id               — fetch single rule with execution stats
 *   PATCH  /api/automations/:id               — update rule
 *   DELETE /api/automations/:id               — delete rule
 *   PATCH  /api/automations/:id/toggle        — enable / disable rule
 *   POST   /api/automations/reorder           — reorder rules within a category
 *   POST   /api/automations/:id/test          — dry-run against a specific entity
 *   GET    /api/automations/:id/executions    — execution history for a rule
 *   GET    /api/automations/categories        — category metadata
 */

import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import {
  createAutomationRuleSchema,
  updateAutomationRuleSchema,
  listAutomationRulesQuerySchema,
  reorderAutomationRulesSchema,
} from "core/schemas/automations";
import { AUTOMATION_CATEGORIES } from "core/constants/automation";
import { runAutomationEngine } from "../lib/automation-engine";
import prisma from "../db";

const router = Router();

const RULE_SELECT = {
  id: true,
  name: true,
  description: true,
  category: true,
  isEnabled: true,
  order: true,
  triggers: true,
  conditions: true,
  actions: true,
  runOnce: true,
  stopOnMatch: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
  _count: { select: { executions: true } },
  // Last execution — shows recency and last-run status in the rule list
  executions: {
    orderBy: { startedAt: "desc" as const },
    take: 1,
    select: { id: true, status: true, startedAt: true, completedAt: true },
  },
} as const;

// ── GET /api/automations/categories ──────────────────────────────────────────

router.get(
  "/categories",
  requireAuth,
  requirePermission("automations.view"),
  async (_req, res) => {
    res.json({ categories: AUTOMATION_CATEGORIES });
  }
);

// ── GET /api/automations/executions  (global execution log, all rules) ────────

router.get(
  "/executions",
  requireAuth,
  requirePermission("automations.view"),
  async (req, res) => {
    const limit    = Math.min(Number(req.query.limit)    || 50, 200);
    const offset   = Number(req.query.offset) || 0;
    const ruleId   = req.query.ruleId   ? Number(req.query.ruleId)   : undefined;
    const category = req.query.category as string | undefined;
    const status   = req.query.status   as string | undefined;
    const trigger  = req.query.trigger  as string | undefined;

    const where: Record<string, unknown> = {};
    if (ruleId) where.ruleId = ruleId;
    if (status) where.status = status;
    if (trigger) where.trigger = trigger;
    if (category) {
      where.rule = { category };
    }

    const [executions, total] = await Promise.all([
      prisma.automationExecution.findMany({
        where,
        orderBy: { startedAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          ruleId: true,
          entityType: true,
          entityId: true,
          trigger: true,
          status: true,
          startedAt: true,
          completedAt: true,
          rule: { select: { id: true, name: true, category: true } },
          steps: {
            orderBy: { id: "asc" },
            select: {
              id: true, actionType: true, applied: true,
              skippedReason: true, errorMessage: true,
            },
          },
        },
      }),
      prisma.automationExecution.count({ where }),
    ]);

    res.json({ executions, total, limit, offset });
  }
);

// ── GET /api/automations/governance  (rule change history for audit UI) ───────

router.get(
  "/governance",
  requireAuth,
  requirePermission("automations.view"),
  async (req, res) => {
    const limit    = Math.min(Number(req.query.limit)  || 50, 200);
    const offset   = Number(req.query.offset) || 0;
    const category = req.query.category as string | undefined;
    const q        = req.query.q        as string | undefined;

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    const [rules, total] = await Promise.all([
      prisma.automationRule.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: limit,
        skip: offset,
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          isEnabled: true,
          version: true,
          order: true,
          createdAt: true,
          updatedAt: true,
          createdBy: { select: { id: true, name: true } },
          updatedBy: { select: { id: true, name: true } },
          _count: { select: { executions: true } },
        },
      }),
      prisma.automationRule.count({ where }),
    ]);

    res.json({ rules, total, limit, offset });
  }
);

// ── GET /api/automations ──────────────────────────────────────────────────────

router.get(
  "/",
  requireAuth,
  requirePermission("automations.view"),
  async (req, res) => {
    const query = validate(listAutomationRulesQuerySchema, req.query, res);
    if (!query) return;

    const where: Record<string, unknown> = {};
    if (query.category) where.category = query.category;
    if (query.isEnabled !== undefined) where.isEnabled = query.isEnabled === "true";
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: "insensitive" } },
        { description: { contains: query.q, mode: "insensitive" } },
      ];
    }

    const [rules, total] = await Promise.all([
      prisma.automationRule.findMany({
        where,
        orderBy: [{ order: "asc" }, { id: "asc" }],
        take: query.limit,
        skip: query.offset,
        select: RULE_SELECT,
      }),
      prisma.automationRule.count({ where }),
    ]);

    res.json({ rules, total, limit: query.limit, offset: query.offset });
  }
);

// ── POST /api/automations ─────────────────────────────────────────────────────

router.post(
  "/",
  requireAuth,
  requirePermission("automations.manage"),
  async (req, res) => {
    const data = validate(createAutomationRuleSchema, req.body, res);
    if (!data) return;

    // Default order = max order + 10 within the category
    let order = data.order;
    if (order === 0) {
      const last = await prisma.automationRule.findFirst({
        where: { category: data.category },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      order = last ? last.order + 10 : 10;
    }

    const rule = await prisma.automationRule.create({
      data: {
        name:        data.name,
        description: data.description ?? null,
        category:    data.category,
        isEnabled:   data.isEnabled ?? true,
        order,
        triggers:    data.triggers as any,
        conditions:  (data.conditions ?? {}) as any,
        actions:     data.actions as any,
        runOnce:     data.runOnce ?? false,
        stopOnMatch: data.stopOnMatch ?? true,
        createdById: req.user.id,
        updatedById: req.user.id,
      },
      select: RULE_SELECT,
    });

    res.status(201).json({ rule });
  }
);

// ── GET /api/automations/:id ──────────────────────────────────────────────────

router.get(
  "/:id",
  requireAuth,
  requirePermission("automations.view"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid rule ID" }); return; }

    const rule = await prisma.automationRule.findUnique({ where: { id }, select: RULE_SELECT });
    if (!rule) { res.status(404).json({ error: "Automation rule not found" }); return; }

    res.json({ rule });
  }
);

// ── PATCH /api/automations/:id ────────────────────────────────────────────────

router.patch(
  "/:id",
  requireAuth,
  requirePermission("automations.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid rule ID" }); return; }

    const data = validate(updateAutomationRuleSchema, req.body, res);
    if (!data) return;

    const existing = await prisma.automationRule.findUnique({ where: { id }, select: { id: true } });
    if (!existing) { res.status(404).json({ error: "Automation rule not found" }); return; }

    const rule = await prisma.automationRule.update({
      where: { id },
      data: {
        ...(data.name        !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.category    !== undefined && { category: data.category }),
        ...(data.isEnabled   !== undefined && { isEnabled: data.isEnabled }),
        ...(data.order       !== undefined && { order: data.order }),
        ...(data.triggers    !== undefined && { triggers: data.triggers as any }),
        ...(data.conditions  !== undefined && { conditions: data.conditions as any }),
        ...(data.actions     !== undefined && { actions: data.actions as any }),
        ...(data.runOnce     !== undefined && { runOnce: data.runOnce }),
        ...(data.stopOnMatch !== undefined && { stopOnMatch: data.stopOnMatch }),
        updatedById: req.user.id,
        version: { increment: 1 },
      },
      select: RULE_SELECT,
    });

    res.json({ rule });
  }
);

// ── PATCH /api/automations/:id/toggle ────────────────────────────────────────

router.patch(
  "/:id/toggle",
  requireAuth,
  requirePermission("automations.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid rule ID" }); return; }

    const existing = await prisma.automationRule.findUnique({ where: { id }, select: { isEnabled: true } });
    if (!existing) { res.status(404).json({ error: "Automation rule not found" }); return; }

    const rule = await prisma.automationRule.update({
      where: { id },
      data: { isEnabled: !existing.isEnabled, updatedById: req.user.id },
      select: RULE_SELECT,
    });

    res.json({ rule });
  }
);

// ── DELETE /api/automations/:id ───────────────────────────────────────────────

router.delete(
  "/:id",
  requireAuth,
  requirePermission("automations.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid rule ID" }); return; }

    const existing = await prisma.automationRule.findUnique({ where: { id }, select: { id: true } });
    if (!existing) { res.status(404).json({ error: "Automation rule not found" }); return; }

    await prisma.automationRule.delete({ where: { id } });
    res.json({ ok: true });
  }
);

// ── POST /api/automations/:id/clone ──────────────────────────────────────────

router.post(
  "/:id/clone",
  requireAuth,
  requirePermission("automations.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid rule ID" }); return; }

    const source = await prisma.automationRule.findUnique({ where: { id } });
    if (!source) { res.status(404).json({ error: "Automation rule not found" }); return; }

    // Place clone at end of same category
    const last = await prisma.automationRule.findFirst({
      where: { category: source.category },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const order = last ? last.order + 10 : 10;

    const clone = await prisma.automationRule.create({
      data: {
        name:        `${source.name} (copy)`,
        description: source.description,
        category:    source.category,
        isEnabled:   false,           // clones always start disabled — safety default
        order,
        triggers:    source.triggers  as any,
        conditions:  source.conditions as any,
        actions:     source.actions   as any,
        runOnce:     source.runOnce,
        stopOnMatch: source.stopOnMatch,
        createdById: req.user.id,
        updatedById: req.user.id,
      },
      select: RULE_SELECT,
    });

    res.status(201).json({ rule: clone });
  }
);

// ── POST /api/automations/reorder ────────────────────────────────────────────

router.post(
  "/reorder",
  requireAuth,
  requirePermission("automations.manage"),
  async (req, res) => {
    const data = validate(reorderAutomationRulesSchema, req.body, res);
    if (!data) return;

    // Update order in a transaction: assign order values 10, 20, 30... to preserve gaps
    await prisma.$transaction(
      data.orderedIds.map((ruleId, idx) =>
        prisma.automationRule.updateMany({
          where: { id: ruleId, category: data.category },
          data: { order: (idx + 1) * 10 },
        })
      )
    );

    res.json({ ok: true });
  }
);

// ── POST /api/automations/:id/test ───────────────────────────────────────────
// Dry-run: evaluate the rule against a real entity without persisting execution records.
// Returns: conditionsMatched, action previews.

router.post(
  "/:id/test",
  requireAuth,
  requirePermission("automations.test"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid rule ID" }); return; }

    const { entityId, entityType = "ticket" } = req.body as { entityId?: number; entityType?: string };
    if (!entityId || typeof entityId !== "number") {
      res.status(400).json({ error: "entityId (number) is required" });
      return;
    }

    const rule = await prisma.automationRule.findUnique({ where: { id }, select: { id: true, name: true, triggers: true } });
    if (!rule) { res.status(404).json({ error: "Automation rule not found" }); return; }

    const triggers = rule.triggers as Array<{ type: string }>;
    const trigger = triggers[0]?.type as any;
    if (!trigger) { res.status(422).json({ error: "Rule has no triggers" }); return; }

    const results = await runAutomationEngine({
      trigger,
      entityType: entityType as "ticket",
      entityId,
    });

    res.json({ results });
  }
);

// ── GET /api/automations/:id/executions ──────────────────────────────────────

router.get(
  "/:id/executions",
  requireAuth,
  requirePermission("automations.view"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid rule ID" }); return; }

    const rule = await prisma.automationRule.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!rule) { res.status(404).json({ error: "Automation rule not found" }); return; }

    const limit  = Math.min(Number(req.query.limit)  || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const [executions, total] = await Promise.all([
      prisma.automationExecution.findMany({
        where: { ruleId: id },
        orderBy: { startedAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          entityType: true,
          entityId: true,
          trigger: true,
          status: true,
          startedAt: true,
          completedAt: true,
          steps: {
            orderBy: { id: "asc" },
            select: { id: true, actionType: true, applied: true, skippedReason: true, errorMessage: true, meta: true },
          },
        },
      }),
      prisma.automationExecution.count({ where: { ruleId: id } }),
    ]);

    res.json({ rule, executions, total, limit, offset });
  }
);

export default router;
