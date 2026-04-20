/**
 * Ticket-follower routes — mounted at /api/tickets/:ticketId/followers
 *
 * POST   /        — follow a ticket (idempotent upsert)
 * DELETE /        — unfollow a ticket
 * GET    /me      — returns { following: boolean } for the current user
 * GET    /        — list all followers (agents) of a ticket (admin/supervisor)
 */

import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { parseId } from "../lib/parse-id";
import prisma from "../db";

const router = Router({ mergeParams: true });

// ── GET /me — is the current agent following this ticket? ─────────────────────

router.get("/me", requireAuth, async (req, res) => {
  const ticketId = parseId((req.params as Record<string, string>)["ticketId"]);
  if (!ticketId) { res.status(400).json({ error: "Invalid ticket ID" }); return; }

  const row = await prisma.ticketFollower.findUnique({
    where: { ticketId_userId: { ticketId, userId: req.user.id } },
    select: { createdAt: true },
  });

  res.json({ following: row !== null, followedAt: row?.createdAt ?? null });
});

// ── GET / — list followers (agents) of a ticket ────────────────────────────────

router.get("/", requireAuth, async (req, res) => {
  const ticketId = parseId((req.params as Record<string, string>)["ticketId"]);
  if (!ticketId) { res.status(400).json({ error: "Invalid ticket ID" }); return; }

  const followers = await prisma.ticketFollower.findMany({
    where: { ticketId },
    select: {
      user: { select: { id: true, name: true, email: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  res.json({ followers: followers.map((f) => ({ ...f.user, followedAt: f.createdAt })) });
});

// ── POST / — follow a ticket ──────────────────────────────────────────────────

router.post("/", requireAuth, async (req, res) => {
  const ticketId = parseId((req.params as Record<string, string>)["ticketId"]);
  if (!ticketId) { res.status(400).json({ error: "Invalid ticket ID" }); return; }

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true } });
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }

  await prisma.ticketFollower.upsert({
    where: { ticketId_userId: { ticketId, userId: req.user.id } },
    create: { ticketId, userId: req.user.id },
    update: {},
  });

  res.status(201).json({ following: true });
});

// ── DELETE / — unfollow a ticket ──────────────────────────────────────────────

router.delete("/", requireAuth, async (req, res) => {
  const ticketId = parseId((req.params as Record<string, string>)["ticketId"]);
  if (!ticketId) { res.status(400).json({ error: "Invalid ticket ID" }); return; }

  await prisma.ticketFollower.deleteMany({
    where: { ticketId, userId: req.user.id },
  });

  res.json({ following: false });
});

export default router;
