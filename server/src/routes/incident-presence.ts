/**
 * Incident presence routes — mounted at /api/incidents/:incidentId/presence
 *
 * GET  /stream     — SSE stream; fires whenever the viewer list changes
 * POST /heartbeat  — announce viewing (call on mount, then every 15 s)
 * DELETE /         — explicit leave on unmount / page close
 */

import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { parseId } from "../lib/parse-id";
import {
  upsertViewer,
  removeViewer,
  addSseClient,
  removeSseClient,
} from "../lib/incident-presence";

const router = Router({ mergeParams: true });

// SSE stream — one long-lived connection per viewer
router.get("/stream", requireAuth, (req, res) => {
  const incidentId = parseId((req.params as Record<string, string>)["incidentId"]);
  if (!incidentId) { res.status(400).json({ error: "Invalid incident ID" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  addSseClient(incidentId, res);

  req.on("close", () => {
    removeViewer(incidentId, req.user.id);
    removeSseClient(incidentId, res);
  });
});

// Heartbeat — keeps the viewer alive and sets composing state
router.post("/heartbeat", requireAuth, (req, res) => {
  const incidentId = parseId((req.params as Record<string, string>)["incidentId"]);
  if (!incidentId) { res.status(400).json({ error: "Invalid incident ID" }); return; }

  upsertViewer(incidentId, {
    userId:   req.user.id,
    userName: req.user.name,
    lastSeen: Date.now(),
  });

  res.json({ ok: true });
});

// Explicit leave
router.delete("/", requireAuth, (req, res) => {
  const incidentId = parseId((req.params as Record<string, string>)["incidentId"]);
  if (!incidentId) { res.status(400).json({ error: "Invalid incident ID" }); return; }

  removeViewer(incidentId, req.user.id);
  res.json({ ok: true });
});

export default router;
