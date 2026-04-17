/**
 * /api/scenarios — Scenario Automation endpoints.
 *
 * Scenarios are admin-configured, named sets of actions that agents can
 * manually invoke on a ticket. Unlike WorkflowDefinitions (which fire
 * automatically on trigger events), scenarios have no triggers or conditions
 * — they exist purely to be explicitly invoked by a human operator.
 *
 * Endpoints:
 *   GET    /api/scenarios            — list all enabled scenarios (agents see this)
 *   POST   /api/scenarios            — create a new scenario  (admin/supervisor)
 *   PATCH  /api/scenarios/:id        — update a scenario       (admin/supervisor)
 *   DELETE /api/scenarios/:id        — delete a scenario       (admin/supervisor)
 *   POST   /api/scenarios/:id/run    — invoke a scenario on a ticket (all agents)
 *   GET    /api/scenarios/:id/runs   — execution history for a scenario (admin/supervisor)
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

// ── GET /api/scenarios ────────────────────────────────────────────────────────
// All agents with scenarios.run can list available scenarios.

router.get(
  "/",
  requireAuth,
  requirePermission("scenarios.run"),
  async (_req, res) => {
    const scenarios = await prisma.scenarioDefinition.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        isEnabled: true,
        actions: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { executions: true } },
      },
    });
    res.json({ scenarios });
  }
);

// ── POST /api/scenarios ───────────────────────────────────────────────────────
// Admin/supervisor: create a new scenario definition.

router.post(
  "/",
  requireAuth,
  requirePermission("scenarios.manage"),
  async (req, res) => {
    const data = validate(createScenarioSchema, req.body, res);
    if (!data) return;

    const scenario = await prisma.scenarioDefinition.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        color: data.color ?? null,
        actions: data.actions as unknown as Prisma.InputJsonValue,
        createdById: req.user.id,
      },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        isEnabled: true,
        actions: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(201).json({ scenario });
  }
);

// ── PATCH /api/scenarios/:id ──────────────────────────────────────────────────
// Admin/supervisor: update name, description, color, actions, or isEnabled.

router.patch(
  "/:id",
  requireAuth,
  requirePermission("scenarios.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid scenario ID" }); return; }

    const data = validate(updateScenarioSchema, req.body, res);
    if (!data) return;

    const existing = await prisma.scenarioDefinition.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ error: "Scenario not found" }); return; }

    const updateData: Prisma.ScenarioDefinitionUpdateInput = {};
    if (data.name !== undefined)        updateData.name        = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.color !== undefined)       updateData.color       = data.color;
    if (data.isEnabled !== undefined)   updateData.isEnabled   = data.isEnabled;
    if (data.actions !== undefined)     updateData.actions     = data.actions as unknown as Prisma.InputJsonValue;

    const updated = await prisma.scenarioDefinition.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        isEnabled: true,
        actions: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({ scenario: updated });
  }
);

// ── DELETE /api/scenarios/:id ─────────────────────────────────────────────────
// Admin/supervisor: remove a scenario definition (cascades executions).

router.delete(
  "/:id",
  requireAuth,
  requirePermission("scenarios.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid scenario ID" }); return; }

    const existing = await prisma.scenarioDefinition.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ error: "Scenario not found" }); return; }

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

    // Load scenario
    const scenario = await prisma.scenarioDefinition.findUnique({ where: { id } });
    if (!scenario) { res.status(404).json({ error: "Scenario not found" }); return; }
    if (!scenario.isEnabled) {
      res.status(422).json({ error: "This scenario is disabled" });
      return;
    }

    // Load target ticket
    const ticket = await prisma.ticket.findUnique({
      where: { id: body.ticketId },
      select: {
        id: true,
        subject: true,
        body: true,
        status: true,
        category: true,
        priority: true,
        severity: true,
        ticketType: true,
        senderEmail: true,
        assignedToId: true,
        teamId: true,
        createdAt: true,
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
      id: ticket.id,
      subject: ticket.subject,
      body: ticket.body,
      status: ticket.status,
      category: ticket.category,
      priority: ticket.priority,
      severity: ticket.severity,
      ticketType: ticket.ticketType,
      senderEmail: ticket.senderEmail,
      assignedToId: ticket.assignedToId,
      teamId: ticket.teamId,
      createdAt: ticket.createdAt,
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
