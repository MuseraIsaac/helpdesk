/**
 * Shared inbound-email processor.
 *
 * Both inbound paths feed into this function:
 *   1. SendGrid Inbound Parse webhook  → routes/webhooks.ts
 *   2. IMAP poller (Gmail / generic)   → lib/check-inbound-email.ts
 *
 * Responsibilities:
 *   - Strip Re:/Fwd: prefixes
 *   - Look up an existing open ticket from the same sender on the same
 *     subject — if found, append a customer reply instead of creating a
 *     new ticket.
 *   - Otherwise create a new ticket, run intake routing rules, send the
 *     auto-response email, and enqueue the classify + auto-resolve jobs.
 *   - De-duplicate by Message-ID so the same email never produces two
 *     tickets even if the IMAP poller and webhook both deliver it.
 *
 * The function is intentionally tolerant of missing fields — providers
 * supply varying header sets and shapes. Anything not provided is treated
 * as null and downstream code (intake rules, SLA, audit) handles it.
 */

import prisma from "../db";
import { AI_AGENT_ID } from "core/constants/ai-agent.ts";
import { sendClassifyJob } from "./classify-ticket";
import { sendAutoResolveJob } from "./auto-resolve-ticket";
import { computeSlaDeadlines } from "./sla";
import { logAudit } from "./audit";
import { upsertCustomer } from "./upsert-customer";
import { generateTicketNumber } from "./ticket-number";
import { sendEmailJob } from "./send-email";
import { renderNotificationEmail } from "./render-notification-email";
import { getSection } from "./settings";
import {
  saveFile,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
} from "./storage";
import {
  runIntakeRouting,
  detectAutoReply,
  detectBounce,
  extractHeader,
} from "./intake-routing";
import { fireTicketEvent } from "./event-bus";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Normalized inbound-email payload. Both transports map their wire format
 * onto this shape before calling processInboundEmail().
 */
export interface InboundEmailInput {
  /** Plain `from` header — RFC-822 mailbox without the display name. */
  fromEmail: string;
  /** Display name from the From header, or the local-part if absent. */
  fromName: string;
  subject: string;
  /** Plain-text body (preferred). Empty string is fine; HTML will be used as fallback. */
  bodyText: string;
  /** Optional HTML body. */
  bodyHtml?: string;
  /** Recipient address as it arrived (lowercased acceptable). */
  to?: string | null;
  cc?: string | null;
  /** Reply-To header value, if any. */
  replyTo?: string | null;
  /** Raw header block (used for X-* extraction and auto-reply / bounce sniffing). */
  rawHeaders?: string;
  /** RFC-822 Message-ID (without angle brackets). Required for dedup. */
  messageId?: string | null;
  /** 0-N attachments with mime/size/buffer. */
  attachments?: InboundAttachment[];
  /** SendGrid spam_score — IMAP path passes 0 (Gmail does its own filtering). */
  spamScore?: number;
  /**
   * Where this email came from. Used in audit metadata — does not change
   * behaviour. "webhook" = SendGrid Inbound Parse; "imap" = IMAP poll.
   */
  source: "webhook" | "imap";
}

export interface InboundAttachment {
  filename: string;
  mimeType: string;
  size: number;
  /** File contents. */
  content: Buffer;
}

export interface InboundEmailResult {
  /** "created" → new ticket; "appended" → customer reply on an existing ticket; "duplicate" → skipped. */
  outcome: "created" | "appended" | "duplicate";
  ticketId?: number;
  replyId?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function stripSubjectPrefixes(subject: string): string {
  return subject.replace(/^(Re:\s*|Fwd:\s*)+/i, "").trim();
}

export function parseFromField(from: string): { email: string; name: string } {
  const match = from.match(/^(.*?)\s*<(.+)>$/);
  if (match) {
    return { name: match[1]!.trim() || match[2]!, email: match[2]! };
  }
  return { name: from, email: from };
}

async function saveAttachments(
  files: InboundAttachment[],
  ticketId: number,
  replyId?: number
): Promise<void> {
  for (const f of files) {
    if (!ALLOWED_MIME_TYPES.has(f.mimeType)) {
      console.warn(`[inbound-email] attachment skipped (disallowed type): ${f.mimeType}`);
      continue;
    }
    if (f.size > MAX_FILE_SIZE) {
      console.warn(`[inbound-email] attachment skipped (too large): ${f.size} bytes`);
      continue;
    }
    try {
      const { key: storageKey, checksum, provider: storageProvider } =
        await saveFile(f.content, f.filename);
      await prisma.attachment.create({
        data: {
          filename: f.filename,
          mimeType: f.mimeType,
          size: f.size,
          storageKey,
          storageProvider,
          checksum,
          virusScanStatus: "skipped",
          ticketId,
          replyId: replyId ?? null,
          uploadedById: null,
        },
      });
    } catch (err) {
      console.error("[inbound-email] failed to save attachment:", err);
    }
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function processInboundEmail(input: InboundEmailInput): Promise<InboundEmailResult> {
  const fromEmail = input.fromEmail.trim().toLowerCase();
  const fromName  = input.fromName.trim() || fromEmail;
  const subject   = input.subject.trim();
  const normalizedSubject = stripSubjectPrefixes(subject);
  const bodyText  = input.bodyText ?? "";
  const bodyHtml  = input.bodyHtml ?? null;
  const messageId = input.messageId?.trim() || null;
  const attachments = input.attachments ?? [];

  // ── Dedup by Message-ID ───────────────────────────────────────────────────
  // Two transports can deliver the same email (e.g. webhook fires AND IMAP
  // poller picks the same message before it's marked Seen). emailMessageId
  // is unique per inbound message so we use it as the dedup key on either
  // a ticket OR a reply.
  if (messageId) {
    const existingTicket = await prisma.ticket.findFirst({
      where: { emailMessageId: messageId },
      select: { id: true },
    });
    if (existingTicket) {
      return { outcome: "duplicate", ticketId: existingTicket.id };
    }
    const existingReply = await prisma.reply.findFirst({
      where: { emailMessageId: messageId },
      select: { id: true, ticketId: true },
    });
    if (existingReply) {
      return { outcome: "duplicate", ticketId: existingReply.ticketId, replyId: existingReply.id };
    }
  }

  // ── Existing ticket → append customer reply ───────────────────────────────
  const existingTicket = await prisma.ticket.findFirst({
    where: {
      senderEmail: fromEmail,
      status: { notIn: ["resolved", "closed"] },
      subject: { equals: normalizedSubject, mode: "insensitive" },
    },
  });

  if (existingTicket) {
    const reply = await prisma.reply.create({
      data: {
        body:     bodyText,
        bodyHtml: bodyHtml,
        senderType: "customer",
        ticketId: existingTicket.id,
        userId:   null,
        emailMessageId: messageId,
        channel: "email",
        channelMeta: {
          messageId,
          from: `${fromName} <${fromEmail}>`,
          via: input.source === "imap" ? "email_imap" : "email_inbound",
        },
      },
    });
    await saveAttachments(attachments, existingTicket.id, reply.id);
    void prisma.ticket.update({
      where: { id: existingTicket.id },
      data: { lastCustomerReplyAt: reply.createdAt },
    });
    fireTicketEvent("ticket.reply_received", existingTicket.id, null);
    return { outcome: "appended", ticketId: existingTicket.id, replyId: reply.id };
  }

  // ── New ticket ────────────────────────────────────────────────────────────
  const now = new Date();
  const customerId = await upsertCustomer(fromEmail, fromName);
  const ticketNumber = await generateTicketNumber(null, now);

  const rawHeaders = input.rawHeaders ?? "";
  const autoReply  = detectAutoReply(rawHeaders);
  const bounce     = detectBounce(rawHeaders, normalizedSubject);
  const spamScore  = input.spamScore ?? 0;
  const mailboxAlias = extractHeader(rawHeaders, "X-Mailbox-Alias");

  // ── Mailbox routing — match the To address to a configured mailbox ────────
  const integrationsCfg = await getSection("integrations");
  const { email: normalizedTo } = parseFromField(input.to ?? "");
  const matchedMailbox = (integrationsCfg.mailboxes ?? []).find(
    (mb) => mb.isActive && mb.address.toLowerCase() === normalizedTo.toLowerCase()
  );
  const mailboxTeamId  = matchedMailbox?.teamId         ?? null;
  const mailboxPriority = matchedMailbox?.defaultPriority ?? null;
  const resolvedMailboxAlias =
    mailboxAlias ?? (matchedMailbox ? matchedMailbox.label : null);

  const slaDeadlines = computeSlaDeadlines(mailboxPriority, now);

  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber,
      subject:    normalizedSubject,
      body:       bodyText,
      bodyHtml,
      senderName: fromName,
      senderEmail: fromEmail,
      customerId,
      assignedToId: AI_AGENT_ID,
      source: "email",
      priority: mailboxPriority ?? null,
      teamId:   mailboxTeamId   ?? null,
      firstResponseDueAt: slaDeadlines.firstResponseDueAt,
      resolutionDueAt:    slaDeadlines.resolutionDueAt,
      emailMessageId: messageId,
      emailTo:      input.to      ?? null,
      emailCc:      input.cc      ?? null,
      emailReplyTo: input.replyTo ?? null,
      isAutoReply:  autoReply,
      isBounce:     bounce,
      mailboxAlias: resolvedMailboxAlias ?? null,
    },
  });

  // ── Intake rules (run synchronously before jobs) ──────────────────────────
  const intakeResult = await runIntakeRouting(ticket.id, {
    emailTo:      input.to      ?? null,
    emailCc:      input.cc      ?? null,
    emailReplyTo: input.replyTo ?? null,
    isAutoReply:  autoReply,
    isBounce:     bounce,
    mailboxAlias: mailboxAlias ?? null,
    spamScore,
  });

  if (intakeResult.suppressed || intakeResult.spam) {
    void logAudit(ticket.id, null, "ticket.intake_suppressed", {
      via: input.source === "imap" ? "imap" : "email",
      spam: intakeResult.spam,
      suppressed: intakeResult.suppressed,
    });
    return { outcome: "created", ticketId: ticket.id };
  }

  void logAudit(ticket.id, null, "ticket.created", {
    via: input.source === "imap" ? "imap" : "email",
  });
  void saveAttachments(attachments, ticket.id);
  fireTicketEvent("ticket.created", ticket.id, null);

  // ── Auto-response email (skip if an intake rule already sent one) ─────────
  if (!intakeResult.autoReplySent) {
    void (async () => {
      try {
        const integrations = await getSection("integrations");
        const apiKey   = integrations.sendgridApiKey  || process.env.SENDGRID_API_KEY  || "";
        const fromAddr = integrations.fromEmail        || process.env.SENDGRID_FROM_EMAIL || "";
        // SendGrid path needs both; SMTP path also works with smtpHost+smtpUser+fromAddr.
        if (!fromAddr) return;
        if (integrations.emailProvider === "sendgrid" && !apiKey) return;

        const rendered = await renderNotificationEmail("ticket.created", {
          entityNumber:  ticket.ticketNumber,
          entityTitle:   ticket.subject,
          entityUrl:     `/tickets/${ticket.id}`,
          senderName:    ticket.senderName,
          senderEmail:   ticket.senderEmail,
          recipientName: ticket.senderName,
        });
        if (!rendered) return;

        await sendEmailJob({
          to:       ticket.senderEmail,
          subject:  rendered.subject,
          body:     rendered.bodyText,
          bodyHtml: rendered.bodyHtml,
          ...(ticket.emailMessageId && { inReplyTo: ticket.emailMessageId, references: ticket.emailMessageId }),
        });
      } catch (err) {
        console.error(`[inbound-email] auto-response failed for ticket ${ticket.id}:`, err);
      }
    })();
  }

  if (!autoReply && !bounce && !intakeResult.quarantined) {
    sendClassifyJob(ticket).catch((err) =>
      console.error(`[inbound-email] failed to enqueue classify for ticket ${ticket.id}:`, err)
    );
    sendAutoResolveJob(ticket).catch((err) =>
      console.error(`[inbound-email] failed to enqueue auto-resolve for ticket ${ticket.id}:`, err)
    );
  }

  return { outcome: "created", ticketId: ticket.id };
}
