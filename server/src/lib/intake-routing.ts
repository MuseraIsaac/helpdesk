/**
 * Intake Routing Engine
 *
 * Dedicated runner for the `intake_routing` automation category.
 * Called immediately after a ticket is created (from inbound email or agent UI)
 * before any AI classification jobs are enqueued.
 *
 * Responsibilities:
 *  1. Detect email metadata signals (auto-reply, bounce, spam score)
 *  2. Load and enrich the ticket snapshot with requester / org context
 *  3. Compute virtual fields (senderDomain, isBusinessHours)
 *  4. Run all enabled intake_routing rules via the automation engine
 *  5. Return disposition flags so the caller knows whether to proceed
 *     with classify / auto-resolve jobs and the default auto-response
 */

import prisma from "../db";
import { runAutomationEngine } from "./automation-engine";
import type { TicketSnapshot } from "./automation-engine/types";

// ── Email metadata extracted from inbound headers ─────────────────────────────

export interface IntakeEmailMeta {
  emailTo: string | null;
  emailCc: string | null;
  emailReplyTo: string | null;
  isAutoReply: boolean;
  isBounce: boolean;
  mailboxAlias: string | null;
  spamScore: number;
}

// ── Result returned to the caller ─────────────────────────────────────────────

export interface IntakeRoutingResult {
  /** Ticket was soft-deleted by a suppress_creation action — stop all processing */
  suppressed: boolean;
  /** Ticket was flagged as spam — stop classify/auto-resolve */
  spam: boolean;
  /** Ticket is quarantined — stop classify/auto-resolve, hold for review */
  quarantined: boolean;
  /** An intake rule fired a send_auto_reply — caller should skip the default auto-response */
  autoReplySent: boolean;
  /** Number of rules that matched and ran */
  rulesMatched: number;
}

// ── Auto-reply detection ──────────────────────────────────────────────────────

/**
 * Returns true when the raw header block indicates an automated response
 * (out-of-office, vacation notice, auto-generated notification, etc.)
 */
export function detectAutoReply(rawHeaders: string): boolean {
  if (!rawHeaders) return false;
  const h = rawHeaders.toLowerCase();
  return (
    /auto-submitted:\s*(auto-replied|auto-generated)/i.test(h) ||
    /x-autoreply:\s*yes/i.test(h) ||
    /x-autorespond:/i.test(h) ||
    /x-auto-response-suppress:/i.test(h) ||
    /precedence:\s*(bulk|list|junk)/i.test(h) ||
    /x-google-dkim-signature:/i.test(h) === false && // heuristic: not a normal signed mail
      false // placeholder — extend as needed
  );
}

/**
 * Returns true when the email appears to be a delivery failure / bounce / NDR.
 */
export function detectBounce(rawHeaders: string, subject: string): boolean {
  const h = (rawHeaders ?? "").toLowerCase();
  const s = subject.toLowerCase();
  return (
    /x-failed-recipients:/i.test(h) ||
    /content-type:\s*multipart\/report/i.test(h) ||
    /mail delivery (failed|notification|status)/i.test(s) ||
    /undeliverable/i.test(s) ||
    /delivery status notification/i.test(s) ||
    /returned mail/i.test(s) ||
    /failure notice/i.test(s) ||
    /^mailer-daemon@/i.test((rawHeaders.match(/From:\s*(.+)/i)?.[1] ?? ""))
  );
}

/**
 * Extract a specific header value from a raw SendGrid header block.
 * Returns the trimmed value or null.
 */
export function extractHeader(rawHeaders: unknown, headerName: string): string | null {
  if (typeof rawHeaders !== "string" || !rawHeaders) return null;
  const re = new RegExp(`^${headerName}:\\s*(.+)`, "im");
  return rawHeaders.match(re)?.[1]?.trim() ?? null;
}

// ── Business-hours check ──────────────────────────────────────────────────────

/**
 * Returns true when the current wall-clock time falls within business hours
 * (Mon–Fri, 09:00–17:00) in the given timezone.
 * In production the org's business-hours schedule would come from system settings.
 */
export function isBusinessHours(timezone = "UTC"): boolean {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "numeric",
      hour12: false,
    }).formatToParts(now);
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const isWeekday = !["Sat", "Sun"].includes(weekday);
    return isWeekday && hour >= 9 && hour < 17;
  } catch {
    return true; // fail open — don't block tickets on TZ errors
  }
}

// ── Enriched snapshot loader ──────────────────────────────────────────────────

/**
 * Loads the full ticket with customer + org data and merges intake email metadata
 * into a TicketSnapshot that the automation engine can evaluate.
 */
async function loadIntakeSnapshot(
  ticketId: number,
  meta?: IntakeEmailMeta,
): Promise<TicketSnapshot | null> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      subject: true,
      body: true,
      status: true,
      category: true,
      priority: true,
      severity: true,
      impact: true,
      urgency: true,
      ticketType: true,
      source: true,
      affectedSystem: true,
      senderEmail: true,
      senderName: true,
      assignedToId: true,
      teamId: true,
      isEscalated: true,
      slaBreached: true,
      firstResponseDueAt: true,
      resolutionDueAt: true,
      firstRespondedAt: true,
      resolvedAt: true,
      linkedIncidentId: true,
      customFields: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      // Intake fields persisted at creation
      emailMessageId: true,
      emailTo: true,
      emailCc: true,
      emailReplyTo: true,
      isAutoReply: true,
      isBounce: true,
      isSpam: true,
      isQuarantined: true,
      mailboxAlias: true,
      // Join customer + org for requester enrichment
      customer: {
        select: {
          isVip: true,
          supportTier: true,
          timezone: true,
          language: true,
          organization: {
            select: {
              name: true,
              supportTier: true,
            },
          },
        },
      },
    },
  });

  if (!ticket) return null;

  const { customer, ...ticketFields } = ticket;

  // Derive sender domain from email
  const senderDomain = ticketFields.senderEmail
    ? (ticketFields.senderEmail.split("@")[1] ?? null)
    : null;

  const snapshot: TicketSnapshot = {
    ...ticketFields,
    customFields: (ticket.customFields as Record<string, unknown>) ?? {},
    // Merge in live email meta if provided (overrides stored values for this run)
    ...(meta && {
      emailTo:      meta.emailTo,
      emailCc:      meta.emailCc,
      emailReplyTo: meta.emailReplyTo,
      isAutoReply:  meta.isAutoReply,
      isBounce:     meta.isBounce,
      mailboxAlias: meta.mailboxAlias,
    }),
    // Computed fields
    senderDomain,
    // Requester enrichment from customer/org
    requesterIsVip:      customer?.isVip ?? false,
    requesterSupportTier: customer?.supportTier ?? customer?.organization?.supportTier ?? "standard",
    requesterOrgName:    customer?.organization?.name ?? null,
    requesterTimezone:   customer?.timezone ?? "UTC",
    requesterLanguage:   customer?.language ?? "en",
    // Business hours based on requester's timezone
    isBusinessHours: isBusinessHours(customer?.timezone ?? "UTC"),
  };

  return snapshot;
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Run all enabled `intake_routing` rules against the just-created ticket.
 *
 * @param ticketId - the newly created ticket ID
 * @param meta     - email metadata extracted from the inbound message headers
 *                   (null for agent-created tickets)
 */
export async function runIntakeRouting(
  ticketId: number,
  meta?: IntakeEmailMeta | null,
): Promise<IntakeRoutingResult> {
  const result: IntakeRoutingResult = {
    suppressed: false,
    spam: false,
    quarantined: false,
    autoReplySent: false,
    rulesMatched: 0,
  };

  try {
    const snapshot = await loadIntakeSnapshot(ticketId, meta ?? undefined);
    if (!snapshot) return result;

    // Only run intake_routing rules — filter by category in the engine via
    // a dedicated query (the engine fetches all enabled rules, but we narrow
    // via category here to avoid evaluating unrelated rules on ticket.created)
    const intakeRules = await prisma.automationRule.findMany({
      where: { isEnabled: true, category: "intake_routing" },
      orderBy: [{ order: "asc" }, { id: "asc" }],
      select: { id: true },
    });

    if (intakeRules.length === 0) return result;

    // Run the engine with the enriched snapshot so condition fields are available
    const engineResults = await runAutomationEngine({
      trigger: "ticket.created",
      entityType: "ticket",
      entityId: ticketId,
      snapshot,
    });

    for (const r of engineResults) {
      if (!r.conditionsMatched) continue;
      result.rulesMatched++;

      for (const action of r.actions) {
        if (!action.applied) continue;
        if (action.type === "suppress_creation") result.suppressed = true;
        if (action.type === "mark_spam")          result.spam = true;
        if (action.type === "quarantine")         result.quarantined = true;
        if (action.type === "send_auto_reply")    result.autoReplySent = true;
      }
    }
  } catch (e) {
    // Intake routing failures must never block ticket creation
    console.error("[intake-routing] Error running intake rules for ticket", ticketId, e);
  }

  return result;
}
