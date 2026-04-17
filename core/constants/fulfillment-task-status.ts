export const fulfillmentTaskStatuses = [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export type FulfillmentTaskStatus = (typeof fulfillmentTaskStatuses)[number];

export const fulfillmentTaskStatusLabel: Record<FulfillmentTaskStatus, string> = {
  pending:     "Pending",
  in_progress: "In Progress",
  completed:   "Completed",
  cancelled:   "Cancelled",
};

export const fulfillmentTaskStatusTransitions: Record<
  FulfillmentTaskStatus,
  readonly FulfillmentTaskStatus[]
> = {
  pending:     ["in_progress", "cancelled"],
  in_progress: ["completed", "pending", "cancelled"],
  completed:   ["in_progress"], // reopen
  cancelled:   [],
};
