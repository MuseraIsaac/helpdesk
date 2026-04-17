/**
 * Incident SLA Engine
 *
 * ITIL P1-P4 response and resolution targets.
 * Intentionally separate from the ticket SLA engine — incident timelines are
 * much tighter and use different milestone semantics (acknowledgedAt vs firstRespondedAt).
 */

import type { IncidentPriority } from "core/constants/incident-priority.ts";

interface IncidentSlaPolicy {
  /** Minutes until a commander must acknowledge the incident */
  responseMinutes: number;
  /** Minutes until the incident must be resolved */
  resolutionMinutes: number;
}

const INCIDENT_SLA: Record<IncidentPriority, IncidentSlaPolicy> = {
  p1: { responseMinutes: 15,   resolutionMinutes: 60   }, // 15 min / 1 hr
  p2: { responseMinutes: 60,   resolutionMinutes: 240  }, // 1 hr  / 4 hr
  p3: { responseMinutes: 240,  resolutionMinutes: 480  }, // 4 hr  / 8 hr
  p4: { responseMinutes: 480,  resolutionMinutes: 1440 }, // 8 hr  / 24 hr
};

export interface IncidentSlaDeadlines {
  responseDeadline: Date;
  resolutionDeadline: Date;
}

export function computeIncidentSlaDeadlines(
  priority: IncidentPriority,
  createdAt: Date
): IncidentSlaDeadlines {
  const policy = INCIDENT_SLA[priority];
  const addMinutes = (d: Date, mins: number) =>
    new Date(d.getTime() + mins * 60_000);
  return {
    responseDeadline: addMinutes(createdAt, policy.responseMinutes),
    resolutionDeadline: addMinutes(createdAt, policy.resolutionMinutes),
  };
}

export interface IncidentSlaInfo {
  slaStatus: "on_track" | "at_risk" | "breached" | "completed";
  minutesUntilBreach: number | null;
}

type IncidentSlaSnapshot = {
  status: string;
  createdAt: Date;
  priority: string;
  responseDeadline: Date | null;
  resolutionDeadline: Date | null;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
};

export function computeIncidentSlaInfo(
  incident: IncidentSlaSnapshot,
  now: Date = new Date()
): IncidentSlaInfo {
  const isTerminal = incident.status === "resolved" || incident.status === "closed";
  if (isTerminal && incident.resolvedAt) {
    return { slaStatus: "completed", minutesUntilBreach: null };
  }

  const responseUnmet = !incident.acknowledgedAt && incident.responseDeadline != null;
  const resolutionUnmet = !incident.resolvedAt && incident.resolutionDeadline != null;

  const candidates: Date[] = [];
  if (responseUnmet && incident.responseDeadline) candidates.push(incident.responseDeadline);
  if (resolutionUnmet && incident.resolutionDeadline) candidates.push(incident.resolutionDeadline);

  if (candidates.length === 0) {
    return { slaStatus: "completed", minutesUntilBreach: null };
  }

  const nearest = candidates.reduce((a, b) => (a < b ? a : b));
  const minutesUntilBreach = Math.round((nearest.getTime() - now.getTime()) / 60_000);

  if (minutesUntilBreach < 0) return { slaStatus: "breached", minutesUntilBreach };

  // "At risk" = < 20% of the response window remaining, floor 5 minutes
  const policy = INCIDENT_SLA[incident.priority as IncidentPriority];
  const windowMinutes = policy?.responseMinutes ?? 480;
  const atRiskThreshold = Math.max(windowMinutes * 0.2, 5);

  if (minutesUntilBreach <= atRiskThreshold) {
    return { slaStatus: "at_risk", minutesUntilBreach };
  }

  return { slaStatus: "on_track", minutesUntilBreach };
}

export function withIncidentSlaInfo<T extends IncidentSlaSnapshot>(
  incident: T,
  now = new Date()
): T & IncidentSlaInfo {
  return { ...incident, ...computeIncidentSlaInfo(incident, now) };
}
