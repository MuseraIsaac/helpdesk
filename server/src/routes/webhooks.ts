import { Router } from "express";
import multer from "multer";
import Parse from "@sendgrid/inbound-mail-parser";
import { inboundEmailSchema } from "core/schemas/tickets.ts";
import { requireWebhookSecret } from "../middleware/require-webhook-secret";
import { validate } from "../lib/validate";
import prisma from "../db";
import { sendClassifyJob } from "../lib/classify-ticket";
import { sendAutoResolveJob } from "../lib/auto-resolve-ticket";
import { AI_AGENT_ID } from "core/constants/ai-agent.ts";
import { computeSlaDeadlines } from "../lib/sla";
import { logAudit } from "../lib/audit";
import { upsertCustomer } from "../lib/upsert-customer";
import { generateTicketNumber } from "../lib/ticket-number";
import { sendEmailJob } from "../lib/send-email";
import { renderNotificationEmail } from "../lib/render-notification-email";
import { getSection } from "../lib/settings";
import {
  saveFile,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
} from "../lib/storage";
import {
  runIntakeRouting,
  detectAutoReply,
  detectBounce,
  extractHeader,
} from "../lib/intake-routing";
import { fireTicketEvent } from "../lib/event-bus";

// Accept up to 20 MB total for inbound emails (attachments can be several files)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function stripSubjectPrefixes(subject: string): string {
  return subject.replace(/^(Re:\s*|Fwd:\s*)+/i, "").trim();
}

function parseFromField(from: string): { email: string; name: string } {
  const match = from.match(/^(.*?)\s*<(.+)>$/);
  if (match) {
    return { name: match[1]!.trim() || match[2]!, email: match[2]! };
  }
  return { name: from, email: from };
}

/**
 * Extract the Message-ID value from the raw headers string that SendGrid
 * passes as the `headers` form field.
 * Returns the bare ID without angle brackets, e.g. "abc123@mail.example.com".
 */
function extractMessageId(rawHeaders: unknown): string | null {
  if (typeof rawHeaders !== "string" || !rawHeaders) return null;
  const m = rawHeaders.match(/^Message-ID:\s*<?([^>\r\n]+)>?/im);
  return m?.[1]?.trim() ?? null;
}

/**
 * SendGrid sends email attachments as multipart files with fieldnames
 * attachment1, attachment2, … Save all of them that pass the allowlist.
 * Errors per-file are logged and skipped — a bad attachment must not
 * prevent the ticket or reply from being created.
 */
async function saveInboundAttachments(
  files: Express.Multer.File[],
  ticketId: number,
  replyId?: number
): Promise<void> {
  const attachmentFiles = files.filter((f) => /^attachment\d+$/.test(f.fieldname));

  for (const file of attachmentFiles) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      console.warn(`Inbound attachment skipped (disallowed type): ${file.mimetype}`);
      continue;
    }
    if (file.size > MAX_FILE_SIZE) {
      console.warn(`Inbound attachment skipped (too large): ${file.size} bytes`);
      continue;
    }
    try {
      const { key: storageKey, checksum, provider: storageProvider } = await saveFile(file.buffer, file.originalname);
      await prisma.attachment.create({
        data: {
          filename: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          storageKey,
          storageProvider,
          checksum,
          virusScanStatus: "skipped", // inbound attachments are not scanned synchronously
          ticketId,
          replyId: replyId ?? null,
          uploadedById: null, // inbound — no agent user
        },
      });
    } catch (err) {
      console.error("Failed to save inbound attachment:", err);
    }
  }
}

const router = Router();

router.post("/inbound-email", requireWebhookSecret, upload.any(), async (req, res) => {
  const parser = new Parse(
    { keys: ["to", "from", "subject", "text", "html"] },
    { body: req.body, files: (req.files as Express.Multer.File[]) || [] }
  );
  const parsed = parser.keyValues();
  const { email, name } = parseFromField(parsed.from || "");

  const data = validate(inboundEmailSchema, {
    from: email,
    fromName: name,
    subject: parsed.subject || "",
    body: parsed.text || "",
    bodyHtml: parsed.html || undefined,
  }, res);
  if (!data) return;

  const normalizedSubject = stripSubjectPrefixes(data.subject);
  const emailMessageId = extractMessageId(req.body.headers);
  const files = (req.files as Express.Multer.File[]) || [];

  // Check for existing open ticket from same sender with matching subject
  const existingTicket = await prisma.ticket.findFirst({
    where: {
      senderEmail: data.from,
      status: { notIn: ["resolved", "closed"] },
      subject: { equals: normalizedSubject, mode: "insensitive" },
    },
  });

  if (existingTicket) {
    const reply = await prisma.reply.create({
      data: {
        body: data.body,
        bodyHtml: data.bodyHtml ?? null,
        senderType: "customer",
        ticketId: existingTicket.id,
        userId: null,
        emailMessageId,
        channel: "email",
        channelMeta: {
          messageId: emailMessageId ?? null,
          from: parsed.from ?? null,
          via: "email_inbound",
        },
      },
    });
    await saveInboundAttachments(files, existingTicket.id, reply.id);
    // Stamp lastCustomerReplyAt for time-supervisor scanning
    void prisma.ticket.update({
      where: { id: existingTicket.id },
      data: { lastCustomerReplyAt: reply.createdAt },
    });
    // Fire ticket.reply_received for event_workflow rules
    fireTicketEvent("ticket.reply_received", existingTicket.id, null);
    res.status(200).json({ ticket: existingTicket });
    return;
  }

  const now = new Date();
  const customerId = await upsertCustomer(data.from, data.fromName);
  // Inbound emails have no ticket type at creation time — classified later by AI
  const ticketNumber = await generateTicketNumber(null, now);

  // ── Extract intake metadata from email headers ──────────────────────────
  const rawHeaders = typeof req.body.headers === "string" ? req.body.headers : "";
  const emailTo        = typeof req.body.to === "string" ? req.body.to : (parsed.to ?? null);
  const emailCc        = typeof req.body.cc === "string" ? req.body.cc : null;
  const emailReplyTo   = extractHeader(rawHeaders, "Reply-To");
  const autoReply      = detectAutoReply(rawHeaders);
  const bounce         = detectBounce(rawHeaders, normalizedSubject);
  const spamScore      = parseFloat(req.body.spam_score ?? "0") || 0;
  const mailboxAlias   = extractHeader(rawHeaders, "X-Mailbox-Alias");

  // ── Mailbox routing ────────────────────────────────────────────────────────
  // Check if the inbound "To" address matches a configured mailbox.
  // If so, inherit its team and default priority for auto-routing.
  const integrationsCfg = await getSection("integrations");
  const { email: normalizedEmailTo } = parseFromField(emailTo ?? "");
  const matchedMailbox = (integrationsCfg.mailboxes ?? []).find(
    (mb) => mb.isActive && mb.address.toLowerCase() === normalizedEmailTo.toLowerCase()
  );
  const mailboxTeamId      = matchedMailbox?.teamId    ?? null;
  const mailboxPriority    = matchedMailbox?.defaultPriority ?? null;
  const resolvedMailboxAlias =
    mailboxAlias ?? (matchedMailbox ? matchedMailbox.label : null);

  const slaDeadlines = computeSlaDeadlines(mailboxPriority, now);

  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber,
      subject: normalizedSubject,
      body: data.body,
      bodyHtml: data.bodyHtml ?? null,
      senderName: data.fromName,
      senderEmail: data.from,
      customerId,
      assignedToId: AI_AGENT_ID,
      source: "email",
      priority: mailboxPriority ?? null,
      teamId: mailboxTeamId ?? null,
      firstResponseDueAt: slaDeadlines.firstResponseDueAt,
      resolutionDueAt: slaDeadlines.resolutionDueAt,
      emailMessageId,
      // Persist intake fields so rule conditions can reference them
      emailTo:      emailTo ?? null,
      emailCc:      emailCc ?? null,
      emailReplyTo: emailReplyTo ?? null,
      isAutoReply:  autoReply,
      isBounce:     bounce,
      mailboxAlias: resolvedMailboxAlias ?? null,
    },
  });

  // ── Run intake routing rules (synchronous, before jobs are enqueued) ──────
  const intakeResult = await runIntakeRouting(ticket.id, {
    emailTo:      emailTo ?? null,
    emailCc:      emailCc ?? null,
    emailReplyTo: emailReplyTo ?? null,
    isAutoReply:  autoReply,
    isBounce:     bounce,
    mailboxAlias: mailboxAlias ?? null,
    spamScore,
  });

  // Respond to SendGrid — always 201 so it doesn't retry
  res.status(201).json({ ticket });

  // ── Conditional post-creation processing ──────────────────────────────────
  if (intakeResult.suppressed || intakeResult.spam) {
    // Ticket was discarded or spammed by an intake rule — no further processing
    void logAudit(ticket.id, null, "ticket.intake_suppressed", {
      via: "email",
      spam: intakeResult.spam,
      suppressed: intakeResult.suppressed,
    });
    return;
  }

  void logAudit(ticket.id, null, "ticket.created", { via: "email" });
  void saveInboundAttachments(files, ticket.id);
  // Fire ticket.created through the event_workflow engine
  fireTicketEvent("ticket.created", ticket.id, null);

  // ── Auto-response email (skip if an intake rule already sent one) ─────────
  if (!intakeResult.autoReplySent) {
    void (async () => {
      try {
        const integrations = await getSection("integrations");
        const apiKey   = integrations.sendgridApiKey  || process.env.SENDGRID_API_KEY  || "";
        const fromAddr = integrations.fromEmail        || process.env.SENDGRID_FROM_EMAIL || "";
        if (!apiKey || !fromAddr) return;

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
        console.error(`[auto-response] Failed for ticket ${ticket.id}:`, err);
      }
    })();
  }

  // Skip AI processing for auto-replies, bounces, and quarantined tickets
  if (!autoReply && !bounce && !intakeResult.quarantined) {
    sendClassifyJob(ticket).catch((error) =>
      console.error(`Failed to enqueue classify job for ticket ${ticket.id}:`, error)
    );
    sendAutoResolveJob(ticket).catch((error) =>
      console.error(`Failed to enqueue auto-resolve job for ticket ${ticket.id}:`, error)
    );
  }
});

export default router;
