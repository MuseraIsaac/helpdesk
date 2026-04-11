import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { AI_AGENT_ID } from "core/constants/ai-agent.ts";
import { categoryLabel } from "core/constants/ticket-category.ts";
import { priorityLabel } from "core/constants/ticket-priority.ts";
import prisma from "../db";

const router = Router();
router.use(requireAuth);

// ── Date-filter helpers ───────────────────────────────────────────────────────

function parseDateRange(from: unknown, to: unknown) {
  const parseDate = (v: unknown): Date | null => {
    if (typeof v !== "string" || !v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };
  return { fromDate: parseDate(from), toDate: parseDate(to) };
}

/** Build a Prisma `createdAt` where clause from optional from/to dates. */
function createdAtFilter(from: Date | null, to: Date | null) {
  if (!from && !to) return {};
  return {
    createdAt: {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    },
  };
}

// ── Overview ─────────────────────────────────────────────────────────────────
//
// GET /api/reports/overview?from=&to=
//
// Single PostgreSQL pass using FILTER aggregates — one table scan, all metrics.
// Returns counts, SLA compliance, escalation, response/resolution times.

interface OverviewRow {
  totalTickets: bigint;
  openTickets: bigint;
  resolvedTickets: bigint;
  closedTickets: bigint;
  resolvedByAI: bigint;
  ticketsWithSlaTarget: bigint;
  breachedTickets: bigint;
  escalatedTickets: bigint;
  reopenedTickets: bigint;
  avgFirstResponseSeconds: number | null;
  avgResolutionSeconds: number | null;
}

const EXCLUDED_STATUSES = ["new", "processing"] as const;
type ExcludedStatus = (typeof EXCLUDED_STATUSES)[number];

router.get("/overview", async (req, res) => {
  const { fromDate, toDate } = parseDateRange(req.query.from, req.query.to);

  // Build WHERE clause dynamically to avoid NULL timestamptz casting issues
  let where = `WHERE TRUE`;
  const params: unknown[] = [AI_AGENT_ID];

  if (fromDate) {
    params.push(fromDate);
    where += ` AND "createdAt" >= $${params.length}`;
  }
  if (toDate) {
    params.push(toDate);
    where += ` AND "createdAt" <= $${params.length}`;
  }

  const rows = await prisma.$queryRawUnsafe<OverviewRow[]>(
    `SELECT
       COUNT(*) FILTER (WHERE status NOT IN ('new','processing'))       AS "totalTickets",
       COUNT(*) FILTER (WHERE status = 'open')                         AS "openTickets",
       COUNT(*) FILTER (WHERE status = 'resolved')                     AS "resolvedTickets",
       COUNT(*) FILTER (WHERE status = 'closed')                       AS "closedTickets",
       COUNT(*) FILTER (WHERE status = 'resolved'
                          AND "assignedToId" = $1)                     AS "resolvedByAI",
       COUNT(*) FILTER (WHERE "resolutionDueAt" IS NOT NULL
                          AND status NOT IN ('new','processing'))       AS "ticketsWithSlaTarget",
       COUNT(*) FILTER (WHERE "slaBreached" = true)                    AS "breachedTickets",
       COUNT(*) FILTER (WHERE "isEscalated" = true)                    AS "escalatedTickets",
       COUNT(*) FILTER (WHERE "resolvedAt" IS NOT NULL
                          AND status = 'open')                         AS "reopenedTickets",
       ROUND(
         AVG(EXTRACT(EPOCH FROM ("firstRespondedAt" - "createdAt")))
           FILTER (WHERE "firstRespondedAt" IS NOT NULL)
       )::int                                                           AS "avgFirstResponseSeconds",
       ROUND(
         AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")))
           FILTER (WHERE "resolvedAt" IS NOT NULL
                     AND status IN ('resolved','closed'))
       )::int                                                           AS "avgResolutionSeconds"
     FROM ticket
     ${where}`,
    ...params
  );

  const row = rows[0];
  if (!row) { res.status(500).json({ error: "Stats query returned no data" }); return; }

  const totalVisible = Number(row.totalTickets);
  const ticketsWithSlaTarget = Number(row.ticketsWithSlaTarget);
  const breachedTickets = Number(row.breachedTickets);
  const resolvedTickets = Number(row.resolvedTickets);
  const resolvedByAI = Number(row.resolvedByAI);

  const slaComplianceRate =
    ticketsWithSlaTarget > 0
      ? Math.round(((ticketsWithSlaTarget - breachedTickets) / ticketsWithSlaTarget) * 100)
      : null;

  const aiResolutionRate =
    resolvedTickets > 0 ? Math.round((resolvedByAI / resolvedTickets) * 100) : 0;

  res.json({
    totalTickets: totalVisible,
    openTickets: Number(row.openTickets),
    resolvedTickets,
    closedTickets: Number(row.closedTickets),
    resolvedByAI,
    aiResolutionRate,
    ticketsWithSlaTarget,
    breachedTickets,
    slaComplianceRate,
    escalatedTickets: Number(row.escalatedTickets),
    reopenedTickets: Number(row.reopenedTickets),
    avgFirstResponseSeconds: row.avgFirstResponseSeconds,
    avgResolutionSeconds: row.avgResolutionSeconds,
  });
});

// ── Volume ────────────────────────────────────────────────────────────────────
//
// GET /api/reports/volume?period=7|30|90
//
// Same shape as existing /api/tickets/stats/daily-volume — drop-in replacement
// with configurable lookback window.

router.get("/volume", async (req, res) => {
  const period = Math.min(90, Math.max(7, Number(req.query.period ?? 30) || 30));

  const since = new Date();
  since.setDate(since.getDate() - (period - 1));
  since.setHours(0, 0, 0, 0);

  const tickets = await prisma.ticket.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true },
  });

  const countsByDate = new Map<string, number>();
  for (const t of tickets) {
    const key = t.createdAt.toISOString().slice(0, 10);
    countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
  }

  // Fill every date in the window (including zero-count days)
  const data: { date: string; tickets: number }[] = [];
  for (let i = period - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    data.push({ date: key, tickets: countsByDate.get(key) ?? 0 });
  }

  res.json({ data });
});

// ── Breakdowns ────────────────────────────────────────────────────────────────
//
// GET /api/reports/breakdowns?from=&to=
//
// Returns by-category, by-priority, and by-assignee distributions.
// Excludes new/processing (system-managed) tickets throughout.

router.get("/breakdowns", async (req, res) => {
  const { fromDate, toDate } = parseDateRange(req.query.from, req.query.to);
  const dateWhere = createdAtFilter(fromDate, toDate);
  const notExcluded: ExcludedStatus[] = [...EXCLUDED_STATUSES];
  const baseWhere = { status: { notIn: notExcluded }, ...dateWhere };

  // Category and priority: two groupBy calls each (total + open) merged in JS
  const [categoryTotal, categoryOpen, priorityTotal, priorityOpen] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["category"],
      where: baseWhere,
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.ticket.groupBy({
      by: ["category"],
      where: { status: "open", ...dateWhere },
      _count: { id: true },
    }),
    prisma.ticket.groupBy({
      by: ["priority"],
      where: baseWhere,
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.ticket.groupBy({
      by: ["priority"],
      where: { status: "open", ...dateWhere },
      _count: { id: true },
    }),
  ]);

  const catOpenMap = new Map(categoryOpen.map((r) => [r.category, r._count.id ?? 0]));
  const priOpenMap = new Map(priorityOpen.map((r) => [r.priority, r._count.id ?? 0]));

  const byCategory = categoryTotal.map((r) => ({
    category: r.category,
    label: r.category ? (categoryLabel[r.category as keyof typeof categoryLabel] ?? r.category) : "Uncategorised",
    total: r._count.id ?? 0,
    open: catOpenMap.get(r.category) ?? 0,
  }));

  const byPriority = priorityTotal.map((r) => ({
    priority: r.priority,
    label: r.priority ? (priorityLabel[r.priority as keyof typeof priorityLabel] ?? r.priority) : "Unset",
    total: r._count.id ?? 0,
    open: priOpenMap.get(r.priority) ?? 0,
  }));

  // Assignees: needs JOIN so use raw SQL
  let assigneeWhere = `WHERE t.status NOT IN ('new','processing') AND t."assignedToId" IS NOT NULL`;
  const assigneeParams: unknown[] = [];
  if (fromDate) {
    assigneeParams.push(fromDate);
    assigneeWhere += ` AND t."createdAt" >= $${assigneeParams.length}`;
  }
  if (toDate) {
    assigneeParams.push(toDate);
    assigneeWhere += ` AND t."createdAt" <= $${assigneeParams.length}`;
  }

  interface AssigneeRow {
    agentId: string;
    agentName: string;
    total: bigint;
    open: bigint;
    resolved: bigint;
  }

  const byAssignee = await prisma.$queryRawUnsafe<AssigneeRow[]>(
    `SELECT
       t."assignedToId"                                                         AS "agentId",
       COALESCE(u.name, 'Unknown')                                             AS "agentName",
       COUNT(*)                                                                 AS "total",
       COUNT(*) FILTER (WHERE t.status = 'open')                              AS "open",
       COUNT(*) FILTER (WHERE t.status IN ('resolved','closed'))              AS "resolved"
     FROM ticket t
     LEFT JOIN "user" u ON u.id = t."assignedToId"
     ${assigneeWhere}
     GROUP BY t."assignedToId", u.name
     ORDER BY total DESC
     LIMIT 15`,
    ...assigneeParams
  );

  res.json({
    byCategory,
    byPriority,
    byAssignee: byAssignee.map((r) => ({
      agentId: r.agentId,
      agentName: r.agentName,
      total: Number(r.total),
      open: Number(r.open),
      resolved: Number(r.resolved),
    })),
  });
});

// ── Aging ─────────────────────────────────────────────────────────────────────
//
// GET /api/reports/aging
//
// Buckets currently-open tickets by how long they've been open.
// No date filter — this is always the live snapshot.

interface AgingRow {
  bucket: string;
  count: bigint;
  sort: number;
}

router.get("/aging", async (_req, res) => {
  const rows = await prisma.$queryRaw<AgingRow[]>`
    SELECT
      CASE
        WHEN "createdAt" >= NOW() - INTERVAL '1 day'  THEN '< 24h'
        WHEN "createdAt" >= NOW() - INTERVAL '3 days' THEN '1–3 days'
        WHEN "createdAt" >= NOW() - INTERVAL '7 days' THEN '3–7 days'
        ELSE '> 7 days'
      END                                           AS bucket,
      COUNT(*)                                      AS count,
      CASE
        WHEN "createdAt" >= NOW() - INTERVAL '1 day'  THEN 1
        WHEN "createdAt" >= NOW() - INTERVAL '3 days' THEN 2
        WHEN "createdAt" >= NOW() - INTERVAL '7 days' THEN 3
        ELSE 4
      END                                           AS sort
    FROM ticket
    WHERE status = 'open'
    GROUP BY bucket, sort
    ORDER BY sort
  `;

  res.json({
    aging: rows.map((r) => ({
      bucket: r.bucket,
      count: Number(r.count),
      sort: Number(r.sort),
    })),
  });
});

export default router;
