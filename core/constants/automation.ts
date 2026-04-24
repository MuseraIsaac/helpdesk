/**
 * Automation Platform — Core Constants
 *
 * All trigger types, action types, condition operators, and category
 * identifiers used by the enterprise automation engine. Shared between
 * client (rule builder UI) and server (engine evaluation).
 */

// ── Categories ────────────────────────────────────────────────────────────────

export type AutomationCategory =
  | "intake_routing"          // Ticket Intake & Routing
  | "event_workflow"          // Event-Based Workflows
  | "time_supervisor"         // Time-Based / Supervisor Rules
  | "assignment_routing"      // Assignment & Capacity Routing
  | "approval_automation"     // Approval Automation
  | "notification_automation" // Notification Automation
  | "field_automation"        // Data Enrichment & Field Automation
  | "lifecycle"               // Record Lifecycle Automation
  | "integration_webhook";    // Integrations / Webhooks

// ── Enrichment source types (used by enrich_from_requester action) ────────────

export type EnrichmentRequesterSource =
  | "language"
  | "timezone"
  | "supportTier"
  | "orgName"
  | "jobTitle"
  | "isVip"
  | "country"
  | "preferredChannel"
  | "orgIndustry"
  | "orgCountry";

export const ENRICHMENT_REQUESTER_SOURCE_LABELS: Record<EnrichmentRequesterSource, string> = {
  language:         "Requester Language",
  timezone:         "Requester Timezone",
  supportTier:      "Support Tier",
  orgName:          "Organization Name",
  jobTitle:         "Job Title",
  isVip:            "Is VIP",
  country:          "Requester Country",
  preferredChannel: "Preferred Channel",
  orgIndustry:      "Org Industry",
  orgCountry:       "Org Country",
};

export const AUTOMATION_CATEGORIES: Record<AutomationCategory, { label: string; description: string }> = {
  intake_routing: {
    label: "Intake & Routing",
    description: "Auto-classify, tag, and route tickets as they arrive from any channel.",
  },
  event_workflow: {
    label: "Event Workflows",
    description: "Trigger actions when tickets or ITSM records change state.",
  },
  time_supervisor: {
    label: "Time-Based Rules",
    description: "Act on tickets that have been idle, at risk, or breached SLA.",
  },
  assignment_routing: {
    label: "Assignment Routing",
    description: "Round-robin, least-loaded, and skill-based assignment automation.",
  },
  approval_automation: {
    label: "Approval Automation",
    description: "Auto-create approval requests when conditions are met.",
  },
  notification_automation: {
    label: "Notification Rules",
    description: "Send targeted notifications to agents, teams, and requesters.",
  },
  field_automation: {
    label: "Field Automation",
    description: "Enrich and set ticket fields based on content, source, or context.",
  },
  lifecycle: {
    label: "Lifecycle Rules",
    description: "Auto-close, auto-resolve, reopen, and manage record lifecycle.",
  },
  integration_webhook: {
    label: "Integrations",
    description: "Fire outbound webhooks and connect external systems on events.",
  },
};

// ── Trigger types ─────────────────────────────────────────────────────────────

export type AutomationTriggerType =
  // Ticket events
  | "ticket.created"
  | "ticket.updated"
  | "ticket.status_changed"
  | "ticket.assigned"
  | "ticket.unassigned"
  | "ticket.escalated"
  | "ticket.deescalated"
  | "ticket.reply_received"       // customer replied
  | "ticket.reply_sent"           // agent replied
  | "ticket.note_added"
  | "ticket.priority_changed"     // priority field changed
  | "ticket.category_changed"     // category field changed
  | "ticket.due_date_changed"     // firstResponseDueAt or resolutionDueAt changed
  | "ticket.custom_field_changed" // any custom field value changed
  | "ticket.sla_warning"          // configurable % of SLA elapsed
  | "ticket.sla_breached"
  | "ticket.idle"                 // no activity for N hours
  | "ticket.pending_since"        // open/in_progress for N hours without response
  | "ticket.age"                  // ticket created N hours ago
  // Incident events
  | "incident.created"
  | "incident.severity_changed"
  | "incident.status_changed"
  | "incident.assigned"
  // Change events
  | "change.created"
  | "change.submitted_for_approval"
  | "change.approved"
  | "change.rejected"
  | "change.implemented"
  // Request events
  | "request.created"
  | "request.status_changed"
  | "request.approved"
  | "request.rejected"
  // Problem events
  | "problem.created"
  | "problem.updated"
  | "problem.status_changed"
  // Approval events
  | "approval.pending"
  | "approval.overdue"
  // Scheduled
  | "schedule.cron"               // cron expression (time-based rules)
  // Lifecycle events
  | "ticket.reopened"             // ticket moved from resolved/closed back to open
  | "ticket.merged"               // this ticket was merged into another
  | "incident.resolved"           // incident marked resolved
  | "incident.closed"             // incident marked closed
  | "problem.resolved"            // problem marked resolved
  | "change.rolled_back";         // change was rolled back

export const AUTOMATION_TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  "ticket.created":                 "Ticket Created",
  "ticket.updated":                 "Ticket Updated",
  "ticket.status_changed":          "Ticket Status Changed",
  "ticket.assigned":                "Ticket Assigned",
  "ticket.unassigned":              "Ticket Unassigned",
  "ticket.escalated":               "Ticket Escalated",
  "ticket.deescalated":             "Ticket De-escalated",
  "ticket.reply_received":          "Customer Replied",
  "ticket.reply_sent":              "Agent Replied",
  "ticket.note_added":              "Note Added",
  "ticket.priority_changed":        "Ticket Priority Changed",
  "ticket.category_changed":        "Ticket Category Changed",
  "ticket.due_date_changed":        "Due Date Changed",
  "ticket.custom_field_changed":    "Custom Field Changed",
  "ticket.sla_warning":             "SLA Warning",
  "ticket.sla_breached":            "SLA Breached",
  "ticket.idle":                    "Ticket Idle",
  "ticket.pending_since":           "Pending Response",
  "ticket.age":                     "Ticket Age Reached",
  "incident.created":               "Incident Created",
  "incident.severity_changed":      "Incident Severity Changed",
  "incident.status_changed":        "Incident Status Changed",
  "incident.assigned":              "Incident Assigned",
  "change.created":                 "Change Request Created",
  "change.submitted_for_approval":  "Change Submitted for Approval",
  "change.approved":                "Change Approved",
  "change.rejected":                "Change Rejected",
  "change.implemented":             "Change Implemented",
  "request.created":                "Service Request Created",
  "request.status_changed":         "Request Status Changed",
  "request.approved":               "Request Approved",
  "request.rejected":               "Request Rejected",
  "problem.created":                "Problem Created",
  "problem.updated":                "Problem Updated",
  "problem.status_changed":         "Problem Status Changed",
  "approval.pending":               "Approval Pending",
  "approval.overdue":               "Approval Overdue",
  "schedule.cron":                  "Scheduled (Cron)",
  "ticket.reopened":                "Ticket Reopened",
  "ticket.merged":                  "Ticket Merged",
  "incident.resolved":              "Incident Resolved",
  "incident.closed":                "Incident Closed",
  "problem.resolved":               "Problem Resolved",
  "change.rolled_back":             "Change Rolled Back",
};

// ── Condition operators ───────────────────────────────────────────────────────

export type ConditionOperator =
  | "eq"         // equals
  | "neq"        // not equals
  | "contains"   // string contains
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "is_empty"
  | "is_not_empty"
  | "in"         // value in list
  | "not_in"
  | "gt"         // greater than (numeric)
  | "gte"
  | "lt"
  | "lte"
  | "matches_regex";

export const CONDITION_OPERATOR_LABELS: Record<ConditionOperator, string> = {
  eq:            "is",
  neq:           "is not",
  contains:      "contains",
  not_contains:  "does not contain",
  starts_with:   "starts with",
  ends_with:     "ends with",
  is_empty:      "is empty",
  is_not_empty:  "is not empty",
  in:            "is one of",
  not_in:        "is not one of",
  gt:            "greater than",
  gte:           "at least",
  lt:            "less than",
  lte:           "at most",
  matches_regex: "matches regex",
};

// ── Action types ──────────────────────────────────────────────────────────────

export type AutomationActionType =
  // Field actions
  | "set_field"
  | "set_priority"
  | "set_category"
  | "set_status"
  | "set_type"
  | "set_severity"
  | "set_impact"
  | "set_urgency"
  | "add_tag"
  | "remove_tag"
  | "set_affected_system"
  // Assignment actions
  | "assign_agent"
  | "assign_team"
  | "assign_round_robin"     // distribute evenly among team members
  | "assign_least_loaded"    // assign to team member with fewest open tickets
  | "assign_smart"           // use team's configured routing strategy (TeamRoutingConfig)
  | "assign_by_skill"        // skill-based routing within a team
  | "unassign"
  // Communication actions
  | "add_note"
  | "send_reply"
  | "send_notification"
  // Lifecycle actions
  | "escalate"
  | "deescalate"
  | "resolve"
  | "close"
  | "reopen"
  // Approval actions
  | "create_approval"
  // SLA actions
  | "pause_sla"
  | "resume_sla"
  // Integration actions
  | "trigger_webhook"
  | "create_incident"
  // Control flow
  | "stop_processing"        // halt further rule evaluation for this entity
  // Intake-specific actions (intake_routing category)
  | "suppress_creation"      // soft-delete the ticket — discard spam / unwanted mail
  | "mark_spam"              // flag isSpam=true and close — counts against spam stats
  | "quarantine"             // flag isQuarantined=true — hold for manual review queue
  | "send_auto_reply"        // send a custom auto-reply email back to the sender
  | "add_watcher"            // add an agent as a ticket watcher
  // Event workflow actions
  | "notify_watchers"        // notify all ticket followers/watchers
  | "notify_requester"       // notify the ticket requester via email/in-app
  | "notify_approvers"       // notify pending approvers on this ticket's open approvals
  | "create_linked_task"     // create a linked change-task or action item
  | "chain_workflow"         // safely invoke another automation rule by ID
  // ── Data Enrichment & Field Automation ─────────────────────────────────────
  | "enrich_from_requester"  // copy requester/org metadata into ticket fields
  | "enrich_from_domain"     // infer fields (team, priority, category) from email domain
  | "enrich_from_keywords"   // infer fields from subject/body keyword patterns
  | "enrich_from_mailbox"    // set fields based on inbound mailbox alias
  | "set_custom_field"       // set a named custom field value (future-proof, arbitrary key)
  | "map_field"              // map source field value → target field via lookup table
  | "infer_priority"         // compute priority from impact × urgency matrix
  | "copy_field"             // copy one ticket field value to another field
  // ── Record Lifecycle Automation ───────────────────────────────────────────
  | "close_stale"            // close a ticket that has been inactive, add note
  | "create_linked_problem"  // create a Problem record and link it to this ticket
  | "create_linked_change"   // create a Change record linked to this ticket
  | "create_linked_request"  // create a ServiceRequest linked to this ticket
  | "create_child_ticket"    // create a child/sub-ticket with this as parent
  | "create_follow_up"       // create a post-incident/post-change follow-up item
  | "link_to_problem"        // link this ticket to an existing problem by ID
  | "update_linked_records"  // propagate a field update to all linked ITIL records
  | "merge_into_ticket";     // merge this ticket into a target ticket (with guardrails)

export const AUTOMATION_ACTION_LABELS: Record<AutomationActionType, string> = {
  set_field:          "Set Field",
  set_priority:       "Set Priority",
  set_category:       "Set Category",
  set_status:         "Set Status",
  set_type:           "Set Ticket Type",
  set_severity:       "Set Severity",
  set_impact:         "Set Impact",
  set_urgency:        "Set Urgency",
  add_tag:            "Add Tag",
  remove_tag:         "Remove Tag",
  set_affected_system:"Set Affected System",
  assign_agent:       "Assign to Agent",
  assign_team:        "Assign to Team",
  assign_round_robin: "Assign (Round Robin)",
  assign_least_loaded:"Assign (Least Loaded)",
  assign_smart:       "Assign (Team Policy — Smart Route)",
  assign_by_skill:    "Assign (Skill-Based)",
  unassign:           "Unassign",
  add_note:           "Add Internal Note",
  send_reply:         "Send Reply",
  send_notification:  "Send Notification",
  escalate:           "Escalate",
  deescalate:         "De-escalate",
  resolve:            "Resolve Ticket",
  close:              "Close Ticket",
  reopen:             "Reopen Ticket",
  create_approval:    "Create Approval Request",
  pause_sla:          "Pause SLA",
  resume_sla:         "Resume SLA",
  trigger_webhook:    "Trigger Outbound Webhook",
  create_incident:    "Create Linked Incident",
  stop_processing:    "Stop Rule Processing",
  suppress_creation:  "Suppress / Discard Ticket",
  mark_spam:          "Mark as Spam",
  quarantine:         "Quarantine for Review",
  send_auto_reply:    "Send Custom Auto-Reply",
  add_watcher:        "Add Watcher",
  notify_watchers:    "Notify All Watchers",
  notify_requester:   "Notify Requester",
  notify_approvers:   "Notify Pending Approvers",
  create_linked_task: "Create Linked Task",
  chain_workflow:     "Chain to Another Rule",
  // Enrichment actions
  enrich_from_requester: "Enrich from Requester / Org Data",
  enrich_from_domain:    "Enrich from Email Domain",
  enrich_from_keywords:  "Enrich from Subject / Body Keywords",
  enrich_from_mailbox:   "Enrich from Mailbox Alias",
  set_custom_field:      "Set Custom Field",
  map_field:             "Map Field Value (Lookup Table)",
  infer_priority:        "Infer Priority (Impact × Urgency Matrix)",
  copy_field:            "Copy Field Value",
  // Lifecycle actions
  close_stale:           "Close Stale Record",
  create_linked_problem: "Create Linked Problem",
  create_linked_change:  "Create Linked Change Request",
  create_linked_request: "Create Linked Service Request",
  create_child_ticket:   "Create Child Ticket",
  create_follow_up:      "Create Follow-Up Item",
  link_to_problem:       "Link to Existing Problem",
  update_linked_records: "Update Linked Records",
  merge_into_ticket:     "Merge Into Another Ticket",
};

// ── Entity types ──────────────────────────────────────────────────────────────

export type AutomationEntityType = "ticket" | "incident" | "change" | "request";

// ── Category → available triggers (used by the rule form trigger picker) ─────

export const CATEGORY_TRIGGERS: Record<AutomationCategory, AutomationTriggerType[]> = {
  intake_routing: [
    "ticket.created",
  ],
  event_workflow: [
    "ticket.created",
    "ticket.updated",
    "ticket.status_changed",
    "ticket.priority_changed",
    "ticket.category_changed",
    "ticket.due_date_changed",
    "ticket.custom_field_changed",
    "ticket.assigned",
    "ticket.unassigned",
    "ticket.escalated",
    "ticket.deescalated",
    "ticket.reply_received",
    "ticket.reply_sent",
    "ticket.note_added",
    "ticket.sla_warning",
    "ticket.sla_breached",
    "incident.created",
    "incident.severity_changed",
    "incident.status_changed",
    "incident.assigned",
    "change.created",
    "change.submitted_for_approval",
    "change.approved",
    "change.rejected",
    "change.implemented",
    "request.created",
    "request.status_changed",
    "request.approved",
    "request.rejected",
    "problem.created",
    "problem.updated",
    "problem.status_changed",
    "approval.pending",
    "approval.overdue",
  ],
  time_supervisor: [
    "ticket.sla_warning",
    "ticket.sla_breached",
    "ticket.idle",
    "ticket.pending_since",
    "ticket.age",
    "schedule.cron",
  ],
  assignment_routing: [
    "ticket.created",
    "ticket.updated",
    "ticket.assigned",
    "ticket.unassigned",
    "ticket.status_changed",
  ],
  approval_automation: [
    "ticket.created",
    "change.created",
    "change.submitted_for_approval",
    "request.created",
    "approval.pending",
    "approval.overdue",
  ],
  notification_automation: [
    "ticket.created",
    "ticket.status_changed",
    "ticket.priority_changed",
    "ticket.assigned",
    "ticket.escalated",
    "ticket.sla_breached",
    "ticket.reply_sent",
    "ticket.reply_received",
    "ticket.note_added",
    "incident.created",
    "change.approved",
    "change.rejected",
  ],
  field_automation: [
    "ticket.created",
    "ticket.updated",
    "ticket.custom_field_changed",
    "ticket.reply_received",
    "ticket.status_changed",
    "incident.created",
    "change.created",
    "request.created",
    "problem.created",
  ],
  lifecycle: [
    "ticket.idle",
    "ticket.age",
    "ticket.sla_breached",
    "ticket.status_changed",
    "ticket.reply_received",
    "ticket.reopened",
    "ticket.merged",
    "ticket.escalated",
    "ticket.resolved" as AutomationTriggerType,
    "incident.created",
    "incident.resolved",
    "incident.closed",
    "change.implemented",
    "change.rolled_back",
    "problem.resolved",
    "request.approved",
    "schedule.cron",
  ],
  integration_webhook: [
    "ticket.created",
    "ticket.status_changed",
    "ticket.assigned",
    "ticket.sla_breached",
    "ticket.escalated",
    "incident.created",
    "change.approved",
    "request.approved",
  ],
};

// ── Category → default triggers map ──────────────────────────────────────────

export const CATEGORY_DEFAULT_TRIGGERS: Record<AutomationCategory, AutomationTriggerType[]> = {
  intake_routing:          ["ticket.created"],
  event_workflow:          ["ticket.created", "ticket.updated", "ticket.status_changed"],
  time_supervisor:         ["ticket.sla_warning", "ticket.sla_breached", "ticket.idle", "ticket.age"],
  assignment_routing:      ["ticket.created", "ticket.updated"],
  approval_automation:     ["ticket.created", "change.submitted_for_approval", "request.created"],
  notification_automation: ["ticket.created", "ticket.status_changed", "ticket.sla_breached"],
  field_automation:        ["ticket.created", "ticket.updated", "incident.created", "change.created"],
  lifecycle:               ["ticket.idle", "ticket.age", "ticket.sla_breached", "ticket.reopened"],
  integration_webhook:     ["ticket.created", "ticket.status_changed", "ticket.resolved" as AutomationTriggerType],
};
