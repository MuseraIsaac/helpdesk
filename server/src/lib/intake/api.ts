/**
 * API intake channel adapter.
 *
 * Normalizes tickets submitted programmatically by agents or integrations
 * via the REST API (POST /api/tickets from the agent UI or external systems).
 *
 * channelMeta keys:
 *   agentId    — ID of the creating agent (from req.user.id)
 *   clientName — Optional client identifier from X-Client-Name header
 */

import type { IntakeChannelAdapter, InboundMessage } from "./types";

export const apiAdapter: IntakeChannelAdapter = {
  channel: "api",

  normalize(raw: unknown): InboundMessage {
    const r = raw as {
      senderEmail: string;
      senderName:  string;
      subject:     string;
      body:        string;
      bodyHtml?:   string;
      agentId?:    string;
      clientName?: string;
    };

    return {
      channel:     "api",
      senderEmail: r.senderEmail,
      senderName:  r.senderName,
      subject:     r.subject,
      body:        r.body,
      bodyHtml:    r.bodyHtml,
      channelMeta: {
        agentId:    r.agentId    ?? null,
        clientName: r.clientName ?? null,
        via:        "api",
      },
    };
  },
};

/**
 * Stub adapters for planned channels.
 * These act as documentation and prevent "unknown channel" errors in the registry
 * before full implementations land.
 */

export const chatAdapterStub: IntakeChannelAdapter = {
  channel: "chat",
  normalize(): InboundMessage {
    throw new Error("Live chat adapter not yet implemented. See roadmap: lib/intake/chat.ts");
  },
};

export const whatsappAdapterStub: IntakeChannelAdapter = {
  channel: "whatsapp",
  normalize(): InboundMessage {
    throw new Error("WhatsApp adapter not yet implemented. See roadmap: lib/intake/whatsapp.ts");
  },
};

export const slackTeamsAdapterStub: IntakeChannelAdapter = {
  channel: "slack_teams",
  normalize(): InboundMessage {
    throw new Error("Slack/Teams adapter not yet implemented. See roadmap: lib/intake/slack-teams.ts");
  },
};

export const voiceAdapterStub: IntakeChannelAdapter = {
  channel: "voice",
  normalize(): InboundMessage {
    throw new Error("Voice adapter not yet implemented. See roadmap: lib/intake/voice.ts");
  },
};

export const socialAdapterStub: IntakeChannelAdapter = {
  channel: "social",
  normalize(): InboundMessage {
    throw new Error("Social media adapter not yet implemented. See roadmap: lib/intake/social.ts");
  },
};
