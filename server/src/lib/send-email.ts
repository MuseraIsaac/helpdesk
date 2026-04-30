import sgMail from "@sendgrid/mail";
import nodemailer from "nodemailer";
import type { PgBoss } from "pg-boss";
import Sentry from "./sentry";
import { getSection } from "./settings";

const QUEUE_NAME = "send-email";

interface SendEmailJobData {
  to: string;
  subject: string;
  body: string;
  bodyHtml?: string;
  cc?: string[];
  bcc?: string[];
  /** Value for the In-Reply-To header, e.g. "<abc123@mail.example.com>" */
  inReplyTo?: string;
  /** Value for the References header — space-separated list of angle-bracketed IDs */
  references?: string;
  /**
   * Attachment DB IDs to include in the outbound email.
   * Files are read from disk in the worker (not at enqueue time) so the queue
   * payload stays small regardless of file size.
   */
  attachmentIds?: number[];
  /**
   * Override the system-default from address for this message.
   * Used for team-branded replies: { email: "support@acme.io", name: "Isaac Musera" }
   * produces the From header: "Isaac Musera <support@acme.io>"
   * If omitted, falls back to the integrations.fromEmail setting / SENDGRID_FROM_EMAIL env var.
   */
  from?: { email: string; name?: string };
}

export async function registerSendEmailWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue(QUEUE_NAME, {
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
  });

  await boss.work<SendEmailJobData>(QUEUE_NAME, async (jobs) => {
    const { to, subject, body, bodyHtml, cc, bcc, inReplyTo, references, attachmentIds, from } =
      jobs[0]!.data;

    try {
      // Read credentials from settings DB at send time; fall back to env vars
      const integrations = await getSection("integrations");
      const provider = integrations.emailProvider || "sendgrid";
      const fromAddr = integrations.fromEmail || process.env.SENDGRID_FROM_EMAIL || "";

      if (!fromAddr && !from) throw new Error("From email address not configured");

      // Load attachment bytes once — used by both providers
      type LoadedAttachment = { filename: string; mimeType: string; content: Buffer };
      const loadedAttachments: LoadedAttachment[] = [];

      if (attachmentIds?.length) {
        const { default: prisma } = await import("../db");
        const { loadFile } = await import("./storage");

        const rows = await prisma.attachment.findMany({
          where: { id: { in: attachmentIds } },
        });

        for (const row of rows) {
          try {
            const buf = await loadFile(row.storageKey);
            loadedAttachments.push({ filename: row.filename, mimeType: row.mimeType, content: buf });
          } catch {
            // File missing or unreadable — skip silently, don't fail the whole email
            console.warn(
              `Attachment ${row.id} (${row.storageKey}) could not be read — omitting from email`
            );
          }
        }
      }

      // Build custom headers for email threading.
      // Most email clients (Gmail, Outlook, Apple Mail) honour these to group
      // messages into a conversation thread.
      const threadingHeaders: Record<string, string> = {};
      if (inReplyTo) threadingHeaders["In-Reply-To"] = inReplyTo;
      if (references) threadingHeaders["References"] = references;

      if (provider === "smtp") {
        const host = integrations.smtpHost || "";
        const port = integrations.smtpPort || 587;
        const user = integrations.smtpUser || "";
        const pass = integrations.smtpPassword || "";
        if (!host) throw new Error("SMTP host not configured");

        // port 465 → implicit TLS; otherwise STARTTLS upgrade (587/25)
        const transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          ...(user || pass ? { auth: { user, pass } } : {}),
        });

        const fromHeader = from
          ? from.name
            ? `"${from.name.replace(/"/g, '\\"')}" <${from.email}>`
            : from.email
          : fromAddr;

        await transporter.sendMail({
          to,
          from: fromHeader,
          subject,
          text: body,
          ...(cc?.length && { cc }),
          ...(bcc?.length && { bcc }),
          ...(bodyHtml && { html: bodyHtml }),
          ...(Object.keys(threadingHeaders).length && { headers: threadingHeaders }),
          ...(loadedAttachments.length && {
            attachments: loadedAttachments.map((a) => ({
              filename: a.filename,
              content: a.content,
              contentType: a.mimeType,
            })),
          }),
        });
      } else if (provider === "ses") {
        throw new Error("SES email provider is not yet implemented");
      } else {
        // SendGrid (default)
        const apiKey = integrations.sendgridApiKey || process.env.SENDGRID_API_KEY || "";
        if (!apiKey) throw new Error("SendGrid API key not configured");

        sgMail.setApiKey(apiKey);

        const resolvedFrom: string | { email: string; name: string } = from
          ? from.name
            ? { email: from.email, name: from.name }
            : from.email
          : fromAddr;

        const sgAttachments = loadedAttachments.map((a) => ({
          content: a.content.toString("base64"),
          filename: a.filename,
          type: a.mimeType,
          disposition: "attachment" as const,
        }));

        await sgMail.send({
          to,
          from: resolvedFrom,
          subject,
          text: body,
          ...(cc?.length && { cc }),
          ...(bcc?.length && { bcc }),
          ...(bodyHtml && { html: bodyHtml }),
          ...(Object.keys(threadingHeaders).length && { headers: threadingHeaders }),
          ...(sgAttachments.length && { attachments: sgAttachments }),
        });
      }

      console.log(`Email sent to ${to} via ${provider} — subject: "${subject}"`);
    } catch (error) {
      Sentry.captureException(error, { tags: { queue: QUEUE_NAME } });
      throw error;
    }
  });
}

export async function sendEmailJob(data: SendEmailJobData): Promise<void> {
  const { boss } = await import("./queue");
  await boss.send(QUEUE_NAME, data);
}
