/**
 * Automation Engine — Condition Evaluator
 *
 * Evaluates an AND/OR condition tree against an entity snapshot.
 * Supports leaf conditions (field comparisons) and nested groups.
 */

import type { AutomationCondition, AutomationLeafCondition, AutomationConditionGroup } from "core/schemas/automations";
import type { EntitySnapshot } from "./types";

// ── Field resolution ──────────────────────────────────────────────────────────

function resolveField(snapshot: EntitySnapshot, field: string): unknown {
  const raw = snapshot as unknown as Record<string, unknown>;

  // ── Computed / virtual fields ─────────────────────────────────────────────
  // senderDomain — derived from senderEmail, also available as "email.senderDomain"
  if (field === "senderDomain" || field === "email.senderDomain") {
    const email = raw["senderEmail"] as string | null | undefined;
    if (!email) return null;
    const at = email.indexOf("@");
    return at !== -1 ? email.slice(at + 1).toLowerCase() : null;
  }

  // email.* aliases — map dot-notation to flat snapshot fields
  if (field.startsWith("email.")) {
    const sub = field.slice(6); // strip "email."
    const map: Record<string, string> = {
      from:         "senderEmail",
      fromName:     "senderName",
      to:           "emailTo",
      cc:           "emailCc",
      replyTo:      "emailReplyTo",
      messageId:    "emailMessageId",
      subject:      "subject",
      body:         "body",
      isAutoReply:  "isAutoReply",
      isBounce:     "isBounce",
      mailboxAlias: "mailboxAlias",
      source:       "source",
    };
    return raw[map[sub] ?? sub] ?? null;
  }

  // requester.* aliases
  if (field.startsWith("requester.")) {
    const sub = field.slice(10);
    const map: Record<string, string> = {
      email:            "senderEmail",
      isVip:            "requesterIsVip",
      supportTier:      "requesterSupportTier",
      orgName:          "requesterOrgName",
      organization:     "requesterOrgName",
      timezone:         "requesterTimezone",
      language:         "requesterLanguage",
      jobTitle:         "customerJobTitle",
      phone:            "customerPhone",
      preferredChannel: "customerPreferredChannel",
      customerId:       "customerId",
    };
    return raw[map[sub] ?? `requester${sub.charAt(0).toUpperCase()}${sub.slice(1)}`] ?? null;
  }

  // org.* aliases — organization-level enrichment fields
  if (field.startsWith("org.")) {
    const sub = field.slice(4);
    const map: Record<string, string> = {
      supportTier:   "orgSupportTier",
      country:       "orgCountry",
      industry:      "orgIndustry",
      employeeCount: "orgEmployeeCount",
      website:       "orgWebsite",
      name:          "requesterOrgName",
    };
    return raw[map[sub] ?? `org${sub.charAt(0).toUpperCase()}${sub.slice(1)}`] ?? null;
  }

  // previous.* — resolves against the previousValues snapshot captured before a change
  // Example: previous.status = "open" catches the old value before an update
  if (field.startsWith("previous.")) {
    const sub = field.slice(9);
    const prev = raw["previousValues"] as Record<string, unknown> | undefined;
    return prev?.[sub] ?? null;
  }

  // changed.* — boolean "was this field in previousValues different from current?"
  if (field.startsWith("changed.")) {
    const sub = field.slice(8);
    const prev = raw["previousValues"] as Record<string, unknown> | undefined;
    if (!prev || !(sub in prev)) return false;
    return String(prev[sub] ?? "") !== String(raw[sub] ?? "");
  }

  // time.* — computed time metrics (numeric, in hours). All populated by the time-snapshot builder.
  // These enable conditions like: time.ageHours > 48 OR time.idleHours > 24
  if (field.startsWith("time.")) {
    const sub = field.slice(5);
    const timeFieldMap: Record<string, string> = {
      ageHours:                   "ageHours",
      idleHours:                  "idleHours",
      hoursSinceLastReply:        "hoursSinceLastReply",
      hoursSinceLastAgentReply:   "hoursSinceLastAgentReply",
      hoursSinceLastCustomerReply:"hoursSinceLastCustomerReply",
      hoursUntilSlaFirstResponse: "hoursUntilSlaFirstResponse",
      hoursUntilSlaResolution:    "hoursUntilSlaResolution",
      hoursInCurrentStatus:       "hoursInCurrentStatus",
      hoursUnassigned:            "hoursUnassigned",
      pendingApprovalHours:       "pendingApprovalHours",
    };
    return raw[timeFieldMap[sub] ?? sub] ?? null;
  }

  // Flat time field aliases (without time. prefix for convenience)
  if (
    field === "ageHours" || field === "idleHours" ||
    field === "hoursSinceLastReply" || field === "hoursSinceLastAgentReply" ||
    field === "hoursSinceLastCustomerReply" || field === "hoursUntilSlaFirstResponse" ||
    field === "hoursUntilSlaResolution" || field === "hoursInCurrentStatus" ||
    field === "hoursUnassigned" || field === "pendingApprovalHours"
  ) {
    return raw[field] ?? null;
  }

  // isBusinessHours — pre-computed by intake runner; default false if not present
  if (field === "isBusinessHours") {
    return raw["isBusinessHours"] ?? false;
  }

  // hasAttachments — not stored; intake runner populates via snapshot enrichment
  if (field === "hasAttachments") {
    return raw["hasAttachments"] ?? false;
  }

  // ── Lifecycle / cross-record condition fields ─────────────────────────────
  if (field === "hasLinkedIncident") return raw["hasLinkedIncident"] ?? (raw["linkedIncidentId"] != null);
  if (field === "hasLinkedProblem")  return raw["hasLinkedProblem"]  ?? false;
  if (field === "hasLinkedChange")   return raw["hasLinkedChange"]   ?? false;
  if (field === "isMerged")          return raw["isMerged"]          ?? (raw["mergedIntoId"] != null);
  if (field === "mergedTicketCount") return raw["mergedTicketCount"] ?? 0;

  // linked.* — properties on the directly linked incident (when present)
  if (field.startsWith("linked.")) {
    const sub = field.slice(7);
    const linkedMap: Record<string, string> = {
      problemId:  "linkedProblemId",
      changeRef:  "linkedChangeRef",
      incidentId: "linkedIncidentId",
    };
    return raw[linkedMap[sub] ?? sub] ?? null;
  }

  // ── Custom fields prefixed with "custom_" ─────────────────────────────────
  if (field.startsWith("custom_")) {
    const cf = raw["customFields"] as Record<string, unknown> | undefined;
    return cf?.[field.slice(7)] ?? null;
  }

  // ── Tags ──────────────────────────────────────────────────────────────────
  // Tags are stored under customFields.tags. Returning a comma-separated list
  // lets the existing string operators (contains / not_contains) match cleanly:
  // condition `tag contains "vip"` succeeds when the array includes "vip".
  if (field === "tag" || field === "tags") {
    const cf = raw["customFields"] as Record<string, unknown> | undefined;
    const tags = cf?.tags;
    return Array.isArray(tags) ? tags.join(",") : "";
  }

  return raw[field] ?? null;
}

// ── Operator evaluation ───────────────────────────────────────────────────────

/**
 * Status conditions can be expressed against either:
 *   - a workflow-state enum value: "open" / "in_progress" / "resolved" / "closed" / "escalated"
 *   - an admin-defined ticket-status row encoded as `cs:<id>`
 *
 * Returns the candidate values to OR-match against. Empty array if not a status field.
 */
function statusCandidates(snapshot: EntitySnapshot, field: string): string[] | null {
  if (field !== "status" && field !== "previous.status") return null;
  const raw = snapshot as unknown as Record<string, unknown>;
  if (field === "status") {
    const out: string[] = [];
    if (raw.status) out.push(String(raw.status));
    if (raw.customStatusId != null) out.push(`cs:${raw.customStatusId}`);
    return out;
  }
  // previous.status
  const prev = raw["previousValues"] as Record<string, unknown> | undefined;
  const out: string[] = [];
  if (prev?.status) out.push(String(prev.status));
  if (prev?.customStatusId != null) out.push(`cs:${prev.customStatusId}`);
  return out;
}

function evaluateLeaf(condition: AutomationLeafCondition, snapshot: EntitySnapshot): boolean {
  const candidates = statusCandidates(snapshot, condition.field);
  // For status fields, match if ANY candidate satisfies the operator (back-compat
  // with rules that stored "open" alongside new rules that store "cs:7").
  if (candidates) {
    if (candidates.length === 0) {
      // No status set at all — treat as empty for is_empty/is_not_empty, otherwise no match
      if (condition.operator === "is_empty") return true;
      if (condition.operator === "is_not_empty") return false;
      return false;
    }
    // Negative operators must hold for ALL candidates (else a rule like
    // `status neq open` would spuriously pass via the `cs:<id>` candidate).
    const negative = condition.operator === "neq"
      || condition.operator === "not_in"
      || condition.operator === "not_contains"
      || condition.operator === "is_not_empty";
    return negative
      ? candidates.every((c) => evaluateLeafAgainst(condition, c))
      : candidates.some((c)  => evaluateLeafAgainst(condition, c));
  }
  return evaluateLeafAgainst(condition, resolveField(snapshot, condition.field));
}

function evaluateLeafAgainst(condition: AutomationLeafCondition, actual: unknown): boolean {
  const { operator, value } = condition;

  switch (operator) {
    case "is_empty":
      return actual === null || actual === undefined || actual === "";
    case "is_not_empty":
      return actual !== null && actual !== undefined && actual !== "";
    case "eq":
      return String(actual ?? "").toLowerCase() === String(value ?? "").toLowerCase();
    case "neq":
      return String(actual ?? "").toLowerCase() !== String(value ?? "").toLowerCase();
    case "contains":
      return typeof actual === "string" && actual.toLowerCase().includes(String(value ?? "").toLowerCase());
    case "not_contains":
      return typeof actual === "string" && !actual.toLowerCase().includes(String(value ?? "").toLowerCase());
    case "starts_with":
      return typeof actual === "string" && actual.toLowerCase().startsWith(String(value ?? "").toLowerCase());
    case "ends_with":
      return typeof actual === "string" && actual.toLowerCase().endsWith(String(value ?? "").toLowerCase());
    case "in": {
      const list = Array.isArray(value) ? value : [value];
      return list.some((v) => String(v ?? "").toLowerCase() === String(actual ?? "").toLowerCase());
    }
    case "not_in": {
      const list = Array.isArray(value) ? value : [value];
      return !list.some((v) => String(v ?? "").toLowerCase() === String(actual ?? "").toLowerCase());
    }
    case "gt":
      return Number(actual) > Number(value);
    case "gte":
      return Number(actual) >= Number(value);
    case "lt":
      return Number(actual) < Number(value);
    case "lte":
      return Number(actual) <= Number(value);
    case "matches_regex": {
      try {
        return typeof actual === "string" && new RegExp(String(value), "i").test(actual);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

// ── Group evaluation ──────────────────────────────────────────────────────────

function evaluateGroup(group: AutomationConditionGroup, snapshot: EntitySnapshot): boolean {
  if (group.conditions.length === 0) return true; // empty group always matches

  if (group.operator === "AND") {
    return group.conditions.every((c) => evaluateCondition(c, snapshot));
  }
  return group.conditions.some((c) => evaluateCondition(c, snapshot));
}

// ── Public API ────────────────────────────────────────────────────────────────

export function evaluateCondition(condition: AutomationCondition, snapshot: EntitySnapshot): boolean {
  if (condition.type === "group") {
    return evaluateGroup(condition, snapshot);
  }
  return evaluateLeaf(condition, snapshot);
}

/**
 * Returns true when the stored condition JSON matches the snapshot.
 * An empty/null conditions object always matches (no filter = match all).
 */
export function evaluateConditions(raw: unknown, snapshot: EntitySnapshot): boolean {
  if (!raw || typeof raw !== "object" || Object.keys(raw as object).length === 0) {
    return true;
  }
  try {
    return evaluateCondition(raw as AutomationCondition, snapshot);
  } catch {
    return false;
  }
}
