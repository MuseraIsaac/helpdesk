export const ticketPriorities = ["low", "medium", "high", "urgent"] as const;

export type TicketPriority = (typeof ticketPriorities)[number];

export const priorityLabel: Record<TicketPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};
