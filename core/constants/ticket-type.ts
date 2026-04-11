export const ticketTypes = [
  "incident",
  "service_request",
  "problem",
  "change_request",
] as const;

export type TicketType = (typeof ticketTypes)[number];

export const ticketTypeLabel: Record<TicketType, string> = {
  incident: "Incident",
  service_request: "Service Request",
  problem: "Problem",
  change_request: "Change Request",
};

/** Short label for display in table cells. */
export const ticketTypeShortLabel: Record<TicketType, string> = {
  incident: "Incident",
  service_request: "Svc Request",
  problem: "Problem",
  change_request: "Change",
};

/** Tailwind classes for each type badge. */
export const ticketTypeStyles: Record<TicketType, string> = {
  incident: "bg-red-500/15 text-red-600",
  service_request: "bg-blue-500/15 text-blue-600",
  problem: "bg-orange-500/15 text-orange-600",
  change_request: "bg-purple-500/15 text-purple-600",
};
