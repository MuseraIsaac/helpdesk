export const incidentStatuses = [
  "new",
  "acknowledged",
  "in_progress",
  "resolved",
  "closed",
] as const;
export type IncidentStatus = (typeof incidentStatuses)[number];

export const incidentStatusLabel: Record<IncidentStatus, string> = {
  new:          "New",
  acknowledged: "Acknowledged",
  in_progress:  "In Progress",
  resolved:     "Resolved",
  closed:       "Closed",
};

/** Statuses that can still receive updates */
export const activeIncidentStatuses: readonly IncidentStatus[] = [
  "new",
  "acknowledged",
  "in_progress",
];

/**
 * Valid forward transitions.
 * A status can also jump directly to "closed" (admin force-close).
 */
export const incidentStatusTransitions: Record<IncidentStatus, readonly IncidentStatus[]> = {
  new:          ["acknowledged", "closed"],
  acknowledged: ["in_progress", "closed"],
  in_progress:  ["resolved", "closed"],
  resolved:     ["closed", "in_progress"], // reopen if issue recurs
  closed:       [],
};
