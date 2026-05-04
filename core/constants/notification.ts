/**
 * Notification system — event types, channel types, and shared interfaces.
 * Shared between server and client.
 */

// ── Event types ───────────────────────────────────────────────────────────────

export type NotificationEvent =
  | "ticket.created"
  | "ticket.assigned"
  | "ticket.escalated"
  | "ticket.followed_status_changed"
  | "incident.followed_status_changed"
  | "change.followed_status_changed"
  | "request.followed_status_changed"
  | "problem.followed_status_changed"
  | "user.mentioned"
  | "sla.first_response_warning"
  | "sla.resolution_warning"
  | "sla.breached"
  | "approval.requested"
  | "approval.approved"
  | "approval.rejected"
  | "incident.major_flagged"
  | "incident.escalated"
  | "request.approved"
  | "request.rejected"
  | "change.awaiting_approval"
  | "approval.overdue"
  | "approval.reminder"
  | "saas.renewal_soon"
  | "license.expiry_soon"
  | "license.expired"
  | "license.over_limit"
  | "automation.notification"; // generic automation-triggered notification

export const NOTIFICATION_EVENTS: NotificationEvent[] = [
  "ticket.created",
  "ticket.assigned",
  "ticket.escalated",
  "ticket.followed_status_changed",
  "incident.followed_status_changed",
  "change.followed_status_changed",
  "request.followed_status_changed",
  "problem.followed_status_changed",
  "user.mentioned",
  "sla.first_response_warning",
  "sla.resolution_warning",
  "sla.breached",
  "approval.requested",
  "approval.approved",
  "approval.rejected",
  "incident.major_flagged",
  "incident.escalated",
  "request.approved",
  "request.rejected",
  "change.awaiting_approval",
  "approval.overdue",
  "approval.reminder",
  "saas.renewal_soon",
  "license.expiry_soon",
  "license.expired",
  "license.over_limit",
  "automation.notification",
];

export const NOTIFICATION_EVENT_LABEL: Record<NotificationEvent, string> = {
  "user.mentioned":                   "Mentioned in a note or reply",
  "ticket.created":                   "Ticket submitted (auto-response to customer)",
  "ticket.assigned":                  "Ticket assigned to agent/team",
  "ticket.escalated":                 "Ticket escalated to agent/team",
  "ticket.followed_status_changed":    "Watched ticket status changed",
  "incident.followed_status_changed":  "Watched incident status changed",
  "change.followed_status_changed":    "Watched change status changed",
  "request.followed_status_changed":   "Watched service request status changed",
  "problem.followed_status_changed":   "Watched problem status changed",
  "sla.first_response_warning":       "SLA first response warning",
  "sla.resolution_warning":           "SLA resolution warning",
  "sla.breached":                     "SLA breached",
  "approval.requested":               "Approval requested",
  "approval.approved":                "Approval approved",
  "approval.rejected":                "Approval rejected",
  "incident.major_flagged":           "Major incident declared",
  "incident.escalated":               "Incident escalated to agent/team",
  "request.approved":                 "Request approved",
  "request.rejected":                 "Request rejected",
  "change.awaiting_approval":         "Change awaiting approval",
  "approval.overdue":                 "Approval overdue",
  "approval.reminder":                "Approval reminder",
  "saas.renewal_soon":                "SaaS subscription renewal upcoming",
  "license.expiry_soon":              "Software license expiring soon",
  "license.expired":                  "Software license expired",
  "license.over_limit":               "Software license over seat limit",
  "automation.notification":          "Automation-triggered notification",
};

/** Events that send to external recipients (customers), not internal agents */
export const CUSTOMER_FACING_EVENTS: NotificationEvent[] = [
  "ticket.created",
];

/** Events that have default system email templates */
export const SYSTEM_EMAIL_TEMPLATE_EVENTS: NotificationEvent[] = [
  "ticket.created",
  "ticket.assigned",
  "ticket.escalated",
  "sla.breached",
  "incident.escalated",
  "saas.renewal_soon",
  "license.expiry_soon",
  "license.expired",
  "license.over_limit",
];

// ── Channels ──────────────────────────────────────────────────────────────────

export type NotificationChannel = "in_app" | "email" | "slack" | "webhook";

export const NOTIFICATION_CHANNELS: NotificationChannel[] = [
  "in_app",
  "email",
  "slack",
  "webhook",
];

export const NOTIFICATION_CHANNEL_LABEL: Record<NotificationChannel, string> = {
  in_app:  "In-app",
  email:   "Email",
  slack:   "Slack",
  webhook: "Webhook",
};

// ── Delivery status ───────────────────────────────────────────────────────────

export type DeliveryStatus = "pending" | "sent" | "failed" | "skipped";

// ── Recipient strategies ──────────────────────────────────────────────────────

export type RecipientType =
  | "assignee"
  | "reporter"
  | "commander"
  | "team"
  | "role"
  | "all_agents";

// ── Domain interfaces (API response shapes) ───────────────────────────────────

export interface NotificationSummary {
  id: number;
  event: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  entityUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface UnreadCount {
  count: number;
}
