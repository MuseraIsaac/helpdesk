/**
 * useSSE — subscribes to a Server-Sent Events endpoint and returns
 * the latest parsed event data plus connection state.
 *
 * Usage:
 *   const { data, state } = useSSE<SnapshotType>("/api/sse/realtime", "snapshot");
 *
 * state: "connecting" | "open" | "closed"
 */
import { useState, useEffect, useRef } from "react";

type SSEState = "connecting" | "open" | "closed";

interface UseSSEResult<T> {
  data:  T | null;
  state: SSEState;
  error: Event | null;
}

export function useSSE<T>(
  url: string,
  eventName: string = "message",
  enabled: boolean  = true,
): UseSSEResult<T> {
  const [data,  setData]  = useState<T | null>(null);
  const [state, setState] = useState<SSEState>("connecting");
  const [error, setError] = useState<Event | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const es = new EventSource(url, { withCredentials: true });
    esRef.current = es;
    setState("connecting");

    es.onopen = () => setState("open");

    es.addEventListener(eventName, (e: MessageEvent) => {
      try {
        setData(JSON.parse(e.data) as T);
        setError(null);
      } catch {
        // Malformed JSON — ignore
      }
    });

    es.onerror = (e) => {
      setError(e);
      // readyState 2 = CLOSED (will not reconnect); 0 = CONNECTING (auto-reconnect in progress)
      // Only mark as permanently closed when EventSource has given up entirely.
      if (es.readyState === 2) {
        setState("closed");
      } else {
        setState("connecting"); // show "reconnecting" rather than "closed"
      }
    };

    return () => {
      es.close();
      setState("closed");
    };
  }, [url, eventName, enabled]);

  return { data, state, error };
}
