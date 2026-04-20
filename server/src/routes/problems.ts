import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import {
  createProblemSchema,
  updateProblemSchema,
  listProblemsQuerySchema,
  linkIncidentSchema,
  linkTicketSchema,
  createProblemNoteSchema,
} from "core/schemas/problems.ts";
import {
  problemStatusTransitions,
  terminalProblemStatuses,
} from "core/constants/problem-status.ts";
import { logProblemEvent } from "../lib/problem-events";
import { logIncidentEvent } from "../lib/incident-events";
import { notifyMentions } from "../lib/mentions";
import { generateTicketNumber } from "../lib/ticket-number";
import prisma from "../db";
import type { Prisma, TicketPriority, ProblemStatus } from "../generated/prisma/client";

const router = Router();

// ── Shared select projections ─────────────────────────────────────────────────

const USER_SUMMARY = { id: true, name: true, email: true } as const;
const TEAM_SUMMARY = { id: true, name: true, color: true } as const;

const LIST_SELECT = {
  id: true,
  problemNumber: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  isKnownError: true,
  affectedService: true,
  linkedChangeRef: true,
  owner: { select: USER_SUMMARY },
  assignedTo: { select: { id: true, name: true } },
  team: { select: TEAM_SUMMARY },
  resolvedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { linkedIncidents: true } },
} as const;

const CI_SUMMARY_SELECT = {
  id: true, ciNumber: true, name: true, type: true,
  environment: true, criticality: true, status: true, tags: true,
} as const;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  rootCause: true,
  workaround: true,
  linkedIncidents: {
    orderBy: { linkedAt: "asc" as const },
    select: {
      id: true,
      linkedAt: true,
      linkedBy: { select: { id: true, name: true } },
      incident: {
        select: {
          id: true,
          incidentNumber: true,
          title: true,
          status: true,
          priority: true,
          affectedSystem: true,
          createdAt: true,
        },
      },
    },
  },
  notes: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      noteType: true,
      body: true,
      bodyHtml: true,
      author: { select: { id: true, name: true } },
      createdAt: true,
      updatedAt: true,
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
  linkedTickets: {
    orderBy: { linkedAt: "asc" as const },
    select: {
      id: true,
      linkedAt: true,
      linkedBy: { select: { id: true, name: true } },
      ticket: {
        select: {
          id: true,
          ticketNumber: true,
          subject: true,
          status: true,
          priority: true,
          createdAt: true,
        },
      },
    },
  },
} as const;

// ── Cluster hint helper ───────────────────────────────────────────────────────
// Future-ready: computes a lightweight recurring-incident summary from linked
// incidents. When a proper clustering engine is built, this can be replaced
// with a pre-computed DB field or a background job result.

function buildClusterHint(
  linkedIncidents: Array<{
    incident: {
      affectedSystem: string | null;
      createdAt: Date;
    };
  }>
) {
  if (linkedIncidents.length === 0) return null;

  // Tally affected systems
  const systemCounts: Record<string, number> = {};
  for (const { incident } of linkedIncidents) {
    const s = incident.affectedSystem ?? "__unknown__";
    systemCounts[s] = (systemCounts[s] ?? 0) + 1;
  }

  const commonSystem = Object.entries(systemCounts).sort((a, b) => b[1] - a[1])[0];
  const earliestDate = linkedIncidents.reduce<Date | null>((min, { incident }) => {
    const d = new Date(incident.createdAt);
    return min === null || d < min ? d : min;
  }, null);

  return {
    recurrenceCount: linkedIncidents.length,
    commonAffectedSystem:
      commonSystem && commonSystem[0] !== "__unknown__" ? commonSystem[0] : null,
    earliestIncidentAt: earliestDate ? earliestDate.toISOString() : null,
  };
}

// ── GET /api/problems ─────────────────────────────────────────────────────────

router.get(
  "/",
  requireAuth,
  requirePermission("problems.view"),
  async (req, res) => {
    const query = validate(listProblemsQuerySchema, req.query, res);
    if (!query) return;

    const {
      status, priority, isKnownError, assignedToMe,
      search, page, pageSize, sortBy, sortOrder,
    } = query;

    const where: Prisma.ProblemWhereInput = {};
    if (status)        where.status = status;
    if (priority)      where.priority = priority as TicketPriority;
    if (isKnownError !== undefined) where.isKnownError = isKnownError;
    if (assignedToMe)  where.assignedToId = req.user.id;
    if (search) {
      where.OR = [
        { title:         { contains: search, mode: "insensitive" } },
        { problemNumber: { contains: search, mode: "insensitive" } },
        { affectedService: { contains: search, mode: "insensitive" } },
        { description:   { contains: search, mode: "insensitive" } },
      ];
    }

    const orderBy: Prisma.ProblemOrderByWithRelationInput =
      sortBy === "priority"  ? { priority: sortOrder }  :
      sortBy === "status"    ? { status: sortOrder }     :
      sortBy === "updatedAt" ? { updatedAt: sortOrder }  :
                               { createdAt: sortOrder };

    const [total, problems] = await prisma.$transaction([
      prisma.problem.count({ where }),
      prisma.problem.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: LIST_SELECT,
      }),
    ]);

    res.json({
      problems,
      meta: { total, page, pageSize, pages: Math.ceil(total / pageSize) },
    });
  }
);

// ── GET /api/problems/:id ─────────────────────────────────────────────────────

router.get(
  "/:id",
  requireAuth,
  requirePermission("problems.view"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const problem = await prisma.problem.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!problem) { res.status(404).json({ error: "Problem not found" }); return; }

    // Flatten linkedIncidents for the response shape expected by the client
    const linkedIncidents = problem.linkedIncidents.map((link) => ({
      id: link.incident.id,
      incidentNumber: link.incident.incidentNumber,
      title: link.incident.title,
      status: link.incident.status,
      priority: link.incident.priority,
      affectedSystem: link.incident.affectedSystem,
      createdAt: link.incident.createdAt,
      linkedAt: link.linkedAt,
      linkedBy: link.linkedBy,
    }));

    const linkedTickets = problem.linkedTickets.map((link) => ({
      id: link.ticket.id,
      ticketNumber: link.ticket.ticketNumber,
      subject: link.ticket.subject,
      status: link.ticket.status,
      priority: link.ticket.priority,
      createdAt: link.ticket.createdAt,
      linkedAt: link.linkedAt,
      linkedBy: link.linkedBy,
    }));

    const clusterHint = buildClusterHint(problem.linkedIncidents);

    res.json({ ...problem, linkedIncidents, linkedTickets, clusterHint });
  }
);

// ── POST /api/problems ────────────────────────────────────────────────────────

router.post(
  "/",
  requireAuth,
  requirePermission("problems.manage"),
  async (req, res) => {
    const data = validate(createProblemSchema, req.body, res);
    if (!data) return;

    // Validate referenced users
    if (data.ownerId) {
      const u = await prisma.user.findFirst({ where: { id: data.ownerId, deletedAt: null } });
      if (!u) { res.status(400).json({ error: "Owner not found" }); return; }
    }
    if (data.assignedToId) {
      const u = await prisma.user.findFirst({ where: { id: data.assignedToId, deletedAt: null } });
      if (!u) { res.status(400).json({ error: "Assignee not found" }); return; }
    }
    if (data.teamId) {
      const t = await prisma.team.findUnique({ where: { id: data.teamId } });
      if (!t) { res.status(400).json({ error: "Team not found" }); return; }
    }

    // Validate incident IDs if supplied
    if (data.linkedIncidentIds.length > 0) {
      const incidents = await prisma.incident.findMany({
        where: { id: { in: data.linkedIncidentIds } },
        select: { id: true },
      });
      if (incidents.length !== data.linkedIncidentIds.length) {
        res.status(400).json({ error: "One or more incident IDs not found" });
        return;
      }
    }

    const now = new Date();
    const problemNumber = await generateTicketNumber("problem", now);

    const problem = await prisma.problem.create({
      data: {
        problemNumber,
        title: data.title,
        description: data.description ?? null,
        priority: data.priority as TicketPriority,
        rootCause: data.rootCause ?? null,
        workaround: data.workaround ?? null,
        affectedService: data.affectedService ?? null,
        linkedChangeRef: data.linkedChangeRef ?? null,
        ownerId: data.ownerId ?? null,
        assignedToId: data.assignedToId ?? null,
        teamId: data.teamId ?? null,
        customFields: (data.customFields ?? {}) as any,
      },
      select: { id: true, problemNumber: true, status: true },
    });

    // Link incidents if supplied (promote workflow)
    if (data.linkedIncidentIds.length > 0) {
      await prisma.problemIncidentLink.createMany({
        data: data.linkedIncidentIds.map((incidentId) => ({
          problemId: problem.id,
          incidentId,
          linkedById: req.user.id,
        })),
        skipDuplicates: true,
      });
    }

    await logProblemEvent(problem.id, req.user.id, "problem.created", {
      priority: data.priority,
      linkedIncidentCount: data.linkedIncidentIds.length,
    });

    if (data.linkedIncidentIds.length > 0) {
      await logProblemEvent(problem.id, req.user.id, "problem.incidents_linked", {
        incidentIds: data.linkedIncidentIds,
        via: "creation",
      });

      // Log on each linked incident that it was promoted to a problem
      await Promise.all(
        data.linkedIncidentIds.map((incidentId) =>
          logIncidentEvent(incidentId, req.user.id, "incident.promoted_to_problem", {
            problemId: problem.id,
            problemNumber: problem.problemNumber,
          })
        )
      );
    }

    // Return full detail shape
    const full = await prisma.problem.findUnique({
      where: { id: problem.id },
      select: DETAIL_SELECT,
    });

    res.status(201).json(full);
  }
);

// ── PATCH /api/problems/:id ───────────────────────────────────────────────────

router.patch(
  "/:id",
  requireAuth,
  requirePermission("problems.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const data = validate(updateProblemSchema, req.body, res);
    if (!data) return;

    const current = await prisma.problem.findUnique({
      where: { id },
      select: {
        status: true,
        priority: true,
        isKnownError: true,
        ownerId: true,
        assignedToId: true,
        teamId: true,
      },
    });
    if (!current) { res.status(404).json({ error: "Problem not found" }); return; }

    if (terminalProblemStatuses.includes(current.status as ProblemStatus)) {
      res.status(422).json({ error: `Closed problems cannot be modified` });
      return;
    }

    // Validate status transition
    if (data.status && data.status !== current.status) {
      const allowed = problemStatusTransitions[current.status as ProblemStatus];
      if (!allowed.includes(data.status as ProblemStatus)) {
        res.status(422).json({
          error: `Cannot transition from "${current.status}" to "${data.status}"`,
        });
        return;
      }
    }

    // Validate entity references
    if (data.ownerId) {
      const u = await prisma.user.findFirst({ where: { id: data.ownerId, deletedAt: null } });
      if (!u) { res.status(400).json({ error: "Owner not found" }); return; }
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
    const updateData: Prisma.ProblemUpdateInput = {};

    if (data.title !== undefined)           updateData.title = data.title;
    if (data.description !== undefined)     updateData.description = data.description;
    if (data.rootCause !== undefined)       updateData.rootCause = data.rootCause;
    if (data.workaround !== undefined)      updateData.workaround = data.workaround;
    if (data.affectedService !== undefined) updateData.affectedService = data.affectedService;
    if (data.linkedChangeRef !== undefined) updateData.linkedChangeRef = data.linkedChangeRef;
    if (data.priority !== undefined)        updateData.priority = data.priority as TicketPriority;

    if ("ownerId" in data) {
      updateData.owner = data.ownerId
        ? { connect: { id: data.ownerId } }
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

    // Status transition — stamp lifecycle timestamps and auto-set isKnownError
    if (data.status && data.status !== current.status) {
      updateData.status = data.status;

      // Auto-flag known error when entering the known_error state or beyond
      const knownErrorStatuses: ProblemStatus[] = [
        "known_error", "change_required", "resolved", "closed",
      ];
      if (knownErrorStatuses.includes(data.status as ProblemStatus) && !current.isKnownError) {
        updateData.isKnownError = true;
      }

      if (data.status === "resolved") updateData.resolvedAt = now;
      if (data.status === "closed")   updateData.closedAt = now;
      // Reopen: clear resolved/closed stamps
      if (data.status === "under_investigation") {
        updateData.resolvedAt = null;
        updateData.closedAt = null;
      }
    }

    const updated = await prisma.problem.update({
      where: { id },
      data: updateData,
      select: DETAIL_SELECT,
    });

    // Audit events
    const auditTasks: Promise<void>[] = [];

    if (data.status && data.status !== current.status) {
      auditTasks.push(
        logProblemEvent(id, req.user.id, "problem.status_changed", {
          from: current.status,
          to: data.status,
        })
      );
    }
    if (data.priority && data.priority !== current.priority) {
      auditTasks.push(
        logProblemEvent(id, req.user.id, "problem.priority_changed", {
          from: current.priority,
          to: data.priority,
        })
      );
    }
    if ("ownerId" in data && data.ownerId !== current.ownerId) {
      auditTasks.push(
        logProblemEvent(id, req.user.id, "problem.owner_changed", {
          from: current.ownerId,
          to: data.ownerId,
        })
      );
    }
    if ("assignedToId" in data && data.assignedToId !== current.assignedToId) {
      auditTasks.push(
        logProblemEvent(id, req.user.id, "problem.assigned", {
          from: current.assignedToId,
          to: data.assignedToId,
        })
      );
    }
    if (data.rootCause !== undefined && data.rootCause !== null) {
      auditTasks.push(
        logProblemEvent(id, req.user.id, "problem.root_cause_updated", {})
      );
    }
    if (data.workaround !== undefined && data.workaround !== null) {
      auditTasks.push(
        logProblemEvent(id, req.user.id, "problem.workaround_updated", {})
      );
    }

    await Promise.all(auditTasks);

    // Return with cluster hint
    const linkedIncidents = updated.linkedIncidents.map((link) => ({
      id: link.incident.id,
      incidentNumber: link.incident.incidentNumber,
      title: link.incident.title,
      status: link.incident.status,
      priority: link.incident.priority,
      affectedSystem: link.incident.affectedSystem,
      createdAt: link.incident.createdAt,
      linkedAt: link.linkedAt,
      linkedBy: link.linkedBy,
    }));

    res.json({
      ...updated,
      linkedIncidents,
      clusterHint: buildClusterHint(updated.linkedIncidents),
    });
  }
);

// ── POST /api/problems/:id/incidents ─────────────────────────────────────────
// Link one incident to this problem

router.post(
  "/:id/incidents",
  requireAuth,
  requirePermission("problems.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const data = validate(linkIncidentSchema, req.body, res);
    if (!data) return;

    const problem = await prisma.problem.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!problem) { res.status(404).json({ error: "Problem not found" }); return; }
    if (problem.status === "closed") {
      res.status(422).json({ error: "Cannot link incidents to a closed problem" });
      return;
    }

    const ref = data.incidentNumber.toUpperCase();

    // Try direct incident number lookup first, then fall back to ticket number
    let incident = await prisma.incident.findUnique({
      where: { incidentNumber: ref },
      select: { id: true, incidentNumber: true, title: true },
    });

    if (!incident) {
      // Try resolving via a ticket that has a linked incident
      const ticket = await prisma.ticket.findUnique({
        where: { ticketNumber: ref },
        select: { linkedIncident: { select: { id: true, incidentNumber: true, title: true } } },
      });
      incident = ticket?.linkedIncident ?? null;
    }

    if (!incident) {
      res.status(404).json({ error: "Incident not found. Check the incident number (e.g. INC0004) or ticket number (e.g. TKT0001)." });
      return;
    }

    // Upsert — silently OK if already linked
    await prisma.problemIncidentLink.upsert({
      where: { problemId_incidentId: { problemId: id, incidentId: incident.id } },
      create: { problemId: id, incidentId: incident.id, linkedById: req.user.id },
      update: {},
    });

    await logProblemEvent(id, req.user.id, "problem.incident_linked", {
      incidentId: incident.id,
      incidentNumber: incident.incidentNumber,
    });

    res.status(201).json({ ok: true, incidentId: incident.id });
  }
);

// ── DELETE /api/problems/:id/incidents/:incidentId ────────────────────────────

router.delete(
  "/:id/incidents/:incidentId",
  requireAuth,
  requirePermission("problems.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    const incidentId = parseId(req.params.incidentId);
    if (id === null || incidentId === null) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }

    const link = await prisma.problemIncidentLink.findUnique({
      where: { problemId_incidentId: { problemId: id, incidentId } },
    });
    if (!link) { res.status(404).json({ error: "Link not found" }); return; }

    await prisma.problemIncidentLink.delete({
      where: { problemId_incidentId: { problemId: id, incidentId } },
    });

    await logProblemEvent(id, req.user.id, "problem.incident_unlinked", { incidentId });
    res.json({ ok: true });
  }
);

// ── POST /api/problems/:id/tickets ───────────────────────────────────────────
// Link a ticket to this problem

router.post(
  "/:id/tickets",
  requireAuth,
  requirePermission("problems.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const data = validate(linkTicketSchema, req.body, res);
    if (!data) return;

    const problem = await prisma.problem.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!problem) { res.status(404).json({ error: "Problem not found" }); return; }
    if (problem.status === "closed") {
      res.status(422).json({ error: "Cannot link tickets to a closed problem" });
      return;
    }

    const ticket = await prisma.ticket.findUnique({
      where: { ticketNumber: data.ticketNumber.toUpperCase() },
      select: { id: true, ticketNumber: true, subject: true },
    });
    if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }

    await prisma.problemTicketLink.upsert({
      where: { problemId_ticketId: { problemId: id, ticketId: ticket.id } },
      create: { problemId: id, ticketId: ticket.id, linkedById: req.user.id },
      update: {},
    });

    await logProblemEvent(id, req.user.id, "problem.ticket_linked", {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
    });

    res.status(201).json({ ok: true, ticketId: ticket.id });
  }
);

// ── DELETE /api/problems/:id/tickets/:ticketId ────────────────────────────────

router.delete(
  "/:id/tickets/:ticketId",
  requireAuth,
  requirePermission("problems.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    const ticketId = parseId(req.params.ticketId);
    if (id === null || ticketId === null) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }

    const link = await prisma.problemTicketLink.findUnique({
      where: { problemId_ticketId: { problemId: id, ticketId } },
    });
    if (!link) { res.status(404).json({ error: "Link not found" }); return; }

    await prisma.problemTicketLink.delete({
      where: { problemId_ticketId: { problemId: id, ticketId } },
    });

    await logProblemEvent(id, req.user.id, "problem.ticket_unlinked", { ticketId });
    res.json({ ok: true });
  }
);

// ── POST /api/problems/:id/notes ──────────────────────────────────────────────

router.post(
  "/:id/notes",
  requireAuth,
  requirePermission("problems.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const data = validate(createProblemNoteSchema, req.body, res);
    if (!data) return;

    const problem = await prisma.problem.findUnique({
      where: { id },
      select: { id: true, status: true, problemNumber: true, title: true },
    });
    if (!problem) { res.status(404).json({ error: "Problem not found" }); return; }
    if (problem.status === "closed") {
      res.status(422).json({ error: "Cannot add notes to a closed problem" });
      return;
    }

    const note = await prisma.problemNote.create({
      data: {
        problemId: id,
        noteType: data.noteType,
        body: data.body,
        bodyHtml: data.bodyHtml ?? null,
        authorId: req.user.id,
      },
      select: {
        id: true,
        noteType: true,
        body: true,
        bodyHtml: true,
        author: { select: { id: true, name: true } },
        createdAt: true,
        updatedAt: true,
      },
    });

    await logProblemEvent(id, req.user.id, "problem.note_added", {
      noteId: note.id,
      noteType: note.noteType,
    });

    // Notify @mentioned users (fire-and-forget)
    void notifyMentions(data.bodyHtml, {
      authorId:     req.user.id,
      entityNumber: problem.problemNumber,
      entityTitle:  problem.title,
      entityUrl:    `/problems/${id}`,
      entityType:   "problem_note",
      entityId:     String(note.id),
    });

    // Auto-promote status when an RCA note is added on a new/investigating problem
    if (data.noteType === "rca") {
      const eligibleStatuses: ProblemStatus[] = ["new", "under_investigation"];
      if (eligibleStatuses.includes(problem.status as ProblemStatus)) {
        await prisma.problem.update({
          where: { id },
          data: { status: "root_cause_identified" },
        });
        await logProblemEvent(id, req.user.id, "problem.status_changed", {
          from: problem.status,
          to: "root_cause_identified",
          via: "rca_note",
        });
      }
    }

    res.status(201).json({ note });
  }
);

// ── DELETE /api/problems/:id/notes/:noteId ────────────────────────────────────

router.delete(
  "/:id/notes/:noteId",
  requireAuth,
  requirePermission("problems.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    const noteId = parseId(req.params.noteId);
    if (id === null || noteId === null) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }

    const note = await prisma.problemNote.findFirst({
      where: { id: noteId, problemId: id },
      select: { authorId: true },
    });
    if (!note) { res.status(404).json({ error: "Note not found" }); return; }

    const isAdmin = req.user.role === "admin" || req.user.role === "supervisor";
    if (!isAdmin && note.authorId !== req.user.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await prisma.problemNote.delete({ where: { id: noteId } });
    res.json({ ok: true });
  }
);

// ─── Bulk Actions ──────────────────────────────────────────────────────────────

import { z as zBulk } from "zod/v4";

const problemsBulkSchema = zBulk.discriminatedUnion("action", [
  zBulk.object({ action: zBulk.literal("delete"), ids: zBulk.array(zBulk.number().int().positive()).min(1).max(100) }),
  zBulk.object({ action: zBulk.literal("assign"), ids: zBulk.array(zBulk.number().int().positive()).min(1).max(100), assignedToId: zBulk.string().nullable().optional(), teamId: zBulk.number().int().positive().nullable().optional() }),
  zBulk.object({ action: zBulk.literal("status"), ids: zBulk.array(zBulk.number().int().positive()).min(1).max(100), status: zBulk.string() }),
]);

router.post("/bulk", requireAuth, requirePermission("problems.manage"), async (req, res) => {
  const data = validate(problemsBulkSchema, req.body, res);
  if (!data) return;
  switch (data.action) {
    case "delete": {
      const { count } = await prisma.problem.deleteMany({ where: { id: { in: data.ids } } });
      res.json({ affected: count }); return;
    }
    case "assign": {
      await prisma.problem.updateMany({ where: { id: { in: data.ids } }, data: { ...(data.assignedToId !== undefined && { assignedToId: data.assignedToId }), ...(data.teamId !== undefined && { teamId: data.teamId }) } });
      res.json({ affected: data.ids.length }); return;
    }
    case "status": {
      const { count } = await prisma.problem.updateMany({ where: { id: { in: data.ids } }, data: { status: data.status as any } });
      res.json({ affected: count }); return;
    }
  }
});

export default router;
