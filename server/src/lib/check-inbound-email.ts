/**
 * check-inbound-email background job
 *
 * Polls a configured IMAP mailbox (Gmail by default) for unread messages
 * and ingests each one through the shared processInboundEmail() pipeline,
 * the same code path as the SendGrid webhook. The helpdesk is the single
 * source of truth for "what's been ingested" via emailMessageId dedup.
 *
 * Schedule:
 *   Default once per minute (`*​/1 * * * *`). The job is a no-op when the
 *   admin's chosen inbound mode does not include IMAP, so we don't waste
 *   connections.
 *
 * Why imapflow:
 *   - Promise-based, modern API
 *   - Built-in OAuth2 + plain auth
 *   - Stable mailbox-lock semantics so concurrent polls cannot interleave
 *
 * Why mailparser:
 *   - Returns a normalized `from`, `to`, `subject`, `text`, `html`,
 *     `messageId`, and `attachments` shape regardless of the wire format
 *     of the original message — saves us re-implementing MIME parsing.
 */

import type { PgBoss } from "pg-boss";
import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import Sentry from "./sentry";
import { getSection } from "./settings";
import {
  processInboundEmail,
  type InboundAttachment,
  parseFromField,
} from "./inbound-email";

const QUEUE_NAME = "check-inbound-email";
/**
 * Per-poll wall-clock cap. The remote IMAP server is the slowest hop; we'd
 * rather skip a tick than have multiple polls overlap.
 */
const POLL_TIMEOUT_MS = 90_000;
/** Hard cap on messages processed per poll — protects against an avalanche
 *  of unread mail when the poller is first turned on. Newer messages first. */
const MAX_PER_POLL = 50;

export async function registerInboundEmailWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue(QUEUE_NAME);

  await boss.work(QUEUE_NAME, async () => {
    try {
      await runInboundEmailPoll();
    } catch (err) {
      // Surface to Sentry but do NOT rethrow — failing the job would put
      // pg-boss into a retry loop and a misconfigured IMAP would burn cycles.
      // We log + continue; the next scheduled tick tries again.
      Sentry.captureException(err, { tags: { queue: QUEUE_NAME } });
      console.error("[check-inbound-email] poll failed:", err);
    }
  });

  // Cron is hard-coded to "every minute". The admin-configurable
  // imapPollSeconds is enforced by skipping ticks inside runInboundEmailPoll
  // so the schedule itself never needs editing at runtime.
  await boss.schedule(QUEUE_NAME, "* * * * *");
}

// ── Poll-level coordination ───────────────────────────────────────────────────

/**
 * Tracks the last successful poll start time so imapPollSeconds > 60 can
 * skip overshort ticks. Process-local: if the worker restarts the next tick
 * runs unconditionally, which is what we want.
 */
let lastPollStartedAt = 0;
/** True while a poll is in flight — prevents overlapping connections. */
let pollInFlight = false;

async function runInboundEmailPoll(): Promise<void> {
  const integrations = await getSection("integrations");
  const mode = integrations.inboundEmailMode ?? "disabled";

  // Honor the admin's mode selection.
  if (mode !== "imap" && mode !== "both") return;

  const host = integrations.imapHost?.trim();
  const user = integrations.imapUser?.trim();
  const pass = integrations.imapPassword;
  if (!host || !user || !pass) {
    // Misconfigured but mode says "imap" — log once and bail. No throw, so
    // pg-boss doesn't retry; the next tick will check again after the admin
    // saves the credentials.
    console.warn("[check-inbound-email] IMAP enabled but host/user/password missing");
    return;
  }

  const intervalSec = integrations.imapPollSeconds ?? 60;
  const now = Date.now();
  if (now - lastPollStartedAt < intervalSec * 1000 - 5_000) {
    // The 5-second slack avoids drifting the cadence forward each minute
    // due to small scheduler jitter.
    return;
  }
  if (pollInFlight) {
    console.warn("[check-inbound-email] previous poll still running — skipping this tick");
    return;
  }

  pollInFlight = true;
  lastPollStartedAt = now;

  const client = new ImapFlow({
    host,
    port: integrations.imapPort ?? 993,
    secure: integrations.imapUseTls ?? true,
    auth: { user, pass },
    // Quieter logs by default; flip to true when debugging a connection.
    logger: false,
    // Avoid hangs on a stalled remote — the connect call itself returns
    // almost immediately, but socket-level writes during fetch can stall.
    socketTimeout: POLL_TIMEOUT_MS,
  });

  // Watchdog: if the poll exceeds POLL_TIMEOUT_MS, force-close the connection
  // so the next tick is free to retry. Without this a hung TLS handshake
  // could pin the worker indefinitely.
  const watchdog = setTimeout(() => {
    console.warn("[check-inbound-email] watchdog tripped — closing IMAP connection");
    try { client.close(); } catch { /* already closed */ }
  }, POLL_TIMEOUT_MS);

  try {
    await client.connect();
    const folder = integrations.imapFolder || "INBOX";
    const lock = await client.getMailboxLock(folder);
    try {
      // UIDs of unseen messages, newest-first. `search` returns numbers in
      // ascending order, or `false` on failure (per imapflow's typings).
      // We slice the tail so we always work the latest first — important
      // when MAX_PER_POLL kicks in on a backlog.
      const searchResult = await client.search({ seen: false }, { uid: true });
      const allUnseenUids: number[] = Array.isArray(searchResult) ? searchResult : [];
      const uidsToProcess = allUnseenUids
        .slice(-MAX_PER_POLL)
        .reverse();

      if (uidsToProcess.length === 0) return;

      console.log(`[check-inbound-email] processing ${uidsToProcess.length} unseen message(s) from ${folder}`);

      for (const uid of uidsToProcess) {
        try {
          await processOneMessage(client, uid);
          if (integrations.imapMarkSeen ?? true) {
            await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });
          }
        } catch (err) {
          // Per-message failures should not abort the whole poll.
          console.error(`[check-inbound-email] failed to ingest UID ${uid}:`, err);
          Sentry.captureException(err, { tags: { queue: QUEUE_NAME, uid: String(uid) } });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    clearTimeout(watchdog);
    pollInFlight = false;
    try { await client.logout(); } catch { /* ignore */ }
  }
}

// ── Per-message processing ────────────────────────────────────────────────────

async function processOneMessage(client: ImapFlow, uid: number): Promise<void> {
  // Download the raw RFC-822 source and parse with mailparser. Source is
  // the canonical MIME-encoded message, so it works for forwarded mail,
  // multipart/alternative, attached calendars, etc.
  const downloaded = await client.download(String(uid), undefined, { uid: true });
  if (!downloaded?.content) {
    console.warn(`[check-inbound-email] UID ${uid} returned no content`);
    return;
  }
  const parsed: ParsedMail = await simpleParser(downloaded.content);

  const fromAddr = firstAddress(parsed.from);
  if (!fromAddr) {
    console.warn(`[check-inbound-email] UID ${uid} has no From address — skipped`);
    return;
  }

  const attachments: InboundAttachment[] = (parsed.attachments ?? [])
    .filter((a) => !a.related) // skip inline images that belong to the HTML body
    .map((a) => ({
      filename: a.filename || `attachment-${uid}`,
      mimeType: a.contentType || "application/octet-stream",
      size:     a.size || a.content.length,
      content:  a.content,
    }));

  await processInboundEmail({
    fromEmail:  fromAddr.address.toLowerCase(),
    fromName:   fromAddr.name || fromAddr.address,
    subject:    parsed.subject || "(no subject)",
    bodyText:   parsed.text || stripHtml(parsed.html || ""),
    bodyHtml:   parsed.html || undefined,
    to:         addressList(parsed.to),
    cc:         addressList(parsed.cc),
    replyTo:    firstAddress(parsed.replyTo)?.address ?? null,
    rawHeaders: rawHeadersString(parsed),
    messageId:  stripAngleBrackets(parsed.messageId),
    attachments,
    spamScore:  0,
    source:     "imap",
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function firstAddress(field: AddressObject | AddressObject[] | undefined):
  { name: string; address: string } | null {
  if (!field) return null;
  const obj = Array.isArray(field) ? field[0] : field;
  const a = obj?.value?.[0];
  if (!a?.address) return null;
  return { name: a.name || "", address: a.address };
}

function addressList(field: AddressObject | AddressObject[] | undefined): string | null {
  if (!field) return null;
  const list = Array.isArray(field) ? field : [field];
  const text = list.map((f) => f.text).filter(Boolean).join(", ");
  return text || null;
}

function stripAngleBrackets(v: string | undefined | null): string | null {
  if (!v) return null;
  return v.replace(/^</, "").replace(/>$/, "").trim() || null;
}

function rawHeadersString(parsed: ParsedMail): string {
  // mailparser exposes headerLines for serialization-friendly access.
  if (!parsed.headerLines) return "";
  return parsed.headerLines.map((h) => h.line).join("\r\n");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// re-export so other modules don't need to import directly
export { parseFromField };
