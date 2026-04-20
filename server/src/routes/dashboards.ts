import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import { can } from "core/constants/permission.ts";
import {
  createDashboardSchema,
  updateDashboardSchema,
  cloneDashboardSchema,
} from "core/schemas/dashboard.ts";
import prisma from "../db";

const router = Router();
router.use(requireAuth);

// ── Dashboard templates ───────────────────────────────────────────────────────

const DASHBOARD_TEMPLATES = [
  {
    id: "service_desk",
    name: "Service Desk Overview",
    description: "Key ticket KPIs, volume trends, SLA status, and top open tickets — the day-to-day command center.",
    widgets: [
      { id: "volume",           visible: true, order: 0, x: 0,  y: 0,  w: 12, h: 2 },
      { id: "performance",      visible: true, order: 1, x: 0,  y: 2,  w: 6,  h: 3 },
      { id: "sla_by_dimension", visible: true, order: 2, x: 6,  y: 2,  w: 6,  h: 3 },
      { id: "tickets_per_day",  visible: true, order: 3, x: 0,  y: 5,  w: 8,  h: 3 },
      { id: "backlog_trend",    visible: true, order: 4, x: 8,  y: 5,  w: 4,  h: 3 },
      { id: "breakdowns",       visible: true, order: 5, x: 0,  y: 8,  w: 6,  h: 3 },
      { id: "channel_breakdown",visible: true, order: 6, x: 6,  y: 8,  w: 3,  h: 3 },
      { id: "csat",             visible: true, order: 7, x: 9,  y: 8,  w: 3,  h: 3 },
      { id: "top_open_tickets", visible: true, order: 8, x: 0,  y: 11, w: 12, h: 4 },
    ],
    config: { period: 30, density: "comfortable" },
  },
  {
    id: "itsm_operations",
    name: "ITSM Operations",
    description: "Incidents, problems, changes, and service requests — for IT operations managers.",
    widgets: [
      { id: "incident_analytics",    visible: true, order: 0, x: 0,  y: 0,  w: 6,  h: 3 },
      { id: "request_fulfillment",   visible: true, order: 1, x: 6,  y: 0,  w: 6,  h: 3 },
      { id: "problem_recurrence",    visible: true, order: 2, x: 0,  y: 3,  w: 6,  h: 3 },
      { id: "approval_turnaround",   visible: true, order: 3, x: 6,  y: 3,  w: 6,  h: 3 },
      { id: "volume",                visible: true, order: 4, x: 0,  y: 6,  w: 12, h: 2 },
      { id: "sla_by_dimension",      visible: true, order: 5, x: 0,  y: 8,  w: 12, h: 3 },
    ],
    config: { period: 30, density: "comfortable" },
  },
  {
    id: "manager_view",
    name: "Manager View",
    description: "SLA compliance, CSAT trends, agent leaderboard, and team performance at a glance.",
    widgets: [
      { id: "performance",      visible: true, order: 0, x: 0,  y: 0,  w: 12, h: 2 },
      { id: "csat_trend",       visible: true, order: 1, x: 0,  y: 2,  w: 6,  h: 3 },
      { id: "fcr_rate",         visible: true, order: 2, x: 6,  y: 2,  w: 3,  h: 3 },
      { id: "csat",             visible: true, order: 3, x: 9,  y: 2,  w: 3,  h: 3 },
      { id: "sla_by_dimension", visible: true, order: 4, x: 0,  y: 5,  w: 8,  h: 3 },
      { id: "resolution_dist",  visible: true, order: 5, x: 8,  y: 5,  w: 4,  h: 3 },
      { id: "agent_leaderboard",visible: true, order: 6, x: 0,  y: 8,  w: 6,  h: 4 },
      { id: "by_assignee",      visible: true, order: 7, x: 6,  y: 8,  w: 6,  h: 4 },
    ],
    config: { period: 30, density: "comfortable" },
  },
  {
    id: "agent_performance",
    name: "Agent Performance",
    description: "Per-agent resolution speed, SLA compliance, CSAT scores, and current workload.",
    widgets: [
      { id: "agent_leaderboard",visible: true, order: 0, x: 0,  y: 0,  w: 6,  h: 5 },
      { id: "by_assignee",      visible: true, order: 1, x: 6,  y: 0,  w: 6,  h: 5 },
      { id: "resolution_dist",  visible: true, order: 2, x: 0,  y: 5,  w: 6,  h: 3 },
      { id: "csat_trend",       visible: true, order: 3, x: 6,  y: 5,  w: 6,  h: 3 },
      { id: "backlog_trend",    visible: true, order: 4, x: 0,  y: 8,  w: 8,  h: 3 },
      { id: "fcr_rate",         visible: true, order: 5, x: 8,  y: 8,  w: 4,  h: 3 },
    ],
    config: { period: 30, density: "comfortable" },
  },
];

/**
 * GET /api/dashboards/templates
 * Returns predefined dashboard template configs.
 */
router.get("/templates", (req, res) => {
  res.json({ templates: DASHBOARD_TEMPLATES });
});

// ── Shared select projection ───────────────────────────────────────────────────

const DASHBOARD_SELECT = {
  id:               true,
  userId:           true,
  name:             true,
  description:      true,
  isShared:         true,
  visibilityTeamId: true,
  sourceId:         true,
  config:           true,
  createdAt:        true,
  updatedAt:        true,
  visibilityTeam:   { select: { id: true, name: true, color: true } },
} as const;

// ── List ──────────────────────────────────────────────────────────────────────
// GET /api/dashboards
// Returns:
//   personal       — dashboards owned by this user
//   shared         — isShared=true (admin-published, org-wide)
//   teamVisible    — visibilityTeamId matches one of the user's team memberships
//   defaultDashboardId — currently-active dashboard (from UserPreference)

router.get("/", async (req, res) => {
  // Resolve the user's team memberships for team-scoped dashboards
  const memberships = await prisma.teamMember.findMany({
    where: { userId: req.user.id },
    select: { teamId: true },
  });
  const teamIds = memberships.map((m) => m.teamId);

  const [personal, shared, teamVisible, pref] = await Promise.all([
    prisma.dashboardConfig.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "asc" },
      select: DASHBOARD_SELECT,
    }),
    prisma.dashboardConfig.findMany({
      where: { isShared: true },
      orderBy: { createdAt: "asc" },
      select: DASHBOARD_SELECT,
    }),
    teamIds.length > 0
      ? prisma.dashboardConfig.findMany({
          where: {
            visibilityTeamId: { in: teamIds },
            isShared: false,
            // Exclude dashboards already owned by this user (they appear under personal)
            NOT: { userId: req.user.id },
          },
          orderBy: { createdAt: "asc" },
          select: DASHBOARD_SELECT,
        })
      : Promise.resolve([]),
    prisma.userPreference.findUnique({
      where: { userId: req.user.id },
      select: { defaultDashboard: true },
    }),
  ]);

  const raw = pref?.defaultDashboard ?? "overview";
  const defaultDashboardId = /^\d+$/.test(raw) ? Number(raw) : null;

  res.json({ personal, shared, teamVisible, defaultDashboardId });
});

// ── Create ────────────────────────────────────────────────────────────────────
// POST /api/dashboards
// dashboard.manage_own required. Only dashboard.manage_shared can set isShared.
// dashboard.share_to_team required to set visibilityTeamId (agents: own teams only).

router.post("/", requirePermission("dashboard.manage_own"), async (req, res) => {
  const data = validate(createDashboardSchema, req.body, res);
  if (!data) return;

  if (data.isShared && !can(req.user.role, "dashboard.manage_shared")) {
    res.status(403).json({ error: "Only admins and supervisors can create shared dashboards" });
    return;
  }
  if (data.visibilityTeamId) {
    if (!can(req.user.role, "dashboard.share_to_team")) {
      res.status(403).json({ error: "You don't have permission to share dashboards to teams" });
      return;
    }
    if (!can(req.user.role, "dashboard.manage_shared")) {
      // Agents can only share to teams they belong to
      const membership = await prisma.teamMember.findFirst({
        where: { userId: req.user.id, teamId: data.visibilityTeamId },
      });
      if (!membership) {
        res.status(403).json({ error: "You can only share a dashboard with a team you belong to" });
        return;
      }
    }
  }

  // Validate referenced team exists
  if (data.visibilityTeamId) {
    const team = await prisma.team.findUnique({ where: { id: data.visibilityTeamId } });
    if (!team) { res.status(400).json({ error: "Team not found" }); return; }
  }

  const dashboard = await prisma.dashboardConfig.create({
    data: {
      userId:           req.user.id,
      name:             data.name,
      description:      data.description ?? null,
      isShared:         data.isShared,
      visibilityTeamId: data.visibilityTeamId ?? null,
      config:           data.config as object,
    },
    select: DASHBOARD_SELECT,
  });

  if (data.setAsDefault) {
    await prisma.userPreference.upsert({
      where:  { userId: req.user.id },
      create: { userId: req.user.id, defaultDashboard: String(dashboard.id) },
      update: { defaultDashboard: String(dashboard.id) },
    });
  }

  res.status(201).json({ dashboard });
});

// ── Get single ────────────────────────────────────────────────────────────────
// GET /api/dashboards/:id

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid dashboard ID" }); return; }

  const dashboard = await prisma.dashboardConfig.findUnique({
    where: { id },
    select: DASHBOARD_SELECT,
  });
  if (!dashboard) { res.status(404).json({ error: "Dashboard not found" }); return; }

  // Check access: own, shared, or team-visible
  const isOwn    = dashboard.userId === req.user.id;
  const isShared = dashboard.isShared;
  let   isTeam   = false;
  if (dashboard.visibilityTeamId) {
    const m = await prisma.teamMember.findFirst({
      where: { userId: req.user.id, teamId: dashboard.visibilityTeamId },
    });
    isTeam = !!m;
  }

  if (!isOwn && !isShared && !isTeam) {
    res.status(404).json({ error: "Dashboard not found" }); return;
  }

  res.json({ dashboard });
});

// ── Update ────────────────────────────────────────────────────────────────────
// PUT /api/dashboards/:id
// Owners can update name, description, config, visibilityTeamId.
// Only dashboard.manage_shared can toggle isShared.

router.put("/:id", requirePermission("dashboard.manage_own"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid dashboard ID" }); return; }

  const data = validate(updateDashboardSchema, req.body, res);
  if (!data) return;

  const existing = await prisma.dashboardConfig.findUnique({ where: { id } });
  if (!existing || existing.userId !== req.user.id) {
    res.status(404).json({ error: "Dashboard not found" }); return;
  }

  if (data.isShared !== undefined && !can(req.user.role, "dashboard.manage_shared")) {
    res.status(403).json({ error: "Only admins and supervisors can change sharing settings" });
    return;
  }

  if (data.visibilityTeamId) {
    if (!can(req.user.role, "dashboard.share_to_team")) {
      res.status(403).json({ error: "You don't have permission to share dashboards to teams" });
      return;
    }
    if (!can(req.user.role, "dashboard.manage_shared")) {
      // Agents can only share to teams they belong to
      const membership = await prisma.teamMember.findFirst({
        where: { userId: req.user.id, teamId: data.visibilityTeamId },
      });
      if (!membership) {
        res.status(403).json({ error: "You can only share a dashboard with a team you belong to" });
        return;
      }
    }
  }

  // Validate referenced team
  if (data.visibilityTeamId) {
    const team = await prisma.team.findUnique({ where: { id: data.visibilityTeamId } });
    if (!team) { res.status(400).json({ error: "Team not found" }); return; }
  }

  const dashboard = await prisma.dashboardConfig.update({
    where: { id },
    data: {
      ...(data.name             !== undefined && { name: data.name }),
      ...(data.description      !== undefined && { description: data.description }),
      ...(data.config           !== undefined && { config: data.config as object }),
      ...(data.isShared         !== undefined && { isShared: data.isShared }),
      ...(data.visibilityTeamId !== undefined && { visibilityTeamId: data.visibilityTeamId }),
    },
    select: DASHBOARD_SELECT,
  });

  res.json({ dashboard });
});

// ── Delete ────────────────────────────────────────────────────────────────────
// DELETE /api/dashboards/:id
// Owners can delete their own dashboards.
// dashboard.manage_shared holders (admin/supervisor) can delete any dashboard.

router.delete("/:id", requirePermission("dashboard.manage_own"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid dashboard ID" }); return; }

  const existing = await prisma.dashboardConfig.findUnique({ where: { id } });
  const canManageAny = can(req.user.role, "dashboard.manage_shared");
  if (!existing || (!canManageAny && existing.userId !== req.user.id)) {
    res.status(404).json({ error: "Dashboard not found" }); return;
  }

  await prisma.dashboardConfig.delete({ where: { id } });

  // Reset any user whose default was this dashboard
  await prisma.userPreference.updateMany({
    where: { defaultDashboard: String(id) },
    data:  { defaultDashboard: "overview" },
  });

  res.status(204).send();
});

// ── Set as default ────────────────────────────────────────────────────────────
// POST /api/dashboards/:id/set-default

router.post("/:id/set-default", requirePermission("dashboard.manage_own"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid dashboard ID" }); return; }

  const dashboard = await prisma.dashboardConfig.findUnique({
    where: { id },
    select: { id: true, userId: true, isShared: true, visibilityTeamId: true },
  });
  if (!dashboard) { res.status(404).json({ error: "Dashboard not found" }); return; }

  const isOwn    = dashboard.userId === req.user.id;
  const isShared = dashboard.isShared;
  let   isTeam   = false;
  if (dashboard.visibilityTeamId) {
    const m = await prisma.teamMember.findFirst({
      where: { userId: req.user.id, teamId: dashboard.visibilityTeamId },
    });
    isTeam = !!m;
  }
  if (!isOwn && !isShared && !isTeam) {
    res.status(404).json({ error: "Dashboard not found" }); return;
  }

  await prisma.userPreference.upsert({
    where:  { userId: req.user.id },
    create: { userId: req.user.id, defaultDashboard: String(id) },
    update: { defaultDashboard: String(id) },
  });

  res.json({ ok: true });
});

// ── Clone ─────────────────────────────────────────────────────────────────────
// POST /api/dashboards/:id/clone
// Creates a personal copy of any accessible dashboard.

router.post("/:id/clone", requirePermission("dashboard.manage_own"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid dashboard ID" }); return; }

  const data = validate(cloneDashboardSchema, req.body, res);
  if (!data) return;

  const source = await prisma.dashboardConfig.findUnique({
    where: { id },
    select: { id: true, userId: true, name: true, description: true, isShared: true, visibilityTeamId: true, config: true },
  });
  if (!source) { res.status(404).json({ error: "Dashboard not found" }); return; }

  const isOwn    = source.userId === req.user.id;
  const isShared = source.isShared;
  let   isTeam   = false;
  if (source.visibilityTeamId) {
    const m = await prisma.teamMember.findFirst({
      where: { userId: req.user.id, teamId: source.visibilityTeamId },
    });
    isTeam = !!m;
  }
  if (!isOwn && !isShared && !isTeam) {
    res.status(404).json({ error: "Dashboard not found" }); return;
  }

  const clonedName = data.name ?? `${source.name} (Copy)`;

  const cloned = await prisma.dashboardConfig.create({
    data: {
      userId:      req.user.id,
      name:        clonedName,
      description: source.description,
      isShared:    false,
      sourceId:    id,
      config:      source.config as object,
    },
    select: DASHBOARD_SELECT,
  });

  if (data.setAsDefault) {
    await prisma.userPreference.upsert({
      where:  { userId: req.user.id },
      create: { userId: req.user.id, defaultDashboard: String(cloned.id) },
      update: { defaultDashboard: String(cloned.id) },
    });
  }

  res.status(201).json({ dashboard: cloned });
});

export default router;
