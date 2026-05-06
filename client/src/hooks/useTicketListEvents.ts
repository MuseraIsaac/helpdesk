import { useEffect, useRef } from "react";

export interface TicketCreatedEvent {
  type:         "ticket.created";
  ticketId:     number;
  ticketNumber: string;
  subject:      string;
  source:       string | null;
  senderName:   string | null;
  authorUserId: string | null;
  createdAt:    string;
}

/**
 * Subscribe to the global ticket-list event stream. Server pushes a
 * `ticket-list-event` whenever a new ticket is created via any channel.
 * Handler is wired through a ref so callers don't need to memoize it
 * to avoid reconnects.
 */
export function useTicketListEvents(
  onEvent: (event: TicketCreatedEvent) => void,
  enabled: boolean = true,
): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;

    const es = new EventSource(`/api/sse/tickets`, { withCredentials: true });

    const handle = (e: MessageEvent) => {
      try {
        const ev = JSON.parse(e.data) as TicketCreatedEvent;
        handlerRef.current(ev);
      } catch {
        // Malformed payload — ignore.
      }
    };

    es.addEventListener("ticket-list-event", handle);

    return () => {
      es.removeEventListener("ticket-list-event", handle);
      es.close();
    };
  }, [enabled]);
}
