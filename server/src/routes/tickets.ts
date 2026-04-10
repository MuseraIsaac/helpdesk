import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import { ticketListQuerySchema, updateTicketSchema, createTicketSchema } from "core/schemas/tickets.ts";
import prisma from "../db";
import type { Prisma } from "../generated/prisma/client";
import { AI_AGENT_ID } from "core/constants/ai-agent.ts";
import { computeSlaDeadlines, withSlaInfo } from "../lib/sla";
import { checkAndEscalate, deescalateTicket, escalateTicket } from "../lib/escalation";

interface TicketStatsRow {
  totalTickets: bigint;
  openTickets: bigint;
  resolvedByAI: bigint;
  aiResolutionRate: number;
  avgResolutionTime: number;
}

// Fields projected for the list endpoint — no body/bodyHtml for performance
const LIST_SELECT = {
  id: true,
  subject: true,
  status: true,
  category: true,
  priority: true,
  severity: true,
  impact: true,
  urgency: true,
  senderName: true,
  senderEmail: true,
  assignedToId: true,
  createdAt: true,
  firstResponseDueAt: true,
  resolutionDueAt: true,
  firstRespondedAt: true,
  resolvedAt: true,
  slaBreached: true,
  isEscalated: true,
  escalatedAt: true,
  escalationReason: true,
} as const;

const router = Router();

// ─── Stats ─────────────────────────────────────────────────────────────────

router.get("/stats", requireAuth, async (_req, res) => {
  const [row] = await prisma.$queryRaw<
    [TicketStatsRow]
  >`SELECT * FROM get_ticket_stats(${AI_AGENT_ID})`;

  res.json({
    totalTickets: Number(row.totalTickets),
    openTickets: Number(row.openTickets),
    resolvedByAI: Number(row.resolvedByAI),
    aiResolutionRate: row.aiResolutionRate,
    avgResolutionTime: row.avgResolutionTime,
  });
});

router.get("/stats/daily-volume", requireAuth, async (_req, res) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const tickets = await prisma.ticket.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    select: { createdAt: true },
  });

  const countsByDate = new Map<string, number>();
  for (const t of tickets) {
    const dateKey = t.createdAt.toISOString().slice(0, 10);
    countsByDate.set(dateKey, (countsByDate.get(dateKey) ?? 0) + 1);
  }

  const data: { date: string; tickets: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(thirtyDaysAgo);
    d.setDate(d.getDate() + i);
    const dateKey = d.toISOString().slice(0, 10);
    data.push({ date: dateKey, tickets: countsByDate.get(dateKey) ?? 0 });
  }

  res.json({ data });
});

// ─── Create ────────────────────────────────────────────────────────────────

router.post("/", requireAuth, async (req, res) => {
  const data = validate(createTicketSchema, req.body, res);
  if (!data) return;

  if (data.assignedToId) {
    const user = await prisma.user.findUnique({
      where: { id: data.assignedToId, deletedAt: null },
    });
    if (!user) {
      res.status(400).json({ error: "Invalid agent" });
      return;
    }
  }

  const now = new Date();
  const slaDeadlines = computeSlaDeadlines(data.priority ?? null, now);

  const ticket = await prisma.ticket.create({
    data: {
      subject: data.subject,
      body: data.body,
      senderName: data.senderName,
      senderEmail: data.senderEmail,
      category: data.category ?? null,
      priority: data.priority ?? null,
      severity: data.severity ?? null,
      impact: data.impact ?? null,
      urgency: data.urgency ?? null,
      assignedToId: data.assignedToId ?? null,
      status: "open",
      firstResponseDueAt: slaDeadlines.firstResponseDueAt,
      resolutionDueAt: slaDeadlines.resolutionDueAt,
    },
    include: {
      assignedTo: { select: { id: true, name: true } },
      escalationEvents: { orderBy: { createdAt: "asc" } },
    },
  });

  // Auto-escalate immediately if urgent or sev1
  await checkAndEscalate(ticket);

  // Re-fetch to get updated escalation state if it changed
  const fresh = await prisma.ticket.findUnique({
    where: { id: ticket.id },
    include: {
      assignedTo: { select: { id: true, name: true } },
      escalationEvents: { orderBy: { createdAt: "asc" } },
    },
  });

  res.status(201).json(withSlaInfo(fresh!));
});

// ─── List ──────────────────────────────────────────────────────────────────

router.get("/", requireAuth, async (req, res) => {
  const query = validate(ticketListQuerySchema, req.query, res);
  if (!query) return;

  const now = new Date();
  const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  let where: Prisma.TicketWhereInput = {};

  if (query.view === "overdue") {
    // Active tickets with at least one blown SLA deadline
    where = {
      status: { notIn: ["resolved", "closed", "new", "processing"] },
      slaBreached: true,
    };
  } else if (query.view === "at_risk") {
    // Active tickets whose nearest unmet deadline is within 2 hours (but not yet breached)
    where = {
      status: { notIn: ["resolved", "closed", "new", "processing"] },
      slaBreached: false,
      OR: [
        {
          firstRespondedAt: null,
          firstResponseDueAt: { gt: now, lte: twoHoursFromNow },
        },
        {
          resolvedAt: null,
          resolutionDueAt: { gt: now, lte: twoHoursFromNow },
        },
      ],
    };
  } else if (query.view === "unassigned_urgent") {
    // Open urgent tickets with no assignee
    where = {
      status: { notIn: ["resolved", "closed"] },
      priority: "urgent",
      assignedToId: null,
    };
  } else {
    // Standard filter path
    if (query.status) {
      where.status = query.status;
    } else {
      where.status = { in: ["open", "resolved", "closed"] };
    }
    if (query.category) where.category = query.category;
    if (query.priority) where.priority = query.priority;
    if (query.severity) where.severity = query.severity;
    if (query.escalated !== undefined) where.isEscalated = query.escalated;

    if (query.search) {
      where.OR = [
        { subject: { contains: query.search, mode: "insensitive" } },
        { senderName: { contains: query.search, mode: "insensitive" } },
        { senderEmail: { contains: query.search, mode: "insensitive" } },
      ];
    }
  }

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      select: LIST_SELECT,
      where,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.ticket.count({ where }),
  ]);

  res.json({
    tickets: tickets.map(withSlaInfo),
    total,
    page: query.page,
    pageSize: query.pageSize,
  });
});

// ─── Detail ────────────────────────────────────────────────────────────────

router.get("/:id", requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true } },
      escalationEvents: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  res.json(withSlaInfo(ticket));
});

// ─── Update ────────────────────────────────────────────────────────────────

router.patch("/:id", requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }

  const data = validate(updateTicketSchema, req.body, res);
  if (!data) return;

  if (data.assignedToId) {
    const user = await prisma.user.findUnique({
      where: { id: data.assignedToId, deletedAt: null },
    });
    if (!user) {
      res.status(400).json({ error: "Invalid agent" });
      return;
    }
  }

  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const updateData: Prisma.TicketUpdateInput = {
    ...("assignedToId" in data && { assignedToId: data.assignedToId }),
    ...("status" in data && { status: data.status }),
    ...("category" in data && { category: data.category }),
    ...("priority" in data && { priority: data.priority }),
    ...("severity" in data && { severity: data.severity }),
    ...("impact" in data && { impact: data.impact }),
    ...("urgency" in data && { urgency: data.urgency }),
  };

  // Recalculate SLA deadlines when priority changes
  if ("priority" in data) {
    const now = new Date();
    const newDeadlines = computeSlaDeadlines(data.priority ?? null, ticket.createdAt);
    updateData.firstResponseDueAt = newDeadlines.firstResponseDueAt;
    updateData.resolutionDueAt = newDeadlines.resolutionDueAt;
    if (newDeadlines.firstResponseDueAt > now && newDeadlines.resolutionDueAt > now) {
      updateData.slaBreached = false;
    }
  }

  // Stamp resolvedAt when moving to a terminal status
  if ("status" in data && (data.status === "resolved" || data.status === "closed")) {
    const now = new Date();
    updateData.resolvedAt = now;
    if (ticket.resolutionDueAt && now > ticket.resolutionDueAt) {
      updateData.slaBreached = true;
    }
  }

  // Handle manual de-escalation inline (escalation is handled after the update)
  if (data.escalate === false) {
    updateData.isEscalated = false;
  }

  const updated = await prisma.ticket.update({
    where: { id },
    data: updateData,
    include: {
      assignedTo: { select: { id: true, name: true } },
      escalationEvents: { orderBy: { createdAt: "asc" } },
    },
  });

  // Post-update: run auto-escalation checks based on new state
  if (data.escalate === true) {
    await escalateTicket(id, "manual");
  } else if (data.escalate !== false) {
    // Check auto-conditions (priority/severity changes may trigger escalation)
    await checkAndEscalate(updated);
  }

  // Re-fetch to get fresh escalation state
  const fresh = await prisma.ticket.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true } },
      escalationEvents: { orderBy: { createdAt: "asc" } },
    },
  });

  res.json(withSlaInfo(fresh!));
});

export default router;
