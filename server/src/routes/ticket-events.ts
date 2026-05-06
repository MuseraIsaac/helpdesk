/**
 * Per-ticket event stream — Server-Sent Events.
 *
 * GET /api/tickets/:ticketId/events/stream
 *   Browser subscribes while an agent is viewing a ticket detail page.
 *   Server pushes a `ticket-event` whenever a new reply is created on
 *   that ticket (agent UI, inbound email, portal). The client decides
 *   whether to surface a "new reply" banner — it has the author info to
 *   suppress events the current user authored themselves.
 */
import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { parseId } from "../lib/parse-id";
import { addTicketEventClient, removeTicketEventClient } from "../lib/ticket-events";

const router = Router({ mergeParams: true });

router.get("/stream", requireAuth, (req, res) => {
  const ticketId = parseId(req.params.ticketId);
  if (!ticketId) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }

  res.setHeader("Content-Type",      "text/event-stream");
  res.setHeader("Cache-Control",     "no-cache, no-transform");
  res.setHeader("Connection",        "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable Nginx buffering
  res.flushHeaders();

  // Initial comment so the client knows the connection is live.
  res.write(": connected\n\n");

  addTicketEventClient(ticketId, res);

  // Heartbeat every 20s to keep proxies / load balancers from timing out.
  const heartbeat = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      // Already closed — cleanup runs on close handler.
    }
  }, 20_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeTicketEventClient(ticketId, res);
    try { res.end(); } catch { /* already ended */ }
  });
});

export default router;
