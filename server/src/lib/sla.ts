/**
 * SLA Engine — the single source of truth for all SLA calculations.
 *
 * Assumptions (Phase 1):
 *  - 24/7 calendar time. No business-hours or holiday exclusions yet.
 *  - SLA clock starts from ticket.createdAt.
 *  - Priority drives the policy; tickets with no priority use a default policy.
 *  - "At risk" = nearest unmet deadline is < 20% of its total window away,
 *    with a floor of 60 minutes so short-window tickets don't skip the state.
 *
 * Extensibility hooks for Phase 2:
 *  - Replace addCalendarHours() with a business-hours-aware variant that
 *    accepts a schedule config and holiday list.
 *  - The SLA_POLICY object can be moved to the database per-tenant/per-plan.
 *  - The "paused" status can be activated by storing a pausedAt timestamp
 *    and adjusting deadlines when the ticket resumes.
 */

import type { TicketPriority } from "core/constants/ticket-priority.ts";
import type { SlaStatus } from "core/constants/sla-status.ts";

// ─── Policy ────────────────────────────────────────────────────────────────

interface SlaPolicy {
  /** Hours until first agent response is required */
  firstResponseHours: number;
  /** Hours until the ticket must be resolved */
  resolutionHours: number;
}

/**
 * SLA targets keyed by priority.
 * "default" is used when no priority has been assigned.
 *
 * Phase 2: load these from a database table for per-plan customisation.
 */
const SLA_POLICY: Record<TicketPriority | "default", SlaPolicy> = {
  urgent:  { firstResponseHours: 1,  resolutionHours: 4   },
  high:    { firstResponseHours: 4,  resolutionHours: 8   },
  medium:  { firstResponseHours: 8,  resolutionHours: 24  },
  low:     { firstResponseHours: 24, resolutionHours: 72  },
  default: { firstResponseHours: 48, resolutionHours: 120 },
};

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Add calendar hours to a date.
 * Phase 2: replace with a business-hours-aware implementation.
 */
function addCalendarHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

// ─── Deadline calculation ──────────────────────────────────────────────────

export interface SlaDeadlines {
  firstResponseDueAt: Date;
  resolutionDueAt: Date;
}

/**
 * Calculate SLA deadlines from priority and ticket creation time.
 * Called at ticket creation and again whenever priority changes.
 */
export function computeSlaDeadlines(
  priority: TicketPriority | null,
  createdAt: Date
): SlaDeadlines {
  const policy = priority ? SLA_POLICY[priority] : SLA_POLICY.default;
  return {
    firstResponseDueAt: addCalendarHours(createdAt, policy.firstResponseHours),
    resolutionDueAt: addCalendarHours(createdAt, policy.resolutionHours),
  };
}

// ─── Status computation ────────────────────────────────────────────────────

export interface SlaInfo {
  slaStatus: SlaStatus;
  /**
   * Minutes until the nearest unmet deadline.
   * Positive = time remaining. Negative = overdue by that many minutes.
   * Null when there are no SLA targets or the SLA is completed.
   */
  minutesUntilBreach: number | null;
}

type TicketSlaSnapshot = {
  status: string;
  createdAt: Date;
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
  firstRespondedAt: Date | null;
  resolvedAt: Date | null;
};

/**
 * Compute the current SLA status and breach countdown for a ticket.
 * This is a pure function — safe to call on every API read without side-effects.
 */
export function computeSlaInfo(
  ticket: TicketSlaSnapshot,
  now: Date = new Date()
): SlaInfo {
  const { firstResponseDueAt, resolutionDueAt, firstRespondedAt, resolvedAt } = ticket;
  const isTerminal = ticket.status === "resolved" || ticket.status === "closed";

  // No SLA configured — this shouldn't happen with current policy, but guard anyway.
  if (!firstResponseDueAt && !resolutionDueAt) {
    return { slaStatus: "on_track", minutesUntilBreach: null };
  }

  // Completed: ticket is in a terminal state and has a resolved timestamp.
  if (isTerminal && resolvedAt) {
    return { slaStatus: "completed", minutesUntilBreach: null };
  }

  // Determine unmet deadlines
  const responseUnmet = !firstRespondedAt && firstResponseDueAt != null;
  const resolutionUnmet = !resolvedAt && resolutionDueAt != null;

  // Gather candidates and pick the nearest
  const candidates: Date[] = [];
  if (responseUnmet && firstResponseDueAt) candidates.push(firstResponseDueAt);
  if (resolutionUnmet && resolutionDueAt)  candidates.push(resolutionDueAt);

  if (candidates.length === 0) {
    // All deadlines met — completed even if ticket status hasn't been updated yet.
    return { slaStatus: "completed", minutesUntilBreach: null };
  }

  const nearestDeadline = candidates.reduce((a, b) => (a < b ? a : b));
  const minutesUntilBreach = Math.round(
    (nearestDeadline.getTime() - now.getTime()) / 60_000
  );

  if (minutesUntilBreach < 0) {
    return { slaStatus: "breached", minutesUntilBreach };
  }

  // "At risk" when < 20% of the nearest deadline's total window remains,
  // with a minimum floor of 60 minutes so large-window policies feel the state.
  const nearestDue = nearestDeadline;
  const windowMs = nearestDue.getTime() - ticket.createdAt.getTime();
  const atRiskThresholdMinutes = Math.max(windowMs / 60_000 * 0.20, 60);

  if (minutesUntilBreach <= atRiskThresholdMinutes) {
    return { slaStatus: "at_risk", minutesUntilBreach };
  }

  return { slaStatus: "on_track", minutesUntilBreach };
}

/**
 * Attach computed SLA info to a raw Prisma ticket object.
 * Use this before sending any ticket in an API response.
 */
export function withSlaInfo<T extends TicketSlaSnapshot>(ticket: T): T & SlaInfo {
  return { ...ticket, ...computeSlaInfo(ticket) };
}
