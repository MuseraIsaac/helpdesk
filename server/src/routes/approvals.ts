import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import {
  createApprovalSchema,
  approvalDecisionSchema,
  listApprovalsQuerySchema,
} from "core/schemas/approvals.ts";
import {
  createApproval,
  decide,
  cancelApproval,
} from "../lib/approval-engine";
import { fireApprovalHook } from "../lib/approval-hooks";
import { getSection } from "../lib/settings";
import { fireChangeEvent, fireRequestEvent } from "../lib/event-bus";
import { logSystemAudit } from "../lib/audit";
import prisma from "../db";
import Sentry from "../lib/sentry";

const router = Router();

// ── Shared select projection ───────────────────────────────────────────────────

const STEP_SELECT = {
  id: true,
  stepOrder: true,
  status: true,
  isActive: true,
  dueAt: true,
  createdAt: true,
  approver: { select: { id: true, name: true, email: true } },
  decisions: {
    select: {
      id: true,
      decision: true,
      comment: true,
      decidedAt: true,
      decidedBy: { select: { id: true, name: true } },
    },
  },
} as const;

const REQUEST_SELECT = {
  id: true,
  subjectType: true,
  subjectId: true,
  title: true,
  description: true,
  status: true,
  approvalMode: true,
  requiredCount: true,
  expiresAt: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
  requestedBy: { select: { id: true, name: true, email: true } },
  steps: {
    orderBy: { stepOrder: "asc" as const },
    select: STEP_SELECT,
  },
} as const;

// ── POST /api/approvals — create a new approval request ──────────────────────

router.post(
  "/",
  requireAuth,
  requirePermission("approvals.view"),
  async (req, res) => {
    const input = validate(createApprovalSchema, req.body, res);
    if (!input) return;

    // Verify all approver IDs exist
    const approvers = await prisma.user.findMany({
      where: { id: { in: input.approverIds }, deletedAt: null },
      select: { id: true },
    });
    if (approvers.length !== input.approverIds.length) {
      res.status(400).json({ error: "One or more approver user IDs are invalid" });
      return;
    }

    const result = await createApproval(input, req.user.id);
    const full = await prisma.approvalRequest.findUnique({
      where: { id: result.approvalRequest.id },
      select: REQUEST_SELECT,
    });

    void logSystemAudit(req.user.id, "approval.requested", {
      entityType: "approval", entityId: result.approvalRequest.id, entityNumber: `APR-${result.approvalRequest.id}`,
      subjectType: input.subjectType, subjectId: input.subjectId, title: input.title,
    });

    res.status(201).json({ approvalRequest: full });
  }
);

// ── GET /api/approvals — list approvals ───────────────────────────────────────

router.get(
  "/",
  requireAuth,
  requirePermission("approvals.view"),
  async (req, res) => {
    const query = validate(listApprovalsQuerySchema, req.query, res);
    if (!query) return;

    const { status, subjectType, scope, page, limit } = query;
    const isAdmin = req.user.role === "admin" || req.user.role === "supervisor";

    // "all" scope requires elevated permission
    if (scope === "all" && !isAdmin) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (subjectType) where.subjectType = subjectType;

    // "mine" = requests where I have an assigned step
    if (scope === "mine") {
      where.steps = { some: { approverId: req.user.id } };
    }

    const [total, requests] = await prisma.$transaction([
      prisma.approvalRequest.count({ where }),
      prisma.approvalRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: REQUEST_SELECT,
      }),
    ]);

    res.json({
      approvalRequests: requests,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  }
);

// ── GET /api/approvals/:id — fetch single approval with history ───────────────

router.get(
  "/:id",
  requireAuth,
  requirePermission("approvals.view"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid approval ID" });
      return;
    }

    const request = await prisma.approvalRequest.findUnique({
      where: { id },
      select: {
        ...REQUEST_SELECT,
        events: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            action: true,
            meta: true,
            createdAt: true,
            actor: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!request) {
      res.status(404).json({ error: "Approval request not found" });
      return;
    }

    // Non-admin can only view if they're an approver or the requester
    const isAdmin = req.user.role === "admin" || req.user.role === "supervisor";
    const isInvolved =
      request.requestedBy?.id === req.user.id ||
      request.steps.some((s) => s.approver.id === req.user.id);

    if (!isAdmin && !isInvolved) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    res.json({ approvalRequest: request });
  }
);

// ── POST /api/approvals/:id/decide — approve or reject ───────────────────────

router.post(
  "/:id/decide",
  requireAuth,
  requirePermission("approvals.respond"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid approval ID" });
      return;
    }

    const input = validate(approvalDecisionSchema, req.body, res);
    if (!input) return;

    // Load the subjectType/subjectId before mutating so we can fire the hook
    const approvalMeta = await prisma.approvalRequest.findUnique({
      where: { id },
      select: { subjectType: true, subjectId: true },
    });

    const result = await decide(id, req.user.id, input.decision, input.comment);

    if (result.outcome === "error") {
      res.status(422).json({ error: result.message });
      return;
    }

    // For change_request approvals: if the stored requiredCount is stale (higher
    // than the current minCabApprovers setting) and the threshold is already met,
    // approve the request immediately rather than waiting for the old count.
    if (
      result.outcome === "decision_recorded" &&
      result.requestStatus === "pending" &&
      approvalMeta?.subjectType === "change_request"
    ) {
      try {
        const { minCabApprovers } = await getSection("changes");
        const freshSteps = await prisma.approvalStep.findMany({
          where: { approvalRequestId: id },
          select: { id: true, status: true },
        });
        const approvedCount = freshSteps.filter((s) => s.status === "approved").length;
        if (approvedCount >= minCabApprovers) {
          const remainingIds = freshSteps.filter((s) => s.status === "pending").map((s) => s.id);
          await prisma.$transaction([
            ...(remainingIds.length > 0
              ? [prisma.approvalStep.updateMany({
                  where: { id: { in: remainingIds } },
                  data: { status: "skipped", isActive: false },
                })]
              : []),
            prisma.approvalRequest.update({
              where: { id },
              data: { status: "approved", requiredCount: minCabApprovers, resolvedAt: new Date() },
            }),
          ]);
          // Patch result so hook fires below
          (result as { requestStatus: string }).requestStatus = "approved";
        }
      } catch (err) {
        Sentry.captureException(err, { tags: { context: "recheck_min_cab_approvers", approvalId: id } });
      }
    }

    // Log individual CAB member decision to the change activity stream
    if (approvalMeta?.subjectType === "change_request") {
      const changeId = parseInt(approvalMeta.subjectId, 10);
      if (!isNaN(changeId)) {
        const actor = await prisma.user.findUnique({
          where: { id: req.user.id },
          select: { name: true },
        });
        const action = input.decision === "approved"
          ? "change.step_approved"
          : "change.step_rejected";
        prisma.changeEvent.create({
          data: {
            changeId,
            actorId: req.user.id,
            action,
            meta: {
              approverName: actor?.name ?? req.user.id,
              decision: input.decision,
              comment: input.comment ?? null,
              approvalRequestId: id,
            },
          },
        }).catch((err) => {
          Sentry.captureException(err, { tags: { context: "log_step_decision", changeId } });
          console.error("[approvals] Failed to log step decision for change:", err);
        });
      }
    }

    // Fire subject-specific hook when the request reaches a final state
    const finalStatuses = ["approved", "rejected"] as const;
    if (
      approvalMeta &&
      finalStatuses.includes(result.requestStatus as (typeof finalStatuses)[number])
    ) {
      const outcome = result.requestStatus as "approved" | "rejected";

      void fireApprovalHook(
        approvalMeta.subjectType,
        id,
        approvalMeta.subjectId,
        outcome,
      );

      // Fire entity-specific event_workflow events on approval outcome
      if (approvalMeta.subjectType === "change" && approvalMeta.subjectId) {
        const trigger = outcome === "approved" ? "change.approved" : "change.rejected";
        fireChangeEvent(trigger as any, Number(approvalMeta.subjectId), req.user.id);
      } else if (
        (approvalMeta.subjectType === "service_request" || approvalMeta.subjectType === "request") &&
        approvalMeta.subjectId
      ) {
        const trigger = outcome === "approved" ? "request.approved" : "request.rejected";
        fireRequestEvent(trigger as any, Number(approvalMeta.subjectId), req.user.id);
      }
    }

    const updated = await prisma.approvalRequest.findUnique({
      where: { id },
      select: REQUEST_SELECT,
    });

    // Log final decision to global audit log
    const finalStatuses2 = ["approved", "rejected"] as const;
    if (approvalMeta && finalStatuses2.includes(result.requestStatus as (typeof finalStatuses2)[number])) {
      const auditAction = result.requestStatus === "approved" ? "approval.approved" : "approval.rejected" as const;
      void logSystemAudit(req.user.id, auditAction, {
        entityType: "approval", entityId: id, entityNumber: `APR-${id}`,
        subjectType: approvalMeta.subjectType, subjectId: approvalMeta.subjectId,
        decidedBy: req.user.id, comment: input.comment ?? null,
      });
    }

    res.json({ approvalRequest: updated, requestStatus: result.requestStatus });
  }
);

// ── POST /api/approvals/:id/cancel ────────────────────────────────────────────

router.post(
  "/:id/cancel",
  requireAuth,
  requirePermission("approvals.view"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid approval ID" });
      return;
    }

    // Only the requester or admin/supervisor can cancel
    const request = await prisma.approvalRequest.findUnique({
      where: { id },
      select: { requestedById: true, status: true },
    });
    if (!request) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const isAdmin = req.user.role === "admin" || req.user.role === "supervisor";
    if (!isAdmin && request.requestedById !== req.user.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Load subjectType/subjectId before mutating for the hook
    const cancelMeta = await prisma.approvalRequest.findUnique({
      where: { id },
      select: { subjectType: true, subjectId: true },
    });

    const result = await cancelApproval(id, req.user.id);
    if (!result.ok) {
      res.status(422).json({ error: result.message });
      return;
    }

    if (cancelMeta) {
      void fireApprovalHook(cancelMeta.subjectType, id, cancelMeta.subjectId, "cancelled");
    }

    res.json({ ok: true });
  }
);

export default router;
