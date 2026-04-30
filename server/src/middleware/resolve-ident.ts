/**
 * resolveIdent — URL prefix middleware that lets entity routes accept either
 * a numeric primary-key ID or a human-readable number (e.g. TKT-456,
 * DEMO-INC-0007, REQ-12) interchangeably.
 *
 * Mounted at `/api/<entity>` BEFORE the entity router. When the next URL
 * segment doesn't look like a plain number, it's resolved against the given
 * `numberField` and the URL is rewritten to use the numeric ID. Downstream
 * handlers continue using `req.params.id` (or `req.params.<entity>Id` for
 * sub-routes) unchanged.
 *
 * Examples (with the ticket resolver mounted at `/api/tickets`):
 *
 *   GET /api/tickets/49            → unchanged, hits handler with id=49
 *   GET /api/tickets/TKT-456       → rewrite to /49, hits handler with id=49
 *   GET /api/tickets/TKT-456/notes → rewrite to /49/notes
 *   GET /api/tickets               → unchanged (no segment to resolve)
 *   GET /api/tickets/search        → unchanged (doesn't match number shape)
 *
 * Cost: one regex per request; one Prisma `findFirst` only when the segment
 * is non-numeric. Existing internal navigation (numeric IDs) pays nothing.
 */

import type { Request, Response, NextFunction } from "express";

/**
 * Heuristic for "this looks like an entity number" — must start with a letter
 * and contain at least one digit. Catches TKT-456, REQ-12, DEMO-PRB-0003,
 * CI-001 etc. while letting through bare paths like `search`, `bulk`, `me`.
 */
const IDENT_LIKE = /^[A-Za-z][A-Za-z0-9-]*\d/;

export function resolveIdent(
  resolver: (raw: string) => Promise<number | null>,
): (req: Request, res: Response, next: NextFunction) => void {
  return async (req, res, next) => {
    // req.url at this mount level is the path *after* the mount prefix —
    // for /api/tickets/TKT-456/replies it's "/TKT-456/replies".
    const m = req.url.match(/^\/([^/?]+)(.*)$/);
    if (!m) return next();

    const raw = m[1]!;
    const rest = m[2] ?? "";

    if (/^\d+$/.test(raw)) return next();   // already a numeric ID
    if (!IDENT_LIKE.test(raw)) return next(); // not a number-like segment

    try {
      const id = await resolver(raw);
      if (id == null) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      req.url = `/${id}${rest}`;
      next();
    } catch (err) {
      next(err);
    }
  };
}
