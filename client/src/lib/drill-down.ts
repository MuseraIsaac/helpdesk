/**
 * drill-down.ts
 *
 * Builds /tickets?... URLs for dashboard drill-downs.
 * All navigation from the dashboard to filtered ticket lists goes through here
 * so the mapping stays in one place and is easy to maintain.
 *
 * The keys mirror TicketFilters in TicketsPage.tsx 1-to-1 so that
 * parseFiltersFromParams() in TicketsPage can deserialize them back.
 */

export interface DrillDownFilters {
  status?: "open" | "resolved" | "closed";
  ticketType?: string;
  category?: string;
  priority?: string;
  severity?: string;
  search?: string;
  escalated?: boolean;
  view?: "overdue" | "at_risk" | "unassigned_urgent";
  teamId?: number | "none";
}

/**
 * Build a /tickets URL with query string from a filter object.
 * Undefined / empty values are omitted from the URL.
 *
 * @example
 *   ticketsUrl({ status: "open" })             // "/tickets?status=open"
 *   ticketsUrl({ escalated: true })             // "/tickets?escalated=true"
 *   ticketsUrl({ view: "overdue" })             // "/tickets?view=overdue"
 *   ticketsUrl({})                              // "/tickets"
 */
export function ticketsUrl(filters: DrillDownFilters = {}): string {
  const params = new URLSearchParams();

  const { escalated, teamId, ...rest } = filters;

  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  if (escalated) params.set("escalated", "true");
  if (teamId !== undefined) params.set("teamId", String(teamId));

  const qs = params.toString();
  return qs ? `/tickets?${qs}` : "/tickets";
}
