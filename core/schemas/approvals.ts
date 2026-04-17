import { z } from "zod/v4";
import { approvalSubjectTypes, approvalModes, approvalDecisions } from "../constants/approval.ts";

// ── Create approval request ───────────────────────────────────────────────────

export const createApprovalSchema = z.object({
  subjectType: z.enum(approvalSubjectTypes),
  subjectId: z.string().min(1),
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  approvalMode: z.enum(approvalModes).default("all"),
  /**
   * For "any" mode: how many approvals are needed (default 1).
   * Ignored in "all" mode.
   */
  requiredCount: z.number().int().min(1).default(1),
  /**
   * Ordered list of approver user IDs.
   * For sequential ("all") mode: activated one by one in array order.
   * For parallel ("any") mode: all activated simultaneously.
   * Grouped steps (same index → same stepOrder) via approverGroups below.
   */
  approverIds: z.array(z.string().min(1)).min(1).max(20),
  expiresAt: z.string().datetime().optional(),
});

export type CreateApprovalInput = z.infer<typeof createApprovalSchema>;

// ── Decision ──────────────────────────────────────────────────────────────────

export const approvalDecisionSchema = z.object({
  decision: z.enum(approvalDecisions),
  comment: z.string().max(2000).optional(),
});

export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;

// ── List query ────────────────────────────────────────────────────────────────

export const listApprovalsQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "cancelled", "expired"]).optional(),
  subjectType: z.enum(approvalSubjectTypes).optional(),
  /** "mine" (default) = only requests where I'm an approver | "all" = admin view */
  scope: z.enum(["mine", "all"]).default("mine"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type ListApprovalsQuery = z.infer<typeof listApprovalsQuerySchema>;
