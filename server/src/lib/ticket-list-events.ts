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

const clients = new Set<Response>();

export function addTicketListClient(res: Response): void {
  clients.add(res);
}

export function removeTicketListClient(res: Response): void {
  clients.delete(res);
}

export function emitTicketListEvent(event: TicketCreatedEvent): void {
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
