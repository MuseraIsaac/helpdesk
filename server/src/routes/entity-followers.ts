/**
 * Entity follower routes — generic factory mounted per ITSM module.
 *
 * POST   /     — follow  (idempotent upsert)
 * DELETE /     — unfollow
 * GET    /me   — { following: boolean, followedAt }
 * GET    /     — list all followers (for admin display)
 *
 * Mount with mergeParams:true so :entityId is available.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { parseId } from "../lib/parse-id";
import prisma from "../db";
import type { EntityFollowerType } from "../generated/prisma/client";

export function createEntityFollowersRouter(entityType: EntityFollowerType) {
  const router = Router({ mergeParams: true });

  // ── GET /me ──────────────────────────────────────────────────────────────────
  router.get("/me", requireAuth, async (req, res) => {
    const entityId = parseId((req.params as Record<string, string>)["entityId"]);
    if (!entityId) { res.status(400).json({ error: "Invalid ID" }); return; }

    const row = await prisma.entityFollower.findUnique({
      where: { entityType_entityId_userId: { entityType, entityId, userId: req.user.id } },
      select: { createdAt: true },
    });

    res.json({ following: row !== null, followedAt: row?.createdAt ?? null });
  });

  // ── GET / — list followers ────────────────────────────────────────────────────
  router.get("/", requireAuth, async (req, res) => {
    const entityId = parseId((req.params as Record<string, string>)["entityId"]);
    if (!entityId) { res.status(400).json({ error: "Invalid ID" }); return; }

    const followers = await prisma.entityFollower.findMany({
      where: { entityType, entityId },
      select: {
        user: { select: { id: true, name: true, email: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    res.json({ followers: followers.map((f) => ({ ...f.user, followedAt: f.createdAt })) });
  });

  // ── POST / — follow ───────────────────────────────────────────────────────────
  router.post("/", requireAuth, async (req, res) => {
    const entityId = parseId((req.params as Record<string, string>)["entityId"]);
    if (!entityId) { res.status(400).json({ error: "Invalid ID" }); return; }

    await prisma.entityFollower.upsert({
      where: { entityType_entityId_userId: { entityType, entityId, userId: req.user.id } },
      create: { entityType, entityId, userId: req.user.id },
      update: {},
    });

    res.status(201).json({ following: true });
  });

  // ── DELETE / — unfollow ───────────────────────────────────────────────────────
  router.delete("/", requireAuth, async (req, res) => {
    const entityId = parseId((req.params as Record<string, string>)["entityId"]);
    if (!entityId) { res.status(400).json({ error: "Invalid ID" }); return; }

    await prisma.entityFollower.deleteMany({
      where: { entityType, entityId, userId: req.user.id },
    });

    res.json({ following: false });
  });

  return router;
}
