import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { parseId } from "../lib/parse-id";
import prisma from "../db";

const router = Router();

/**
 * GET /api/customers/:id
 * Returns a customer profile with their organization and full ticket history
 * (most-recent first, up to 50 tickets).
 * Accessible by any authenticated agent/admin.
 */
router.get("/:id", requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid customer ID" });
    return;
  }

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      organization: true,
      tickets: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          subject: true,
          status: true,
          priority: true,
          category: true,
          slaBreached: true,
          isEscalated: true,
          createdAt: true,
          resolvedAt: true,
        },
      },
    },
  });

  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  res.json({ customer });
});

export default router;
