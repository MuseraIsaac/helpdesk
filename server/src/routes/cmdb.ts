import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import {
  createCiSchema,
  updateCiSchema,
  listCisQuerySchema,
  addCiRelationshipSchema,
  linkCiSchema,
} from "core/schemas/cmdb.ts";
import { logCiEvent } from "../lib/ci-events";
import prisma from "../db";
import type { Prisma, CiType, CiEnvironment, CiCriticality, CiStatus } from "../generated/prisma/client";

const router = Router();

// ── CI number generation ──────────────────────────────────────────────────────

async function generateCiNumber(): Promise<string> {
  const [row] = await prisma.$queryRaw<[{ last_value: number }]>`
    INSERT INTO ticket_counter (series, period_key, last_value)
    VALUES ('ci', '', 1)
    ON CONFLICT (series, period_key)
    DO UPDATE SET last_value = ticket_counter.last_value + 1
    RETURNING last_value
  `;
  return `CI-${String(row.last_value).padStart(4, "0")}`;
}

// ── Shared select projections ─────────────────────────────────────────────────

const CI_SUMMARY_SELECT = {
  id:          true,
  ciNumber:    true,
  name:        true,
  type:        true,
  environment: true,
  criticality: true,
  status:      true,
  tags:        true,
  description: true,
  owner:       { select: { id: true, name: true } },
  team:        { select: { id: true, name: true, color: true } },
  createdAt:   true,
  updatedAt:   true,
} as const;

const DETAIL_SELECT = {
  ...CI_SUMMARY_SELECT,
  createdBy: { select: { id: true, name: true } },
  relationshipsFrom: {
    select: {
      id:    true,
      type:  true,
      toCi:  { select: CI_SUMMARY_SELECT },
    },
  },
  relationshipsTo: {
    select: {
      id:      true,
      type:    true,
      fromCi:  { select: CI_SUMMARY_SELECT },
    },
  },
  events: {
    orderBy: { createdAt: "desc" as const },
    take: 50,
    select: {
      id:       true,
      action:   true,
      meta:     true,
      actor:    { select: { id: true, name: true } },
      createdAt: true,
    },
  },
} as const;

// ── GET /api/cmdb ─────────────────────────────────────────────────────────────

router.get(
  "/",
  requireAuth,
  requirePermission("cmdb.view"),
  async (req, res) => {
    const query = validate(listCisQuerySchema, req.query, res);
    if (!query) return;

    const {
      type, environment, criticality, status,
      search, page, pageSize, sortBy, sortOrder,
    } = query;

    const where: Prisma.ConfigItemWhereInput = {};
    if (type)        where.type        = type as CiType;
    if (environment) where.environment = environment as CiEnvironment;
    if (criticality) where.criticality = criticality as CiCriticality;
    if (status)      where.status      = status as CiStatus;
    if (search) {
      where.OR = [
        { name:        { contains: search, mode: "insensitive" } },
        { ciNumber:    { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { tags:        { has: search } },
      ];
    }

    const orderBy: Prisma.ConfigItemOrderByWithRelationInput =
      sortBy === "criticality" ? { criticality: sortOrder } :
      sortBy === "type"        ? { type: sortOrder }        :
      sortBy === "status"      ? { status: sortOrder }      :
      sortBy === "updatedAt"   ? { updatedAt: sortOrder }   :
      sortBy === "createdAt"   ? { createdAt: sortOrder }   :
                                 { name: sortOrder };

    const [total, items] = await prisma.$transaction([
      prisma.configItem.count({ where }),
      prisma.configItem.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: CI_SUMMARY_SELECT,
      }),
    ]);

    res.json({
      items,
      meta: { total, page, pageSize, pages: Math.ceil(total / pageSize) },
    });
  }
);

// ── GET /api/cmdb/:id ─────────────────────────────────────────────────────────

router.get(
  "/:id",
  requireAuth,
  requirePermission("cmdb.view"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const ci = await prisma.configItem.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!ci) { res.status(404).json({ error: "Configuration item not found" }); return; }

    // Flatten relationships into a unified list with direction metadata
    const relationships = [
      ...ci.relationshipsFrom.map((r) => ({
        id:        r.id,
        type:      r.type,
        direction: "outbound" as const,
        ci:        r.toCi,
      })),
      ...ci.relationshipsTo.map((r) => ({
        id:        r.id,
        type:      r.type,
        direction: "inbound" as const,
        ci:        r.fromCi,
      })),
    ];

    const { relationshipsFrom, relationshipsTo, ...rest } = ci;
    res.json({ ...rest, relationships });
  }
);

// ── POST /api/cmdb ────────────────────────────────────────────────────────────

router.post(
  "/",
  requireAuth,
  requirePermission("cmdb.manage"),
  async (req, res) => {
    const data = validate(createCiSchema, req.body, res);
    if (!data) return;

    if (data.ownerId) {
      const u = await prisma.user.findFirst({ where: { id: data.ownerId, deletedAt: null } });
      if (!u) { res.status(400).json({ error: "Owner not found" }); return; }
    }
    if (data.teamId) {
      const t = await prisma.team.findUnique({ where: { id: data.teamId } });
      if (!t) { res.status(400).json({ error: "Team not found" }); return; }
    }

    const ciNumber = await generateCiNumber();

    const ci = await prisma.configItem.create({
      data: {
        ciNumber,
        name:        data.name,
        type:        data.type as CiType,
        environment: data.environment as CiEnvironment,
        criticality: data.criticality as CiCriticality,
        status:      data.status as CiStatus,
        description: data.description ?? null,
        tags:        data.tags,
        ownerId:     data.ownerId ?? null,
        teamId:      data.teamId ?? null,
        createdById: req.user.id,
      },
      select: DETAIL_SELECT,
    });

    await logCiEvent(ci.id, req.user.id, "ci.created", {
      name: data.name,
      type: data.type,
      environment: data.environment,
      criticality: data.criticality,
    });

    const relationships = [
      ...ci.relationshipsFrom.map((r) => ({
        id: r.id, type: r.type, direction: "outbound" as const, ci: r.toCi,
      })),
      ...ci.relationshipsTo.map((r) => ({
        id: r.id, type: r.type, direction: "inbound" as const, ci: r.fromCi,
      })),
    ];
    const { relationshipsFrom, relationshipsTo, ...rest } = ci;
    res.status(201).json({ ...rest, relationships });
  }
);

// ── PATCH /api/cmdb/:id ───────────────────────────────────────────────────────

router.patch(
  "/:id",
  requireAuth,
  requirePermission("cmdb.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const data = validate(updateCiSchema, req.body, res);
    if (!data) return;

    const current = await prisma.configItem.findUnique({
      where: { id },
      select: { id: true, status: true, criticality: true, ownerId: true },
    });
    if (!current) { res.status(404).json({ error: "Configuration item not found" }); return; }

    if (data.ownerId !== undefined && data.ownerId !== null) {
      const u = await prisma.user.findFirst({ where: { id: data.ownerId, deletedAt: null } });
      if (!u) { res.status(400).json({ error: "Owner not found" }); return; }
    }
    if (data.teamId !== undefined && data.teamId !== null) {
      const t = await prisma.team.findUnique({ where: { id: data.teamId } });
      if (!t) { res.status(400).json({ error: "Team not found" }); return; }
    }

    const updateData: Prisma.ConfigItemUpdateInput = {};
    if (data.name        !== undefined) updateData.name        = data.name;
    if (data.type        !== undefined) updateData.type        = data.type as CiType;
    if (data.environment !== undefined) updateData.environment = data.environment as CiEnvironment;
    if (data.criticality !== undefined) updateData.criticality = data.criticality as CiCriticality;
    if (data.status      !== undefined) updateData.status      = data.status as CiStatus;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.tags        !== undefined) updateData.tags        = data.tags;
    if (data.ownerId     !== undefined) updateData.owner       = data.ownerId ? { connect: { id: data.ownerId } } : { disconnect: true };
    if (data.teamId      !== undefined) updateData.team        = data.teamId  ? { connect: { id: data.teamId  } } : { disconnect: true };

    const ci = await prisma.configItem.update({
      where: { id },
      data: updateData,
      select: DETAIL_SELECT,
    });

    // Log significant field changes
    const changed: Record<string, unknown> = {};
    if (data.status && data.status !== current.status) {
      changed.from = current.status;
      changed.to   = data.status;
      await logCiEvent(id, req.user.id, "ci.status_changed", changed);
    } else if (data.criticality && data.criticality !== current.criticality) {
      await logCiEvent(id, req.user.id, "ci.criticality_changed", {
        from: current.criticality,
        to:   data.criticality,
      });
    } else {
      await logCiEvent(id, req.user.id, "ci.updated", { fields: Object.keys(data) });
    }

    const relationships = [
      ...ci.relationshipsFrom.map((r) => ({
        id: r.id, type: r.type, direction: "outbound" as const, ci: r.toCi,
      })),
      ...ci.relationshipsTo.map((r) => ({
        id: r.id, type: r.type, direction: "inbound" as const, ci: r.fromCi,
      })),
    ];
    const { relationshipsFrom, relationshipsTo, ...rest } = ci;
    res.json({ ...rest, relationships });
  }
);

// ── Relationships ─────────────────────────────────────────────────────────────

// POST /api/cmdb/:id/relationships
router.post(
  "/:id/relationships",
  requireAuth,
  requirePermission("cmdb.manage"),
  async (req, res) => {
    const fromCiId = parseId(req.params.id);
    if (fromCiId === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const data = validate(addCiRelationshipSchema, req.body, res);
    if (!data) return;

    const [from, to] = await Promise.all([
      prisma.configItem.findUnique({ where: { id: fromCiId }, select: { id: true, name: true } }),
      prisma.configItem.findUnique({ where: { id: data.toCiId }, select: { id: true, name: true } }),
    ]);
    if (!from) { res.status(404).json({ error: "Source CI not found" }); return; }
    if (!to)   { res.status(404).json({ error: "Target CI not found" }); return; }
    if (fromCiId === data.toCiId) { res.status(400).json({ error: "A CI cannot relate to itself" }); return; }

    const rel = await prisma.ciRelationship.create({
      data: {
        fromCiId,
        toCiId:     data.toCiId,
        type:       data.type as any,
        createdById: req.user.id,
      },
      select: {
        id:    true,
        type:  true,
        toCi:  { select: CI_SUMMARY_SELECT },
      },
    });

    await logCiEvent(fromCiId, req.user.id, "ci.relationship_added", {
      type:   data.type,
      toCiId: data.toCiId,
      toCiName: to.name,
    });

    res.status(201).json({ id: rel.id, type: rel.type, direction: "outbound", ci: rel.toCi });
  }
);

// DELETE /api/cmdb/:id/relationships/:relId
router.delete(
  "/:id/relationships/:relId",
  requireAuth,
  requirePermission("cmdb.manage"),
  async (req, res) => {
    const ciId  = parseId(req.params.id);
    const relId = parseId(req.params.relId);
    if (ciId === null || relId === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const rel = await prisma.ciRelationship.findFirst({
      where: { id: relId, OR: [{ fromCiId: ciId }, { toCiId: ciId }] },
      select: { id: true, type: true, fromCiId: true, toCiId: true },
    });
    if (!rel) { res.status(404).json({ error: "Relationship not found" }); return; }

    await prisma.ciRelationship.delete({ where: { id: relId } });

    await logCiEvent(ciId, req.user.id, "ci.relationship_removed", {
      type: rel.type,
      relId: relId,
    });

    res.status(204).end();
  }
);

// ── CI links (attach/detach a CI to/from a ticket / incident / problem) ────────
// These endpoints are mounted here for convenience; they proxy the junction tables.

// POST /api/cmdb/links/tickets/:ticketId
router.post(
  "/links/tickets/:ticketId",
  requireAuth,
  requirePermission("cmdb.view"),  // any viewer can link a CI to a ticket
  async (req, res) => {
    const ticketId = parseId(req.params.ticketId);
    if (ticketId === null) { res.status(400).json({ error: "Invalid ticket ID" }); return; }

    const data = validate(linkCiSchema, req.body, res);
    if (!data) return;

    const [ticket, ci] = await Promise.all([
      prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true } }),
      prisma.configItem.findUnique({ where: { id: data.ciId }, select: CI_SUMMARY_SELECT }),
    ]);
    if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
    if (!ci)     { res.status(404).json({ error: "CI not found" }); return; }

    await prisma.ticketCiLink.upsert({
      where:  { ticketId_ciId: { ticketId, ciId: data.ciId } },
      create: { ticketId, ciId: data.ciId },
      update: {},
    });

    res.status(201).json(ci);
  }
);

// DELETE /api/cmdb/links/tickets/:ticketId/:ciId
router.delete(
  "/links/tickets/:ticketId/:ciId",
  requireAuth,
  requirePermission("cmdb.view"),
  async (req, res) => {
    const ticketId = parseId(req.params.ticketId);
    const ciId     = parseId(req.params.ciId);
    if (ticketId === null || ciId === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    await prisma.ticketCiLink.deleteMany({ where: { ticketId, ciId } });
    res.status(204).end();
  }
);

// POST /api/cmdb/links/incidents/:incidentId
router.post(
  "/links/incidents/:incidentId",
  requireAuth,
  requirePermission("cmdb.view"),
  async (req, res) => {
    const incidentId = parseId(req.params.incidentId);
    if (incidentId === null) { res.status(400).json({ error: "Invalid incident ID" }); return; }

    const data = validate(linkCiSchema, req.body, res);
    if (!data) return;

    const [incident, ci] = await Promise.all([
      prisma.incident.findUnique({ where: { id: incidentId }, select: { id: true } }),
      prisma.configItem.findUnique({ where: { id: data.ciId }, select: CI_SUMMARY_SELECT }),
    ]);
    if (!incident) { res.status(404).json({ error: "Incident not found" }); return; }
    if (!ci)       { res.status(404).json({ error: "CI not found" }); return; }

    await prisma.incidentCiLink.upsert({
      where:  { incidentId_ciId: { incidentId, ciId: data.ciId } },
      create: { incidentId, ciId: data.ciId },
      update: {},
    });

    await logCiEvent(data.ciId, req.user.id, "ci.linked_to_incident", { incidentId });

    res.status(201).json(ci);
  }
);

// DELETE /api/cmdb/links/incidents/:incidentId/:ciId
router.delete(
  "/links/incidents/:incidentId/:ciId",
  requireAuth,
  requirePermission("cmdb.view"),
  async (req, res) => {
    const incidentId = parseId(req.params.incidentId);
    const ciId       = parseId(req.params.ciId);
    if (incidentId === null || ciId === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    await prisma.incidentCiLink.deleteMany({ where: { incidentId, ciId } });
    res.status(204).end();
  }
);

// POST /api/cmdb/links/problems/:problemId
router.post(
  "/links/problems/:problemId",
  requireAuth,
  requirePermission("cmdb.view"),
  async (req, res) => {
    const problemId = parseId(req.params.problemId);
    if (problemId === null) { res.status(400).json({ error: "Invalid problem ID" }); return; }

    const data = validate(linkCiSchema, req.body, res);
    if (!data) return;

    const [problem, ci] = await Promise.all([
      prisma.problem.findUnique({ where: { id: problemId }, select: { id: true } }),
      prisma.configItem.findUnique({ where: { id: data.ciId }, select: CI_SUMMARY_SELECT }),
    ]);
    if (!problem) { res.status(404).json({ error: "Problem not found" }); return; }
    if (!ci)      { res.status(404).json({ error: "CI not found" }); return; }

    await prisma.problemCiLink.upsert({
      where:  { problemId_ciId: { problemId, ciId: data.ciId } },
      create: { problemId, ciId: data.ciId },
      update: {},
    });

    await logCiEvent(data.ciId, req.user.id, "ci.linked_to_problem", { problemId });

    res.status(201).json(ci);
  }
);

// DELETE /api/cmdb/links/problems/:problemId/:ciId
router.delete(
  "/links/problems/:problemId/:ciId",
  requireAuth,
  requirePermission("cmdb.view"),
  async (req, res) => {
    const problemId = parseId(req.params.problemId);
    const ciId      = parseId(req.params.ciId);
    if (problemId === null || ciId === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    await prisma.problemCiLink.deleteMany({ where: { problemId, ciId } });
    res.status(204).end();
  }
);

export default router;
