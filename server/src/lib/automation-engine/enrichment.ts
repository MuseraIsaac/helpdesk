/**
 * Automation Engine — Data Enrichment & Field Automation Handlers
 *
 * Handlers for the field_automation category. Each handler enriches ticket
 * fields by inferring values from:
 *  - Requester / organization metadata (enrich_from_requester)
 *  - Email domain mapping tables (enrich_from_domain)
 *  - Subject / body keyword patterns (enrich_from_keywords)
 *  - Inbound mailbox alias (enrich_from_mailbox)
 *  - Custom field direct set (set_custom_field)
 *  - Lookup table mapping (map_field)
 *  - Impact × urgency matrix (infer_priority)
 *  - Field copy with optional transform (copy_field)
 *
 * All handlers are idempotent and never throw — they return ActionResult.
 * Custom field writes go directly into the ticket.customFields JSON column,
 * ensuring future custom fields work without backend schema changes.
 */

import type { AutomationAction } from "core/schemas/automations";
import type { ActionResult, TicketSnapshot } from "./types";
import { logAudit } from "../audit";
import prisma from "../../db";
import { AI_AGENT_ID } from "core/constants/ai-agent";
import { compose } from "../notification-composer";

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(type: string, meta?: Record<string, unknown>): ActionResult {
  return { type, applied: true, meta };
}
function skip(type: string, reason: string): ActionResult {
  return { type, applied: false, skippedReason: reason };
}
function err(type: string, message: string): ActionResult {
  return { type, applied: false, errorMessage: message };
}

/** Write a single top-level ticket field. Allowed fields whitelist prevents arbitrary writes. */
const ENRICHABLE_TICKET_FIELDS = new Set([
  "subject", "body", "affectedSystem", "source", "category", "priority",
  "severity", "impact", "urgency", "ticketType", "teamId", "assignedToId",
  "mailboxAlias",
]);

async function writeTicketField(
  ticketId: number,
  field: string,
  value: unknown,
  currentValue: unknown,
  onlyIfEmpty: boolean,
): Promise<{ applied: boolean; reason?: string }> {
  if (onlyIfEmpty && currentValue !== null && currentValue !== undefined && currentValue !== "") {
    return { applied: false, reason: "already_set" };
  }
  if (field.startsWith("custom_")) {
    const key = field.slice(7);
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { customFields: true } });
    const existing = (ticket?.customFields ?? {}) as Record<string, unknown>;
    if (onlyIfEmpty && existing[key] !== null && existing[key] !== undefined && existing[key] !== "") {
      return { applied: false, reason: "already_set" };
    }
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { customFields: { ...existing, [key]: value } as any, updatedAt: new Date() },
    });
    return { applied: true };
  }
  if (!ENRICHABLE_TICKET_FIELDS.has(field)) {
    return { applied: false, reason: `field_not_enrichable:${field}` };
  }
  await prisma.ticket.update({ where: { id: ticketId }, data: { [field]: value, updatedAt: new Date() } });
  return { applied: true };
}

/** Resolve a source field path against the snapshot for map_field / copy_field. */
function resolveSourceValue(snapshot: TicketSnapshot, field: string): unknown {
  const raw = snapshot as unknown as Record<string, unknown>;
  if (field.startsWith("custom_")) {
    const cf = raw["customFields"] as Record<string, unknown> | undefined;
    return cf?.[field.slice(7)] ?? null;
  }
  const sourceMap: Record<string, string> = {
    "requester.email":            "senderEmail",
    "requester.language":         "requesterLanguage",
    "requester.timezone":         "requesterTimezone",
    "requester.supportTier":      "requesterSupportTier",
    "requester.orgName":          "requesterOrgName",
    "requester.isVip":            "requesterIsVip",
    "requester.jobTitle":         "customerJobTitle",
    "requester.country":          "requesterTimezone",
    "requester.preferredChannel": "customerPreferredChannel",
    "org.supportTier":            "orgSupportTier",
    "org.country":                "orgCountry",
    "org.industry":               "orgIndustry",
    "email.senderDomain":         "senderDomain",
    "senderDomain":               "senderDomain",
  };
  const mapped = sourceMap[field];
  if (mapped) return raw[mapped] ?? null;
  return raw[field] ?? null;
}

// ── enrich_from_requester ─────────────────────────────────────────────────────

export async function handleEnrichFromRequester(
  action: Extract<AutomationAction, { type: "enrich_from_requester" }>,
  snapshot: TicketSnapshot,
): Promise<ActionResult> {
  // Lazy-load full customer + org data (not always in snapshot)
  let customer: {
    language: string; timezone: string; supportTier: string; isVip: boolean;
    jobTitle: string | null; phone: string | null; preferredChannel: string | null;
    organization: { name: string; supportTier: string; country: string | null; industry: string | null; } | null;
  } | null = null;

  if (snapshot.senderEmail) {
    customer = await prisma.customer.findUnique({
      where: { email: snapshot.senderEmail },
      select: {
        language: true, timezone: true, supportTier: true, isVip: true,
        jobTitle: true, phone: true, preferredChannel: true,
        organization: {
          select: { name: true, supportTier: true, country: true, industry: true },
        },
      },
    });
  }

  const sourceValues: Record<string, unknown> = {
    language:         customer?.language ?? snapshot.requesterLanguage ?? null,
    timezone:         customer?.timezone ?? snapshot.requesterTimezone ?? null,
    supportTier:      customer?.supportTier ?? snapshot.requesterSupportTier ?? null,
    orgName:          customer?.organization?.name ?? snapshot.requesterOrgName ?? null,
    jobTitle:         customer?.jobTitle ?? null,
    isVip:            customer?.isVip ?? snapshot.requesterIsVip ?? false,
    country:          customer?.timezone ?? null, // timezone as country proxy until address field
    preferredChannel: customer?.preferredChannel ?? null,
    orgIndustry:      customer?.organization?.industry ?? snapshot.orgIndustry ?? null,
    orgCountry:       customer?.organization?.country ?? snapshot.orgCountry ?? null,
  };

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const { source, targetField, onlyIfEmpty } of action.mappings) {
    const value = sourceValues[source];
    if (value === null || value === undefined) {
      skipped.push(`${source}→${targetField}:no_source_value`);
      continue;
    }
    const current = resolveSourceValue(snapshot, targetField);
    const result = await writeTicketField(snapshot.id, targetField, value, current, onlyIfEmpty);
    if (result.applied) applied.push(`${source}→${targetField}`);
    else skipped.push(`${source}→${targetField}:${result.reason}`);
  }

  if (applied.length === 0) return skip("enrich_from_requester", `no_fields_applied: ${skipped.join(", ")}`);
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "enrich_from_requester", applied, skipped });
  return ok("enrich_from_requester", { applied, skipped });
}

// ── enrich_from_domain ────────────────────────────────────────────────────────

export async function handleEnrichFromDomain(
  action: Extract<AutomationAction, { type: "enrich_from_domain" }>,
  snapshot: TicketSnapshot,
): Promise<ActionResult> {
  const senderDomain = snapshot.senderDomain
    ?? (snapshot.senderEmail?.includes("@") ? snapshot.senderEmail.split("@")[1]?.toLowerCase() : null);

  if (!senderDomain) return skip("enrich_from_domain", "no_sender_domain");

  const applied: string[] = [];
  const skipped: string[] = [];

  // Sort: exact domain matches first, wildcard "*" last
  const sorted = [...action.mappings].sort((a, b) => {
    if (a.domain === "*") return 1;
    if (b.domain === "*") return -1;
    return 0;
  });

  for (const { domain, field, value } of sorted) {
    const matches = domain === "*" || domain.toLowerCase() === senderDomain;
    if (!matches) continue;

    const current = resolveSourceValue(snapshot, field);
    const result = await writeTicketField(snapshot.id, field, value, current, false);
    if (result.applied) applied.push(`${domain}→${field}=${value}`);
    else skipped.push(`${domain}→${field}:${result.reason}`);

    if (action.firstMatchOnly && applied.length > 0) break;
  }

  if (applied.length === 0) return skip("enrich_from_domain", `no_domain_match_for:${senderDomain}`);
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "enrich_from_domain", domain: senderDomain, applied });
  return ok("enrich_from_domain", { domain: senderDomain, applied, skipped });
}

// ── enrich_from_keywords ──────────────────────────────────────────────────────

export async function handleEnrichFromKeywords(
  action: Extract<AutomationAction, { type: "enrich_from_keywords" }>,
  snapshot: TicketSnapshot,
): Promise<ActionResult> {
  const subject = snapshot.subject ?? "";
  const body    = snapshot.body    ?? "";

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const { keywords, matchIn, caseSensitive, field, value } of action.patterns) {
    const haystack =
      matchIn === "subject" ? subject :
      matchIn === "body"    ? body    :
      `${subject} ${body}`;

    const text    = caseSensitive ? haystack : haystack.toLowerCase();
    const matched = keywords.some((kw) => {
      const needle = caseSensitive ? kw : kw.toLowerCase();
      return text.includes(needle);
    });

    if (!matched) continue;

    const current = resolveSourceValue(snapshot, field);
    const result = await writeTicketField(snapshot.id, field, value, current, false);
    if (result.applied) applied.push(`keyword→${field}=${value}`);
    else skipped.push(`keyword→${field}:${result.reason}`);

    if (action.firstMatchOnly && applied.length > 0) break;
  }

  if (applied.length === 0) return skip("enrich_from_keywords", "no_patterns_matched");
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "enrich_from_keywords", applied });
  return ok("enrich_from_keywords", { applied, skipped });
}

// ── enrich_from_mailbox ───────────────────────────────────────────────────────

export async function handleEnrichFromMailbox(
  action: Extract<AutomationAction, { type: "enrich_from_mailbox" }>,
  snapshot: TicketSnapshot,
): Promise<ActionResult> {
  const alias = snapshot.mailboxAlias?.toLowerCase();
  if (!alias) return skip("enrich_from_mailbox", "no_mailbox_alias");

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const { alias: pattern, field, value } of action.mappings) {
    if (pattern.toLowerCase() !== alias) continue;
    const current = resolveSourceValue(snapshot, field);
    const result = await writeTicketField(snapshot.id, field, value, current, false);
    if (result.applied) applied.push(`${alias}→${field}=${value}`);
    else skipped.push(`${alias}→${field}:${result.reason}`);
  }

  if (applied.length === 0) return skip("enrich_from_mailbox", `no_mapping_for_alias:${alias}`);
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "enrich_from_mailbox", alias, applied });
  return ok("enrich_from_mailbox", { alias, applied });
}

// ── set_custom_field ──────────────────────────────────────────────────────────

export async function handleSetCustomField(
  action: Extract<AutomationAction, { type: "set_custom_field" }>,
  snapshot: TicketSnapshot,
): Promise<ActionResult> {
  const existing = (snapshot.customFields ?? {}) as Record<string, unknown>;
  if (action.onlyIfEmpty && existing[action.key] !== null && existing[action.key] !== undefined && existing[action.key] !== "") {
    return skip("set_custom_field", "already_set");
  }

  const value = action.useTemplateVars ? await compose(action.value, snapshot) : action.value;

  await prisma.ticket.update({
    where: { id: snapshot.id },
    data: { customFields: { ...existing, [action.key]: value } as any, updatedAt: new Date() },
  });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "set_custom_field", key: action.key, value });
  return ok("set_custom_field", { key: action.key, value });
}

// ── map_field ─────────────────────────────────────────────────────────────────

export async function handleMapField(
  action: Extract<AutomationAction, { type: "map_field" }>,
  snapshot: TicketSnapshot,
): Promise<ActionResult> {
  const sourceValue = String(resolveSourceValue(snapshot, action.sourceField) ?? "").toLowerCase();
  if (!sourceValue) return skip("map_field", "source_field_empty");

  const match = action.mappings.find((m) => m.from.toLowerCase() === sourceValue);
  const targetValue = match?.to ?? action.fallback;

  if (targetValue === undefined) return skip("map_field", `no_mapping_for_value:${sourceValue}`);

  const current = resolveSourceValue(snapshot, action.targetField);
  const result = await writeTicketField(snapshot.id, action.targetField, targetValue, current, action.onlyIfEmpty);
  if (!result.applied) return skip("map_field", result.reason ?? "not_applied");

  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", {
    action: "map_field", sourceField: action.sourceField, sourceValue, targetField: action.targetField, targetValue,
  });
  return ok("map_field", { sourceField: action.sourceField, sourceValue, targetField: action.targetField, targetValue });
}

// ── infer_priority ────────────────────────────────────────────────────────────

export async function handleInferPriority(
  action: Extract<AutomationAction, { type: "infer_priority" }>,
  snapshot: TicketSnapshot,
): Promise<ActionResult> {
  if (action.onlyIfEmpty && snapshot.priority) return skip("infer_priority", "priority_already_set");

  const impact  = (snapshot.impact  ?? "").toLowerCase() as "high" | "medium" | "low" | "";
  const urgency = (snapshot.urgency ?? "").toLowerCase() as "high" | "medium" | "low" | "";

  if (!impact || !urgency) return skip("infer_priority", `missing_input:impact=${impact},urgency=${urgency}`);

  const key = `${impact}_${urgency}` as keyof typeof action.matrix;
  const priority = action.matrix[key];

  if (!priority) return skip("infer_priority", `no_matrix_entry_for:${key}`);
  if (snapshot.priority === priority) return skip("infer_priority", "already_set");

  await prisma.ticket.update({ where: { id: snapshot.id }, data: { priority: priority as any } });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "infer_priority", impact, urgency, priority });
  return ok("infer_priority", { impact, urgency, priority });
}

// ── copy_field ────────────────────────────────────────────────────────────────

export async function handleCopyField(
  action: Extract<AutomationAction, { type: "copy_field" }>,
  snapshot: TicketSnapshot,
): Promise<ActionResult> {
  let value = resolveSourceValue(snapshot, action.sourceField);
  if (value === null || value === undefined) return skip("copy_field", "source_field_empty");

  let strVal = String(value);
  switch (action.transform) {
    case "uppercase": strVal = strVal.toUpperCase(); break;
    case "lowercase": strVal = strVal.toLowerCase(); break;
    case "trim":      strVal = strVal.trim();         break;
  }

  const current = resolveSourceValue(snapshot, action.targetField);
  const result = await writeTicketField(snapshot.id, action.targetField, strVal, current, action.onlyIfEmpty);
  if (!result.applied) return skip("copy_field", result.reason ?? "not_applied");

  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", {
    action: "copy_field", sourceField: action.sourceField, targetField: action.targetField, value: strVal,
  });
  return ok("copy_field", { sourceField: action.sourceField, targetField: action.targetField, value: strVal });
}
