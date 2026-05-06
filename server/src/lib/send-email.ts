import sgMail from "@sendgrid/mail";
import nodemailer from "nodemailer";
import type { PgBoss } from "pg-boss";
import Sentry from "./sentry";
import { getSection } from "./settings";
import type { OutboundEmailAccount, OutboundPurpose } from "core/schemas/settings";

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
   * Inline attachments — content is provided directly in the queue payload as
   * base64. Use for transient attachments (e.g. report exports) that should
   * not be persisted as Attachment DB rows. Keep total payload reasonable
   * (workers may reject very large payloads).
   */
  inlineAttachments?: { filename: string; mimeType: string; contentBase64: string }[];
  /**
   * Override the From header for this message (team-branded replies).
   * Does NOT change which provider/SMTP transport is used — that's controlled
   * by `purpose` / `accountId`. Example:
   *   { email: "support@acme.io", name: "Isaac Musera" }
   *   → From: "Isaac Musera <support@acme.io>"
   */
  from?: { email: string; name?: string };
  /**
   * Logical purpose of this message. Used to pick which outbound account
   * delivers it, per integrations.purposeAccounts.
   *  - "tickets"       → ticket replies, auto-replies on ticket creation
   *  - "reports"       → report shares & scheduled reports
   *  - "notifications" → automation/escalation/auth/notifications
   * If not set, the system default account (legacy top-level fields) is used.
   */
  purpose?: OutboundPurpose;
  /**
   * Explicitly route this message through a specific outbound account by id.
   * Takes precedence over `purpose`. Falls back to the default account if the
   * id is unknown or the account is inactive.
   */
  accountId?: string;
}

interface ResolvedAccount {
  provider: "sendgrid" | "smtp" | "ses";
  fromEmail: string;
  fromName: string;
  sendgridApiKey: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  /** "default" or the account id — for logs only. */
  source: string;
}

/**
 * Decide which outbound account delivers this email.
 *
 * Priority:
 *   1. Explicit `accountId` (if active) — caller knows best.
 *   2. `purpose` → integrations.purposeAccounts[purpose] → matching account.
 *   3. Legacy top-level fields (the implicit "default" account).
 *
 * Inactive or unknown accounts fall through to the default rather than fail
 * outright — preferring delivery via the default over silently dropping mail.
 */
function resolveAccount(
  integrations: Awaited<ReturnType<typeof getSection<"integrations">>>,
  purpose?: OutboundPurpose,
  accountId?: string,
): ResolvedAccount {
  const accounts: OutboundEmailAccount[] = integrations.outboundAccounts ?? [];
  const activeById = new Map<string, OutboundEmailAccount>();
  for (const a of accounts) if (a.isActive !== false) activeById.set(a.id, a);

  let chosen: OutboundEmailAccount | undefined;
  if (accountId) chosen = activeById.get(accountId);
  if (!chosen && purpose) {
    const id = integrations.purposeAccounts?.[purpose];
    if (id) chosen = activeById.get(id);
  }

  if (chosen) {
    return {
      provider:       chosen.provider,
      fromEmail:      chosen.fromEmail,
      fromName:       chosen.fromName,
      sendgridApiKey: chosen.sendgridApiKey,
      smtpHost:       chosen.smtpHost,
      smtpPort:       chosen.smtpPort,
      smtpUser:       chosen.smtpUser,
      smtpPassword:   chosen.smtpPassword,
      source:         `account:${chosen.id} (${chosen.label})`,
    };
  }

  return {
    provider:       (integrations.emailProvider ?? "sendgrid") as "sendgrid" | "smtp" | "ses",
    fromEmail:      integrations.fromEmail || process.env.SENDGRID_FROM_EMAIL || "",
    fromName:       "",
    sendgridApiKey: integrations.sendgridApiKey || process.env.SENDGRID_API_KEY || "",
    smtpHost:       integrations.smtpHost || "",
    smtpPort:       integrations.smtpPort || 587,
    smtpUser:       integrations.smtpUser || "",
    smtpPassword:   integrations.smtpPassword || "",
    source:         "default",
  };
}

function quoteName(name: string): string {
  return `"${name.replace(/"/g, '\\"')}"`;
}

/** Build the From header string from an explicit override or the resolved account. */
function buildFromHeader(account: ResolvedAccount, override?: { email: string; name?: string }): string {
  if (override) {
    return override.name ? `${quoteName(override.name)} <${override.email}>` : override.email;
  }
  return account.fromName ? `${quoteName(account.fromName)} <${account.fromEmail}>` : account.fromEmail;
}

export async function registerSendEmailWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue(QUEUE_NAME, {
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
  });

  await boss.work<SendEmailJobData>(QUEUE_NAME, async (jobs) => {
    const {
      to, subject, body, bodyHtml, cc, bcc, inReplyTo, references,
      attachmentIds, inlineAttachments, from, purpose, accountId,
    } = jobs[0]!.data;

    try {
      // Read credentials from settings DB at send time
      const integrations = await getSection("integrations");
      const account = resolveAccount(integrations, purpose, accountId);

      if (!account.fromEmail && !from) throw new Error("From email address not configured");

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

      if (inlineAttachments?.length) {
        for (const a of inlineAttachments) {
          try {
            loadedAttachments.push({
              filename: a.filename,
              mimeType: a.mimeType,
              content:  Buffer.from(a.contentBase64, "base64"),
            });
          } catch {
            console.warn(`Inline attachment "${a.filename}" could not be decoded — omitting from email`);
          }
        }
      }

      // Build custom headers for email threading.
      // Most email clients (Gmail, Outlook, Apple Mail) honour these to group
      // messages into a conversation thread.
      const threadingHeaders: Record<string, string> = {};
      if (inReplyTo) threadingHeaders["In-Reply-To"] = inReplyTo;
      if (references) threadingHeaders["References"] = references;

      const fromHeader = buildFromHeader(account, from);

      if (account.provider === "smtp") {
        const host = account.smtpHost;
        const port = account.smtpPort || 587;
        const user = account.smtpUser;
        const pass = account.smtpPassword;
        if (!host) throw new Error(`SMTP host not configured (${account.source})`);

        // port 465 → implicit TLS; otherwise STARTTLS upgrade (587/25)
        const transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          ...(user || pass ? { auth: { user, pass } } : {}),
        });

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
      } else if (account.provider === "ses") {
        throw new Error("SES email provider is not yet implemented");
      } else {
        // SendGrid (default)
        const apiKey = account.sendgridApiKey;
        if (!apiKey) throw new Error(`SendGrid API key not configured (${account.source})`);

        sgMail.setApiKey(apiKey);

        const resolvedFrom: string | { email: string; name: string } = from
          ? from.name
            ? { email: from.email, name: from.name }
            : from.email
          : account.fromName
            ? { email: account.fromEmail, name: account.fromName }
            : account.fromEmail;

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

      console.log(
        `Email sent to ${to} via ${account.provider} [${account.source}${purpose ? `, purpose=${purpose}` : ""}] — subject: "${subject}"`,
      );
    } catch (error) {
      Sentry.captureException(error, { tags: { queue: QUEUE_NAME, purpose: purpose ?? "default" } });
      throw error;
    }
  });
}

export async function sendEmailJob(data: SendEmailJobData): Promise<void> {
  const { boss } = await import("./queue");
  await boss.send(QUEUE_NAME, data);
}
