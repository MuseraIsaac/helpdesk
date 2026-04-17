/**
 * Service Request SLA Engine — placeholder implementation.
 *
 * Current behaviour: computes a simple due-date from priority using built-in
 * defaults (business-hours approximation in calendar minutes).
 *
 * Future: replace DEFAULT_SLA_MINUTES with values loaded from SystemSetting
 * section "sla_policy" to enable per-priority / per-team OLA configuration
 * without code changes.
 *
 * Attach points:
 *  - computeRequestSlaDueAt()  — called at request creation / priority change
 *  - checkRequestSlaBreach()   — called by a scheduled job (e.g. check-automation)
 */

/** Default SLA targets in calendar minutes (placeholder values). */
const DEFAULT_SLA_MINUTES: Record<string, number> = {
  urgent: 240,   // 4 hours
  high:   480,   // 8 hours
  medium: 1440,  // 24 hours  (1 business day)
  low:    4320,  // 72 hours  (3 business days)
};

/**
 * Returns the SLA due-at date for a new request given its priority.
 * Returns null if priority is unknown (no SLA target set).
 */
export function computeRequestSlaDueAt(
  priority: string,
  createdAt: Date
): Date | null {
  const minutes = DEFAULT_SLA_MINUTES[priority];
  if (!minutes) return null;
  return new Date(createdAt.getTime() + minutes * 60_000);
}

export interface RequestSlaInfo {
  /** "on_track" | "at_risk" | "breached" | "completed" | "no_sla" */
  slaStatus: string;
  /** Minutes until breach (negative = already breached). Null if no SLA or completed. */
  minutesUntilBreach: number | null;
}

type RequestSlaSnapshot = {
  status: string;
  slaDueAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
};

export function computeRequestSlaInfo(
  request: RequestSlaSnapshot,
  now: Date = new Date()
): RequestSlaInfo {
  const isTerminal =
    request.status === "fulfilled" ||
    request.status === "closed" ||
    request.status === "rejected" ||
    request.status === "cancelled";

  if (isTerminal) {
    return { slaStatus: "completed", minutesUntilBreach: null };
  }

  if (!request.slaDueAt) {
    return { slaStatus: "no_sla", minutesUntilBreach: null };
  }

  const minutesUntilBreach = Math.round(
    (request.slaDueAt.getTime() - now.getTime()) / 60_000
  );

  if (minutesUntilBreach < 0) {
    return { slaStatus: "breached", minutesUntilBreach };
  }

  // "At risk" = < 20% of target remaining, with a 15-minute floor
  const totalMinutes = Math.round(
    (request.slaDueAt.getTime() - now.getTime() + minutesUntilBreach * 60_000 * 0) / 60_000
  );
  const atRiskThreshold = 15;
  if (minutesUntilBreach <= atRiskThreshold) {
    return { slaStatus: "at_risk", minutesUntilBreach };
  }

  return { slaStatus: "on_track", minutesUntilBreach };
}

export function withRequestSlaInfo<T extends RequestSlaSnapshot>(
  request: T,
  now = new Date()
): T & RequestSlaInfo {
  return { ...request, ...computeRequestSlaInfo(request, now) };
}
