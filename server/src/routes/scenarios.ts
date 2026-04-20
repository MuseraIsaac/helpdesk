/**
 * /api/scenarios — Scenario Automation endpoints.
 *
 * Any agent can create scenarios (scenarios.run). Agents own and manage their
 * own scenarios; admins/supervisors (scenarios.manage) can manage all scenarios.
 *
 * Visibility:
 *   public  — visible to every agent with scenarios.run
 *   team    — visible only to members of the chosen team
 *   private — visible only to the creator
 *
 * Endpoints:
 *   GET    /api/scenarios            — list visible scenarios for the caller
 *   POST   /api/scenarios            — create a scenario (any agent)
 *   PATCH  /api/scenarios/:id        — update own scenario (admin: any scenario)
 *   DELETE /api/scenarios/:id        — delete own scenario (admin: any scenario)
 *   POST   /api/scenarios/:id/run    — invoke a scenario on a ticket
 *   GET    /api/scenarios/:id/runs   — execution history (admin/supervisor)
 */

import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import {
  createScenarioSchema,
  updateScenarioSchema,
  runScenarioSchema,
} from "core/schemas/scenarios.ts";
import type { WorkflowAction, TicketWorkflowSnapshot } from "../lib/workflow/types";
import { executeWorkflowActions } from "../lib/workflow/actions";
import { logAudit } from "../lib/audit";
import prisma from "../db";
import type { Prisma } from "../generated/prisma/client";

const router = Router();

const SCENARIO_SELECT = {
  id: true, name: true, description: true, color: true,
  isEnabled: true, actions: true,
  visibility: true, visibilityTeamId: true,
  visibilityTeam: { select: { id: true, name: true, color: true } },
  createdById: true,
  createdBy: { select: { id: true, name: true } },
  createdAt: true, updatedAt: true,
  _count: { select: { executions: true } },
} as const;

/** Returns true when the caller can manage ALL scenarios (not just their own). */
function canManageAll(role: string): boolean {
  return role === "admin" || role === "supervisor";
}

/** Build a Prisma WHERE filter so the caller only sees scenarios they are allowed to see. */
async function visibilityWhere(userId: string): Promise<Prisma.ScenarioDefinitionWhereInput> {
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    select: { teamId: true },
  });
  const teamIds = memberships.map((m) => m.teamId);
  return {
    OR: [
      { visibility: "public" },
      { visibility: "team", visibilityTeamId: { in: teamIds } },
      { visibility: "private", createdById: userId },
    ],
  };
}

// ── GET /api/scenarios ────────────────────────────────────────────────────────

router.get(
  "/",
  requireAuth,
  requirePermission("scenarios.run"),
  async (req, res) => {
    const where: Prisma.ScenarioDefinitionWhereInput = canManageAll(req.user.role)
      ? {}
      : await visibilityWhere(req.user.id);

    const scenarios = await prisma.scenarioDefinition.findMany({
      where,
      orderBy: { name: "asc" },
      select: SCENARIO_SELECT,
    });
    res.json({ scenarios });
  }
);

// ── POST /api/scenarios ───────────────────────────────────────────────────────
// Any agent with scenarios.run can create a scenario.

router.post(
  "/",
  requireAuth,
  requirePermission("scenarios.run"),
  async (req, res) => {
    const data = validate(createScenarioSchema, req.body, res);
    if (!data) return;

    if (data.visibility === "team" && !data.visibilityTeamId) {
      res.status(400).json({ error: "visibilityTeamId is required when visibility is 'team'" });
      return;
    }

    const scenario = await prisma.scenarioDefinition.create({
      data: {
        name:             data.name,
        description:      data.description ?? null,
        color:            data.color ?? null,
        actions:          data.actions as unknown as Prisma.InputJsonValue,
        visibility:       data.visibility ?? "public",
        visibilityTeamId: data.visibility === "team" ? (data.visibilityTeamId ?? null) : null,
        createdById:      req.user.id,
      },
      select: SCENARIO_SELECT,
    });

    res.status(201).json({ scenario });
  }
);

// ── PATCH /api/scenarios/:id ──────────────────────────────────────────────────
// Owners can update their own. Admins/supervisors can update any.

router.patch(
  "/:id",
  requireAuth,
  requirePermission("scenarios.run"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid scenario ID" }); return; }

    const data = validate(updateScenarioSchema, req.body, res);
    if (!data) return;

    const existing = await prisma.scenarioDefinition.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ error: "Scenario not found" }); return; }

    if (!canManageAll(req.user.role) && existing.createdById !== req.user.id) {
      res.status(403).json({ error: "You can only edit your own scenarios" });
      return;
    }

    if (data.visibility === "team" && data.visibilityTeamId == null) {
      res.status(400).json({ error: "visibilityTeamId is required when visibility is 'team'" });
      return;
    }

    const updateData: Prisma.ScenarioDefinitionUpdateInput = {};
    if (data.name        !== undefined) updateData.name        = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.color       !== undefined) updateData.color       = data.color;
    if (data.isEnabled   !== undefined) updateData.isEnabled   = data.isEnabled;
    if (data.actions     !== undefined) updateData.actions     = data.actions as unknown as Prisma.InputJsonValue;
    if (data.visibility !== undefined) {
      updateData.visibility     = data.visibility;
      const newTeamId = data.visibility === "team" ? (data.visibilityTeamId ?? null) : null;
      updateData.visibilityTeam = newTeamId != null
        ? { connect: { id: newTeamId } }
        : { disconnect: true };
    }

    const updated = await prisma.scenarioDefinition.update({
      where: { id },
      data: updateData,
      select: SCENARIO_SELECT,
    });

    res.json({ scenario: updated });
  }
);

// ── DELETE /api/scenarios/:id ─────────────────────────────────────────────────
// Owners can delete their own. Admins/supervisors can delete any.

router.delete(
  "/:id",
  requireAuth,
  requirePermission("scenarios.run"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid scenario ID" }); return; }

    const existing = await prisma.scenarioDefinition.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ error: "Scenario not found" }); return; }

    if (!canManageAll(req.user.role) && existing.createdById !== req.user.id) {
      res.status(403).json({ error: "You can only delete your own scenarios" });
      return;
    }

    await prisma.scenarioDefinition.delete({ where: { id } });
    res.json({ ok: true });
  }
);

// ── POST /api/scenarios/:id/run ───────────────────────────────────────────────
// Any agent with scenarios.run: manually invoke a scenario against a ticket.
//
// Flow:
//   1. Validate scenario exists and is enabled.
//   2. Load the target ticket.
//   3. Create a ScenarioExecution record (status: running).
//   4. Execute each action using the shared workflow action executor.
//   5. Persist per-step results as ScenarioExecutionStep rows.
//   6. Update execution status to completed/failed.
//   7. Write an audit event on the ticket (actor = invoking agent).
//   8. Invalidate cached ticket state (caller re-fetches).

router.post(
  "/:id/run",
  requireAuth,
  requirePermission("scenarios.run"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid scenario ID" }); return; }

    const body = validate(runScenarioSchema, req.body, res);
    if (!body) return;

    // Load scenario and check visibility access
    const scenario = await prisma.scenarioDefinition.findUnique({ where: { id } });
    if (!scenario) { res.status(404).json({ error: "Scenario not found" }); return; }
    if (!scenario.isEnabled) {
      res.status(422).json({ error: "This scenario is disabled" });
      return;
    }

    // Enforce visibility — agents can only run scenarios they can see
    if (!canManageAll(req.user.role)) {
      const visible = await visibilityWhere(req.user.id);
      const accessible = await prisma.scenarioDefinition.findFirst({ where: { id, ...visible } });
      if (!accessible) {
        res.status(403).json({ error: "You do not have access to this scenario" });
        return;
      }
    }

    // Load target ticket
    const ticket = await prisma.ticket.findUnique({
      where: { id: body.ticketId },
      select: {
        id: true, subject: true, body: true, status: true,
        category: true, priority: true, severity: true, ticketType: true,
        impact: true, urgency: true, source: true, affectedSystem: true,
        senderEmail: true, assignedToId: true, teamId: true,
        linkedIncidentId: true, customFields: true, createdAt: true,
      },
    });
    if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }

    // Prevent execution on system-managed tickets
    if (ticket.status === "new" || ticket.status === "processing") {
      res.status(422).json({
        error: "Scenarios cannot be run on tickets that are still being processed",
      });
      return;
    }

    const snapshot: TicketWorkflowSnapshot = {
      id:               ticket.id,
      subject:          ticket.subject,
      body:             ticket.body,
      status:           ticket.status,
      category:         ticket.category,
      priority:         ticket.priority,
      severity:         ticket.severity,
      ticketType:       ticket.ticketType,
      impact:           ticket.impact,
      urgency:          ticket.urgency,
      source:           ticket.source,
      affectedSystem:   ticket.affectedSystem,
      senderEmail:      ticket.senderEmail,
      assignedToId:     ticket.assignedToId,
      teamId:           ticket.teamId,
      linkedIncidentId: ticket.linkedIncidentId,
      customFields:     (ticket.customFields as Record<string, unknown>) ?? {},
      createdAt:        ticket.createdAt,
    };

    // Create execution record (status: running)
    const execution = await prisma.scenarioExecution.create({
      data: {
        scenarioId: id,
        ticketId: body.ticketId,
        invokedById: req.user.id,
        status: "running",
        startedAt: new Date(),
      },
    });

    let finalStatus: "completed" | "failed" = "completed";

    try {
      // Resolve the "__me__" sentinel to the invoking agent's ID
      const rawActions = scenario.actions as unknown as WorkflowAction[];
      const actions = rawActions.map((action) => {
        if (
          action.type === "assign_user" &&
          (action as { type: "assign_user"; agentId: string }).agentId === "__me__"
        ) {
          return { ...action, agentId: req.user.id, agentName: req.user.name };
        }
        return action;
      });

      const results = await executeWorkflowActions(actions, snapshot);

      // Persist per-step results
      if (results.length > 0) {
        await prisma.scenarioExecutionStep.createMany({
          data: results.map((r) => ({
            executionId: execution.id,
            actionType: r.type,
            applied: r.applied,
            skippedReason: r.skippedReason ?? null,
            errorMessage: r.errorMessage ?? null,
          })),
        });
      }

      // Mark failed if any action errored
      if (results.some((r) => r.errorMessage)) {
        finalStatus = "failed";
      }

      // Write audit event on the ticket (actor = invoking agent, not null)
      await logAudit(body.ticketId, req.user.id, "scenario.run", {
        scenarioId: id,
        scenarioName: scenario.name,
        executionId: execution.id,
        applied: results.filter((r) => r.applied).map((r) => r.type),
        skipped: results.filter((r) => !r.applied && !r.errorMessage).map((r) => r.type),
        errors: results.filter((r) => !!r.errorMessage).map((r) => r.type),
      });

      // Close execution
      await prisma.scenarioExecution.update({
        where: { id: execution.id },
        data: { status: finalStatus, completedAt: new Date() },
      });

      res.json({
        executionId: execution.id,
        status: finalStatus,
        results,
      });
    } catch (err) {
      // Unexpected top-level failure
      await prisma.scenarioExecution.update({
        where: { id: execution.id },
        data: { status: "failed", completedAt: new Date() },
      });
      throw err; // Express 5 catches and returns 500
    }
  }
);

// ── GET /api/scenarios/:id/runs ───────────────────────────────────────────────
// Admin/supervisor: execution history for a specific scenario.

router.get(
  "/:id/runs",
  requireAuth,
  requirePermission("scenarios.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid scenario ID" }); return; }

    const scenario = await prisma.scenarioDefinition.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!scenario) { res.status(404).json({ error: "Scenario not found" }); return; }

    const executions = await prisma.scenarioExecution.findMany({
      where: { scenarioId: id },
      orderBy: { startedAt: "desc" },
      take: 100,
      select: {
        id: true,
        ticketId: true,
        ticket: { select: { ticketNumber: true, subject: true } },
        invokedBy: { select: { id: true, name: true } },
        status: true,
        startedAt: true,
        completedAt: true,
        steps: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            actionType: true,
            applied: true,
            skippedReason: true,
            errorMessage: true,
          },
        },
      },
    });

    res.json({ scenario, executions });
  }
);

export default router;
