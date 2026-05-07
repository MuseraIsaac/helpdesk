import type { RequestHandler } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth";
import { getSection } from "../lib/settings";
import prisma from "../db";

// ── Settings cache ───────────────────────────────────────────────────────────
//
// Reading the security section from the DB on every authenticated request is
// wasteful — admins change it rarely, but it's read on every API call. Cache
// for a few seconds so changes still propagate quickly without spamming the DB.
const SETTINGS_TTL_MS = 5_000;
let cached: { fetchedAt: number; enforceSessionTimeout: boolean; sessionTimeoutMinutes: number } | null = null;

async function getSessionTimeoutPolicy() {
  const now = Date.now();
  if (cached && now - cached.fetchedAt < SETTINGS_TTL_MS) return cached;
  const security = await getSection("security");
  cached = {
    fetchedAt: now,
    enforceSessionTimeout: security.enforceSessionTimeout ?? false,
    sessionTimeoutMinutes: security.sessionTimeoutMinutes ?? 1440,
  };
  return cached;
}

export const requireAuth: RequestHandler = async (req, res, next) => {
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

  // Customer accounts belong to the portal — block them from agent routes.
  if (session.user.role === "customer") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // ── Idle session enforcement ──────────────────────────────────────────────
  // Better Auth refreshes `session.updatedAt` whenever the cookie is touched
  // (typically on each authenticated request). When admins enable
  // `enforceSessionTimeout`, we treat that timestamp as "last activity" and
  // boot sessions that have been idle past the configured window.
  const policy = await getSessionTimeoutPolicy();
  if (policy.enforceSessionTimeout) {
    const lastActiveAt = session.session.updatedAt
      ? new Date(session.session.updatedAt).getTime()
      : null;
    if (lastActiveAt != null) {
      const idleMs   = Date.now() - lastActiveAt;
      const limitMs  = policy.sessionTimeoutMinutes * 60_000;
      if (idleMs > limitMs) {
        // Delete the session row so the cookie is dead even if the client
        // ignores the 401. Best-effort — failure shouldn't block the response.
        try {
          await prisma.session.delete({ where: { id: session.session.id } });
        } catch { /* already gone */ }
        res.status(401).json({ error: "Session expired", reason: "idle_timeout" });
        return;
      }
    }
  }

  req.user = session.user;
  req.session = session.session;
  next();
};
