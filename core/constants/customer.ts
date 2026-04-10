export interface Organization {
  id: number;
  name: string;
  domain: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: number;
  email: string;
  name: string;
  notes: string | null;
  organization: Organization | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Lightweight customer snapshot embedded in ticket detail responses.
 * Includes the customer's other tickets so agents can see history inline.
 */
export interface CustomerSummary {
  id: number;
  email: string;
  name: string;
  notes: string | null;
  organization: { id: number; name: string; domain: string | null } | null;
  /** Other tickets from this customer, most-recent first (excludes the current ticket). */
  recentTickets: Array<{
    id: number;
    subject: string;
    status: string;
    priority: string | null;
    createdAt: string;
  }>;
}
