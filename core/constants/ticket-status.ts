export const ticketStatuses = ["open", "resolved", "closed"] as const;

export type TicketStatus = (typeof ticketStatuses)[number];

export const statusLabel: Record<TicketStatus, string> = {
  open: "Open",
  resolved: "Resolved",
  closed: "Closed",
};

export const statusVariant: Record<TicketStatus, "default" | "secondary" | "outline"> = {
  open: "default",
  resolved: "secondary",
  closed: "outline",
};
