/**
 * /api/duty-plans — Shift scheduling / duty plan endpoints.
 *
 * Role model:
 *   admin          — full access to all teams, can grant/revoke manager roles
 *   DutyPlanRole.manager   — can create/edit plans & grant mandate for their team
 *   DutyPlanRole.mandated  — can create/edit plans for their team
 *   everyone else  — can view published plans for teams they belong to
 *
 * Endpoints:
 *   GET  /api/duty-plans              list plans (filter: teamId, status)
 *   POST /api/duty-plans              create plan
 *   GET  /api/duty-plans/on-duty      agents currently on duty for a team
 *   GET  /api/duty-plans/roles        list duty-plan roles
 *   POST /api/duty-plans/roles        grant a role
 *   DEL  /api/duty-plans/roles/:id    revoke a role
 *   GET  /api/duty-plans/:id          get plan (with shifts + assignments)
 *   PATCH /api/duty-plans/:id         update plan metadata
 *   DEL  /api/duty-plans/:id          delete plan (draft only)
 *   POST /api/duty-plans/:id/publish  publish plan
 *   POST /api/duty-plans/:id/archive  archive plan
 *   POST /api/duty-plans/:id/shifts   create shift
 *   PATCH /api/duty-plans/:id/shifts/:shiftId  update shift
 *   DEL  /api/duty-plans/:id/shifts/:shiftId   delete shift
 *   PUT  /api/duty-plans/:id/assignments       upsert assignment
 *   DEL  /api/duty-plans/:id/assignments/:aid  remove assignment
 */

import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../middleware/require-auth";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import prisma from "../db";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the duty-plan role (or null) for the current user on a given team. */
async function getMyRole(userId: string, teamId: number) {
  return prisma.dutyPlanRole.findUnique({
    where: { teamId_userId: { teamId, userId } },
    select: { roleType: true },
  });
}

/** Returns true if the user can edit a team's duty plans. */
async function canEdit(userId: string, userRole: string, teamId: number) {
  if (userRole === "admin") return true;
  const role = await getMyRole(userId, teamId);
  return role?.roleType === "manager" || role?.roleType === "mandated";
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const createPlanSchema = z.object({
  teamId:      z.number().int().positive(),
  title:       z.string().min(1).max(200),
  periodStart: z.string().datetime(),
  periodEnd:   z.string().datetime(),
  is24x7:      z.boolean().default(false),
  notes:       z.string().max(2000).optional(),
});

const updatePlanSchema = createPlanSchema.omit({ teamId: true }).partial();

const createShiftSchema = z.object({
  name:      z.string().min(1).max(100),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime:   z.string().regex(/^\d{2}:\d{2}$/),
  color:     z.string().default("#3B82F6"),
  order:     z.number().int().min(0).default(0),
});

const upsertAssignmentSchema = z.object({
  shiftId:       z.number().int().positive(),
  agentId:       z.string().min(1),
  date:          z.string().datetime(),
  isShiftLeader: z.boolean().default(false),
  notes:         z.string().max(500).optional(),
});

const grantRoleSchema = z.object({
  teamId:   z.number().int().positive(),
  userId:   z.string().min(1),
  roleType: z.enum(["manager", "mandated"]),
});

const PLAN_SELECT = {
  id: true, teamId: true, title: true, periodStart: true, periodEnd: true,
  is24x7: true, status: true, notes: true, createdAt: true, updatedAt: true,
  createdBy: { select: { id: true, name: true } },
  team:      { select: { id: true, name: true, color: true } },
  _count:    { select: { assignments: true } },
} as const;

// ── GET /api/duty-plans ───────────────────────────────────────────────────────

router.get("/", requireAuth, async (req, res) => {
  const teamId = req.query.teamId ? Number(req.query.teamId) : undefined;
  const status = req.query.status as string | undefined;

  const where: Record<string, unknown> = {};
  if (teamId) where.teamId = teamId;
  if (status) where.status = status;

  // Non-admins can only see plans for teams they're on
  if (req.user.role !== "admin" && req.user.role !== "supervisor") {
    const myTeams = await prisma.teamMember.findMany({
      where: { userId: req.user.id },
      select: { teamId: true },
    });
    const myTeamIds = myTeams.map((t) => t.teamId);
    where.teamId = teamId ? (myTeamIds.includes(teamId) ? teamId : -1) : { in: myTeamIds };
  }

  const plans = await prisma.dutyPlan.findMany({
    where,
    orderBy: [{ periodStart: "desc" }],
    select: PLAN_SELECT,
  });

  res.json({ plans });
});

// ── GET /api/duty-plans/on-duty ───────────────────────────────────────────────

router.get("/on-duty", requireAuth, async (req, res) => {
  const teamId = req.query.teamId ? Number(req.query.teamId) : undefined;
  if (!teamId) { res.status(400).json({ error: "teamId required" }); return; }

  const agents = await getAgentsOnDutyNow(teamId);
  res.json({ agents, teamId });
});

export async function getAgentsOnDutyNow(teamId: number): Promise<string[] | null> {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayEnd   = new Date(todayStart.getTime() + 86_400_000 - 1);

  // Find published plan covering today
  const plan = await prisma.dutyPlan.findFirst({
    where: {
      teamId,
      status: "published",
      periodStart: { lte: todayEnd },
      periodEnd:   { gte: todayStart },
    },
    select: { id: true },
  });

  if (!plan) return null;

  // Get assignments for today
  const assignments = await prisma.dutyAssignment.findMany({
    where: {
      planId: plan.id,
      date: { gte: todayStart, lte: todayEnd },
    },
    include: { shift: { select: { startTime: true, endTime: true } } },
  });

  if (assignments.length === 0) return [];

  const currentHHMM = `${String(now.getUTCHours()).padStart(2,"0")}:${String(now.getUTCMinutes()).padStart(2,"0")}`;

  const agentsOnDuty = new Set<string>();
  for (const a of assignments) {
    const { startTime, endTime } = a.shift;
    const crossesMidnight = endTime <= startTime;
    const onShift = crossesMidnight
      ? (currentHHMM >= startTime || currentHHMM < endTime)
      : (currentHHMM >= startTime && currentHHMM < endTime);
    if (onShift) agentsOnDuty.add(a.agentId);
  }

  return [...agentsOnDuty];
}

// ── GET /api/duty-plans/roles ─────────────────────────────────────────────────

router.get("/roles", requireAuth, async (req, res) => {
  const teamId = req.query.teamId ? Number(req.query.teamId) : undefined;
  const where: Record<string, unknown> = {};
  if (teamId) where.teamId = teamId;

  const roles = await prisma.dutyPlanRole.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true, teamId: true, roleType: true, createdAt: true,
      user:      { select: { id: true, name: true, email: true } },
      team:      { select: { id: true, name: true, color: true } },
      grantedBy: { select: { id: true, name: true } },
    },
  });

  res.json({ roles });
});

// ── POST /api/duty-plans/roles ────────────────────────────────────────────────

router.post("/roles", requireAuth, async (req, res) => {
  const body = validate(grantRoleSchema, req.body, res);
  if (!body) return;

  // Admins can grant manager; managers can grant mandated
  if (req.user.role !== "admin") {
    if (body.roleType === "manager") {
      res.status(403).json({ error: "Only admins can grant manager roles" }); return;
    }
    const myRole = await getMyRole(req.user.id, body.teamId);
    if (myRole?.roleType !== "manager") {
      res.status(403).json({ error: "Only duty plan managers can grant mandate" }); return;
    }
  }

  // Verify user is a team member
  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: body.teamId, userId: body.userId } },
  });
  if (!member) { res.status(400).json({ error: "User is not a member of this team" }); return; }

  const role = await prisma.dutyPlanRole.upsert({
    where:  { teamId_userId: { teamId: body.teamId, userId: body.userId } },
    create: { teamId: body.teamId, userId: body.userId, roleType: body.roleType, grantedById: req.user.id },
    update: { roleType: body.roleType, grantedById: req.user.id },
    select: { id: true, teamId: true, roleType: true, user: { select: { id: true, name: true } } },
  });

  res.status(201).json({ role });
});

// ── DELETE /api/duty-plans/roles/:id ─────────────────────────────────────────

router.delete("/roles/:id", requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid role ID" }); return; }

  const existing = await prisma.dutyPlanRole.findUnique({
    where: { id },
    select: { id: true, teamId: true, roleType: true },
  });
  if (!existing) { res.status(404).json({ error: "Role not found" }); return; }

  if (req.user.role !== "admin") {
    if (existing.roleType === "manager") {
      res.status(403).json({ error: "Only admins can revoke manager roles" }); return;
    }
    const myRole = await getMyRole(req.user.id, existing.teamId);
    if (myRole?.roleType !== "manager") {
      res.status(403).json({ error: "Only duty plan managers can revoke mandate" }); return;
    }
  }

  await prisma.dutyPlanRole.delete({ where: { id } });
  res.json({ ok: true });
});

// ── POST /api/duty-plans ──────────────────────────────────────────────────────

router.post("/", requireAuth, async (req, res) => {
  const body = validate(createPlanSchema, req.body, res);
  if (!body) return;

  if (!(await canEdit(req.user.id, req.user.role, body.teamId))) {
    res.status(403).json({ error: "Not authorized to manage duty plans for this team" }); return;
  }

  const plan = await prisma.dutyPlan.create({
    data: {
      teamId:      body.teamId,
      title:       body.title,
      periodStart: new Date(body.periodStart),
      periodEnd:   new Date(body.periodEnd),
      is24x7:      body.is24x7,
      notes:       body.notes ?? null,
      createdById: req.user.id,
    },
    select: PLAN_SELECT,
  });

  res.status(201).json({ plan });
});

// ── GET /api/duty-plans/:id ───────────────────────────────────────────────────

router.get("/:id", requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid plan ID" }); return; }

  const plan = await prisma.dutyPlan.findUnique({
    where: { id },
    include: {
      team:      { select: { id: true, name: true, color: true } },
      createdBy: { select: { id: true, name: true } },
      shifts: { orderBy: { order: "asc" } },
      assignments: {
        include: {
          agent: { select: { id: true, name: true } },
          shift: { select: { id: true, name: true, color: true } },
        },
        orderBy: { date: "asc" },
      },
    },
  });

  if (!plan) { res.status(404).json({ error: "Duty plan not found" }); return; }
  res.json({ plan });
});

// ── PATCH /api/duty-plans/:id ─────────────────────────────────────────────────

router.patch("/:id", requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid plan ID" }); return; }

  const existing = await prisma.dutyPlan.findUnique({ where: { id }, select: { teamId: true, status: true } });
  if (!existing) { res.status(404).json({ error: "Duty plan not found" }); return; }
  if (!(await canEdit(req.user.id, req.user.role, existing.teamId))) {
    res.status(403).json({ error: "Not authorized" }); return;
  }

  const body = validate(updatePlanSchema, req.body, res);
  if (!body) return;

  const plan = await prisma.dutyPlan.update({
    where: { id },
    data: {
      ...(body.title       !== undefined && { title: body.title }),
      ...(body.periodStart !== undefined && { periodStart: new Date(body.periodStart) }),
      ...(body.periodEnd   !== undefined && { periodEnd:   new Date(body.periodEnd) }),
      ...(body.is24x7      !== undefined && { is24x7: body.is24x7 }),
      ...(body.notes       !== undefined && { notes: body.notes }),
    },
    select: PLAN_SELECT,
  });

  res.json({ plan });
});

// ── DELETE /api/duty-plans/:id ────────────────────────────────────────────────

router.delete("/:id", requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid plan ID" }); return; }

  const existing = await prisma.dutyPlan.findUnique({ where: { id }, select: { teamId: true, status: true } });
  if (!existing) { res.status(404).json({ error: "Duty plan not found" }); return; }
  if (!(await canEdit(req.user.id, req.user.role, existing.teamId))) {
    res.status(403).json({ error: "Not authorized" }); return;
  }
  if (existing.status === "published") {
    res.status(409).json({ error: "Cannot delete a published plan. Archive it first." }); return;
  }

  await prisma.dutyPlan.delete({ where: { id } });
  res.json({ ok: true });
});

// ── POST /api/duty-plans/:id/publish ─────────────────────────────────────────

router.post("/:id/publish", requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid plan ID" }); return; }
  const existing = await prisma.dutyPlan.findUnique({ where: { id }, select: { teamId: true, status: true } });
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canEdit(req.user.id, req.user.role, existing.teamId))) {
    res.status(403).json({ error: "Not authorized" }); return;
  }
  const plan = await prisma.dutyPlan.update({
    where: { id }, data: { status: "published" }, select: PLAN_SELECT,
  });
  res.json({ plan });
});

// ── POST /api/duty-plans/:id/archive ─────────────────────────────────────────

router.post("/:id/archive", requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid plan ID" }); return; }
  const existing = await prisma.dutyPlan.findUnique({ where: { id }, select: { teamId: true } });
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canEdit(req.user.id, req.user.role, existing.teamId))) {
    res.status(403).json({ error: "Not authorized" }); return;
  }
  const plan = await prisma.dutyPlan.update({
    where: { id }, data: { status: "archived" }, select: PLAN_SELECT,
  });
  res.json({ plan });
});

// ── POST /api/duty-plans/:id/shifts ──────────────────────────────────────────

router.post("/:id/shifts", requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid plan ID" }); return; }
  const plan = await prisma.dutyPlan.findUnique({ where: { id }, select: { teamId: true } });
  if (!plan) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canEdit(req.user.id, req.user.role, plan.teamId))) {
    res.status(403).json({ error: "Not authorized" }); return;
  }

  const body = validate(createShiftSchema, req.body, res);
  if (!body) return;

  const shift = await prisma.dutyShift.create({
    data: { planId: id, ...body },
  });
  res.status(201).json({ shift });
});

// ── PATCH /api/duty-plans/:id/shifts/:shiftId ─────────────────────────────────

router.patch("/:id/shifts/:shiftId", requireAuth, async (req, res) => {
  const id      = parseId(req.params.id);
  const shiftId = parseId(req.params.shiftId);
  if (!id || !shiftId) { res.status(400).json({ error: "Invalid ID" }); return; }
  const plan = await prisma.dutyPlan.findUnique({ where: { id }, select: { teamId: true } });
  if (!plan) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canEdit(req.user.id, req.user.role, plan.teamId))) {
    res.status(403).json({ error: "Not authorized" }); return;
  }

  const body = validate(createShiftSchema.partial(), req.body, res);
  if (!body) return;

  const shift = await prisma.dutyShift.update({ where: { id: shiftId, planId: id }, data: body });
  res.json({ shift });
});

// ── DELETE /api/duty-plans/:id/shifts/:shiftId ────────────────────────────────

router.delete("/:id/shifts/:shiftId", requireAuth, async (req, res) => {
  const id      = parseId(req.params.id);
  const shiftId = parseId(req.params.shiftId);
  if (!id || !shiftId) { res.status(400).json({ error: "Invalid ID" }); return; }
  const plan = await prisma.dutyPlan.findUnique({ where: { id }, select: { teamId: true } });
  if (!plan) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canEdit(req.user.id, req.user.role, plan.teamId))) {
    res.status(403).json({ error: "Not authorized" }); return;
  }
  await prisma.dutyShift.delete({ where: { id: shiftId, planId: id } });
  res.json({ ok: true });
});

// ── PUT /api/duty-plans/:id/assignments ───────────────────────────────────────

router.put("/:id/assignments", requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid plan ID" }); return; }
  const plan = await prisma.dutyPlan.findUnique({ where: { id }, select: { teamId: true } });
  if (!plan) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canEdit(req.user.id, req.user.role, plan.teamId))) {
    res.status(403).json({ error: "Not authorized" }); return;
  }

  const body = validate(upsertAssignmentSchema, req.body, res);
  if (!body) return;

  const date = new Date(body.date);
  date.setUTCHours(0, 0, 0, 0);

  const assignment = await prisma.dutyAssignment.upsert({
    where: { shiftId_agentId_date: { shiftId: body.shiftId, agentId: body.agentId, date } },
    create: { planId: id, shiftId: body.shiftId, agentId: body.agentId, date, isShiftLeader: body.isShiftLeader, notes: body.notes ?? null },
    update: { isShiftLeader: body.isShiftLeader, notes: body.notes ?? null },
    include: { agent: { select: { id: true, name: true } }, shift: { select: { id: true, name: true, color: true } } },
  });

  res.status(201).json({ assignment });
});

// ── DELETE /api/duty-plans/:id/assignments/:aid ───────────────────────────────

router.delete("/:id/assignments/:aid", requireAuth, async (req, res) => {
  const id  = parseId(req.params.id);
  const aid = parseId(req.params.aid);
  if (!id || !aid) { res.status(400).json({ error: "Invalid ID" }); return; }
  const plan = await prisma.dutyPlan.findUnique({ where: { id }, select: { teamId: true } });
  if (!plan) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canEdit(req.user.id, req.user.role, plan.teamId))) {
    res.status(403).json({ error: "Not authorized" }); return;
  }
  await prisma.dutyAssignment.delete({ where: { id: aid, planId: id } });
  res.json({ ok: true });
});

export default router;
