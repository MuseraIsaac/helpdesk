export const slaStatuses = ["on_track", "at_risk", "breached", "paused", "completed"] as const;

export type SlaStatus = (typeof slaStatuses)[number];

export const slaStatusLabel: Record<SlaStatus, string> = {
  on_track: "On Track",
  at_risk: "At Risk",
  breached: "Breached",
  paused: "Paused",
  completed: "Completed",
};
