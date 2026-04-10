import type { Action, TicketRuleSnapshot } from "./types";
import prisma from "../../db";
import { escalateTicket } from "../escalation";
import { computeSlaDeadlines } from "../sla";

export interface ActionResult {
  /** Action type string for audit logging */
  type: string;
  /** true = something was actually changed in the DB */
  applied: boolean;
  /** Explains a no-op skip */
  skippedReason?: string;
}

/**
 * Execute a list of actions against a ticket, in order.
 * Each action is idempotent — it inspects current state and skips if already correct.
 * Returns per-action results so the engine can log only what actually changed.
 *
 * IMPORTANT: These write directly to Prisma, NOT through route handlers.
 * That's what prevents rule-triggered updates from re-entering the rule engine.
 */
export async function executeActions(
  actions: Action[],
  ticket: TicketRuleSnapshot
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];
  for (const action of actions) {
    results.push(await executeAction(action, ticket));
  }
  return results;
}

async function executeAction(
  action: Action,
  ticket: TicketRuleSnapshot
): Promise<ActionResult> {
  switch (action.type) {
    case "set_category": {
      if (ticket.category === action.value) {
        return { type: action.type, applied: false, skippedReason: "already set" };
      }
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { category: action.value },
      });
      return { type: action.type, applied: true };
    }

    case "set_priority": {
      if (ticket.priority === action.value) {
        return { type: action.type, applied: false, skippedReason: "already set" };
      }
      // Recalculate SLA deadlines when priority changes (mirrors route handler logic)
      const deadlines = computeSlaDeadlines(action.value, ticket.createdAt);
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          priority: action.value,
          firstResponseDueAt: deadlines.firstResponseDueAt,
          resolutionDueAt: deadlines.resolutionDueAt,
        },
      });
      return { type: action.type, applied: true };
    }

    case "assign_to": {
      if (ticket.assignedToId === action.agentId) {
        return { type: action.type, applied: false, skippedReason: "already assigned" };
      }
      // Verify agent exists before assigning — guards against stale config
      const agent = await prisma.user.findFirst({
        where: { id: action.agentId, deletedAt: null },
        select: { id: true },
      });
      if (!agent) {
        return {
          type: action.type,
          applied: false,
          skippedReason: `agent "${action.agentId}" not found`,
        };
      }
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { assignedToId: action.agentId },
      });
      return { type: action.type, applied: true };
    }

    case "escalate": {
      // escalateTicket is idempotent per (ticketId, reason) — safe to call repeatedly
      const wasNew = await escalateTicket(ticket.id, "rule_triggered");
      return { type: action.type, applied: wasNew };
    }
  }
}
