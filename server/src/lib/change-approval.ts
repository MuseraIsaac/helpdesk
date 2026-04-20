/**
 * change-approval.ts — Change-request approval integration layer.
 *
 * Responsibilities
 * ────────────────
 *  1. requestChangeApproval — creates an ApprovalRequest (via the engine) for
 *     a change and records a ChangeEvent so the change's audit trail reflects
 *     the submission.
 *
 *  2. getChangeApproval — returns the most recent ApprovalRequest for a
 *     change (for display in the UI and gate checks).
 *
 *  3. assertChangeApproved — throws an HTTP-friendly error if the change does
 *     not have an approved ApprovalRequest. Used as a guard before the
 *     "scheduled" state transition.
 *
 *  4. onChangeApprovalResolved — the ApprovalHook handler registered in
 *     index.ts for "change_request" subjects. Writes a ChangeEvent whenever
 *     an approval for a change reaches a final state.
 *
 * Decoupling
 * ──────────
 * The approval engine (approval-engine.ts) knows nothing about changes.
 * This file is the only place where the two domains meet. To add a governed
 * flow for a different module (e.g. access_request), create a parallel
 * `<module>-approval.ts` and register its hook in index.ts.
 */

import prisma from "../db";
import { createApproval } from "./approval-engine";
import type { ApprovalFinalStatus } from "./approval-hooks";
import type { CreateApprovalInput } from "core/schemas/approvals.ts";
import Sentry from "./sentry";

// ── Public surface ────────────────────────────────────────────────────────────

export interface RequestChangeApprovalInput {
  changeId: number;
  approverIds: string[];
  approvalMode: "all" | "any";
  requiredCount?: number;
  expiresAt?: string;
  title?: string;
  description?: string;
}

/**
 * Create an ApprovalRequest for a change and log a ChangeEvent.
 * Returns the created ApprovalRequest id.
 */
export async function requestChangeApproval(
  input: RequestChangeApprovalInput,
  requestedById: string
): Promise<{ approvalRequestId: number }> {
  const change = await prisma.change.findUnique({
    where: { id: input.changeId },
    select: { id: true, changeNumber: true, title: true, state: true },
  });
  if (!change) throw new Error(`Change ${input.changeId} not found`);

  const approvalInput: CreateApprovalInput = {
    subjectType: "change_request",
    subjectId: String(input.changeId),
    title: input.title ?? `CAB Approval: ${change.changeNumber} — ${change.title}`,
    description: input.description ?? undefined,
    approvalMode: input.approvalMode,
    requiredCount: input.requiredCount ?? 1,
    approverIds: input.approverIds,
    expiresAt: input.expiresAt,
  };

  const { approvalRequest } = await createApproval(approvalInput, requestedById);

  // Record a ChangeEvent so the change's audit trail shows the submission
  await logChangeApprovalEvent(input.changeId, requestedById, "change.approval_requested", {
    approvalRequestId: approvalRequest.id,
    approverCount: input.approverIds.length,
    approvalMode: input.approvalMode,
  });

  return { approvalRequestId: approvalRequest.id };
}

/**
 * Return the most recent ApprovalRequest for a change (or null).
 * Used by GET /api/changes/:id/approval and by the UI panel.
 */
const APPROVAL_SELECT = {
  id: true,
  status: true,
  approvalMode: true,
  requiredCount: true,
  expiresAt: true,
  resolvedAt: true,
  createdAt: true,
  requestedBy: { select: { id: true, name: true } },
  steps: {
    orderBy: { stepOrder: "asc" as const },
    select: {
      id: true,
      stepOrder: true,
      status: true,
      isActive: true,
      dueAt: true,
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
    },
  },
} as const;

/** Return all approval requests for a change, newest first. */
export async function getAllChangeApprovals(changeId: number) {
  return prisma.approvalRequest.findMany({
    where: { subjectType: "change_request", subjectId: String(changeId) },
    orderBy: { createdAt: "desc" },
    select: APPROVAL_SELECT,
  });
}

export async function getChangeApproval(changeId: number) {
  return prisma.approvalRequest.findFirst({
    where: {
      subjectType: "change_request",
      subjectId: String(changeId),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      approvalMode: true,
      requiredCount: true,
      expiresAt: true,
      resolvedAt: true,
      createdAt: true,
      requestedBy: { select: { id: true, name: true } },
      steps: {
        orderBy: { stepOrder: "asc" },
        select: {
          id: true,
          stepOrder: true,
          status: true,
          isActive: true,
          dueAt: true,
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
        },
      },
    },
  });
}

/**
 * Guard: throw a 422-friendly error if the change does not have an approved
 * ApprovalRequest. Call before allowing a transition to "scheduled".
 */
export class ApprovalRequiredError extends Error {
  readonly statusCode = 422;
  constructor(message: string) {
    super(message);
    this.name = "ApprovalRequiredError";
  }
}

export async function assertChangeApproved(changeId: number): Promise<void> {
  const approval = await prisma.approvalRequest.findFirst({
    where: {
      subjectType: "change_request",
      subjectId: String(changeId),
      status: "approved",
    },
    select: { id: true },
  });

  if (!approval) {
    throw new ApprovalRequiredError(
      "This change cannot be scheduled until a CAB approval request has been approved. " +
      "Submit the change for approval first."
    );
  }
}

// ── Hook handler (registered in index.ts) ─────────────────────────────────────

/**
 * Called by fireApprovalHook when an ApprovalRequest for a change_request
 * reaches a final state. Writes a ChangeEvent so the change's audit trail
 * reflects the outcome without any additional UI action.
 *
 * Final states and their ChangeEvent actions:
 *   approved  → "change.approval_approved"
 *   rejected  → "change.approval_rejected"
 *   expired   → "change.approval_expired"
 *   cancelled → "change.approval_cancelled"
 */
export async function onChangeApprovalResolved(
  approvalRequestId: number,
  subjectId: string,
  finalStatus: ApprovalFinalStatus
): Promise<void> {
  const changeId = parseInt(subjectId, 10);
  if (isNaN(changeId)) return;

  const action = `change.approval_${finalStatus}` as const;

  await logChangeApprovalEvent(changeId, null, action, {
    approvalRequestId,
    finalStatus,
  });
}

// ── Internal helper ───────────────────────────────────────────────────────────

async function logChangeApprovalEvent(
  changeId: number,
  actorId: string | null,
  action: string,
  meta: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.changeEvent.create({
      data: { changeId, actorId, action, meta: meta as object },
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { context: "change_approval_audit", changeId, action },
    });
    console.error(`[change-approval] Failed to log event "${action}" for change ${changeId}:`, err);
  }
}
