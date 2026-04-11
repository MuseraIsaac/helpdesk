import type { RequestHandler } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth";

/**
 * Middleware for customer portal routes.
 * Requires a valid session with role === "customer".
 * Agent and admin accounts are explicitly rejected (403).
 */
export const requireCustomer: RequestHandler = async (req, res, next) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (session.user.deletedAt) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (session.user.role !== "customer") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  req.user = session.user;
  req.session = session.session;
  next();
};
