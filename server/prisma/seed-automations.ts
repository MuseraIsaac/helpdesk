/**
 * seed-automations.ts
 *
 * Seeds a library of common ITSM automation rules across all 9 categories.
 * All rules are seeded as DISABLED (isEnabled: false) so they appear in the
 * Automation Platform UI but won't fire until an admin reviews and toggles
 * them on.
 *
 * Idempotent: rules are upserted by (category, name) — re-running does not
 * duplicate. Existing rule definitions are NOT overwritten so admin edits
 * are preserved; only newly-named rules are inserted.
 *
 * Run with:   bun run server/prisma/seed-automations.ts
 *      (or)  cd server && bun run prisma/seed-automations.ts
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

type Category =
  | "intake_routing"
  | "event_workflow"
  | "time_supervisor"
  | "assignment_routing"
  | "approval_automation"
  | "notification_automation"
  | "field_automation"
  | "lifecycle"
  | "integration_webhook";

interface RuleSeed {
  name: string;
  description: string;
  triggers: any[];
  actions: any[];
  runOnce?: boolean;
  stopOnMatch?: boolean;
}

const EMPTY_CONDITIONS = { type: "group", operator: "AND", conditions: [] };

// ── Rule library ──────────────────────────────────────────────────────────────

const LIBRARY: Record<Category, RuleSeed[]> = {
  // ── 1. Intake & Routing ─────────────────────────────────────────────────────
  intake_routing: [
    {
      name: "Tag tickets from VIP customers",
      description: "Auto-tag tickets from VIP requesters so agents see priority context.",
      triggers: [{ type: "ticket.created" }],
      actions: [{ type: "add_tag", tag: "vip" }],
    },
    {
      name: "Mark obvious spam (Nigerian prince / lottery)",
      description: "Quarantine inbound mail with classic spam keywords for manual review.",
      triggers: [{ type: "ticket.created" }],
      actions: [{ type: "mark_spam" }],
    },
    {
      name: "Discard out-of-office auto-replies",
      description: "Suppress tickets that look like vacation auto-responders.",
      triggers: [{ type: "ticket.created" }],
      actions: [{ type: "suppress_creation" }],
    },
    {
      name: "Send 'we got your ticket' auto-reply",
      description: "Acknowledge new inbound tickets with a friendly auto-reply.",
      triggers: [{ type: "ticket.created" }],
      actions: [{
        type: "send_auto_reply",
        subject: "We received your request — {{ticket.number}}",
        body: "Hi {{requester.name}},\n\nThanks for reaching out. Your ticket {{ticket.number}} has been logged and an agent will respond shortly.\n\n— Support Team",
      }],
    },
    {
      name: "Categorise password reset requests",
      description: "Route any ticket whose subject mentions 'password' to the Account Access category.",
      triggers: [{ type: "ticket.created" }],
      actions: [{
        type: "enrich_from_keywords",
        patterns: [{
          keywords: ["password", "reset password", "can't log in", "locked out"],
          matchIn: "both", caseSensitive: false,
          field: "category", value: "account_access",
        }],
        firstMatchOnly: true,
      }],
    },
    {
      name: "Categorise billing & invoice questions",
      description: "Route tickets containing billing terms to the Billing category.",
      triggers: [{ type: "ticket.created" }],
      actions: [{
        type: "enrich_from_keywords",
        patterns: [{
          keywords: ["invoice", "billing", "refund", "charge", "payment"],
          matchIn: "both", caseSensitive: false,
          field: "category", value: "billing",
        }],
        firstMatchOnly: true,
      }],
    },
    {
      name: "Tag tickets from internal employees",
      description: "Add an 'internal' tag for tickets coming from the corporate domain.",
      triggers: [{ type: "ticket.created" }],
      actions: [{
        type: "enrich_from_domain",
        mappings: [{ domain: "company.com", field: "tag", value: "internal" }],
        firstMatchOnly: true,
      }],
    },
    {
      name: "Set urgency=high for outage keywords",
      description: "Raise urgency when subject/body contains outage / down / not working.",
      triggers: [{ type: "ticket.created" }],
      actions: [{
        type: "enrich_from_keywords",
        patterns: [{
          keywords: ["outage", "down", "not working", "everyone affected", "production down"],
          matchIn: "both", caseSensitive: false,
          field: "urgency", value: "high",
        }],
        firstMatchOnly: false,
      }],
    },
    {
      name: "Enrich tickets with requester organisation data",
      description: "Copy support tier, language, and timezone from requester profile onto the ticket.",
      triggers: [{ type: "ticket.created" }],
      actions: [{
        type: "enrich_from_requester",
        mappings: [
          { source: "supportTier", targetField: "custom_support_tier", onlyIfEmpty: true },
          { source: "language",    targetField: "custom_language",     onlyIfEmpty: true },
          { source: "timezone",    targetField: "custom_timezone",     onlyIfEmpty: true },
        ],
      }],
    },
    {
      name: "Route by inbound mailbox alias",
      description: "Set category based on which mailbox alias received the email (security@, hr@, billing@).",
      triggers: [{ type: "ticket.created" }],
      actions: [{
        type: "enrich_from_mailbox",
        mappings: [
          { alias: "security", field: "category", value: "security" },
          { alias: "hr",       field: "category", value: "human_resources" },
          { alias: "billing",  field: "category", value: "billing" },
        ],
      }],
    },
  ],

  // ── 2. Event Workflows ──────────────────────────────────────────────────────
  event_workflow: [
    {
      name: "Pause SLA when waiting on customer",
      description: "Pause SLA timers when a ticket transitions to 'pending customer' status.",
      triggers: [{ type: "ticket.status_changed" }],
      actions: [{ type: "pause_sla" }],
    },
    {
      name: "Resume SLA when customer replies",
      description: "Resume SLA timers as soon as the customer replies to a paused ticket.",
      triggers: [{ type: "ticket.reply_received" }],
      actions: [{ type: "resume_sla" }],
    },
    {
      name: "Auto-tag escalated tickets",
      description: "Add an 'escalated' tag whenever a ticket is escalated.",
      triggers: [{ type: "ticket.escalated" }],
      actions: [{ type: "add_tag", tag: "escalated" }],
    },
    {
      name: "Notify watchers on priority change",
      description: "Tell ticket watchers whenever priority is changed.",
      triggers: [{ type: "ticket.priority_changed" }],
      actions: [{
        type: "notify_watchers",
        title: "Priority changed on {{ticket.number}}",
        body: "Ticket {{ticket.number}} priority has changed. Subject: {{ticket.subject}}.",
        channels: ["in_app", "email"],
      }],
    },
    {
      name: "Auto-create incident from sev1 keywords",
      description: "Create a linked incident when a ticket mentions outage/sev1 patterns.",
      triggers: [{ type: "ticket.created" }],
      actions: [{ type: "create_incident", severity: "sev1", title: "Auto-created from ticket {{ticket.number}}" }],
    },
    {
      name: "Notify approvers when change submitted",
      description: "Notify pending approvers as soon as a change is submitted for approval.",
      triggers: [{ type: "change.submitted_for_approval" }],
      actions: [{
        type: "notify_approvers",
        title: "Change awaiting your approval",
        body: "A change request has been submitted and is awaiting your decision.",
        channels: ["in_app", "email"],
      }],
    },
    {
      name: "Internal note when ticket reopened",
      description: "Add an audit-trail note whenever a ticket transitions back to open.",
      triggers: [{ type: "ticket.reopened" }],
      actions: [{ type: "add_note", body: "Ticket was reopened — please re-triage.", isPinned: false }],
    },
    {
      name: "Notify requester on status change",
      description: "Email the requester whenever the ticket status changes.",
      triggers: [{ type: "ticket.status_changed" }],
      actions: [{
        type: "notify_requester",
        subject: "Update on your ticket {{ticket.number}}",
        body: "Hi {{requester.name}},\n\nThe status of your ticket {{ticket.number}} has been updated. We will continue to keep you informed.",
        sendEmail: true,
      }],
    },
    {
      name: "Tag tickets that received customer reply",
      description: "Add a 'customer-replied' tag so agents can filter pending responses quickly.",
      triggers: [{ type: "ticket.reply_received" }],
      actions: [{ type: "add_tag", tag: "customer-replied" }],
    },
    {
      name: "Stop processing for spam-flagged tickets",
      description: "If a ticket is marked spam, halt evaluation of further rules.",
      triggers: [{ type: "ticket.updated" }],
      actions: [{ type: "stop_processing" }],
    },
  ],

  // ── 3. Time-Based Rules ─────────────────────────────────────────────────────
  time_supervisor: [
    {
      name: "Warn agent at 50% of SLA",
      description: "Notify the assignee when a ticket reaches 50% of its SLA window.",
      triggers: [{ type: "ticket.sla_warning", thresholdPercent: 50 }],
      actions: [{
        type: "send_notification",
        recipientType: "assignee",
        title: "SLA at 50% — {{ticket.number}}",
        body: "Half of the SLA window has elapsed for ticket {{ticket.number}}.",
        channels: ["in_app"],
        useTemplateVars: true,
      }],
    },
    {
      name: "Warn agent at 80% of SLA",
      description: "Strong warning at 80% SLA so the agent can pre-empt a breach.",
      triggers: [{ type: "ticket.sla_warning", thresholdPercent: 80 }],
      actions: [{
        type: "send_notification",
        recipientType: "assignee",
        title: "SLA at 80% — {{ticket.number}}",
        body: "Ticket {{ticket.number}} is at risk of breaching SLA.",
        channels: ["in_app", "email"],
        useTemplateVars: true,
      }],
    },
    {
      name: "Escalate on SLA breach",
      description: "Auto-escalate any ticket whose SLA has been breached.",
      triggers: [{ type: "ticket.sla_breached" }],
      actions: [{ type: "escalate", reason: "SLA breached automatically" }],
    },
    {
      name: "Notify supervisors on SLA breach",
      description: "Page supervisors any time an SLA is missed.",
      triggers: [{ type: "ticket.sla_breached" }],
      actions: [{
        type: "send_notification",
        recipientType: "supervisor",
        title: "SLA breached — {{ticket.number}}",
        body: "Ticket {{ticket.number}} has breached its SLA and was auto-escalated.",
        channels: ["in_app", "email"],
        useTemplateVars: true,
      }],
    },
    {
      name: "Nudge on tickets idle for 24h",
      description: "Internal note on tickets with no activity for 24 hours.",
      triggers: [{ type: "ticket.idle", hours: 24 }],
      actions: [{ type: "add_note", body: "No activity in 24 hours — please follow up.", isPinned: false }],
    },
    {
      name: "Nudge on tickets idle for 72h",
      description: "Stronger nudge after three days of inactivity.",
      triggers: [{ type: "ticket.idle", hours: 72 }],
      actions: [{
        type: "send_notification",
        recipientType: "assignee",
        title: "Ticket idle for 3 days — {{ticket.number}}",
        body: "Ticket {{ticket.number}} has had no activity for 72 hours.",
        channels: ["in_app", "email"],
        useTemplateVars: true,
      }],
    },
    {
      name: "Alert if ticket pending response > 8h",
      description: "Flag tickets where the customer is waiting for a reply for more than 8 hours.",
      triggers: [{ type: "ticket.pending_since", hours: 8 }],
      actions: [{ type: "add_tag", tag: "awaiting-agent" }],
    },
    {
      name: "Auto-close tickets aged 30 days",
      description: "Close tickets that have been open for 30 days with no resolution.",
      triggers: [{ type: "ticket.age", hours: 24 * 30 }],
      actions: [{ type: "close_stale", reason: "Auto-closed after 30 days of inactivity.", addNote: true }],
    },
    {
      name: "Daily 9am stale-ticket sweep",
      description: "Cron job that runs every weekday at 9am to flag stale tickets.",
      triggers: [{ type: "schedule.cron", cron: "0 9 * * 1-5", timezone: "UTC" }],
      actions: [{ type: "add_note", body: "Daily sweep — please review queue.", isPinned: false }],
    },
    {
      name: "Hourly approval-overdue sweep",
      description: "Every hour, check for approvals that have exceeded their SLA.",
      triggers: [{ type: "schedule.cron", cron: "0 * * * *", timezone: "UTC" }],
      actions: [{
        type: "send_notification",
        recipientType: "supervisor",
        title: "Approval overdue check",
        body: "Hourly approval sweep ran.",
        channels: ["in_app"],
        useTemplateVars: false,
      }],
    },
  ],

  // ── 4. Assignment Routing ───────────────────────────────────────────────────
  assignment_routing: [
    {
      name: "Round-robin within Tier 1 team",
      description: "Distribute new tickets evenly among available Tier 1 agents.",
      triggers: [{ type: "ticket.created" }],
      actions: [{ type: "assign_round_robin", teamId: 1, teamName: "Tier 1", onlyAvailable: true }],
    },
    {
      name: "Least-loaded routing for Tier 2",
      description: "Send escalated tickets to the Tier 2 agent with fewest open tickets.",
      triggers: [{ type: "ticket.escalated" as any }],
      actions: [{ type: "assign_least_loaded", teamId: 2, teamName: "Tier 2", onlyAvailable: true }],
    },
    {
      name: "Smart-route by team policy",
      description: "Use the team's configured routing strategy for incoming tickets.",
      triggers: [{ type: "ticket.created" }],
      actions: [{ type: "assign_smart", teamId: 1, teamName: "Default", requiredSkills: [] }],
    },
    {
      name: "Skill-based routing for security tickets",
      description: "Route security category tickets to agents with the 'security' skill.",
      triggers: [{ type: "ticket.created" }],
      actions: [{
        type: "assign_by_skill",
        teamId: 1, teamName: "Security",
        requiredSkills: ["security"], skillMatchMode: "required",
      }],
    },
    {
      name: "Skill-based routing for cloud / AWS tickets",
      description: "Route AWS-tagged tickets to agents with cloud expertise (preferred match).",
      triggers: [{ type: "ticket.created" }],
      actions: [{
        type: "assign_by_skill",
        teamId: 1, teamName: "Cloud Ops",
        requiredSkills: ["aws", "cloud"], skillMatchMode: "preferred",
      }],
    },
    {
      name: "Reassign on agent unavailability",
      description: "If a ticket becomes unassigned, round-robin it back into the queue.",
      triggers: [{ type: "ticket.unassigned" }],
      actions: [{ type: "assign_round_robin", teamId: 1, teamName: "Tier 1", onlyAvailable: true }],
    },
    {
      name: "Assign VIP tickets to senior team",
      description: "Send tickets tagged 'vip' straight to the senior support team.",
      triggers: [{ type: "ticket.created" }],
      actions: [{ type: "assign_team", teamId: 3, teamName: "Senior Support" }],
    },
    {
      name: "Route billing tickets to billing team",
      description: "Auto-assign tickets in the Billing category to the Billing team.",
      triggers: [{ type: "ticket.updated" }],
      actions: [{ type: "assign_team", teamId: 4, teamName: "Billing" }],
    },
    {
      name: "Unassign on status=on_hold",
      description: "Free the agent's queue slot when a ticket goes on hold.",
      triggers: [{ type: "ticket.status_changed" }],
      actions: [{ type: "unassign" }],
    },
    {
      name: "Auto-add team supervisor as watcher",
      description: "Add the team supervisor as a watcher on every newly assigned ticket.",
      triggers: [{ type: "ticket.assigned" }],
      actions: [{ type: "add_watcher", watcherId: "supervisor-placeholder", watcherName: "Team Supervisor" }],
    },
  ],

  // ── 5. Approval Automation ──────────────────────────────────────────────────
  approval_automation: [
    {
      name: "Require manager approval on emergency change",
      description: "Auto-create an approval request whenever an emergency change is opened.",
      triggers: [{ type: "change.created" }],
      actions: [{
        type: "create_approval",
        approverIds: ["manager-placeholder"],
        approvalMode: "all",
        title: "Emergency Change Approval — {{ticket.subject}}",
        description: "Please review and approve this emergency change.",
        expiresInHours: 4,
      }],
    },
    {
      name: "Require CAB approval on normal changes",
      description: "Send normal changes to the CAB for review.",
      triggers: [{ type: "change.submitted_for_approval" }],
      actions: [{
        type: "create_approval",
        approverIds: ["cab-member-1", "cab-member-2", "cab-member-3"],
        approvalMode: "any",
        requiredCount: 2,
        title: "CAB Review — {{ticket.subject}}",
        description: "CAB members: please review this change.",
        expiresInHours: 72,
      }],
    },
    {
      name: "Auto-approve standard pre-approved changes",
      description: "Automatically advance changes flagged as 'standard' / pre-approved.",
      triggers: [{ type: "change.submitted_for_approval" }],
      actions: [{ type: "set_status", status: "in_progress" }],
    },
    {
      name: "Notify approvers when approval pending > 24h",
      description: "Remind approvers that a request has been waiting 24 hours.",
      triggers: [{ type: "approval.overdue" }],
      actions: [{
        type: "notify_approvers",
        title: "Reminder: approval pending for 24h",
        body: "An approval request is still awaiting your decision. Please review.",
        channels: ["in_app", "email"],
      }],
    },
    {
      name: "Require finance approval on high-cost requests",
      description: "Tickets in the 'procurement' category trigger finance approval.",
      triggers: [{ type: "request.created" }],
      actions: [{
        type: "create_approval",
        approverIds: ["finance-lead"],
        approvalMode: "all",
        title: "Finance Approval — {{ticket.subject}}",
        description: "Finance review required for procurement request.",
        expiresInHours: 48,
      }],
    },
    {
      name: "Require security approval on access requests",
      description: "Access-grant tickets require security team sign-off.",
      triggers: [{ type: "request.created" }],
      actions: [{
        type: "create_approval",
        approverIds: ["security-lead"],
        approvalMode: "all",
        title: "Security Approval — {{ticket.subject}}",
        description: "Access request — please review.",
        expiresInHours: 24,
      }],
    },
    {
      name: "Escalate stale approvals to supervisor",
      description: "If an approval is overdue, escalate the underlying ticket.",
      triggers: [{ type: "approval.overdue" }],
      actions: [{ type: "escalate", reason: "Approval overdue" }],
    },
    {
      name: "Notify requester when approval is pending",
      description: "Tell the requester their request is awaiting approval.",
      triggers: [{ type: "approval.pending" }],
      actions: [{
        type: "notify_requester",
        subject: "Your request is being reviewed",
        body: "Hi {{requester.name}},\n\nYour request {{ticket.number}} is awaiting approval. We will update you once a decision is made.",
        sendEmail: true,
      }],
    },
    {
      name: "Auto-close rejected change requests",
      description: "Close the change record when its approval is rejected.",
      triggers: [{ type: "change.rejected" }],
      actions: [{ type: "close" }],
    },
    {
      name: "Add note when approval expires",
      description: "Audit-trail note whenever an approval window expires without a decision.",
      triggers: [{ type: "approval.overdue" }],
      actions: [{ type: "add_note", body: "Approval window expired — manual intervention required.", isPinned: true }],
    },
  ],

  // ── 6. Notification Rules ───────────────────────────────────────────────────
  notification_automation: [
    {
      name: "Notify assignee on new ticket",
      description: "In-app notification to the agent when they are assigned a new ticket.",
      triggers: [{ type: "ticket.assigned" }],
      actions: [{
        type: "send_notification",
        recipientType: "assignee",
        title: "New ticket assigned — {{ticket.number}}",
        body: "You've been assigned ticket {{ticket.number}}: {{ticket.subject}}.",
        channels: ["in_app"],
        useTemplateVars: true,
      }],
    },
    {
      name: "Email requester on first reply",
      description: "Send the requester an email confirming an agent has responded.",
      triggers: [{ type: "ticket.reply_sent" }],
      actions: [{
        type: "notify_requester",
        subject: "Reply on your ticket {{ticket.number}}",
        body: "An agent has responded to your ticket {{ticket.number}}.",
        sendEmail: true,
      }],
    },
    {
      name: "Page on-call team for sev1 incidents",
      description: "Slack-page the on-call team whenever a sev1 incident is created.",
      triggers: [{ type: "incident.created" }],
      actions: [{
        type: "send_notification",
        recipientType: "specific_team",
        recipientTeamId: 1,
        title: "SEV-1 incident — {{ticket.number}}",
        body: "Sev1 incident reported: {{ticket.subject}}.",
        channels: ["in_app", "email", "slack"],
        useTemplateVars: true,
      }],
    },
    {
      name: "Notify watchers on resolution",
      description: "Tell ticket watchers once a ticket is resolved.",
      triggers: [{ type: "ticket.status_changed" }],
      actions: [{
        type: "notify_watchers",
        title: "Ticket resolved — {{ticket.number}}",
        body: "Ticket {{ticket.number}} has been marked resolved.",
        channels: ["in_app"],
      }],
    },
    {
      name: "Notify supervisors on escalation",
      description: "Page supervisors whenever a ticket is escalated.",
      triggers: [{ type: "ticket.escalated" }],
      actions: [{
        type: "send_notification",
        recipientType: "supervisor",
        title: "Ticket escalated — {{ticket.number}}",
        body: "Ticket {{ticket.number}} has been escalated and needs supervisor attention.",
        channels: ["in_app", "email"],
        useTemplateVars: true,
      }],
    },
    {
      name: "Slack the team on sev1 / sev2 priority change",
      description: "Slack alert when a ticket is upgraded to high or critical priority.",
      triggers: [{ type: "ticket.priority_changed" }],
      actions: [{
        type: "send_notification",
        recipientType: "team",
        title: "Priority upgraded — {{ticket.number}}",
        body: "{{ticket.number}} priority has been upgraded.",
        channels: ["slack", "in_app"],
        useTemplateVars: true,
      }],
    },
    {
      name: "Email change-requester on approval",
      description: "Notify the requester when their change is approved.",
      triggers: [{ type: "change.approved" }],
      actions: [{
        type: "notify_requester",
        subject: "Your change request was approved",
        body: "Your change request has been approved and may proceed.",
        sendEmail: true,
      }],
    },
    {
      name: "Email change-requester on rejection",
      description: "Notify the requester when their change is rejected.",
      triggers: [{ type: "change.rejected" }],
      actions: [{
        type: "notify_requester",
        subject: "Your change request was rejected",
        body: "Your change request was not approved. Please review the comments and resubmit if needed.",
        sendEmail: true,
      }],
    },
    {
      name: "Notify assignee when customer replies",
      description: "Push a notification to the agent any time the customer replies.",
      triggers: [{ type: "ticket.reply_received" }],
      actions: [{
        type: "send_notification",
        recipientType: "assignee",
        title: "Customer replied — {{ticket.number}}",
        body: "The customer has replied to {{ticket.number}}.",
        channels: ["in_app"],
        useTemplateVars: true,
      }],
    },
    {
      name: "Notify supervisor on SLA breach",
      description: "Send a high-priority alert to supervisors any time SLA is missed.",
      triggers: [{ type: "ticket.sla_breached" }],
      actions: [{
        type: "send_notification",
        recipientType: "supervisor",
        title: "SLA breached — {{ticket.number}}",
        body: "SLA missed on ticket {{ticket.number}}.",
        channels: ["in_app", "email", "slack"],
        useTemplateVars: true,
      }],
    },
  ],

  // ── 7. Field Automation ─────────────────────────────────────────────────────
  field_automation: [
    {
      name: "Infer priority from impact × urgency",
      description: "Compute priority using the standard ITIL impact/urgency matrix.",
      triggers: [{ type: "ticket.created" }],
      actions: [{
        type: "infer_priority",
        matrix: {
          high_high: "critical", high_medium: "high", high_low: "high",
          medium_high: "high", medium_medium: "medium", medium_low: "medium",
          low_high: "medium",  low_medium: "low",     low_low: "low",
        },
        onlyIfEmpty: true,
      }],
    },
    {
      name: "Set affected system from keywords",
      description: "Detect the affected system (Jira, Salesforce, Office365…) from ticket text.",
      triggers: [{ type: "ticket.created" }],
      actions: [{
        type: "enrich_from_keywords",
        patterns: [
          { keywords: ["jira"],        matchIn: "both", caseSensitive: false, field: "affected_system", value: "Jira" },
          { keywords: ["salesforce"],  matchIn: "both", caseSensitive: false, field: "affected_system", value: "Salesforce" },
          { keywords: ["office 365","outlook","teams"], matchIn: "both", caseSensitive: false, field: "affected_system", value: "Office 365" },
          { keywords: ["zoom"],        matchIn: "both", caseSensitive: false, field: "affected_system", value: "Zoom" },
        ],
        firstMatchOnly: true,
      }],
    },
    {
      name: "Map support-tier → priority",
      description: "Translate the requester's support tier into a default ticket priority.",
      triggers: [{ type: "ticket.created" }],
      actions: [{
        type: "map_field",
        sourceField: "requester.supportTier",
        targetField: "priority",
        mappings: [
          { from: "platinum", to: "high" },
          { from: "gold",     to: "medium" },
          { from: "silver",   to: "low" },
          { from: "bronze",   to: "low" },
        ],
        fallback: "medium",
        onlyIfEmpty: true,
      }],
    },
    {
      name: "Copy requester language to custom field",
      description: "Copy the requester's profile language into the ticket's language custom field.",
      triggers: [{ type: "ticket.created" }],
      actions: [{
        type: "copy_field",
        sourceField: "requester.language",
        targetField: "custom_language",
        transform: "lowercase",
        onlyIfEmpty: true,
      }],
    },
    {
      name: "Tag tickets from VIP organisations",
      description: "Tag tickets where the org's industry is finance/healthcare with 'regulated'.",
      triggers: [{ type: "ticket.created" }],
      actions: [{
        type: "map_field",
        sourceField: "requester.orgIndustry",
        targetField: "tag",
        mappings: [
          { from: "finance",    to: "regulated" },
          { from: "healthcare", to: "regulated" },
          { from: "government", to: "regulated" },
        ],
      }],
    },
    {
      name: "Set custom 'first_response_template' field",
      description: "Pre-populate the first-response template hint on every new ticket.",
      triggers: [{ type: "ticket.created" }],
      actions: [{
        type: "set_custom_field",
        key: "first_response_template",
        value: "default_v1",
        onlyIfEmpty: true,
      }],
    },
    {
      name: "Auto-set severity from priority",
      description: "When priority is 'critical', set severity to sev1 automatically.",
      triggers: [{ type: "ticket.priority_changed" }],
      actions: [{ type: "set_severity", severity: "sev1" }],
    },
    {
      name: "Auto-set urgency=high for outage category",
      description: "Tickets categorised as 'outage' inherit urgency=high.",
      triggers: [{ type: "ticket.category_changed" }],
      actions: [{ type: "set_urgency", urgency: "high" }],
    },
    {
      name: "Detect 'urgent' / 'asap' in body → high priority",
      description: "Promote tickets to high priority when language signals urgency.",
      triggers: [{ type: "ticket.created" }],
      actions: [{
        type: "enrich_from_keywords",
        patterns: [{
          keywords: ["urgent", "asap", "immediately", "right now"],
          matchIn: "body", caseSensitive: false,
          field: "priority", value: "high",
        }],
        firstMatchOnly: true,
      }],
    },
    {
      name: "Set category=hardware for hardware keywords",
      description: "Auto-categorise hardware-related tickets.",
      triggers: [{ type: "ticket.created" }],
      actions: [{
        type: "enrich_from_keywords",
        patterns: [{
          keywords: ["laptop", "monitor", "keyboard", "mouse", "headset", "broken screen"],
          matchIn: "both", caseSensitive: false,
          field: "category", value: "hardware",
        }],
        firstMatchOnly: true,
      }],
    },
  ],

  // ── 8. Lifecycle Rules ──────────────────────────────────────────────────────
  lifecycle: [
    {
      name: "Auto-resolve tickets idle 7 days in 'pending customer'",
      description: "Close tickets the customer has stopped responding to.",
      triggers: [{ type: "ticket.idle", hours: 24 * 7 }],
      actions: [{
        type: "close_stale",
        reason: "Auto-resolved after 7 days with no customer response.",
        addNote: true,
        allowedFromStatuses: ["open", "in_progress"],
      }],
    },
    {
      name: "Auto-close resolved tickets after 3 days",
      description: "Move resolved tickets to closed once the customer has had 3 days to respond.",
      triggers: [{ type: "ticket.age", hours: 24 * 3 }],
      actions: [{ type: "close" }],
    },
    {
      name: "Reopen ticket when customer replies after resolve",
      description: "If the customer replies on a resolved ticket, reopen it for the agent.",
      triggers: [{ type: "ticket.reply_received" }],
      actions: [{ type: "reopen" }],
    },
    {
      name: "Create linked Problem from recurring incident",
      description: "When an incident is reopened, draft a Problem record for root cause analysis.",
      triggers: [{ type: "ticket.reopened" }],
      actions: [{
        type: "create_linked_problem",
        title: "Recurring issue: {{ticket.subject}}",
        description: "Auto-created from reopened ticket {{ticket.number}}.",
        priority: "high",
        skipIfLinked: true,
      }],
    },
    {
      name: "Create post-incident follow-up",
      description: "When an incident is resolved, schedule a 24h follow-up review.",
      triggers: [{ type: "incident.resolved" }],
      actions: [{
        type: "create_follow_up",
        title: "Post-incident review: {{ticket.subject}}",
        body: "Conduct a post-incident review for {{ticket.number}}.",
        dueInHours: 24,
      }],
    },
    {
      name: "Create change rollback follow-up",
      description: "When a change is rolled back, file a follow-up task.",
      triggers: [{ type: "change.rolled_back" }],
      actions: [{
        type: "create_follow_up",
        title: "Rollback investigation: {{ticket.subject}}",
        body: "A change was rolled back — investigate cause.",
        dueInHours: 48,
      }],
    },
    {
      name: "Update linked records on incident closure",
      description: "When the incident closes, mark linked changes/requests as completed too.",
      triggers: [{ type: "incident.closed" }],
      actions: [{
        type: "update_linked_records",
        recordTypes: ["change", "request"],
        action: "add_note",
        value: "Linked incident has been closed.",
      }],
    },
    {
      name: "Daily auto-close stale tickets sweep",
      description: "Cron-driven sweep that closes any open ticket idle > 30 days.",
      triggers: [{ type: "schedule.cron", cron: "0 2 * * *", timezone: "UTC" }],
      actions: [{
        type: "close_stale",
        reason: "Auto-closed by daily stale sweep.",
        addNote: true,
        allowedFromStatuses: ["open", "in_progress"],
      }],
    },
    {
      name: "Tag escalated tickets for retro",
      description: "Tag escalated tickets so they appear in the weekly retro view.",
      triggers: [{ type: "ticket.escalated" }],
      actions: [{ type: "add_tag", tag: "retro-needed" }],
    },
    {
      name: "Add resolution-survey note on resolve",
      description: "Add an internal note prompting the agent to send a CSAT survey.",
      triggers: [{ type: "ticket.status_changed" }],
      actions: [{ type: "add_note", body: "Reminder: send CSAT survey to requester.", isPinned: false }],
    },
  ],

  // ── 9. Integrations / Webhooks ──────────────────────────────────────────────
  integration_webhook: [
    {
      name: "Mirror new tickets to Slack",
      description: "Fire an outbound webhook to Slack whenever a ticket is created.",
      triggers: [{ type: "ticket.created" }],
      actions: [{ type: "trigger_webhook", webhookId: 1, webhookName: "Slack #support" }],
    },
    {
      name: "Mirror sev1 incidents to PagerDuty",
      description: "Fire a webhook to PagerDuty for any new sev1 incident.",
      triggers: [{ type: "incident.created" }],
      actions: [{ type: "trigger_webhook", webhookId: 2, webhookName: "PagerDuty" }],
    },
    {
      name: "Push status changes to Microsoft Teams",
      description: "Notify a Teams channel whenever a ticket's status changes.",
      triggers: [{ type: "ticket.status_changed" }],
      actions: [{ type: "trigger_webhook", webhookId: 3, webhookName: "MS Teams #ops" }],
    },
    {
      name: "Sync resolved tickets to data warehouse",
      description: "Send resolved tickets to the analytics pipeline for reporting.",
      triggers: [{ type: "ticket.status_changed" }],
      actions: [{ type: "trigger_webhook", webhookId: 4, webhookName: "Snowflake ETL" }],
    },
    {
      name: "Mirror approved changes to Jira",
      description: "When a change is approved, push it to Jira as an issue.",
      triggers: [{ type: "change.approved" }],
      actions: [{ type: "trigger_webhook", webhookId: 5, webhookName: "Jira sync" }],
    },
    {
      name: "Notify Datadog on SLA breach",
      description: "Send a webhook event to Datadog whenever SLA is breached.",
      triggers: [{ type: "ticket.sla_breached" }],
      actions: [{ type: "trigger_webhook", webhookId: 6, webhookName: "Datadog event" }],
    },
    {
      name: "Mirror assignment changes to internal CRM",
      description: "Whenever a ticket is reassigned, sync to the CRM.",
      triggers: [{ type: "ticket.assigned" }],
      actions: [{ type: "trigger_webhook", webhookId: 7, webhookName: "Internal CRM" }],
    },
    {
      name: "Mirror escalations to incident-bridge tool",
      description: "Open an incident bridge call automatically on escalation.",
      triggers: [{ type: "ticket.escalated" }],
      actions: [{ type: "trigger_webhook", webhookId: 8, webhookName: "Bridge call API" }],
    },
    {
      name: "Sync approved service-requests to procurement",
      description: "Send approved service-requests to the procurement system.",
      triggers: [{ type: "request.approved" }],
      actions: [{ type: "trigger_webhook", webhookId: 9, webhookName: "Procurement API" }],
    },
    {
      name: "Forward all ticket creates to audit log service",
      description: "Mirror every new ticket to the centralised audit/log service.",
      triggers: [{ type: "ticket.created" }],
      actions: [{ type: "trigger_webhook", webhookId: 10, webhookName: "Audit log" }],
    },
  ],
};

// ── Seeding logic ─────────────────────────────────────────────────────────────

async function main() {
  let inserted = 0;
  let skipped = 0;

  for (const [category, rules] of Object.entries(LIBRARY) as [Category, RuleSeed[]][]) {
    let order = 0;

    for (const rule of rules) {
      order += 10;

      const existing = await prisma.automationRule.findFirst({
        where: { category, name: rule.name },
        select: { id: true },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await prisma.automationRule.create({
        data: {
          name:        rule.name,
          description: rule.description,
          category,
          isEnabled:   false,
          order,
          triggers:    rule.triggers as any,
          conditions:  EMPTY_CONDITIONS as any,
          actions:     rule.actions as any,
          runOnce:     rule.runOnce ?? false,
          stopOnMatch: rule.stopOnMatch ?? false,
          version:     1,
        },
      });
      inserted++;
    }

    console.log(`[${category}] processed ${rules.length} rules`);
  }

  console.log(`\nDone — inserted ${inserted}, skipped ${skipped} (already existed).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
