/**
 * server/src/lib/analytics/filters.ts
 *
 * Converts a FilterSet (from the analytics schema) into a parameterised
 * SQL WHERE fragment that can be appended to raw queries.
 *
 * Design:
 *   - Uses $N positional parameters compatible with Prisma $queryRawUnsafe.
 *   - Each metric provides a FieldMap that maps logical filter keys to their
 *     exact SQL column expressions, handling the camelCase / snake_case
 *     inconsistencies that exist across tables in this schema.
 *   - Unknown field keys are silently skipped so callers don't need to
 *     enumerate every field for every query.
 */
import type { ResolvedFilterSet, FilterOp, FieldMap } from "./types";

// ── Result of building filter SQL ────────────────────────────────────────────

interface FilterSQLResult {
  /** A SQL fragment like " AND (x = $3 AND y IN ($4,$5))" */
  clause: string;
  /** Parameter values to spread into $queryRawUnsafe calls. */
  params: unknown[];
  /** The next available parameter index after these params are consumed. */
  nextIdx: number;
}

// ── Main builder ──────────────────────────────────────────────────────────────

/**
 * Build a SQL WHERE fragment from a FilterSet.
 *
 * @param filters      Resolved filter set.
 * @param fieldMap     Maps filter field keys to SQL column expressions.
 * @param startIdx     1-based index of the first new parameter (preceding
 *                     params such as date bounds are already at $1, $2, …).
 * @returns            An object with the SQL clause fragment, params array,
 *                     and nextIdx for chaining further parameters.
 *
 * Example
 *   buildFilterSQL(
 *     { logic: "and", conditions: [{ field: "priority", op: "in", value: ["urgent","high"] }] },
 *     { priority: "priority" },
 *     3
 *   )
 *   // { clause: " AND (priority IN ($3,$4))", params: ["urgent","high"], nextIdx: 5 }
 */
export function buildFilterSQL(
  filters: ResolvedFilterSet,
  fieldMap: FieldMap,
  startIdx = 1,
): FilterSQLResult {
  const parts: string[] = [];
  const params: unknown[] = [];
  let idx = startIdx;

  for (const cond of filters.conditions) {
    const col = fieldMap[cond.field];
    if (!col) continue; // unknown field — skip silently

    const fragment = buildConditionSQL(col, cond.op, cond.value, idx);
    if (!fragment) continue;

    parts.push(fragment.sql);
    params.push(...fragment.params);
    idx += fragment.params.length;
  }

  const join    = filters.logic === "or" ? " OR " : " AND ";
  const clause  = parts.length > 0 ? ` AND (${parts.join(join)})` : "";

  return { clause, params, nextIdx: idx };
}

// ── Per-operator SQL fragments ────────────────────────────────────────────────

interface ConditionFragment {
  sql:    string;
  params: unknown[];
}

function buildConditionSQL(
  col: string,
  op: FilterOp,
  value: unknown,
  startIdx: number,
): ConditionFragment | null {
  switch (op) {
    case "eq":
      if (value == null) return null;
      return { sql: `${col} = $${startIdx}`, params: [value] };

    case "neq":
      if (value == null) return null;
      return { sql: `${col} != $${startIdx}`, params: [value] };

    case "in": {
      if (!Array.isArray(value) || value.length === 0) return null;
      const placeholders = value.map((_, i) => `$${startIdx + i}`).join(", ");
      return { sql: `${col} IN (${placeholders})`, params: value };
    }

    case "not_in": {
      if (!Array.isArray(value) || value.length === 0) return null;
      const placeholders = value.map((_, i) => `$${startIdx + i}`).join(", ");
      return { sql: `${col} NOT IN (${placeholders})`, params: value };
    }

    case "gt":
      if (value == null) return null;
      return { sql: `${col} > $${startIdx}`, params: [value] };

    case "gte":
      if (value == null) return null;
      return { sql: `${col} >= $${startIdx}`, params: [value] };

    case "lt":
      if (value == null) return null;
      return { sql: `${col} < $${startIdx}`, params: [value] };

    case "lte":
      if (value == null) return null;
      return { sql: `${col} <= $${startIdx}`, params: [value] };

    case "is_null":
      return { sql: `${col} IS NULL`, params: [] };

    case "is_not_null":
      return { sql: `${col} IS NOT NULL`, params: [] };

    default:
      return null;
  }
}

// ── Convenience: merge two filter sets (AND semantics) ────────────────────────

/**
 * Merge report-level filters and widget-level filters.
 * Result uses AND logic across both sets.
 */
export function mergeFilters(
  a: ResolvedFilterSet | undefined,
  b: ResolvedFilterSet | undefined,
): ResolvedFilterSet {
  const conditions = [
    ...(a?.conditions ?? []),
    ...(b?.conditions ?? []),
  ];
  return { logic: "and", conditions };
}

// ── Common field maps ─────────────────────────────────────────────────────────

/**
 * Field maps for each domain, referencing the exact SQL column names.
 * Ticket uses camelCase columns (no @map on most fields).
 * Incident/Request/etc use snake_case (@map applied in schema).
 */

export const TICKET_FIELD_MAP: FieldMap = {
  status:      "status",
  priority:    "priority",
  category:    "category",
  severity:    "severity",
  source:      "source",
  assignedToId: `"assignedToId"`,
  teamId:      `"queueId"`,
  slaBreached: `"slaBreached"`,
  isEscalated: `"isEscalated"`,
  customerId:  `"customerId"`,
};

export const INCIDENT_FIELD_MAP: FieldMap = {
  status:      "status",
  priority:    "priority",
  isMajor:     `"is_major"`,
  assignedToId: `"assigned_to_id"`,
  teamId:      `"queue_id"`,
  slaBreached: `"sla_breached"`,
};

export const REQUEST_FIELD_MAP: FieldMap = {
  status:         "status",
  priority:       "priority",
  approvalStatus: `"approval_status"`,
  assignedToId:   `"assigned_to_id"`,
  teamId:         `"queue_id"`,
  slaBreached:    `"sla_breached"`,
  catalogItemId:  `"catalog_item_id"`,
};

export const PROBLEM_FIELD_MAP: FieldMap = {
  status:       "status",
  priority:     "priority",
  isKnownError: `"is_known_error"`,
  assignedToId: `"assigned_to_id"`,
  teamId:       `"queue_id"`,
};

export const CHANGE_FIELD_MAP: FieldMap = {
  state:       "state",
  changeType:  `"change_type"`,
  risk:        "risk",
  priority:    "priority",
  assignedToId: `"assigned_to_id"`,
};

export const APPROVAL_FIELD_MAP: FieldMap = {
  status:      "status",
  subjectType: `"subject_type"`,
};
