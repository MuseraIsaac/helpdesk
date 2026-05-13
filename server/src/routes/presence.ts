import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { parseId } from "../lib/parse-id";
import { upsertViewer, removeViewer, addSseClient, removeSseClient } from "../lib/presence";

const router = Router({ mergeParams: true });

// GET /api/tickets/:ticketId/presence/stream
// Opens a Server-Sent Events stream; broadcasts presence updates for this ticket.
router.get("/stream", requireAuth, (req, res) => {
  const ticketId = parseId(req.params.ticketId);
  if (!ticketId) { res.status(400).json({ error: "Invalid ticket ID" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Tell nginx / Caddy / Cloudflare not to buffer this response — without
  // this the proxy holds frames until its own buffer fills, which makes
  // presence updates lag by tens of seconds (or never arrive at all).
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  addSseClient(ticketId, res);

  // Send a comment line every 25 s so idle SSE connections don't get
  // killed by upstream proxies (default idle cutoff is usually 30–60 s).
  const keepAlive = setInterval(() => {
    try { res.write(": keep-alive\n\n"); } catch { /* socket gone */ }
  }, 25_000);

  // Don't remove the viewer on SSE close — EventSource auto-reconnects
  // after transient network blips, and yanking the viewer on every flap
  // makes the eye/pen icons flicker off and back on. Heartbeat eviction
  // (35 s without a POST) is the authoritative liveness check. The
  // explicit DELETE on unmount still removes the viewer immediately for
  // clean tab close / route change.
  req.on("close", () => {
    clearInterval(keepAlive);
    removeSseClient(ticketId, res);
  });
});

// POST /api/tickets/:ticketId/presence/heartbeat
// Agent announces they are viewing (and whether they are composing).
// Must be called on mount and then every ~15 s to stay alive.
router.post("/heartbeat", requireAuth, (req, res) => {
  const ticketId = parseId(req.params.ticketId);
  if (!ticketId) { res.status(400).json({ error: "Invalid ticket ID" }); return; }

  upsertViewer(ticketId, {
    userId:    req.user.id,
    userName:  req.user.name,
    composing: Boolean(req.body?.composing),
    lastSeen:  Date.now(),
  });

  res.json({ ok: true });
});

// DELETE /api/tickets/:ticketId/presence
// Agent explicitly leaves (page unload / unmount).
router.delete("/", requireAuth, (req, res) => {
  const ticketId = parseId(req.params.ticketId);
  if (!ticketId) { res.status(400).json({ error: "Invalid ticket ID" }); return; }

  removeViewer(ticketId, req.user.id);
  res.json({ ok: true });
});

export default router;
