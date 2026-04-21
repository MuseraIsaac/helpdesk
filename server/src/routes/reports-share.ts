/**
 * POST /api/reports/share-email
 *
 * Sends a formatted report snapshot to one or more email addresses.
 * The email includes key metrics for the requested section and a direct
 * link back to the live report in the system.
 */
import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../middleware/require-auth";
import { validate } from "../lib/validate";
import { sendEmailJob } from "../lib/send-email";
import prisma from "../db";
import { AI_AGENT_ID } from "core/constants/ai-agent.ts";

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

function fmtDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60)   return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
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
  custom:    "Custom Report",
};

// ── Metric snapshot query ─────────────────────────────────────────────────────

interface OverviewSnapshot {
  totalTickets:            bigint;
  openTickets:             bigint;
  resolvedTickets:         bigint;
  breachedTickets:         bigint;
  ticketsWithSlaTarget:    bigint;
  avgFirstResponseSeconds: number | null;
  avgResolutionSeconds:    number | null;
}

async function fetchSnapshot(since: Date, until: Date) {
  const rows = await prisma.$queryRawUnsafe<OverviewSnapshot[]>(
    `SELECT
       COUNT(*) FILTER (WHERE status NOT IN ('new','processing'))         AS "totalTickets",
       COUNT(*) FILTER (WHERE status = 'open')                           AS "openTickets",
       COUNT(*) FILTER (WHERE status IN ('resolved','closed'))           AS "resolvedTickets",
       COUNT(*) FILTER (WHERE "slaBreached" = true)                      AS "breachedTickets",
       COUNT(*) FILTER (WHERE "resolutionDueAt" IS NOT NULL
                          AND status NOT IN ('new','processing'))         AS "ticketsWithSlaTarget",
       ROUND(AVG(EXTRACT(EPOCH FROM ("firstRespondedAt" - "createdAt")))
               FILTER (WHERE "firstRespondedAt" IS NOT NULL))::int       AS "avgFirstResponseSeconds",
       ROUND(AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")))
               FILTER (WHERE "resolvedAt" IS NOT NULL
                         AND status IN ('resolved','closed')))::int      AS "avgResolutionSeconds"
     FROM ticket
     WHERE "createdAt" >= $1 AND "createdAt" <= $2`,
    since,
    until,
  );
  return rows[0] ?? null;
}

// ── HTML email builder ────────────────────────────────────────────────────────

function buildEmailHtml(opts: {
  senderName:   string;
  sectionLabel: string;
  periodLabel:  string;
  appUrl:       string;
  reportPath:   string;
  message?:     string;
  snapshot:     OverviewSnapshot | null;
}) {
  const { senderName, sectionLabel, periodLabel, appUrl, reportPath, message, snapshot } = opts;

  const slaCompliance = snapshot && Number(snapshot.ticketsWithSlaTarget) > 0
    ? `${Math.round(((Number(snapshot.ticketsWithSlaTarget) - Number(snapshot.breachedTickets)) / Number(snapshot.ticketsWithSlaTarget)) * 100)}%`
    : "—";

  const metricsHtml = snapshot ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-collapse:collapse;">
      <tr>
        <td style="padding:4px 0 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;">
          Ticket Snapshot
        </td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f9fafb;border-radius:8px;overflow:hidden;">
      ${[
        ["Total Tickets",          String(Number(snapshot.totalTickets))],
        ["Open",                   String(Number(snapshot.openTickets))],
        ["Resolved / Closed",      String(Number(snapshot.resolvedTickets))],
        ["SLA Compliance",         slaCompliance],
        ["Avg First Response",     fmtDuration(snapshot.avgFirstResponseSeconds)],
        ["Avg Resolution Time",    fmtDuration(snapshot.avgResolutionSeconds)],
      ].map(([label, value], i) => `
        <tr style="border-top:${i === 0 ? "none" : "1px solid #e5e7eb"};">
          <td style="padding:10px 16px;font-size:13px;color:#374151;">${label}</td>
          <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#111827;text-align:right;">${value}</td>
        </tr>
      `).join("")}
    </table>
  ` : "";

  const messageHtml = message ? `
    <div style="margin:20px 0;padding:14px 16px;background:#f0f4ff;border-left:3px solid #6366f1;border-radius:0 6px 6px 0;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#6366f1;text-transform:uppercase;letter-spacing:0.06em;">Message</p>
      <p style="margin:0;font-size:13px;color:#374151;white-space:pre-line;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
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
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">${sectionLabel} Report</h1>
              <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">${periodLabel}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px 8px;">
              <p style="margin:0 0 6px;font-size:14px;color:#374151;">
                <strong style="color:#111827;">${senderName.replace(/</g, "&lt;")}</strong> shared a report with you.
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

  // Fetch overview snapshot for all sections (provides useful context)
  const snapshot = await fetchSnapshot(since, until);

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

  for (const email of emails) {
    await sendEmailJob({
      to:       email,
      subject:  `${sectionLabel} Report shared by ${sender.name} — ${periodLabel}`,
      body:     `${sender.name} shared the ${sectionLabel} report (${periodLabel}) with you.\n\nView it here: ${appUrl}${reportPath}${message ? `\n\nMessage: ${message}` : ""}`,
      bodyHtml: buildEmailHtml({
        senderName:   sender.name,
        sectionLabel,
        periodLabel,
        appUrl,
        reportPath,
        message,
        snapshot,
      }),
    });
  }

  res.json({ ok: true, sent: emails.length });
});

export default router;
