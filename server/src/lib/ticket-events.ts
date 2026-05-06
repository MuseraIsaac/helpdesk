/**
 * In-memory pub/sub for per-ticket realtime events (e.g. new reply arrived).
 *
 * Mirrors the pattern in `presence.ts`, but for non-presence events. Any
 * code path that creates a new reply (agent UI, inbound email webhook,
 * portal) calls `emitTicketEvent(...)` and every browser currently
 * subscribed to that ticket's event stream receives the payload.
 *
 * Note: state is per-process. For multi-instance deployments, swap the
 * Map for a Postgres LISTEN/NOTIFY or Redis pub/sub backplane.
 */
import type { Response } from "express";

export interface ReplyCreatedEvent {
  type:         "reply.created";
  ticketId:     number;
  replyId:      number;
  senderType:   "agent" | "customer";
  /** Null for customer/inbound replies (no authenticated user). */
  authorUserId: string | null;
  authorName:   string | null;
  /** Channel the reply came in through (email, portal, agent, …). */
  channel:      string | null;
  createdAt:    string;
}

export type TicketEvent = ReplyCreatedEvent;

const sseClients = new Map<number, Set<Response>>();

export function addTicketEventClient(ticketId: number, res: Response): void {
  let set = sseClients.get(ticketId);
  if (!set) {
    set = new Set();
    sseClients.set(ticketId, set);
  }
  set.add(res);
}

export function removeTicketEventClient(ticketId: number, res: Response): void {
  const set = sseClients.get(ticketId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) sseClients.delete(ticketId);
}

export function emitTicketEvent(event: TicketEvent): void {
  const set = sseClients.get(event.ticketId);
  if (!set || set.size === 0) return;
  const payload = `event: ticket-event\ndata: ${JSON.stringify(event)}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
      // Stream already closed — cleanup happens on req 'close' handler.
    }
  }
}
