import type { AutomationRule } from "./types";

/**
 * ============================================================
 *  AUTOMATION RULES — CONFIGURATION FILE
 * ============================================================
 *
 * This is the single file to edit when adding, changing, or
 * disabling automation rules. No database changes required.
 *
 * HOW TO ADD A RULE
 * -----------------
 * Add an object to the RULES array below with:
 *   id          — unique stable string (never reuse a retired ID)
 *   name        — shown in the audit trail
 *   enabled     — set to false to disable without deleting
 *   triggers    — one or more of: "ticket.created" | "ticket.updated" | "ticket.age"
 *   condition   — a Condition tree (see types.ts)
 *   actions     — ordered list of Actions to apply
 *
 * TRIGGER REFERENCE
 * -----------------
 *   ticket.created  fires once when a ticket is first opened
 *   ticket.updated  fires when an agent patches any ticket field
 *   ticket.age      fires every 5 minutes (scheduled job); use for
 *                   time-based conditions like "unassigned for > 30 min"
 *
 * LOOP SAFETY
 * -----------
 * Rule actions write directly to the database — they bypass route handlers,
 * so they cannot re-trigger the rule engine. The same rule also cannot fire
 * twice in a single invocation.
 *
 * However, be careful with chained rules: if Rule A sets priority to "urgent"
 * and Rule B fires on "urgent" priority, both may match on the same run since
 * they see the ORIGINAL ticket snapshot (not the post-Rule-A state). In
 * practice this is fine, but avoid designing rules that create contradictions
 * (e.g. Rule A sets category to X, Rule B sets it back to the original).
 *
 * COEXISTENCE WITH AI CLASSIFIER
 * -------------------------------
 * The AI classifier (classify-ticket job) runs asynchronously after ticket
 * creation. Rules on ticket.created fire synchronously and may set category
 * or priority before the classifier runs. The classifier may then overwrite
 * those values. If you want rules to take precedence over AI, add a
 * ticket.updated rule that re-applies when the AI changes the field.
 *
 * ============================================================
 */

export const RULES: AutomationRule[] = [

  // ───────────────────────────────────────────────────────────
  // KEYWORD → CATEGORY
  // ───────────────────────────────────────────────────────────

  {
    id: "keyword_refund_category",
    name: "Categorize refund-related tickets",
    description:
      "Sets category to Refund Request when the subject or body contains " +
      "refund/invoice/billing/payment keywords.",
    enabled: true,
    triggers: ["ticket.created"],
    condition: {
      type: "or",
      conditions: [
        {
          type: "subject_contains",
          keywords: ["refund", "invoice", "charge", "billing", "payment", "money back"],
        },
        {
          type: "body_contains",
          keywords: ["refund", "invoice", "charge", "billing", "payment", "money back"],
        },
      ],
    },
    actions: [{ type: "set_category", value: "refund_request" }],
  },

  {
    id: "keyword_technical_category",
    name: "Categorize technical-support tickets",
    description:
      "Sets category to Technical Question when the subject contains " +
      "error/crash/bug/install/login/password/account keywords.",
    enabled: true,
    triggers: ["ticket.created"],
    condition: {
      type: "subject_contains",
      keywords: [
        "error", "crash", "bug", "install", "installation",
        "login", "password", "account", "access", "not working",
        "broken", "failed", "500", "404",
      ],
    },
    actions: [{ type: "set_category", value: "technical_question" }],
  },

  // ───────────────────────────────────────────────────────────
  // KEYWORD → PRIORITY
  // ───────────────────────────────────────────────────────────

  {
    id: "keyword_outage_urgent",
    name: "Set urgent priority for outage keywords",
    description:
      "Sets priority to Urgent when the subject signals a production outage.",
    enabled: true,
    triggers: ["ticket.created"],
    condition: {
      type: "subject_contains",
      keywords: ["outage", "down", "critical", "cannot access", "service unavailable"],
    },
    actions: [{ type: "set_priority", value: "urgent" }],
  },

  // ───────────────────────────────────────────────────────────
  // SENDER DOMAIN → PRIORITY
  // (example template — disabled by default; fill in a real domain to activate)
  // ───────────────────────────────────────────────────────────

  // {
  //   id: "vip_domain_high_priority",
  //   name: "Elevate priority for VIP customer domain",
  //   description: "Tickets from @enterprise.example.com are set to High priority.",
  //   enabled: false,
  //   triggers: ["ticket.created"],
  //   condition: { type: "sender_domain_is", domain: "enterprise.example.com" },
  //   actions: [{ type: "set_priority", value: "high" }],
  // },

  // ───────────────────────────────────────────────────────────
  // CATEGORY → ASSIGN
  // (example template — disabled by default; replace agentId to activate)
  // ───────────────────────────────────────────────────────────

  // {
  //   id: "assign_refunds_to_billing_agent",
  //   name: "Auto-assign refund requests to billing agent",
  //   description:
  //     "Routes tickets categorised as Refund Request to the dedicated billing agent.",
  //   enabled: false,
  //   triggers: ["ticket.created", "ticket.updated"],
  //   condition: { type: "category_is", value: "refund_request" },
  //   actions: [
  //     {
  //       type: "assign_to",
  //       agentId: "REPLACE_WITH_USER_ID",
  //       agentName: "Billing Agent",
  //     },
  //   ],
  // },

  // ───────────────────────────────────────────────────────────
  // TIME-BASED — fires every 5 min via check-automation job
  // ───────────────────────────────────────────────────────────

  {
    id: "unassigned_urgent_15min_escalate",
    name: "Escalate unassigned urgent tickets after 15 minutes",
    description:
      "If an Urgent ticket has no assignee after 15 minutes, escalate it.",
    enabled: true,
    triggers: ["ticket.age"],
    condition: {
      type: "and",
      conditions: [
        { type: "priority_is", value: "urgent" },
        { type: "is_unassigned" },
        { type: "unassigned_for_minutes", minutes: 15 },
        // Exclude resolved/closed tickets
        { type: "not", condition: { type: "status_is", value: "resolved" } },
        { type: "not", condition: { type: "status_is", value: "closed" } },
      ],
    },
    actions: [{ type: "escalate" }],
  },

  {
    id: "unassigned_high_30min_escalate",
    name: "Escalate unassigned high-priority tickets after 30 minutes",
    description:
      "If a High-priority ticket has no assignee after 30 minutes, escalate it.",
    enabled: true,
    triggers: ["ticket.age"],
    condition: {
      type: "and",
      conditions: [
        { type: "priority_is", value: "high" },
        { type: "is_unassigned" },
        { type: "unassigned_for_minutes", minutes: 30 },
        { type: "not", condition: { type: "status_is", value: "resolved" } },
        { type: "not", condition: { type: "status_is", value: "closed" } },
      ],
    },
    actions: [{ type: "escalate" }],
  },

];
