import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import prisma from "../db";
import { AI_AGENT_ID } from "core/constants/ai-agent.ts";
import { setShortCache } from "../lib/cache-control";

const router = Router();

router.get("/", requireAuth, async (_req, res) => {
  setShortCache(res);
  const agents = await prisma.user.findMany({
    where: {
      deletedAt: null,
      id:   { not: AI_AGENT_ID },
      role: { not: "customer" },   // customers are portal users, not team agents
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  res.json({ agents });
});

export default router;
