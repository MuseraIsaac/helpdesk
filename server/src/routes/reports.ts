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
  const fromDate = parseDate(from);
  const toDate   = parseDate(to);
  // "YYYY-MM-DD" strings parse as midnight UTC, so the `to` date would exclude
  // anything created after 00:00 UTC on that day.  Advance to end-of-day so the
  // full calendar day is included regardless of when tickets were created.
  if (toDate) toDate.setUTCHours(23, 59, 59, 999);
  return { fromDate, toDate };
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

/**
 * Resolves a `{ since, until }` window from the request query.
 * Prefers explicit `from`/`to`; falls back to `period` (integer days).
 */
function resolveDateWindow(query: Record<string, unknown>, defaultDays = 30): { since: Date; until: Date } {
  const { fromDate, toDate } = parseDateRange(query.from, query.to);
  if (fromDate) {
    const since = new Date(fromDate); since.setHours(0, 0, 0, 0);
    const until = toDate ? new Date(toDate) : new Date();
    until.setHours(23, 59, 59, 999);
    return { since, until };
  }
  const period = Math.min(365, Math.max(1, Number(query.period ?? defaultDays) || defaultDays));
  const since = new Date(); since.setDate(since.getDate() - (period - 1)); since.setHours(0, 0, 0, 0);
  const until = new Date(); until.setHours(23, 59, 59, 999);
  return { since, until };
}

/** Fill every date between since..until (inclusive) using a lookup map. */
function fillDateRange<T>(
  since: Date,
  until: Date,
  lookup: Map<string, T>,
  empty: T,
): { date: string; value: T }[] {
  const result: { date: string; value: T }[] = [];
  const cursor = new Date(since);
  while (cursor <= until) {
    const key = cursor.toISOString().slice(0, 10);
    result.push({ date: key, value: lookup.get(key) ?? empty });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
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
  // Anchor fromDate to start-of-day so "YYYY-MM-DD" strings include the full day.
  if (fromDate) fromDate.setUTCHours(0, 0, 0, 0);

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
  // Prefer explicit from/to; fall back to period (days) for backwards compat.
  const { fromDate, toDate } = parseDateRange(req.query.from, req.query.to);

  let since: Date;
  let until: Date;

  if (fromDate) {
    since = fromDate;
    since.setHours(0, 0, 0, 0);
    until = toDate ?? new Date();
    until.setHours(23, 59, 59, 999);
  } else {
    const period = Math.min(90, Math.max(1, Number(req.query.period ?? 30) || 30));
    since = new Date();
    since.setDate(since.getDate() - (period - 1));
    since.setHours(0, 0, 0, 0);
    until = new Date();
    until.setHours(23, 59, 59, 999);
  }

  const tickets = await prisma.ticket.findMany({
    where: { createdAt: { gte: since, lte: until } },
    select: { createdAt: true },
  });

  const countsByDate = new Map<string, number>();
  for (const t of tickets) {
    const key = t.createdAt.toISOString().slice(0, 10);
    countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
  }

  // Fill every date in the window (including zero-count days)
  const data: { date: string; tickets: number }[] = [];
  const cursor = new Date(since);
  while (cursor <= until) {
    const key = cursor.toISOString().slice(0, 10);
    data.push({ date: key, tickets: countsByDate.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
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
  const { since, until } = resolveDateWindow(req.query as Record<string, unknown>);

  interface IncidentStatsRow {
    total: bigint;
    majorCount: bigint;
    slaBreached: bigint;
    mtta: number | null;
    mttr: number | null;
  }

  // Single-pass aggregate for the scalar KPIs
  const [statsRows, byStatusRaw, byPriorityRaw, incidentDates] = await Promise.all([
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
      FROM incident WHERE "createdAt" >= ${since} AND "createdAt" <= ${until}
    `,
    prisma.incident.groupBy({ by: ["status"], where: { createdAt: { gte: since, lte: until } }, _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
    prisma.incident.groupBy({ by: ["priority"], where: { createdAt: { gte: since, lte: until } }, _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
    prisma.incident.findMany({ where: { createdAt: { gte: since, lte: until } }, select: { createdAt: true } }),
  ]);

  // Daily volume (fill gaps)
  const countsByDate = new Map<string, number>();
  for (const inc of incidentDates) {
    const key = inc.createdAt.toISOString().slice(0, 10);
    countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
  }
  const volume = fillDateRange(since, until, countsByDate, 0).map(e => ({ date: e.date, count: e.value }));

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
  const { since, until } = resolveDateWindow(req.query as Record<string, unknown>);

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
      FROM service_request WHERE "createdAt" >= ${since} AND "createdAt" <= ${until}
    `,
    prisma.serviceRequest.groupBy({ by: ["status"], where: { createdAt: { gte: since, lte: until } }, _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
    prisma.$queryRaw<TopItemRow[]>`
      SELECT
        COALESCE("catalog_item_name", 'Ad-hoc Request') AS name,
        COUNT(*)                                         AS count,
        ROUND(AVG(EXTRACT(EPOCH FROM (
          COALESCE("resolved_at","closed_at") - "createdAt"
        ))) FILTER (WHERE COALESCE("resolved_at","closed_at") IS NOT NULL))::int AS "avgSeconds"
      FROM service_request WHERE "createdAt" >= ${since} AND "createdAt" <= ${until}
      GROUP BY "catalog_item_name" ORDER BY count DESC LIMIT 8
    `,
  ]);

  const row = statsRows[0];
  const total = Number(row?.total ?? 0);
  const slaBreached = Number(row?.slaBreached ?? 0);
  const withSla = await prisma.serviceRequest.count({ where: { createdAt: { gte: since, lte: until }, slaDueAt: { not: null } } });

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
  const { since, until } = resolveDateWindow(req.query as Record<string, unknown>);

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
      FROM problem WHERE "createdAt" >= ${since} AND "createdAt" <= ${until}
    `,
    prisma.problem.groupBy({ by: ["status"], where: { createdAt: { gte: since, lte: until } }, _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
    prisma.$queryRaw<RecurrenceRow[]>`
      SELECT pil."problem_id" AS "problemId", COUNT(*) AS "linkedCount"
      FROM problem_incident_link pil
      JOIN problem p ON p.id = pil."problem_id"
      WHERE p."createdAt" >= ${since} AND p."createdAt" <= ${until}
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
  const { since, until } = resolveDateWindow(req.query as Record<string, unknown>);

  interface ApprovalStatsRow { total: bigint; avgTurnaroundSeconds: number | null; }

  const [statsRows, byStatusRaw, oldestPendingRaw] = await Promise.all([
    prisma.$queryRaw<ApprovalStatsRow[]>`
      SELECT
        COUNT(*) AS total,
        ROUND(AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")))
              FILTER (WHERE "resolvedAt" IS NOT NULL AND status IN ('approved','rejected')))::int
              AS "avgTurnaroundSeconds"
      FROM approval_request WHERE "createdAt" >= ${since} AND "createdAt" <= ${until}
    `,
    prisma.approvalRequest.groupBy({ by: ["status"], where: { createdAt: { gte: since, lte: until } }, _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
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
  const { since, until } = resolveDateWindow(req.query as Record<string, unknown>);

  interface TrendRow { day: string; avgRating: number | null; count: bigint; }

  const rows = await prisma.$queryRaw<TrendRow[]>`
    SELECT
      TO_CHAR("submittedAt", 'YYYY-MM-DD') AS day,
      ROUND(AVG(rating)::numeric, 2)        AS "avgRating",
      COUNT(*)                              AS count
    FROM csat_rating
    WHERE "submittedAt" >= ${since} AND "submittedAt" <= ${until}
    GROUP BY day ORDER BY day
  `;

  const byDay = new Map(rows.map(r => [r.day, { avgRating: r.avgRating, count: Number(r.count) }]));
  const data = fillDateRange(
    since, until, byDay as Map<string, { avgRating: number | null; count: number }>,
    { avgRating: null, count: 0 },
  ).map(e => ({ date: e.date, avgRating: e.value.avgRating, count: e.value.count }));

  res.json({ data });
});

// ── Channel Breakdown ─────────────────────────────────────────────────────────
//
// GET /api/reports/channel-breakdown?from=&to=
//
// Donut/pie breakdown of ticket volume by intake channel (email, portal, agent).
// Uses the `source` field on the ticket table.

router.get("/channel-breakdown", async (req, res) => {
  const { since, until } = resolveDateWindow(req.query as Record<string, unknown>);

  interface SourceRow { source: string | null; count: bigint; }

  const rows = await prisma.$queryRaw<SourceRow[]>`
    SELECT COALESCE(source, 'unknown') AS source, COUNT(*) AS count
    FROM ticket
    WHERE status NOT IN ('new', 'processing')
      AND "createdAt" >= ${since} AND "createdAt" <= ${until}
    GROUP BY source
    ORDER BY count DESC
  `;

  const SOURCE_LABELS: Record<string, string> = {
    email:   "Email",
    portal:  "Portal",
    agent:   "Agent Created",
    unknown: "Unknown",
  };

  res.json({
    data: rows.map(r => ({
      source: r.source ?? "unknown",
      label:  SOURCE_LABELS[r.source ?? "unknown"] ?? (r.source ?? "Unknown"),
      count:  Number(r.count),
    })),
  });
});

// ── Resolution Time Distribution ──────────────────────────────────────────────
//
// GET /api/reports/resolution-distribution?from=&to=
//
// Histogram of how long resolved tickets took to close, bucketed by time range.
// Helps identify bottlenecks (e.g., many tickets in the "3–7 days" bucket).

router.get("/resolution-distribution", async (req, res) => {
  const { since, until } = resolveDateWindow(req.query as Record<string, unknown>);

  interface BucketRow { bucket: string; count: bigint; sort: bigint; }

  const rows = await prisma.$queryRaw<BucketRow[]>`
    SELECT
      CASE
        WHEN EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) < 3600   THEN '< 1 hour'
        WHEN EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) < 14400  THEN '1–4 hours'
        WHEN EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) < 28800  THEN '4–8 hours'
        WHEN EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) < 86400  THEN '8–24 hours'
        WHEN EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) < 259200 THEN '1–3 days'
        WHEN EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) < 604800 THEN '3–7 days'
        ELSE '> 7 days'
      END AS bucket,
      COUNT(*) AS count,
      CASE
        WHEN EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) < 3600   THEN 1
        WHEN EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) < 14400  THEN 2
        WHEN EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) < 28800  THEN 3
        WHEN EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) < 86400  THEN 4
        WHEN EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) < 259200 THEN 5
        WHEN EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) < 604800 THEN 6
        ELSE 7
      END AS sort
    FROM ticket
    WHERE "resolvedAt" IS NOT NULL
      AND status IN ('resolved', 'closed')
      AND "createdAt" >= ${since} AND "createdAt" <= ${until}
    GROUP BY bucket, sort
    ORDER BY sort
  `;

  res.json({
    buckets: rows.map(r => ({
      label: r.bucket,
      count: Number(r.count),
      sort:  Number(r.sort),
    })),
  });
});

// ── Agent Leaderboard ─────────────────────────────────────────────────────────
//
// GET /api/reports/agent-leaderboard?from=&to=
//
// Agents ranked by tickets resolved, plus avg resolution time and SLA compliance.
// Surfaces top performers and agents who may need support.

router.get("/agent-leaderboard", async (req, res) => {
  const { since, until } = resolveDateWindow(req.query as Record<string, unknown>);

  interface LeaderRow {
    agentId:              string;
    agentName:            string;
    resolved:             bigint;
    avgResolutionSeconds: number | null;
    slaTotal:             bigint;
    slaBreached:          bigint;
  }

  const rows = await prisma.$queryRawUnsafe<LeaderRow[]>(`
    SELECT
      t."assignedToId"                                                               AS "agentId",
      COALESCE(u.name, 'Unknown')                                                    AS "agentName",
      COUNT(*) FILTER (WHERE t.status IN ('resolved', 'closed'))                    AS resolved,
      ROUND(AVG(EXTRACT(EPOCH FROM (t."resolvedAt" - t."createdAt")))
        FILTER (WHERE t."resolvedAt" IS NOT NULL
                  AND t.status IN ('resolved','closed')))::int                       AS "avgResolutionSeconds",
      COUNT(*) FILTER (WHERE t."resolutionDueAt" IS NOT NULL)                       AS "slaTotal",
      COUNT(*) FILTER (WHERE t."slaBreached" = true)                                AS "slaBreached"
    FROM ticket t
    JOIN "user" u ON u.id = t."assignedToId"
    WHERE t.status NOT IN ('new', 'processing')
      AND t."assignedToId" IS NOT NULL
      AND t."createdAt" >= $1 AND t."createdAt" <= $2
    GROUP BY t."assignedToId", u.name
    ORDER BY resolved DESC, "agentName" ASC
    LIMIT 10
  `, since, until);

  res.json({
    agents: rows.map(r => {
      const slaTotal   = Number(r.slaTotal);
      const slaBreached = Number(r.slaBreached);
      return {
        agentId:              r.agentId,
        agentName:            r.agentName,
        resolved:             Number(r.resolved),
        avgResolutionSeconds: r.avgResolutionSeconds ?? null,
        slaCompliancePct:     slaTotal > 0
          ? Math.round(((slaTotal - slaBreached) / slaTotal) * 100)
          : null,
      };
    }),
  });
});

// ── Backlog Trend ─────────────────────────────────────────────────────────────
//
// GET /api/reports/backlog-trend?from=&to=
//
// Daily count of tickets opened and closed for the period.
// When opened > closed the backlog is growing; when closed > opened it is shrinking.

router.get("/backlog-trend", async (req, res) => {
  const { since, until } = resolveDateWindow(req.query as Record<string, unknown>);

  interface BacklogRow { date: string; opened: bigint; closed: bigint; }

  const rows = await prisma.$queryRaw<BacklogRow[]>`
    WITH days AS (
      SELECT generate_series(
        ${since}::timestamp,
        ${until}::timestamp,
        '1 day'::interval
      )::date AS day
    ),
    events AS (
      SELECT "createdAt"::date  AS day, 1 AS opened, 0 AS closed
      FROM ticket
      WHERE status NOT IN ('new','processing')
        AND "createdAt" >= ${since} AND "createdAt" <= ${until}
      UNION ALL
      SELECT "resolvedAt"::date AS day, 0 AS opened, 1 AS closed
      FROM ticket
      WHERE "resolvedAt" IS NOT NULL
        AND status IN ('resolved','closed')
        AND "resolvedAt" >= ${since} AND "resolvedAt" <= ${until}
    )
    SELECT
      TO_CHAR(d.day, 'YYYY-MM-DD') AS date,
      COALESCE(SUM(e.opened), 0)::bigint AS opened,
      COALESCE(SUM(e.closed), 0)::bigint AS closed
    FROM days d
    LEFT JOIN events e ON e.day = d.day
    GROUP BY d.day
    ORDER BY d.day
  `;

  res.json({
    data: rows.map(r => ({
      date:   r.date,
      opened: Number(r.opened),
      closed: Number(r.closed),
    })),
  });
});

// ── First Contact Resolution ──────────────────────────────────────────────────
//
// GET /api/reports/fcr?from=&to=
//
// FCR = resolved tickets where the customer sent no follow-up reply after
// the initial ticket (i.e., customer_reply_count = 0).
// This is the ITIL-aligned definition: resolution on the first interaction.

router.get("/fcr", async (req, res) => {
  const { since, until } = resolveDateWindow(req.query as Record<string, unknown>);

  interface FcrRow { total: bigint; firstContact: bigint; }

  const rows = await prisma.$queryRaw<FcrRow[]>`
    WITH customer_replies AS (
      SELECT "ticketId",
        COUNT(*) FILTER (WHERE "senderType" = 'customer') AS customer_reply_count
      FROM reply
      GROUP BY "ticketId"
    )
    SELECT
      COUNT(*)                                                                AS total,
      COUNT(*) FILTER (WHERE COALESCE(cr.customer_reply_count, 0) = 0)      AS "firstContact"
    FROM ticket t
    LEFT JOIN customer_replies cr ON cr."ticketId" = t.id
    WHERE t.status IN ('resolved', 'closed')
      AND t."createdAt" >= ${since} AND t."createdAt" <= ${until}
  `;

  const row = rows[0];
  const total        = Number(row?.total ?? 0);
  const firstContact = Number(row?.firstContact ?? 0);

  res.json({
    total,
    firstContact,
    multiContact: total - firstContact,
    rate: total > 0 ? Math.round((firstContact / total) * 100) : null,
  });
});

// ── Top Open Tickets ──────────────────────────────────────────────────────────
//
// GET /api/reports/top-open-tickets
//
// The 10 longest-waiting open tickets — no date filter, always a live snapshot.
// Useful for spotting tickets that have been overlooked.

router.get("/top-open-tickets", async (_req, res) => {
  interface OpenTicketRow {
    id:               number;
    ticketNumber:     string;
    subject:          string;
    priority:         string | null;
    slaBreached:      boolean;
    resolutionDueAt:  Date | null;
    createdAt:        Date;
    assigneeName:     string;
  }

  const rows = await prisma.$queryRaw<OpenTicketRow[]>`
    SELECT
      t.id,
      t.ticket_number                         AS "ticketNumber",
      t.subject,
      t.priority::text                        AS priority,
      t."slaBreached",
      t."resolutionDueAt",
      t."createdAt",
      COALESCE(u.name, 'Unassigned')          AS "assigneeName"
    FROM ticket t
    LEFT JOIN "user" u ON u.id = t."assignedToId"
    WHERE t.status = 'open'
    ORDER BY t."createdAt" ASC
    LIMIT 10
  `;

  const now = Date.now();
  res.json({
    tickets: rows.map(r => ({
      id:              r.id,
      ticketNumber:    r.ticketNumber,
      subject:         r.subject,
      priority:        r.priority,
      slaBreached:     r.slaBreached,
      resolutionDueAt: r.resolutionDueAt?.toISOString() ?? null,
      createdAt:       r.createdAt.toISOString(),
      assigneeName:    r.assigneeName,
      daysOpen:        Math.floor((now - r.createdAt.getTime()) / 86_400_000),
    })),
  });
});

// ── Change Analytics ──────────────────────────────────────────────────────────
//
// GET /api/reports/changes?period=7|30|90
//
// Change request volume, success/failure rate, avg approval time, and
// breakdowns by state, type, and risk level.

router.get("/changes", async (req, res) => {
  const { since, until } = resolveDateWindow(req.query as Record<string, unknown>);

  interface ChangeStatsRow {
    total:          bigint;
    failed:         bigint;
    emergency:      bigint;
    avgApprovalSec: number | null;
  }

  const [statsRows, byStateRaw, byTypeRaw, byRiskRaw, changeDates] = await Promise.all([
    prisma.$queryRaw<ChangeStatsRow[]>`
      SELECT
        COUNT(*)                                                              AS total,
        COUNT(*) FILTER (WHERE c.state = 'failed')                          AS failed,
        COUNT(*) FILTER (WHERE c.change_type = 'emergency')                 AS emergency,
        ROUND(AVG(EXTRACT(EPOCH FROM (ar."resolvedAt" - ar."createdAt")))
              FILTER (WHERE ar."resolvedAt" IS NOT NULL))::int               AS "avgApprovalSec"
      FROM change_request c
      LEFT JOIN approval_request ar
        ON ar.subject_type = 'change_request' AND ar.subject_id = c.id::text
      WHERE c."createdAt" >= ${since} AND c."createdAt" <= ${until}
    `,
    prisma.$queryRaw<{ state: string; count: bigint }[]>`
      SELECT COALESCE(state::text,'unknown') AS state, COUNT(*) AS count
      FROM change_request WHERE "createdAt" >= ${since} AND "createdAt" <= ${until}
      GROUP BY state ORDER BY count DESC
    `,
    prisma.$queryRaw<{ change_type: string; count: bigint }[]>`
      SELECT COALESCE(change_type::text,'unknown') AS change_type, COUNT(*) AS count
      FROM change_request WHERE "createdAt" >= ${since} AND "createdAt" <= ${until}
      GROUP BY change_type ORDER BY count DESC
    `,
    prisma.$queryRaw<{ risk: string; count: bigint }[]>`
      SELECT COALESCE(risk::text,'unset') AS risk, COUNT(*) AS count
      FROM change_request WHERE "createdAt" >= ${since} AND "createdAt" <= ${until}
      GROUP BY risk ORDER BY count DESC
    `,
    prisma.$queryRaw<{ createdAt: Date }[]>`
      SELECT "createdAt" FROM change_request
      WHERE "createdAt" >= ${since} AND "createdAt" <= ${until}
    `,
  ]);

  const row   = statsRows[0];
  const total = Number(row?.total ?? 0);
  const failed = Number(row?.failed ?? 0);
  const successRate = (total - failed === 0 && total === 0)
    ? null
    : total > 0 ? Math.round(((total - failed) / total) * 100) : null;

  // Daily volume (gap-filled)
  const countsByDate = new Map<string, number>();
  for (const c of changeDates) {
    const key = c.createdAt.toISOString().slice(0, 10);
    countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
  }
  const volume = fillDateRange(since, until, countsByDate, 0)
    .map(e => ({ date: e.date, count: e.value }));

  res.json({
    total,
    failed,
    emergency:      Number(row?.emergency ?? 0),
    successRate,
    avgApprovalSec: row?.avgApprovalSec ?? null,
    byState:  byStateRaw.map(r => ({ state: String(r.state), count: Number(r.count) })),
    byType:   byTypeRaw.map(r => ({ type: String(r.change_type), count: Number(r.count) })),
    byRisk:   byRiskRaw.map(r => ({ risk: String(r.risk), count: Number(r.count) })),
    volume,
  });
});

// ── CSAT Breakdown ────────────────────────────────────────────────────────────
//
// GET /api/reports/csat-breakdown?period=7|30|90
//
// Count of ratings at each star level (1–5) and their percentage share.
// Visualised as a horizontal bar per star level, colored from red to green.

router.get("/csat-breakdown", async (req, res) => {
  const { since, until } = resolveDateWindow(req.query as Record<string, unknown>);

  interface RatingRow { rating: number; count: bigint }

  const rows = await prisma.$queryRaw<RatingRow[]>`
    SELECT rating::int, COUNT(*) AS count
    FROM csat_rating
    WHERE "submittedAt" >= ${since} AND "submittedAt" <= ${until}
    GROUP BY rating ORDER BY rating
  `;

  const lookup = new Map(rows.map(r => [r.rating, Number(r.count)]));
  const total  = rows.reduce((s, r) => s + Number(r.count), 0);

  res.json({
    total,
    breakdown: [1, 2, 3, 4, 5].map(n => ({
      rating: n,
      label:  `${n} star${n === 1 ? "" : "s"}`,
      count:  lookup.get(n) ?? 0,
      pct:    total > 0 ? Math.round(((lookup.get(n) ?? 0) / total) * 100) : 0,
    })),
  });
});

// ── Operational Health ────────────────────────────────────────────────────────
//
// GET /api/reports/operational-health
//
// Live snapshot of critical service-desk health indicators in a single query.
// No date filter — always shows current state.
// Designed for the "Live Operations" widget on the overview dashboard.

router.get("/operational-health", async (_req, res) => {
  interface HealthRow {
    open:                 bigint;
    unassigned:           bigint;
    overdue:              bigint;
    at_risk:              bigint;
    assigned_not_replied: bigint;
  }

  const [row] = await prisma.$queryRaw<HealthRow[]>`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('open','in_progress'))
                                                                   AS open,
      COUNT(*) FILTER (WHERE status IN ('open','in_progress')
                         AND "assignedToId" IS NULL)               AS unassigned,
      COUNT(*) FILTER (WHERE status IN ('open','in_progress')
                         AND "slaBreached" = true)                 AS overdue,
      COUNT(*) FILTER (
        WHERE status IN ('open','in_progress')
          AND "slaBreached" = false
          AND "resolutionDueAt" IS NOT NULL
          AND "resolutionDueAt" <= NOW() + INTERVAL '2 hours'
          AND "resolutionDueAt" > NOW()
      )                                                            AS at_risk,
      (SELECT COUNT(*) FROM ticket t2
       WHERE t2.status IN ('open','in_progress')
         AND t2."assignedToId" IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM reply r
           WHERE r."ticketId" = t2.id AND r."senderType" = 'agent'
         ))                                                        AS assigned_not_replied
    FROM ticket
  `;

  res.json({
    open:               Number(row?.open ?? 0),
    unassigned:         Number(row?.unassigned ?? 0),
    overdue:            Number(row?.overdue ?? 0),
    atRisk:             Number(row?.at_risk ?? 0),
    assignedNotReplied: Number(row?.assigned_not_replied ?? 0),
  });
});

// ── KB Search Stats ───────────────────────────────────────────────────────────
//
// GET /api/reports/kb-search-stats?period=7|30|90
//
// Aggregated KB search analytics: total searches, unique queries,
// zero-result rate, and the top 20 most-searched terms.

router.get("/kb-search-stats", async (req, res) => {
  const { since, until } = resolveDateWindow(req.query as Record<string, unknown>);

  interface SearchRow {
    query: string;
    count: bigint;
    avgResultCount: number;
    zeroResultsCount: bigint;
  }

  const [totalRow, queryRows] = await Promise.all([
    prisma.$queryRaw<[{ total: bigint; zero: bigint }]>`
      SELECT COUNT(*) AS total,
             COUNT(*) FILTER (WHERE "result_count" = 0) AS zero
      FROM kb_search_log
      WHERE "created_at" >= ${since} AND "created_at" <= ${until}
    `,
    prisma.$queryRaw<SearchRow[]>`
      SELECT
        LOWER(TRIM(query))                                     AS query,
        COUNT(*)                                               AS count,
        ROUND(AVG("result_count")::numeric, 1)                AS "avgResultCount",
        COUNT(*) FILTER (WHERE "result_count" = 0)            AS "zeroResultsCount"
      FROM kb_search_log
      WHERE "created_at" >= ${since} AND "created_at" <= ${until}
        AND LENGTH(TRIM(query)) >= 2
      GROUP BY LOWER(TRIM(query))
      ORDER BY count DESC
      LIMIT 20
    `,
  ]);

  const total = Number(totalRow[0]?.total ?? 0);
  const zero  = Number(totalRow[0]?.zero  ?? 0);

  res.json({
    totalSearches:  total,
    uniqueQueries:  queryRows.length,
    zeroResultRate: total > 0 ? Math.round((zero / total) * 100) : null,
    topQueries: queryRows.map(r => ({
      query:            r.query,
      count:            Number(r.count),
      avgResultCount:   Number(r.avgResultCount),
      zeroResultsCount: Number(r.zeroResultsCount),
    })),
  });
});

// ── Asset Analytics ───────────────────────────────────────────────────────────
//
// GET /api/reports/assets?period=30  (or from=YYYY-MM-DD&to=YYYY-MM-DD)
//
// Single-pass aggregate endpoint for the Assets report dashboard.
// Returns KPIs, distributions, expiry alerts, trend data, and discovery stats.

router.get("/assets", async (req, res) => {
  const { since, until } = resolveDateWindow(req.query as Record<string, unknown>, 30);
  const now = new Date();
  const in30  = new Date(now.getTime() + 30  * 86_400_000);
  const in90  = new Date(now.getTime() + 90  * 86_400_000);

  const [
    // KPI aggregates — one pass
    kpiRow,
    // Status breakdown
    byStatusRows,
    // Type breakdown
    byTypeRows,
    // Team breakdown (top 15)
    byTeamRows,
    // Location breakdown (top 15)
    byLocationRows,
    // Expiry alerts
    warrantyExpiring30,
    warrantyExpiring90,
    contractsExpiring30,
    retirementDue90,
    retirementOverdue,
    // Discovery
    discoveryStats,
    // Incidents
    incidentStats,
    // Trend: assets created per day
    createdTrend,
    // Trend: retired/disposed
    retiredTrend,
  ] = await Promise.all([
    // ── KPIs ────────────────────────────────────────────────────────────────
    prisma.$queryRaw<[{
      total:    bigint;
      active:   bigint;
      in_stock: bigint;
      deployed: bigint;
      in_use:   bigint;
      maint:    bigint;
    }]>`
      SELECT
        COUNT(*)                                                     AS total,
        COUNT(*) FILTER (WHERE status IN ('deployed','in_use'))       AS active,
        COUNT(*) FILTER (WHERE status = 'in_stock')                  AS in_stock,
        COUNT(*) FILTER (WHERE status = 'deployed')                  AS deployed,
        COUNT(*) FILTER (WHERE status = 'in_use')                    AS in_use,
        COUNT(*) FILTER (WHERE status IN ('under_maintenance','in_repair')) AS maint
      FROM asset
    `,

    // ── By status ────────────────────────────────────────────────────────────
    prisma.$queryRaw<{ status: string; count: bigint }[]>`
      SELECT status::text AS status, COUNT(*) AS count
      FROM asset GROUP BY status ORDER BY count DESC
    `,

    // ── By type ──────────────────────────────────────────────────────────────
    prisma.$queryRaw<{ type: string; count: bigint }[]>`
      SELECT type::text AS type, COUNT(*) AS count
      FROM asset GROUP BY type ORDER BY count DESC
    `,

    // ── By team ──────────────────────────────────────────────────────────────
    prisma.$queryRaw<{ team_name: string; count: bigint; active: bigint }[]>`
      SELECT COALESCE(q.name, 'Unassigned') AS team_name,
             COUNT(a.id)                       AS count,
             COUNT(a.id) FILTER (WHERE a.status IN ('deployed','in_use')) AS active
      FROM asset a LEFT JOIN queue q ON q.id = a.team_id
      GROUP BY q.name ORDER BY count DESC LIMIT 15
    `,

    // ── By location ───────────────────────────────────────────────────────────
    prisma.$queryRaw<{ location: string; count: bigint }[]>`
      SELECT COALESCE(NULLIF(TRIM(COALESCE(site, location)), ''), 'Unspecified') AS location,
             COUNT(*) AS count
      FROM asset
      GROUP BY COALESCE(NULLIF(TRIM(COALESCE(site, location)), ''), 'Unspecified')
      ORDER BY count DESC LIMIT 15
    `,

    // ── Warranty expiring 30d ─────────────────────────────────────────────────
    prisma.asset.count({
      where: { warrantyExpiry: { gte: now, lte: in30 }, status: { notIn: ["retired","disposed","lost_stolen"] } },
    }),

    // ── Warranty expiring 90d ─────────────────────────────────────────────────
    prisma.asset.count({
      where: { warrantyExpiry: { gte: now, lte: in90 }, status: { notIn: ["retired","disposed","lost_stolen"] } },
    }),

    // ── Contracts expiring 30d ────────────────────────────────────────────────
    prisma.contract.count({
      where: { endDate: { gte: now, lte: in30 }, status: "active" },
    }),

    // ── Retirement due 90d ────────────────────────────────────────────────────
    prisma.asset.count({
      where: { endOfLifeAt: { gte: now, lte: in90 }, status: { notIn: ["retired","disposed","lost_stolen"] } },
    }),

    // ── Retirement overdue ────────────────────────────────────────────────────
    prisma.asset.count({
      where: { endOfLifeAt: { lt: now }, status: { notIn: ["retired","disposed","lost_stolen"] } },
    }),

    // ── Discovery stats ───────────────────────────────────────────────────────
    prisma.$queryRaw<[{ stale: bigint; recently_discovered: bigint; managed: bigint }]>`
      SELECT
        COUNT(*) FILTER (WHERE "stale_detected_at" IS NOT NULL)         AS stale,
        COUNT(*) FILTER (WHERE "last_discovered_at" >= NOW() - INTERVAL '7 days'
                           AND "stale_detected_at" IS NULL)             AS recently_discovered,
        COUNT(*) FILTER (WHERE "discovery_source" IS NOT NULL)          AS managed
      FROM asset
    `,

    // ── Assets with open incidents ────────────────────────────────────────────
    prisma.$queryRaw<[{ assets: bigint; incidents: bigint }]>`
      SELECT
        COUNT(DISTINCT ail."asset_id") AS assets,
        COUNT(*)                       AS incidents
      FROM asset_incident_link ail
      JOIN incident i ON i.id = ail."incident_id"
      WHERE i.status NOT IN ('resolved','closed')
    `,

    // ── Created trend ─────────────────────────────────────────────────────────
    prisma.$queryRaw<{ date: string; count: bigint }[]>`
      SELECT TO_CHAR("created_at"::date,'YYYY-MM-DD') AS date, COUNT(*) AS count
      FROM asset
      WHERE "created_at" >= ${since} AND "created_at" <= ${until}
      GROUP BY "created_at"::date ORDER BY "created_at"::date
    `,

    // ── Retired/disposed trend ────────────────────────────────────────────────
    prisma.$queryRaw<{ date: string; retired: bigint; disposed: bigint }[]>`
      SELECT
        TO_CHAR("retired_at"::date,'YYYY-MM-DD') AS date,
        COUNT(*) FILTER (WHERE status = 'retired')  AS retired,
        COUNT(*) FILTER (WHERE status = 'disposed') AS disposed
      FROM asset
      WHERE "retired_at" >= ${since} AND "retired_at" <= ${until}
        AND "retired_at" IS NOT NULL
        AND status IN ('retired','disposed')
      GROUP BY "retired_at"::date ORDER BY "retired_at"::date
    `,
  ]);

  const kpi = kpiRow[0]!;

  // Fill created trend for full date range
  const createdLookup = new Map(createdTrend.map(r => [r.date, Number(r.count)]));
  const retiredLookupR = new Map<string, number>();
  const retiredLookupD = new Map<string, number>();
  for (const r of retiredTrend) {
    retiredLookupR.set(r.date, Number(r.retired));
    retiredLookupD.set(r.date, Number(r.disposed));
  }

  const createdTimeSeries = fillDateRange(since, until, createdLookup, 0).map(p => ({ date: p.date, count: p.value }));
  const retiredTimeSeries = (() => {
    const cursor = new Date(since);
    const result: { date: string; retired: number; disposed: number }[] = [];
    while (cursor <= until) {
      const d = cursor.toISOString().slice(0, 10);
      result.push({ date: d, retired: retiredLookupR.get(d) ?? 0, disposed: retiredLookupD.get(d) ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  })();

  res.json({
    // ── KPIs ─────────────────────────────────────────────────────────────────
    totalAssets:    Number(kpi.total),
    activeAssets:   Number(kpi.active),
    inStockAssets:  Number(kpi.in_stock),
    deployedAssets: Number(kpi.deployed),
    inUseAssets:    Number(kpi.in_use),
    maintenanceAssets: Number(kpi.maint),

    // ── Expiry alerts ─────────────────────────────────────────────────────────
    warrantyExpiring30,
    warrantyExpiring90,
    contractsExpiring30,
    retirementDue90,
    retirementOverdue,

    // ── Discovery ─────────────────────────────────────────────────────────────
    staleAssets:          Number(discoveryStats[0]?.stale              ?? 0),
    recentlyDiscovered:   Number(discoveryStats[0]?.recently_discovered ?? 0),
    managedByDiscovery:   Number(discoveryStats[0]?.managed            ?? 0),

    // ── Linked incidents ──────────────────────────────────────────────────────
    assetsWithOpenIncidents: Number(incidentStats[0]?.assets   ?? 0),
    openIncidentCount:       Number(incidentStats[0]?.incidents ?? 0),

    // ── Distributions ─────────────────────────────────────────────────────────
    byStatus:   byStatusRows.map(r => ({ status: r.status,   count: Number(r.count) })),
    byType:     byTypeRows.map(r   => ({ type: r.type,       count: Number(r.count) })),
    byTeam:     byTeamRows.map(r   => ({ teamName: r.team_name, count: Number(r.count), active: Number(r.active) })),
    byLocation: byLocationRows.map(r => ({ location: r.location, count: Number(r.count) })),

    // ── Trends ────────────────────────────────────────────────────────────────
    createdTrend:  createdTimeSeries,
    retiredTrend:  retiredTimeSeries,
  });
});

export default router;
