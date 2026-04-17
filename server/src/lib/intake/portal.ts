/**
 * Portal intake channel adapter.
 *
 * Normalizes customer portal ticket submissions into an InboundMessage.
 *
 * channelMeta keys:
 *   userId   — Better Auth user ID of the submitting customer
 *   via      — "portal" (constant, for downstream filtering)
 */

import type { IntakeChannelAdapter, InboundMessage } from "./types";

export const portalAdapter: IntakeChannelAdapter = {
  channel: "portal",

  normalize(raw: unknown): InboundMessage {
    const r = raw as {
      senderEmail: string;
      senderName:  string;
      subject:     string;
      body:        string;
      bodyHtml?:   string;
      userId?:     string;
    };

    return {
      channel:     "portal",
      senderEmail: r.senderEmail,
      senderName:  r.senderName,
      subject:     r.subject,
      body:        r.body,
      bodyHtml:    r.bodyHtml,
      channelMeta: {
        userId: r.userId ?? null,
        via:    "portal",
      },
    };
  },
};
