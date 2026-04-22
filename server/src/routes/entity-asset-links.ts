/**
 * Entity-side asset link routes.
 *
 * Adds GET / POST / DELETE endpoints on the entity side so detail pages
 * (Incident, Request, Problem, Change, CI) can manage their linked assets
 * without having to know the asset's ID upfront.
 *
 * Pattern (incident example):
 *   GET    /api/incidents/:id/assets            – list linked assets
 *   POST   /api/incidents/:id/assets            – link asset (body: { assetId })
 *   DELETE /api/incidents/:id/assets/:assetId   – unlink
 *
 * For CI/CMDB the relationship is stored as asset.ciId (FK), not a junction
 * table, so it uses a separate handler.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { parseId } from "../lib/parse-id";
import prisma from "../db";
import {
  linkAssetToIncident,  unlinkAssetFromIncident,
  linkAssetToRequest,   unlinkAssetFromRequest,
  linkAssetToProblem,   unlinkAssetFromProblem,
  linkAssetToChange,    unlinkAssetFromChange,
} from "../lib/assets";

// ── Shared asset projection ───────────────────────────────────────────────────

const PANEL_SELECT = {
  id: true, assetNumber: true, name: true,
  type: true, status: true, condition: true,
  manufacturer: true, model: true,
  serialNumber: true, assetTag: true,
  warrantyExpiry: true, location: true, site: true,
  assignedTo: { select: { id: true, name: true } },
  team:        { select: { id: true, name: true, color: true } },
} as const;

// ── Factory ───────────────────────────────────────────────────────────────────

type LinkFn   = (assetId: number, entityId: number, actorId: string) => Promise<void>;
type UnlinkFn = (assetId: number, entityId: number, actorId: string) => Promise<void>;
type GetFn    = (entityId: number) => Promise<{ asset: unknown; linkedAt: Date }[]>;

function makeRouter(getFn: GetFn, linkFn: LinkFn, unlinkFn: UnlinkFn): Router {
  const router = Router({ mergeParams: true });
  router.use(requireAuth);

  // GET /:id/assets
  router.get("/:id/assets", requirePermission("assets.view"), async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

    const rows = await getFn(id);
    res.json(rows.map(r => ({ ...(r.asset as object), linkedAt: r.linkedAt })));
  });

  // POST /:id/assets  { assetId }
  router.post("/:id/assets", requirePermission("assets.manage_lifecycle"), async (req, res) => {
    const id      = parseId(req.params.id);
    const assetId = parseId(req.body?.assetId);
    if (!id || !assetId) { res.status(400).json({ error: "Invalid IDs" }); return; }

    await linkFn(assetId, id, req.user.id);
    const rows = await getFn(id);
    res.status(201).json(rows.map(r => ({ ...(r.asset as object), linkedAt: r.linkedAt })));
  });

  // DELETE /:id/assets/:assetId
  router.delete("/:id/assets/:assetId", requirePermission("assets.manage_lifecycle"), async (req, res) => {
    const id      = parseId(req.params.id);
    const assetId = parseId(req.params.assetId);
    if (!id || !assetId) { res.status(400).json({ error: "Invalid IDs" }); return; }

    await unlinkFn(assetId, id, req.user.id);
    res.status(204).end();
  });

  return router;
}

// ── Per-entity query functions ────────────────────────────────────────────────

async function getIncidentAssets(incidentId: number) {
  return prisma.assetIncidentLink.findMany({
    where:   { incidentId },
    select:  { linkedAt: true, asset: { select: PANEL_SELECT } },
    orderBy: { linkedAt: "desc" },
  });
}

async function getRequestAssets(requestId: number) {
  return prisma.assetRequestLink.findMany({
    where:   { requestId },
    select:  { linkedAt: true, asset: { select: PANEL_SELECT } },
    orderBy: { linkedAt: "desc" },
  });
}

async function getProblemAssets(problemId: number) {
  return prisma.assetProblemLink.findMany({
    where:   { problemId },
    select:  { linkedAt: true, asset: { select: PANEL_SELECT } },
    orderBy: { linkedAt: "desc" },
  });
}

async function getChangeAssets(changeId: number) {
  return prisma.assetChangeLink.findMany({
    where:   { changeId },
    select:  { linkedAt: true, asset: { select: PANEL_SELECT } },
    orderBy: { linkedAt: "desc" },
  });
}

// ── Exported routers ──────────────────────────────────────────────────────────

export const incidentAssetLinksRouter = makeRouter(
  getIncidentAssets, linkAssetToIncident, unlinkAssetFromIncident,
);

export const requestAssetLinksRouter = makeRouter(
  getRequestAssets, linkAssetToRequest, unlinkAssetFromRequest,
);

export const problemAssetLinksRouter = makeRouter(
  getProblemAssets, linkAssetToProblem, unlinkAssetFromProblem,
);

export const changeAssetLinksRouter = makeRouter(
  getChangeAssets, linkAssetToChange, unlinkAssetFromChange,
);

// ── CMDB CI asset links ───────────────────────────────────────────────────────
// Assets link to a CI via asset.ciId (one FK, not a junction table).
// Multiple assets can point to the same CI.

export const ciAssetLinksRouter = Router({ mergeParams: true });
ciAssetLinksRouter.use(requireAuth);

ciAssetLinksRouter.get("/:id/assets", requirePermission("assets.view"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const assets = await prisma.asset.findMany({
    where:   { ciId: id },
    select:  PANEL_SELECT,
    orderBy: { name: "asc" },
  });
  res.json(assets.map(a => ({ ...a, linkedAt: null })));
});

ciAssetLinksRouter.post("/:id/assets", requirePermission("assets.manage_lifecycle"), async (req, res) => {
  const id      = parseId(req.params.id);
  const assetId = parseId(req.body?.assetId);
  if (!id || !assetId) { res.status(400).json({ error: "Invalid IDs" }); return; }

  // Verify the CI exists
  const ci = await prisma.configItem.findUnique({ where: { id }, select: { id: true } });
  if (!ci) { res.status(404).json({ error: "Configuration item not found" }); return; }

  await prisma.asset.update({ where: { id: assetId }, data: { ciId: id } });

  const assets = await prisma.asset.findMany({
    where:   { ciId: id },
    select:  PANEL_SELECT,
    orderBy: { name: "asc" },
  });
  res.status(201).json(assets.map(a => ({ ...a, linkedAt: null })));
});

ciAssetLinksRouter.delete("/:id/assets/:assetId", requirePermission("assets.manage_lifecycle"), async (req, res) => {
  const id      = parseId(req.params.id);
  const assetId = parseId(req.params.assetId);
  if (!id || !assetId) { res.status(400).json({ error: "Invalid IDs" }); return; }

  await prisma.asset.updateMany({
    where: { id: assetId, ciId: id },
    data:  { ciId: null },
  });
  res.status(204).end();
});
