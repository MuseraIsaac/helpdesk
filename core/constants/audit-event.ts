/**
 * Shared audit event types used by both server (for logging) and client (for rendering).
 *
 * Action naming convention: "<domain>.<verb_past>" — dot-namespaced, consistent,
 * easy to filter with a prefix query (e.g. WHERE action LIKE 'ticket.%').
 *
 * Ticket events (captureTicketEvents)   — always have ticketId set
 * ITSM events   (captureITSMEvents)     — ticketId is null; entity in meta
 * Asset events  (captureAssetEvents)    — ticketId is null; entity in meta
 * Approval events (captureApprovalEvents) — ticketId is null; entity in meta
 * Customer events (captureCustomerEvents) — ticketId is null; entity in meta
 * Team events   (captureTeamEvents)     — ticketId is null; entity in meta
 * Auth events   (captureAuthEvents)     — ticketId is null
 * Settings events (captureSettingsChanges) — ticketId is null
 * User events   (captureUserManagement) — ticketId is null
 * KB events     (captureKbEvents)       — ticketId is null
 *
 * All ITSM/Asset/Approval/Customer/Team events include in meta:
 *   entityType: string  (e.g. "incident", "problem", "change", "request", "asset")
 *   entityId: number
 *   entityNumber: string (human-readable, e.g. "INC-0001")
 */

export const auditActions = [
  // ── Ticket lifecycle (captureTicketEvents) ──────────────────────────────
  "ticket.created",
  "ticket.status_changed",
  "ticket.priority_changed",
  "ticket.severity_changed",
  "ticket.category_changed",
  "ticket.assigned",
  // SLA / escalation
  "ticket.sla_breached",
  "ticket.escalated",
  "ticket.deescalated",
  // Merge / unmerge
  "ticket.merged",
  "ticket.received_merge",
  "ticket.unmerged",
  "ticket.child_unmerged",
  // Collaboration
  "reply.created",
  "note.created",
  // Automation / intake routing
  "rule.applied",
  "ticket.intake_suppressed",
  // Workflow engine
  "workflow.executed",
  "workflow.failed",
  // Scenario automations (manually invoked by agents)
  "scenario.run",
  // Ticket deleted / restored
  "ticket.deleted",
  "ticket.restored",

  // ── Incident lifecycle (captureITSMEvents) ──────────────────────────────
  "incident.created",
  "incident.status_changed",
  "incident.assigned",
  "incident.priority_changed",
  "incident.major_declared",
  "incident.major_cleared",
  "incident.update_posted",
  "incident.resolved",
  "incident.closed",
  "incident.sla_breached",
  "incident.linked_problem",
  "incident.deleted",

  // ── Problem lifecycle (captureITSMEvents) ───────────────────────────────
  "problem.created",
  "problem.status_changed",
  "problem.assigned",
  "problem.priority_changed",
  "problem.known_error_flagged",
  "problem.root_cause_updated",
  "problem.workaround_updated",
  "problem.linked_incident",
  "problem.linked_ticket",
  "problem.pir_completed",
  "problem.resolved",
  "problem.closed",
  "problem.deleted",

  // ── Change lifecycle (captureITSMEvents) ────────────────────────────────
  "change.created",
  "change.status_changed",
  "change.assigned",
  "change.submitted",
  "change.approved",
  "change.rejected",
  "change.scheduled",
  "change.started",
  "change.completed",
  "change.cancelled",
  "change.rolled_back",
  "change.task_created",
  "change.task_completed",
  "change.task_deleted",
  "change.deleted",

  // ── Service Request lifecycle (captureITSMEvents) ───────────────────────
  "request.created",
  "request.status_changed",
  "request.assigned",
  "request.approved",
  "request.rejected",
  "request.cancelled",
  "request.completed",
  "request.fulfilled",
  "request.deleted",

  // ── Asset lifecycle (captureAssetEvents) ────────────────────────────────
  "asset.created",
  "asset.updated",
  "asset.status_changed",
  "asset.assigned",
  "asset.unassigned",
  "asset.deployed",
  "asset.retired",
  "asset.scrapped",
  "asset.linked_ci",
  "asset.linked_contract",
  "asset.deleted",

  // ── Approval lifecycle (captureApprovalEvents) ──────────────────────────
  "approval.requested",
  "approval.approved",
  "approval.rejected",
  "approval.expired",

  // ── Customer / portal lifecycle (captureCustomerEvents) ─────────────────
  "customer.registered",        // self-registration on customer portal
  "customer.portal_login",      // customer signed in to portal
  "customer.portal_login_failed",
  "customer.updated",
  "customer.deleted",

  // ── Team management (captureTeamEvents) ─────────────────────────────────
  "team.created",
  "team.updated",
  "team.deleted",
  "team.member_added",
  "team.member_removed",

  // ── Authentication (captureAuthEvents) ─────────────────────────────────
  "auth.login",
  "auth.logout",
  "auth.login_failed",

  // ── Settings changes (captureSettingsChanges) ───────────────────────────
  "settings.updated",

  // ── User management (captureUserManagement) ─────────────────────────────
  "user.created",
  "user.updated",
  "user.deleted",

  // ── Role management (captureUserManagement) ─────────────────────────────
  "role.created",
  "role.updated",
  "role.permissions_changed",
  "role.deleted",

  // ── Knowledge base (captureKbEvents) ───────────────────────────────────
  "kb.article_created",
  "kb.article_published",
  "kb.article_archived",
  "kb.article_submitted_review",
  "kb.article_approved",
] as const;

export type AuditAction = (typeof auditActions)[number];

export interface AuditEvent {
  id: number;
  action: AuditAction;
  /** null = performed by the system / background job */
  actorId: string | null;
  actor: { id: string; name: string } | null;
  /** Structured payload — shape varies per action (see server/src/lib/audit.ts) */
  meta: Record<string, unknown>;
  createdAt: string;
  /** null for system-level events (auth, settings, user management, KB) */
  ticketId?: number | null;
  ticket?: { ticketNumber: string; subject: string } | null;
}
