/**
 * Approval Engine — shared constants
 *
 * subjectTypes identify which module "owns" the approval request.
 * Adding a new governed module = add a value here, no schema change needed.
 */

export const approvalSubjectTypes = [
  "ticket",           // ticket-level approvals (created by automation rules)
  "change_request",
  "service_request",
  "access_request",
  "policy_exception",
] as const;

export type ApprovalSubjectType = (typeof approvalSubjectTypes)[number];

export const approvalSubjectTypeLabel: Record<ApprovalSubjectType, string> = {
  ticket:          "Ticket",
  change_request:  "Change Request",
  service_request: "Service Request",
  access_request:  "Access Request",
  policy_exception:"Policy Exception",
};

// ── Status ─────────────────────────────────────────────────────────────────────

export const approvalStatuses = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "expired",
] as const;

export type ApprovalStatus = (typeof approvalStatuses)[number];

export const approvalStepStatuses = [
  "pending",
  "approved",
  "rejected",
  "skipped",
] as const;

export type ApprovalStepStatus = (typeof approvalStepStatuses)[number];

// ── Decision ───────────────────────────────────────────────────────────────────

export const approvalDecisions = ["approved", "rejected"] as const;
export type ApprovalDecisionValue = (typeof approvalDecisions)[number];

// ── Mode ───────────────────────────────────────────────────────────────────────

/** "all" = every step must approve in order | "any" = first N approvals win */
export const approvalModes = ["all", "any"] as const;
export type ApprovalMode = (typeof approvalModes)[number];
