import { evaluateCondition } from "../automation/conditions";
import type { WorkflowCondition, TicketWorkflowSnapshot } from "./types";
import type { TicketRuleSnapshot } from "../automation/types";

/**
 * Converts a TicketWorkflowSnapshot to the legacy TicketRuleSnapshot shape
 * so the existing evaluateCondition() can be reused without modification.
 */
function toRuleSnapshot(ticket: TicketWorkflowSnapshot): TicketRuleSnapshot {
  return {
    id: ticket.id,
    subject: ticket.subject,
    body: ticket.body,
    status: ticket.status,
    category: ticket.category,
    priority: ticket.priority,
    severity: ticket.severity,
    senderEmail: ticket.senderEmail,
    assignedToId: ticket.assignedToId,
    createdAt: ticket.createdAt,
  };
}

/**
 * Evaluates a workflow condition tree against a ticket snapshot.
 *
 * Thin wrapper over the battle-tested automation evaluateCondition so the
 * workflow engine doesn't duplicate condition logic.
 *
 * Returns true if conditions is null/undefined (unconditional workflow).
 */
export function evaluateWorkflowCondition(
  condition: WorkflowCondition | null | undefined,
  ticket: TicketWorkflowSnapshot
): boolean {
  if (!condition) return true;
  return evaluateCondition(condition, toRuleSnapshot(ticket));
}
