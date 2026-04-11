import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import prisma from "../db";

const router = Router();

router.use(requireAuth);

// GET /api/csat/summary — aggregate CSAT metrics for the dashboard
router.get("/summary", async (_req, res) => {
  const [ratings, resolvedCount] = await Promise.all([
    prisma.csatRating.findMany({
      select: {
        id: true,
        rating: true,
        comment: true,
        submittedAt: true,
        ticket: { select: { id: true, subject: true } },
      },
      orderBy: { submittedAt: "desc" },
    }),
    prisma.ticket.count({
      where: { status: { in: ["resolved", "closed"] } },
    }),
  ]);

  const total = ratings.length;
  const avgRating = total > 0
    ? Math.round((ratings.reduce((s, r) => s + r.rating, 0) / total) * 10) / 10
    : null;
  const positiveCount = ratings.filter((r) => r.rating >= 4).length;
  const negativeCount = ratings.filter((r) => r.rating <= 2).length;
  const responseRate = resolvedCount > 0
    ? Math.round((total / resolvedCount) * 100)
    : 0;

  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of ratings) distribution[r.rating] = (distribution[r.rating] ?? 0) + 1;

  const recentRatings = ratings.slice(0, 10).map((r) => ({
    id: r.id,
    ticketId: r.ticket.id,
    ticketSubject: r.ticket.subject,
    rating: r.rating,
    comment: r.comment,
    submittedAt: r.submittedAt,
  }));

  res.json({
    totalRatings: total,
    avgRating,
    positiveRate: total > 0 ? Math.round((positiveCount / total) * 100) : null,
    negativeRate: total > 0 ? Math.round((negativeCount / total) * 100) : null,
    responseRate,
    distribution,
    recentRatings,
  });
});

export default router;
