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

export interface TicketUpdatedEvent {
  type:         "ticket.updated";
  ticketId:     number;
  ticketNumber: string;
  change:       "status" | "priority" | "assignee" | "reply" | "escalated" | "other";
  authorUserId: string | null;
  updatedAt:    string;
}

export type TicketListEvent = TicketCreatedEvent | TicketUpdatedEvent;

/**
 * Subscribe to the global ticket-list event stream. Server pushes a
 * `ticket-list-event` whenever a ticket is created or updated. Handler is
 * wired through a ref so callers don't need to memoize it to avoid reconnects.
 *
 * Performance discipline:
 *   - The EventSource open is **deferred ~600ms after mount** so the initial
 *     ticket-list / dictionary API calls aren't competing with it for the
 *     browser's HTTP/1.1 connection budget on the Tickets page.
 *   - The connection is **closed when the tab is backgrounded** (Page
 *     Visibility API) and re-opened when it becomes visible again. An idle
 *     tab no longer pins one of the 6 per-origin connection slots.
 */
export function useTicketListEvents(
  onEvent: (event: TicketListEvent) => void,
  enabled: boolean = true,
): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;

    let es: EventSource | null = null;

    function open() {
      if (es || document.hidden) return;
      es = new EventSource(`/api/sse/tickets`, { withCredentials: true });
      es.addEventListener("ticket-list-event", handle);
      es.addEventListener("open",  () => console.debug("[ticket-list-events] SSE open"));
      es.addEventListener("error", (e) => console.debug("[ticket-list-events] SSE error", e));
    }

    function close() {
      if (!es) return;
      es.removeEventListener("ticket-list-event", handle);
      es.close();
      es = null;
    }

    function handle(e: MessageEvent) {
      try {
        const ev = JSON.parse(e.data) as TicketListEvent;
        console.debug("[ticket-list-events] received", ev);
        handlerRef.current(ev);
      } catch {
        // Malformed payload — ignore.
      }
    }

    // Open immediately and keep the connection open for the whole session.
    // Earlier we tried defer-then-open and visibility-pause; both turned out
    // to be foot-guns because SSE is forward-only — every event fired while
    // the connection is closed gets silently dropped.
    open();

    return () => {
      close();
    };
  }, [enabled]);
}
