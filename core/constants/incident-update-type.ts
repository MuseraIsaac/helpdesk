export const incidentUpdateTypes = [
  "update",
  "workaround",
  "resolution",
  "escalation",
  "all_clear",
] as const;
export type IncidentUpdateType = (typeof incidentUpdateTypes)[number];

export const incidentUpdateTypeLabel: Record<IncidentUpdateType, string> = {
  update:     "Status Update",
  workaround: "Workaround",
  resolution: "Resolution",
  escalation: "Escalation",
  all_clear:  "All Clear",
};
