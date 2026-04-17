/**
 * Approval Engine
 *
 * Pure business logic for the approval workflow. All DB writes go through this
 * module — route handlers call these functions, never touching Prisma directly
 * for approval state transitions.
 *
 * Multi-step model:
 *  - Each approver maps to one ApprovalStep.
 *  - stepOrder controls sequence: steps with the same order run in parallel;
 *    higher-order steps only activate once all lower-order steps complete.
 *  - approvalMode "all": every step must be approved (in order) for the request
 *    to be approved. Any rejection short-circuits to rejected.
 *  - approvalMode "any": once requiredCount approvals are collected (across any
 *    steps), the request is approved. Remaining steps are skipped.
 *
 * Audit:
 *  - Every state transition writes an ApprovalEvent row (append-only log).
 *  - Failures are best-effort (never throw from logApprovalEvent).
 */

import prisma from "../db";
import Sentry from "./sentry";
import type { CreateApprovalInput } from "core/schemas/approvals.ts";
import type { Prisma } from "../generated/prisma/client";

// ── Audit helper ───────────────────────────────────────────────────────────────

export async function logApprovalEvent(
  approvalRequestId: number,
  actorId: string | null,
  action: string,
  meta: Record<string, unknown> = {}
): Promise<void> {
  try {
    await prisma.approvalEvent.create({
      data: {
        approvalRequestId,
        actorId,
        action,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { context: "approval_audit", approvalRequestId, action },
    });
    console.error(`[approval] Failed to log event "${action}" for request ${approvalRequestId}:`, err);
  }
}

// ── Create ─────────────────────────────────────────────────────────────────────

export interface CreateApprovalResult {
  approvalRequest: { id: number };
}

/**
 * Create a new ApprovalRequest with one ApprovalStep per approver.
 * Steps are created with stepOrder matching the position in approverIds array
 * (index 0 → stepOrder 1, index 1 → stepOrder 2, ...).
 *
 * For "any" mode all steps are activated immediately (stepOrder is informational).
 * For "all" mode only the first step (stepOrder=1) is activated.
 *
 * To create parallel steps at the same level in "all" mode, callers can pass
 * duplicate approverIds at adjacent positions with the same intended order —
 * a future v2 API can accept approverGroups[][].
 */
export async function createApproval(
  input: CreateApprovalInput,
  requestedById: string | null
): Promise<CreateApprovalResult> {
  const isAny = input.approvalMode === "any";

  const request = await prisma.approvalRequest.create({
    data: {
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      title: input.title,
      description: input.description,
      approvalMode: input.approvalMode,
      requiredCount: input.requiredCount,
      requestedById,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      steps: {
        create: input.approverIds.map((approverId, index) => ({
          approverId,
          stepOrder: index + 1,
          // "any" mode: all steps active simultaneously
          // "all" mode: only first step active initially
          isActive: isAny || index === 0,
        })),
      },
    },
    select: { id: true },
  });

  await logApprovalEvent(request.id, requestedById, "approval.created", {
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    approvalMode: input.approvalMode,
    approverCount: input.approverIds.length,
  });

  return { approvalRequest: request };
}

// ── Decide ─────────────────────────────────────────────────────────────────────

export type DecideResult =
  | { outcome: "decision_recorded"; requestStatus: "pending" | "approved" | "rejected" }
  | { outcome: "error"; message: string };

/**
 * Record an approver's decision on a specific step, then advance the request.
 *
 * Advancement rules:
 *  - "all" mode: if approved → activate the next step (if any). If all steps
 *    approved → resolve request as approved. If rejected → skip all remaining
 *    steps and resolve as rejected.
 *  - "any" mode: if approved and approvedCount >= requiredCount → resolve as
 *    approved and skip remaining steps. If rejected → only mark that step
 *    rejected; other steps continue (request stays pending unless all rejected).
 */
export async function decide(
  approvalRequestId: number,
  decidingUserId: string,
  decisionValue: "approved" | "rejected",
  comment: string | undefined
): Promise<DecideResult> {
  // Load request + all steps atomically
  const request = await prisma.approvalRequest.findUnique({
    where: { id: approvalRequestId },
    include: {
      steps: { orderBy: { stepOrder: "asc" } },
    },
  });

  if (!request) return { outcome: "error", message: "Approval request not found" };
  if (request.status !== "pending") {
    return { outcome: "error", message: `Request is already ${request.status}` };
  }

  // Find the active step assigned to this user
  const step = request.steps.find(
    (s) => s.approverId === decidingUserId && s.isActive && s.status === "pending"
  );
  if (!step) {
    return {
      outcome: "error",
      message: "No active approval step found for your user on this request",
    };
  }

  // Record the decision
  await prisma.$transaction([
    prisma.approvalDecision.create({
      data: {
        stepId: step.id,
        decidedById: decidingUserId,
        decision: decisionValue,
        comment,
      },
    }),
    prisma.approvalStep.update({
      where: { id: step.id },
      data: { status: decisionValue, isActive: false },
    }),
  ]);

  await logApprovalEvent(approvalRequestId, decidingUserId, `approval.step_${decisionValue}`, {
    stepId: step.id,
    stepOrder: step.stepOrder,
    comment: comment ?? null,
  });

  // ── Advance request state ────────────────────────────────────────────────
  const isAny = request.approvalMode === "any";

  if (isAny) {
    return advanceAnyMode(request, step, decisionValue);
  } else {
    return advanceAllMode(request, step, decisionValue);
  }
}

// ── All-mode advancement ───────────────────────────────────────────────────────

async function advanceAllMode(
  request: { id: number; steps: Array<{ id: number; stepOrder: number; status: string; approverId: string }> },
  decidedStep: { id: number; stepOrder: number },
  decisionValue: "approved" | "rejected"
): Promise<DecideResult> {
  if (decisionValue === "rejected") {
    // Reject the whole request; skip all remaining pending steps
    const pendingStepIds = request.steps
      .filter((s) => s.id !== decidedStep.id && s.status === "pending")
      .map((s) => s.id);

    await prisma.$transaction([
      ...(pendingStepIds.length > 0
        ? [prisma.approvalStep.updateMany({
            where: { id: { in: pendingStepIds } },
            data: { status: "skipped", isActive: false },
          })]
        : []),
      prisma.approvalRequest.update({
        where: { id: request.id },
        data: { status: "rejected", resolvedAt: new Date() },
      }),
    ]);

    await logApprovalEvent(request.id, null, "approval.rejected", {});
    return { outcome: "decision_recorded", requestStatus: "rejected" };
  }

  // Approved — find next step to activate
  const nextOrder = decidedStep.stepOrder + 1;
  const nextSteps = request.steps.filter(
    (s) => s.stepOrder === nextOrder && s.status === "pending"
  );

  if (nextSteps.length > 0) {
    // Activate next step(s)
    await prisma.approvalStep.updateMany({
      where: { id: { in: nextSteps.map((s) => s.id) } },
      data: { isActive: true },
    });
    await logApprovalEvent(request.id, null, "approval.step_activated", {
      stepOrder: nextOrder,
      stepIds: nextSteps.map((s) => s.id),
    });
    return { outcome: "decision_recorded", requestStatus: "pending" };
  }

  // No more steps — all approved
  await prisma.approvalRequest.update({
    where: { id: request.id },
    data: { status: "approved", resolvedAt: new Date() },
  });
  await logApprovalEvent(request.id, null, "approval.approved", {});
  return { outcome: "decision_recorded", requestStatus: "approved" };
}

// ── Any-mode advancement ───────────────────────────────────────────────────────

async function advanceAnyMode(
  request: {
    id: number;
    requiredCount: number;
    steps: Array<{ id: number; stepOrder: number; status: string; approverId: string }>;
  },
  _decidedStep: { id: number; stepOrder: number },
  decisionValue: "approved" | "rejected"
): Promise<DecideResult> {
  const freshSteps = await prisma.approvalStep.findMany({
    where: { approvalRequestId: request.id },
  });

  const approvedCount = freshSteps.filter((s) => s.status === "approved").length;
  const rejectedCount = freshSteps.filter((s) => s.status === "rejected").length;
  const totalCount = freshSteps.length;

  if (decisionValue === "approved" && approvedCount >= request.requiredCount) {
    // Enough approvals — skip remaining active steps and approve
    const remainingIds = freshSteps
      .filter((s) => s.status === "pending")
      .map((s) => s.id);

    await prisma.$transaction([
      ...(remainingIds.length > 0
        ? [prisma.approvalStep.updateMany({
            where: { id: { in: remainingIds } },
            data: { status: "skipped", isActive: false },
          })]
        : []),
      prisma.approvalRequest.update({
        where: { id: request.id },
        data: { status: "approved", resolvedAt: new Date() },
      }),
    ]);

    await logApprovalEvent(request.id, null, "approval.approved", { approvedCount });
    return { outcome: "decision_recorded", requestStatus: "approved" };
  }

  // If all steps are decided and not enough approvals → rejected
  const decidedCount = approvedCount + rejectedCount;
  if (decidedCount === totalCount && approvedCount < request.requiredCount) {
    await prisma.approvalRequest.update({
      where: { id: request.id },
      data: { status: "rejected", resolvedAt: new Date() },
    });
    await logApprovalEvent(request.id, null, "approval.rejected", { approvedCount, rejectedCount });
    return { outcome: "decision_recorded", requestStatus: "rejected" };
  }

  return { outcome: "decision_recorded", requestStatus: "pending" };
}

// ── Cancel ─────────────────────────────────────────────────────────────────────

export async function cancelApproval(
  approvalRequestId: number,
  cancelledById: string
): Promise<{ ok: boolean; message?: string }> {
  const request = await prisma.approvalRequest.findUnique({
    where: { id: approvalRequestId },
    select: { id: true, status: true, requestedById: true },
  });

  if (!request) return { ok: false, message: "Not found" };
  if (request.status !== "pending") {
    return { ok: false, message: `Cannot cancel a request with status "${request.status}"` };
  }

  await prisma.$transaction([
    prisma.approvalStep.updateMany({
      where: { approvalRequestId, status: "pending" },
      data: { status: "skipped", isActive: false },
    }),
    prisma.approvalRequest.update({
      where: { id: approvalRequestId },
      data: { status: "cancelled", resolvedAt: new Date() },
    }),
  ]);

  await logApprovalEvent(approvalRequestId, cancelledById, "approval.cancelled", {});
  return { ok: true };
}

// ── Expire stale requests (called by a background job) ────────────────────────

export async function expireStaleApprovals(): Promise<number> {
  const now = new Date();

  const stale = await prisma.approvalRequest.findMany({
    where: { status: "pending", expiresAt: { lte: now } },
    select: { id: true },
  });

  if (stale.length === 0) return 0;

  const ids = stale.map((r) => r.id);

  await prisma.$transaction([
    prisma.approvalStep.updateMany({
      where: { approvalRequestId: { in: ids }, status: "pending" },
      data: { status: "skipped", isActive: false },
    }),
    prisma.approvalRequest.updateMany({
      where: { id: { in: ids } },
      data: { status: "expired", resolvedAt: now },
    }),
  ]);

  for (const { id } of stale) {
    void logApprovalEvent(id, null, "approval.expired", {});
  }

  return stale.length;
}
