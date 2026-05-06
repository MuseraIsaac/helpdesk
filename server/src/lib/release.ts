/**
 * Release-manifest loader and install-history recorder.
 *
 * Responsibilities
 * ─────────────────
 *  1. Read the bundled `release.json` from the repo root and parse/validate it.
 *  2. On boot, compare the bundled version against the most-recent app_version
 *     row and append a new row when the binary on disk has changed (install /
 *     upgrade / downgrade). This is the persistent record of "what version is
 *     actually running here".
 *  3. Provide helpers the routes/UI use to read both the bundled manifest and
 *     the current install record.
 *
 * Failure policy
 * ──────────────
 * A missing or malformed `release.json` is non-fatal — we log and treat the
 * build as version "0.0.0-unbuilt" so dev environments without a manifest
 * still boot. The Updates page will surface the warning to admins.
 */
import path from "path";
import fs   from "fs/promises";
import { releaseManifestSchema, type ReleaseManifest } from "core/schemas/updates.ts";
import prisma from "../db";
import Sentry from "./sentry";

// ── Manifest loading ─────────────────────────────────────────────────────────

const FALLBACK_MANIFEST: ReleaseManifest = {
  version:                  "0.0.0-unbuilt",
  channel:                  "stable",
  schemaMigrations:         [],
  dataTasks:                [],
  breakingChanges:          [],
  highlights:               [],
  requiresMaintenanceWindow: false,
  estimatedDurationMinutes:  0,
};

let _cached: ReleaseManifest | null = null;

/**
 * Locate `release.json`. The file lives at the *repo* root (one level up
 * from `server/`); when the project is bundled into a single working
 * directory (Docker), it sits next to package.json there too. We try both.
 */
async function locateManifestFile(): Promise<string | null> {
  const candidates = [
    path.resolve(process.cwd(), "release.json"),         // launched from server/
    path.resolve(process.cwd(), "..", "release.json"),   // launched from repo root
    path.resolve(import.meta.dir, "../../../release.json"),
  ];
  for (const p of candidates) {
    try {
      await fs.access(p);
      return p;
    } catch { /* try next */ }
  }
  return null;
}

/** Read and validate the bundled `release.json`. Cached for the process lifetime. */
export async function loadBundledManifest(): Promise<ReleaseManifest> {
  if (_cached) return _cached;
  const file = await locateManifestFile();
  if (!file) {
    console.warn("[release] No release.json found — using fallback manifest");
    _cached = FALLBACK_MANIFEST;
    return _cached;
  }
  try {
    const raw    = await fs.readFile(file, "utf8");
    const parsed = releaseManifestSchema.parse(JSON.parse(raw));
    _cached = parsed;
    return parsed;
  } catch (err) {
    console.error("[release] Failed to parse release.json — using fallback:", err);
    Sentry.captureException(err, { tags: { context: "release-manifest" } });
    _cached = FALLBACK_MANIFEST;
    return _cached;
  }
}

/** Drop the in-memory cache. Used by tests; not exposed to routes. */
export function _resetReleaseCache(): void { _cached = null; }

// ── Install-history recording ────────────────────────────────────────────────

/**
 * On every boot, compare the bundled version with the most-recent app_version
 * row and append a transition row when they differ.
 *
 * Idempotent: if the version on disk matches the latest recorded row, no new
 * row is written. Re-running on the same version is a no-op.
 */
export async function recordBootVersion(): Promise<void> {
  let manifest: ReleaseManifest;
  try {
    manifest = await loadBundledManifest();
  } catch (err) {
    // loadBundledManifest already swallows errors; this is just defensive.
    Sentry.captureException(err);
    return;
  }

  try {
    const latest = await prisma.appVersion.findFirst({
      orderBy: { appliedAt: "desc" },
      select:  { id: true, version: true },
    });

    if (!latest) {
      await prisma.appVersion.create({
        data: {
          version:     manifest.version,
          kind:        "install",
          fromVersion: null,
          manifest:    manifest as object,
        },
      });
      console.log(`[release] Recorded initial install: ${manifest.version}`);
      return;
    }

    if (latest.version === manifest.version) {
      // Same version booted again — no transition. Common case; don't spam.
      return;
    }

    const kind = compareSemver(manifest.version, latest.version);
    await prisma.appVersion.create({
      data: {
        version:     manifest.version,
        kind,
        fromVersion: latest.version,
        manifest:    manifest as object,
      },
    });
    console.log(`[release] Recorded ${kind}: ${latest.version} → ${manifest.version}`);
  } catch (err) {
    // Don't crash boot just because we couldn't write the history row.
    console.error("[release] Failed to record boot version:", err);
    Sentry.captureException(err, { tags: { context: "release-history" } });
  }
}

/**
 * Return the most recent `app_version` row. The applied-by user is fetched
 * separately by callers (the schema doesn't yet model the FK relation).
 */
export async function getInstalledVersion() {
  return prisma.appVersion.findFirst({
    orderBy: { appliedAt: "desc" },
  });
}

// ── semver helpers ───────────────────────────────────────────────────────────

/**
 * Compare two semver-ish strings and decide the transition kind.
 * Pre-release suffixes are ignored (sorted before the release proper would
 * require a full implementation; we don't need that nuance yet).
 */
export function compareSemver(next: string, prev: string): "upgrade" | "downgrade" | "reinstall" {
  const [aMaj, aMin, aPatch] = parseSemver(next);
  const [bMaj, bMin, bPatch] = parseSemver(prev);
  if (aMaj !== bMaj)     return aMaj   > bMaj   ? "upgrade" : "downgrade";
  if (aMin !== bMin)     return aMin   > bMin   ? "upgrade" : "downgrade";
  if (aPatch !== bPatch) return aPatch > bPatch ? "upgrade" : "downgrade";
  return "reinstall";
}

function parseSemver(s: string): [number, number, number] {
  const main = s.split("-")[0] ?? "0.0.0";
  const parts = main.split(".").map(p => Number(p) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}
