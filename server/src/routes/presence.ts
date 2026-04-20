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
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  addSseClient(ticketId, res);

  req.on("close", () => {
    removeViewer(ticketId, req.user.id);
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
