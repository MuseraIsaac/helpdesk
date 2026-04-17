import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { parseId } from "../lib/parse-id";
import prisma from "../db";

const router = Router();

/**
 * GET /api/workflows
 *
 * Returns all workflow definitions (enabled and disabled).
 * Gated behind workflows.view — admins and supervisors only.
 */
router.get(
  "/",
  requireAuth,
  requirePermission("workflows.view"),
  async (req, res) => {
    const workflows = await prisma.workflowDefinition.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        isEnabled: true,
        triggers: true,
        conditions: true,
        actions: true,
        migratedFromRuleId: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        createdById: true,
        updatedById: true,
        _count: { select: { executions: true } },
      },
    });
    res.json({ workflows });
  }
);

/**
 * GET /api/workflows/:id
 *
 * Returns a single workflow definition with recent execution history.
 */
router.get(
  "/:id",
  requireAuth,
  requirePermission("workflows.view"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid workflow ID" });
      return;
    }

    const workflow = await prisma.workflowDefinition.findUnique({
      where: { id },
      include: {
        executions: {
          orderBy: { startedAt: "desc" },
          take: 50,
          include: {
            steps: { orderBy: { id: "asc" } },
          },
        },
      },
    });

    if (!workflow) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }

    res.json({ workflow });
  }
);

export default router;
