/**
 * /api/routing — Assignment & Capacity Routing configuration endpoints.
 *
 * Provides admin management of per-team routing strategies and per-agent
 * capacity profiles. Routing decisions are logged automatically by the
 * routing service and accessible via the decisions endpoint.
 *
 * Endpoints:
 *   GET    /api/routing/teams                   — list all teams with routing config
 *   GET    /api/routing/teams/:id               — get single team routing config
 *   PATCH  /api/routing/teams/:id               — update team routing config
 *   DELETE /api/routing/teams/:id               — reset team routing config to defaults
 *
 *   GET    /api/routing/agents                  — list all agents with capacity profiles
 *   GET    /api/routing/agents/:id              — get single agent capacity profile
 *   PATCH  /api/routing/agents/:id              — update agent capacity profile
 *
 *   GET    /api/routing/decisions               — routing decision audit log
 *   POST   /api/routing/preview                 — preview routing decision (dry-run)
 */

import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import { routeToAgent } from "../lib/assignment-routing";
import prisma from "../db";

// ── Routing global config key ─────────────────────────────────────────────────
const ROUTING_SETTINGS_KEY = "routing_global";

const router = Router();

// ── Schemas ───────────────────────────────────────────────────────────────────

const updateTeamRoutingSchema = z.object({
  strategy:        z.enum(["round_robin", "weighted_rr", "least_loaded", "skill_based", "manual"]).optional(),
  respectCapacity: z.boolean().optional(),
  respectShifts:   z.boolean().optional(),
  skillMatchMode:  z.enum(["none", "preferred", "required"]).optional(),
  fallbackAgentId: z.string().nullable().optional(),
  fallbackTeamId:  z.number().int().positive().nullable().optional(),
  overflowAt:      z.number().int().min(1).nullable().optional(),
});

const updateAgentCapacitySchema = z.object({
  isAvailable:          z.boolean().optional(),
  maxConcurrentTickets: z.number().int().min(1).max(999).optional(),
  skills:               z.array(z.string().min(1).max(100)).max(50).optional(),
  languages:            z.array(z.string().min(1).max(20)).max(20).optional(),
  timezone:             z.string().max(60).optional(),
  shiftStart:           z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  shiftEnd:             z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  shiftDays:            z.array(z.number().int().min(1).max(7)).max(7).optional(),
  weight:               z.number().int().min(1).max(10).optional(),
  notes:                z.string().max(500).nullable().optional(),
});

const decisionsQuerySchema = z.object({
  teamId:   z.coerce.number().int().positive().optional(),
  agentId:  z.string().optional(),
  ticketId: z.coerce.number().int().positive().optional(),
  limit:    z.coerce.number().int().min(1).max(200).default(50),
  offset:   z.coerce.number().int().min(0).default(0),
});

const previewSchema = z.object({
  teamId:        z.number().int().positive(),
  ticketId:      z.number().int().positive().default(0),
  requiredSkills: z.array(z.string()).default([]),
  strategy:      z.enum(["round_robin", "weighted_rr", "least_loaded", "skill_based", "manual"]).optional(),
});

// ── Global routing config (enabled/disabled toggle) ──────────────────────────

router.get(
  "/config",
  requireAuth,
  requirePermission("automations.view"),
  async (_req, res) => {
    const row = await prisma.systemSetting.findUnique({
      where: { section: ROUTING_SETTINGS_KEY },
      select: { data: true },
    });
    const data = (row?.data ?? {}) as Record<string, unknown>;
    res.json({ autoAssignmentEnabled: data.autoAssignmentEnabled !== false });
  }
);

router.patch(
  "/config",
  requireAuth,
  requirePermission("automations.manage"),
  async (req, res) => {
    const schema = z.object({ autoAssignmentEnabled: z.boolean() });
    const body = validate(schema, req.body, res);
    if (!body) return;

    const existing = await prisma.systemSetting.findUnique({
      where: { section: ROUTING_SETTINGS_KEY },
      select: { data: true },
    });
    const current = (existing?.data ?? {}) as Record<string, unknown>;

    await prisma.systemSetting.upsert({
      where:  { section: ROUTING_SETTINGS_KEY },
      create: { section: ROUTING_SETTINGS_KEY, data: { ...current, autoAssignmentEnabled: body.autoAssignmentEnabled } as any },
      update: { data: { ...current, autoAssignmentEnabled: body.autoAssignmentEnabled } as any },
    });

    res.json({ autoAssignmentEnabled: body.autoAssignmentEnabled });
  }
);

// ── Team routing config ───────────────────────────────────────────────────────

router.get(
  "/teams",
  requireAuth,
  requirePermission("automations.view"),
  async (_req, res) => {
    const teams = await prisma.team.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        color: true,
        _count: { select: { members: true, tickets: true } },
        routingConfig: true,
        members: {
          select: {
            user: {
              select: {
                id: true,
                name: true,
                capacityProfile: {
                  select: {
                    isAvailable: true,
                    maxConcurrentTickets: true,
                    skills: true,
                    weight: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Enrich with current open ticket counts per agent
    const allAgentIds = teams.flatMap((t) => t.members.map((m) => m.user.id));
    const loadCounts = await prisma.ticket.groupBy({
      by: ["assignedToId"],
      where: {
        assignedToId: { in: allAgentIds },
        status: { in: ["open", "in_progress", "escalated"] },
        deletedAt: null,
      },
      _count: { id: true },
    });
    const loadMap = new Map(loadCounts.map((c) => [c.assignedToId!, c._count.id]));

    res.json({
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        memberCount: t._count.members,
        activeTickets: t._count.tickets,
        routingConfig: t.routingConfig,
        agents: t.members.map((m) => ({
          id:                   m.user.id,
          name:                 m.user.name,
          isAvailable:          m.user.capacityProfile?.isAvailable ?? true,
          maxConcurrentTickets: m.user.capacityProfile?.maxConcurrentTickets ?? 10,
          skills:               m.user.capacityProfile?.skills ?? [],
          weight:               m.user.capacityProfile?.weight ?? 1,
          openTickets:          loadMap.get(m.user.id) ?? 0,
        })),
      })),
    });
  }
);

router.get(
  "/teams/:id",
  requireAuth,
  requirePermission("automations.view"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid team ID" }); return; }

    const team = await prisma.team.findUnique({
      where: { id },
      select: { id: true, name: true, color: true, routingConfig: true },
    });
    if (!team) { res.status(404).json({ error: "Team not found" }); return; }

    res.json({ team });
  }
);

router.patch(
  "/teams/:id",
  requireAuth,
  requirePermission("automations.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid team ID" }); return; }

    const data = validate(updateTeamRoutingSchema, req.body, res);
    if (!data) return;

    const team = await prisma.team.findUnique({ where: { id }, select: { id: true } });
    if (!team) { res.status(404).json({ error: "Team not found" }); return; }

    const config = await prisma.teamRoutingConfig.upsert({
      where:  { teamId: id },
      create: { teamId: id, ...data },
      update: data,
    });

    res.json({ config });
  }
);

router.delete(
  "/teams/:id",
  requireAuth,
  requirePermission("automations.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid team ID" }); return; }

    await prisma.teamRoutingConfig.deleteMany({ where: { teamId: id } });
    res.json({ ok: true, message: "Team routing config reset to defaults" });
  }
);

// ── Agent capacity profiles ───────────────────────────────────────────────────

router.get(
  "/agents",
  requireAuth,
  requirePermission("automations.view"),
  async (_req, res) => {
    const users = await prisma.user.findMany({
      where: { deletedAt: null, role: { in: ["admin", "supervisor", "agent"] } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        teamMemberships: { select: { team: { select: { id: true, name: true } } } },
        capacityProfile: true,
        preference: { select: { timezone: true, language: true } },
      },
    });

    // Get open ticket counts per agent
    const loadCounts = await prisma.ticket.groupBy({
      by: ["assignedToId"],
      where: {
        assignedToId: { in: users.map((u) => u.id) },
        status: { in: ["open", "in_progress", "escalated"] },
        deletedAt: null,
      },
      _count: { id: true },
    });
    const loadMap = new Map(loadCounts.map((c) => [c.assignedToId!, c._count.id]));

    res.json({
      agents: users.map((u) => ({
        id:           u.id,
        name:         u.name,
        email:        u.email,
        role:         u.role,
        teams:        u.teamMemberships.map((m) => m.team),
        openTickets:  loadMap.get(u.id) ?? 0,
        capacityProfile: u.capacityProfile ?? null,
        defaultTimezone: u.preference?.timezone ?? "UTC",
        defaultLanguage: u.preference?.language ?? "en",
      })),
    });
  }
);

router.get(
  "/agents/:id",
  requireAuth,
  requirePermission("automations.view"),
  async (req, res) => {
    const userId = req.params.id as string;
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        capacityProfile: true,
      },
    });
    if (!user) { res.status(404).json({ error: "Agent not found" }); return; }
    res.json({ agent: user });
  }
);

router.patch(
  "/agents/:id",
  requireAuth,
  requirePermission("automations.manage"),
  async (req, res) => {
    const userId = req.params.id as string;

    const data = validate(updateAgentCapacitySchema, req.body, res);
    if (!data) return;

    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true } });
    if (!user) { res.status(404).json({ error: "Agent not found" }); return; }

    const profile = await prisma.agentCapacityProfile.upsert({
      where:  { userId },
      create: { userId, ...data },
      update: data,
    });

    res.json({ profile });
  }
);

// ── Routing decision log ──────────────────────────────────────────────────────

router.get(
  "/decisions",
  requireAuth,
  requirePermission("automations.view"),
  async (req, res) => {
    const query = validate(decisionsQuerySchema, req.query, res);
    if (!query) return;

    const where: Record<string, unknown> = {};
    if (query.teamId)   where.teamId          = query.teamId;
    if (query.agentId)  where.selectedAgentId = query.agentId;
    if (query.ticketId) where.ticketId        = query.ticketId;

    const [decisions, total] = await Promise.all([
      prisma.routingDecision.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: query.limit,
        skip: query.offset,
        select: {
          id: true,
          ticketId: true,
          teamId: true,
          strategy: true,
          candidateCount: true,
          eligibleCount: true,
          selectedAgentId: true,
          reason: true,
          skillsRequired: true,
          fallbackUsed: true,
          overflowUsed: true,
          durationMs: true,
          createdAt: true,
        },
      }),
      prisma.routingDecision.count({ where }),
    ]);

    res.json({ decisions, total, limit: query.limit, offset: query.offset });
  }
);

// ── Routing preview (dry-run) ─────────────────────────────────────────────────

router.post(
  "/preview",
  requireAuth,
  requirePermission("automations.test"),
  async (req, res) => {
    const data = validate(previewSchema, req.body, res);
    if (!data) return;

    const result = await routeToAgent(
      data.teamId,
      { ticketId: data.ticketId, requiredSkills: data.requiredSkills },
      data.strategy,
    );

    res.json({ result });
  }
);

export default router;
