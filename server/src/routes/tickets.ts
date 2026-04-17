import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import { ticketListQuerySchema, updateTicketSchema, createTicketSchema } from "core/schemas/tickets.ts";
import prisma from "../db";
import type { Prisma } from "../generated/prisma/client";
import { AI_AGENT_ID } from "core/constants/ai-agent.ts";
import { computeSlaDeadlines, withSlaInfo } from "../lib/sla";
import { checkAndEscalate, deescalateTicket, escalateTicket } from "../lib/escalation";
import { logAudit } from "../lib/audit";
import { runRules } from "../lib/automation";
import { workflowEngine } from "../lib/workflow";
import { upsertCustomer } from "../lib/upsert-customer";
import { generateTicketNumber } from "../lib/ticket-number";
import { htmlToText } from "../lib/html-to-text";
import { notify } from "../lib/notify";

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
  ticketNumber: true,
  subject: true,
  status: true,
  ticketType: true,
  affectedSystem: true,
  category: true,
  priority: true,
  severity: true,
  impact: true,
  urgency: true,
  senderName: true,
  senderEmail: true,
  source: true,
  assignedToId: true,
  assignedTo: { select: { id: true, name: true } },
  teamId: true,
  team: { select: { id: true, name: true, color: true } },
  customer: { select: { organization: { select: { name: true } } } },
  createdAt: true,
  updatedAt: true,
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

router.post("/", requireAuth, requirePermission("tickets.create"), async (req, res) => {
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
  const customerId = await upsertCustomer(data.senderEmail, data.senderName);
  const ticketNumber = await generateTicketNumber(data.ticketType ?? null, now);

  const plainBody = data.bodyHtml ? htmlToText(data.bodyHtml) : data.body;

  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber,
      subject: data.subject,
      body: plainBody,
      bodyHtml: data.bodyHtml ?? null,
      senderName: data.senderName,
      senderEmail: data.senderEmail,
      customerId,
      ticketType: data.ticketType ?? null,
      affectedSystem: data.affectedSystem ?? null,
      category: data.category ?? null,
      priority: data.priority ?? null,
      severity: data.severity ?? null,
      impact: data.impact ?? null,
      urgency: data.urgency ?? null,
      assignedToId: data.assignedToId ?? null,
      status: "open",
      source: "agent",
      firstResponseDueAt: slaDeadlines.firstResponseDueAt,
      resolutionDueAt: slaDeadlines.resolutionDueAt,
    },
    include: {
      assignedTo: { select: { id: true, name: true } },
      escalationEvents: { orderBy: { createdAt: "asc" } },
    },
  });

  await logAudit(ticket.id, req.user.id, "ticket.created", { via: "agent" });

  // Run automation rules — may modify category, priority, or assignee
  await runRules(
    {
      id: ticket.id,
      subject: ticket.subject,
      body: ticket.body,
      status: ticket.status,
      category: ticket.category,
      priority: ticket.priority,
      severity: ticket.severity,
      senderEmail: ticket.senderEmail,
      assignedToId: ticket.assignedToId,
      createdAt: ticket.createdAt,
    },
    { trigger: "ticket.created" }
  );

  // Run DB-driven workflow engine alongside the legacy rule system
  await workflowEngine.run(
    {
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
    },
    { trigger: "ticket.created" }
  );

  // Re-fetch to pick up any rule-applied field changes before running escalation checks
  const afterRules = await prisma.ticket.findUnique({ where: { id: ticket.id } });

  // Auto-escalate if urgent or sev1 (now sees rule-applied priority)
  await checkAndEscalate(afterRules!);

  // Final re-fetch with full includes
  const fresh = await prisma.ticket.findUnique({
    where: { id: ticket.id },
    include: {
      assignedTo: { select: { id: true, name: true } },
      team: { select: { id: true, name: true, color: true } },
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
    if (query.ticketType) where.ticketType = query.ticketType;
    if (query.category) where.category = query.category;
    if (query.priority) where.priority = query.priority;
    if (query.severity) where.severity = query.severity;
    if (query.escalated !== undefined) where.isEscalated = query.escalated;
    if (query.assignedToMe) where.assignedToId = req.user.id;

    if (query.search) {
      where.OR = [
        { ticketNumber: { contains: query.search, mode: "insensitive" } },
        { subject: { contains: query.search, mode: "insensitive" } },
        { senderName: { contains: query.search, mode: "insensitive" } },
        { senderEmail: { contains: query.search, mode: "insensitive" } },
      ];
    }
    if (query.teamId !== undefined) {
      where.teamId = query.teamId === "none" ? null : query.teamId;
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
    tickets: tickets.map(t => ({
      ...withSlaInfo(t),
      organization: t.customer?.organization?.name ?? null,
      customer: undefined,
    })),
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
      team: { select: { id: true, name: true, color: true } },
      escalationEvents: { orderBy: { createdAt: "asc" } },
      auditEvents: {
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { id: true, name: true } } },
      },
      customer: {
        include: {
          organization: { select: { id: true, name: true, domain: true } },
          tickets: {
            where: { id: { not: id } },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              subject: true,
              status: true,
              priority: true,
              createdAt: true,
            },
          },
        },
      },
      csatRating: {
        select: { rating: true, comment: true, submittedAt: true },
      },
    },
  });

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  // Rename customer.tickets → customer.recentTickets to match the CustomerSummary type
  const { customer, ...rest } = ticket;
  const shaped = {
    ...rest,
    customer: customer
      ? { ...customer, recentTickets: customer.tickets, tickets: undefined }
      : null,
  };

  res.json(withSlaInfo(shaped));
});

// ─── Update ────────────────────────────────────────────────────────────────

router.patch("/:id", requireAuth, requirePermission("tickets.update"), async (req, res) => {
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

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: { assignedTo: { select: { id: true, name: true } } },
  });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const updateData: Prisma.TicketUpdateInput = {
    ...("assignedToId" in data && { assignedToId: data.assignedToId }),
    ...("status" in data && { status: data.status }),
    ...("ticketType" in data && { ticketType: data.ticketType }),
    ...("affectedSystem" in data && { affectedSystem: data.affectedSystem }),
    ...("category" in data && { category: data.category }),
    ...("priority" in data && { priority: data.priority }),
    ...("severity" in data && { severity: data.severity }),
    ...("impact" in data && { impact: data.impact }),
    ...("urgency" in data && { urgency: data.urgency }),
    ...("teamId" in data && {
      team: data.teamId == null
        ? { disconnect: true }
        : { connect: { id: data.teamId } },
    }),
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
      team: { select: { id: true, name: true, color: true } },
      escalationEvents: { orderBy: { createdAt: "asc" } },
    },
  });

  // Post-update: run auto-escalation checks based on new state
  if (data.escalate === true) {
    await escalateTicket(id, "manual", req.user.id);
  } else if (data.escalate !== false) {
    // Check auto-conditions (priority/severity changes may trigger escalation)
    await checkAndEscalate(updated);
  }
  if (data.escalate === false) {
    await logAudit(id, req.user.id, "ticket.deescalated");
  }

  // Collect and fire all field-change audit events
  const auditLogs: Promise<void>[] = [];
  if ("status" in data && data.status !== ticket.status) {
    auditLogs.push(
      logAudit(id, req.user.id, "ticket.status_changed", {
        from: ticket.status,
        to: data.status,
      })
    );
  }
  if ("priority" in data && data.priority !== ticket.priority) {
    auditLogs.push(
      logAudit(id, req.user.id, "ticket.priority_changed", {
        from: ticket.priority ?? null,
        to: data.priority ?? null,
      })
    );
  }
  if ("severity" in data && data.severity !== ticket.severity) {
    auditLogs.push(
      logAudit(id, req.user.id, "ticket.severity_changed", {
        from: ticket.severity ?? null,
        to: data.severity ?? null,
      })
    );
  }
  if ("category" in data && data.category !== ticket.category) {
    auditLogs.push(
      logAudit(id, req.user.id, "ticket.category_changed", {
        from: ticket.category ?? null,
        to: data.category ?? null,
      })
    );
  }
  if ("assignedToId" in data && data.assignedToId !== ticket.assignedToId) {
    auditLogs.push(
      logAudit(id, req.user.id, "ticket.assigned", {
        from: ticket.assignedTo
          ? { id: ticket.assignedTo.id, name: ticket.assignedTo.name }
          : null,
        to: updated.assignedTo
          ? { id: updated.assignedTo.id, name: updated.assignedTo.name }
          : null,
      })
    );
    // Notify the new assignee (skip if self-assigned or unassigned)
    if (data.assignedToId && data.assignedToId !== req.user.id) {
      void notify({
        event: "ticket.assigned",
        recipientIds: [data.assignedToId],
        title: `Ticket assigned to you`,
        body: `#${updated.ticketNumber} — ${updated.subject}`,
        entityType: "ticket",
        entityId: String(id),
        entityUrl: `/tickets/${id}`,
      });
    }
  }
  await Promise.all(auditLogs);

  // Run automation rules against the post-update ticket state
  await runRules(
    {
      id: updated.id,
      subject: updated.subject,
      body: updated.body,
      status: updated.status,
      category: updated.category,
      priority: updated.priority,
      severity: updated.severity,
      senderEmail: updated.senderEmail,
      assignedToId: updated.assignedToId,
      createdAt: updated.createdAt,
    },
    { trigger: "ticket.updated" }
  );

  // Run DB-driven workflow engine alongside the legacy rule system
  await workflowEngine.run(
    {
      id: updated.id,
      subject: updated.subject,
      body: updated.body,
      status: updated.status,
      category: updated.category,
      priority: updated.priority,
      severity: updated.severity,
      ticketType: updated.ticketType,
      senderEmail: updated.senderEmail,
      assignedToId: updated.assignedToId,
      teamId: updated.teamId,
      createdAt: updated.createdAt,
    },
    { trigger: "ticket.updated" }
  );

  // Re-fetch to get fresh escalation + rule-applied state
  const fresh = await prisma.ticket.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true } },
      team: { select: { id: true, name: true, color: true } },
      escalationEvents: { orderBy: { createdAt: "asc" } },
    },
  });

  res.json(withSlaInfo(fresh!));
});

export default router;
