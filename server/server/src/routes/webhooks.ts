import { Router } from "express";
import multer from "multer";
import Parse from "@sendgrid/inbound-mail-parser";
import { inboundEmailSchema } from "core/schemas/tickets.ts";
import { requireWebhookSecret } from "../middleware/require-webhook-secret";
import { getSection } from "../lib/settings";
import { validate } from "../lib/validate";
import {
  processInboundEmail,
  parseFromField,
  type InboundAttachment,
} from "../lib/inbound-email";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

/**
 * Extract the Message-ID value from the raw headers string that SendGrid
 * passes as the `headers` form field. Returns the bare ID without angle
 * brackets, e.g. "abc123@mail.example.com".
 */
function extractMessageId(rawHeaders: unknown): string | null {
  if (typeof rawHeaders !== "string" || !rawHeaders) return null;
  const m = rawHeaders.match(/^Message-ID:\s*<?([^>\r\n]+)>?/im);
  return m?.[1]?.trim() ?? null;
}

const router = Router();

router.post("/inbound-email", requireWebhookSecret, upload.any(), async (req, res) => {
  // Webhook is enabled when the inbound mode is "webhook" or "both".
  // When set to "imap" only, accept the request but skip processing — this
  // keeps the endpoint discoverable for testing while honoring the admin's
  // chosen primary transport.
  const integrations = await getSection("integrations");
  const mode = integrations.inboundEmailMode ?? "webhook";
  if (mode === "imap") {
    res.status(200).json({ skipped: true, reason: "Inbound mode is set to IMAP only" });
    return;
  }
  if (mode === "disabled") {
    res.status(200).json({ skipped: true, reason: "Inbound email is disabled" });
    return;
  }

  const parser = new Parse(
    { keys: ["to", "from", "subject", "text", "html"] },
    { body: req.body, files: (req.files as Express.Multer.File[]) || [] }
  );
  const parsed = parser.keyValues();
  const { email, name } = parseFromField(parsed.from || "");

  const data = validate(inboundEmailSchema, {
    from:     email,
    fromName: name,
    subject:  parsed.subject || "",
    body:     parsed.text || "",
    bodyHtml: parsed.html || undefined,
  }, res);
  if (!data) return;

  const rawHeaders = typeof req.body.headers === "string" ? req.body.headers : "";
  const files = (req.files as Express.Multer.File[]) || [];

  // SendGrid sends attachments as multipart files with fieldnames
  // attachment1, attachment2, … Map them onto our normalized shape.
  const attachments: InboundAttachment[] = files
    .filter((f) => /^attachment\d+$/.test(f.fieldname))
    .map((f) => ({
      filename: f.originalname,
      mimeType: f.mimetype,
      size:     f.size,
      content:  f.buffer,
    }));

  const result = await processInboundEmail({
    fromEmail: data.from,
    fromName:  data.fromName,
    subject:   data.subject,
    bodyText:  data.body,
    bodyHtml:  data.bodyHtml ?? undefined,
    to:        typeof req.body.to === "string" ? req.body.to : (parsed.to ?? null),
    cc:        typeof req.body.cc === "string" ? req.body.cc : null,
    replyTo:   null, // SendGrid surfaces Reply-To in raw headers; intake-routing extracts it
    rawHeaders,
    messageId: extractMessageId(req.body.headers),
    attachments,
    spamScore: parseFloat(req.body.spam_score ?? "0") || 0,
    source:    "webhook",
  });

  // SendGrid retries on non-2xx, so always reply 2xx — even for duplicates.
  res.status(result.outcome === "created" ? 201 : 200).json({
    outcome: result.outcome,
    ticketId: result.ticketId,
  });
});

export default router;
