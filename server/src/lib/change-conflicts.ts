/**
 * change-conflicts.ts — Query-derived change conflict detection.
 *
 * V1 approach: compute conflicts at request time via Prisma queries.
 * No separate ChangeConflict table is needed — this keeps the schema simple
 * while delivering useful conflict data immediately.
 *
 * Detection criteria
 * ──────────────────
 *  schedule_overlap  planned windows intersect (start < other.end AND end > other.start)
 *  shared_ci         same primary configurationItemId, OR the same CI appears in
 *                    either change's ChangeCiLink list
 *  shared_service    same serviceId (FK match; free-text serviceName not matched in V1)
 *  shared_team       same coordinatorGroupId
 *
 * Exclusions
 * ──────────
 *  - The change itself
 *  - Changes in terminal states: closed, cancelled, failed
 *  - Changes with no common criteria (returned by the WHERE OR clause)
 *
 * Severity matrix (see core/constants/change-conflict.ts for full spec)
 *  HIGH   — schedule_overlap + (shared_ci | shared_service)
 *  MEDIUM — schedule_overlap + shared_team  |  shared_ci alone
 *  LOW    — shared_service alone  |  shared_team alone
 *
 * Roadmap
 * ───────
 *  Phase 2: Materialise into ChangeConflict rows (background job) so conflict
 *           counts can be shown on list pages without per-row queries.
 *  Phase 3: Freeze/blackout window conflicts from BusinessHours settings.
 *  Phase 4: CI criticality and service tier weighting in severity scoring.
 *  Phase 5: Real-time conflict push via SSE/websocket on change create/update.
 */

import prisma from "../db";
import type { ConflictType, ConflictSeverity, ConflictResult } from "core/constants/change-conflict.ts";

// Terminal states — changes in these states cannot conflict with open work
const TERMINAL_STATES = ["closed", "cancelled", "failed"] as const;

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Detect all changes that conflict with `changeId`.
 * Returns an empty array if no conflicts are found or if the change has no
 * attributes that could produce conflicts (e.g. no planned window, no CI).
 */
export async function detectChangeConflicts(changeId: number): Promise<ConflictResult[]> {
  // 1. Load source change attributes needed for comparison
  const source = await prisma.change.findUnique({
    where: { id: changeId },
    select: {
      id:                  true,
      plannedStart:        true,
      plannedEnd:          true,
      serviceId:           true,
      configurationItemId: true,
      coordinatorGroupId:  true,
      ciLinks:             { select: { ciId: true } },
    },
  });

  if (!source) return [];

  // Collect all CI IDs associated with the source change
  const sourceCiIds: number[] = [
    ...(source.configurationItemId ? [source.configurationItemId] : []),
    ...source.ciLinks.map((l) => l.ciId),
  ];

  // 2. Build OR conditions — only include criteria that are non-null on source
  type WhereOr = NonNullable<Parameters<typeof prisma.change.findMany>[0]>["where"];
  const orConditions: NonNullable<WhereOr>[] = [];

  // Schedule overlap: start < other.plannedEnd AND end > other.plannedStart
  if (source.plannedStart && source.plannedEnd) {
    orConditions.push({
      plannedStart: { not: null, lt: source.plannedEnd },
      plannedEnd:   { not: null, gt: source.plannedStart },
    });
  }

  // Shared primary CI
  if (source.configurationItemId) {
    orConditions.push({ configurationItemId: source.configurationItemId });
  }

  // Shared service (FK match)
  if (source.serviceId) {
    orConditions.push({ serviceId: source.serviceId });
  }

  // Shared coordinator group
  if (source.coordinatorGroupId) {
    orConditions.push({ coordinatorGroupId: source.coordinatorGroupId });
  }

  // Shared CI via ChangeCiLink (source's CIs appear in candidate's primary CI or CiLinks)
  if (sourceCiIds.length > 0) {
    orConditions.push({
      OR: [
        { configurationItemId: { in: sourceCiIds } },
        { ciLinks: { some: { ciId: { in: sourceCiIds } } } },
      ],
    });
  }

  if (orConditions.length === 0) return []; // no comparison axes

  // 3. Fetch candidates
  const candidates = await prisma.change.findMany({
    where: {
      id:    { not: changeId },
      state: { notIn: [...TERMINAL_STATES] },
      OR:    orConditions,
    },
    select: {
      id:           true,
      changeNumber: true,
      title:        true,
      state:        true,
      changeType:   true,
      risk:         true,
      priority:     true,
      plannedStart: true,
      plannedEnd:   true,
      serviceId:    true,
      serviceName:  true,
      configurationItemId: true,
      coordinatorGroupId:  true,
      assignedTo:          { select: { id: true, name: true } },
      coordinatorGroup:    { select: { id: true, name: true, color: true } },
      configurationItem:   { select: { id: true, name: true, ciNumber: true } },
      service:             { select: { id: true, name: true } },
      ciLinks:             { select: { ciId: true } },
    },
  });

  // 4. Classify conflict types and compute severity for each candidate
  const results: ConflictResult[] = [];

  for (const candidate of candidates) {
    const types = classifyConflictTypes(source, sourceCiIds, candidate);
    if (types.length === 0) continue; // Prisma OR may over-fetch; skip non-matches

    const severity = computeSeverity(types);

    results.push({
      change: {
        id:                  candidate.id,
        changeNumber:        candidate.changeNumber,
        title:               candidate.title,
        state:               candidate.state,
        changeType:          candidate.changeType,
        risk:                candidate.risk,
        priority:            candidate.priority,
        plannedStart:        candidate.plannedStart?.toISOString() ?? null,
        plannedEnd:          candidate.plannedEnd?.toISOString()   ?? null,
        assignedTo:          candidate.assignedTo,
        coordinatorGroup:    candidate.coordinatorGroup,
        configurationItem:   candidate.configurationItem,
        service:             candidate.service,
        serviceName:         candidate.serviceName,
      },
      types,
      severity,
    });
  }

  // Sort: high → medium → low, then by change number
  const SEVERITY_RANK: Record<ConflictSeverity, number> = { high: 0, medium: 1, low: 2 };
  results.sort((a, b) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    a.change.changeNumber.localeCompare(b.change.changeNumber)
  );

  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type SourceAttrs = {
  plannedStart:        Date | null;
  plannedEnd:          Date | null;
  serviceId:           number | null;
  configurationItemId: number | null;
  coordinatorGroupId:  number | null;
};

type CandidateAttrs = SourceAttrs & {
  ciLinks: { ciId: number }[];
};

function classifyConflictTypes(
  source: SourceAttrs,
  sourceCiIds: number[],
  candidate: CandidateAttrs
): ConflictType[] {
  const types: ConflictType[] = [];

  // Schedule overlap
  if (
    source.plannedStart &&
    source.plannedEnd &&
    candidate.plannedStart &&
    candidate.plannedEnd &&
    source.plannedStart < candidate.plannedEnd &&
    source.plannedEnd   > candidate.plannedStart
  ) {
    types.push("schedule_overlap");
  }

  // Shared CI: primary CI matches, or any of source's CIs appear in candidate
  const candidateCiIds = new Set<number>([
    ...(candidate.configurationItemId ? [candidate.configurationItemId] : []),
    ...candidate.ciLinks.map((l) => l.ciId),
  ]);
  if (sourceCiIds.some((id) => candidateCiIds.has(id))) {
    types.push("shared_ci");
  }

  // Shared service (FK)
  if (
    source.serviceId &&
    candidate.serviceId &&
    source.serviceId === candidate.serviceId
  ) {
    types.push("shared_service");
  }

  // Shared coordinator group
  if (
    source.coordinatorGroupId &&
    candidate.coordinatorGroupId &&
    source.coordinatorGroupId === candidate.coordinatorGroupId
  ) {
    types.push("shared_team");
  }

  return types;
}

function computeSeverity(types: ConflictType[]): ConflictSeverity {
  const has = (t: ConflictType) => types.includes(t);

  if (has("schedule_overlap") && (has("shared_ci") || has("shared_service"))) {
    return "high";
  }
  if (has("schedule_overlap") || has("shared_ci")) {
    return "medium";
  }
  return "low";
}
