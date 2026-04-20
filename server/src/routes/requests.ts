import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import {
  createRequestSchema,
  updateRequestSchema,
  listRequestsQuerySchema,
  createFulfillmentTaskSchema,
  updateFulfillmentTaskSchema,
} from "core/schemas/requests.ts";
import {
  requestStatusTransitions,
  terminalRequestStatuses,
} from "core/constants/request-status.ts";
import {
  fulfillmentTaskStatusTransitions,
} from "core/constants/fulfillment-task-status.ts";
import { computeRequestSlaDueAt } from "../lib/request-sla";
import { logRequestEvent } from "../lib/request-events";
import { generateTicketNumber } from "../lib/ticket-number";
import { createApproval } from "../lib/approval-engine";
import { syncServiceRequestToTicket } from "../lib/ticket-sync";
import { notifyEntityFollowers } from "../lib/notify-entity-followers";
import { applyEscalationRules } from "../lib/apply-escalation-rules";
import prisma from "../db";
import type { Prisma, TicketPriority } from "../generated/prisma/client";

const router = Router();

// ── Shared select projections ─────────────────────────────────────────────────

const USER_SUMMARY = { id: true, name: true, email: true } as const;
const TEAM_SUMMARY = { id: true, name: true, color: true } as const;

const LIST_SELECT = {
  id: true,
  requestNumber: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  approvalStatus: true,
  approvalRequestId: true,
  requesterName: true,
  requesterEmail: true,
  requester: { select: USER_SUMMARY },
  requesterCustomer: { select: { id: true, name: true, email: true } },
  assignedTo: { select: { id: true, name: true } },
  team: { select: TEAM_SUMMARY },
  catalogItemId: true,
  catalogItemName: true,
  dueDate: true,
  slaDueAt: true,
  slaBreached: true,
  resolvedAt: true,
  closedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ITEM_SELECT = {
  id: true,
  name: true,
  description: true,
  quantity: true,
  unit: true,
  formData: true,
  catalogItemId: true,
  status: true,
  fulfilledAt: true,
  createdAt: true,
} as const;

const TASK_SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  position: true,
  dueAt: true,
  completedAt: true,
  assignedTo: { select: { id: true, name: true } },
  team: { select: TEAM_SUMMARY },
  createdBy: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} as const;

const EVENT_SELECT = {
  id: true,
  action: true,
  meta: true,
  actor: { select: { id: true, name: true } },
  createdAt: true,
} as const;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  formData: true,
  items: { orderBy: { createdAt: "asc" as const }, select: ITEM_SELECT },
  tasks: { orderBy: { position: "asc" as const }, select: TASK_SELECT },
  events: { orderBy: { createdAt: "asc" as const }, select: EVENT_SELECT },
  sourceTicket: {
    select: {
      id: true,
      ticketNumber: true,
      subject: true,
      status: true,
      priority: true,
      senderName: true,
      senderEmail: true,
      createdAt: true,
    },
  },
} as const;

// ── GET /api/requests ─────────────────────────────────────────────────────────

router.get(
  "/",
  requireAuth,
  requirePermission("requests.view"),
  async (req, res) => {
    const query = validate(listRequestsQuerySchema, req.query, res);
    if (!query) return;

    const { status, priority, assignedToMe, search, page, pageSize, sortBy, sortOrder } = query;

    const where: Prisma.ServiceRequestWhereInput = {};
    if (status) where.status = status;
    if (priority) where.priority = priority as TicketPriority;
    if (assignedToMe) where.assignedToId = req.user.id;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { requestNumber: { contains: search, mode: "insensitive" } },
        { requesterName: { contains: search, mode: "insensitive" } },
        { requesterEmail: { contains: search, mode: "insensitive" } },
        { catalogItemName: { contains: search, mode: "insensitive" } },
      ];
    }

    const orderBy: Prisma.ServiceRequestOrderByWithRelationInput =
      sortBy === "priority"  ? { priority: sortOrder }  :
      sortBy === "status"    ? { status: sortOrder }     :
      sortBy === "updatedAt" ? { updatedAt: sortOrder }  :
      sortBy === "dueDate"   ? { dueDate: sortOrder }    :
                               { createdAt: sortOrder };

    const [total, requests] = await prisma.$transaction([
      prisma.serviceRequest.count({ where }),
      prisma.serviceRequest.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: LIST_SELECT,
      }),
    ]);

    res.json({
      requests,
      meta: { total, page, pageSize, pages: Math.ceil(total / pageSize) },
    });
  }
);

// ── GET /api/requests/:id ─────────────────────────────────────────────────────

router.get(
  "/:id",
  requireAuth,
  requirePermission("requests.view"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const request = await prisma.serviceRequest.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!request) { res.status(404).json({ error: "Request not found" }); return; }

    res.json(request);
  }
);

// ── POST /api/requests ────────────────────────────────────────────────────────

router.post(
  "/",
  requireAuth,
  requirePermission("requests.manage"),
  async (req, res) => {
    const data = validate(createRequestSchema, req.body, res);
    if (!data) return;

    // Validate referenced entities
    if (data.assignedToId) {
      const u = await prisma.user.findFirst({ where: { id: data.assignedToId, deletedAt: null } });
      if (!u) { res.status(400).json({ error: "Assignee not found" }); return; }
    }
    if (data.teamId) {
      const t = await prisma.team.findUnique({ where: { id: data.teamId } });
      if (!t) { res.status(400).json({ error: "Team not found" }); return; }
    }
    if (data.requiresApproval && (!data.approverIds || data.approverIds.length === 0)) {
      res.status(400).json({ error: "approverIds required when requiresApproval is true" });
      return;
    }

    const now = new Date();
    const requestNumber = await generateTicketNumber("service_request", now);
    const slaDueAt = computeRequestSlaDueAt(data.priority, now);

    // Determine initial status — skip approval stage if not required
    const initialStatus = data.requiresApproval ? "pending_approval" : "submitted";
    const initialApprovalStatus = data.requiresApproval ? "pending" : "not_required";

    const request = await prisma.serviceRequest.create({
      data: {
        requestNumber,
        title: data.title,
        description: data.description ?? null,
        priority: data.priority as TicketPriority,
        status: initialStatus,
        approvalStatus: initialApprovalStatus,
        // Submitter is always the logged-in agent when created via agent shell
        requesterId: req.user.id,
        requesterName: req.user.name,
        requesterEmail: req.user.email,
        assignedToId: data.assignedToId ?? null,
        teamId: data.teamId ?? null,
        catalogItemId: data.catalogItemId ?? null,
        catalogItemName: data.catalogItemName ?? null,
        formData: data.formData as Prisma.InputJsonValue,
        customFields: (data.customFields ?? {}) as Prisma.InputJsonValue,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        slaDueAt,
        createdById: req.user.id,
        items: data.items.length > 0
          ? {
              create: data.items.map((item) => ({
                name: item.name,
                description: item.description ?? null,
                quantity: item.quantity,
                unit: item.unit ?? null,
                catalogItemId: item.catalogItemId ?? null,
                formData: item.formData as Prisma.InputJsonValue,
              })),
            }
          : undefined,
      },
      select: DETAIL_SELECT,
    });

    await logRequestEvent(request.id, req.user.id, "request.created", {
      priority: request.priority,
      status: request.status,
      itemCount: data.items.length,
    });

    // Evaluate escalation rules (fire-and-forget; never blocks the response)
    const cfSnapshot = Object.fromEntries(
      Object.entries((data.customFields ?? {}) as Record<string, unknown>)
        .map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)])
    );
    void applyEscalationRules("request", {
      priority:        data.priority,
      status:          initialStatus,
      approvalStatus:  initialApprovalStatus,
      slaBreached:     "false",
      catalogItemName: data.catalogItemName ?? "",
      ...cfSnapshot,
    }).then(async (escalation) => {
      if (!escalation) return;
      const update: { teamId?: number; assignedToId?: string } = {};
      if (escalation.teamId && !data.teamId) update.teamId = escalation.teamId;
      if (escalation.userId && !data.assignedToId) update.assignedToId = escalation.userId;
      if (Object.keys(update).length === 0) return;
      await prisma.serviceRequest.update({ where: { id: request.id }, data: update });
      await logRequestEvent(request.id, null, "request.escalation_rule_applied", {
        rule: escalation.ruleName,
        ...update,
      });
    });

    // Wire up the approval engine if approval is required
    if (data.requiresApproval && data.approverIds) {
      const { approvalRequest } = await createApproval(
        {
          subjectType: "service_request",
          subjectId: String(request.id),
          title: `Approval for: ${request.title}`,
          approvalMode: "all",
          requiredCount: 1,
          approverIds: data.approverIds,
        },
        req.user.id
      );

      await prisma.serviceRequest.update({
        where: { id: request.id },
        data: { approvalRequestId: approvalRequest.id },
      });

      await logRequestEvent(request.id, req.user.id, "request.approval_requested", {
        approvalRequestId: approvalRequest.id,
        approverCount: data.approverIds.length,
      });
    }

    res.status(201).json(request);
  }
);

// ── PATCH /api/requests/:id ───────────────────────────────────────────────────

router.patch(
  "/:id",
  requireAuth,
  requirePermission("requests.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const data = validate(updateRequestSchema, req.body, res);
    if (!data) return;

    const current = await prisma.serviceRequest.findUnique({
      where: { id },
      select: {
        status: true,
        priority: true,
        assignedToId: true,
        teamId: true,
        slaDueAt: true,
      },
    });
    if (!current) { res.status(404).json({ error: "Request not found" }); return; }

    // Block modifications to terminal requests
    if (terminalRequestStatuses.includes(current.status as any)) {
      res.status(422).json({ error: `Requests with status "${current.status}" cannot be modified` });
      return;
    }

    // Validate status transition
    if (data.status && data.status !== current.status) {
      const allowed = requestStatusTransitions[current.status as keyof typeof requestStatusTransitions];
      if (!allowed.includes(data.status as any)) {
        res.status(422).json({
          error: `Cannot transition from "${current.status}" to "${data.status}"`,
        });
        return;
      }
    }

    // Validate entity references
    if (data.assignedToId) {
      const u = await prisma.user.findFirst({ where: { id: data.assignedToId, deletedAt: null } });
      if (!u) { res.status(400).json({ error: "Assignee not found" }); return; }
    }
    if (data.teamId) {
      const t = await prisma.team.findUnique({ where: { id: data.teamId } });
      if (!t) { res.status(400).json({ error: "Team not found" }); return; }
    }

    const now = new Date();
    const updateData: Prisma.ServiceRequestUpdateInput = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.formData !== undefined) updateData.formData = data.formData as Prisma.InputJsonValue;
    if (data.dueDate !== undefined)
      updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;

    if ("assignedToId" in data) {
      updateData.assignedTo = data.assignedToId
        ? { connect: { id: data.assignedToId } }
        : { disconnect: true };
    }
    if ("teamId" in data) {
      updateData.team = data.teamId
        ? { connect: { id: data.teamId } }
        : { disconnect: true };
    }

    // Priority change → recalculate SLA
    if (data.priority && data.priority !== current.priority) {
      updateData.priority = data.priority as TicketPriority;
      updateData.slaDueAt = computeRequestSlaDueAt(data.priority, now);
    }

    // Status transition → stamp lifecycle timestamps
    if (data.status && data.status !== current.status) {
      updateData.status = data.status;
      if (data.status === "fulfilled" || data.status === "approved") {
        updateData.resolvedAt = now;
      }
      if (data.status === "closed") {
        updateData.closedAt = now;
      }
      if (data.status === "cancelled") {
        updateData.cancelledAt = now;
      }
    }

    const updated = await prisma.serviceRequest.update({
      where: { id },
      data: updateData,
      select: DETAIL_SELECT,
    });

    // Emit audit events
    const auditTasks: Promise<void>[] = [];

    if (data.status && data.status !== current.status) {
      auditTasks.push(
        logRequestEvent(id, req.user.id, "request.status_changed", {
          from: current.status,
          to: data.status,
        })
      );
    }
    if (data.priority && data.priority !== current.priority) {
      auditTasks.push(
        logRequestEvent(id, req.user.id, "request.priority_changed", {
          from: current.priority,
          to: data.priority,
        })
      );
    }
    if ("assignedToId" in data && data.assignedToId !== current.assignedToId) {
      auditTasks.push(
        logRequestEvent(id, req.user.id, "request.assigned", {
          from: current.assignedToId,
          to: data.assignedToId,
        })
      );
    }

    await Promise.all(auditTasks);

    // Notify followers on status change (fire-and-forget)
    if (data.status && data.status !== current.status) {
      void notifyEntityFollowers({
        entityType:   "service_request",
        entityId:     id,
        actorUserId:  req.user.id,
        event:        "request.followed_status_changed",
        entityNumber: updated.requestNumber,
        entityTitle:  updated.title,
        fromStatus:   current.status,
        toStatus:     data.status,
        entityUrl:    `/requests/${id}`,
      });
    }

    // Back-sync relevant changes to the linked source ticket (fire-and-forget)
    const backSyncChanges: { status?: string; assignedToId?: string | null; teamId?: number | null } = {};
    if (data.status && data.status !== current.status) backSyncChanges.status = data.status;
    if ("assignedToId" in data) backSyncChanges.assignedToId = data.assignedToId ?? null;
    if ("teamId" in data) backSyncChanges.teamId = data.teamId ?? null;
    if (Object.keys(backSyncChanges).length > 0) {
      void syncServiceRequestToTicket(id, backSyncChanges);
    }

    res.json(updated);
  }
);

// ── POST /api/requests/:id/tasks ──────────────────────────────────────────────

router.post(
  "/:id/tasks",
  requireAuth,
  requirePermission("requests.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const data = validate(createFulfillmentTaskSchema, req.body, res);
    if (!data) return;

    const request = await prisma.serviceRequest.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!request) { res.status(404).json({ error: "Request not found" }); return; }
    if (terminalRequestStatuses.includes(request.status as any)) {
      res.status(422).json({ error: "Cannot add tasks to a closed/cancelled/rejected request" });
      return;
    }

    if (data.assignedToId) {
      const u = await prisma.user.findFirst({ where: { id: data.assignedToId, deletedAt: null } });
      if (!u) { res.status(400).json({ error: "Assignee not found" }); return; }
    }
    if (data.teamId) {
      const t = await prisma.team.findUnique({ where: { id: data.teamId } });
      if (!t) { res.status(400).json({ error: "Team not found" }); return; }
    }

    const task = await prisma.fulfillmentTask.create({
      data: {
        requestId: id,
        title: data.title,
        description: data.description ?? null,
        assignedToId: data.assignedToId ?? null,
        teamId: data.teamId ?? null,
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
        position: data.position,
        createdById: req.user.id,
      },
      select: TASK_SELECT,
    });

    await logRequestEvent(id, req.user.id, "request.task_created", {
      taskId: task.id,
      title: task.title,
    });

    res.status(201).json({ task });
  }
);

// ── PATCH /api/requests/:id/tasks/:taskId ─────────────────────────────────────

router.patch(
  "/:id/tasks/:taskId",
  requireAuth,
  requirePermission("requests.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    const taskId = parseId(req.params.taskId);
    if (id === null || taskId === null) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }

    const data = validate(updateFulfillmentTaskSchema, req.body, res);
    if (!data) return;

    const task = await prisma.fulfillmentTask.findFirst({
      where: { id: taskId, requestId: id },
      select: { id: true, status: true, assignedToId: true },
    });
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }

    // Validate task status transition
    if (data.status && data.status !== task.status) {
      const allowed = fulfillmentTaskStatusTransitions[
        task.status as keyof typeof fulfillmentTaskStatusTransitions
      ];
      if (!allowed.includes(data.status as any)) {
        res.status(422).json({
          error: `Cannot transition task from "${task.status}" to "${data.status}"`,
        });
        return;
      }
    }

    if (data.assignedToId) {
      const u = await prisma.user.findFirst({ where: { id: data.assignedToId, deletedAt: null } });
      if (!u) { res.status(400).json({ error: "Assignee not found" }); return; }
    }
    if (data.teamId) {
      const t = await prisma.team.findUnique({ where: { id: data.teamId } });
      if (!t) { res.status(400).json({ error: "Team not found" }); return; }
    }

    const now = new Date();
    const updateData: Prisma.FulfillmentTaskUpdateInput = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.position !== undefined) updateData.position = data.position;
    if (data.dueAt !== undefined) updateData.dueAt = data.dueAt ? new Date(data.dueAt) : null;

    if ("assignedToId" in data) {
      updateData.assignedTo = data.assignedToId
        ? { connect: { id: data.assignedToId } }
        : { disconnect: true };
    }
    if ("teamId" in data) {
      updateData.team = data.teamId
        ? { connect: { id: data.teamId } }
        : { disconnect: true };
    }

    if (data.status && data.status !== task.status) {
      updateData.status = data.status;
      if (data.status === "completed") updateData.completedAt = now;
      if (data.status === "in_progress" || data.status === "pending") {
        updateData.completedAt = null;
      }
    }

    const updated = await prisma.fulfillmentTask.update({
      where: { id: taskId },
      data: updateData,
      select: TASK_SELECT,
    });

    if (data.status && data.status !== task.status) {
      await logRequestEvent(id, req.user.id, "request.task_status_changed", {
        taskId,
        from: task.status,
        to: data.status,
      });

      // Auto-advance request to in_fulfillment when first task starts
      if (data.status === "in_progress") {
        const parent = await prisma.serviceRequest.findUnique({
          where: { id },
          select: { status: true },
        });
        if (parent?.status === "approved" || parent?.status === "submitted") {
          await prisma.serviceRequest.update({
            where: { id },
            data: { status: "in_fulfillment" },
          });
          await logRequestEvent(id, req.user.id, "request.status_changed", {
            from: parent.status,
            to: "in_fulfillment",
            via: "task_started",
          });
        }
      }

      // Auto-advance request to fulfilled when all tasks complete
      if (data.status === "completed") {
        const allTasks = await prisma.fulfillmentTask.findMany({
          where: { requestId: id },
          select: { status: true },
        });
        const allDone = allTasks.every(
          (t) => t.status === "completed" || t.status === "cancelled"
        );
        if (allDone) {
          const parent = await prisma.serviceRequest.findUnique({
            where: { id },
            select: { status: true },
          });
          if (parent?.status === "in_fulfillment") {
            await prisma.serviceRequest.update({
              where: { id },
              data: { status: "fulfilled", resolvedAt: now },
            });
            await logRequestEvent(id, null, "request.status_changed", {
              from: "in_fulfillment",
              to: "fulfilled",
              via: "all_tasks_completed",
            });
          }
        }
      }
    }

    res.json({ task: updated });
  }
);

// ── DELETE /api/requests/:id/tasks/:taskId ────────────────────────────────────

router.delete(
  "/:id/tasks/:taskId",
  requireAuth,
  requirePermission("requests.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    const taskId = parseId(req.params.taskId);
    if (id === null || taskId === null) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }

    const task = await prisma.fulfillmentTask.findFirst({
      where: { id: taskId, requestId: id },
      select: { id: true, status: true },
    });
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }
    if (task.status === "completed") {
      res.status(422).json({ error: "Completed tasks cannot be deleted" });
      return;
    }

    await prisma.fulfillmentTask.delete({ where: { id: taskId } });
    await logRequestEvent(id, req.user.id, "request.task_deleted", { taskId });
    res.json({ ok: true });
  }
);

// ─── Bulk Actions ──────────────────────────────────────────────────────────────

import { z as zBulk } from "zod/v4";

const requestsBulkSchema = zBulk.discriminatedUnion("action", [
  zBulk.object({ action: zBulk.literal("delete"), ids: zBulk.array(zBulk.number().int().positive()).min(1).max(100) }),
  zBulk.object({ action: zBulk.literal("assign"), ids: zBulk.array(zBulk.number().int().positive()).min(1).max(100), assignedToId: zBulk.string().nullable().optional(), teamId: zBulk.number().int().positive().nullable().optional() }),
  zBulk.object({ action: zBulk.literal("status"), ids: zBulk.array(zBulk.number().int().positive()).min(1).max(100), status: zBulk.string() }),
]);

router.post("/bulk", requireAuth, requirePermission("requests.manage"), async (req, res) => {
  const data = validate(requestsBulkSchema, req.body, res);
  if (!data) return;
  switch (data.action) {
    case "delete": {
      const { count } = await prisma.serviceRequest.deleteMany({ where: { id: { in: data.ids } } });
      res.json({ affected: count }); return;
    }
    case "assign": {
      await prisma.serviceRequest.updateMany({ where: { id: { in: data.ids } }, data: { ...(data.assignedToId !== undefined && { assignedToId: data.assignedToId }), ...(data.teamId !== undefined && { teamId: data.teamId }) } });
      res.json({ affected: data.ids.length }); return;
    }
    case "status": {
      const { count } = await prisma.serviceRequest.updateMany({ where: { id: { in: data.ids } }, data: { status: data.status as any } });
      res.json({ affected: count }); return;
    }
  }
});

export default router;
