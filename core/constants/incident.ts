import type { IncidentPriority } from "./incident-priority";
import type { IncidentStatus } from "./incident-status";
import type { IncidentUpdateType } from "./incident-update-type";
import type { CiSummary } from "./cmdb";

export interface IncidentUpdate {
  id: number;
  updateType: IncidentUpdateType;
  body: string;
  author: { id: string; name: string } | null;
  createdAt: string;
}

export interface IncidentEvent {
  id: number;
  action: string;
  meta: Record<string, unknown>;
  actor: { id: string; name: string } | null;
  createdAt: string;
}

export interface IncidentSlaInfo {
  slaStatus: "on_track" | "at_risk" | "breached" | "completed";
  /** Minutes until nearest unmet deadline. Negative = overdue. Null if resolved/closed. */
  minutesUntilBreach: number | null;
}

export interface Incident extends IncidentSlaInfo {
  id: number;
  incidentNumber: string;
  title: string;
  description: string | null;
  status: IncidentStatus;
  priority: IncidentPriority;
  isMajor: boolean;
  affectedSystem: string | null;
  affectedUserCount: number | null;
  commander: { id: string; name: string; email: string } | null;
  assignedTo: { id: string; name: string } | null;
  team: { id: number; name: string; color: string } | null;
  // SLA timestamps
  responseDeadline: string | null;
  resolutionDeadline: string | null;
  acknowledgedAt: string | null;
  respondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  slaBreached: boolean;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  // Detail-only (not in list responses)
  updates?: IncidentUpdate[];
  events?: IncidentEvent[];
  ciLinks?: Array<{ ci: CiSummary; linkedAt: string }>;
}
