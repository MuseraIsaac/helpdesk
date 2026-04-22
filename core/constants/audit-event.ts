/**
 * Shared audit event types used by both server (for logging) and client (for rendering).
 *
 * Action naming convention: "<domain>.<verb_past>" — dot-namespaced, consistent,
 * easy to filter with a prefix query (e.g. WHERE action LIKE 'ticket.%').
 */

export const auditActions = [
  // Ticket lifecycle
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
  // Automation
  "rule.applied",
  // Workflow engine
  "workflow.executed",
  "workflow.failed",
  // Scenario automations (manually invoked by agents)
  "scenario.run",
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
}
