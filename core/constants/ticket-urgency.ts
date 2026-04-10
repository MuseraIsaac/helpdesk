export const ticketUrgencies = ["low", "medium", "high"] as const;

export type TicketUrgency = (typeof ticketUrgencies)[number];

export const urgencyLabel: Record<TicketUrgency, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};
