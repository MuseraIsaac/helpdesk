import sgMail from "@sendgrid/mail";
import type { PgBoss } from "pg-boss";
import Sentry from "./sentry";

const QUEUE_NAME = "send-email";

interface SendEmailJobData {
  to: string;
  subject: string;
  body: string;
  bodyHtml?: string;
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
}

export async function registerSendEmailWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue(QUEUE_NAME, {
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
  });

  await boss.work<SendEmailJobData>(QUEUE_NAME, async (jobs) => {
    const { to, subject, body, bodyHtml, inReplyTo, references, attachmentIds } =
      jobs[0]!.data;

    try {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

      // Resolve attachment files from disk just before sending
      type SgAttachment = {
        content: string;
        filename: string;
        type: string;
        disposition: "attachment";
      };
      const sgAttachments: SgAttachment[] = [];

      if (attachmentIds?.length) {
        const { default: prisma } = await import("../db");
        const { loadFile } = await import("./storage");

        const rows = await prisma.attachment.findMany({
          where: { id: { in: attachmentIds } },
        });

        for (const row of rows) {
          try {
            const buf = await loadFile(row.storageKey);
            sgAttachments.push({
              content: buf.toString("base64"),
              filename: row.filename,
              type: row.mimeType,
              disposition: "attachment",
            });
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

      await sgMail.send({
        to,
        from: process.env.SENDGRID_FROM_EMAIL!,
        subject,
        text: body,
        ...(bodyHtml && { html: bodyHtml }),
        ...(Object.keys(threadingHeaders).length && { headers: threadingHeaders }),
        ...(sgAttachments.length && { attachments: sgAttachments }),
      });

      console.log(`Email sent to ${to} — subject: "${subject}"`);
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
