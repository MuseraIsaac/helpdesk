export const ticketSeverities = ["sev4", "sev3", "sev2", "sev1"] as const;

export type TicketSeverity = (typeof ticketSeverities)[number];

export const severityLabel: Record<TicketSeverity, string> = {
  sev1: "Sev 1 — Critical",
  sev2: "Sev 2 — Major",
  sev3: "Sev 3 — Minor",
  sev4: "Sev 4 — Low",
};

export const severityShortLabel: Record<TicketSeverity, string> = {
  sev1: "Sev 1",
  sev2: "Sev 2",
  sev3: "Sev 3",
  sev4: "Sev 4",
};
