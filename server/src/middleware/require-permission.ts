import type { RequestHandler } from "express";
import { can, type Permission } from "core/constants/permission.ts";

/**
 * Middleware factory that enforces a single permission.
 * Must be used after requireAuth (which sets req.user).
 */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, res, next) => {
    if (!req.user || !can(req.user.role, permission)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
