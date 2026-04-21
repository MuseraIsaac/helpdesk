/**
 * Asset lifecycle state machine.
 *
 * Enforces valid transitions and updates time-stamp fields automatically
 * when specific states are entered. All mutations go through `transitionAsset`
 * so every lifecycle change is validated, stamped, and audited in one place.
 */

import prisma from "../../db";
import { logAssetEvent } from "../asset-events";
import { LIFECYCLE_TRANSITIONS } from "core/constants/assets.ts";
import type { AssetStatus } from "../../generated/prisma/client";

// ── Transition validation ─────────────────────────────────────────────────────

export class LifecycleTransitionError extends Error {
  constructor(
    public readonly from: AssetStatus,
    public readonly to: AssetStatus
  ) {
    super(`Invalid lifecycle transition: ${from} → ${to}`);
  }
}

export function assertValidTransition(from: AssetStatus, to: AssetStatus): void {
  const allowed = LIFECYCLE_TRANSITIONS[from as keyof typeof LIFECYCLE_TRANSITIONS] ?? [];
  if (!allowed.includes(to as any)) {
    throw new LifecycleTransitionError(from, to);
  }
}

// ── Date stamps applied on entering specific states ───────────────────────────

function timestampsForStatus(to: AssetStatus): Record<string, Date | null> {
  const now = new Date();
  switch (to) {
    case "in_stock":          return { receivedAt: now };
    case "deployed":
    case "in_use":            return { deployedAt: now };
    case "under_maintenance":
    case "in_repair":         return {};
    case "retired":           return { retiredAt: now };
    case "disposed":          return { retiredAt: null };  // clear retired marker if directly disposed
    default:                  return {};
  }
}

// ── Core transition function ──────────────────────────────────────────────────

interface TransitionResult {
  id:     number;
  status: AssetStatus;
}

export async function transitionAsset(
  assetId: number,
  to:      AssetStatus,
  actorId: string,
  reason?: string | null
): Promise<TransitionResult> {
  const current = await prisma.asset.findUnique({
    where:  { id: assetId },
    select: { id: true, status: true },
  });
  if (!current) throw new Error(`Asset ${assetId} not found`);

  assertValidTransition(current.status, to);

  const stamps = timestampsForStatus(to);

  const updated = await prisma.asset.update({
    where: { id: assetId },
    data:  { status: to, ...stamps },
    select: { id: true, status: true },
  });

  await logAssetEvent(assetId, actorId, "asset.lifecycle_transition", {
    from:   current.status,
    to,
    reason: reason ?? null,
    ...stamps,
  });

  return updated;
}

// ── Status group helpers (useful for query scoping) ───────────────────────────

export const ACTIVE_STATUSES: AssetStatus[]   = ["deployed", "in_use"];
export const INACTIVE_STATUSES: AssetStatus[] = ["ordered", "in_stock", "under_maintenance", "in_repair"];
export const END_OF_LIFE_STATUSES: AssetStatus[] = ["retired", "disposed", "lost_stolen"];
