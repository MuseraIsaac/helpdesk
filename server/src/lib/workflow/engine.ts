import prisma from "../../db";
import Sentry from "../sentry";
import { logAudit } from "../audit";
import { evaluateWorkflowCondition } from "./conditions";
import { executeWorkflowActions } from "./actions";
import type {
  WorkflowTrigger,
  WorkflowRunContext,
  WorkflowAction,
  WorkflowCondition,
  TicketWorkflowSnapshot,
} from "./types";

/**
 * WorkflowEngine — evaluates all enabled WorkflowDefinitions from the database
 * against a ticket snapshot when triggered.
 *
 * Design:
 *  - Definitions are loaded fresh from the DB on every run so changes take
 *    effect immediately without a server restart.
 *  - Each run creates a WorkflowExecution row (status: running → completed/failed/skipped).
 *  - Each action within a run creates a WorkflowExecutionStep row.
 *  - Loop prevention: _appliedWorkflowIds prevents the same definition from
 *    firing twice in one invocation chain.
 *  - Errors in individual actions are caught per-step; a single bad action
 *    does not abort remaining actions.
 *  - Tickets in "new" or "processing" status are skipped (AI-managed states).
 *  - The engine never calls route handlers — all writes go directly to Prisma.
 */
export class WorkflowEngine {
  async run(
    ticket: TicketWorkflowSnapshot,
    context: WorkflowRunContext
  ): Promise<void> {
    // Never interfere with AI-managed ticket states
    if (ticket.status === "new" || ticket.status === "processing") return;

    const appliedWorkflowIds =
      context._appliedWorkflowIds ?? new Set<number>();

    // Load all enabled definitions that match the trigger
    let definitions;
    try {
      definitions = await prisma.workflowDefinition.findMany({
        where: { isEnabled: true },
        orderBy: { id: "asc" },
      });
    } catch (err) {
      Sentry.captureException(err, {
        tags: { context: "workflow_engine", phase: "load_definitions" },
      });
      console.error("[workflow] Failed to load workflow definitions:", err);
      return;
    }

    // Filter to definitions that declare this trigger
    const eligible = definitions.filter((def) => {
      if (appliedWorkflowIds.has(def.id)) return false;
      const triggers = def.triggers as WorkflowTrigger[];
      return Array.isArray(triggers) && triggers.includes(context.trigger);
    });

    if (eligible.length === 0) return;

    for (const def of eligible) {
      appliedWorkflowIds.add(def.id);

      // ── Evaluate conditions ────────────────────────────────────────────
      let conditionsMet: boolean;
      try {
        conditionsMet = evaluateWorkflowCondition(
          def.conditions as WorkflowCondition | null,
          ticket
        );
      } catch (err) {
        Sentry.captureException(err, {
          tags: {
            context: "workflow_engine",
            workflowId: def.id,
            ticketId: ticket.id,
          },
        });
        console.error(
          `[workflow] Condition error in workflow "${def.id}" for ticket ${ticket.id}:`,
          err
        );
        // Record a failed execution so the error is visible in the DB
        await this.recordExecution(def.id, ticket.id, context.trigger, "failed", [], err);
        continue;
      }

      if (!conditionsMet) {
        // Conditions didn't match — record a skipped execution (cheap: no step rows)
        await this.recordExecution(def.id, ticket.id, context.trigger, "skipped", []);
        continue;
      }

      // ── Execute actions ────────────────────────────────────────────────
      const actions = def.actions as WorkflowAction[];
      let results;
      try {
        results = await executeWorkflowActions(actions, ticket);
      } catch (err) {
        Sentry.captureException(err, {
          tags: {
            context: "workflow_engine",
            workflowId: def.id,
            ticketId: ticket.id,
          },
        });
        console.error(
          `[workflow] Action execution error in workflow "${def.id}" for ticket ${ticket.id}:`,
          err
        );
        await this.recordExecution(def.id, ticket.id, context.trigger, "failed", [], err);
        continue;
      }

      // ── Persist execution record + steps ───────────────────────────────
      await this.recordExecution(def.id, ticket.id, context.trigger, "completed", results);

      // ── Audit log ─────────────────────────────────────────────────────
      const appliedActions = results.filter((r) => r.applied).map((r) => r.type);
      const skipped = results
        .filter((r) => !r.applied && r.skippedReason)
        .map((r) => `${r.type}:${r.skippedReason}`);
      const errors = results
        .filter((r) => r.errorMessage)
        .map((r) => `${r.type}:${r.errorMessage}`);

      if (appliedActions.length > 0) {
        void logAudit(ticket.id, null, "workflow.executed", {
          workflowId: def.id,
          workflowName: def.name,
          trigger: context.trigger,
          actions: appliedActions,
          ...(skipped.length > 0 && { skipped }),
          ...(errors.length > 0 && { errors }),
        });
      }

      console.log(
        `[workflow] "${def.name}" (id=${def.id}) on ticket ${ticket.id} — ` +
          `applied: [${appliedActions.join(", ") || "none"}]` +
          (skipped.length ? ` skipped: [${skipped.join(", ")}]` : "") +
          (errors.length ? ` errors: [${errors.join(", ")}]` : "")
      );
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async recordExecution(
    workflowDefinitionId: number,
    ticketId: number,
    trigger: string,
    status: "completed" | "failed" | "skipped",
    steps: Array<{ type: string; applied: boolean; skippedReason?: string; errorMessage?: string }>,
    error?: unknown
  ): Promise<void> {
    try {
      await prisma.workflowExecution.create({
        data: {
          workflowDefinitionId,
          ticketId,
          trigger,
          status,
          errorMessage: error instanceof Error ? error.message : error ? String(error) : undefined,
          completedAt: new Date(),
          steps: {
            create: steps.map((s) => ({
              actionType: s.type,
              applied: s.applied,
              skippedReason: s.skippedReason,
              errorMessage: s.errorMessage,
            })),
          },
        },
      });
    } catch (persistErr) {
      // Best-effort — don't let persistence failure propagate
      console.error("[workflow] Failed to persist execution record:", persistErr);
    }
  }
}

/** Singleton engine instance — callers import this rather than constructing their own. */
export const workflowEngine = new WorkflowEngine();
