export const ticketStatuses = ["new", "processing", "open", "in_progress", "escalated", "resolved", "closed"] as const;

export type TicketStatus = (typeof ticketStatuses)[number];

export const agentTicketStatuses = ["open", "in_progress", "escalated", "resolved", "closed"] as const;

export type AgentTicketStatus = (typeof agentTicketStatuses)[number];

export const statusLabel: Record<TicketStatus, string> = {
  new: "New",
  processing: "Processing",
  open: "Open",
  in_progress: "In Progress",
  escalated: "Escalated",
  resolved: "Resolved",
  closed: "Closed",
};

export const statusVariant: Record<TicketStatus, "default" | "secondary" | "outline"> = {
  new: "outline",
  processing: "outline",
  open: "default",
  in_progress: "default",
  escalated: "destructive",
  resolved: "secondary",
  closed: "outline",
};
