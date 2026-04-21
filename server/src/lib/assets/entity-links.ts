/**
 * Asset ↔ ITIL entity link service.
 *
 * Manages the many-to-many junction tables connecting assets to incidents,
 * service requests, problems, changes, and catalog services. All operations
 * produce an audit event on the asset.
 */

import prisma from "../../db";
import { logAssetEvent } from "../asset-events";

// ── Incident links ────────────────────────────────────────────────────────────

export async function linkAssetToIncident(
  assetId: number, incidentId: number, actorId: string
): Promise<void> {
  const [asset, incident] = await Promise.all([
    prisma.asset.findUnique({ where: { id: assetId }, select: { id: true } }),
    prisma.incident.findUnique({ where: { id: incidentId }, select: { id: true, title: true } }),
  ]);
  if (!asset)    throw Object.assign(new Error("Asset not found"),    { status: 404 });
  if (!incident) throw Object.assign(new Error("Incident not found"), { status: 404 });

  await prisma.assetIncidentLink.upsert({
    where:  { assetId_incidentId: { assetId, incidentId } },
    create: { assetId, incidentId },
    update: {},
  });

  await logAssetEvent(assetId, actorId, "asset.linked_to_incident", {
    incidentId,
    title: incident.title,
  });
}

export async function unlinkAssetFromIncident(
  assetId: number, incidentId: number, actorId: string
): Promise<void> {
  await prisma.assetIncidentLink.deleteMany({ where: { assetId, incidentId } });
  await logAssetEvent(assetId, actorId, "asset.unlinked_from_incident", { incidentId });
}

// ── Service request links ─────────────────────────────────────────────────────

export async function linkAssetToRequest(
  assetId: number, requestId: number, actorId: string
): Promise<void> {
  const [asset, request] = await Promise.all([
    prisma.asset.findUnique({ where: { id: assetId }, select: { id: true } }),
    prisma.serviceRequest.findUnique({ where: { id: requestId }, select: { id: true, title: true } }),
  ]);
  if (!asset)   throw Object.assign(new Error("Asset not found"),          { status: 404 });
  if (!request) throw Object.assign(new Error("Service request not found"),{ status: 404 });

  await prisma.assetRequestLink.upsert({
    where:  { assetId_requestId: { assetId, requestId } },
    create: { assetId, requestId },
    update: {},
  });

  await logAssetEvent(assetId, actorId, "asset.linked_to_request", {
    requestId,
    title: request.title,
  });
}

export async function unlinkAssetFromRequest(
  assetId: number, requestId: number, actorId: string
): Promise<void> {
  await prisma.assetRequestLink.deleteMany({ where: { assetId, requestId } });
  await logAssetEvent(assetId, actorId, "asset.unlinked_from_request", { requestId });
}

// ── Problem links ─────────────────────────────────────────────────────────────

export async function linkAssetToProblem(
  assetId: number, problemId: number, actorId: string
): Promise<void> {
  const [asset, problem] = await Promise.all([
    prisma.asset.findUnique({ where: { id: assetId }, select: { id: true } }),
    prisma.problem.findUnique({ where: { id: problemId }, select: { id: true, title: true } }),
  ]);
  if (!asset)   throw Object.assign(new Error("Asset not found"),  { status: 404 });
  if (!problem) throw Object.assign(new Error("Problem not found"),{ status: 404 });

  await prisma.assetProblemLink.upsert({
    where:  { assetId_problemId: { assetId, problemId } },
    create: { assetId, problemId },
    update: {},
  });

  await logAssetEvent(assetId, actorId, "asset.linked_to_problem", {
    problemId,
    title: problem.title,
  });
}

export async function unlinkAssetFromProblem(
  assetId: number, problemId: number, actorId: string
): Promise<void> {
  await prisma.assetProblemLink.deleteMany({ where: { assetId, problemId } });
  await logAssetEvent(assetId, actorId, "asset.unlinked_from_problem", { problemId });
}

// ── Change links ──────────────────────────────────────────────────────────────

export async function linkAssetToChange(
  assetId: number, changeId: number, actorId: string
): Promise<void> {
  const [asset, change] = await Promise.all([
    prisma.asset.findUnique({ where: { id: assetId }, select: { id: true } }),
    prisma.change.findUnique({ where: { id: changeId }, select: { id: true, title: true } }),
  ]);
  if (!asset)  throw Object.assign(new Error("Asset not found"), { status: 404 });
  if (!change) throw Object.assign(new Error("Change not found"),{ status: 404 });

  await prisma.assetChangeLink.upsert({
    where:  { assetId_changeId: { assetId, changeId } },
    create: { assetId, changeId },
    update: {},
  });

  await logAssetEvent(assetId, actorId, "asset.linked_to_change", {
    changeId,
    title: change.title,
  });
}

export async function unlinkAssetFromChange(
  assetId: number, changeId: number, actorId: string
): Promise<void> {
  await prisma.assetChangeLink.deleteMany({ where: { assetId, changeId } });
  await logAssetEvent(assetId, actorId, "asset.unlinked_from_change", { changeId });
}

// ── Service (catalog item) links ──────────────────────────────────────────────

export async function linkAssetToService(
  assetId: number, catalogItemId: number, actorId: string
): Promise<void> {
  const [asset, item] = await Promise.all([
    prisma.asset.findUnique({ where: { id: assetId }, select: { id: true } }),
    prisma.catalogItem.findUnique({ where: { id: catalogItemId }, select: { id: true, name: true } }),
  ]);
  if (!asset) throw Object.assign(new Error("Asset not found"),        { status: 404 });
  if (!item)  throw Object.assign(new Error("Catalog item not found"), { status: 404 });

  await prisma.assetServiceLink.upsert({
    where:  { assetId_catalogItemId: { assetId, catalogItemId } },
    create: { assetId, catalogItemId },
    update: {},
  });

  await logAssetEvent(assetId, actorId, "asset.linked_to_service", {
    catalogItemId,
    name: item.name,
  });
}

export async function unlinkAssetFromService(
  assetId: number, catalogItemId: number, actorId: string
): Promise<void> {
  await prisma.assetServiceLink.deleteMany({ where: { assetId, catalogItemId } });
  await logAssetEvent(assetId, actorId, "asset.unlinked_from_service", { catalogItemId });
}
