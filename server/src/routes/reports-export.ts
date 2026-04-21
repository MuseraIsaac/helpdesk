/**
 * POST /api/reports/export
 *
 * Exports a full analytics report section as CSV or XLSX.
 *
 * Data-quality guarantees:
 *  - Dates: ISO 8601 strings (YYYY-MM-DD) in every date column
 *  - Durations: raw integer seconds — column headers say "(s)"
 *  - Percentages: 0–100 integer — column headers say "(%)" — Excel applies "0%" format
 *  - Booleans: 1 / 0 — never "Yes"/"No"
 *  - Nulls: empty cells — never em-dashes or placeholder strings
 *  - Numbers: native JS number type — never serialised as strings
 *
 * XLSX workbook structure:
 *  - Sheet "Info":   report metadata (title, period, filters, exported timestamp)
 *  - Data sheets:    header in row 1, data from row 2 — zero metadata rows inline
 *  - Column formats: percentages show as "87%", integers comma-grouped
 *  - Freeze:         row 1 frozen on every data sheet
 *  - Auto-filter:    applied to every data sheet header row
 *
 * CSV structure:
 *  - UTF-8 BOM (Excel auto-detect)
 *  - Metadata block at top as # comment lines
 *  - One blank line + "## SECTION" marker before each sheet
 *  - snake_case column names for direct DataFrame import
 */
import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../middleware/require-auth";
import { validate } from "../lib/validate";
import { AI_AGENT_ID } from "core/constants/ai-agent.ts";
import { categoryLabel } from "core/constants/ticket-category.ts";
import { priorityLabel } from "core/constants/ticket-priority.ts";
import prisma from "../db";
import { buildStyledWorkbook } from "../lib/excel-export";
import {
  buildCsv, buildFilename, buildPeriodLabel, isoDate, isoTs,
  type Sheet, type CellValue, type ColType, type ExportMeta,
} from "../lib/export-metadata";

const router = Router();
router.use(requireAuth);

// ── Schema ────────────────────────────────────────────────────────────────────

const filtersSchema = z.object({
  priority:   z.string().optional(),
  category:   z.string().optional(),
  teamId:     z.coerce.number().int().positive().optional(),
  assigneeId: z.string().optional(),
  status:     z.string().optional(),
}).optional();

const exportSchema = z.object({
  section: z.string().min(1).max(60),
  period:  z.string().optional(),
  from:    z.string().optional(),
  to:      z.string().optional(),
  format:  z.enum(["csv", "xlsx"]),
  filters: filtersSchema,
});

type Filters = z.infer<typeof filtersSchema>;

// ── Date / window helpers ─────────────────────────────────────────────────────
// isoDate(), isoTs(), buildPeriodLabel() are imported from export-metadata.

function resolveDateWindow(period?: string, from?: string, to?: string): { since: Date; until: Date } {
  if (from) {
    const since = new Date(from); since.setHours(0, 0, 0, 0);
    const until = to ? new Date(to) : new Date();
    until.setHours(23, 59, 59, 999);
    return { since, until };
  }
  const days = Math.min(365, Math.max(1, Number(period ?? "30") || 30));
  const since = new Date(); since.setDate(since.getDate() - (days - 1)); since.setHours(0, 0, 0, 0);
  const until = new Date(); until.setHours(23, 59, 59, 999);
  return { since, until };
}

function pct(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}

// ── Prisma filter builders ────────────────────────────────────────────────────

function applyTicketFilters(f?: Filters): object {
  if (!f) return {};
  return {
    ...(f.priority   ? { priority:    f.priority             } : {}),
    ...(f.category   ? { category:    f.category             } : {}),
    ...(f.teamId     ? { queueId:     f.teamId               } : {}),
    ...(f.assigneeId ? { assignedToId: f.assigneeId          } : {}),
    ...(f.status     ? { status:      f.status               } : {}),
  };
}

/** Raw SQL WHERE fragment + params array built from active filters */
function sqlFilterFragment(
  f?: Filters,
  alias = "t",
  paramOffset = 0,
): { frag: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (f?.priority)   { params.push(f.priority);   parts.push(`${alias}.priority::text = $${paramOffset + params.length}`); }
  if (f?.category)   { params.push(f.category);   parts.push(`${alias}.category::text = $${paramOffset + params.length}`); }
  if (f?.teamId)     { params.push(f.teamId);     parts.push(`${alias}."queueId" = $${paramOffset + params.length}`); }
  if (f?.assigneeId) { params.push(f.assigneeId); parts.push(`${alias}."assignedToId" = $${paramOffset + params.length}`); }
  if (f?.status)     { params.push(f.status);     parts.push(`${alias}.status::text = $${paramOffset + params.length}`); }
  return { frag: parts.length > 0 ? " AND " + parts.join(" AND ") : "", params };
}

// ── Section titles ────────────────────────────────────────────────────────────
// buildCsv() is imported from export-metadata — do not redefine it here.

const SECTION_TITLES: Record<string, string> = {
  overview:  "Overview Report",
  tickets:   "Tickets Report",
  sla:       "SLA Report",
  agents:    "Agents Report",
  teams:     "Teams Report",
  incidents: "Incidents Report",
  requests:  "Service Requests Report",
  problems:  "Problems Report",
  approvals: "Approvals Report",
  changes:   "Changes Report",
  csat:      "CSAT Report",
  kb:        "Knowledge Base Report",
  realtime:  "Live Operations Report",
  library:   "Report Library",
};

// ── Shared volume helper ──────────────────────────────────────────────────────

function buildVolRows(dates: { createdAt: Date }[], since: Date, until: Date): CellValue[][] {
  const map = new Map<string, number>();
  for (const d of dates) {
    const k = isoDate(d.createdAt);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  const rows: CellValue[][] = [];
  const cur = new Date(since);
  while (cur <= until) {
    const k = isoDate(cur);
    rows.push([k, map.get(k) ?? 0]);
    cur.setDate(cur.getDate() + 1);
  }
  return rows;
}

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function fetchOverviewSheets(since: Date, until: Date, filters?: Filters): Promise<Sheet[]> {
  interface KpiRow {
    totalTickets: bigint; openTickets: bigint; resolvedTickets: bigint;
    closedTickets: bigint; resolvedByAI: bigint; ticketsWithSlaTarget: bigint;
    breachedTickets: bigint; escalatedTickets: bigint; reopenedTickets: bigint;
    avgFirstResponseSeconds: number | null; avgResolutionSeconds: number | null;
  }
  interface AgingRow  { bucket: string; count: bigint; sort: number; }
  interface BacklogRow { date: string; opened: bigint; closed: bigint; }
  interface OpenRow   { id: number; ticketNumber: string; subject: string; priority: string | null; slaBreached: boolean; createdAt: Date; assigneeName: string; }
  interface AssigneeRow { agentName: string; total: bigint; open: bigint; resolved: bigint; }
  interface BucketRow { bucket: string; count: bigint; sort: bigint; }
  interface FcrRow    { total: bigint; firstContact: bigint; }
  interface SourceRow { source: string | null; count: bigint; }

  const { frag: ff, params: fp } = sqlFilterFragment(filters, "t", 3);
  const { frag: mf, params: mp } = sqlFilterFragment(filters, "t", 0);

  const [kpi, volDates, catBreak, priBreak, aging, backlog, topOpen, assignees, resDist, fcr, channels] =
    await Promise.all([
      // KPIs — filters applied to main query
      prisma.$queryRawUnsafe<KpiRow[]>(
        `SELECT
           COUNT(*) FILTER (WHERE t.status NOT IN ('new','processing')${ff}) AS "totalTickets",
           COUNT(*) FILTER (WHERE t.status='open'${ff})                      AS "openTickets",
           COUNT(*) FILTER (WHERE t.status='resolved'${ff})                  AS "resolvedTickets",
           COUNT(*) FILTER (WHERE t.status='closed'${ff})                    AS "closedTickets",
           COUNT(*) FILTER (WHERE t.status='resolved' AND t."assignedToId"=$1${ff}) AS "resolvedByAI",
           COUNT(*) FILTER (WHERE t."resolutionDueAt" IS NOT NULL AND t.status NOT IN ('new','processing')${ff}) AS "ticketsWithSlaTarget",
           COUNT(*) FILTER (WHERE t."slaBreached"=true${ff})                 AS "breachedTickets",
           COUNT(*) FILTER (WHERE t."isEscalated"=true${ff})                 AS "escalatedTickets",
           COUNT(*) FILTER (WHERE t."resolvedAt" IS NOT NULL AND t.status='open'${ff}) AS "reopenedTickets",
           ROUND(AVG(EXTRACT(EPOCH FROM (t."firstRespondedAt"-t."createdAt")))
                 FILTER (WHERE t."firstRespondedAt" IS NOT NULL${ff}))::int   AS "avgFirstResponseSeconds",
           ROUND(AVG(EXTRACT(EPOCH FROM (t."resolvedAt"-t."createdAt")))
                 FILTER (WHERE t."resolvedAt" IS NOT NULL AND t.status IN ('resolved','closed')${ff}))::int AS "avgResolutionSeconds"
         FROM ticket t
         WHERE t."createdAt">=$2 AND t."createdAt"<=$3`,
        AI_AGENT_ID, since, until, ...fp,
      ),
      // Volume — filtered
      prisma.ticket.findMany({ where: { createdAt: { gte: since, lte: until }, ...applyTicketFilters(filters) }, select: { createdAt: true } }),
      // Category breakdown
      prisma.ticket.groupBy({ by: ["category"], where: { status: { notIn: ["new","processing"] }, createdAt: { gte: since, lte: until }, ...applyTicketFilters(filters) }, _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
      // Priority breakdown
      prisma.ticket.groupBy({ by: ["priority"], where: { status: { notIn: ["new","processing"] }, createdAt: { gte: since, lte: until }, ...applyTicketFilters(filters) }, _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
      // Aging (live — no date filter by design, no additional filters either)
      prisma.$queryRaw<AgingRow[]>`
        SELECT
          CASE WHEN "createdAt">=NOW()-INTERVAL'1 day'  THEN '< 24 hours'
               WHEN "createdAt">=NOW()-INTERVAL'3 days' THEN '1–3 days'
               WHEN "createdAt">=NOW()-INTERVAL'7 days' THEN '3–7 days'
               ELSE '> 7 days' END                        AS bucket,
          COUNT(*) AS count,
          CASE WHEN "createdAt">=NOW()-INTERVAL'1 day'  THEN 1
               WHEN "createdAt">=NOW()-INTERVAL'3 days' THEN 2
               WHEN "createdAt">=NOW()-INTERVAL'7 days' THEN 3
               ELSE 4 END                                  AS sort
        FROM ticket WHERE status='open' GROUP BY bucket, sort ORDER BY sort`,
      // Backlog trend — filtered
      prisma.$queryRawUnsafe<BacklogRow[]>(
        `WITH days AS (
           SELECT generate_series($1::timestamp,$2::timestamp,'1 day'::interval)::date AS day
         ),
         events AS (
           SELECT t."createdAt"::date AS day, 1 AS opened, 0 AS closed
           FROM ticket t WHERE t.status NOT IN('new','processing') AND t."createdAt">=$1 AND t."createdAt"<=$2${mf}
           UNION ALL
           SELECT t."resolvedAt"::date AS day, 0 AS opened, 1 AS closed
           FROM ticket t WHERE t."resolvedAt" IS NOT NULL AND t.status IN('resolved','closed') AND t."resolvedAt">=$1 AND t."resolvedAt"<=$2${mf}
         )
         SELECT TO_CHAR(d.day,'YYYY-MM-DD') AS date,
                COALESCE(SUM(e.opened),0)::bigint AS opened,
                COALESCE(SUM(e.closed),0)::bigint AS closed
         FROM days d LEFT JOIN events e ON e.day=d.day
         GROUP BY d.day ORDER BY d.day`,
        since, until, ...mp,
      ),
      // Longest-waiting open tickets
      prisma.$queryRaw<OpenRow[]>`
        SELECT t.id, t.ticket_number AS "ticketNumber", t.subject,
               t.priority::text AS priority, t."slaBreached",
               t."createdAt", COALESCE(u.name,'Unassigned') AS "assigneeName"
        FROM ticket t LEFT JOIN "user" u ON u.id=t."assignedToId"
        WHERE t.status='open' ORDER BY t."createdAt" ASC LIMIT 25`,
      // By assignee — filtered
      prisma.$queryRawUnsafe<AssigneeRow[]>(
        `SELECT COALESCE(u.name,'Unknown') AS "agentName",
                COUNT(*) AS total,
                COUNT(*) FILTER(WHERE t.status='open')                    AS open,
                COUNT(*) FILTER(WHERE t.status IN('resolved','closed'))   AS resolved
         FROM ticket t LEFT JOIN "user" u ON u.id=t."assignedToId"
         WHERE t.status NOT IN('new','processing') AND t."assignedToId" IS NOT NULL
           AND t."createdAt">=$1 AND t."createdAt"<=$2${mf}
         GROUP BY u.name ORDER BY total DESC LIMIT 20`, since, until, ...mp,
      ),
      // Resolution distribution — filtered
      prisma.$queryRawUnsafe<BucketRow[]>(
        `SELECT
           CASE WHEN EXTRACT(EPOCH FROM(t."resolvedAt"-t."createdAt"))<3600   THEN '< 1 hour'
                WHEN EXTRACT(EPOCH FROM(t."resolvedAt"-t."createdAt"))<14400  THEN '1–4 hours'
                WHEN EXTRACT(EPOCH FROM(t."resolvedAt"-t."createdAt"))<28800  THEN '4–8 hours'
                WHEN EXTRACT(EPOCH FROM(t."resolvedAt"-t."createdAt"))<86400  THEN '8–24 hours'
                WHEN EXTRACT(EPOCH FROM(t."resolvedAt"-t."createdAt"))<259200 THEN '1–3 days'
                WHEN EXTRACT(EPOCH FROM(t."resolvedAt"-t."createdAt"))<604800 THEN '3–7 days'
                ELSE '> 7 days' END AS bucket,
           COUNT(*) AS count,
           CASE WHEN EXTRACT(EPOCH FROM(t."resolvedAt"-t."createdAt"))<3600   THEN 1
                WHEN EXTRACT(EPOCH FROM(t."resolvedAt"-t."createdAt"))<14400  THEN 2
                WHEN EXTRACT(EPOCH FROM(t."resolvedAt"-t."createdAt"))<28800  THEN 3
                WHEN EXTRACT(EPOCH FROM(t."resolvedAt"-t."createdAt"))<86400  THEN 4
                WHEN EXTRACT(EPOCH FROM(t."resolvedAt"-t."createdAt"))<259200 THEN 5
                WHEN EXTRACT(EPOCH FROM(t."resolvedAt"-t."createdAt"))<604800 THEN 6
                ELSE 7 END AS sort
         FROM ticket t
         WHERE t."resolvedAt" IS NOT NULL AND t.status IN('resolved','closed')
           AND t."createdAt">=$1 AND t."createdAt"<=$2${mf}
         GROUP BY bucket, sort ORDER BY sort`, since, until, ...mp,
      ),
      // FCR — filtered
      prisma.$queryRawUnsafe<FcrRow[]>(
        `WITH cr AS (
           SELECT "ticketId", COUNT(*) FILTER(WHERE "senderType"='customer') AS customer_reply_count
           FROM reply GROUP BY "ticketId"
         )
         SELECT COUNT(*) AS total,
                COUNT(*) FILTER(WHERE COALESCE(cr.customer_reply_count,0)=0) AS "firstContact"
         FROM ticket t LEFT JOIN cr ON cr."ticketId"=t.id
         WHERE t.status IN('resolved','closed') AND t."createdAt">=$1 AND t."createdAt"<=$2${mf}`,
        since, until, ...mp,
      ),
      // Channel breakdown — filtered
      prisma.$queryRaw<SourceRow[]>`
        SELECT COALESCE(source,'unknown') AS source, COUNT(*) AS count
        FROM ticket
        WHERE status NOT IN('new','processing') AND "createdAt">=${since} AND "createdAt"<=${until}
        GROUP BY source ORDER BY count DESC`,
    ]);

  const r = kpi[0];
  const totalTickets = Number(r?.totalTickets ?? 0);
  const withSla      = Number(r?.ticketsWithSlaTarget ?? 0);
  const breached     = Number(r?.breachedTickets ?? 0);
  const now          = Date.now();

  const SOURCE_LABEL: Record<string, string> = {
    email: "Email", portal: "Portal", agent: "Agent Created",
    api: "API", unknown: "Unknown",
  };

  return [
    {
      name:    "KPI Summary",
      headers: ["Metric", "Value"],
      keys:    ["metric", "value"],
      types:   ["string", "integer"],
      rows: [
        ["total_tickets",            totalTickets],
        ["open_tickets",             Number(r?.openTickets ?? 0)],
        ["resolved_tickets",         Number(r?.resolvedTickets ?? 0)],
        ["closed_tickets",           Number(r?.closedTickets ?? 0)],
        ["ai_auto_resolved",         Number(r?.resolvedByAI ?? 0)],
        ["escalated_tickets",        Number(r?.escalatedTickets ?? 0)],
        ["reopened_tickets",         Number(r?.reopenedTickets ?? 0)],
        ["tickets_with_sla_target",  withSla],
        ["sla_breached_count",       breached],
        ["sla_compliance_pct",       pct(withSla - breached, withSla)],
        ["avg_first_response_s",     r?.avgFirstResponseSeconds ?? null],
        ["avg_resolution_time_s",    r?.avgResolutionSeconds    ?? null],
      ],
    },
    {
      name:    "Daily Volume",
      headers: ["Date", "Tickets Created"],
      keys:    ["date", "tickets_created"],
      types:   ["date_iso", "integer"],
      rows:    buildVolRows(volDates, since, until),
    },
    {
      name:    "Backlog Trend",
      headers: ["Date", "Opened", "Closed", "Net Change"],
      keys:    ["date", "opened", "closed", "net_change"],
      types:   ["date_iso", "integer", "integer", "integer"],
      rows: backlog.map(row => [
        row.date,
        Number(row.opened),
        Number(row.closed),
        Number(row.opened) - Number(row.closed),
      ]),
    },
    {
      name:    "By Priority",
      headers: ["Priority", "Priority Label", "Total Tickets", "Rank"],
      keys:    ["priority", "priority_label", "total_tickets", "rank"],
      types:   ["string", "string", "integer", "integer"],
      rows: priBreak.map((row, i) => [
        row.priority ?? "unset",
        row.priority ? (priorityLabel[row.priority as keyof typeof priorityLabel] ?? row.priority) : "Unset",
        row._count.id ?? 0,
        i + 1,
      ]),
    },
    {
      name:    "By Category",
      headers: ["Category", "Category Label", "Total Tickets", "Rank"],
      keys:    ["category", "category_label", "total_tickets", "rank"],
      types:   ["string", "string", "integer", "integer"],
      rows: catBreak.map((row, i) => [
        row.category ?? "uncategorised",
        row.category ? (categoryLabel[row.category as keyof typeof categoryLabel] ?? row.category) : "Uncategorised",
        row._count.id ?? 0,
        i + 1,
      ]),
    },
    {
      name:    "By Assignee",
      headers: ["Agent Name", "Total Assigned", "Open", "Resolved"],
      keys:    ["agent_name", "total_assigned", "open", "resolved"],
      types:   ["string", "integer", "integer", "integer"],
      rows: assignees.map(row => [
        row.agentName,
        Number(row.total),
        Number(row.open),
        Number(row.resolved),
      ]),
    },
    {
      name:    "Open Ticket Aging",
      headers: ["Age Bucket", "Open Count", "Sort Order"],
      keys:    ["age_bucket", "open_count", "sort_order"],
      types:   ["string", "integer", "integer"],
      rows: aging.map(row => [row.bucket, Number(row.count), Number(row.sort)]),
    },
    {
      name:    "Resolution Time",
      headers: ["Time Bucket", "Resolved Count", "Sort Order"],
      keys:    ["time_bucket", "resolved_count", "sort_order"],
      types:   ["string", "integer", "integer"],
      rows: resDist.map(row => [String(row.bucket), Number(row.count), Number(row.sort)]),
    },
    {
      name:    "Intake Channel",
      headers: ["Channel", "Channel Label", "Ticket Count"],
      keys:    ["channel", "channel_label", "ticket_count"],
      types:   ["string", "string", "integer"],
      rows: channels.map(row => [
        row.source ?? "unknown",
        SOURCE_LABEL[row.source ?? "unknown"] ?? (row.source ?? "Unknown"),
        Number(row.count),
      ]),
    },
    {
      name:    "First Contact Resolution",
      headers: ["Total Resolved", "First Contact", "Multi Contact", "FCR (%)"],
      keys:    ["total_resolved", "first_contact", "multi_contact", "fcr_pct"],
      types:   ["integer", "integer", "integer", "percent"],
      rows: fcr.length > 0 ? (() => {
        const total = Number(fcr[0]?.total ?? 0);
        const fc    = Number(fcr[0]?.firstContact ?? 0);
        return [[total, fc, total - fc, pct(fc, total)]];
      })() : [],
    },
    {
      name:    "Longest Waiting",
      headers: ["Ticket #", "Subject", "Priority", "Assigned To", "Created Date", "Days Open", "SLA Breached"],
      keys:    ["ticket_number", "subject", "priority", "assigned_to", "created_date", "days_open", "sla_breached"],
      types:   ["string", "string", "string", "string", "date_iso", "integer", "bool_int"],
      rows: topOpen.map(row => [
        row.ticketNumber,
        row.subject,
        row.priority ?? null,
        row.assigneeName,
        isoDate(row.createdAt),
        Math.floor((now - new Date(row.createdAt).getTime()) / 86_400_000),
        row.slaBreached ? 1 : 0,
      ]),
    },
  ];
}

async function fetchTicketsSheets(since: Date, until: Date, filters?: Filters): Promise<Sheet[]> {
  // Overview covers the main KPIs; tickets section focuses on breakdown-oriented data
  const overview = await fetchOverviewSheets(since, until, filters);
  // Return the breakdown / trend sheets only (not KPI summary which duplicates overview)
  return overview.filter(s => s.name !== "KPI Summary" && s.name !== "Longest Waiting");
}

async function fetchSlaSheets(since: Date, until: Date, filters?: Filters): Promise<Sheet[]> {
  interface KpiRow   { totalTickets: bigint; withSla: bigint; breached: bigint; avgFirst: number | null; avgRes: number | null; }
  interface DimRow   { key: string; totalWithSla: bigint; breached: bigint; }

  const { frag: mf, params: mp } = sqlFilterFragment(filters, "t", 2);
  const { frag: mf2 } = sqlFilterFragment(filters, "t", 2);

  const [kpi, byPri, byCat, byTeam] = await Promise.all([
    prisma.$queryRawUnsafe<KpiRow[]>(
      `SELECT
         COUNT(*) AS "totalTickets",
         COUNT(*) FILTER(WHERE t."resolutionDueAt" IS NOT NULL) AS "withSla",
         COUNT(*) FILTER(WHERE t."slaBreached"=true)            AS breached,
         ROUND(AVG(EXTRACT(EPOCH FROM(t."firstRespondedAt"-t."createdAt")))
               FILTER(WHERE t."firstRespondedAt" IS NOT NULL))::int AS "avgFirst",
         ROUND(AVG(EXTRACT(EPOCH FROM(t."resolvedAt"-t."createdAt")))
               FILTER(WHERE t."resolvedAt" IS NOT NULL AND t.status IN('resolved','closed')))::int AS "avgRes"
       FROM ticket t
       WHERE t.status NOT IN('new','processing') AND t."createdAt">=$1 AND t."createdAt"<=$2${mf}`,
      since, until, ...mp,
    ),
    prisma.$queryRawUnsafe<DimRow[]>(
      `SELECT COALESCE(t.priority::text,'unset') AS key,
              COUNT(*) FILTER(WHERE t."resolutionDueAt" IS NOT NULL) AS "totalWithSla",
              COUNT(*) FILTER(WHERE t."slaBreached"=true)            AS breached
       FROM ticket t
       WHERE t.status NOT IN('new','processing') AND t."createdAt">=$1 AND t."createdAt"<=$2${mf2}
       GROUP BY t.priority ORDER BY "totalWithSla" DESC`, since, until, ...mp,
    ),
    prisma.$queryRawUnsafe<DimRow[]>(
      `SELECT COALESCE(t.category::text,'unset') AS key,
              COUNT(*) FILTER(WHERE t."resolutionDueAt" IS NOT NULL) AS "totalWithSla",
              COUNT(*) FILTER(WHERE t."slaBreached"=true)            AS breached
       FROM ticket t
       WHERE t.status NOT IN('new','processing') AND t."createdAt">=$1 AND t."createdAt"<=$2${mf2}
       GROUP BY t.category ORDER BY "totalWithSla" DESC`, since, until, ...mp,
    ),
    prisma.$queryRawUnsafe<DimRow[]>(
      `SELECT COALESCE(q.name,'Unassigned') AS key,
              COUNT(t.id) FILTER(WHERE t."resolutionDueAt" IS NOT NULL) AS "totalWithSla",
              COUNT(t.id) FILTER(WHERE t."slaBreached"=true)            AS breached
       FROM ticket t LEFT JOIN "queue" q ON q.id=t."queueId"
       WHERE t.status NOT IN('new','processing') AND t."createdAt">=$1 AND t."createdAt"<=$2
       GROUP BY q.name ORDER BY "totalWithSla" DESC`, since, until,
    ),
  ]);

  const k      = kpi[0];
  const withSla = Number(k?.withSla ?? 0);
  const breached = Number(k?.breached ?? 0);

  const dimSheet = (
    name: string, key: string, labelMap: Record<string, string> | null, rows: DimRow[],
  ): Sheet => ({
    name,
    headers: [`${key.charAt(0).toUpperCase() + key.slice(1)}`, `${key.charAt(0).toUpperCase() + key.slice(1)} Label`, "With SLA Target", "SLA Breached", "Compliance (%)"],
    keys:    [key, `${key}_label`, "with_sla_target", "sla_breached_count", "compliance_pct"],
    types:   ["string", "string", "integer", "integer", "percent"],
    rows: rows.map(r => {
      const t = Number(r.totalWithSla);
      const b = Number(r.breached);
      return [r.key, labelMap ? (labelMap[r.key] ?? r.key) : r.key, t, b, pct(t - b, t)];
    }),
  });

  return [
    {
      name:    "SLA Summary",
      headers: ["Metric", "Value"],
      keys:    ["metric", "value"],
      types:   ["string", "integer"],
      rows: [
        ["total_tickets",           Number(k?.totalTickets ?? 0)],
        ["tickets_with_sla_target", withSla],
        ["sla_breached_count",      breached],
        ["sla_compliance_pct",      pct(withSla - breached, withSla)],
        ["avg_first_response_s",    k?.avgFirst ?? null],
        ["avg_resolution_time_s",   k?.avgRes   ?? null],
      ],
    },
    dimSheet("SLA By Priority", "priority", priorityLabel as unknown as Record<string, string>, byPri),
    dimSheet("SLA By Category", "category", categoryLabel as unknown as Record<string, string>, byCat),
    dimSheet("SLA By Team",     "team",     null, byTeam),
  ];
}

async function fetchAgentsSheets(since: Date, until: Date): Promise<Sheet[]> {
  interface Row {
    agentId: string; agentName: string; totalAssigned: bigint;
    open: bigint; resolved: bigint;
    avgResolutionSeconds: number | null; firstResponseSeconds: number | null;
    slaTotal: bigint; slaBreached: bigint;
  }

  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT t."assignedToId" AS "agentId", COALESCE(u.name,'Unknown') AS "agentName",
            COUNT(*)                                                                    AS "totalAssigned",
            COUNT(*) FILTER(WHERE t.status='open')                                     AS open,
            COUNT(*) FILTER(WHERE t.status IN('resolved','closed'))                    AS resolved,
            ROUND(AVG(EXTRACT(EPOCH FROM(t."resolvedAt"-t."createdAt")))
                  FILTER(WHERE t."resolvedAt" IS NOT NULL AND t.status IN('resolved','closed')))::int AS "avgResolutionSeconds",
            ROUND(AVG(EXTRACT(EPOCH FROM(t."firstRespondedAt"-t."createdAt")))
                  FILTER(WHERE t."firstRespondedAt" IS NOT NULL))::int                 AS "firstResponseSeconds",
            COUNT(*) FILTER(WHERE t."resolutionDueAt" IS NOT NULL)                     AS "slaTotal",
            COUNT(*) FILTER(WHERE t."slaBreached"=true)                                AS "slaBreached"
     FROM ticket t JOIN "user" u ON u.id=t."assignedToId"
     WHERE t.status NOT IN('new','processing') AND t."assignedToId" IS NOT NULL
       AND t."createdAt">=$1 AND t."createdAt"<=$2
     GROUP BY t."assignedToId", u.name ORDER BY resolved DESC`,
    since, until,
  );

  return [{
    name:    "Agent Performance",
    headers: ["Agent Name", "Total Assigned", "Open", "Resolved", "Avg Resolution (s)", "Avg First Response (s)", "SLA Compliance (%)"],
    keys:    ["agent_name", "total_assigned", "open", "resolved", "avg_resolution_s", "avg_first_response_s", "sla_compliance_pct"],
    types:   ["string", "integer", "integer", "integer", "seconds", "seconds", "percent"],
    rows: rows.map(r => {
      const sT = Number(r.slaTotal);
      const sB = Number(r.slaBreached);
      return [
        r.agentName,
        Number(r.totalAssigned),
        Number(r.open),
        Number(r.resolved),
        r.avgResolutionSeconds ?? null,
        r.firstResponseSeconds ?? null,
        pct(sT - sB, sT),
      ];
    }),
  }];
}

async function fetchTeamsSheets(since: Date, until: Date): Promise<Sheet[]> {
  interface Row {
    teamId: number; teamName: string;
    totalAssigned: bigint; open: bigint; resolved: bigint;
    avgResolutionSeconds: number | null; slaTotal: bigint; slaBreached: bigint;
  }

  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT q.id AS "teamId", q.name AS "teamName",
            COUNT(t.id)                                                                AS "totalAssigned",
            COUNT(t.id) FILTER(WHERE t.status='open')                                 AS open,
            COUNT(t.id) FILTER(WHERE t.status IN('resolved','closed'))                AS resolved,
            ROUND(AVG(EXTRACT(EPOCH FROM(t."resolvedAt"-t."createdAt")))
                  FILTER(WHERE t."resolvedAt" IS NOT NULL AND t.status IN('resolved','closed')))::int AS "avgResolutionSeconds",
            COUNT(t.id) FILTER(WHERE t."resolutionDueAt" IS NOT NULL)                 AS "slaTotal",
            COUNT(t.id) FILTER(WHERE t."slaBreached"=true)                            AS "slaBreached"
     FROM "queue" q
     LEFT JOIN ticket t ON t."queueId"=q.id
       AND t."createdAt">=$1 AND t."createdAt"<=$2 AND t.status NOT IN('new','processing')
     GROUP BY q.id, q.name ORDER BY resolved DESC`,
    since, until,
  );

  return [{
    name:    "Team Performance",
    headers: ["Team Name", "Total Assigned", "Open", "Resolved", "Avg Resolution (s)", "SLA Compliance (%)"],
    keys:    ["team_name", "total_assigned", "open", "resolved", "avg_resolution_s", "sla_compliance_pct"],
    types:   ["string", "integer", "integer", "integer", "seconds", "percent"],
    rows: rows.map(r => {
      const sT = Number(r.slaTotal);
      const sB = Number(r.slaBreached);
      return [r.teamName, Number(r.totalAssigned), Number(r.open), Number(r.resolved), r.avgResolutionSeconds ?? null, pct(sT - sB, sT)];
    }),
  }];
}

async function fetchIncidentsSheets(since: Date, until: Date): Promise<Sheet[]> {
  interface Stats { total: bigint; majorCount: bigint; slaBreached: bigint; mtta: number | null; mttr: number | null; }

  const [stats, byStatus, byPriority, dates] = await Promise.all([
    prisma.$queryRaw<Stats[]>`
      SELECT COUNT(*) AS total,
             COUNT(*) FILTER(WHERE "is_major"=true)  AS "majorCount",
             COUNT(*) FILTER(WHERE "sla_breached"=true) AS "slaBreached",
             ROUND(AVG(EXTRACT(EPOCH FROM("acknowledged_at"-"createdAt")))
                   FILTER(WHERE "acknowledged_at" IS NOT NULL))::int AS mtta,
             ROUND(AVG(EXTRACT(EPOCH FROM("resolved_at"-"createdAt")))
                   FILTER(WHERE "resolved_at" IS NOT NULL AND status IN('resolved','closed')))::int AS mttr
      FROM incident WHERE "createdAt">=${since} AND "createdAt"<=${until}`,
    prisma.incident.groupBy({ by: ["status"],   where: { createdAt: { gte: since, lte: until } }, _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
    prisma.incident.groupBy({ by: ["priority"], where: { createdAt: { gte: since, lte: until } }, _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
    prisma.incident.findMany({ where: { createdAt: { gte: since, lte: until } }, select: { createdAt: true } }),
  ]);

  const s = stats[0];

  return [
    {
      name:    "Incident KPIs",
      headers: ["Metric", "Value"],
      keys:    ["metric", "value"],
      types:   ["string", "integer"],
      rows: [
        ["total_incidents",  Number(s?.total ?? 0)],
        ["major_incidents",  Number(s?.majorCount ?? 0)],
        ["sla_breached",     Number(s?.slaBreached ?? 0)],
        ["mtta_s",           s?.mtta ?? null],
        ["mttr_s",           s?.mttr ?? null],
      ],
    },
    {
      name:    "By Status",
      headers: ["Status", "Count"],
      keys:    ["status", "count"],
      types:   ["string", "integer"],
      rows: byStatus.map(r => [String(r.status), r._count.id]),
    },
    {
      name:    "By Priority",
      headers: ["Priority", "Count"],
      keys:    ["priority", "count"],
      types:   ["string", "integer"],
      rows: byPriority.map(r => [String(r.priority), r._count.id]),
    },
    {
      name:    "Daily Volume",
      headers: ["Date", "Incidents"],
      keys:    ["date", "incidents"],
      types:   ["date_iso", "integer"],
      rows:    buildVolRows(dates, since, until),
    },
  ];
}

async function fetchRequestsSheets(since: Date, until: Date): Promise<Sheet[]> {
  interface Stats { total: bigint; slaBreached: bigint; avgFulfillmentSeconds: number | null; }
  interface ItemRow { name: string; count: bigint; avgSeconds: number | null; }

  const [stats, byStatus, topItems, withSlaCount] = await Promise.all([
    prisma.$queryRaw<Stats[]>`
      SELECT COUNT(*) AS total,
             COUNT(*) FILTER(WHERE "sla_breached"=true) AS "slaBreached",
             ROUND(AVG(EXTRACT(EPOCH FROM(COALESCE("resolved_at","closed_at")-"createdAt")))
                   FILTER(WHERE COALESCE("resolved_at","closed_at") IS NOT NULL))::int AS "avgFulfillmentSeconds"
      FROM service_request WHERE "createdAt">=${since} AND "createdAt"<=${until}`,
    prisma.serviceRequest.groupBy({ by: ["status"], where: { createdAt: { gte: since, lte: until } }, _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
    prisma.$queryRaw<ItemRow[]>`
      SELECT COALESCE("catalog_item_name",'Ad-hoc Request') AS name,
             COUNT(*)                                        AS count,
             ROUND(AVG(EXTRACT(EPOCH FROM(COALESCE("resolved_at","closed_at")-"createdAt")))
                   FILTER(WHERE COALESCE("resolved_at","closed_at") IS NOT NULL))::int AS "avgSeconds"
      FROM service_request WHERE "createdAt">=${since} AND "createdAt"<=${until}
      GROUP BY "catalog_item_name" ORDER BY count DESC LIMIT 20`,
    prisma.serviceRequest.count({ where: { createdAt: { gte: since, lte: until }, slaDueAt: { not: null } } }),
  ]);

  const s = stats[0];
  const breached = Number(s?.slaBreached ?? 0);

  return [
    {
      name:    "Request KPIs",
      headers: ["Metric", "Value"],
      keys:    ["metric", "value"],
      types:   ["string", "integer"],
      rows: [
        ["total_requests",         Number(s?.total ?? 0)],
        ["sla_breached_count",     breached],
        ["sla_compliance_pct",     pct(withSlaCount - breached, withSlaCount)],
        ["avg_fulfillment_time_s", s?.avgFulfillmentSeconds ?? null],
      ],
    },
    {
      name:    "By Status",
      headers: ["Status", "Count"],
      keys:    ["status", "count"],
      types:   ["string", "integer"],
      rows: byStatus.map(r => [String(r.status), r._count.id]),
    },
    {
      name:    "Top Catalog Items",
      headers: ["Catalog Item", "Request Count", "Avg Fulfillment (s)"],
      keys:    ["catalog_item", "request_count", "avg_fulfillment_s"],
      types:   ["string", "integer", "seconds"],
      rows: topItems.map(r => [r.name, Number(r.count), r.avgSeconds ?? null]),
    },
  ];
}

async function fetchProblemsSheets(since: Date, until: Date): Promise<Sheet[]> {
  interface Stats { total: bigint; knownErrors: bigint; avgResolutionDays: number | null; }
  interface RecRow { linkedCount: bigint; }

  const [stats, byStatus, recRows] = await Promise.all([
    prisma.$queryRaw<Stats[]>`
      SELECT COUNT(*) AS total,
             COUNT(*) FILTER(WHERE "is_known_error"=true) AS "knownErrors",
             ROUND(AVG(EXTRACT(EPOCH FROM(COALESCE("resolved_at","closed_at")-"createdAt"))/86400.0)
                   FILTER(WHERE COALESCE("resolved_at","closed_at") IS NOT NULL),2) AS "avgResolutionDays"
      FROM problem WHERE "createdAt">=${since} AND "createdAt"<=${until}`,
    prisma.problem.groupBy({ by: ["status"], where: { createdAt: { gte: since, lte: until } }, _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
    prisma.$queryRaw<RecRow[]>`
      SELECT COUNT(*) AS "linkedCount"
      FROM problem_incident_link pil JOIN problem p ON p.id=pil."problem_id"
      WHERE p."createdAt">=${since} AND p."createdAt"<=${until}
      GROUP BY pil."problem_id"`,
  ]);

  const s = stats[0];

  return [
    {
      name:    "Problem KPIs",
      headers: ["Metric", "Value"],
      keys:    ["metric", "value"],
      types:   ["string", "decimal_2"],
      rows: [
        ["total_problems",            Number(s?.total ?? 0)],
        ["known_errors",              Number(s?.knownErrors ?? 0)],
        ["with_linked_incidents",     recRows.filter(r => Number(r.linkedCount) >= 1).length],
        ["recurring_ge2_incidents",   recRows.filter(r => Number(r.linkedCount) >= 2).length],
        ["avg_resolution_days",       s?.avgResolutionDays ?? null],
      ],
    },
    {
      name:    "By Status",
      headers: ["Status", "Count"],
      keys:    ["status", "count"],
      types:   ["string", "integer"],
      rows: byStatus.map(r => [String(r.status), r._count.id]),
    },
  ];
}

async function fetchApprovalsSheets(since: Date, until: Date): Promise<Sheet[]> {
  interface Stats { total: bigint; avgTurnaroundSeconds: number | null; }
  interface PendingRow { id: number; title: string; subjectType: string; createdAt: Date; }

  const [stats, byStatus, oldest] = await Promise.all([
    prisma.$queryRaw<Stats[]>`
      SELECT COUNT(*) AS total,
             ROUND(AVG(EXTRACT(EPOCH FROM("resolvedAt"-"createdAt")))
                   FILTER(WHERE "resolvedAt" IS NOT NULL AND status IN('approved','rejected')))::int AS "avgTurnaroundSeconds"
      FROM approval_request WHERE "createdAt">=${since} AND "createdAt"<=${until}`,
    prisma.approvalRequest.groupBy({ by: ["status"], where: { createdAt: { gte: since, lte: until } }, _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
    prisma.approvalRequest.findMany({
      where: { status: "pending" }, orderBy: { createdAt: "asc" }, take: 25,
      select: { id: true, title: true, subjectType: true, createdAt: true },
    }),
  ]);

  const s   = stats[0];
  const now = Date.now();

  return [
    {
      name:    "Approval KPIs",
      headers: ["Metric", "Value"],
      keys:    ["metric", "value"],
      types:   ["string", "integer"],
      rows: [
        ["total_approvals",       Number(s?.total ?? 0)],
        ["avg_turnaround_s",      s?.avgTurnaroundSeconds ?? null],
        ["pending_count",         byStatus.find(r => String(r.status) === "pending")?._count.id  ?? 0],
        ["approved_count",        byStatus.find(r => String(r.status) === "approved")?._count.id ?? 0],
        ["rejected_count",        byStatus.find(r => String(r.status) === "rejected")?._count.id ?? 0],
      ],
    },
    {
      name:    "By Status",
      headers: ["Status", "Count"],
      keys:    ["status", "count"],
      types:   ["string", "integer"],
      rows: byStatus.map(r => [String(r.status), r._count.id]),
    },
    {
      name:    "Oldest Pending",
      headers: ["ID", "Title", "Subject Type", "Created Date", "Days Pending"],
      keys:    ["id", "title", "subject_type", "created_date", "days_pending"],
      types:   ["integer", "string", "string", "date_iso", "integer"],
      rows: oldest.map(r => [
        r.id, r.title, r.subjectType, isoDate(r.createdAt),
        Math.floor((now - r.createdAt.getTime()) / 86_400_000),
      ]),
    },
  ];
}

async function fetchChangesSheets(since: Date, until: Date): Promise<Sheet[]> {
  interface Stats { total: bigint; failed: bigint; emergency: bigint; avgApprovalSec: number | null; }

  const [stats, byState, byType, byRisk, dates] = await Promise.all([
    prisma.$queryRaw<Stats[]>`
      SELECT COUNT(c.*) AS total,
             COUNT(c.*) FILTER(WHERE c.state='failed')       AS failed,
             COUNT(c.*) FILTER(WHERE c.change_type='emergency') AS emergency,
             ROUND(AVG(EXTRACT(EPOCH FROM(ar."resolvedAt"-ar."createdAt")))
                   FILTER(WHERE ar."resolvedAt" IS NOT NULL))::int AS "avgApprovalSec"
      FROM change_request c
      LEFT JOIN approval_request ar ON ar.subject_type='change_request' AND ar.subject_id=c.id::text
      WHERE c."createdAt">=${since} AND c."createdAt"<=${until}`,
    prisma.$queryRaw<{state: string; count: bigint}[]>`SELECT COALESCE(state::text,'unknown') AS state, COUNT(*) AS count FROM change_request WHERE "createdAt">=${since} AND "createdAt"<=${until} GROUP BY state ORDER BY count DESC`,
    prisma.$queryRaw<{change_type: string; count: bigint}[]>`SELECT COALESCE(change_type::text,'unknown') AS change_type, COUNT(*) AS count FROM change_request WHERE "createdAt">=${since} AND "createdAt"<=${until} GROUP BY change_type ORDER BY count DESC`,
    prisma.$queryRaw<{risk: string; count: bigint}[]>`SELECT COALESCE(risk::text,'unset') AS risk, COUNT(*) AS count FROM change_request WHERE "createdAt">=${since} AND "createdAt"<=${until} GROUP BY risk ORDER BY count DESC`,
    prisma.$queryRaw<{createdAt: Date}[]>`SELECT "createdAt" FROM change_request WHERE "createdAt">=${since} AND "createdAt"<=${until}`,
  ]);

  const s     = stats[0];
  const total = Number(s?.total ?? 0);
  const failed = Number(s?.failed ?? 0);

  const volMap = new Map<string, number>();
  for (const c of dates) { const k = isoDate(c.createdAt); volMap.set(k, (volMap.get(k) ?? 0) + 1); }
  const volRows: CellValue[][] = [];
  const cur = new Date(since);
  while (cur <= until) { const k = isoDate(cur); volRows.push([k, volMap.get(k) ?? 0]); cur.setDate(cur.getDate() + 1); }

  return [
    {
      name:    "Change KPIs",
      headers: ["Metric", "Value"],
      keys:    ["metric", "value"],
      types:   ["string", "integer"],
      rows: [
        ["total_changes",        total],
        ["failed_changes",       failed],
        ["success_rate_pct",     pct(total - failed, total)],
        ["emergency_changes",    Number(s?.emergency ?? 0)],
        ["avg_approval_time_s",  s?.avgApprovalSec ?? null],
      ],
    },
    {
      name: "By State",    headers: ["State", "Count"],       keys: ["state", "count"],       types: ["string","integer"] as ColType[],
      rows: byState.map(r  => [String(r.state),       Number(r.count)]),
    },
    {
      name: "By Type",     headers: ["Change Type", "Count"], keys: ["change_type","count"],  types: ["string","integer"] as ColType[],
      rows: byType.map(r   => [String(r.change_type), Number(r.count)]),
    },
    {
      name: "By Risk",     headers: ["Risk Level", "Count"],  keys: ["risk_level","count"],   types: ["string","integer"] as ColType[],
      rows: byRisk.map(r   => [String(r.risk),        Number(r.count)]),
    },
    {
      name:    "Daily Volume",
      headers: ["Date", "Changes"],
      keys:    ["date", "changes"],
      types:   ["date_iso", "integer"],
      rows:    volRows,
    },
  ];
}

async function fetchCsatSheets(since: Date, until: Date): Promise<Sheet[]> {
  interface TrendRow { day: string; avgRating: number | null; count: bigint; }
  interface RatingRow { rating: number; count: bigint; }

  const [trend, ratings, summary] = await Promise.all([
    prisma.$queryRaw<TrendRow[]>`
      SELECT TO_CHAR("submittedAt",'YYYY-MM-DD') AS day,
             ROUND(AVG(rating)::numeric,2)        AS "avgRating",
             COUNT(*)                              AS count
      FROM csat_rating WHERE "submittedAt">=${since} AND "submittedAt"<=${until}
      GROUP BY day ORDER BY day`,
    prisma.$queryRaw<RatingRow[]>`
      SELECT rating::int, COUNT(*) AS count FROM csat_rating
      WHERE "submittedAt">=${since} AND "submittedAt"<=${until}
      GROUP BY rating ORDER BY rating`,
    prisma.$queryRaw<[{avg: number|null; total: bigint}]>`
      SELECT ROUND(AVG(rating)::numeric,2) AS avg, COUNT(*) AS total
      FROM csat_rating WHERE "submittedAt">=${since} AND "submittedAt"<=${until}`,
  ]);

  const s     = summary[0];
  const total = Number(s?.total ?? 0);
  const map   = new Map(ratings.map(r => [r.rating, Number(r.count)]));

  return [
    {
      name:    "CSAT Summary",
      headers: ["Metric", "Value"],
      keys:    ["metric", "value"],
      types:   ["string", "decimal_2"],
      rows: [
        ["total_ratings",    total],
        ["avg_rating",       s?.avg ?? null],
        ["5_star_count",     map.get(5) ?? 0],
        ["4_star_count",     map.get(4) ?? 0],
        ["3_star_count",     map.get(3) ?? 0],
        ["2_star_count",     map.get(2) ?? 0],
        ["1_star_count",     map.get(1) ?? 0],
      ],
    },
    {
      name:    "Rating Breakdown",
      headers: ["Stars", "Count", "Share (%)"],
      keys:    ["stars", "count", "share_pct"],
      types:   ["integer", "integer", "percent"],
      rows: [5,4,3,2,1].map(n => [n, map.get(n) ?? 0, pct(map.get(n) ?? 0, total)]),
    },
    {
      name:    "Daily Trend",
      headers: ["Date", "Avg Rating", "Response Count"],
      keys:    ["date", "avg_rating", "response_count"],
      types:   ["date_iso", "decimal_2", "integer"],
      rows: trend.map(r => [r.day, r.avgRating ?? null, Number(r.count)]),
    },
  ];
}

async function fetchKbSheets(since: Date, until: Date): Promise<Sheet[]> {
  interface SearchRow { query: string; count: bigint; avgResultCount: number; zeroResultsCount: bigint; }

  const [totals, queries, articleStatus] = await Promise.all([
    prisma.$queryRaw<[{total: bigint; zero: bigint}]>`
      SELECT COUNT(*) AS total, COUNT(*) FILTER(WHERE "result_count"=0) AS zero
      FROM kb_search_log WHERE "created_at">=${since} AND "created_at"<=${until}`,
    prisma.$queryRaw<SearchRow[]>`
      SELECT LOWER(TRIM(query)) AS query, COUNT(*) AS count,
             ROUND(AVG("result_count")::numeric,1) AS "avgResultCount",
             COUNT(*) FILTER(WHERE "result_count"=0) AS "zeroResultsCount"
      FROM kb_search_log
      WHERE "created_at">=${since} AND "created_at"<=${until} AND LENGTH(TRIM(query))>=2
      GROUP BY LOWER(TRIM(query)) ORDER BY count DESC LIMIT 50`,
    prisma.kbArticle.groupBy({ by: ["status"], _count: { id: true } }),
  ]);

  const total = Number(totals[0]?.total ?? 0);
  const zero  = Number(totals[0]?.zero  ?? 0);

  return [
    {
      name:    "KB Summary",
      headers: ["Metric", "Value"],
      keys:    ["metric", "value"],
      types:   ["string", "integer"],
      rows: [
        ["total_searches",      total],
        ["unique_queries",      queries.length],
        ["zero_result_count",   zero],
        ["zero_result_rate_pct", pct(zero, total)],
        ["articles_published",  articleStatus.find(s => String(s.status) === "published")?._count.id ?? 0],
        ["articles_draft",      articleStatus.find(s => String(s.status) === "draft")?._count.id ?? 0],
        ["articles_archived",   articleStatus.find(s => String(s.status) === "archived")?._count.id ?? 0],
      ],
    },
    {
      name:    "Top Search Queries",
      headers: ["Search Query", "Search Count", "Avg Results Returned", "Zero-Result Count"],
      keys:    ["search_query", "search_count", "avg_results_returned", "zero_result_count"],
      types:   ["string", "integer", "decimal_1", "integer"],
      rows: queries.map(r => [r.query, Number(r.count), Number(r.avgResultCount), Number(r.zeroResultsCount)]),
    },
  ];
}

async function fetchRealtimeSheets(): Promise<Sheet[]> {
  interface Health { open: bigint; unassigned: bigint; overdue: bigint; at_risk: bigint; assigned_not_replied: bigint; }

  const [health, byTeam] = await Promise.all([
    prisma.$queryRaw<Health[]>`
      SELECT
        COUNT(*) FILTER(WHERE status IN('open','in_progress'))                                    AS open,
        COUNT(*) FILTER(WHERE status IN('open','in_progress') AND "assignedToId" IS NULL)        AS unassigned,
        COUNT(*) FILTER(WHERE status IN('open','in_progress') AND "slaBreached"=true)            AS overdue,
        COUNT(*) FILTER(WHERE status IN('open','in_progress') AND "slaBreached"=false
                               AND "resolutionDueAt" IS NOT NULL
                               AND "resolutionDueAt"<=NOW()+INTERVAL'2 hours'
                               AND "resolutionDueAt">NOW())                                        AS at_risk,
        (SELECT COUNT(*) FROM ticket t2
         WHERE t2.status IN('open','in_progress') AND t2."assignedToId" IS NOT NULL
           AND NOT EXISTS(SELECT 1 FROM reply r WHERE r."ticketId"=t2.id AND r."senderType"='agent')) AS assigned_not_replied
      FROM ticket`,
    prisma.$queryRaw<{name: string; open: bigint; unassigned: bigint}[]>`
      SELECT q.name,
             COUNT(t.id) FILTER(WHERE t.status IN('open','in_progress'))                AS open,
             COUNT(t.id) FILTER(WHERE t.status IN('open','in_progress') AND t."assignedToId" IS NULL) AS unassigned
      FROM "queue" q LEFT JOIN ticket t ON t."queueId"=q.id
      GROUP BY q.name ORDER BY open DESC`,
  ]);

  const h = health[0];
  return [
    {
      name:    "Live Health",
      headers: ["Metric", "Count (Live)"],
      keys:    ["metric", "count_live"],
      types:   ["string", "integer"],
      rows: [
        ["open_and_in_progress",    Number(h?.open ?? 0)],
        ["unassigned",              Number(h?.unassigned ?? 0)],
        ["sla_overdue",             Number(h?.overdue ?? 0)],
        ["at_risk_lt_2hrs",         Number(h?.at_risk ?? 0)],
        ["assigned_not_replied",    Number(h?.assigned_not_replied ?? 0)],
      ],
    },
    {
      name:    "By Team (Live)",
      headers: ["Team Name", "Open Tickets", "Unassigned"],
      keys:    ["team_name", "open_tickets", "unassigned"],
      types:   ["string", "integer", "integer"],
      rows: byTeam.map(r => [r.name, Number(r.open), Number(r.unassigned)]),
    },
  ];
}

async function fetchLibrarySheets(): Promise<Sheet[]> {
  const reports = await prisma.savedReport.findMany({
    select: { id: true, name: true, description: true, visibility: true, isCurated: true, createdAt: true, updatedAt: true, owner: { select: { name: true } } },
    orderBy: [{ isCurated: "desc" }, { updatedAt: "desc" }],
  });

  return [{
    name:    "Saved Reports",
    headers: ["ID", "Name", "Description", "Visibility", "Is Curated", "Owner", "Created Date", "Updated Date"],
    keys:    ["id", "name", "description", "visibility", "is_curated", "owner", "created_date", "updated_date"],
    types:   ["integer", "string", "string", "string", "bool_int", "string", "date_iso", "date_iso"],
    rows: reports.map(r => [
      r.id, r.name, r.description ?? null,
      String(r.visibility ?? "private"),
      r.isCurated ? 1 : 0,
      r.owner?.name ?? null,
      isoDate(r.createdAt),
      isoDate(r.updatedAt),
    ]),
  }];
}

// ── Section dispatcher ────────────────────────────────────────────────────────

async function getSheetsForSection(
  section: string,
  since:   Date,
  until:   Date,
  filters: Filters,
): Promise<Sheet[]> {
  switch (section) {
    case "overview":  return fetchOverviewSheets(since, until, filters);
    case "tickets":   return fetchTicketsSheets(since, until, filters);
    case "sla":       return fetchSlaSheets(since, until, filters);
    case "agents":    return fetchAgentsSheets(since, until);
    case "teams":     return fetchTeamsSheets(since, until);
    case "incidents": return fetchIncidentsSheets(since, until);
    case "requests":  return fetchRequestsSheets(since, until);
    case "problems":  return fetchProblemsSheets(since, until);
    case "approvals": return fetchApprovalsSheets(since, until);
    case "changes":   return fetchChangesSheets(since, until);
    case "csat":      return fetchCsatSheets(since, until);
    case "kb":        return fetchKbSheets(since, until);
    case "realtime":  return fetchRealtimeSheets();
    case "library":   return fetchLibrarySheets();
    default:          return fetchOverviewSheets(since, until, filters);
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.post("/export", async (req, res) => {
  const body = validate(exportSchema, req.body, res);
  if (!body) return;

  const { section, period, from, to, format, filters } = body;
  const { since, until } = resolveDateWindow(period, from, to);
  const title      = SECTION_TITLES[section] ?? "Report";
  const exportedAt = isoTs();
  const dateLabel  = buildPeriodLabel(period, from, to);
  const filterDesc = filters
    ? Object.entries(filters).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${v}`).join("; ") || "None"
    : "None";

  const meta: ExportMeta = {
    title, section, dateLabel, filterDesc,
    exportedBy: req.user!.name,
    exportedAt,
  };

  const sheets = await getSheetsForSection(section, since, until, filters);
  const filename = buildFilename(title, exportedAt, format);

  if (format === "xlsx") {
    const buffer = await buildStyledWorkbook({ ...meta, sheets });
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } else {
    const csv = buildCsv(meta, sheets);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.send(csv);
  }
});

export default router;
