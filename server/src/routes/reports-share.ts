/**
 * POST /api/reports/share-email
 *
 * Sends a formatted report snapshot to one or more email addresses.
 * The snapshot reflects the section the user is sharing — SLA, CSAT,
 * Incidents, etc. each get their own metrics rather than a generic
 * ticket overview.
 */
import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../middleware/require-auth";
import { validate } from "../lib/validate";
import { sendEmailJob } from "../lib/send-email";
import { logSystemAudit } from "../lib/audit";
import prisma from "../db";
import { buildStyledWorkbook } from "../lib/excel-export";
import { buildFilename, isoTs, type ExportMeta, type Sheet } from "../lib/export-metadata";
import { getSheetsForSection } from "./reports-export";
import { runQuery } from "../lib/analytics/engine";
import { queryResultToSheet, deduplicateSheetNames } from "./analytics";

/** Skip the attachment if the workbook would exceed this size (10 MB). */
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const router = Router();
router.use(requireAuth);

// ── Schema ────────────────────────────────────────────────────────────────────

const shareSchema = z.object({
  section:  z.string().min(1).max(60),
  period:   z.string().optional(),
  from:     z.string().optional(),
  to:       z.string().optional(),
  reportId: z.number().int().positive().nullable().optional(),
  emails:   z.array(z.email()).min(1).max(20),
  message:  z.string().max(500).optional(),
});

// ── Date helpers ──────────────────────────────────────────────────────────────

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

function fmtDate(d: Date) {
  return d.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60)   return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtPct(num: number | null | undefined): string {
  return num == null ? "—" : `${Math.round(num)}%`;
}

// ── Section label ─────────────────────────────────────────────────────────────

const SECTION_LABELS: Record<string, string> = {
  overview:  "Overview",
  tickets:   "Tickets",
  sla:       "SLA",
  agents:    "Agents",
  teams:     "Teams",
  incidents: "Incidents",
  requests:  "Requests",
  problems:  "Problems",
  approvals: "Approvals",
  changes:   "Changes",
  csat:      "CSAT",
  kb:        "Knowledge Base",
  realtime:  "Real-time",
  assets:    "Assets",
  insights:  "Insights",
  library:   "Report Library",
  custom:    "Custom Report",
};

// ── Snapshot types ────────────────────────────────────────────────────────────

type SnapshotRow = [label: string, value: string];
interface Snapshot { title: string; rows: SnapshotRow[]; }

// ── Per-section snapshots ─────────────────────────────────────────────────────

async function ticketSnapshot(since: Date, until: Date, title = "Ticket Snapshot"): Promise<Snapshot | null> {
  interface Row {
    totalTickets: bigint; openTickets: bigint; resolvedTickets: bigint;
    breachedTickets: bigint; ticketsWithSlaTarget: bigint;
    avgFirstResponseSeconds: number | null; avgResolutionSeconds: number | null;
  }
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      COUNT(*) FILTER (WHERE status NOT IN ('new','processing'))         AS "totalTickets",
      COUNT(*) FILTER (WHERE status = 'open')                            AS "openTickets",
      COUNT(*) FILTER (WHERE status IN ('resolved','closed'))            AS "resolvedTickets",
      COUNT(*) FILTER (WHERE "slaBreached" = true)                       AS "breachedTickets",
      COUNT(*) FILTER (WHERE "resolutionDueAt" IS NOT NULL
                         AND status NOT IN ('new','processing'))         AS "ticketsWithSlaTarget",
      ROUND(AVG(EXTRACT(EPOCH FROM ("firstRespondedAt" - "createdAt")))
            FILTER (WHERE "firstRespondedAt" IS NOT NULL))::int          AS "avgFirstResponseSeconds",
      ROUND(AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")))
            FILTER (WHERE "resolvedAt" IS NOT NULL
                      AND status IN ('resolved','closed')))::int         AS "avgResolutionSeconds"
    FROM ticket
    WHERE "createdAt" >= ${since} AND "createdAt" <= ${until}
  `;
  const r = rows[0]; if (!r) return null;
  const withSla = Number(r.ticketsWithSlaTarget);
  const breached = Number(r.breachedTickets);
  const compliance = withSla > 0 ? Math.round(((withSla - breached) / withSla) * 100) : null;
  return {
    title,
    rows: [
      ["Total Tickets",       String(Number(r.totalTickets))],
      ["Open",                String(Number(r.openTickets))],
      ["Resolved / Closed",   String(Number(r.resolvedTickets))],
      ["SLA Compliance",      fmtPct(compliance)],
      ["Avg First Response",  fmtDuration(r.avgFirstResponseSeconds)],
      ["Avg Resolution Time", fmtDuration(r.avgResolutionSeconds)],
    ],
  };
}

async function slaSnapshot(since: Date, until: Date): Promise<Snapshot | null> {
  interface Row {
    withSla: bigint; breached: bigint; metOnTime: bigint;
    avgFirstResponseSeconds: number | null; avgResolutionSeconds: number | null;
  }
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      COUNT(*) FILTER (WHERE "resolutionDueAt" IS NOT NULL
                         AND status NOT IN ('new','processing'))         AS "withSla",
      COUNT(*) FILTER (WHERE "slaBreached" = true)                       AS breached,
      COUNT(*) FILTER (WHERE "slaBreached" = false
                         AND status IN ('resolved','closed'))            AS "metOnTime",
      ROUND(AVG(EXTRACT(EPOCH FROM ("firstRespondedAt" - "createdAt")))
            FILTER (WHERE "firstRespondedAt" IS NOT NULL))::int          AS "avgFirstResponseSeconds",
      ROUND(AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")))
            FILTER (WHERE "resolvedAt" IS NOT NULL
                      AND status IN ('resolved','closed')))::int         AS "avgResolutionSeconds"
    FROM ticket
    WHERE "createdAt" >= ${since} AND "createdAt" <= ${until}
  `;
  const r = rows[0]; if (!r) return null;
  const withSla = Number(r.withSla);
  const breached = Number(r.breached);
  const compliance = withSla > 0 ? Math.round(((withSla - breached) / withSla) * 100) : null;
  return {
    title: "SLA Snapshot",
    rows: [
      ["Tickets Tracked",       String(withSla)],
      ["Met On Time",           String(Number(r.metOnTime))],
      ["Breached",              String(breached)],
      ["SLA Compliance",        fmtPct(compliance)],
      ["Avg First Response",    fmtDuration(r.avgFirstResponseSeconds)],
      ["Avg Resolution Time",   fmtDuration(r.avgResolutionSeconds)],
    ],
  };
}

async function agentSnapshot(since: Date, until: Date): Promise<Snapshot | null> {
  interface Row { agentName: string; resolved: bigint; }
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT COALESCE(u.name, 'Unknown') AS "agentName",
           COUNT(*) FILTER (WHERE t.status IN ('resolved','closed')) AS resolved
    FROM ticket t
    JOIN "user" u ON u.id = t."assignedToId"
    WHERE t.status NOT IN ('new','processing')
      AND t."assignedToId" IS NOT NULL
      AND t."createdAt" >= ${since} AND t."createdAt" <= ${until}
    GROUP BY u.name
    ORDER BY resolved DESC, "agentName" ASC
    LIMIT 5
  `;
  if (rows.length === 0) return { title: "Top Agents", rows: [["No resolved tickets in this period", "—"]] };
  return {
    title: "Top Agents (by Resolved)",
    rows: rows.map(r => [r.agentName, String(Number(r.resolved))] as SnapshotRow),
  };
}

async function teamSnapshot(since: Date, until: Date): Promise<Snapshot | null> {
  interface Row { teamName: string; total: bigint; resolved: bigint; }
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT COALESCE(tm.name, 'Unassigned') AS "teamName",
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE t.status IN ('resolved','closed')) AS resolved
    FROM ticket t
    LEFT JOIN team tm ON tm.id = t."team_id"
    WHERE t.status NOT IN ('new','processing')
      AND t."createdAt" >= ${since} AND t."createdAt" <= ${until}
    GROUP BY tm.name
    ORDER BY total DESC
    LIMIT 6
  `;
  if (rows.length === 0) return { title: "Team Performance", rows: [["No tickets in this period", "—"]] };
  return {
    title: "Team Performance",
    rows: rows.map(r => [
      r.teamName,
      `${Number(r.resolved)} / ${Number(r.total)} resolved`,
    ] as SnapshotRow),
  };
}

async function incidentSnapshot(since: Date, until: Date): Promise<Snapshot | null> {
  interface Row {
    total: bigint; majorCount: bigint; slaBreached: bigint;
    open: bigint; mtta: number | null; mttr: number | null;
  }
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE "is_major" = true)                AS "majorCount",
      COUNT(*) FILTER (WHERE "sla_breached" = true)            AS "slaBreached",
      COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed')) AS open,
      ROUND(AVG(EXTRACT(EPOCH FROM ("acknowledged_at" - "createdAt")))
            FILTER (WHERE "acknowledged_at" IS NOT NULL))::int  AS mtta,
      ROUND(AVG(EXTRACT(EPOCH FROM ("resolved_at" - "createdAt")))
            FILTER (WHERE "resolved_at" IS NOT NULL
                      AND status IN ('resolved','closed')))::int AS mttr
    FROM incident WHERE "createdAt" >= ${since} AND "createdAt" <= ${until}
  `;
  const r = rows[0]; if (!r) return null;
  return {
    title: "Incident Snapshot",
    rows: [
      ["Total Incidents",      String(Number(r.total))],
      ["Open",                 String(Number(r.open))],
      ["Major Incidents",      String(Number(r.majorCount))],
      ["SLA Breached",         String(Number(r.slaBreached))],
      ["Mean Time To Ack",     fmtDuration(r.mtta)],
      ["Mean Time To Resolve", fmtDuration(r.mttr)],
    ],
  };
}

async function requestSnapshot(since: Date, until: Date): Promise<Snapshot | null> {
  const { REQUEST_UNION_CTE } = await import("../lib/analytics/request-source");
  interface Row {
    total: bigint; open: bigint; fulfilled: bigint;
    withSla: bigint; slaBreached: bigint;
    avgFulfillmentSeconds: number | null;
  }
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `WITH ${REQUEST_UNION_CTE}
     SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE resolved_at IS NULL)                       AS open,
       COUNT(*) FILTER (WHERE resolved_at IS NOT NULL)                   AS fulfilled,
       COUNT(*) FILTER (WHERE sla_due_at IS NOT NULL)                    AS "withSla",
       COUNT(*) FILTER (WHERE sla_due_at IS NOT NULL
                          AND (sla_breached = true
                            OR (resolved_at IS NOT NULL AND resolved_at > sla_due_at))) AS "slaBreached",
       ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)))
            FILTER (WHERE resolved_at IS NOT NULL AND resolved_at >= created_at))::int
                                                                          AS "avgFulfillmentSeconds"
     FROM unified_requests
     WHERE created_at >= $1 AND created_at <= $2`,
    since, until,
  );
  const r = rows[0]; if (!r) return null;
  const withSla = Number(r.withSla);
  const breached = Number(r.slaBreached);
  const compliance = withSla > 0 ? Math.round(((withSla - breached) / withSla) * 100) : null;
  return {
    title: "Service Request Snapshot",
    rows: [
      ["Total Requests",      String(Number(r.total))],
      ["Open",                String(Number(r.open))],
      ["Fulfilled",           String(Number(r.fulfilled))],
      ["SLA Compliance",      fmtPct(compliance)],
      ["Avg Fulfillment",     fmtDuration(r.avgFulfillmentSeconds)],
    ],
  };
}

async function problemSnapshot(since: Date, until: Date): Promise<Snapshot | null> {
  interface Row {
    total: bigint; open: bigint; resolved: bigint;
    knownErrors: bigint; avgResolutionDays: number | null;
  }
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE "resolved_at" IS NULL AND "closed_at" IS NULL) AS open,
      COUNT(*) FILTER (WHERE "resolved_at" IS NOT NULL OR "closed_at" IS NOT NULL) AS resolved,
      COUNT(*) FILTER (WHERE "is_known_error" = true) AS "knownErrors",
      ROUND(AVG(EXTRACT(EPOCH FROM (
        COALESCE("resolved_at","closed_at") - "createdAt"
      )) / 86400.0) FILTER (WHERE COALESCE("resolved_at","closed_at") IS NOT NULL), 1)
        AS "avgResolutionDays"
    FROM problem WHERE "createdAt" >= ${since} AND "createdAt" <= ${until}
  `;
  const r = rows[0]; if (!r) return null;
  const days = r.avgResolutionDays;
  return {
    title: "Problem Snapshot",
    rows: [
      ["Total Problems",       String(Number(r.total))],
      ["Open",                 String(Number(r.open))],
      ["Resolved",             String(Number(r.resolved))],
      ["Known Errors",         String(Number(r.knownErrors))],
      ["Avg Resolution",       days == null ? "—" : `${Number(days).toFixed(1)} days`],
    ],
  };
}

async function approvalSnapshot(since: Date, until: Date): Promise<Snapshot | null> {
  interface Row {
    total: bigint; pending: bigint; approved: bigint; rejected: bigint;
    avgTurnaroundSeconds: number | null;
  }
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'pending')  AS pending,
      COUNT(*) FILTER (WHERE status = 'approved') AS approved,
      COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
      ROUND(AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")))
            FILTER (WHERE "resolvedAt" IS NOT NULL AND status IN ('approved','rejected')))::int
            AS "avgTurnaroundSeconds"
    FROM approval_request WHERE "createdAt" >= ${since} AND "createdAt" <= ${until}
  `;
  const r = rows[0]; if (!r) return null;
  return {
    title: "Approval Snapshot",
    rows: [
      ["Total Approvals",     String(Number(r.total))],
      ["Pending",             String(Number(r.pending))],
      ["Approved",            String(Number(r.approved))],
      ["Rejected",            String(Number(r.rejected))],
      ["Avg Turnaround",      fmtDuration(r.avgTurnaroundSeconds)],
    ],
  };
}

async function changeSnapshot(since: Date, until: Date): Promise<Snapshot | null> {
  interface Row {
    total: bigint; failed: bigint; emergency: bigint;
    completed: bigint; avgApprovalSec: number | null;
  }
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      COUNT(*)                                            AS total,
      COUNT(*) FILTER (WHERE c.state = 'failed')          AS failed,
      COUNT(*) FILTER (WHERE c.state = 'completed')       AS completed,
      COUNT(*) FILTER (WHERE c.change_type = 'emergency') AS emergency,
      ROUND(AVG(EXTRACT(EPOCH FROM (ar."resolvedAt" - ar."createdAt")))
            FILTER (WHERE ar."resolvedAt" IS NOT NULL))::int AS "avgApprovalSec"
    FROM change_request c
    LEFT JOIN approval_request ar
      ON ar.subject_type = 'change_request' AND ar.subject_id = c.id::text
    WHERE c."createdAt" >= ${since} AND c."createdAt" <= ${until}
  `;
  const r = rows[0]; if (!r) return null;
  const total = Number(r.total);
  const failed = Number(r.failed);
  const successRate = total > 0 ? Math.round(((total - failed) / total) * 100) : null;
  return {
    title: "Change Snapshot",
    rows: [
      ["Total Changes",       String(total)],
      ["Completed",           String(Number(r.completed))],
      ["Failed",              String(failed)],
      ["Emergency",           String(Number(r.emergency))],
      ["Success Rate",        fmtPct(successRate)],
      ["Avg Approval Time",   fmtDuration(r.avgApprovalSec)],
    ],
  };
}

async function csatSnapshot(since: Date, until: Date): Promise<Snapshot | null> {
  interface Row {
    total: bigint; avgRating: number | null; positive: bigint; negative: bigint;
  }
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      COUNT(*) AS total,
      ROUND(AVG(rating)::numeric, 2)::float8 AS "avgRating",
      COUNT(*) FILTER (WHERE rating >= 4) AS positive,
      COUNT(*) FILTER (WHERE rating <= 2) AS negative
    FROM csat_rating
    WHERE "submittedAt" >= ${since} AND "submittedAt" <= ${until}
  `;
  const r = rows[0]; if (!r) return null;
  const total = Number(r.total);
  const positive = Number(r.positive);
  const negative = Number(r.negative);
  const positivePct = total > 0 ? Math.round((positive / total) * 100) : null;
  const negativePct = total > 0 ? Math.round((negative / total) * 100) : null;
  return {
    title: "CSAT Snapshot",
    rows: [
      ["Total Responses",     String(total)],
      ["Average Rating",      r.avgRating == null ? "—" : `${Number(r.avgRating).toFixed(2)} / 5`],
      ["Positive (4–5★)",     `${positive} (${fmtPct(positivePct)})`],
      ["Negative (1–2★)",     `${negative} (${fmtPct(negativePct)})`],
    ],
  };
}

async function kbSnapshot(since: Date, until: Date): Promise<Snapshot | null> {
  interface ArticleRow { totalArticles: bigint; published: bigint; }
  interface SearchRow  { searches: bigint; zero: bigint; }
  const [aRows, sRows] = await Promise.all([
    prisma.$queryRaw<ArticleRow[]>`
      SELECT COUNT(*) AS "totalArticles",
             COUNT(*) FILTER (WHERE status = 'published') AS published
      FROM kb_article
    `,
    prisma.$queryRaw<SearchRow[]>`
      SELECT COUNT(*) AS searches,
             COUNT(*) FILTER (WHERE "resultCount" = 0) AS zero
      FROM kb_search_log
      WHERE "created_at" >= ${since} AND "created_at" <= ${until}
    `,
  ]);
  const a = aRows[0]; const s = sRows[0];
  const searches = Number(s?.searches ?? 0);
  const zero = Number(s?.zero ?? 0);
  const zeroRate = searches > 0 ? Math.round((zero / searches) * 100) : null;
  return {
    title: "Knowledge Base Snapshot",
    rows: [
      ["Total Articles",      String(Number(a?.totalArticles ?? 0))],
      ["Published",           String(Number(a?.published ?? 0))],
      ["Searches in Period",  String(searches)],
      ["Zero-Result Rate",    fmtPct(zeroRate)],
    ],
  };
}

async function realtimeSnapshot(): Promise<Snapshot | null> {
  interface Row {
    open: bigint; unassigned: bigint; overdue: bigint; processing: bigint;
  }
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      COUNT(*) FILTER (WHERE status = 'open')                          AS open,
      COUNT(*) FILTER (WHERE status = 'open' AND "assignedToId" IS NULL) AS unassigned,
      COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed','new','processing')
                         AND "resolutionDueAt" IS NOT NULL
                         AND "resolutionDueAt" < NOW())                AS overdue,
      COUNT(*) FILTER (WHERE status = 'processing')                    AS processing
    FROM ticket
  `;
  const r = rows[0]; if (!r) return null;
  return {
    title: "Live Operations",
    rows: [
      ["Open Tickets",        String(Number(r.open))],
      ["Unassigned",          String(Number(r.unassigned))],
      ["Overdue (SLA)",       String(Number(r.overdue))],
      ["AI Processing",       String(Number(r.processing))],
    ],
  };
}

async function customSnapshot(reportId: number | null | undefined, since: Date, until: Date): Promise<Snapshot | null> {
  if (!reportId) {
    return ticketSnapshot(since, until, "Ticket Snapshot");
  }
  const report = await prisma.savedReport.findUnique({
    where: { id: reportId },
    select: { name: true, description: true, config: true, updatedAt: true, owner: { select: { name: true } } },
  });
  if (!report) return ticketSnapshot(since, until, "Ticket Snapshot");

  const config = (report.config ?? {}) as { widgets?: unknown[] };
  const widgetCount = Array.isArray(config.widgets) ? config.widgets.length : 0;

  const rows: SnapshotRow[] = [
    ["Report Name",   report.name],
    ["Owner",         report.owner?.name ?? "—"],
    ["Widgets",       String(widgetCount)],
    ["Last Updated",  fmtDate(report.updatedAt)],
  ];
  if (report.description) {
    const desc = report.description.length > 80
      ? report.description.slice(0, 77) + "…"
      : report.description;
    rows.splice(1, 0, ["Description", desc]);
  }
  return { title: "Custom Report", rows };
}

// ── Snapshot dispatcher ───────────────────────────────────────────────────────

async function buildSnapshot(
  section: string,
  since: Date,
  until: Date,
  reportId: number | null | undefined,
): Promise<Snapshot | null> {
  switch (section) {
    case "overview":  return ticketSnapshot(since, until, "Ticket Snapshot");
    case "tickets":   return ticketSnapshot(since, until, "Ticket Snapshot");
    case "sla":       return slaSnapshot(since, until);
    case "agents":    return agentSnapshot(since, until);
    case "teams":     return teamSnapshot(since, until);
    case "incidents": return incidentSnapshot(since, until);
    case "requests":  return requestSnapshot(since, until);
    case "problems":  return problemSnapshot(since, until);
    case "approvals": return approvalSnapshot(since, until);
    case "changes":   return changeSnapshot(since, until);
    case "csat":      return csatSnapshot(since, until);
    case "kb":        return kbSnapshot(since, until);
    case "realtime":  return realtimeSnapshot();
    case "custom":    return customSnapshot(reportId, since, until);
    default:          return ticketSnapshot(since, until, "Ticket Snapshot");
  }
}

// ── HTML email builder ────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildEmailHtml(opts: {
  senderName:   string;
  sectionLabel: string;
  periodLabel:  string;
  appUrl:       string;
  reportPath:   string;
  message?:     string;
  snapshot:     Snapshot | null;
}) {
  const { senderName, sectionLabel, periodLabel, appUrl, reportPath, message, snapshot } = opts;

  const metricsHtml = snapshot ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-collapse:collapse;">
      <tr>
        <td style="padding:4px 0 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;">
          ${escapeHtml(snapshot.title)}
        </td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f9fafb;border-radius:8px;overflow:hidden;">
      ${snapshot.rows.map(([label, value], i) => `
        <tr style="border-top:${i === 0 ? "none" : "1px solid #e5e7eb"};">
          <td style="padding:10px 16px;font-size:13px;color:#374151;">${escapeHtml(label)}</td>
          <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#111827;text-align:right;">${escapeHtml(value)}</td>
        </tr>
      `).join("")}
    </table>
  ` : "";

  const messageHtml = message ? `
    <div style="margin:20px 0;padding:14px 16px;background:#f0f4ff;border-left:3px solid #6366f1;border-radius:0 6px 6px 0;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#6366f1;text-transform:uppercase;letter-spacing:0.06em;">Message</p>
      <p style="margin:0;font-size:13px;color:#374151;white-space:pre-line;">${escapeHtml(message)}</p>
    </div>
  ` : "";

  const viewUrl = `${appUrl}${reportPath}`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;">
              <p style="margin:0 0 4px;font-size:12px;font-weight:500;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:0.08em;">
                Report Shared
              </p>
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">${escapeHtml(sectionLabel)} Report</h1>
              <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">${escapeHtml(periodLabel)}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px 8px;">
              <p style="margin:0 0 6px;font-size:14px;color:#374151;">
                <strong style="color:#111827;">${escapeHtml(senderName)}</strong> shared a report with you.
              </p>
              ${messageHtml}
              ${metricsHtml}
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:16px 32px 32px;">
              <a href="${viewUrl}"
                 style="display:inline-block;padding:11px 22px;background:#6366f1;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
                View Full Report →
              </a>
              <p style="margin:12px 0 0;font-size:12px;color:#9ca3af;">
                Or copy this link: <a href="${viewUrl}" style="color:#6366f1;">${viewUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:11px;color:#9ca3af;">
                This report was shared from your ITSM system. You must have a valid account to view live data.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── XLSX builder ──────────────────────────────────────────────────────────────

/**
 * Build the .xlsx workbook for the report being shared. Returns null if
 * something fails — callers should still send the email without attachment
 * rather than block on a snapshot error.
 */
async function buildShareWorkbook(opts: {
  section:    string;
  reportId?:  number | null;
  since:      Date;
  until:      Date;
  periodLabel:string;
  exportedBy: string;
}): Promise<{ buffer: Buffer; filename: string } | null> {
  try {
    let sheets: Sheet[];
    let title:  string;

    if (opts.section === "custom" && opts.reportId) {
      const report = await prisma.savedReport.findUnique({
        where: { id: opts.reportId },
        select: { name: true, config: true },
      });
      if (!report) return null;

      const cfg     = report.config as { dateRange?: { preset?: string; from?: string; to?: string };
                                         widgets?: Array<{ id: string; metricId: string; title?: string;
                                                           groupBy?: string; sort?: { field: string; direction: "asc" | "desc" };
                                                           limit?: number; x?: number; y?: number }> };
      const widgets = cfg.widgets ?? [];
      if (widgets.length === 0) return null;

      const sharedDR = { preset: "custom" as const, from: opts.since.toISOString(), to: opts.until.toISOString() };
      const built: Sheet[] = [];

      await Promise.all(widgets.map(async (w) => {
        try {
          const r = await runQuery(prisma, {
            metricId:            w.metricId,
            dateRange:           sharedDR,
            groupBy:             w.groupBy,
            sort:                w.sort,
            limit:               w.limit ?? 50,
            compareWithPrevious: false,
          });
          built.push(queryResultToSheet(r.result, w.title?.trim() || r.label));
        } catch {
          built.push({
            name:    (w.title || w.metricId).slice(0, 28),
            headers: ["Note"], keys: ["note"], types: ["string"],
            rows:    [[`Query failed for metric: ${w.metricId}`]],
          });
        }
      }));

      const sortedWidgets = [...widgets].sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));
      const ordered = sortedWidgets
        .map(w => {
          const label = w.title?.trim() || w.metricId;
          return built.find(s => s.name.startsWith(label.slice(0, 20)));
        })
        .filter((s): s is Sheet => s !== undefined);

      sheets = deduplicateSheetNames(ordered.length > 0 ? ordered : built);
      title  = report.name;
    } else {
      sheets = await getSheetsForSection(opts.section, opts.since, opts.until, undefined);
      title  = SECTION_LABELS[opts.section] ?? "Report";
    }

    if (sheets.length === 0) return null;

    const exportedAt: string = isoTs();
    const meta: ExportMeta = {
      title,
      section:    opts.section,
      dateLabel:  opts.periodLabel,
      filterDesc: "None",
      exportedBy: opts.exportedBy,
      exportedAt,
    };

    const buffer = await buildStyledWorkbook({ ...meta, sheets });
    return { buffer, filename: buildFilename(title, exportedAt, "xlsx") };
  } catch (err) {
    console.error("[reports-share] xlsx build failed:", err);
    return null;
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.post("/share-email", async (req, res) => {
  const body = validate(shareSchema, req.body, res);
  if (!body) return;

  const { section, period, from, to, reportId, emails, message } = body;

  const { since, until } = resolveDateWindow(period, from, to);
  const sectionLabel = SECTION_LABELS[section] ?? "Report";

  const periodLabel = from
    ? `${fmtDate(since)} – ${fmtDate(until)}`
    : `Last ${period ?? "30"} days`;

  // Build the section-specific snapshot. Fall back to null if the query
  // throws — the email still goes out with the link, just no metrics block.
  let snapshot: Snapshot | null = null;
  try {
    snapshot = await buildSnapshot(section, since, until, reportId);
  } catch (err) {
    console.error(`[reports-share] snapshot failed for section=${section}:`, err);
  }

  // Build the link back to the report
  const appUrl = process.env.APP_URL
    || process.env.BETTER_AUTH_URL
    || process.env.BETTER_AUTH_BASE_URL
    || "";

  let reportPath: string;
  if (section === "custom" && reportId) {
    reportPath = `/reports/custom/${reportId}`;
  } else if (section === "custom") {
    reportPath = "/reports/custom";
  } else {
    const qs = from ? `?from=${from}&to=${to}` : `?period=${period ?? "30"}`;
    reportPath = `/reports/${section}${qs}`;
  }

  const sender = req.user!;

  // Build the .xlsx attachment once and reuse for every recipient.
  // Failures are non-fatal — the email still goes out without the file.
  const workbook = await buildShareWorkbook({
    section:     section,
    reportId:    reportId ?? null,
    since,
    until,
    periodLabel,
    exportedBy:  sender.name,
  });

  let attachmentSent = false;
  let inlineAttachments: { filename: string; mimeType: string; contentBase64: string }[] | undefined;
  if (workbook) {
    if (workbook.buffer.byteLength > MAX_ATTACHMENT_BYTES) {
      console.warn(
        `[reports-share] xlsx for section=${section} exceeds ${MAX_ATTACHMENT_BYTES} bytes ` +
        `(${workbook.buffer.byteLength}); sending without attachment.`,
      );
    } else {
      inlineAttachments = [{
        filename:      workbook.filename,
        mimeType:      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        contentBase64: workbook.buffer.toString("base64"),
      }];
      attachmentSent = true;
    }
  }

  for (const email of emails) {
    await sendEmailJob({
      to:       email,
      subject:  `${sectionLabel} Report shared by ${sender.name} — ${periodLabel}`,
      body:     `${sender.name} shared the ${sectionLabel} report (${periodLabel}) with you.\n\nView it here: ${appUrl}${reportPath}${attachmentSent ? "\n\nA copy of the report is attached as an Excel file." : ""}${message ? `\n\nMessage: ${message}` : ""}`,
      purpose:  "reports",
      bodyHtml: buildEmailHtml({
        senderName:   sender.name,
        sectionLabel,
        periodLabel,
        appUrl,
        reportPath,
        message,
        snapshot,
      }),
      ...(inlineAttachments && { inlineAttachments }),
    });
  }

  void logSystemAudit(sender.id, "report.shared", {
    section,
    sectionLabel,
    recipientCount: emails.length,
    recipients: emails,
    reportId:   reportId ?? null,
    period:     period ?? null,
    from:       from ?? null,
    to:         to ?? null,
    periodLabel,
    hasMessage: Boolean(message && message.length > 0),
    xlsxAttached: attachmentSent,
  });

  res.json({ ok: true, sent: emails.length });
});

export default router;
