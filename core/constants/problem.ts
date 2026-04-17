/**
 * TypeScript interfaces for Problem Management domain objects.
 *
 * These mirror the Prisma SELECT projections returned by the API.
 * Import here (not from generated Prisma client) to keep the client bundle
 * free of server-only code.
 */

import type { ProblemStatus } from "./problem-status.ts";
import type { CiSummary } from "./cmdb.ts";

export interface LinkedIncident {
  id: number;
  incidentNumber: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
  linkedAt: string;
  linkedBy: { id: string; name: string } | null;
}

export interface ProblemNote {
  id: number;
  noteType: string;
  body: string;
  bodyHtml: string | null;
  author: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProblemEvent {
  id: number;
  action: string;
  meta: Record<string, unknown>;
  actor: { id: string; name: string } | null;
  createdAt: string;
}

export interface Problem {
  id: number;
  problemNumber: string;
  title: string;
  description: string | null;
  status: ProblemStatus;
  priority: string;

  /** True once the problem is in known_error state or later. */
  isKnownError: boolean;

  /** Root cause analysis narrative. */
  rootCause: string | null;

  /** Documented workaround for stakeholders and linked incidents. */
  workaround: string | null;

  /** Affected service or CI name (free-text for now; FK to CMDB later). */
  affectedService: string | null;

  /**
   * Link to a Change Request that will permanently fix this problem.
   * Stored as a string so it can reference a change request number or URL
   * before a full Change module FK is implemented.
   */
  linkedChangeRef: string | null;

  owner: { id: string; name: string; email: string } | null;
  assignedTo: { id: string; name: string } | null;
  team: { id: number; name: string; color: string } | null;

  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;

  // Detail view only
  linkedIncidents?: LinkedIncident[];
  notes?: ProblemNote[];
  events?: ProblemEvent[];
  ciLinks?: Array<{ ci: CiSummary; linkedAt: string }>;

  /**
   * Future-ready: incident cluster hint.
   * Populated when the API detects recurring patterns across linked incidents.
   * null until the clustering engine is implemented.
   */
  clusterHint?: {
    recurrenceCount: number;
    commonAffectedSystem: string | null;
    earliestIncidentAt: string | null;
  } | null;
}
