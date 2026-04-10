export const ticketImpacts = ["low", "medium", "high"] as const;

export type TicketImpact = (typeof ticketImpacts)[number];

export const impactLabel: Record<TicketImpact, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};
