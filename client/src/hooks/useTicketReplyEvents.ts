import { useEffect, useRef } from "react";

export interface ReplyCreatedEvent {
  type:         "reply.created";
  ticketId:     number;
  replyId:      number;
  senderType:   "agent" | "customer";
  authorUserId: string | null;
  authorName:   string | null;
  channel:      string | null;
  createdAt:    string;
}

/**
 * Subscribe to per-ticket realtime events (e.g. new reply created).
 * The handler is wired through a ref so callers don't need to memoize it
 * to avoid reconnects.
 */
export function useTicketReplyEvents(
  ticketId: number,
  onEvent:  (event: ReplyCreatedEvent) => void,
  enabled:  boolean = true,
): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled || ticketId <= 0) return;

    const es = new EventSource(`/api/tickets/${ticketId}/events/stream`, {
      withCredentials: true,
    });

    const handle = (e: MessageEvent) => {
      try {
        const ev = JSON.parse(e.data) as ReplyCreatedEvent;
        handlerRef.current(ev);
      } catch {
        // Malformed payload — ignore.
      }
    };

    es.addEventListener("ticket-event", handle);

    return () => {
      es.removeEventListener("ticket-event", handle);
      es.close();
    };
  }, [ticketId, enabled]);
}
