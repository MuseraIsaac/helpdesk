export const fulfillmentTaskStatuses = [
  "pending",
  "assigned",
  "in_progress",
  "on_hold",
  "waiting_on_user",
  "waiting_on_vendor",
  "completed",
  "done",
  "cancelled",
  "skipped",
] as const;

export type FulfillmentTaskStatus = (typeof fulfillmentTaskStatuses)[number];

export const fulfillmentTaskStatusLabel: Record<FulfillmentTaskStatus, string> = {
  pending:           "Pending",
  assigned:          "Assigned",
  in_progress:       "In Progress",
  on_hold:           "On Hold",
  waiting_on_user:   "Waiting on User",
  waiting_on_vendor: "Waiting on Vendor",
  completed:         "Completed",
  done:              "Done",
  cancelled:         "Cancelled",
  skipped:           "Skipped",
};

export const fulfillmentTaskStatusTransitions: Record<
  FulfillmentTaskStatus,
  readonly FulfillmentTaskStatus[]
> = {
  pending:           ["assigned", "in_progress", "on_hold", "cancelled", "skipped"],
  assigned:          ["in_progress", "pending", "on_hold", "cancelled", "skipped"],
  in_progress:       ["completed", "done", "on_hold", "waiting_on_user", "waiting_on_vendor", "pending", "cancelled"],
  on_hold:           ["in_progress", "assigned", "pending", "cancelled"],
  waiting_on_user:   ["in_progress", "on_hold", "cancelled"],
  waiting_on_vendor: ["in_progress", "on_hold", "cancelled"],
  completed:         ["done", "in_progress"],
  done:              ["in_progress"],
  cancelled:         [],
  skipped:           [],
};

/** Statuses that count as "done" for auto-advance purposes */
export const fulfillmentTaskDoneStatuses: readonly FulfillmentTaskStatus[] = [
  "completed",
  "done",
  "cancelled",
  "skipped",
];
