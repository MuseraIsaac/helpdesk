import type { Condition } from "../automation/types";

// ─── Triggers ─────────────────────────────────────────────────────────────────

/**
 * Workflow triggers are a superset of legacy RuleTrigger.
 * ticket.* events are wired today; incident.* / request.* are reserved for
 * future ITSM modules and are parsed/stored but never fired until the module
 * exists.
 */
export type WorkflowTrigger =
  | "ticket.created"
  | "ticket.updated"
  | "ticket.age"
  | "incident.created"
  | "incident.updated"
  | "request.created"
  | "request.updated";

// ─── Conditions ───────────────────────────────────────────────────────────────

/**
 * WorkflowCondition is the same discriminated union as the existing Condition
 * type. Re-exporting it keeps the engine code consistent and lets the evaluator
 * (which already handles Condition) work unchanged.
 */
export type WorkflowCondition = Condition;

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * WorkflowAction is a superset of the legacy Action type. It adds:
 *  - update_field:       generic field setter (replaces set_category / set_priority)
 *  - assign_user:        assign a specific agent (replaces assign_to)
 *  - assign_team:        route to a team inbox
 *  - create_task:        not yet implemented — stored, logged, skipped with reason
 *  - add_note:           append an internal note to the ticket
 *  - add_audit_entry:    write a workflow.executed audit event
 *  - send_notification:  placeholder — logs intent, no actual delivery yet
 *  - escalate:           same semantics as legacy escalate action
 *
 * Legacy action aliases (kept for migration period):
 *  - set_category → update_field { field: "category" }
 *  - set_priority → update_field { field: "priority" }
 *  - assign_to    → assign_user
 */
export type WorkflowAction =
  // ── New canonical actions ────────────────────────────────────────────────
  | {
      type: "update_field";
      field: "category" | "priority" | "severity" | "status" | "ticketType";
      value: string;
    }
  | {
      type: "assign_user";
      /** Must be a valid User.id in the database */
      agentId: string;
      /** Informational label for audit/logging */
      agentName?: string;
    }
  | {
      type: "assign_team";
      /** Must be a valid Team.id in the database */
      teamId: number;
      teamName?: string;
    }
  | {
      type: "create_task";
      title: string;
      description?: string;
      assigneeId?: string;
    }
  | {
      type: "add_note";
      body: string;
      /** Pin the note in the conversation timeline */
      isPinned?: boolean;
    }
  | {
      type: "add_audit_entry";
      /** Free-form key-value pairs merged into the audit event meta */
      meta?: Record<string, unknown>;
    }
  | {
      type: "send_notification";
      /** "assignee" | "team" | "custom" */
      target: string;
      /** For target=custom: explicit User.id to notify */
      userId?: string;
      message: string;
    }
  | { type: "escalate" }

  // ── Legacy aliases (supported during migration from RULES[]) ────────────
  | { type: "set_category"; value: string }
  | { type: "set_priority"; value: string }
  | { type: "assign_to"; agentId: string; agentName?: string };

// ─── Snapshot ─────────────────────────────────────────────────────────────────

/**
 * Ticket state snapshot passed to the workflow engine on every run.
 * Mirrors TicketRuleSnapshot but also carries teamId for assign_team checks.
 */
export interface TicketWorkflowSnapshot {
  id: number;
  subject: string;
  body: string;
  status: string;
  category: string | null;
  priority: string | null;
  severity: string | null;
  ticketType: string | null;
  senderEmail: string;
  assignedToId: string | null;
  teamId: number | null;
  createdAt: Date;
}

// ─── Engine context ────────────────────────────────────────────────────────────

export interface WorkflowRunContext {
  trigger: WorkflowTrigger;
  /**
   * Internal de-duplication guard. Never set by callers — the engine manages it
   * to prevent the same workflow firing twice per invocation chain.
   */
  _appliedWorkflowIds?: Set<number>;
}

// ─── Per-action result ────────────────────────────────────────────────────────

export interface ActionResult {
  type: string;
  applied: boolean;
  skippedReason?: string;
  errorMessage?: string;
}
