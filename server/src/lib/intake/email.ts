/**
 * Email intake channel adapter.
 *
 * Normalizes the SendGrid inbound-parse webhook payload into an InboundMessage.
 * This encapsulates all email-specific parsing so the webhook route handler
 * can stay channel-agnostic.
 *
 * channelMeta keys:
 *   messageId  — bare Message-ID from the email headers
 *   inReplyTo  — In-Reply-To header value (for threading)
 *   references — References header value (space-separated)
 *   from       — raw From header value
 *   to         — raw To header value
 */

import type { IntakeChannelAdapter, InboundMessage } from "./types";

export const emailAdapter: IntakeChannelAdapter = {
  channel: "email",

  normalize(raw: unknown): InboundMessage {
    // raw is the parsed SendGrid payload (already parsed by the webhook route)
    const parsed = raw as {
      from?: string;
      subject?: string;
      text?: string;
      html?: string;
      headers?: string;
    };

    const from = parsed.from ?? "";
    const { name: senderName, email: senderEmail } = parseFromField(from);

    const messageId  = extractHeader(parsed.headers, "Message-ID");
    const inReplyTo  = extractHeader(parsed.headers, "In-Reply-To");
    const references = extractHeader(parsed.headers, "References");

    return {
      channel:     "email",
      senderEmail,
      senderName,
      subject: parsed.subject ?? "(no subject)",
      body:    parsed.text ?? "",
      bodyHtml: parsed.html ?? undefined,
      channelMeta: {
        messageId:  messageId ?? null,
        inReplyTo:  inReplyTo ?? null,
        references: references ?? null,
        from,
        to: extractHeader(parsed.headers, "To") ?? null,
      },
    };
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseFromField(from: string): { email: string; name: string } {
  const match = from.match(/^(.*?)\s*<(.+)>$/);
  if (match) {
    return { name: match[1]!.trim() || match[2]!, email: match[2]! };
  }
  return { name: from, email: from };
}

function extractHeader(rawHeaders: unknown, name: string): string | null {
  if (typeof rawHeaders !== "string" || !rawHeaders) return null;
  const m = rawHeaders.match(new RegExp(`^${name}:\\s*<?([^>\\r\\n]+)>?`, "im"));
  return m?.[1]?.trim() ?? null;
}
