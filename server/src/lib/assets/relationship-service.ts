/**
 * Asset-to-asset relationship service.
 *
 * Manages the directed typed graph of asset relationships. Mirrors the CMDB
 * CiRelationship model so ITAM relationships are first-class alongside CMDB
 * topology edges.
 */

import prisma from "../../db";
import { logAssetEvent } from "../asset-events";
import { ASSET_RELATIONSHIP_LABEL } from "core/constants/assets.ts";
import type { AssetRelationshipType } from "../../generated/prisma/client";

// ── Shared select for relationship edges ──────────────────────────────────────

const ASSET_REL_SUMMARY = {
  id:         true,
  assetNumber: true,
  name:        true,
  type:        true,
  status:      true,
  condition:   true,
  manufacturer: true,
  model:        true,
  serialNumber: true,
  assetTag:     true,
  location:     true,
  warrantyExpiry: true,
  purchaseDate:   true,
  purchasePrice:  true,
  currency:       true,
  externalId:      true,
  discoverySource: true,
  managedBy:       true,
  assignedTo: { select: { id: true, name: true } },
  owner:      { select: { id: true, name: true } },
  team:       { select: { id: true, name: true, color: true } },
  ci:         { select: { id: true, ciNumber: true, name: true } },
  createdAt:  true,
  updatedAt:  true,
  _count: {
    select: {
      relationshipsFrom: true,
      relationshipsTo:   true,
      incidentLinks:     true,
      requestLinks:      true,
      problemLinks:      true,
      changeLinks:       true,
    },
  },
} as const;

// ── Add relationship ──────────────────────────────────────────────────────────

export async function addRelationship(
  fromAssetId: number,
  toAssetId:   number,
  type:        AssetRelationshipType,
  actorId:     string
) {
  if (fromAssetId === toAssetId) {
    throw new Error("An asset cannot have a relationship with itself");
  }

  const [from, to] = await Promise.all([
    prisma.asset.findUnique({ where: { id: fromAssetId }, select: { id: true, name: true } }),
    prisma.asset.findUnique({ where: { id: toAssetId },   select: { id: true, name: true } }),
  ]);
  if (!from) throw new Error("Source asset not found");
  if (!to)   throw new Error("Target asset not found");

  const rel = await prisma.assetRelationship.create({
    data: {
      fromAssetId,
      toAssetId,
      type,
      createdById: actorId,
    },
    select: {
      id:      true,
      type:    true,
      toAsset: { select: ASSET_REL_SUMMARY },
    },
  });

  await logAssetEvent(fromAssetId, actorId, "asset.relationship_added", {
    type,
    label:       ASSET_RELATIONSHIP_LABEL[type],
    toAssetId,
    toAssetName: to.name,
  });

  return {
    id:        rel.id,
    type:      rel.type,
    direction: "outbound" as const,
    asset:     normaliseSummary(rel.toAsset),
  };
}

// ── Remove relationship ───────────────────────────────────────────────────────

export async function removeRelationship(
  relId:   number,
  assetId: number,
  actorId: string
) {
  const rel = await prisma.assetRelationship.findFirst({
    where: { id: relId, OR: [{ fromAssetId: assetId }, { toAssetId: assetId }] },
    select: { id: true, type: true, fromAssetId: true, toAssetId: true },
  });
  if (!rel) throw new Error("Relationship not found");

  await prisma.assetRelationship.delete({ where: { id: relId } });

  await logAssetEvent(assetId, actorId, "asset.relationship_removed", {
    relId,
    type:       rel.type,
    otherAsset: assetId === rel.fromAssetId ? rel.toAssetId : rel.fromAssetId,
  });
}

// ── Fetch all relationships for an asset ─────────────────────────────────────

export async function getRelationships(assetId: number) {
  const [outbound, inbound] = await Promise.all([
    prisma.assetRelationship.findMany({
      where:  { fromAssetId: assetId },
      select: { id: true, type: true, toAsset: { select: ASSET_REL_SUMMARY } },
    }),
    prisma.assetRelationship.findMany({
      where:  { toAssetId: assetId },
      select: { id: true, type: true, fromAsset: { select: ASSET_REL_SUMMARY } },
    }),
  ]);

  return [
    ...outbound.map((r) => ({ id: r.id, type: r.type as string, direction: "outbound" as const, asset: normaliseSummary(r.toAsset) })),
    ...inbound.map((r)  => ({ id: r.id, type: r.type as string, direction: "inbound"  as const, asset: normaliseSummary(r.fromAsset) })),
  ];
}

// ── Internal ──────────────────────────────────────────────────────────────────

import type { Prisma } from "../../generated/prisma/client";
type RawSummary = Prisma.AssetGetPayload<{ select: typeof ASSET_REL_SUMMARY }>;

function normaliseSummary(raw: RawSummary) {
  const { _count, ...rest } = raw;
  return {
    ...rest,
    _counts: {
      relationships: _count.relationshipsFrom + _count.relationshipsTo,
      incidents:     _count.incidentLinks,
      requests:      _count.requestLinks,
      problems:      _count.problemLinks,
      changes:       _count.changeLinks,
    },
  };
}
