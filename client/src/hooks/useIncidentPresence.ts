import { useEffect, useRef, useState } from "react";
import axios from "axios";

export interface IncidentViewer {
  userId:   string;
  userName: string;
}

/**
 * Tracks who else is currently viewing the given incident.
 *
 * - Opens an SSE stream for live viewer-list updates.
 * - Sends a heartbeat POST every 15 s so the server knows we're still here.
 * - Sends DELETE on unmount so the server removes us immediately.
 *
 * @param incidentId  The incident to track presence for.
 * @param enabled     When false the hook is a no-op.
 */
export function useIncidentPresence(
  incidentId: number,
  enabled: boolean
): IncidentViewer[] {
  const [viewers, setViewers] = useState<IncidentViewer[]>([]);
  const aliveRef = useRef(true);

  useEffect(() => {
    if (!enabled || !incidentId) return;

    aliveRef.current = true;

    const sendHeartbeat = () => {
      if (!aliveRef.current) return;
      void axios.post(`/api/incidents/${incidentId}/presence/heartbeat`);
    };

    const es = new EventSource(`/api/incidents/${incidentId}/presence/stream`);

    es.onmessage = (e) => {
      try {
        const { viewers: v } = JSON.parse(e.data) as { viewers: IncidentViewer[] };
        setViewers(v);
      } catch { /* malformed — ignore */ }
    };

    // Register immediately, then keep a heartbeat going
    sendHeartbeat();
    const timer = setInterval(sendHeartbeat, 15_000);

    return () => {
      aliveRef.current = false;
      clearInterval(timer);
      es.close();
      void axios.delete(`/api/incidents/${incidentId}/presence`);
    };
  }, [incidentId, enabled]);

  return viewers;
}
