export const incidentPriorities = ["p1", "p2", "p3", "p4"] as const;
export type IncidentPriority = (typeof incidentPriorities)[number];

export const incidentPriorityLabel: Record<IncidentPriority, string> = {
  p1: "P1 — Critical",
  p2: "P2 — High",
  p3: "P3 — Medium",
  p4: "P4 — Low",
};

/** Short label used inside badges where space is tight */
export const incidentPriorityShortLabel: Record<IncidentPriority, string> = {
  p1: "P1",
  p2: "P2",
  p3: "P3",
  p4: "P4",
};
