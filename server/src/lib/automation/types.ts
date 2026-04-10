import type { TicketCategory } from "core/constants/ticket-category.ts";
import type { TicketPriority } from "core/constants/ticket-priority.ts";
import type { TicketSeverity } from "core/constants/ticket-severity.ts";
import type { TicketStatus } from "core/constants/ticket-status.ts";

// ─── Triggers ─────────────────────────────────────────────────────────────────

/**
 * ticket.created  — fires once when a ticket is first created (agent form or inbound email)
 * ticket.updated  — fires when an agent patches ticket fields
 * ticket.age      — fires on a schedule; used for time-based conditions like
 *                   "unassigned for > N minutes"
 */
export type RuleTrigger = "ticket.created" | "ticket.updated" | "ticket.age";

// ─── Conditions ───────────────────────────────────────────────────────────────

/**
 * Conditions are pure predicates evaluated against a TicketRuleSnapshot.
 * Composite conditions (and/or/not) allow arbitrary nesting.
 */
export type Condition =
  // Field equality
  | { type: "category_is"; value: TicketCategory }
  | { type: "priority_is"; value: TicketPriority }
  | { type: "severity_is"; value: TicketSeverity }
  | { type: "status_is"; value: TicketStatus }
  // Sender
  | { type: "sender_domain_is"; domain: string }
  // Text search — matchAll: true means ALL keywords must appear (default: any)
  | { type: "subject_contains"; keywords: string[]; matchAll?: boolean }
  | { type: "body_contains"; keywords: string[]; matchAll?: boolean }
  // Assignment / time
  | { type: "is_unassigned" }
  | { type: "unassigned_for_minutes"; minutes: number }
  // Logical combinators
  | { type: "and"; conditions: Condition[] }
  | { type: "or"; conditions: Condition[] }
  | { type: "not"; condition: Condition };

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Actions are side-effects applied when a rule's condition is true.
 * Each action is idempotent: it checks current state and skips if no change needed.
 */
export type Action =
  | { type: "set_category"; value: TicketCategory }
  | { type: "set_priority"; value: TicketPriority }
  /**
   * agentName is informational only — used in logs/audit.
   * The agentId must be a valid user ID in the database.
   */
  | { type: "assign_to"; agentId: string; agentName?: string }
  | { type: "escalate" };

// ─── Rule ─────────────────────────────────────────────────────────────────────

export interface AutomationRule {
  /** Stable, unique identifier — stored in audit events. Never reuse an ID. */
  id: string;
  /** Human-readable name shown in audit trail */
  name: string;
  description?: string;
  /** Set to false to disable without removing the rule */
  enabled: boolean;
  /** One or more lifecycle events that can trigger this rule */
  triggers: RuleTrigger[];
  condition: Condition;
  actions: Action[];
}

// ─── Ticket snapshot ──────────────────────────────────────────────────────────

/** Minimal ticket state passed to condition evaluators — no sensitive fields */
export interface TicketRuleSnapshot {
  id: number;
  subject: string;
  body: string;
  status: string;
  category: string | null;
  priority: string | null;
  severity: string | null;
  senderEmail: string;
  assignedToId: string | null;
  createdAt: Date;
}
