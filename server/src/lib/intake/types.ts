/**
 * Intake Channel Abstraction
 *
 * Defines the normalized message shape and the adapter interface that every
 * channel connector must implement. Route handlers call the abstraction —
 * they never contain channel-specific parsing logic.
 *
 * Adding a new channel:
 *  1. Create `server/src/lib/intake/<channel>.ts` implementing IntakeChannelAdapter.
 *  2. Register the adapter export. No changes to ticket creation logic needed.
 *  3. Update CHANNEL_IMPLEMENTED in core/constants/channel.ts.
 */

import type { IntakeChannel } from "core/constants/channel.ts";

// ── Normalized inbound message ─────────────────────────────────────────────────

export interface InboundAttachment {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

/**
 * A channel-normalized inbound message ready to be turned into a Ticket + Reply.
 * All channel-specific parsing is done BEFORE this point.
 */
export interface InboundMessage {
  channel:     IntakeChannel;
  senderEmail: string;
  senderName:  string;
  subject:     string;
  body:        string;
  bodyHtml?:   string;
  /**
   * Channel-specific metadata stored verbatim in Reply.channelMeta.
   * Each channel adapter documents its own keys here.
   *
   * email:    { messageId, inReplyTo, references }
   * portal:   { userId, sessionId? }
   * api:      { clientId?, apiKeyName? }
   * whatsapp: { waId, profileName, phoneNumberId }  (future)
   * chat:     { sessionId, visitorId }  (future)
   */
  channelMeta?: Record<string, unknown>;
  attachments?: InboundAttachment[];
}

// ── Channel adapter interface ──────────────────────────────────────────────────

/**
 * IntakeChannelAdapter — implement this for each channel connector.
 *
 * Responsibilities:
 *  - Parse/normalize raw inbound data into InboundMessage
 *  - Optionally send replies back through the same channel (bidirectional)
 *  - Never interact with the Ticket model directly — that stays in route handlers
 */
export interface IntakeChannelAdapter {
  readonly channel: IntakeChannel;

  /**
   * Normalize raw inbound data (request body, parsed email, webhook payload, etc.)
   * into a standardized InboundMessage.
   *
   * Throws if the raw data is structurally invalid for this channel.
   */
  normalize(raw: unknown): Promise<InboundMessage> | InboundMessage;

  /**
   * (Optional) Send an outbound reply back through this channel.
   * If not implemented, the platform falls back to email delivery.
   *
   * ticketNumber — for threading / subject line
   * replyBody    — plain text body
   * replyBodyHtml — HTML body if available
   */
  sendReply?(params: {
    ticketNumber: string;
    recipientEmail: string;
    replyBody: string;
    replyBodyHtml?: string;
    inReplyTo?: string;
    references?: string;
  }): Promise<void>;
}

// ── Channel registry ──────────────────────────────────────────────────────────

/**
 * Registry of active channel adapters.
 * Import and register adapters in server/src/index.ts or a dedicated bootstrap file.
 */
const registry = new Map<IntakeChannel, IntakeChannelAdapter>();

export function registerChannelAdapter(adapter: IntakeChannelAdapter): void {
  registry.set(adapter.channel, adapter);
}

export function getChannelAdapter(channel: IntakeChannel): IntakeChannelAdapter | undefined {
  return registry.get(channel);
}

export function listRegisteredChannels(): IntakeChannel[] {
  return [...registry.keys()];
}
