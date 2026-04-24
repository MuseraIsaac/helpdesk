/**
 * Automation Platform — Zod Schemas
 *
 * Shared between client (form validation) and server (request validation +
 * type inference). All JSON-stored structures are validated here before
 * being persisted or evaluated by the engine.
 */

import { z } from "zod/v4";
import type { AutomationCategory, AutomationTriggerType, AutomationActionType, ConditionOperator } from "../constants/automation";

// ── Triggers ──────────────────────────────────────────────────────────────────

const baseTicketTrigger = z.object({ type: z.enum([
  "ticket.created", "ticket.updated", "ticket.status_changed",
  "ticket.priority_changed", "ticket.category_changed",
  "ticket.due_date_changed", "ticket.custom_field_changed",
  "ticket.assigned", "ticket.unassigned", "ticket.escalated", "ticket.deescalated",
  "ticket.reply_received", "ticket.reply_sent", "ticket.note_added",
  "ticket.sla_breached",
]) });

const ticketSlaWarningTrigger = z.object({
  type: z.literal("ticket.sla_warning"),
  thresholdPercent: z.number().min(1).max(100).default(80),
});

const ticketTimeTrigger = z.object({
  type: z.enum(["ticket.idle", "ticket.pending_since", "ticket.age"]),
  hours: z.number().int().min(1),
});

const incidentTrigger = z.object({
  type: z.enum([
    "incident.created", "incident.severity_changed",
    "incident.status_changed", "incident.assigned",
  ]),
});

const changeTrigger = z.object({
  type: z.enum([
    "change.created", "change.submitted_for_approval",
    "change.approved", "change.rejected", "change.implemented",
  ]),
});

const requestTrigger = z.object({
  type: z.enum([
    "request.created", "request.status_changed",
    "request.approved", "request.rejected",
  ]),
});

const problemTrigger = z.object({
  type: z.enum(["problem.created", "problem.updated", "problem.status_changed"]),
});

const approvalTrigger = z.object({
  type: z.enum(["approval.pending", "approval.overdue"]),
});

const scheduleTrigger = z.object({
  type: z.literal("schedule.cron"),
  cron: z.string().min(9).max(100),  // e.g. "0 9 * * 1-5"
  timezone: z.string().default("UTC"),
});

export const automationTriggerSchema = z.discriminatedUnion("type", [
  baseTicketTrigger,
  ticketSlaWarningTrigger,
  ticketTimeTrigger,
  incidentTrigger,
  changeTrigger,
  requestTrigger,
  problemTrigger,
  approvalTrigger,
  scheduleTrigger,
]);

export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;

// ── Conditions ────────────────────────────────────────────────────────────────

const conditionOperators = [
  "eq", "neq", "contains", "not_contains", "starts_with", "ends_with",
  "is_empty", "is_not_empty", "in", "not_in", "gt", "gte", "lt", "lte",
  "matches_regex",
] as const;

const leafConditionSchema = z.object({
  type: z.literal("condition"),
  field: z.string().min(1).max(100),
  operator: z.enum(conditionOperators),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.null(),
  ]).optional(),
});

// Forward-referenced group schema (AND/OR tree)
const conditionGroupSchema: z.ZodType<AutomationConditionGroup> = z.lazy(() =>
  z.object({
    type: z.literal("group"),
    operator: z.enum(["AND", "OR"]),
    conditions: z.array(z.union([leafConditionSchema, conditionGroupSchema])).min(0),
  })
);

export const automationConditionSchema = z.union([leafConditionSchema, conditionGroupSchema]);

export type AutomationLeafCondition = z.infer<typeof leafConditionSchema>;
export interface AutomationConditionGroup {
  type: "group";
  operator: "AND" | "OR";
  conditions: Array<AutomationLeafCondition | AutomationConditionGroup>;
}
export type AutomationCondition = AutomationLeafCondition | AutomationConditionGroup;

// ── Actions ───────────────────────────────────────────────────────────────────

const setFieldAction = z.object({
  type: z.literal("set_field"),
  field: z.string().min(1).max(100),
  value: z.string(),
});

const setPriorityAction = z.object({
  type: z.literal("set_priority"),
  priority: z.enum(["low", "medium", "high", "critical"]),
});

const setCategoryAction = z.object({
  type: z.literal("set_category"),
  category: z.string().min(1),
});

const setStatusAction = z.object({
  type: z.literal("set_status"),
  status: z.enum(["open", "in_progress", "escalated", "resolved", "closed"]),
});

const setTypeAction = z.object({
  type: z.literal("set_type"),
  ticketType: z.enum(["incident", "request", "problem", "change", "question", "task"]),
});

const setSeverityAction = z.object({
  type: z.literal("set_severity"),
  severity: z.enum(["sev1", "sev2", "sev3", "sev4"]),
});

const setImpactAction = z.object({
  type: z.literal("set_impact"),
  impact: z.enum(["high", "medium", "low"]),
});

const setUrgencyAction = z.object({
  type: z.literal("set_urgency"),
  urgency: z.enum(["high", "medium", "low"]),
});

const addTagAction = z.object({
  type: z.literal("add_tag"),
  tag: z.string().min(1).max(50),
});

const removeTagAction = z.object({
  type: z.literal("remove_tag"),
  tag: z.string().min(1).max(50),
});

const setAffectedSystemAction = z.object({
  type: z.literal("set_affected_system"),
  system: z.string().min(1).max(200),
});

const assignAgentAction = z.object({
  type: z.literal("assign_agent"),
  agentId: z.string().min(1),
  agentName: z.string().optional(),
});

const assignTeamAction = z.object({
  type: z.literal("assign_team"),
  teamId: z.number().int().positive(),
  teamName: z.string().optional(),
});

const assignRoundRobinAction = z.object({
  type: z.literal("assign_round_robin"),
  teamId: z.number().int().positive(),
  teamName: z.string().optional(),
  onlyAvailable: z.boolean().default(true),
});

const assignLeastLoadedAction = z.object({
  type: z.literal("assign_least_loaded"),
  teamId: z.number().int().positive(),
  teamName: z.string().optional(),
  onlyAvailable: z.boolean().default(true),
});

const unassignAction = z.object({ type: z.literal("unassign") });

const assignSmartAction = z.object({
  type: z.literal("assign_smart"),
  teamId: z.number().int().positive(),
  teamName: z.string().optional(),
  requiredSkills: z.array(z.string()).default([]),
});

const assignBySkillAction = z.object({
  type: z.literal("assign_by_skill"),
  teamId: z.number().int().positive(),
  teamName: z.string().optional(),
  requiredSkills: z.array(z.string().min(1)).min(1),
  skillMatchMode: z.enum(["required", "preferred"]).default("preferred"),
});

const addNoteAction = z.object({
  type: z.literal("add_note"),
  body: z.string().min(1).max(5000),
  isPinned: z.boolean().default(false),
});

const sendReplyAction = z.object({
  type: z.literal("send_reply"),
  subject: z.string().max(255).optional(), // defaults to "Re: {{ticket.subject}}"
  body: z.string().min(1).max(10000),
  // Template variables resolved: {{ticket.number}}, {{ticket.subject}}, {{requester.name}}, etc.
  useTemplateVars: z.boolean().default(true),
});

const sendNotificationAction = z.object({
  type: z.literal("send_notification"),
  recipientType: z.enum([
    "assignee",      // the ticket's currently assigned agent
    "team",          // all members of the ticket's assigned team
    "requester",     // the ticket's sender (email)
    "specific",      // a specific agent by userId
    "watchers",      // all TicketFollower records for this ticket
    "approvers",     // all pending active approvers on this ticket's open approval requests
    "supervisor",    // all agents with role "supervisor" or "admin"
    "specific_team", // all members of a named team (recipientTeamId required)
  ]),
  recipientId: z.string().optional(),          // for "specific"
  recipientTeamId: z.number().int().positive().optional(), // for "specific_team"
  title: z.string().min(1).max(255),
  body: z.string().min(1).max(2000),
  channels: z.array(z.enum(["in_app", "email", "slack"])).default(["in_app"]),
  // When true, {{ticket.number}}, {{ticket.subject}}, {{requester.name}} etc. are resolved
  useTemplateVars: z.boolean().default(true),
});

const escalateAction = z.object({
  type: z.literal("escalate"),
  reason: z.string().max(500).optional(),
  teamId: z.number().int().positive().optional(),
});

const deescalateAction = z.object({ type: z.literal("deescalate") });

const resolveAction = z.object({
  type: z.literal("resolve"),
  resolution: z.string().max(2000).optional(),
});

const closeAction = z.object({ type: z.literal("close") });

const reopenAction = z.object({ type: z.literal("reopen") });

const createApprovalAction = z.object({
  type: z.literal("create_approval"),
  approverIds: z.array(z.string()).min(1).max(20),
  approvalMode: z.enum(["all", "any"]).default("all"),
  requiredCount: z.number().int().min(1).optional(), // for "any" mode: N-of-M required
  title: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  expiresInHours: z.number().int().positive().optional(),
  // Template variable support in title/description: {{ticket.number}}, {{ticket.subject}}, etc.
  useTemplateVars: z.boolean().default(true),
});

const pauseSlaAction = z.object({ type: z.literal("pause_sla") });

const resumeSlaAction = z.object({ type: z.literal("resume_sla") });

const triggerWebhookAction = z.object({
  type: z.literal("trigger_webhook"),
  webhookId: z.number().int().positive(),
  webhookName: z.string().optional(),
});

const createIncidentAction = z.object({
  type: z.literal("create_incident"),
  severity: z.enum(["sev1", "sev2", "sev3", "sev4"]).optional(),
  title: z.string().max(500).optional(),
});

const stopProcessingAction = z.object({ type: z.literal("stop_processing") });

// ── Intake-specific actions ───────────────────────────────────────────────────

const suppressCreationAction = z.object({ type: z.literal("suppress_creation") });

const markSpamAction = z.object({ type: z.literal("mark_spam") });

const quarantineAction = z.object({
  type: z.literal("quarantine"),
  reason: z.string().max(500).optional(),
});

const sendAutoReplyAction = z.object({
  type: z.literal("send_auto_reply"),
  subject: z.string().min(1).max(255).optional(),
  body: z.string().min(1).max(10000),
});

const addWatcherAction = z.object({
  type: z.literal("add_watcher"),
  watcherId: z.string().min(1),
  watcherName: z.string().optional(),
});

// ── Event workflow actions ─────────────────────────────────────────────────────

const notifyApproversAction = z.object({
  type: z.literal("notify_approvers"),
  title: z.string().min(1).max(255),
  body: z.string().min(1).max(2000),
  channels: z.array(z.enum(["in_app", "email", "slack"])).default(["in_app"]),
  useTemplateVars: z.boolean().default(true),
});

const notifyWatchersAction = z.object({
  type: z.literal("notify_watchers"),
  title: z.string().min(1).max(255),
  body: z.string().min(1).max(2000),
  channels: z.array(z.enum(["in_app", "email", "slack"])).default(["in_app"]),
});

const notifyRequesterAction = z.object({
  type: z.literal("notify_requester"),
  subject: z.string().min(1).max(255).optional(),
  body: z.string().min(1).max(10000),
  sendEmail: z.boolean().default(true),
});

const createLinkedTaskAction = z.object({
  type: z.literal("create_linked_task"),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  assigneeId: z.string().optional(),
  dueInHours: z.number().int().positive().optional(),
});

const chainWorkflowAction = z.object({
  type: z.literal("chain_workflow"),
  ruleId: z.number().int().positive(),
  ruleName: z.string().optional(),
});

// ── Data Enrichment & Field Automation actions ─────────────────────────────────

const enrichmentRequesterSources = [
  "language", "timezone", "supportTier", "orgName", "jobTitle",
  "isVip", "country", "preferredChannel", "orgIndustry", "orgCountry",
] as const;

const enrichFromRequesterAction = z.object({
  type: z.literal("enrich_from_requester"),
  // Each mapping reads a requester/org attribute and writes it to a ticket field.
  // targetField supports "custom_<key>" for custom fields.
  mappings: z.array(z.object({
    source: z.enum(enrichmentRequesterSources),
    targetField: z.string().min(1).max(100),
    onlyIfEmpty: z.boolean().default(true), // skip if target field already has a value
  })).min(1).max(20),
});

const enrichFromDomainAction = z.object({
  type: z.literal("enrich_from_domain"),
  // When the sender's email domain matches, set the specified field to value.
  // "*" in domain acts as a wildcard / fallback (matched last).
  // Supports "custom_<key>" in field.
  mappings: z.array(z.object({
    domain: z.string().min(1).max(255),
    field: z.string().min(1).max(100),
    value: z.string().max(500),
  })).min(1).max(50),
  firstMatchOnly: z.boolean().default(true),
});

const enrichFromKeywordsAction = z.object({
  type: z.literal("enrich_from_keywords"),
  // Each pattern: if any keyword matches the specified text area, set field=value.
  // Supports "custom_<key>" in field.
  patterns: z.array(z.object({
    keywords: z.array(z.string().min(1)).min(1).max(30),
    matchIn: z.enum(["subject", "body", "both"]).default("both"),
    caseSensitive: z.boolean().default(false),
    field: z.string().min(1).max(100),
    value: z.string().max(500),
  })).min(1).max(50),
  firstMatchOnly: z.boolean().default(false), // false = all matching patterns apply
});

const enrichFromMailboxAction = z.object({
  type: z.literal("enrich_from_mailbox"),
  // When the inbound mailbox alias matches, set the specified field to value.
  // Supports "custom_<key>" in field.
  mappings: z.array(z.object({
    alias: z.string().min(1).max(100),
    field: z.string().min(1).max(100),
    value: z.string().max(500),
  })).min(1).max(30),
});

const setCustomFieldAction = z.object({
  type: z.literal("set_custom_field"),
  key: z.string().min(1).max(100),   // custom field key (e.g. "department")
  value: z.string().max(500),         // supports {{template.vars}}
  onlyIfEmpty: z.boolean().default(false),
  useTemplateVars: z.boolean().default(false),
});

const mapFieldAction = z.object({
  type: z.literal("map_field"),
  sourceField: z.string().min(1).max(100), // e.g. "requester.supportTier", "category"
  targetField: z.string().min(1).max(100), // e.g. "priority", "custom_sla_tier"
  mappings: z.array(z.object({
    from: z.string().min(1),  // source field value to match (case-insensitive)
    to: z.string(),           // target field value to write
  })).min(1).max(100),
  fallback: z.string().optional(), // value to use when no mapping matches
  onlyIfEmpty: z.boolean().default(false),
});

const inferPriorityAction = z.object({
  type: z.literal("infer_priority"),
  // Matrix keys are "{impact}_{urgency}" (e.g. "high_low").
  // When both impact and urgency are set on the ticket, the matrix resolves priority.
  matrix: z.object({
    high_high:   z.enum(["low","medium","high","critical"]).default("critical"),
    high_medium: z.enum(["low","medium","high","critical"]).default("high"),
    high_low:    z.enum(["low","medium","high","critical"]).default("high"),
    medium_high: z.enum(["low","medium","high","critical"]).default("high"),
    medium_medium: z.enum(["low","medium","high","critical"]).default("medium"),
    medium_low:  z.enum(["low","medium","high","critical"]).default("medium"),
    low_high:    z.enum(["low","medium","high","critical"]).default("medium"),
    low_medium:  z.enum(["low","medium","high","critical"]).default("low"),
    low_low:     z.enum(["low","medium","high","critical"]).default("low"),
  }),
  onlyIfEmpty: z.boolean().default(true), // skip if priority already set
});

const copyFieldAction = z.object({
  type: z.literal("copy_field"),
  sourceField: z.string().min(1).max(100), // source field path (supports requester.*, custom_*)
  targetField: z.string().min(1).max(100), // destination field (supports custom_*)
  transform: z.enum(["uppercase","lowercase","trim","none"]).default("none"),
  onlyIfEmpty: z.boolean().default(false),
});

// ── Record Lifecycle actions ───────────────────────────────────────────────────

const closeStaleAction = z.object({
  type: z.literal("close_stale"),
  reason: z.string().min(1).max(1000),  // shown in the auto-added note
  addNote: z.boolean().default(true),
  // Only close if ticket is in one of these statuses (guardrail)
  allowedFromStatuses: z.array(z.string()).default(["open","in_progress","escalated"]),
  useTemplateVars: z.boolean().default(false),
});

const createLinkedProblemAction = z.object({
  type: z.literal("create_linked_problem"),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  priority: z.enum(["low","medium","high","urgent"]).optional(),
  useTemplateVars: z.boolean().default(true),
  skipIfLinked: z.boolean().default(true), // skip if ticket already linked to a problem
});

const createLinkedChangeAction = z.object({
  type: z.literal("create_linked_change"),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  changeType: z.enum(["normal","standard","emergency"]).default("normal"),
  priority: z.enum(["low","medium","high","urgent"]).optional(),
  useTemplateVars: z.boolean().default(true),
  skipIfLinked: z.boolean().default(true),
});

const createLinkedRequestAction = z.object({
  type: z.literal("create_linked_request"),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  priority: z.enum(["low","medium","high","urgent"]).optional(),
  useTemplateVars: z.boolean().default(true),
  skipIfLinked: z.boolean().default(true),
});

const createChildTicketAction = z.object({
  type: z.literal("create_child_ticket"),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(10000),
  priority: z.enum(["low","medium","high","urgent"]).optional(),
  assigneeId: z.string().optional(),
  teamId: z.number().int().positive().optional(),
  useTemplateVars: z.boolean().default(true),
});

const createFollowUpAction = z.object({
  type: z.literal("create_follow_up"),
  title: z.string().min(1).max(500),
  body: z.string().min(1).max(10000),
  dueInHours: z.number().int().positive().optional(),
  assigneeId: z.string().optional(),
  useTemplateVars: z.boolean().default(true),
});

const linkToProblemAction = z.object({
  type: z.literal("link_to_problem"),
  problemId: z.number().int().positive(),
  problemLabel: z.string().optional(), // display name for UI
  skipIfLinked: z.boolean().default(true),
});

const updateLinkedRecordsAction = z.object({
  type: z.literal("update_linked_records"),
  // Which linked record types to update
  recordTypes: z.array(z.enum(["incident","problem","change","request"])).min(1),
  // What to write — supports "status", "priority", "note" (adds a note to the record)
  action: z.enum(["add_note","set_status","set_priority"]),
  value: z.string().min(1).max(1000),
  useTemplateVars: z.boolean().default(false),
});

const mergeIntoTicketAction = z.object({
  type: z.literal("merge_into_ticket"),
  targetTicketId: z.number().int().positive(),
  reason: z.string().max(500).optional(),
  notifyRequester: z.boolean().default(true),
});

export const automationActionSchema = z.discriminatedUnion("type", [
  setFieldAction,
  setPriorityAction,
  setCategoryAction,
  setStatusAction,
  setTypeAction,
  setSeverityAction,
  setImpactAction,
  setUrgencyAction,
  addTagAction,
  removeTagAction,
  setAffectedSystemAction,
  assignAgentAction,
  assignTeamAction,
  assignRoundRobinAction,
  assignLeastLoadedAction,
  unassignAction,
  assignSmartAction,
  assignBySkillAction,
  addNoteAction,
  sendReplyAction,
  sendNotificationAction,
  escalateAction,
  deescalateAction,
  resolveAction,
  closeAction,
  reopenAction,
  createApprovalAction,
  pauseSlaAction,
  resumeSlaAction,
  triggerWebhookAction,
  createIncidentAction,
  stopProcessingAction,
  suppressCreationAction,
  markSpamAction,
  quarantineAction,
  sendAutoReplyAction,
  addWatcherAction,
  notifyApproversAction,
  notifyWatchersAction,
  notifyRequesterAction,
  createLinkedTaskAction,
  chainWorkflowAction,
  // Enrichment actions
  enrichFromRequesterAction,
  enrichFromDomainAction,
  enrichFromKeywordsAction,
  enrichFromMailboxAction,
  setCustomFieldAction,
  mapFieldAction,
  inferPriorityAction,
  copyFieldAction,
  // Lifecycle actions
  closeStaleAction,
  createLinkedProblemAction,
  createLinkedChangeAction,
  createLinkedRequestAction,
  createChildTicketAction,
  createFollowUpAction,
  linkToProblemAction,
  updateLinkedRecordsAction,
  mergeIntoTicketAction,
]);

export type AutomationAction = z.infer<typeof automationActionSchema>;

// ── AutomationRule CRUD schemas ───────────────────────────────────────────────

const AUTOMATION_CATEGORIES = [
  "intake_routing",
  "event_workflow",
  "time_supervisor",
  "assignment_routing",
  "approval_automation",
  "notification_automation",
  "field_automation",
  "lifecycle",
  "integration_webhook",
] as const;

export const createAutomationRuleSchema = z.object({
  name:        z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  category:    z.enum(AUTOMATION_CATEGORIES),
  isEnabled:   z.boolean().default(true),
  order:       z.number().int().min(0).default(0),
  triggers:    z.array(automationTriggerSchema).min(1),
  conditions:  automationConditionSchema.optional(),
  actions:     z.array(automationActionSchema).min(1),
  runOnce:     z.boolean().default(false),
  stopOnMatch: z.boolean().default(true),
});

export const updateAutomationRuleSchema = createAutomationRuleSchema.partial();

export const listAutomationRulesQuerySchema = z.object({
  category:  z.enum(AUTOMATION_CATEGORIES).optional(),
  isEnabled: z.enum(["true", "false"]).optional(),
  q:         z.string().max(200).optional(),
  limit:     z.coerce.number().int().min(1).max(200).default(50),
  offset:    z.coerce.number().int().min(0).default(0),
});

export const reorderAutomationRulesSchema = z.object({
  category: z.enum(AUTOMATION_CATEGORIES),
  orderedIds: z.array(z.number().int().positive()).min(1),
});

// ── OutboundWebhook CRUD schemas ──────────────────────────────────────────────

export const createOutboundWebhookSchema = z.object({
  name:          z.string().min(1).max(255),
  description:   z.string().max(1000).optional(),
  isEnabled:     z.boolean().default(true),
  url:           z.url(),
  method:        z.enum(["POST", "PUT", "PATCH"]).default("POST"),
  headers:       z.record(z.string(), z.string()).default({}),
  signingSecret: z.string().max(255).optional(),
  events:        z.array(z.string().min(1)).min(1),
  retryLimit:    z.number().int().min(0).max(10).default(3),
  timeoutMs:     z.number().int().min(1000).max(60000).default(10000),
});

export const updateOutboundWebhookSchema = createOutboundWebhookSchema.partial();

export const listWebhookDeliveriesQuerySchema = z.object({
  status:  z.enum(["pending", "delivered", "failed"]).optional(),
  event:   z.string().optional(),
  limit:   z.coerce.number().int().min(1).max(200).default(50),
  offset:  z.coerce.number().int().min(0).default(0),
});

export const pingWebhookSchema = z.object({
  webhookId: z.number().int().positive(),
});
