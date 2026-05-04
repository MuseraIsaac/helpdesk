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
import { runIntakeRouting } from "../lib/intake-routing";
import { fireTicketEvent } from "../lib/event-bus";

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
  // Last reply preview for hover card
  replies: {
    select: { body: true, senderType: true, user: { select: { name: true } }, createdAt: true },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
  // Last internal note preview for hover card
  notes: {
    select: { body: true, author: { select: { name: true } }, createdAt: true },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
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

  // SQL-side bucket — pulls back at most 30 rows over the wire instead of
  // every ticket's createdAt for the period. Critical for low-latency
  // dashboard refresh once volume scales.
  type Row = { date: Date; count: bigint };
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT date_trunc('day', "createdAt")::date AS date,
           COUNT(*)::bigint                     AS count
      FROM "ticket"
     WHERE "createdAt" >= ${thirtyDaysAgo}
       AND "deleted_at" IS NULL
     GROUP BY 1
     ORDER BY 1
  `;

  const countsByDate = new Map<string, number>();
  for (const r of rows) {
    countsByDate.set(r.date.toISOString().slice(0, 10), Number(r.count));
  }

  const data: { date: string; tickets: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(thirtyDaysAgo);
    d.setDate(d.getDate() + i);
    const dateKey = d.toISOString().slice(0, 10);
    data.push({ date: dateKey, tickets: countsByDate.get(dateKey) ?? 0 });
  }

  // Cache hint — dashboard refetches this every minute or so; 30 s of
  // shared CDN/proxy cache is harmless and shaves repeat hits.
  res.set("Cache-Control", "private, max-age=30");
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
      organizationId: data.organizationId ?? null,
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

  // Auto-create linked ITIL record based on ticket type.
  // Note: service_request tickets are NOT mirrored into a separate
  // ServiceRequest row — the ticket itself IS the service request.
  // /requests is reserved for standalone service requests submitted by
  // internal agents or by customers via the portal. Analytics aggregates
  // both surfaces; see lib/request-aggregate.ts.
  if (ticket.ticketType === "incident") {
    void createLinkedIncident(ticket.id, req.user.id);
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

  // Run intake routing rules (no email meta for agent-created tickets)
  void runIntakeRouting(ticket.id, null);

  // Fire ticket.created through the event_workflow engine
  fireTicketEvent("ticket.created", ticket.id, req.user.id);

  // Re-fetch to pick up any rule-applied field changes
  const afterRules = await prisma.ticket.findUnique({ where: { id: ticket.id } });
  void afterRules; // escalation is now manual-only — no auto-escalation on creation

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

  let where: Prisma.TicketWhereInput = { deletedAt: null };

  if (query.view === "overdue") {
    // Active tickets with at least one blown SLA deadline
    where = {
      deletedAt: null,
      status: { notIn: ["resolved", "closed", "new", "processing"] },
      slaBreached: true,
    };
  } else if (query.view === "at_risk") {
    // Active tickets whose nearest unmet deadline is within 2 hours (but not yet breached)
    where = {
      deletedAt: null,
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
      deletedAt: null,
      status: { notIn: ["resolved", "closed"] },
      priority: "urgent",
      assignedToId: null,
    };
  } else {
    // Standard filter path
    // Status: built-in statuses OR custom statuses can be combined via OR
    const statusClauses: Prisma.TicketWhereInput[] = [];
    if (query.status?.length) {
      statusClauses.push({
        status: query.status.length === 1
          ? (query.status[0] as any)
          : { in: query.status as any[] },
      });
    }
    if (query.customStatusId?.length) {
      statusClauses.push({
        customStatusId: query.customStatusId.length === 1
          ? query.customStatusId[0]
          : { in: query.customStatusId },
      });
    }
    if (statusClauses.length === 1) {
      Object.assign(where, statusClauses[0]);
    } else if (statusClauses.length > 1) {
      where.OR = ([] as Prisma.TicketWhereInput[]).concat(where.OR ?? []).concat(statusClauses);
    } else {
      where.status = { in: ["open", "in_progress", "resolved", "closed"] };
    }

    // Ticket type: built-in types OR custom type IDs combined via OR
    const typeClauses: Prisma.TicketWhereInput[] = [];
    if (query.ticketType?.length) {
      typeClauses.push({
        ticketType: query.ticketType.length === 1
          ? (query.ticketType[0] as any)
          : { in: query.ticketType as any[] },
      });
    }
    if (query.customTicketTypeId?.length) {
      typeClauses.push({
        customTicketTypeId: query.customTicketTypeId.length === 1
          ? query.customTicketTypeId[0]
          : { in: query.customTicketTypeId },
      });
    }
    if (typeClauses.length === 1) {
      Object.assign(where, typeClauses[0]);
    } else if (typeClauses.length > 1) {
      where.AND = ([] as Prisma.TicketWhereInput[])
        .concat(where.AND ?? [])
        .concat([{ OR: typeClauses }]);
    }

    if (query.category?.length) where.category = query.category.length === 1 ? query.category[0] as any : { in: query.category as any[] };
    if (query.priority?.length) where.priority = query.priority.length === 1 ? query.priority[0] as any : { in: query.priority as any[] };
    if (query.severity?.length) where.severity = query.severity.length === 1 ? query.severity[0] as any : { in: query.severity as any[] };
    if (query.escalated !== undefined) where.isEscalated = query.escalated;

    // Assignee: assignedToMe / unassigned override; otherwise treat as multi-value
    if (query.assignedToMe) {
      where.assignedToId = req.user.id;
    } else if (query.unassigned) {
      where.assignedToId = null;
    } else if (query.assignedToId?.length) {
      where.assignedToId = query.assignedToId.length === 1
        ? query.assignedToId[0]
        : { in: query.assignedToId };
    }

    if (query.impact?.length)   where.impact  = query.impact.length  === 1 ? query.impact[0]  as any : { in: query.impact  as any[] };
    if (query.urgency?.length)  where.urgency = query.urgency.length === 1 ? query.urgency[0] as any : { in: query.urgency as any[] };
    if (query.source?.length)   where.source  = query.source.length  === 1 ? query.source[0]  as any : { in: query.source  as any[] };
    if (query.slaBreached !== undefined) where.slaBreached = query.slaBreached;

    if (query.search) {
      where.OR = ([] as Prisma.TicketWhereInput[]).concat(where.OR ?? []).concat([
        { ticketNumber: { contains: query.search, mode: "insensitive" } },
        { subject:      { contains: query.search, mode: "insensitive" } },
        { senderName:   { contains: query.search, mode: "insensitive" } },
        { senderEmail:  { contains: query.search, mode: "insensitive" } },
      ]);
    }

    // Team: combine numeric IDs and the "none" sentinel into a single OR
    if (query.teamId?.length) {
      const ids   = query.teamId.filter((v): v is number => typeof v === "number");
      const hasNone = query.teamId.includes("none");
      const clauses: Prisma.TicketWhereInput[] = [];
      if (ids.length) clauses.push({ teamId: ids.length === 1 ? ids[0] : { in: ids } });
      if (hasNone)    clauses.push({ teamId: null });
      if (clauses.length === 1) Object.assign(where, clauses[0]);
      else if (clauses.length > 1) {
        where.AND = ([] as Prisma.TicketWhereInput[])
          .concat(where.AND ?? [])
          .concat([{ OR: clauses }]);
      }
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
          const requestedTeamIds = (query.teamId ?? []).filter(
            (v): v is number => typeof v === "number",
          );
          if (requestedTeamIds.length > 0) {
            const allowed = requestedTeamIds.filter((id) => userTeamIds.includes(id));
            where.teamId = allowed.length === 0
              ? { in: [] }                                  // none in scope → empty result
              : allowed.length === 1 ? allowed[0] : { in: allowed };
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
    tickets: tickets.map(t => {
      const raw = t as typeof t & {
        replies?: { body: string; senderType: string; user: { name: string } | null; createdAt: Date }[];
        notes?:   { body: string; author: { name: string } | null; createdAt: Date }[];
      };
      const lastReplyRow = raw.replies?.[0] ?? null;
      const lastNoteRow  = raw.notes?.[0]   ?? null;

      // The hover preview only renders a short excerpt — truncate so a single
      // huge inbound email body doesn't bloat the list response by megabytes.
      const PREVIEW_LEN = 280;
      const truncate = (s: string) =>
        s.length > PREVIEW_LEN ? s.slice(0, PREVIEW_LEN) + "…" : s;

      return {
        ...withSlaInfo(t),
        organization: t.customer?.organization?.name ?? null,
        customer:     undefined,
        replies:      undefined,
        notes:        undefined,
        lastReply: lastReplyRow ? {
          body:       truncate(lastReplyRow.body),
          senderType: lastReplyRow.senderType as "agent" | "customer",
          authorName: lastReplyRow.user?.name ?? null,
          createdAt:  lastReplyRow.createdAt.toISOString(),
        } : null,
        lastNote: lastNoteRow ? {
          body:       truncate(lastNoteRow.body),
          authorName: lastNoteRow.author?.name ?? null,
          createdAt:  lastNoteRow.createdAt.toISOString(),
        } : null,
      };
    }),
    total,
    page: query.page,
    pageSize: query.pageSize,
  });
});

// ─── Search (for merge picker) — must be before /:id ──────────────────────

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

// ─── Detail ────────────────────────────────────────────────────────────────

/**
 * Shared `include` block for ticket-detail responses.
 *
 * Used by both `GET /:id` and the post-PATCH re-fetch so the client receives
 * the same rich shape regardless of how the ticket arrived. When the PATCH
 * response was thinner than the GET, `setQueryData(updated)` on the client
 * silently dropped relations like `customStatus`, `customTicketType`,
 * `linkedIncident`, `csatRating`, etc. — the UI then re-rendered against the
 * pruned cache and fields that read those relations appeared to "revert".
 */
function ticketDetailInclude(id: number) {
  return {
    assignedTo: { select: { id: true, name: true } },
    team: { select: { id: true, name: true, color: true } },
    escalationEvents: { orderBy: { createdAt: "asc" as const } },
    escalatedToTeam: { select: { id: true, name: true, color: true } },
    escalatedToUser: { select: { id: true, name: true } },
    // Cap audit history to the most recent 200 events (chronological in
    // response). Tickets with thousands of automation/system events were
    // dominating detail-page latency. Older events can be loaded on demand
    // via a future paginated endpoint.
    auditEvents: {
      orderBy: { createdAt: "desc" as const },
      take: 200,
      include: { actor: { select: { id: true, name: true } } },
    },
    customer: {
      include: {
        organization: { select: { id: true, name: true, domain: true } },
        tickets: {
          where: { id: { not: id } },
          orderBy: { createdAt: "desc" as const },
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
    ciLinks: {
      orderBy: { linkedAt: "desc" as const },
      select: {
        linkedAt: true,
        ci: {
          select: {
            id: true, ciNumber: true, name: true,
            type: true, status: true, environment: true,
          },
        },
      },
    },
    assetLinks: {
      orderBy: { linkedAt: "desc" as const },
      select: {
        linkedAt: true,
        asset: {
          select: {
            id: true, assetNumber: true, name: true,
            type: true, status: true,
          },
        },
      },
    },
  } satisfies Prisma.TicketInclude;
}

router.get("/:id", requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }

  const ticket = await prisma.ticket.findFirst({
    where: { id, deletedAt: null },
    include: ticketDetailInclude(id),
  });

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  // Rename customer.tickets → customer.recentTickets to match the CustomerSummary type.
  // Reverse audit events so they're returned oldest-first (DB query is desc + take).
  const { customer, auditEvents, ...rest } = ticket;
  const shaped = {
    ...rest,
    auditEvents: auditEvents.slice().reverse(),
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
    ...("teamId" in data && { teamId: data.teamId ?? null }),
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

  // Stamp statusChangedAt when status changes (used by time-supervisor for hoursInCurrentStatus)
  if ("status" in data && data.status !== ticket.status) {
    updateData.statusChangedAt = new Date() as any;
  }

  // The "effective" target status is whichever of these arrives first:
  //   1. `data.status` if explicitly set
  //   2. `resolvedWorkflowState` (set when a custom status maps to resolved/closed)
  // Both paths must enforce the required-field policy below.
  const effectiveTargetStatus =
    "status" in data && data.status != null ? data.status : resolvedWorkflowState;

  // Stamp resolvedAt when moving to a terminal status
  if (effectiveTargetStatus === "resolved" || effectiveTargetStatus === "closed") {
    // ── Required-field enforcement ─────────────────────────────────────────
    //
    // Admins can configure (in Settings → Tickets) a list of fields that
    // must have a non-empty value before an agent is allowed to mark a
    // ticket resolved or closed. This guarantees consistent post-mortem
    // data — e.g. category + root cause filled before sign-off.
    const ticketSettings = await getSection("tickets");
    const requiredKeys =
      effectiveTargetStatus === "resolved"
        ? ticketSettings.resolveRequiredFields
        : ticketSettings.closeRequiredFields;

    if (Array.isArray(requiredKeys) && requiredKeys.length > 0) {
      // Merge incoming patch with existing ticket so a value being set in
      // the same request also satisfies the requirement.
      type AnyTicket = typeof ticket & { customFields?: Record<string, unknown> };
      const fullTicket = await prisma.ticket.findUnique({
        where: { id },
        select: { customFields: true },
      });
      const merged: Record<string, unknown> = {
        priority:       "priority"        in data ? data.priority        : ticket.priority,
        severity:       "severity"        in data ? data.severity        : ticket.severity,
        impact:         "impact"          in data ? data.impact          : ticket.impact,
        urgency:        "urgency"         in data ? data.urgency         : ticket.urgency,
        category:       "category"        in data ? data.category        : ticket.category,
        ticketType:     "ticketType"      in data ? data.ticketType      : ticket.ticketType,
        assignedToId:   "assignedToId"    in data ? data.assignedToId    : ticket.assignedToId,
        teamId:         "teamId"          in data ? data.teamId          : ticket.teamId,
        affectedSystem: "affectedSystem"  in data ? data.affectedSystem  : ticket.affectedSystem,
      };
      const customFields = (fullTicket?.customFields as Record<string, unknown> | null) ?? {};
      const incomingCustom = (data as { customFields?: Record<string, unknown> }).customFields ?? {};
      const mergedCustom = { ...customFields, ...incomingCustom };

      const isEmpty = (v: unknown): boolean =>
        v === undefined || v === null || v === "" ||
        (Array.isArray(v) && v.length === 0);

      const missing: string[] = [];
      for (const key of requiredKeys) {
        if (typeof key !== "string") continue;
        if (key.startsWith("cf.")) {
          const cfKey = key.slice(3);
          if (isEmpty(mergedCustom[cfKey])) missing.push(key);
        } else if (key in merged) {
          if (isEmpty(merged[key])) missing.push(key);
        }
      }

      if (missing.length > 0) {
        // Resolve human labels — built-in keys are static, custom-field
        // keys are looked up from the CustomField table for nice messages.
        const BUILTIN_LABEL: Record<string, string> = {
          priority:       "Priority",
          severity:       "Severity",
          impact:         "Impact",
          urgency:        "Urgency",
          category:       "Category",
          ticketType:     "Ticket type",
          assignedToId:   "Assigned agent",
          teamId:         "Team",
          affectedSystem: "Affected system",
        };
        const cfKeys = missing.filter((k) => k.startsWith("cf.")).map((k) => k.slice(3));
        const cfRows = cfKeys.length > 0
          ? await prisma.customField.findMany({
              where:  { entityType: "ticket", key: { in: cfKeys } },
              select: { key: true, label: true },
            })
          : [];
        const cfLabel = new Map(cfRows.map((c) => [c.key, c.label]));
        const labels = missing.map((k) =>
          k.startsWith("cf.") ? (cfLabel.get(k.slice(3)) ?? k.slice(3)) : (BUILTIN_LABEL[k] ?? k)
        );
        res.status(400).json({
          error: `Cannot ${effectiveTargetStatus === "resolved" ? "resolve" : "close"} ticket — required field${labels.length === 1 ? "" : "s"} missing: ${labels.join(", ")}.`,
          missingFields: missing,
          missingFieldLabels: labels,
        });
        return;
      }
    }

    const now = new Date();
    updateData.resolvedAt = now;
    if (ticket.resolutionDueAt && now > ticket.resolutionDueAt) {
      updateData.slaBreached = true;
    }
  }

  // Handle de-escalation inline
  if (data.escalate === false) {
    updateData.isEscalated      = false;
    updateData.status           = "in_progress";
    (updateData as Record<string, unknown>).escalatedToTeamId = null;
    (updateData as Record<string, unknown>).escalatedToUserId = null;
  }

  const updated = await prisma.ticket.update({
    where: { id },
    data: updateData,
    include: {
      assignedTo:      { select: { id: true, name: true } },
      team:            { select: { id: true, name: true, color: true } },
      escalationEvents:{ orderBy: { createdAt: "asc" } },
      escalatedToTeam: { select: { id: true, name: true, color: true } },
      escalatedToUser: { select: { id: true, name: true } },
    },
  });

  // Manual escalation with optional team/agent target
  if (data.escalate === true) {
    const teamId = (data as Record<string, unknown>).escalateToTeamId as number | undefined;
    const userId = (data as Record<string, unknown>).escalateToUserId as string | undefined;
    await escalateTicket(id, "manual", req.user.id, teamId ?? null, userId ?? null);
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

    // Notify watchers of the status change (fire-and-forget)
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

  // ── Fire event_workflow events for each field that changed ────────────────
  // previousValues are captured before the DB update; each specific trigger
  // lets workflow rules react precisely to the type of change.
  const prev: Record<string, unknown> = {};
  if ("status" in data && data.status !== ticket.status) {
    prev.status = ticket.status;
    fireTicketEvent("ticket.status_changed", id, req.user.id, prev);
  }
  if ("priority" in data && data.priority !== ticket.priority) {
    const priorityPrev: Record<string, unknown> = { priority: ticket.priority };
    fireTicketEvent("ticket.priority_changed", id, req.user.id, priorityPrev);
  }
  if ("category" in data && data.category !== ticket.category) {
    const categoryPrev: Record<string, unknown> = { category: ticket.category };
    fireTicketEvent("ticket.category_changed", id, req.user.id, categoryPrev);
  }
  if ("assignedToId" in data && data.assignedToId !== ticket.assignedToId) {
    const assignPrev: Record<string, unknown> = { assignedToId: ticket.assignedToId };
    fireTicketEvent(
      data.assignedToId ? "ticket.assigned" : "ticket.unassigned",
      id, req.user.id, assignPrev,
    );
  }
  // Generic ticket.updated always fires on any change
  fireTicketEvent("ticket.updated", id, req.user.id, {
    status:      ticket.status,
    priority:    ticket.priority,
    category:    ticket.category,
    assignedToId: ticket.assignedToId,
    teamId:      ticket.teamId,
    severity:    ticket.severity,
    impact:      ticket.impact,
    urgency:     ticket.urgency,
  });

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

  // If ticket type was just set (no existing link), create the linked
  // record — but only for incidents. Service-request tickets are no
  // longer mirrored into the standalone ServiceRequest table; the ticket
  // is the service request. Existing links from before this change are
  // still kept in sync so historical data stays consistent.
  if ("ticketType" in data) {
    const newType = data.ticketType;
    if (newType === "incident" && !ticket.linkedIncidentId) {
      void createLinkedIncident(id, req.user.id);
    } else if (newType === "incident" && ticket.linkedIncidentId) {
      void syncTicketToIncident(ticket.linkedIncidentId, syncChanges);
    } else if (newType === "service_request" && ticket.linkedServiceRequestId) {
      // Pre-existing link — keep it in sync but do not create new ones.
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

  // Re-fetch with the same rich shape as GET /:id so the client's cache
  // doesn't lose relations (customStatus, customTicketType, linkedIncident,
  // csatRating, etc.) when setQueryData replaces it with the PATCH response.
  // Without this, fields backed by relations would appear to revert to
  // defaults after a save.
  const fresh = await prisma.ticket.findUnique({
    where: { id },
    include: ticketDetailInclude(id),
  });

  if (!fresh) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  // Match the GET handler's shape: rename customer.tickets → customer.recentTickets
  // and reverse audit events to oldest-first.
  const { customer, auditEvents, ...rest } = fresh;
  const shaped = {
    ...rest,
    auditEvents: auditEvents.slice().reverse(),
    customer: customer
      ? { ...customer, recentTickets: customer.tickets, tickets: undefined }
      : null,
  };

  res.json(withSlaInfo(shaped));
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

// ─── Unmerge ───────────────────────────────────────────────────────────────
//
// POST /api/tickets/:id/unmerge
// Detaches a child ticket from its parent, re-opening it as a standalone ticket.

router.post("/:id/unmerge", requireAuth, requirePermission("tickets.update"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ticket ID" }); return; }

  const ticket = await prisma.ticket.findUnique({
    where:  { id },
    select: { id: true, mergedIntoId: true, ticketNumber: true },
  });

  if (!ticket)              { res.status(404).json({ error: "Ticket not found" }); return; }
  if (!ticket.mergedIntoId) { res.status(422).json({ error: "Ticket is not currently merged" }); return; }

  const parentId = ticket.mergedIntoId;

  // Fetch parent number for the audit trail
  const parent = await prisma.ticket.findUnique({
    where: { id: parentId },
    select: { ticketNumber: true },
  });

  await prisma.ticket.update({
    where: { id },
    data:  { mergedIntoId: null, mergedAt: null, status: "open" },
  });

  await Promise.all([
    logAudit(id,       req.user.id, "ticket.unmerged",       {
      previousParentId: parentId,
      parentNumber:     parent?.ticketNumber ?? null,
      childNumber:      ticket.ticketNumber,
    }),
    logAudit(parentId, req.user.id, "ticket.child_unmerged", {
      childId:     id,
      childNumber: ticket.ticketNumber,
      parentNumber: parent?.ticketNumber ?? null,
    }),
  ]);

  res.json({ ok: true });
});

// ─── Absorb ────────────────────────────────────────────────────────────────
//
// POST /api/tickets/:id/absorb  { childId }
// Pulls another ticket in as a child of this one (inverse of merge — called
// from the parent's "Add Child Ticket" action).

router.post("/:id/absorb", requireAuth, requirePermission("tickets.update"), async (req, res) => {
  const parentId = parseId(req.params.id);
  const childId  = parseId(req.body?.childId);
  if (!parentId || !childId)   { res.status(400).json({ error: "Invalid ticket IDs" }); return; }
  if (parentId === childId)    { res.status(422).json({ error: "A ticket cannot absorb itself" }); return; }

  const [parent, child] = await Promise.all([
    prisma.ticket.findUnique({
      where:  { id: parentId },
      select: { id: true, mergedIntoId: true, ticketNumber: true },
    }),
    prisma.ticket.findUnique({
      where:  { id: childId },
      select: { id: true, mergedIntoId: true, ticketNumber: true, _count: { select: { mergedTickets: true } } },
    }),
  ]);

  if (!parent) { res.status(404).json({ error: "Parent ticket not found" }); return; }
  if (!child)  { res.status(404).json({ error: "Child ticket not found" }); return; }
  if (parent.mergedIntoId)           { res.status(422).json({ error: "A merged ticket cannot absorb other tickets" }); return; }
  if (child.mergedIntoId)            { res.status(422).json({ error: "This ticket is already merged into another ticket" }); return; }
  if (child._count.mergedTickets > 0){ res.status(422).json({ error: "Cannot absorb a ticket that already has merged children" }); return; }

  const now = new Date();
  await prisma.ticket.update({
    where: { id: childId },
    data:  { mergedIntoId: parentId, mergedAt: now, status: "closed" },
  });

  await Promise.all([
    logAudit(childId,  req.user.id, "ticket.merged",         { mergedIntoId: parentId, targetNumber: parent.ticketNumber }),
    logAudit(parentId, req.user.id, "ticket.received_merge", { fromId: childId, fromNumber: child.ticketNumber }),
  ]);

  res.json({ ok: true, mergedAt: now });
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
      const { count } = await prisma.ticket.updateMany({
        where: { id: { in: data.ids }, deletedAt: null },
        data:  { deletedAt: new Date(), deletedById: req.user.id, deletedByName: req.user.name },
      });
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

// ── Ticket ↔ CI links ─────────────────────────────────────────────────────────
//
// POST   /api/tickets/:id/ci-links/:ciId  — link a CI to a ticket
// DELETE /api/tickets/:id/ci-links/:ciId  — unlink a CI from a ticket

router.post("/:id/ci-links/:ciId", requireAuth, requirePermission("tickets.update"), async (req, res) => {
  const ticketId = parseId(req.params.id);
  const ciId     = parseId(req.params.ciId);
  if (!ticketId || !ciId) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [ticket, ci] = await Promise.all([
    prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true } }),
    prisma.configItem.findUnique({ where: { id: ciId }, select: { id: true, name: true, ciNumber: true } }),
  ]);
  if (!ticket) { res.status(404).json({ error: "Ticket not found" });         return; }
  if (!ci)     { res.status(404).json({ error: "Configuration item not found" }); return; }

  await prisma.ticketCiLink.upsert({
    where:  { ticketId_ciId: { ticketId, ciId } },
    create: { ticketId, ciId },
    update: {},
  });

  res.status(201).json({ ticketId, ciId, ciNumber: ci.ciNumber, name: ci.name });
});

router.delete("/:id/ci-links/:ciId", requireAuth, requirePermission("tickets.update"), async (req, res) => {
  const ticketId = parseId(req.params.id);
  const ciId     = parseId(req.params.ciId);
  if (!ticketId || !ciId) { res.status(400).json({ error: "Invalid ID" }); return; }

  await prisma.ticketCiLink.deleteMany({ where: { ticketId, ciId } });
  res.status(204).end();
});

// ── Ticket ↔ Asset links ──────────────────────────────────────────────────────
//
// POST   /api/tickets/:id/asset-links/:assetId  — link an asset to a ticket
// DELETE /api/tickets/:id/asset-links/:assetId  — unlink an asset from a ticket
//
// These are convenience endpoints that mirror the asset-centric
// POST /api/assets/:assetId/links/tickets/:ticketId routes.

router.post("/:id/asset-links/:assetId", requireAuth, requirePermission("tickets.update"), async (req, res) => {
  const ticketId  = parseId(req.params.id);
  const assetId   = parseId(req.params.assetId);
  if (!ticketId || !assetId) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [ticket, asset] = await Promise.all([
    prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true } }),
    prisma.asset.findUnique({ where: { id: assetId }, select: { id: true, name: true, assetNumber: true } }),
  ]);
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
  if (!asset)  { res.status(404).json({ error: "Asset not found" });  return; }

  await prisma.assetTicketLink.upsert({
    where:  { assetId_ticketId: { assetId, ticketId } },
    create: { assetId, ticketId },
    update: {},
  });

  res.status(201).json({ ticketId, assetId, assetNumber: asset.assetNumber, name: asset.name });
});

router.delete("/:id/asset-links/:assetId", requireAuth, requirePermission("tickets.update"), async (req, res) => {
  const ticketId = parseId(req.params.id);
  const assetId  = parseId(req.params.assetId);
  if (!ticketId || !assetId) { res.status(400).json({ error: "Invalid ID" }); return; }

  await prisma.assetTicketLink.deleteMany({ where: { assetId, ticketId } });
  res.status(204).end();
});

export default router;
