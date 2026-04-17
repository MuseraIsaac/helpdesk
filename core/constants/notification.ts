/**
 * Notification system — event types, channel types, and shared interfaces.
 * Shared between server and client.
 */

// ── Event types ───────────────────────────────────────────────────────────────

export type NotificationEvent =
  | "ticket.assigned"
  | "sla.first_response_warning"
  | "sla.resolution_warning"
  | "sla.breached"
  | "approval.requested"
  | "approval.approved"
  | "approval.rejected"
  | "incident.major_flagged"
  | "request.approved"
  | "request.rejected"
  | "change.awaiting_approval";

export const NOTIFICATION_EVENTS: NotificationEvent[] = [
  "ticket.assigned",
  "sla.first_response_warning",
  "sla.resolution_warning",
  "sla.breached",
  "approval.requested",
  "approval.approved",
  "approval.rejected",
  "incident.major_flagged",
  "request.approved",
  "request.rejected",
  "change.awaiting_approval",
];

export const NOTIFICATION_EVENT_LABEL: Record<NotificationEvent, string> = {
  "ticket.assigned":             "Ticket assigned",
  "sla.first_response_warning":  "SLA first response warning",
  "sla.resolution_warning":      "SLA resolution warning",
  "sla.breached":                "SLA breached",
  "approval.requested":          "Approval requested",
  "approval.approved":           "Approval approved",
  "approval.rejected":           "Approval rejected",
  "incident.major_flagged":      "Major incident declared",
  "request.approved":            "Request approved",
  "request.rejected":            "Request rejected",
  "change.awaiting_approval":    "Change awaiting approval",
};

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
