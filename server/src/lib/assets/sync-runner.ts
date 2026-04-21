/**
 * Discovery Sync Runner
 *
 * Orchestrates a full sync run for a given DiscoveryConnector:
 *  1. Creates / loads a DiscoverySyncRun record.
 *  2. Instantiates the appropriate adapter.
 *  3. Iterates DiscoveredAsset records, calling reconcileDiscoveredAsset per item.
 *  4. After the pass: detects stale assets (previously seen, now absent).
 *  5. Finalises the run record with counts and status.
 *
 * All per-asset errors are recorded in DiscoverySyncError rather than
 * aborting the entire run.
 */

import prisma from "../../db";
import Sentry from "../sentry";
import { reconcileDiscoveredAsset } from "./discovery-adapter";
import { logAssetEvent } from "../asset-events";
import { CsvDiscoveryAdapter } from "./connectors/csv-connector";
import type { AssetDiscoveryAdapter } from "./discovery-adapter";
import type { Prisma, SyncRunStatus } from "../../generated/prisma/client";

// ── Adapter registry ──────────────────────────────────────────────────────────
// Populated on demand; extend this when live connectors are added.

function buildAdapter(
  source: string,
  config: Record<string, unknown>,
  csvContent?: string,
): AssetDiscoveryAdapter | null {
  switch (source) {
    case "csv":
      if (!csvContent) throw new Error("CSV content is required for csv connector");
      return new CsvDiscoveryAdapter(csvContent, "csv");

    // Future connectors go here:
    // case "jamf":   return new JamfDiscoveryAdapter(config);
    // case "intune": return new IntuneDiscoveryAdapter(config);
    // case "sccm":   return new SccmDiscoveryAdapter(config);
    // case "snmp":   return new SnmpDiscoveryAdapter(config);

    default:
      return null;
  }
}

// ── Run result ────────────────────────────────────────────────────────────────

export interface SyncRunResult {
  syncRunId:        number;
  status:           SyncRunStatus;
  assetsDiscovered: number;
  assetsCreated:    number;
  assetsUpdated:    number;
  assetsSkipped:    number;
  assetsFailed:     number;
  assetsStale:      number;
  errorMessage:     string | null;
  durationMs:       number;
}

// ── Main sync entry point ─────────────────────────────────────────────────────

/**
 * Runs a full sync using an existing DiscoverySyncRun record.
 * The run must already exist in the database (created by the route or scheduler).
 */
export async function runDiscoverySync(
  syncRunId: number,
  /** Pre-loaded CSV content for csv-type connectors. */
  csvContent?: string,
): Promise<SyncRunResult> {
  const startedAt = new Date();

  // Load the run + connector
  const run = await prisma.discoverySyncRun.findUnique({
    where:  { id: syncRunId },
    select: {
      id: true, source: true, connectorId: true,
      connector: { select: { syncPolicy: true, config: true, label: true } },
    },
  });

  if (!run) throw new Error(`DiscoverySyncRun ${syncRunId} not found`);

  await prisma.discoverySyncRun.update({
    where: { id: syncRunId },
    data:  { status: "running", startedAt },
  });

  const syncPolicy = (run.connector.syncPolicy as "merge" | "overwrite") ?? "merge";
  const config     = (run.connector.config ?? {}) as Record<string, unknown>;

  let finalStatus: SyncRunStatus = "completed";
  let topLevelError: string | null = null;

  const counters = {
    discovered: 0,
    created:    0,
    updated:    0,
    skipped:    0,
    failed:     0,
    stale:      0,
  };

  const seenExternalIds = new Set<string>();

  try {
    const adapter = buildAdapter(run.source, config, csvContent);

    if (!adapter) {
      throw new Error(
        `No adapter registered for source "${run.source}". ` +
        `Live connectors (Jamf, Intune, SCCM) require their respective ` +
        `environment variables and adapter implementations.`,
      );
    }

    for await (const discovered of adapter.discover()) {
      counters.discovered++;
      seenExternalIds.add(discovered.externalId);

      try {
        const result = await reconcileDiscoveredAsset(
          { ...discovered, source: run.source },
          null,
          syncPolicy,
        );

        switch (result.action) {
          case "created": counters.created++; break;
          case "updated": counters.updated++; break;
          case "skipped": counters.skipped++; break;
        }
      } catch (err) {
        counters.failed++;
        const msg = err instanceof Error ? err.message : String(err);
        await prisma.discoverySyncError.create({
          data: {
            syncRunId,
            externalId:   discovered.externalId,
            errorMessage: msg,
            rawData:      { name: discovered.name, type: discovered.type, ...discovered.attributes } as Prisma.InputJsonValue,
          },
        });
        Sentry.captureException(err, { tags: { syncRunId, externalId: discovered.externalId } });
      }
    }

    // ── Stale detection ──────────────────────────────────────────────────────
    // Find assets from this source that were not seen in this run.
    if (seenExternalIds.size > 0) {
      const staleAssets = await prisma.asset.findMany({
        where: {
          discoverySource: run.source,
          externalId:      { notIn: Array.from(seenExternalIds) },
          staleDetectedAt: null,   // only stamp once per stale event
        },
        select: { id: true, externalId: true },
      });

      if (staleAssets.length > 0) {
        await prisma.asset.updateMany({
          where: { id: { in: staleAssets.map(a => a.id) } },
          data:  { staleDetectedAt: new Date() },
        });

        await Promise.all(
          staleAssets.map(a =>
            logAssetEvent(a.id, null, "asset.stale_detected", {
              source:    run.source,
              syncRunId,
            }),
          ),
        );

        counters.stale = staleAssets.length;
      }
    }

  } catch (err) {
    finalStatus    = "failed";
    topLevelError  = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err, { tags: { syncRunId } });
  }

  const completedAt = new Date();
  const durationMs  = completedAt.getTime() - startedAt.getTime();

  await prisma.discoverySyncRun.update({
    where: { id: syncRunId },
    data:  {
      status:           finalStatus,
      completedAt,
      assetsDiscovered: counters.discovered,
      assetsCreated:    counters.created,
      assetsUpdated:    counters.updated,
      assetsSkipped:    counters.skipped,
      assetsFailed:     counters.failed,
      assetsStale:      counters.stale,
      errorMessage:     topLevelError,
    },
  });

  // Update connector-level stats
  await prisma.discoveryConnector.update({
    where: { id: run.connectorId },
    data:  {
      lastSyncAt:  completedAt,
      totalSynced: { increment: counters.created },
    },
  });

  return {
    syncRunId,
    status:           finalStatus,
    assetsDiscovered: counters.discovered,
    assetsCreated:    counters.created,
    assetsUpdated:    counters.updated,
    assetsSkipped:    counters.skipped,
    assetsFailed:     counters.failed,
    assetsStale:      counters.stale,
    errorMessage:     topLevelError,
    durationMs,
  };
}

// ── Create + run helper (used for CSV imports) ────────────────────────────────

/**
 * Creates a DiscoverySyncRun and runs it inline (synchronous, no job queue).
 * Intended for CSV imports triggered directly from the HTTP request.
 */
export async function createAndRunSync(opts: {
  connectorId:  number;
  source:       string;
  triggerType:  "manual" | "import" | "schedule";
  triggeredByUserId?: string;
  csvContent?:  string;
}): Promise<SyncRunResult> {
  const run = await prisma.discoverySyncRun.create({
    data: {
      connectorId:      opts.connectorId,
      source:           opts.source,
      triggerType:      opts.triggerType,
      triggeredByUserId: opts.triggeredByUserId,
      status:           "pending",
    },
    select: { id: true },
  });

  return runDiscoverySync(run.id, opts.csvContent);
}
