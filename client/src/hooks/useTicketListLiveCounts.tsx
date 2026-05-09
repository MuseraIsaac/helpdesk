/**
 * Ticket-list live-update counters — single connection, app-wide.
 *
 * Why this lives at the Layout level (not on /tickets only):
 *
 *   When an agent navigates from /tickets into a specific ticket detail to
 *   answer / triage / edit, that route change unmounts the floating banner.
 *   If the SSE subscription were owned by the banner, the EventSource would
 *   close on every nav — and SSE is forward-only, so every event fired
 *   between "I left /tickets" and "I came back" would be silently dropped.
 *
 *   By owning the subscription at the Layout level, the connection stays
 *   open for the lifetime of the agent's session. The counters survive
 *   route changes; the banner becomes a thin consumer that reads them and
 *   renders itself only on /tickets.
 */

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import {
  useTicketListEvents,
  type TicketListEvent,
} from "@/hooks/useTicketListEvents";

interface LiveCounts {
  created: number;
  updated: number;
  /** Reset both counters to 0 — called by the banner's Refresh button. */
  reset: () => void;
}

const Ctx = createContext<LiveCounts>({ created: 0, updated: 0, reset: () => {} });

export function TicketListLiveCountsProvider({ children }: { children: ReactNode }) {
  const [created, setCreated] = useState(0);
  const [updated, setUpdated] = useState(0);

  const onEvent = useCallback((e: TicketListEvent) => {
    if (e.type === "ticket.created") setCreated((n) => n + 1);
    else                              setUpdated((n) => n + 1);
  }, []);

  // Persistent app-wide subscription — kept open across route changes so
  // events fired while the agent is mid-action on a different page still
  // increment the counters and show up on the banner when they return.
  useTicketListEvents(onEvent, true);

  const reset = useCallback(() => {
    setCreated(0);
    setUpdated(0);
  }, []);

  return (
    <Ctx.Provider value={{ created, updated, reset }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTicketListLiveCounts(): LiveCounts {
  return useContext(Ctx);
}
