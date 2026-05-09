/**
 * In-memory pub/sub for ticket-list-level realtime events (e.g. a new ticket
 * was created via email, portal, agent UI, …).
 *
 * Unlike `ticket-events.ts` which scopes subscribers to one ticketId, this is
 * a single broadcast channel: every agent currently viewing /tickets receives
 * every new-ticket event.
 *
 * Single-process only — for multi-instance deployments swap the Set for
 * Postgres LISTEN/NOTIFY or Redis pub/sub.
 */
import type { Response } from "express";

export interface TicketCreatedEvent {
  type:         "ticket.created";
  ticketId:     number;
  ticketNumber: string;
  subject:      string;
  /** Intake channel — "email", "portal", "agent", etc. */
  source:       string | null;
  senderName:   string | null;
  /** User ID of the agent who created the ticket via the agent UI. Null
   *  for inbound email and customer portal submissions. */
  authorUserId: string | null;
  createdAt:    string;
}

/**
 * Fires when an existing ticket changes in a way an agent on the list view
 * would care about: status / priority / assignee / new reply / escalation.
 *
 * Emitting this lets the live "new updates" banner appear without the
 * agent having to refresh. The event is intentionally lightweight — just
 * an identity stamp + which kind of change happened. The client refetches
 * the visible page when the agent clicks Refresh.
 */
export interface TicketUpdatedEvent {
  type:         "ticket.updated";
  ticketId:     number;
  ticketNumber: string;
  /** What changed — used by the UI to colour-code the badge (e.g. "reply"
   *  could pulse green, "escalated" amber). */
  change:       "status" | "priority" | "assignee" | "reply" | "escalated" | "other";
  /** User ID of the agent who made the change. Null for system events
   *  (inbound email, automation rules). The client suppresses banners
   *  for changes the current user authored themselves. */
  authorUserId: string | null;
  updatedAt:    string;
}

export type TicketListEvent = TicketCreatedEvent | TicketUpdatedEvent;

const clients = new Set<Response>();

export function addTicketListClient(res: Response): void {
  clients.add(res);
}

export function removeTicketListClient(res: Response): void {
  clients.delete(res);
}

export function emitTicketListEvent(event: TicketListEvent): void {
  if (clients.size === 0) return;
  const payload = `event: ticket-list-event\ndata: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      // Stream already closed — cleanup happens on req 'close' handler.
    }
  }
}
