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
import {
  saveFile,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
} from "../lib/storage";

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
      const storageKey = await saveFile(file.buffer, file.originalname);
      await prisma.attachment.create({
        data: {
          filename: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          storageKey,
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
      },
    });
    await saveInboundAttachments(files, existingTicket.id, reply.id);
    res.status(200).json({ ticket: existingTicket });
    return;
  }

  const now = new Date();
  const slaDeadlines = computeSlaDeadlines(null, now);
  const customerId = await upsertCustomer(data.from, data.fromName);
  // Inbound emails have no ticket type at creation time — classified later by AI
  const ticketNumber = await generateTicketNumber(null, now);

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
      firstResponseDueAt: slaDeadlines.firstResponseDueAt,
      resolutionDueAt: slaDeadlines.resolutionDueAt,
      emailMessageId,
    },
  });

  res.status(201).json({ ticket });

  void logAudit(ticket.id, null, "ticket.created", { via: "email" });
  void saveInboundAttachments(files, ticket.id);

  sendClassifyJob(ticket).catch((error) =>
    console.error(`Failed to enqueue classify job for ticket ${ticket.id}:`, error)
  );

  sendAutoResolveJob(ticket).catch((error) =>
    console.error(`Failed to enqueue auto-resolve job for ticket ${ticket.id}:`, error)
  );
});

export default router;
