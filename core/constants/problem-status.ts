/**
 * ITIL-aligned Problem Management lifecycle.
 *
 * new                  — problem record created; investigation not yet started
 * under_investigation  — investigation active; team working root cause analysis
 * root_cause_identified— RCA complete; cause is known but fix not yet scheduled
 * known_error          — RCA done, workaround documented, entered into KEDB
 * change_required      — a formal change request is needed to permanently fix
 * resolved             — underlying cause has been eliminated
 * closed               — post-implementation review complete; terminal
 */

export const problemStatuses = [
  "new",
  "under_investigation",
  "root_cause_identified",
  "known_error",
  "change_required",
  "resolved",
  "closed",
] as const;

export type ProblemStatus = (typeof problemStatuses)[number];

export const problemStatusLabel: Record<ProblemStatus, string> = {
  new:                    "New",
  under_investigation:    "Under Investigation",
  root_cause_identified:  "Root Cause Identified",
  known_error:            "Known Error",
  change_required:        "Change Required",
  resolved:               "Resolved",
  closed:                 "Closed",
};

/** Terminal statuses — no further transitions are allowed. */
export const terminalProblemStatuses: readonly ProblemStatus[] = ["closed"];

/**
 * Valid forward transitions per status.
 * "closed" is always allowed from any non-terminal status for admin force-close.
 * This map encodes the normal forward-progression transitions only.
 */
export const problemStatusTransitions: Record<ProblemStatus, readonly ProblemStatus[]> = {
  new:                   ["under_investigation", "closed"],
  under_investigation:   ["root_cause_identified", "known_error", "closed"],
  root_cause_identified: ["known_error", "change_required", "resolved", "closed"],
  known_error:           ["change_required", "resolved", "closed"],
  change_required:       ["resolved", "closed"],
  resolved:              ["closed", "under_investigation"], // reopen if fix regresses
  closed:                [],
};

/** Priority labels — reuses the ticket priority system. */
export const problemPriorityLabel: Record<string, string> = {
  low:    "Low",
  medium: "Medium",
  high:   "High",
  urgent: "Urgent",
};
