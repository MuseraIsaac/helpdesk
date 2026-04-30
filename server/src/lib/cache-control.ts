/**
 * Browser cache helpers for read-only dictionary endpoints.
 *
 * The agent UI fetches the same lookup tables (teams, agents, roles,
 * ticket-types, ticket-status-configs) from many components. With no
 * cache headers, every page navigation forces a fresh round-trip to
 * the remote DB even though the data changes a few times per hour at
 * most.
 *
 * Usage in a route handler:
 *   import { setShortCache } from "../lib/cache-control";
 *   router.get("/", requireAuth, async (req, res) => {
 *     setShortCache(res);                  // 5 min, private
 *     res.json({ teams: ... });
 *   });
 *
 * `private` keeps the response out of any shared CDN cache so user-
 * specific data (filtered by role/team) isn't served to the wrong user.
 * `must-revalidate` forces the browser to re-validate after `max-age`
 * elapses rather than reusing stale data indefinitely.
 */
import type { Response } from "express";

/** 5 min — for things that change a few times per hour (teams, agents, roles). */
export function setShortCache(res: Response): void {
  res.setHeader("Cache-Control", "private, max-age=300, must-revalidate");
}

/** 10 min — for things that change a few times per day (ticket types, statuses). */
export function setMediumCache(res: Response): void {
  res.setHeader("Cache-Control", "private, max-age=600, must-revalidate");
}

/** 1 hour — for static-ish lookup data (permission catalog, branding). */
export function setLongCache(res: Response): void {
  res.setHeader("Cache-Control", "private, max-age=3600, must-revalidate");
}
