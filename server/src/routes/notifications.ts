import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { parseId } from "../lib/parse-id";
import prisma from "../db";

const router = Router();

// All notification routes require authentication
router.use(requireAuth);

const NOTIFICATION_SELECT = {
  id:         true,
  event:      true,
  title:      true,
  body:       true,
  entityType: true,
  entityId:   true,
  entityUrl:  true,
  readAt:     true,
  createdAt:  true,
} as const;

// ── GET /api/notifications ─────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  const unreadOnly = req.query.unread === "true";
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const cursor = req.query.cursor ? Number(req.query.cursor) : undefined;

  const where = {
    userId: req.user.id,
    ...(unreadOnly ? { readAt: null } : {}),
    ...(cursor ? { id: { lt: cursor } } : {}),
  };

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    select: NOTIFICATION_SELECT,
  });

  const hasMore = notifications.length > limit;
  const items = hasMore ? notifications.slice(0, limit) : notifications;
  const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

  res.json({ notifications: items, hasMore, nextCursor });
});

// ── GET /api/notifications/unread-count ────────────────────────────────────────

router.get("/unread-count", async (req, res) => {
  const count = await prisma.notification.count({
    where: { userId: req.user.id, readAt: null },
  });

  res.json({ count });
});

// ── PATCH /api/notifications/:id/read ─────────────────────────────────────────

router.patch("/:id/read", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const notification = await prisma.notification.findUnique({
    where: { id },
    select: { id: true, userId: true, readAt: true },
  });

  if (!notification || notification.userId !== req.user.id) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  if (notification.readAt) {
    res.json({ ok: true }); // already read, idempotent
    return;
  }

  await prisma.notification.update({
    where: { id },
    data: { readAt: new Date() },
  });

  res.json({ ok: true });
});

// ── POST /api/notifications/read-all ──────────────────────────────────────────

router.post("/read-all", async (req, res) => {
  const result = await prisma.notification.updateMany({
    where: { userId: req.user.id, readAt: null },
    data: { readAt: new Date() },
  });

  res.json({ ok: true, count: result.count });
});

// ── DELETE /api/notifications/:id ─────────────────────────────────────────────

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const notification = await prisma.notification.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });

  if (!notification || notification.userId !== req.user.id) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  await prisma.notification.delete({ where: { id } });

  res.json({ ok: true });
});

export default router;
