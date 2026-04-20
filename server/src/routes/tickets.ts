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
import { getSection } from "../lib/settings";
import {
  createLinkedIncident,
  createLinkedServiceRequest,
  syncTicketToIncident,
  syncTicketToServiceRequest,
} from "../lib/ticket-sync";

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
  customStatusId: true,
  customStatus: { select: { id: true, label: true, color: true } },
  customTicketTypeId: true,
  customTicketType: { select: { id: true, name: true, slug: true, color: true } },
  slaPausedAt: true,
  slaPausedMinutes: true,
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
      teamId: data.teamId ?? null,
      customFields: (data.customFields ?? {}) as any,
      customTicketTypeId: data.customTicketTypeId ?? null,
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

  // Auto-create linked ITIL record based on ticket type
  if (ticket.ticketType === "incident") {
    void createLinkedIncident(ticket.id, req.user.id);
  } else if (ticket.ticketType === "service_request") {
    void createLinkedServiceRequest(ticket.id, req.user.id);
  }

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
    if (query.customStatusId) {
      where.customStatusId = query.customStatusId;
    } else if (query.status) {
      where.status = query.status;
    } else {
      where.status = { in: ["open", "in_progress", "resolved", "closed"] };
    }
    if (query.ticketType)         where.ticketType         = query.ticketType;
    if (query.customTicketTypeId) where.customTicketTypeId = query.customTicketTypeId;
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

  // ── Team-scoped visibility enforcement ──────────────────────────────────────
  // Admins and supervisors always see every ticket.
  // When teamScopedVisibility is enabled, all other roles are restricted to
  // tickets in their team(s) — unless the user has globalTicketView = true.
  const isUnrestricted = req.user.role === "admin" || req.user.role === "supervisor";
  if (!isUnrestricted) {
    const { teamScopedVisibility } = await getSection("tickets");
    if (teamScopedVisibility) {
      const userRecord = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          globalTicketView: true,
          teamMemberships: { select: { teamId: true } },
        },
      });

      if (userRecord && !userRecord.globalTicketView) {
        const userTeamIds = userRecord.teamMemberships.map((m) => m.teamId);
        if (userTeamIds.length > 0) {
          // Intersect with any explicit teamId filter the client sent
          if (query.teamId !== undefined && query.teamId !== "none") {
            const requested = query.teamId as number;
            where.teamId = userTeamIds.includes(requested)
              ? requested
              : { in: [] }; // requested team not in scope → empty result set
          } else {
            where.teamId = { in: userTeamIds };
          }
        }
        // Agent has no teams → no restriction (prevent full lockout)
      }
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
      customStatus: { select: { id: true, label: true, color: true } },
      customTicketType: { select: { id: true, name: true, slug: true, color: true } },
      linkedIncident: {
        select: {
          id: true,
          incidentNumber: true,
          title: true,
          status: true,
          priority: true,
          isMajor: true,
          affectedSystem: true,
          assignedTo: { select: { id: true, name: true } },
          team: { select: { id: true, name: true, color: true } },
          createdAt: true,
          updatedAt: true,
        },
      },
      linkedServiceRequest: {
        select: {
          id: true,
          requestNumber: true,
          title: true,
          status: true,
          priority: true,
          approvalStatus: true,
          assignedTo: { select: { id: true, name: true } },
          team: { select: { id: true, name: true, color: true } },
          createdAt: true,
          updatedAt: true,
        },
      },
      mergedInto: {
        select: { id: true, ticketNumber: true, subject: true },
      },
      mergedTickets: {
        select: { id: true, ticketNumber: true, subject: true, mergedAt: true },
        orderBy: { mergedAt: "asc" as const },
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
    select: {
      id: true,
      ticketNumber: true,
      subject: true,
      body: true,
      status: true,
      priority: true,
      severity: true,
      impact: true,
      urgency: true,
      category: true,
      ticketType: true,
      affectedSystem: true,
      senderName: true,
      senderEmail: true,
      customerId: true,
      assignedToId: true,
      teamId: true,
      createdAt: true,
      resolutionDueAt: true,
      firstResponseDueAt: true,
      firstRespondedAt: true,
      resolvedAt: true,
      slaPausedAt: true,
      slaPausedMinutes: true,
      customStatusId: true,
      linkedIncidentId: true,
      linkedServiceRequestId: true,
      assignedTo: { select: { id: true, name: true } },
    },
  });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  // Resolve new custom status and handle SLA pause transitions
  let resolvedWorkflowState: string | undefined;
  let newSlaBehavior: string | undefined;

  if ("customStatusId" in data) {
    if (data.customStatusId != null) {
      const cs = await prisma.ticketStatusConfig.findUnique({ where: { id: data.customStatusId } });
      if (!cs) {
        res.status(400).json({ error: "Invalid custom status" });
        return;
      }
      resolvedWorkflowState = cs.workflowState;
      newSlaBehavior = cs.slaBehavior;
    } else {
      // Clearing custom status — treat as "continue"
      newSlaBehavior = "continue";
    }
  } else if ("status" in data && data.status != null) {
    // Switching to a built-in status always resumes SLA
    newSlaBehavior = "continue";
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
    ...("customTicketTypeId" in data && { customTicketTypeId: data.customTicketTypeId ?? null }),
    ...("customStatusId" in data && {
      customStatusId: data.customStatusId ?? null,
      // Sync workflow state: when applying a custom status, move the ticket to its mapped state.
      // When clearing, leave the current status unchanged.
      ...(resolvedWorkflowState ? { status: resolvedWorkflowState as any } : {}),
    }),
  };

  // Handle SLA pause / resume transitions
  if (newSlaBehavior === "on_hold" && !ticket.slaPausedAt) {
    // Entering a paused status — stamp the pause start time
    updateData.slaPausedAt = new Date();
  } else if (newSlaBehavior === "continue" && ticket.slaPausedAt) {
    // Resuming from a paused status — push deadlines forward by elapsed pause time
    const now = new Date();
    const pausedMs = now.getTime() - ticket.slaPausedAt.getTime();
    const pausedMinutes = Math.round(pausedMs / 60_000);

    if (ticket.firstResponseDueAt && !ticket.firstRespondedAt) {
      updateData.firstResponseDueAt = new Date(ticket.firstResponseDueAt.getTime() + pausedMs);
    }
    if (ticket.resolutionDueAt && !ticket.resolvedAt) {
      updateData.resolutionDueAt = new Date(ticket.resolutionDueAt.getTime() + pausedMs);
    }
    updateData.slaPausedAt = null;
    updateData.slaPausedMinutes = (ticket.slaPausedMinutes ?? 0) + pausedMinutes;
    // After pushing deadlines forward, re-evaluate breach flag
    const newResolutionDue = (updateData.resolutionDueAt as Date | undefined) ?? ticket.resolutionDueAt;
    const newFirstResponseDue = (updateData.firstResponseDueAt as Date | undefined) ?? ticket.firstResponseDueAt;
    if ((!newResolutionDue || newResolutionDue > now) && (!newFirstResponseDue || newFirstResponseDue > now)) {
      updateData.slaBreached = false;
    }
  }

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

    // Notify followers of the status change (fire-and-forget)
    void (async () => {
      const settings = await getSection("notifications");
      if (settings?.notifyOnFollowedTicketStatusChanged === false) return;

      const followers = await prisma.ticketFollower.findMany({
        where: { ticketId: id },
        select: { userId: true },
      });
      const recipientIds = followers.map((f) => f.userId).filter((uid) => uid !== req.user.id);
      if (recipientIds.length === 0) return;

      const fromLabel = ticket.status.replace(/_/g, " ");
      const toLabel = (data.status as string).replace(/_/g, " ");
      await notify({
        event: "ticket.followed_status_changed",
        recipientIds,
        title: `${ticket.ticketNumber} status changed`,
        body: `${fromLabel} → ${toLabel}: ${ticket.subject}`,
        entityType: "ticket",
        entityId: String(id),
        entityUrl: `/tickets/${id}`,
      });
    })();
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

  // Sync changes to linked ITIL records (fire-and-forget)
  const syncChanges = {
    ...("status" in data && { status: data.status }),
    ...("priority" in data && { priority: data.priority }),
    ...("severity" in data && { severity: data.severity }),
    ...("affectedSystem" in data && { affectedSystem: data.affectedSystem }),
    ...("assignedToId" in data && { assignedToId: data.assignedToId }),
    ...("teamId" in data && { teamId: data.teamId }),
  };

  // If ticket type was just set (no existing link), create the linked record
  if ("ticketType" in data) {
    const newType = data.ticketType;
    if (newType === "incident" && !ticket.linkedIncidentId) {
      void createLinkedIncident(id, req.user.id);
    } else if (newType === "service_request" && !ticket.linkedServiceRequestId) {
      void createLinkedServiceRequest(id, req.user.id);
    } else if (newType === "incident" && ticket.linkedIncidentId) {
      void syncTicketToIncident(ticket.linkedIncidentId, syncChanges);
    } else if (newType === "service_request" && ticket.linkedServiceRequestId) {
      void syncTicketToServiceRequest(ticket.linkedServiceRequestId, syncChanges);
    }
  } else {
    if (ticket.linkedIncidentId && Object.keys(syncChanges).length > 0) {
      void syncTicketToIncident(ticket.linkedIncidentId, syncChanges);
    }
    if (ticket.linkedServiceRequestId && Object.keys(syncChanges).length > 0) {
      void syncTicketToServiceRequest(ticket.linkedServiceRequestId, syncChanges);
    }
  }

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

// ─── Bulk Actions ──────────────────────────────────────────────────────────────

import { z } from "zod/v4";
import type { WorkflowAction, TicketWorkflowSnapshot } from "../lib/workflow/types";
import { executeWorkflowActions } from "../lib/workflow/actions";

// ─── Merge ─────────────────────────────────────────────────────────────────

router.post("/:id/merge", requireAuth, requirePermission("tickets.update"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ticket ID" }); return; }

  const targetId = typeof req.body.targetId === "number" ? req.body.targetId : parseId(String(req.body.targetId ?? ""));
  if (!targetId) { res.status(400).json({ error: "targetId is required" }); return; }
  if (id === targetId) { res.status(422).json({ error: "A ticket cannot be merged into itself" }); return; }

  const settings = await getSection("tickets");
  if (settings?.mergeTicketsEnabled === false) {
    res.status(403).json({ error: "Ticket merging is disabled" }); return;
  }

  const [source, target] = await Promise.all([
    prisma.ticket.findUnique({ where: { id },       select: { id: true, status: true, mergedIntoId: true, subject: true, ticketNumber: true } }),
    prisma.ticket.findUnique({ where: { id: targetId }, select: { id: true, status: true, mergedIntoId: true, ticketNumber: true } }),
  ]);

  if (!source) { res.status(404).json({ error: "Ticket not found" }); return; }
  if (!target) { res.status(404).json({ error: "Target ticket not found" }); return; }
  if (source.mergedIntoId) { res.status(422).json({ error: "This ticket has already been merged" }); return; }
  if (target.mergedIntoId) { res.status(422).json({ error: "Cannot merge into a ticket that has itself been merged" }); return; }

  const now = new Date();
  await prisma.ticket.update({
    where: { id },
    data: { mergedIntoId: targetId, mergedAt: now, status: "closed" },
  });

  await Promise.all([
    logAudit(id,       req.user.id, "ticket.merged",          { mergedIntoId: targetId, targetNumber: target.ticketNumber }),
    logAudit(targetId, req.user.id, "ticket.received_merge",  { fromId: id, fromNumber: source.ticketNumber }),
  ]);

  res.json({ ok: true, mergedAt: now });
});

// ─── Search (for merge picker) ─────────────────────────────────────────────

router.get("/search", requireAuth, async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const excludeId = parseId(String(req.query.exclude ?? "")) ?? undefined;
  if (!q) { res.json({ tickets: [] }); return; }

  const tickets = await prisma.ticket.findMany({
    where: {
      AND: [
        { status: { notIn: ["new", "processing"] } },
        { mergedIntoId: null },
        ...(excludeId ? [{ id: { not: excludeId } }] : []),
        {
          OR: [
            { ticketNumber: { contains: q, mode: "insensitive" as const } },
            { subject:      { contains: q, mode: "insensitive" as const } },
            { senderEmail:  { contains: q, mode: "insensitive" as const } },
          ],
        },
      ],
    },
    select: { id: true, ticketNumber: true, subject: true, status: true, senderName: true },
    take: 10,
    orderBy: { updatedAt: "desc" },
  });

  res.json({ tickets });
});

// ─── Bulk ──────────────────────────────────────────────────────────────────

const bulkActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("delete"),
    ids:    z.array(z.number().int().positive()).min(1).max(100),
  }),
  z.object({
    action:      z.literal("assign"),
    ids:         z.array(z.number().int().positive()).min(1).max(100),
    assignedToId: z.string().nullable().optional(),
    teamId:       z.number().int().positive().nullable().optional(),
  }),
  z.object({
    action:         z.literal("status"),
    ids:            z.array(z.number().int().positive()).min(1).max(100),
    status:         z.string().optional(),
    customStatusId: z.number().int().positive().nullable().optional(),
  }),
  z.object({
    action:     z.literal("scenario"),
    ids:        z.array(z.number().int().positive()).min(1).max(100),
    scenarioId: z.number().int().positive(),
  }),
  z.object({
    action:   z.literal("merge"),
    ids:      z.array(z.number().int().positive()).min(1).max(100),
    targetId: z.number().int().positive(),
  }),
]);

router.post("/bulk", requireAuth, requirePermission("tickets.update"), async (req, res) => {
  const data = validate(bulkActionSchema, req.body, res);
  if (!data) return;

  switch (data.action) {
    case "delete": {
      const { count } = await prisma.ticket.deleteMany({ where: { id: { in: data.ids } } });
      res.json({ affected: count });
      return;
    }

    case "assign": {
      const updatePayload: Prisma.TicketUpdateManyMutationInput = {};
      if ("assignedToId" in data) updatePayload.assignedToId = data.assignedToId ?? null;
      if ("teamId" in data) {
        // Use raw update since teamId maps to queueId
        await prisma.ticket.updateMany({
          where: { id: { in: data.ids } },
          data: {
            ...(data.assignedToId !== undefined && { assignedToId: data.assignedToId }),
            ...(data.teamId !== undefined && { queueId: data.teamId }),
          } as any,
        });
        res.json({ affected: data.ids.length });
        return;
      }
      const { count } = await prisma.ticket.updateMany({
        where: { id: { in: data.ids } },
        data: updatePayload,
      });
      res.json({ affected: count });
      return;
    }

    case "status": {
      let workflowState: string | undefined;
      if (data.customStatusId) {
        const cs = await prisma.ticketStatusConfig.findUnique({ where: { id: data.customStatusId } });
        if (cs) workflowState = cs.workflowState;
      }
      await prisma.ticket.updateMany({
        where: { id: { in: data.ids } },
        data: {
          ...(data.status && { status: data.status as any }),
          ...(workflowState && { status: workflowState as any }),
          customStatusId: data.customStatusId ?? null,
        },
      });
      res.json({ affected: data.ids.length });
      return;
    }

    case "scenario": {
      const scenario = await prisma.scenarioDefinition.findUnique({ where: { id: data.scenarioId } });
      if (!scenario || !scenario.isEnabled) {
        res.status(404).json({ error: "Scenario not found or disabled" });
        return;
      }

      const tickets = await prisma.ticket.findMany({
        where: {
          id: { in: data.ids },
          status: { notIn: ["new", "processing"] },
        },
        select: {
          id: true, subject: true, body: true, status: true, category: true,
          priority: true, severity: true, ticketType: true, senderEmail: true,
          assignedToId: true, teamId: true, createdAt: true,
        },
      });

      const rawActions = scenario.actions as unknown as WorkflowAction[];
      const actions = rawActions.map((a) =>
        a.type === "assign_user" && (a as any).agentId === "__me__"
          ? { ...a, agentId: req.user.id, agentName: req.user.name }
          : a
      );

      let affected = 0;
      for (const ticket of tickets) {
        try {
          const snapshot: TicketWorkflowSnapshot = {
            id: ticket.id, subject: ticket.subject, body: ticket.body,
            status: ticket.status, category: ticket.category, priority: ticket.priority,
            severity: ticket.severity, ticketType: ticket.ticketType,
            senderEmail: ticket.senderEmail, assignedToId: ticket.assignedToId,
            teamId: ticket.teamId, createdAt: ticket.createdAt,
          };
          const results = await executeWorkflowActions(actions, snapshot);
          const execution = await prisma.scenarioExecution.create({
            data: { scenarioId: data.scenarioId, ticketId: ticket.id, invokedById: req.user.id, status: "completed", startedAt: new Date(), completedAt: new Date() },
          });
          if (results.length > 0) {
            await prisma.scenarioExecutionStep.createMany({
              data: results.map((r) => ({ executionId: execution.id, actionType: r.type, status: r.success ? "completed" : "failed", resultSummary: r.summary ?? null })),
            });
          }
          void logAudit(ticket.id, req.user.id, "scenario.run", { scenarioId: data.scenarioId, scenarioName: scenario.name });
          affected++;
        } catch {
          // Continue processing remaining tickets even if one fails
        }
      }

      res.json({ affected });
      return;
    }

    case "merge": {
      const settings = await getSection("tickets");
      if (settings?.mergeTicketsEnabled === false) {
        res.status(403).json({ error: "Ticket merging is disabled" }); return;
      }

      const idsToMerge = data.ids.filter((i) => i !== data.targetId);
      if (idsToMerge.length === 0) { res.json({ affected: 0 }); return; }

      const now = new Date();
      const { count } = await prisma.ticket.updateMany({
        where: { id: { in: idsToMerge }, mergedIntoId: null },
        data: { mergedIntoId: data.targetId, mergedAt: now, status: "closed" },
      });

      // Audit all merged tickets (fire-and-forget)
      void Promise.all(
        idsToMerge.map((tid) =>
          logAudit(tid, req.user.id, "ticket.merged", { mergedIntoId: data.targetId })
        )
      );
      void logAudit(data.targetId, req.user.id, "ticket.received_merge", { count });

      res.json({ affected: count });
      return;
    }
  }
});

export default router;
