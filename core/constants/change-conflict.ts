/**
 * Change Conflict — shared types for conflict detection results.
 *
 * Shared between server (detection engine) and client (display).
 * Conflict detection is query-derived — no separate DB model is needed
 * for V1. Each ConflictResult is computed at request time.
 *
 * Roadmap (future phases):
 *  - Phase 2: Materialise conflicts into a ChangeConflict table so they
 *    can be queried without re-running detection on every request.
 *  - Phase 3: Add freeze-window / blackout-window conflicts sourced from
 *    the BusinessHours settings section (already modelled).
 *  - Phase 4: Calendar-based conflict scoring that factors in CI
 *    criticality, service tier, and change risk level.
 *  - Phase 5: Real-time websocket push when a newly created or updated
 *    change introduces a conflict with an existing scheduled change.
 */

// ── Conflict type ─────────────────────────────────────────────────────────────

/**
 * The nature of the overlap between two change requests.
 * A single conflict result may carry multiple types (e.g. a change can share
 * both a CI and a time window with the same candidate).
 *
 *   schedule_overlap  — planned windows intersect; both changes modify systems
 *                       at the same time (highest operational risk).
 *   shared_ci         — both changes list the same configuration item as
 *                       affected (primary CI or via ChangeCiLink).
 *   shared_service    — both changes affect the same catalog service
 *                       (matched by serviceId FK; free-text serviceName
 *                       matching is a future enhancement).
 *   shared_team       — both changes are assigned to the same coordinator
 *                       group (capacity / availability conflict).
 */
export const conflictTypes = [
  "schedule_overlap",
  "shared_ci",
  "shared_service",
  "shared_team",
] as const;

export type ConflictType = (typeof conflictTypes)[number];

export const conflictTypeLabel: Record<ConflictType, string> = {
  schedule_overlap: "Schedule Overlap",
  shared_ci:        "Shared CI",
  shared_service:   "Shared Service",
  shared_team:      "Shared Team",
};

export const conflictTypeDescription: Record<ConflictType, string> = {
  schedule_overlap:
    "The planned change windows intersect — both changes are scheduled to touch systems simultaneously.",
  shared_ci:
    "Both changes list the same configuration item as affected.",
  shared_service:
    "Both changes affect the same catalog service.",
  shared_team:
    "Both changes are assigned to the same coordinator group, creating a capacity risk.",
};

// ── Conflict severity ─────────────────────────────────────────────────────────

/**
 * Overall severity of the conflict, derived from the combination of types.
 *
 * Severity matrix:
 *   HIGH   — schedule_overlap + (shared_ci | shared_service)
 *              → same asset is being changed by two teams simultaneously.
 *   MEDIUM — schedule_overlap + shared_team  (no asset overlap but same team)
 *            OR shared_ci alone             (same asset, different windows)
 *   LOW    — shared_service alone           (same service, different windows)
 *            OR shared_team alone           (same team, no overlap)
 */
export const conflictSeverities = ["high", "medium", "low"] as const;
export type ConflictSeverity = (typeof conflictSeverities)[number];

export const conflictSeverityLabel: Record<ConflictSeverity, string> = {
  high:   "High",
  medium: "Medium",
  low:    "Low",
};

// ── Domain type returned by the API ──────────────────────────────────────────

export interface ConflictingChange {
  id: number;
  changeNumber: string;
  title: string;
  state: string;
  changeType: string;
  risk: string;
  priority: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  assignedTo: { id: string; name: string } | null;
  coordinatorGroup: { id: number; name: string; color: string } | null;
  /** Primary CI of the conflicting change, if any */
  configurationItem: { id: number; name: string; ciNumber: string } | null;
  /** Service of the conflicting change, if any */
  service: { id: number; name: string } | null;
  serviceName: string | null;
}

export interface ConflictResult {
  /** The change that conflicts with the requested change */
  change: ConflictingChange;
  /** All conflict types that apply between the two changes */
  types: ConflictType[];
  /** Highest applicable severity */
  severity: ConflictSeverity;
}
