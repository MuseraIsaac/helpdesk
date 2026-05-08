/**
 * seed-automations-conditions.ts
 *
 * Adds correct condition trees to the 90 rules originally seeded by
 * seed-automations.ts. Only rules whose conditions are still EMPTY are
 * patched — any rule an admin has already edited is left alone.
 *
 * The intent is that every patched rule, once toggled on by an admin, fires
 * only when its triggering event would actually warrant the action — no
 * "every ticket marked spam", no "every status change reopens a ticket",
 * no "every priority change pushes severity to sev1".
 *
 * Run with:   bun run server/prisma/seed-automations-conditions.ts
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ── Condition helpers ─────────────────────────────────────────────────────────

type Cond = any;
const eq        = (field: string, value: any): Cond => ({ type: "condition", field, operator: "eq",        value });
const neq       = (field: string, value: any): Cond => ({ type: "condition", field, operator: "neq",       value });
const contains  = (field: string, value: any): Cond => ({ type: "condition", field, operator: "contains",  value });
const inList    = (field: string, value: any[]): Cond => ({ type: "condition", field, operator: "in",      value });
const isEmpty   = (field: string): Cond => ({ type: "condition", field, operator: "is_empty" });
const AND = (...c: Cond[]): Cond => ({ type: "group", operator: "AND", conditions: c });
const OR  = (...c: Cond[]): Cond => ({ type: "group", operator: "OR",  conditions: c });

const EMPTY = AND();

// ── Per-rule condition map (keyed by exact rule name) ─────────────────────────
//
// Where omitted, the rule's existing trigger or action self-filters and an
// empty conditions tree is correct. The map only lists rules that need a
// scoping condition tree.
//
// `descriptionAppend` adds a one-line "⚠ Configure: …" hint when the rule
// references admin-specific IDs (teams, webhooks, custom statuses) and an
// admin must wire them up before enabling.

interface Patch {
  conditions?: Cond;
  descriptionAppend?: string;
}

const PATCHES: Record<string, Patch> = {
  // ── intake_routing ────────────────────────────────────────────────────────
  "Tag tickets from VIP customers": {
    conditions: AND(eq("requesterIsVip", true)),
  },
  "Mark obvious spam (Nigerian prince / lottery)": {
    conditions: OR(
      contains("subject", "nigerian prince"),
      contains("subject", "lottery winner"),
      contains("subject", "claim your prize"),
      contains("subject", "you have won"),
      contains("body",    "won the lottery"),
      contains("body",    "transfer of funds"),
    ),
  },
  "Discard out-of-office auto-replies": {
    conditions: OR(
      eq("isAutoReply", true),
      contains("subject", "out of office"),
      contains("subject", "auto-reply"),
      contains("subject", "automatic reply"),
      contains("subject", "vacation response"),
    ),
  },
  "Send 'we got your ticket' auto-reply": {
    // Don't auto-reply to bounces or OOO mail (would loop).
    conditions: AND(
      eq("isAutoReply", false),
      eq("isBounce",    false),
      eq("isSpam",      false),
    ),
  },
  // 5–8: enrich_from_keywords / enrich_from_domain / enrich_from_mailbox
  // self-filter via their internal mappings — empty conditions are correct.

  // ── event_workflow ────────────────────────────────────────────────────────
  "Pause SLA when waiting on customer": {
    // Only act when status actually transitioned INTO a pending-customer state.
    // Admins typically model "pending customer" as a custom status — leave the
    // condition broad (any change to in_progress/open with the awaiting tag)
    // and let admins narrow it.
    conditions: AND(
      neq("previous.status", "open"),
      inList("status", ["in_progress", "open"]),
    ),
    descriptionAppend: "⚠ Configure: replace condition with the exact 'pending customer' custom status before enabling.",
  },
  "Auto-create incident from sev1 keywords": {
    conditions: OR(
      contains("subject", "outage"),
      contains("subject", "production down"),
      contains("subject", "all users affected"),
      contains("body",    "production down"),
      contains("body",    "complete outage"),
      eq("severity", "sev1"),
    ),
  },
  "Stop processing for spam-flagged tickets": {
    conditions: AND(eq("isSpam", true)),
  },

  // ── time_supervisor ───────────────────────────────────────────────────────
  "Escalate on SLA breach": {
    // Don't re-escalate already-escalated tickets.
    conditions: AND(eq("isEscalated", false)),
  },
  // The remaining time_supervisor rules use triggers that already self-scope
  // (sla_warning thresholdPercent, idle/age/pending_since hours, schedule.cron).

  // ── assignment_routing ────────────────────────────────────────────────────
  "Round-robin within Tier 1 team": {
    // Only route brand-new, unassigned tickets — don't reassign on every event.
    conditions: AND(eq("assignedToId", null)),
    descriptionAppend: "⚠ Configure: replace teamId 1 with your real Tier 1 team before enabling.",
  },
  "Least-loaded routing for Tier 2": {
    descriptionAppend: "⚠ Configure: replace teamId 2 with your real Tier 2 team before enabling.",
  },
  "Smart-route by team policy": {
    conditions: AND(eq("assignedToId", null)),
    descriptionAppend: "⚠ Configure: replace teamId with your default routing team before enabling.",
  },
  "Skill-based routing for security tickets": {
    conditions: AND(eq("category", "security")),
    descriptionAppend: "⚠ Configure: replace teamId with your real Security team before enabling.",
  },
  "Skill-based routing for cloud / AWS tickets": {
    conditions: OR(
      contains("subject",        "aws"),
      contains("body",           "aws"),
      contains("affectedSystem", "aws"),
      contains("affectedSystem", "amazon"),
      contains("affectedSystem", "cloud"),
    ),
    descriptionAppend: "⚠ Configure: replace teamId with your real Cloud Ops team before enabling.",
  },
  "Reassign on agent unavailability": {
    descriptionAppend: "⚠ Configure: replace teamId with the queue you want unassigned tickets to fall back to.",
  },
  "Assign VIP tickets to senior team": {
    conditions: AND(eq("requesterIsVip", true)),
    descriptionAppend: "⚠ Configure: replace teamId 3 with your real Senior Support team before enabling.",
  },
  "Route billing tickets to billing team": {
    conditions: AND(eq("category", "billing")),
    descriptionAppend: "⚠ Configure: replace teamId 4 with your real Billing team before enabling.",
  },
  "Unassign on status=on_hold": {
    // No system on_hold status — admins typically add a custom one. Keep the
    // rule disabled-by-design until they wire it up.
    conditions: AND(eq("status", "__configure_me__")),
    descriptionAppend: "⚠ Configure: replace the status condition with your custom 'on hold' status before enabling.",
  },
  "Auto-add team supervisor as watcher": {
    descriptionAppend: "⚠ Configure: replace watcherId placeholder with the supervisor user id before enabling.",
  },

  // ── approval_automation ───────────────────────────────────────────────────
  "Require manager approval on emergency change": {
    conditions: AND(eq("changeType", "emergency")),
    descriptionAppend: "⚠ Configure: replace approverIds placeholder with real manager user IDs.",
  },
  "Require CAB approval on normal changes": {
    conditions: AND(eq("changeType", "normal")),
    descriptionAppend: "⚠ Configure: replace approverIds placeholder with real CAB member user IDs.",
  },
  "Auto-approve standard pre-approved changes": {
    conditions: AND(eq("changeType", "standard")),
  },
  "Require finance approval on high-cost requests": {
    conditions: AND(eq("category", "procurement")),
    descriptionAppend: "⚠ Configure: replace approverIds placeholder with your finance lead user ID.",
  },
  "Require security approval on access requests": {
    conditions: OR(
      eq("category", "access_request"),
      contains("subject", "access request"),
      contains("subject", "grant access"),
    ),
    descriptionAppend: "⚠ Configure: replace approverIds placeholder with your security lead user ID.",
  },

  // ── notification_automation ───────────────────────────────────────────────
  "Page on-call team for sev1 incidents": {
    conditions: AND(eq("severity", "sev1")),
    descriptionAppend: "⚠ Configure: replace recipientTeamId 1 with your real on-call team before enabling.",
  },
  "Notify watchers on resolution": {
    // Trigger is generic ticket.status_changed — scope to actual resolution.
    conditions: AND(eq("status", "resolved")),
  },
  "Slack the team on sev1 / sev2 priority change": {
    conditions: inList("priority", ["high", "urgent"]),
  },

  // notify_requester rules tied to specific approval/change events already
  // self-scope via their triggers (change.approved / change.rejected /
  // approval.pending) — empty conditions are correct.

  // ── field_automation ──────────────────────────────────────────────────────
  // 1. Infer priority — uses infer_priority action (no-op when impact/urgency
  //    aren't both set), runs on creation. Empty conditions are correct.
  // 2–5: enrich_* / map_field actions self-filter.
  "Auto-set severity from priority": {
    // Only when priority was actually changed TO critical.
    conditions: AND(eq("priority", "critical")),
  },
  "Auto-set urgency=high for outage category": {
    conditions: AND(eq("category", "outage")),
  },
  // 9–10: enrich_from_keywords self-filters.

  // ── lifecycle ─────────────────────────────────────────────────────────────
  "Auto-resolve tickets idle 7 days in 'pending customer'": {
    // close_stale's allowedFromStatuses already restricts to open/in_progress.
    // Add a status guard so rule honors its name once admins wire up the
    // pending-customer custom status.
    descriptionAppend: "⚠ Configure: add a condition for your 'pending customer' custom status if you want to limit closure to that workflow.",
  },
  "Auto-close resolved tickets after 3 days": {
    conditions: AND(eq("status", "resolved")),
  },
  "Reopen ticket when customer replies after resolve": {
    // Only reopen if the ticket was previously resolved or closed.
    conditions: inList("status", ["resolved", "closed"]),
  },
  "Add resolution-survey note on resolve": {
    conditions: AND(eq("status", "resolved")),
  },
  // create_linked_problem / create_follow_up / update_linked_records all
  // self-scope via their triggers (ticket.reopened, incident.resolved,
  // change.rolled_back, incident.closed). Empty conditions are correct.

  // ── integration_webhook ───────────────────────────────────────────────────
  // Most webhooks fire on a specific trigger and have meaningful body content
  // built by the engine. The only common gotcha is the placeholder webhookId.
  "Mirror sev1 incidents to PagerDuty":        { conditions: AND(eq("severity", "sev1")), descriptionAppend: "⚠ Configure: replace webhookId 2 with your real PagerDuty webhook id." },
  "Sync resolved tickets to data warehouse":   { conditions: AND(eq("status", "resolved")), descriptionAppend: "⚠ Configure: replace webhookId 4 with your real warehouse ETL webhook id." },
  "Mirror approved changes to Jira":           { descriptionAppend: "⚠ Configure: replace webhookId 5 with your real Jira webhook id." },
  "Notify Datadog on SLA breach":              { descriptionAppend: "⚠ Configure: replace webhookId 6 with your real Datadog webhook id." },
  "Mirror assignment changes to internal CRM": { descriptionAppend: "⚠ Configure: replace webhookId 7 with your real CRM webhook id." },
  "Mirror escalations to incident-bridge tool":{ descriptionAppend: "⚠ Configure: replace webhookId 8 with your real bridge-call webhook id." },
  "Sync approved service-requests to procurement": { descriptionAppend: "⚠ Configure: replace webhookId 9 with your real procurement webhook id." },
  // ── Second pass: fill every remaining empty-conditions rule ──────────────────
  // The earlier pass left rules whose action self-filters (enrich_*, map_field,
  // infer_priority…) with bare conditions because they were technically safe.
  // The UI surfaces "No conditions — rule will match every event." for these,
  // which is misleading. Add explicit ticket-field gates that mirror the
  // action's intent so the rule's behaviour is visible at a glance.

  // intake_routing — keyword-driven categorisers (mirror the action's keywords)
  "Categorise password reset requests": {
    conditions: AND(
      eq("isSpam", false),
      OR(
        contains("subject", "password"),
        contains("subject", "reset"),
        contains("subject", "log in"),
        contains("subject", "locked out"),
        contains("body",    "password"),
        contains("body",    "locked out"),
      ),
    ),
  },
  "Categorise billing & invoice questions": {
    conditions: AND(
      eq("isSpam", false),
      OR(
        contains("subject", "invoice"),
        contains("subject", "billing"),
        contains("subject", "refund"),
        contains("subject", "charge"),
        contains("subject", "payment"),
        contains("body",    "invoice"),
        contains("body",    "billing"),
      ),
    ),
  },
  "Tag tickets from internal employees": {
    conditions: AND(contains("senderDomain", "company.com")),
    descriptionAppend: "⚠ Configure: replace 'company.com' with your real internal email domain.",
  },
  "Set urgency=high for outage keywords": {
    conditions: OR(
      contains("subject", "outage"),
      contains("subject", "down"),
      contains("subject", "not working"),
      contains("body",    "production down"),
      contains("body",    "everyone affected"),
    ),
  },
  "Enrich tickets with requester organisation data": {
    // Don't waste enrichment on spam, bounces, or OOO replies.
    conditions: AND(
      eq("isSpam",      false),
      eq("isAutoReply", false),
      eq("isBounce",    false),
    ),
  },
  "Route by inbound mailbox alias": {
    conditions: AND(eq("isSpam", false)),
  },

  // event_workflow
  "Notify approvers when change submitted": {
    // Trigger change.submitted_for_approval is fully self-scoping; engine
    // doesn't expose change-side fields for ticket conditions yet.
    descriptionAppend: "By design: fires on every change.submitted_for_approval event — the trigger itself fully scopes this rule.",
  },
  "Notify requester on status change": {
    // Skip system-managed lifecycle transitions (new → processing → open).
    conditions: AND(
      neq("status",          "new"),
      neq("status",          "processing"),
      neq("previous.status", "new"),
    ),
  },

  // field_automation
  "Infer priority from impact × urgency": {
    conditions: AND(
      eq("isSpam", false),
      isEmpty("priority"),     // mirror the action's onlyIfEmpty guard
    ),
  },
  "Set affected system from keywords": {
    conditions: AND(eq("isSpam", false), isEmpty("affectedSystem")),
  },
  "Map support-tier → priority": {
    conditions: AND(eq("isSpam", false), isEmpty("priority")),
  },
  "Copy requester language to custom field": {
    conditions: AND(eq("isSpam", false)),
  },
  "Tag tickets from VIP organisations": {
    conditions: AND(eq("isSpam", false)),
  },
  "Set custom 'first_response_template' field": {
    conditions: AND(eq("isSpam", false)),
  },
  "Detect 'urgent' / 'asap' in body → high priority": {
    conditions: OR(
      contains("body", "urgent"),
      contains("body", "asap"),
      contains("body", "immediately"),
      contains("body", "right now"),
    ),
  },
  "Set category=hardware for hardware keywords": {
    conditions: OR(
      contains("subject", "laptop"),
      contains("subject", "monitor"),
      contains("subject", "keyboard"),
      contains("subject", "headset"),
      contains("subject", "broken screen"),
      contains("body",    "broken screen"),
    ),
  },

  // integration_webhook
  "Mirror new tickets to Slack": {
    conditions: AND(eq("isSpam", false)),
    descriptionAppend: "⚠ Configure: replace webhookId 1 with your real Slack webhook id before enabling.",
  },
  "Push status changes to Microsoft Teams": {
    conditions: AND(
      neq("status", "new"),
      neq("status", "processing"),
    ),
    descriptionAppend: "⚠ Configure: replace webhookId 3 with your real MS Teams webhook id.",
  },
  "Forward all ticket creates to audit log service": {
    descriptionAppend: "By design: forwards every ticket creation to the audit log — intentionally no conditions. ⚠ Configure: replace webhookId 10 with your real audit-log webhook id.",
  },
};

// ── Patcher ───────────────────────────────────────────────────────────────────

function isEmptyConditions(conds: unknown): boolean {
  if (!conds || typeof conds !== "object") return true;
  const c = conds as { type?: string; conditions?: unknown[] };
  if (c.type === "group") return !c.conditions || c.conditions.length === 0;
  return false;
}

async function main() {
  const rules = await prisma.automationRule.findMany({
    select: { id: true, name: true, description: true, conditions: true },
  });

  let patchedConditions = 0;
  let patchedDescriptions = 0;
  let unchanged = 0;
  const missing: string[] = [];

  for (const [name, patch] of Object.entries(PATCHES)) {
    const rule = rules.find((r) => r.name === name);
    if (!rule) {
      missing.push(name);
      continue;
    }

    const data: Record<string, unknown> = {};

    if (patch.conditions && isEmptyConditions(rule.conditions)) {
      data.conditions = patch.conditions as any;
      patchedConditions++;
    }

    if (patch.descriptionAppend) {
      const current = rule.description ?? "";
      if (!current.includes(patch.descriptionAppend)) {
        data.description = current
          ? `${current} ${patch.descriptionAppend}`
          : patch.descriptionAppend;
        patchedDescriptions++;
      }
    }

    if (Object.keys(data).length === 0) {
      unchanged++;
      continue;
    }

    await prisma.automationRule.update({ where: { id: rule.id }, data });
  }

  console.log(`Conditions patched:    ${patchedConditions}`);
  console.log(`Descriptions updated:  ${patchedDescriptions}`);
  console.log(`Unchanged (already ok / admin-edited): ${unchanged}`);
  if (missing.length > 0) {
    console.log(`\nMissing rules (not seeded yet — run seed-automations.ts first):`);
    for (const n of missing) console.log(`  • ${n}`);
  }

  // Sanity report — list any rule still left with empty conditions and no
  // self-scoping trigger so the admin can review.
  const stillEmpty = await prisma.automationRule.findMany({
    select: { name: true, conditions: true, triggers: true, category: true },
  });

  const SELF_SCOPING_TRIGGERS = new Set([
    "schedule.cron",
    "ticket.sla_warning", "ticket.sla_breached",
    "ticket.idle", "ticket.pending_since", "ticket.age",
    "ticket.escalated", "ticket.deescalated", "ticket.reopened", "ticket.merged",
    "approval.overdue", "approval.pending",
    "change.approved", "change.rejected", "change.implemented", "change.rolled_back",
    "incident.resolved", "incident.closed",
    "problem.resolved",
    "request.approved", "request.rejected",
    "ticket.reply_received", "ticket.reply_sent", "ticket.note_added",
    "ticket.assigned", "ticket.unassigned",
    "ticket.priority_changed", "ticket.category_changed", "ticket.due_date_changed",
  ]);

  const review: string[] = [];
  for (const r of stillEmpty) {
    if (!isEmptyConditions(r.conditions)) continue;
    const triggers = r.triggers as Array<{ type: string }>;
    const allSelfScoping = triggers.every((t) => SELF_SCOPING_TRIGGERS.has(t.type));
    if (!allSelfScoping) review.push(`[${r.category}] ${r.name}`);
  }

  if (review.length > 0) {
    console.log(`\n${review.length} rule(s) still have empty conditions on broad triggers — admin should review before enabling:`);
    for (const r of review) console.log(`  • ${r}`);
  } else {
    console.log(`\nAll rules with empty conditions use self-scoping triggers — safe by default.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
