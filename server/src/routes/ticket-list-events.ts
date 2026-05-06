/**
 * Ticket-list event stream — Server-Sent Events.
 *
 * GET /api/sse/tickets
 *   Browser subscribes while an agent is viewing the Tickets list page.
 *   Server pushes a `ticket-list-event` whenever a new ticket is created
 *   (agent UI, inbound email, portal). The client decides whether to
 *   surface a "new ticket" banner — it has the author info to suppress
 *   events the current user authored themselves.
 */
import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { addTicketListClient, removeTicketListClient } from "../lib/ticket-list-events";

const router = Router();

router.get("/", requireAuth, (req, res) => {
  res.setHeader("Content-Type",      "text/event-stream");
  res.setHeader("Cache-Control",     "no-cache, no-transform");
  res.setHeader("Connection",        "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable Nginx buffering
  res.flushHeaders();

  // Initial comment so the client knows the connection is live.
  res.write(": connected\n\n");

  addTicketListClient(res);

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
    removeTicketListClient(res);
    try { res.end(); } catch { /* already ended */ }
  });
});

export default router;
