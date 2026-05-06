/**
 * Maintenance-mode gate.
 *
 * When `advanced.maintenanceMode` is true, all non-admin authenticated traffic
 * is short-circuited with a 503 + JSON envelope so SPA clients can render a
 * banner. Admin-role users are always allowed through so they can monitor or
 * abort an in-flight update.
 *
 * Whitelisted paths
 * ─────────────────
 * Auth, SSE health stream, the updates page, and the maintenance flag itself
 * remain reachable so an admin can sign in, watch progress, and toggle the
 * flag back off if something went wrong.
 *
 * Caching
 * ───────
 * Reads the flag from a 5-second in-memory cache to avoid hammering the DB
 * on every request. Toggling the flag picks up within 5 s.
 */
import type { Request, Response, NextFunction } from "express";
import { getSection } from "../lib/settings";

const CACHE_TTL_MS = 5_000;

let cached: { enabled: boolean; message: string; expiresAt: number } | null = null;

async function readMaintenance(): Promise<{ enabled: boolean; message: string }> {
  if (cached && Date.now() < cached.expiresAt) {
    return { enabled: cached.enabled, message: cached.message };
  }
  const adv = await getSection("advanced");
  cached = {
    enabled:   adv.maintenanceMode,
    message:   adv.maintenanceMessage || "We're applying an update — check back in a few minutes.",
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  return cached;
}

/** Drop the cache so a flag flip takes effect immediately. */
export function invalidateMaintenanceCache() { cached = null; }

const ALLOWLIST_PREFIXES = [
  "/api/auth",          // login, session checks
  "/api/me",            // current-user info for the banner
  "/api/updates",       // updates page itself
  "/api/sse",           // live progress
  "/api/settings/advanced", // toggle the flag back off
];

function isAllowlisted(p: string): boolean {
  return ALLOWLIST_PREFIXES.some(prefix => p === prefix || p.startsWith(prefix + "/"));
}

export async function maintenanceMode(req: Request, res: Response, next: NextFunction) {
  // Static assets and the SPA shell itself aren't behind /api — only gate the API.
  if (!req.path.startsWith("/api/")) return next();
  if (isAllowlisted(req.path))       return next();

  const flag = await readMaintenance();
  if (!flag.enabled) return next();

  // Admins always pass through. requireAuth has already populated req.user
  // for protected routes; for unauth paths the role check just falls through.
  const role = (req as Request & { user?: { role?: string } }).user?.role;
  if (role === "admin") return next();

  res.status(503).json({
    error:   "maintenance_mode",
    message: flag.message,
    retryAfter: 60,
  });
}
