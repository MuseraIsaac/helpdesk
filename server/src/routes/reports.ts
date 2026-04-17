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

// ── SLA by Dimension ─────────────────────────────────────────────────────────
//
// GET /api/reports/sla-by-dimension?from=&to=
//
// Breaks SLA compliance down by priority, category, and team so managers can
// see where SLAs are being missed rather than just the aggregate rate.

router.get("/sla-by-dimension", async (req, res) => {
  const { fromDate, toDate } = parseDateRange(req.query.from, req.query.to);

  /** Build a (WHERE fragment, params[]) pair; alias prefixes the date column. */
  function dateParts(alias?: string) {
    const params: unknown[] = [];
    const col = alias ? `${alias}."createdAt"` : `"createdAt"`;
    let where = "";
    if (fromDate) { params.push(fromDate); where += ` AND ${col} >= $${params.length}`; }
    if (toDate)   { params.push(toDate);   where += ` AND ${col} <= $${params.length}`; }
    return { where, params };
  }

  interface SlaDimRow { key: string; totalWithSla: bigint; breached: bigint; }

  const d1 = dateParts(), d2 = dateParts(), d3 = dateParts("t");

  const [byPriority, byCategory, byTeam] = await Promise.all([
    prisma.$queryRawUnsafe<SlaDimRow[]>(`
      SELECT COALESCE(priority::text,'unset') AS key,
        COUNT(*) FILTER (WHERE "resolutionDueAt" IS NOT NULL) AS "totalWithSla",
        COUNT(*) FILTER (WHERE "slaBreached" = true)          AS "breached"
      FROM ticket WHERE status NOT IN ('new','processing') ${d1.where}
      GROUP BY priority ORDER BY "totalWithSla" DESC
    `, ...d1.params),
    prisma.$queryRawUnsafe<SlaDimRow[]>(`
      SELECT COALESCE(category::text,'unset') AS key,
        COUNT(*) FILTER (WHERE "resolutionDueAt" IS NOT NULL) AS "totalWithSla",
        COUNT(*) FILTER (WHERE "slaBreached" = true)          AS "breached"
      FROM ticket WHERE status NOT IN ('new','processing') ${d2.where}
      GROUP BY category ORDER BY "totalWithSla" DESC
    `, ...d2.params),
    prisma.$queryRawUnsafe<SlaDimRow[]>(`
      SELECT COALESCE(q.name,'Unassigned') AS key,
        COUNT(*) FILTER (WHERE t."resolutionDueAt" IS NOT NULL) AS "totalWithSla",
        COUNT(*) FILTER (WHERE t."slaBreached" = true)          AS "breached"
      FROM ticket t LEFT JOIN "queue" q ON q.id = t."queueId"
      WHERE t.status NOT IN ('new','processing') ${d3.where}
      GROUP BY q.name ORDER BY "totalWithSla" DESC
    `, ...d3.params),
  ]);

  const fmt = (rows: SlaDimRow[]) =>
    rows.map(r => ({
      key: r.key,
      totalWithSla: Number(r.totalWithSla),
      breached: Number(r.breached),
      compliance: Number(r.totalWithSla) > 0
        ? Math.round(((Number(r.totalWithSla) - Number(r.breached)) / Number(r.totalWithSla)) * 100)
        : null,
    }));

  res.json({
    byPriority: fmt(byPriority).map(r => ({ ...r, label: priorityLabel[r.key as keyof typeof priorityLabel] ?? r.key })),
    byCategory: fmt(byCategory).map(r => ({ ...r, label: categoryLabel[r.key as keyof typeof categoryLabel] ?? r.key })),
    byTeam: fmt(byTeam).map(r => ({ ...r, label: r.key })),
  });
});

// ── Incident Analytics ────────────────────────────────────────────────────────
//
// GET /api/reports/incidents?period=7|30|90
//
// Incident volume, MTTA (time to acknowledge), MTTR (time to resolve),
// plus breakdowns by status and priority.
// MTTA and MTTR are the canonical incident SLA KPIs in ITIL.

router.get("/incidents", async (req, res) => {
  const period = Math.min(90, Math.max(7, Number(req.query.period ?? 30) || 30));
  const since = new Date();
  since.setDate(since.getDate() - (period - 1));
  since.setHours(0, 0, 0, 0);

  interface IncidentStatsRow {
    total: bigint;
    majorCount: bigint;
    slaBreached: bigint;
    mtta: number | null;
    mttr: number | null;
  }

  // Single-pass aggregate for the scalar KPIs
  const [statsRows, byStatusRaw, byPriorityRaw] = await Promise.all([
    prisma.$queryRaw<IncidentStatsRow[]>`
      SELECT
        COUNT(*)                                                              AS total,
        COUNT(*) FILTER (WHERE "is_major" = true)                           AS "majorCount",
        COUNT(*) FILTER (WHERE "sla_breached" = true)                       AS "slaBreached",
        ROUND(AVG(EXTRACT(EPOCH FROM ("acknowledged_at" - "createdAt")))
              FILTER (WHERE "acknowledged_at" IS NOT NULL))::int             AS mtta,
        ROUND(AVG(EXTRACT(EPOCH FROM ("resolved_at"    - "createdAt")))
              FILTER (WHERE "resolved_at" IS NOT NULL
                        AND status IN ('resolved','closed')))::int           AS mttr
      FROM incident WHERE "createdAt" >= ${since}
    `,
    prisma.incident.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
    prisma.incident.groupBy({ by: ["priority"], where: { createdAt: { gte: since } }, _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
  ]);

  // Daily volume (fill gaps)
  const incidents = await prisma.incident.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } });
  const countsByDate = new Map<string, number>();
  for (const inc of incidents) {
    const key = inc.createdAt.toISOString().slice(0, 10);
    countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
  }
  const volume: { date: string; count: number }[] = [];
  for (let i = period - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    volume.push({ date: key, count: countsByDate.get(key) ?? 0 });
  }

  const row = statsRows[0];
  res.json({
    total:       Number(row?.total ?? 0),
    majorCount:  Number(row?.majorCount ?? 0),
    slaBreached: Number(row?.slaBreached ?? 0),
    mtta:        row?.mtta ?? null,
    mttr:        row?.mttr ?? null,
    byStatus:    byStatusRaw.map(r => ({ status: String(r.status), count: r._count.id })),
    byPriority:  byPriorityRaw.map(r => ({ priority: String(r.priority), count: r._count.id })),
    volume,
  });
});

// ── Request Fulfillment ───────────────────────────────────────────────────────
//
// GET /api/reports/requests?period=7|30|90
//
// Service request volume, avg fulfillment time, SLA compliance, and
// top catalog items by request count.

router.get("/requests", async (req, res) => {
  const period = Math.min(90, Math.max(7, Number(req.query.period ?? 30) || 30));
  const since = new Date();
  since.setDate(since.getDate() - (period - 1));
  since.setHours(0, 0, 0, 0);

  interface RequestStatsRow {
    total: bigint;
    slaBreached: bigint;
    avgFulfillmentSeconds: number | null;
  }
  interface TopItemRow { name: string; count: bigint; avgSeconds: number | null; }

  const [statsRows, byStatusRaw, topItemsRaw] = await Promise.all([
    prisma.$queryRaw<RequestStatsRow[]>`
      SELECT
        COUNT(*)                                                            AS total,
        COUNT(*) FILTER (WHERE "sla_breached" = true)                     AS "slaBreached",
        ROUND(AVG(EXTRACT(EPOCH FROM (
          COALESCE("resolved_at","closed_at") - "createdAt"
        ))) FILTER (WHERE COALESCE("resolved_at","closed_at") IS NOT NULL))::int
                                                                            AS "avgFulfillmentSeconds"
      FROM service_request WHERE "createdAt" >= ${since}
    `,
    prisma.serviceRequest.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
    prisma.$queryRaw<TopItemRow[]>`
      SELECT
        COALESCE("catalog_item_name", 'Ad-hoc Request') AS name,
        COUNT(*)                                         AS count,
        ROUND(AVG(EXTRACT(EPOCH FROM (
          COALESCE("resolved_at","closed_at") - "createdAt"
        ))) FILTER (WHERE COALESCE("resolved_at","closed_at") IS NOT NULL))::int AS "avgSeconds"
      FROM service_request WHERE "createdAt" >= ${since}
      GROUP BY "catalog_item_name" ORDER BY count DESC LIMIT 8
    `,
  ]);

  const row = statsRows[0];
  const total = Number(row?.total ?? 0);
  const slaBreached = Number(row?.slaBreached ?? 0);
  const withSla = await prisma.serviceRequest.count({ where: { createdAt: { gte: since }, slaDueAt: { not: null } } });

  res.json({
    total,
    slaBreached,
    avgFulfillmentSeconds: row?.avgFulfillmentSeconds ?? null,
    slaCompliance: withSla > 0 ? Math.round(((withSla - slaBreached) / withSla) * 100) : null,
    byStatus:  byStatusRaw.map(r => ({ status: String(r.status), count: r._count.id })),
    topItems:  topItemsRaw.map(r => ({ name: r.name, count: Number(r.count), avgSeconds: r.avgSeconds ?? null })),
  });
});

// ── Problem Recurrence ────────────────────────────────────────────────────────
//
// GET /api/reports/problems?period=7|30|90
//
// Problem status breakdown, known error count, and recurrence indicators.
// A "recurring" problem has ≥ 2 linked incidents; "with incidents" has ≥ 1.
// This surfaces systemic issues that may need permanent fixes.

router.get("/problems", async (req, res) => {
  const period = Math.min(90, Math.max(7, Number(req.query.period ?? 30) || 30));
  const since = new Date();
  since.setDate(since.getDate() - (period - 1));
  since.setHours(0, 0, 0, 0);

  interface ProblemStatsRow { total: bigint; knownErrors: bigint; avgResolutionDays: number | null; }
  interface RecurrenceRow { problemId: number; linkedCount: bigint; }

  const [statsRows, byStatusRaw, recurrenceRaw] = await Promise.all([
    prisma.$queryRaw<ProblemStatsRow[]>`
      SELECT
        COUNT(*)                                                           AS total,
        COUNT(*) FILTER (WHERE "is_known_error" = true)                   AS "knownErrors",
        ROUND(AVG(EXTRACT(EPOCH FROM (
          COALESCE("resolved_at","closed_at") - "createdAt"
        )) / 86400.0) FILTER (WHERE COALESCE("resolved_at","closed_at") IS NOT NULL), 1)
                                                                           AS "avgResolutionDays"
      FROM problem WHERE "createdAt" >= ${since}
    `,
    prisma.problem.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
    prisma.$queryRaw<RecurrenceRow[]>`
      SELECT pil."problem_id" AS "problemId", COUNT(*) AS "linkedCount"
      FROM problem_incident_link pil
      JOIN problem p ON p.id = pil."problem_id"
      WHERE p."createdAt" >= ${since}
      GROUP BY pil."problem_id"
    `,
  ]);

  const row = statsRows[0];
  const withIncidents = recurrenceRaw.filter(r => Number(r.linkedCount) >= 1).length;
  const recurring     = recurrenceRaw.filter(r => Number(r.linkedCount) >= 2).length;

  res.json({
    total:               Number(row?.total ?? 0),
    knownErrors:         Number(row?.knownErrors ?? 0),
    withIncidents,
    recurring,
    avgResolutionDays:   row?.avgResolutionDays ?? null,
    byStatus:            byStatusRaw.map(r => ({ status: String(r.status), count: r._count.id })),
  });
});

// ── Approval Turnaround ───────────────────────────────────────────────────────
//
// GET /api/reports/approvals?period=7|30|90
//
// Approval lifecycle metrics: pending/approved/rejected counts, average
// turnaround time (createdAt → resolvedAt), and oldest pending items.
// Long approval queues are an ITSM efficiency risk.

router.get("/approvals", async (req, res) => {
  const period = Math.min(90, Math.max(7, Number(req.query.period ?? 30) || 30));
  const since = new Date();
  since.setDate(since.getDate() - (period - 1));
  since.setHours(0, 0, 0, 0);

  interface ApprovalStatsRow { total: bigint; avgTurnaroundSeconds: number | null; }

  const [statsRows, byStatusRaw, oldestPendingRaw] = await Promise.all([
    prisma.$queryRaw<ApprovalStatsRow[]>`
      SELECT
        COUNT(*) AS total,
        ROUND(AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")))
              FILTER (WHERE "resolvedAt" IS NOT NULL AND status IN ('approved','rejected')))::int
              AS "avgTurnaroundSeconds"
      FROM approval_request WHERE "createdAt" >= ${since}
    `,
    prisma.approvalRequest.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
    prisma.approvalRequest.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      take: 5,
      select: { id: true, title: true, subjectType: true, createdAt: true },
    }),
  ]);

  const row = statsRows[0];
  const now = Date.now();

  res.json({
    total:                 Number(row?.total ?? 0),
    avgTurnaroundSeconds:  row?.avgTurnaroundSeconds ?? null,
    byStatus:              byStatusRaw.map(r => ({ status: String(r.status), count: r._count.id })),
    oldestPending:         oldestPendingRaw.map(r => ({
      id:           r.id,
      title:        r.title,
      subjectType:  r.subjectType,
      createdAt:    r.createdAt.toISOString(),
      daysOpen:     Math.floor((now - r.createdAt.getTime()) / 86_400_000),
    })),
  });
});

// ── CSAT Trend ────────────────────────────────────────────────────────────────
//
// GET /api/reports/csat-trend?period=7|30|90
//
// Daily average CSAT rating for the period, filling zero-rating days.
// Lets managers spot satisfaction dips correlated with incident spikes or
// staffing changes.

router.get("/csat-trend", async (req, res) => {
  const period = Math.min(90, Math.max(7, Number(req.query.period ?? 30) || 30));
  const since = new Date();
  since.setDate(since.getDate() - (period - 1));
  since.setHours(0, 0, 0, 0);

  interface TrendRow { day: string; avgRating: number | null; count: bigint; }

  const rows = await prisma.$queryRaw<TrendRow[]>`
    SELECT
      TO_CHAR("submittedAt", 'YYYY-MM-DD') AS day,
      ROUND(AVG(rating)::numeric, 2)        AS "avgRating",
      COUNT(*)                              AS count
    FROM csat_rating
    WHERE "submittedAt" >= ${since}
    GROUP BY day ORDER BY day
  `;

  const byDay = new Map(rows.map(r => [r.day, { avgRating: r.avgRating, count: Number(r.count) }]));

  const data: { date: string; avgRating: number | null; count: number }[] = [];
  for (let i = period - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const entry = byDay.get(key);
    data.push({ date: key, avgRating: entry?.avgRating ?? null, count: entry?.count ?? 0 });
  }

  res.json({ data });
});

export default router;
