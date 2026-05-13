/**
 * /api/incidents/:incidentId/bridge
 *
 * POST   — Create a video bridge meeting via the configured provider and attach
 *           the join URL to the incident. Returns the meeting details.
 * DELETE — Remove the bridge call link from the incident.
 * POST   /api/settings/integrations/test-video-bridge — Validate credentials
 *          by creating and immediately discarding a test meeting.
 */
import { Router, type Request } from "express";
import { requireAuth } from "../middleware/require-auth";
import { parseId }     from "../lib/parse-id";
import { getSection }  from "../lib/settings";
import prisma          from "../db";
import { getVideoBridgeProvider, BridgeError } from "../lib/bridge";
import { logIncidentEvent } from "../lib/incident-events";
import type { IntegrationsSettings } from "core/schemas/settings.ts";
import { Prisma } from "../generated/prisma/client";

// ── Incident bridge ────────────────────────────────────────────────────────────

const router = Router({ mergeParams: true });
router.use(requireAuth);

/**
 * POST /api/incidents/:incidentId/bridge
 *
 * Creates a bridge call meeting for the incident. If one already exists it is
 * overwritten (the old meeting URL is simply replaced — the provider meeting
 * is NOT cancelled, as that would require storing a meeting ID per provider).
 */
router.post("/", async (req, res) => {
  const incidentId = parseId((req as Request<{ incidentId: string }>).params.incidentId);
  if (!incidentId) { res.status(400).json({ error: "Invalid incident ID" }); return; }

  const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
  if (!incident) { res.status(404).json({ error: "Incident not found" }); return; }

  // Fetch the full (un-redacted) integrations settings
  const cfg = (await getSection("integrations")) as IntegrationsSettings;

  let provider;
  try {
    provider = getVideoBridgeProvider(cfg);
  } catch (err) {
    if (err instanceof BridgeError) {
      res.status(422).json({ error: err.message, code: "BRIDGE_CONFIG_ERROR" });
    } else {
      throw err;
    }
    return;
  }

  const meetingTitle = `INC-${incident.incidentNumber}: ${incident.title}`;

  let meeting;
  try {
    meeting = await provider.createMeeting(meetingTitle);
  } catch (err) {
    if (err instanceof BridgeError) {
      res.status(502).json({ error: err.message, code: "BRIDGE_API_ERROR" });
    } else {
      throw err;
    }
    return;
  }

  // Persist the join URL + the rich details (meeting ID, dial-in, PIN, etc.)
  // on the incident so the "Copy meeting details" action has everything it
  // needs even after a page reload.
  const detailsJson = {
    meetingId:      meeting.meetingId ?? null,
    passcode:       meeting.passcode ?? null,
    startUrl:       meeting.startUrl ?? null,
    organizerEmail: meeting.organizerEmail ?? null,
    dialIn:         meeting.dialIn ?? [],
  } as unknown as Prisma.InputJsonValue;

  const updated = await prisma.incident.update({
    where: { id: incidentId },
    data: {
      bridgeCallUrl:       meeting.joinUrl,
      bridgeCallProvider:  cfg.videoBridgeProvider,
      bridgeCallCreatedAt: new Date(),
      bridgeCallDetails:   detailsJson,
    },
    select: {
      id: true,
      bridgeCallUrl: true,
      bridgeCallProvider: true,
      bridgeCallCreatedAt: true,
      bridgeCallDetails: true,
    },
  });

  // Write an audit entry so the incident's Activity Log shows
  // "Bridge call created" with provider + meeting metadata.
  await logIncidentEvent(incidentId, req.user.id, "bridge.created", {
    provider:       cfg.videoBridgeProvider,
    joinUrl:        meeting.joinUrl,
    meetingId:      meeting.meetingId ?? null,
    organizerEmail: meeting.organizerEmail ?? null,
  });

  res.status(201).json({
    bridge: {
      joinUrl:    updated.bridgeCallUrl,
      provider:   updated.bridgeCallProvider,
      createdAt:  updated.bridgeCallCreatedAt,
      meetingId:  meeting.meetingId,
      passcode:   meeting.passcode,
      startUrl:   meeting.startUrl,
      organizerEmail: meeting.organizerEmail,
      dialIn:     meeting.dialIn ?? [],
    },
  });
});

/**
 * DELETE /api/incidents/:incidentId/bridge
 * Removes the bridge call link from the incident (does NOT cancel the meeting
 * on the provider side — the meeting remains accessible via its URL until it
 * naturally expires or is cancelled in the provider's admin panel).
 */
router.delete("/", async (req, res) => {
  const incidentId = parseId((req as Request<{ incidentId: string }>).params.incidentId);
  if (!incidentId) { res.status(400).json({ error: "Invalid incident ID" }); return; }

  const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
  if (!incident) { res.status(404).json({ error: "Incident not found" }); return; }

  await prisma.incident.update({
    where: { id: incidentId },
    data: {
      bridgeCallUrl:       null,
      bridgeCallProvider:  null,
      bridgeCallCreatedAt: null,
      bridgeCallDetails:   Prisma.JsonNull,
    },
  });

  await logIncidentEvent(incidentId, req.user.id, "bridge.removed", {
    provider: incident.bridgeCallProvider,
  });

  res.status(204).end();
});

export default router;

// ── Test connection endpoint (mounted separately in index.ts) ─────────────────

export async function testVideoBridge(req: import("express").Request, res: import("express").Response) {
  const cfg = (await getSection("integrations")) as IntegrationsSettings;

  let provider;
  try {
    provider = getVideoBridgeProvider(cfg);
  } catch (err) {
    if (err instanceof BridgeError) {
      res.status(422).json({ ok: false, error: err.message });
    } else {
      throw err;
    }
    return;
  }

  try {
    const meeting = await provider.createMeeting("ITSM Bridge Test — please ignore");
    // We don't cancel the test meeting — the provider will expire it naturally.
    res.json({ ok: true, provider: cfg.videoBridgeProvider, joinUrl: meeting.joinUrl });
  } catch (err) {
    const msg = err instanceof BridgeError ? err.message : "Unknown error";
    res.status(502).json({ ok: false, error: msg });
  }
}
