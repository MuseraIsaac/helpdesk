import type { RuleTrigger, TicketRuleSnapshot } from "./types";
import { evaluateCondition } from "./conditions";
import { executeActions } from "./actions";
import { RULES } from "./rules";
import { logAudit } from "../audit";
import Sentry from "../sentry";

export interface RunRulesContext {
  trigger: RuleTrigger;
  /**
   * Passed between nested/chained calls to prevent the same rule from firing
   * more than once per invocation. Callers should not set this — the engine
   * manages it internally.
   */
  _appliedRuleIds?: Set<string>;
}

/**
 * Entry point for the rule engine.
 *
 * Evaluates all enabled rules whose triggers include `context.trigger`.
 * For each matching rule, executes its actions and writes a `rule.applied`
 * audit event when at least one action produces a real DB change.
 *
 * Loop prevention guarantees:
 *  1. Rule actions write DIRECTLY to Prisma — they never call route handlers,
 *     so route-level rule invocations cannot cascade.
 *  2. `_appliedRuleIds` ensures each rule fires at most once per call stack,
 *     protecting against any future indirect re-entry path.
 *  3. Tickets in "new" or "processing" status are skipped — the AI pipeline
 *     manages those states exclusively.
 */
export async function runRules(
  ticket: TicketRuleSnapshot,
  context: RunRulesContext
): Promise<void> {
  // Never interfere with AI-managed ticket states
  if (ticket.status === "new" || ticket.status === "processing") return;

  const appliedRuleIds = context._appliedRuleIds ?? new Set<string>();

  const eligible = RULES.filter(
    (r) =>
      r.enabled &&
      r.triggers.includes(context.trigger) &&
      !appliedRuleIds.has(r.id)
  );

  if (eligible.length === 0) return;

  for (const rule of eligible) {
    // Mark before executing so any synchronous re-entry path (hypothetical) can't re-run it
    appliedRuleIds.add(rule.id);

    let matches: boolean;
    try {
      matches = evaluateCondition(rule.condition, ticket);
    } catch (err) {
      Sentry.captureException(err, {
        tags: { context: "automation", ruleId: rule.id, ticketId: ticket.id },
      });
      console.error(
        `[automation] Condition error in rule "${rule.id}" for ticket ${ticket.id}:`,
        err
      );
      continue;
    }

    if (!matches) continue;

    let results;
    try {
      results = await executeActions(rule.actions, ticket);
    } catch (err) {
      Sentry.captureException(err, {
        tags: { context: "automation", ruleId: rule.id, ticketId: ticket.id },
      });
      console.error(
        `[automation] Action error in rule "${rule.id}" for ticket ${ticket.id}:`,
        err
      );
      continue;
    }

    const appliedActions = results.filter((r) => r.applied).map((r) => r.type);
    const skipped = results
      .filter((r) => !r.applied && r.skippedReason)
      .map((r) => `${r.type}:${r.skippedReason}`);

    // Only write an audit event when at least one action produced a real change
    if (appliedActions.length > 0) {
      void logAudit(ticket.id, null, "rule.applied", {
        ruleId: rule.id,
        ruleName: rule.name,
        trigger: context.trigger,
        actions: appliedActions,
        ...(skipped.length > 0 && { skipped }),
      });
    }

    console.log(
      `[automation] Rule "${rule.id}" on ticket ${ticket.id} — applied: [${appliedActions.join(", ") || "none"}]` +
        (skipped.length ? ` skipped: [${skipped.join(", ")}]` : "")
    );
  }
}
