/**
 * Service Request lifecycle states.
 *
 * draft          — saved but not yet submitted (future: form builder support)
 * submitted      — requester submitted; awaiting triage/approval routing
 * pending_approval — approval workflow triggered and in progress
 * approved       — approval passed (or no approval required); ready to fulfill
 * in_fulfillment — fulfillment tasks are being worked
 * fulfilled      — all items/tasks completed; awaiting close
 * closed         — post-fulfillment confirmation done; terminal
 * rejected       — approval rejected or admin declined; terminal
 * cancelled      — withdrawn before completion; terminal
 */

export const requestStatuses = [
  "draft",
  "submitted",
  "pending_approval",
  "approved",
  "in_fulfillment",
  "fulfilled",
  "closed",
  "rejected",
  "cancelled",
] as const;

export type RequestStatus = (typeof requestStatuses)[number];

export const requestStatusLabel: Record<RequestStatus, string> = {
  draft:            "Draft",
  submitted:        "Submitted",
  pending_approval: "Pending Approval",
  approved:         "Approved",
  in_fulfillment:   "In Fulfillment",
  fulfilled:        "Fulfilled",
  closed:           "Closed",
  rejected:         "Rejected",
  cancelled:        "Cancelled",
};

/** Terminal statuses — no further transitions allowed. */
export const terminalRequestStatuses: readonly RequestStatus[] = [
  "closed",
  "rejected",
  "cancelled",
];

/**
 * Valid forward transitions per status.
 * Agent UI uses this to render available action buttons.
 */
export const requestStatusTransitions: Record<RequestStatus, readonly RequestStatus[]> = {
  draft:            ["submitted", "cancelled"],
  submitted:        ["pending_approval", "approved", "in_fulfillment", "cancelled"],
  pending_approval: ["approved", "rejected", "cancelled"],
  approved:         ["in_fulfillment", "cancelled"],
  in_fulfillment:   ["fulfilled", "cancelled"],
  fulfilled:        ["closed", "in_fulfillment"], // reopen if something was missed
  closed:           [],
  rejected:         [],
  cancelled:        [],
};

/** Approval decision states stored on ServiceRequest (separate from ApprovalRequest status). */
export const approvalStatuses = [
  "not_required",
  "pending",
  "approved",
  "rejected",
] as const;

export type RequestApprovalStatus = (typeof approvalStatuses)[number];

export const approvalStatusLabel: Record<RequestApprovalStatus, string> = {
  not_required: "Not Required",
  pending:      "Pending",
  approved:     "Approved",
  rejected:     "Rejected",
};
