import { useEffect, useRef, useState } from "react";
import axios from "axios";

export interface PresenceViewer {
  userId: string;
  userName: string;
  composing: boolean;
}

/**
 * Tracks who is currently viewing the given ticket.
 *
 * - Opens an SSE stream for live updates.
 * - Sends a heartbeat every 15 s (includes current composing state).
 * - Sends DELETE on unmount so the viewer is removed immediately.
 *
 * @param ticketId  The ticket to track presence for.
 * @param enabled   When false the hook is a no-op (feature toggled off).
 * @param composing Whether this user currently has the reply/note composer open.
 */
export function usePresence(
  ticketId: number,
  enabled: boolean,
  composing: boolean
): PresenceViewer[] {
  const [viewers, setViewers] = useState<PresenceViewer[]>([]);

  // Keep a ref so the interval always reads the latest composing value
  // without needing to restart the effect.
  const composingRef = useRef(composing);
  useEffect(() => { composingRef.current = composing; });

  // Main effect: open SSE + start heartbeat loop
  useEffect(() => {
    if (!enabled) return;

    let alive = true;

    const sendHeartbeat = () => {
      if (!alive) return;
      void axios.post(`/api/tickets/${ticketId}/presence/heartbeat`, {
        composing: composingRef.current,
      });
    };

    const es = new EventSource(`/api/tickets/${ticketId}/presence/stream`);
    es.onmessage = (e) => {
      try {
        const { viewers: v } = JSON.parse(e.data) as { viewers: PresenceViewer[] };
        setViewers(v);
      } catch { /* malformed — ignore */ }
    };

    sendHeartbeat();
    const timer = setInterval(sendHeartbeat, 15_000);

    return () => {
      alive = false;
      clearInterval(timer);
      es.close();
      // Best-effort DELETE — don't await, page may be unloading
      void axios.delete(`/api/tickets/${ticketId}/presence`);
    };
  }, [ticketId, enabled]);

  // Send an immediate heartbeat whenever composing flips so the indicator
  // updates without waiting for the next 15-s tick.
  useEffect(() => {
    if (!enabled) return;
    void axios.post(`/api/tickets/${ticketId}/presence/heartbeat`, { composing });
  }, [composing, ticketId, enabled]);

  return viewers;
}
