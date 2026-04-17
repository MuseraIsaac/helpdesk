import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import {
  createIncidentSchema,
  updateIncidentSchema,
  createIncidentUpdateSchema,
  listIncidentsQuerySchema,
} from "core/schemas/incidents.ts";
import { incidentStatusTransitions } from "core/constants/incident-status.ts";
import type { IncidentStatus } from "core/constants/incident-status.ts";
import type { IncidentPriority } from "core/constants/incident-priority.ts";
import {
  computeIncidentSlaDeadlines,
  withIncidentSlaInfo,
} from "../lib/incident-sla";
import { logIncidentEvent } from "../lib/incident-events";
import { generateTicketNumber } from "../lib/ticket-number";
import { notify } from "../lib/notify";
import { syncIncidentToTicket } from "../lib/ticket-sync";
import prisma from "../db";
import type { Prisma } from "../generated/prisma/client";

const router = Router();

// ── Shared select projections ─────────────────────────────────────────────────

const USER_SUMMARY = { id: true, name: true, email: true } as const;
const TEAM_SUMMARY = { id: true, name: true, color: true } as const;

const LIST_SELECT = {
  id: true,
  incidentNumber: true,
  title: true,
  status: true,
  priority: true,
  isMajor: true,
  affectedSystem: true,
  affectedUserCount: true,
  commander: { select: USER_SUMMARY },
  assignedTo: { select: { id: true, name: true } },
  team: { select: TEAM_SUMMARY },
  responseDeadline: true,
  resolutionDeadline: true,
  acknowledgedAt: true,
  respondedAt: true,
  resolvedAt: true,
  closedAt: true,
  slaBreached: true,
  createdBy: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} as const;

const CI_SUMMARY_SELECT = {
  id: true, ciNumber: true, name: true, type: true,
  environment: true, criticality: true, status: true, tags: true,
} as const;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  description: true,
  updates: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      updateType: true,
      body: true,
      author: { select: { id: true, name: true } },
      createdAt: true,
    },
  },
  events: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      action: true,
      meta: true,
      actor: { select: { id: true, name: true } },
      createdAt: true,
    },
  },
  ciLinks: {
    orderBy: { linkedAt: "asc" as const },
    select: {
      ci: { select: CI_SUMMARY_SELECT },
      linkedAt: true,
    },
  },
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

// ── GET /api/incidents ────────────────────────────────────────────────────────

router.get(
  "/",
  requireAuth,
  requirePermission("incidents.view"),
  async (req, res) => {
    const query = validate(listIncidentsQuerySchema, req.query, res);
    if (!query) return;

    const { status, priority, isMajor, assignedToMe, search, page, pageSize, sortBy, sortOrder } =
      query;

    const where: Prisma.IncidentWhereInput = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (isMajor !== undefined) where.isMajor = isMajor;
    if (assignedToMe) where.assignedToId = req.user.id;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { incidentNumber: { contains: search, mode: "insensitive" } },
        { affectedSystem: { contains: search, mode: "insensitive" } },
      ];
    }

    const orderBy: Prisma.IncidentOrderByWithRelationInput =
      sortBy === "priority"
        ? { priority: sortOrder }
        : sortBy === "status"
        ? { status: sortOrder }
        : sortBy === "updatedAt"
        ? { updatedAt: sortOrder }
        : { createdAt: sortOrder };

    const now = new Date();
    const [total, incidents] = await prisma.$transaction([
      prisma.incident.count({ where }),
      prisma.incident.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: LIST_SELECT,
      }),
    ]);

    res.json({
      incidents: incidents.map((i) => withIncidentSlaInfo(i, now)),
      meta: { total, page, pageSize, pages: Math.ceil(total / pageSize) },
    });
  }
);

// ── GET /api/incidents/:id ────────────────────────────────────────────────────

router.get(
  "/:id",
  requireAuth,
  requirePermission("incidents.view"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const incident = await prisma.incident.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!incident) { res.status(404).json({ error: "Incident not found" }); return; }

    res.json(withIncidentSlaInfo(incident));
  }
);

// ── POST /api/incidents ───────────────────────────────────────────────────────

router.post(
  "/",
  requireAuth,
  requirePermission("incidents.manage"),
  async (req, res) => {
    const data = validate(createIncidentSchema, req.body, res);
    if (!data) return;

    // Validate commander and assignee if provided
    if (data.commanderId) {
      const u = await prisma.user.findFirst({ where: { id: data.commanderId, deletedAt: null } });
      if (!u) { res.status(400).json({ error: "Commander not found" }); return; }
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
    const incidentNumber = await generateTicketNumber("incident", now);
    const sla = computeIncidentSlaDeadlines(data.priority as IncidentPriority, now);

    const incident = await prisma.incident.create({
      data: {
        incidentNumber,
        title: data.title,
        description: data.description ?? null,
        priority: data.priority,
        isMajor: data.isMajor,
        affectedSystem: data.affectedSystem ?? null,
        affectedUserCount: data.affectedUserCount ?? null,
        commanderId: data.commanderId ?? null,
        assignedToId: data.assignedToId ?? null,
        teamId: data.teamId ?? null,
        createdById: req.user.id,
        responseDeadline: sla.responseDeadline,
        resolutionDeadline: sla.resolutionDeadline,
      },
      select: DETAIL_SELECT,
    });

    await logIncidentEvent(incident.id, req.user.id, "incident.created", {
      priority: incident.priority,
      isMajor: incident.isMajor,
    });

    if (data.isMajor) {
      await logIncidentEvent(incident.id, req.user.id, "incident.major_declared", {});
    }

    res.status(201).json(withIncidentSlaInfo(incident));
  }
);

// ── PATCH /api/incidents/:id ──────────────────────────────────────────────────

router.patch(
  "/:id",
  requireAuth,
  requirePermission("incidents.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const data = validate(updateIncidentSchema, req.body, res);
    if (!data) return;

    const current = await prisma.incident.findUnique({
      where: { id },
      select: {
        status: true,
        priority: true,
        isMajor: true,
        commanderId: true,
        assignedToId: true,
        teamId: true,
        acknowledgedAt: true,
        respondedAt: true,
        resolvedAt: true,
        closedAt: true,
      },
    });
    if (!current) { res.status(404).json({ error: "Incident not found" }); return; }
    if (current.status === "closed") {
      res.status(422).json({ error: "Closed incidents cannot be modified" });
      return;
    }

    // Validate status transition
    if (data.status && data.status !== current.status) {
      const allowed = incidentStatusTransitions[current.status as IncidentStatus];
      if (!allowed.includes(data.status as IncidentStatus)) {
        res
          .status(422)
          .json({ error: `Cannot transition from "${current.status}" to "${data.status}"` });
        return;
      }
    }

    // Validate user references
    if (data.commanderId !== undefined && data.commanderId !== null) {
      const u = await prisma.user.findFirst({ where: { id: data.commanderId, deletedAt: null } });
      if (!u) { res.status(400).json({ error: "Commander not found" }); return; }
    }
    if (data.assignedToId !== undefined && data.assignedToId !== null) {
      const u = await prisma.user.findFirst({ where: { id: data.assignedToId, deletedAt: null } });
      if (!u) { res.status(400).json({ error: "Assignee not found" }); return; }
    }
    if (data.teamId !== undefined && data.teamId !== null) {
      const t = await prisma.team.findUnique({ where: { id: data.teamId } });
      if (!t) { res.status(400).json({ error: "Team not found" }); return; }
    }

    // Build update payload — stamp lifecycle timestamps
    const updateData: Prisma.IncidentUpdateInput = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.isMajor !== undefined) updateData.isMajor = data.isMajor;
    if (data.affectedSystem !== undefined) updateData.affectedSystem = data.affectedSystem;
    if (data.affectedUserCount !== undefined) updateData.affectedUserCount = data.affectedUserCount;
    if ("commanderId" in data) {
      updateData.commander = data.commanderId
        ? { connect: { id: data.commanderId } }
        : { disconnect: true };
    }
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

    // Priority change → recalculate SLA deadlines
    if (data.priority && data.priority !== current.priority) {
      const now = new Date();
      const sla = computeIncidentSlaDeadlines(data.priority as IncidentPriority, now);
      updateData.priority = data.priority;
      updateData.responseDeadline = sla.responseDeadline;
      updateData.resolutionDeadline = sla.resolutionDeadline;
    }

    // Status transition — stamp the appropriate timestamp
    const now = new Date();
    if (data.status && data.status !== current.status) {
      updateData.status = data.status;
      if (data.status === "acknowledged" && !current.acknowledgedAt) {
        updateData.acknowledgedAt = now;
        updateData.respondedAt = now;
      }
      if (data.status === "in_progress" && !current.respondedAt) {
        updateData.respondedAt = now;
      }
      if (data.status === "resolved") {
        updateData.resolvedAt = now;
      }
      if (data.status === "closed") {
        updateData.closedAt = now;
      }
    }

    const updated = await prisma.incident.update({
      where: { id },
      data: updateData,
      select: DETAIL_SELECT,
    });

    // ── Audit events ──────────────────────────────────────────────────────────
    const auditTasks: Promise<void>[] = [];

    if (data.status && data.status !== current.status) {
      auditTasks.push(
        logIncidentEvent(id, req.user.id, "incident.status_changed", {
          from: current.status,
          to: data.status,
        })
      );
    }
    if (data.priority && data.priority !== current.priority) {
      auditTasks.push(
        logIncidentEvent(id, req.user.id, "incident.priority_changed", {
          from: current.priority,
          to: data.priority,
        })
      );
    }
    if ("commanderId" in data && data.commanderId !== current.commanderId) {
      auditTasks.push(
        logIncidentEvent(id, req.user.id, "incident.commander_changed", {
          from: current.commanderId,
          to: data.commanderId,
        })
      );
    }
    if ("assignedToId" in data && data.assignedToId !== current.assignedToId) {
      auditTasks.push(
        logIncidentEvent(id, req.user.id, "incident.assigned", {
          from: current.assignedToId,
          to: data.assignedToId,
        })
      );
    }
    if (data.isMajor !== undefined && data.isMajor !== current.isMajor) {
      auditTasks.push(
        logIncidentEvent(
          id,
          req.user.id,
          data.isMajor ? "incident.major_declared" : "incident.major_cleared",
          {}
        )
      );
      // Notify commander and assignee when a major incident is declared
      if (data.isMajor === true) {
        const recipients = [
          updated.commander?.id,
          updated.assignedTo?.id,
        ].filter((x): x is string => !!x && x !== req.user.id);
        if (recipients.length > 0) {
          void notify({
            event: "incident.major_flagged",
            recipientIds: [...new Set(recipients)],
            title: "Major incident declared",
            body: updated.title,
            entityType: "incident",
            entityId: String(id),
            entityUrl: `/incidents/${id}`,
          });
        }
      }
    }

    await Promise.all(auditTasks);

    // Back-sync relevant changes to the linked source ticket (fire-and-forget)
    const backSyncChanges: { status?: string; assignedToId?: string | null; teamId?: number | null } = {};
    if (data.status && data.status !== current.status) backSyncChanges.status = data.status;
    if ("assignedToId" in data) backSyncChanges.assignedToId = data.assignedToId ?? null;
    if ("teamId" in data) backSyncChanges.teamId = data.teamId ?? null;
    if (Object.keys(backSyncChanges).length > 0) {
      void syncIncidentToTicket(id, backSyncChanges);
    }

    res.json(withIncidentSlaInfo(updated));
  }
);

// ── POST /api/incidents/:id/updates ──────────────────────────────────────────

router.post(
  "/:id/updates",
  requireAuth,
  requirePermission("incidents.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const data = validate(createIncidentUpdateSchema, req.body, res);
    if (!data) return;

    const incident = await prisma.incident.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!incident) { res.status(404).json({ error: "Incident not found" }); return; }
    if (incident.status === "closed") {
      res.status(422).json({ error: "Cannot add updates to a closed incident" });
      return;
    }

    const update = await prisma.incidentUpdate.create({
      data: {
        incidentId: id,
        body: data.body,
        updateType: data.updateType,
        authorId: req.user.id,
      },
      select: {
        id: true,
        updateType: true,
        body: true,
        author: { select: { id: true, name: true } },
        createdAt: true,
      },
    });

    await logIncidentEvent(id, req.user.id, "incident.update_added", {
      updateType: data.updateType,
      updateId: update.id,
    });

    // Auto-transition: if updateType is "all_clear" and status is in_progress → resolved
    if (data.updateType === "all_clear" && incident.status === "in_progress") {
      await prisma.incident.update({
        where: { id },
        data: { status: "resolved", resolvedAt: new Date() },
      });
      await logIncidentEvent(id, req.user.id, "incident.status_changed", {
        from: "in_progress",
        to: "resolved",
        via: "all_clear_update",
      });
    }

    res.status(201).json({ update });
  }
);

// ── DELETE /api/incidents/:id/updates/:updateId ───────────────────────────────
// Authors and admins can delete their own updates (within reason)

router.delete(
  "/:id/updates/:updateId",
  requireAuth,
  requirePermission("incidents.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    const updateId = parseId(req.params.updateId);
    if (id === null || updateId === null) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }

    const update = await prisma.incidentUpdate.findFirst({
      where: { id: updateId, incidentId: id },
      select: { authorId: true },
    });
    if (!update) { res.status(404).json({ error: "Update not found" }); return; }

    const isAdmin = req.user.role === "admin" || req.user.role === "supervisor";
    if (!isAdmin && update.authorId !== req.user.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await prisma.incidentUpdate.delete({ where: { id: updateId } });
    res.json({ ok: true });
  }
);

export default router;
