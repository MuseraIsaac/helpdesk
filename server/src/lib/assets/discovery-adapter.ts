/**
 * Asset discovery adapter interface.
 *
 * Defines the contract that any future discovery or import integration must
 * implement. The reconciler consumes the stream produced by the adapter and
 * applies upsert logic to the Asset table using (externalId, discoverySource)
 * as the stable identity key.
 *
 * Planned adapters (not implemented here):
 *  - JamfDiscoveryAdapter   — Jamf Pro MDM API
 *  - IntuneDiscoveryAdapter — Microsoft Intune Graph API
 *  - SccmDiscoveryAdapter   — SCCM/ConfigMgr WMI or REST bridge
 *  - SnmpDiscoveryAdapter   — SNMP network sweep
 *  - CsvImportAdapter       — One-time or scheduled CSV file upload
 */

import prisma from "../../db";
import { logAssetEvent } from "../asset-events";
import type { AssetType, AssetStatus, AssetCondition } from "../../generated/prisma/client";

// ── Discovered asset shape (source-agnostic) ──────────────────────────────────

export interface DiscoveredAsset {
  /** Stable identifier in the source system (e.g. Jamf computer ID, IMEI). */
  externalId: string;
  /** Short tag identifying the integration (e.g. "jamf", "intune", "csv"). */
  source: string;
  /** Human-readable label for the source (e.g. "Jamf Pro MDM"). */
  sourceLabel?: string;

  name:         string;
  type:         string;         // will be coerced to AssetType
  serialNumber?: string;
  assetTag?:     string;
  manufacturer?: string;
  model?:        string;
  status?:       string;        // will be coerced to AssetStatus
  condition?:    string;        // will be coerced to AssetCondition
  location?:     string;
  site?:         string;

  assignedToEmail?: string;     // resolved to a User.id during reconciliation

  lastSeen?: Date;

  /** Arbitrary extra attributes stored as-is in a future `attributes` JSON column. */
  attributes?: Record<string, unknown>;
}

// ── Adapter interface ─────────────────────────────────────────────────────────

export interface AssetDiscoveryAdapter {
  /** Unique slug, matches `discoverySource` column (e.g. "jamf"). */
  readonly source: string;
  /** Human-readable integration name. */
  readonly label: string;

  /**
   * Yields discovered assets from the remote system.
   * Implementations should be lazy (streaming / paginated) where possible.
   */
  discover(): AsyncIterable<DiscoveredAsset>;
}

// ── Reconciler ────────────────────────────────────────────────────────────────

export type ReconcileAction = "created" | "updated" | "skipped";

export interface ReconcileResult {
  action:   ReconcileAction;
  assetId?: number;
  externalId: string;
}

/**
 * Upserts a single discovered asset record into the database.
 *
 * Identity key: (externalId, discoverySource)
 *  - If no match → CREATE a new asset.
 *  - If match     → UPDATE non-critical fields (name, location, status, lastDiscoveredAt).
 *    Fields set by a human operator (owner, team, procurement fields) are NOT
 *    overwritten by discovery — use the `syncPolicy` to change this behaviour.
 */
export async function reconcileDiscoveredAsset(
  discovered: DiscoveredAsset,
  actorId: string | null = null,
  syncPolicy: "merge" | "overwrite" = "merge"
): Promise<ReconcileResult> {
  const existing = await prisma.asset.findFirst({
    where: {
      externalId:      discovered.externalId,
      discoverySource: discovered.source,
    },
    select: { id: true, serialNumber: true, name: true },
  });

  const now = new Date();

  if (!existing) {
    // Resolve assignee by email if provided
    let assignedToId: string | null = null;
    if (discovered.assignedToEmail) {
      const u = await prisma.user.findFirst({
        where:  { email: discovered.assignedToEmail, deletedAt: null },
        select: { id: true },
      });
      assignedToId = u?.id ?? null;
    }

    // Generate asset number
    const [row] = await prisma.$queryRaw<[{ last_value: number }]>`
      INSERT INTO ticket_counter (series, period_key, last_value)
      VALUES ('asset', '', 1)
      ON CONFLICT (series, period_key)
      DO UPDATE SET last_value = ticket_counter.last_value + 1
      RETURNING last_value
    `;
    const assetNumber = `ASSET-${String(row.last_value).padStart(5, "0")}`;

    const created = await prisma.asset.create({
      data: {
        assetNumber,
        externalId:       discovered.externalId,
        discoverySource:  discovered.source,
        managedBy:        discovered.sourceLabel ?? discovered.source,
        lastDiscoveredAt: discovered.lastSeen ?? now,
        name:             discovered.name,
        type:             coerceType(discovered.type),
        status:           coerceStatus(discovered.status),
        condition:        coerceCondition(discovered.condition),
        serialNumber:     discovered.serialNumber ?? null,
        assetTag:         discovered.assetTag ?? null,
        manufacturer:     discovered.manufacturer ?? null,
        model:            discovered.model ?? null,
        location:         discovered.location ?? null,
        site:             discovered.site ?? null,
        assignedToId,
        assignedAt:       assignedToId ? now : null,
        createdById:      actorId,
      },
      select: { id: true },
    });

    await logAssetEvent(created.id, actorId, "asset.discovered", {
      source: discovered.source,
      externalId: discovered.externalId,
    });

    return { action: "created", assetId: created.id, externalId: discovered.externalId };
  }

  // Merge mode: only update discovery-owned fields
  const updateData: Record<string, unknown> = {
    lastDiscoveredAt: discovered.lastSeen ?? now,
    name:             discovered.name,
  };

  if (syncPolicy === "overwrite") {
    updateData.type        = coerceType(discovered.type);
    updateData.status      = coerceStatus(discovered.status);
    updateData.condition   = coerceCondition(discovered.condition);
    updateData.location    = discovered.location ?? null;
    updateData.site        = discovered.site ?? null;
    updateData.serialNumber = discovered.serialNumber ?? null;
    updateData.model        = discovered.model ?? null;
    updateData.manufacturer = discovered.manufacturer ?? null;
  }

  await prisma.asset.update({
    where: { id: existing.id },
    data:  updateData as any,
  });

  await logAssetEvent(existing.id, actorId, "asset.discovery_sync", {
    source:    discovered.source,
    policy:    syncPolicy,
    changes:   Object.keys(updateData).filter((k) => k !== "lastDiscoveredAt"),
  });

  return { action: "updated", assetId: existing.id, externalId: discovered.externalId };
}

// ── Coercion helpers ──────────────────────────────────────────────────────────

const VALID_TYPES: AssetType[] = [
  "hardware", "end_user_device", "software_license", "network_equipment",
  "peripheral", "mobile_device", "cloud_resource", "iot_device",
  "audio_visual", "vehicle", "furniture", "consumable", "other",
];

const VALID_STATUSES: AssetStatus[] = [
  "ordered", "in_stock", "deployed", "in_use", "under_maintenance",
  "in_repair", "retired", "disposed", "lost_stolen",
];

const VALID_CONDITIONS: AssetCondition[] = ["new_item", "good", "fair", "poor"];

function coerceType(raw?: string): AssetType {
  return VALID_TYPES.includes(raw as AssetType) ? (raw as AssetType) : "other";
}

function coerceStatus(raw?: string): AssetStatus {
  return VALID_STATUSES.includes(raw as AssetStatus) ? (raw as AssetStatus) : "in_stock";
}

function coerceCondition(raw?: string): AssetCondition {
  return VALID_CONDITIONS.includes(raw as AssetCondition) ? (raw as AssetCondition) : "good";
}
