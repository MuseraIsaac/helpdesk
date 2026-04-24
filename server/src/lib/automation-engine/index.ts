/**
 * Automation Engine — Main Entry Point
 *
 * Evaluates all enabled AutomationRules that match the given trigger and entity,
 * respects stopOnMatch ordering, deduplicates per invocation chain, and persists
 * execution records with per-step results.
 *
 * Usage:
 *   import { runAutomationEngine } from "./automation-engine";
 *   await runAutomationEngine({ trigger: "ticket.created", entityType: "ticket", entityId: ticketId });
 */

import prisma from "../../db";
import type { Prisma } from "../../generated/prisma/client";
import type { AutomationTriggerType, AutomationCategory } from "core/constants/automation";
import type { AutomationAction } from "core/schemas/automations";
import type { TicketSnapshot, EngineRunContext, EngineRunResult, ActionResult } from "./types";
import { evaluateConditions } from "./conditions";
import { executeAutomationAction } from "./actions";

// ── Snapshot loaders ──────────────────────────────────────────────────────────

async function loadTicketSnapshot(entityId: number): Promise<TicketSnapshot | null> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: entityId },
    select: {
      id: true,
      ticketNumber: true,
      subject: true,
      body: true,
      status: true,
      category: true,
      priority: true,
      severity: true,
      impact: true,
      urgency: true,
      ticketType: true,
      source: true,
      affectedSystem: true,
      senderEmail: true,
      senderName: true,
      assignedToId: true,
      teamId: true,
      isEscalated: true,
      slaBreached: true,
      firstResponseDueAt: true,
      resolutionDueAt: true,
      firstRespondedAt: true,
      resolvedAt: true,
      linkedIncidentId: true,
      customFields: true,
      createdAt: true,
      updatedAt: true,
      // Intake routing fields
      emailMessageId: true,
      emailTo: true,
      emailCc: true,
      emailReplyTo: true,
      isAutoReply: true,
      isBounce: true,
      isSpam: true,
      isQuarantined: true,
      mailboxAlias: true,
      // Time-supervisor tracking fields
      lastAgentReplyAt: true,
      lastCustomerReplyAt: true,
      statusChangedAt: true,
    },
  });
  if (!ticket) return null;
  return {
    ...ticket,
    customFields: (ticket.customFields as Record<string, unknown>) ?? {},
  };
}

// ── Engine core ───────────────────────────────────────────────────────────────

export async function runAutomationEngine(ctx: {
  trigger: AutomationTriggerType;
  entityType: "ticket" | "incident" | "change" | "request";
  entityId: number;
  /** Restrict to a single automation category — prevents cross-category interference. */
  category?: AutomationCategory;
  /** Pre-built snapshot — skips the internal DB load when provided (used by intake runner). */
  snapshot?: TicketSnapshot;
  meta?: Record<string, unknown>;
  _appliedRuleIds?: Set<number>;
}): Promise<EngineRunResult[]> {
  const appliedRuleIds = ctx._appliedRuleIds ?? new Set<number>();

  // Build the rule query — optionally scoped to a single category
  const ruleWhere: Record<string, unknown> = { isEnabled: true };
  if (ctx.category) ruleWhere.category = ctx.category;

  // Load enabled rules for the given trigger, ordered for deterministic evaluation
  const rules = await prisma.automationRule.findMany({
    where: ruleWhere,
    orderBy: [{ order: "asc" }, { id: "asc" }],
  });

  // Filter to rules that include this trigger type
  const matchingRules = rules.filter((rule) => {
    const triggers = rule.triggers as Array<{ type: string }>;
    return triggers.some((t) => t.type === ctx.trigger);
  });

  if (matchingRules.length === 0) return [];

  // Use pre-built snapshot if provided; otherwise load from DB
  let snapshot: TicketSnapshot | null = ctx.snapshot ?? null;
  if (!snapshot && ctx.entityType === "ticket") {
    snapshot = await loadTicketSnapshot(ctx.entityId);
  }
  if (!snapshot) return [];

  // Inject previousValues from meta so conditions can compare old vs new values
  if (ctx.meta?.previousValues && typeof ctx.meta.previousValues === "object") {
    snapshot = { ...snapshot, previousValues: ctx.meta.previousValues as Record<string, unknown> };
  }

  const results: EngineRunResult[] = [];
  let stopped = false;

  for (const rule of matchingRules) {
    if (stopped) break;
    if (appliedRuleIds.has(rule.id)) continue; // in-flight dedup guard

    // runOnce dedup — if rule.runOnce=true, skip if a completed execution already exists
    // for this (rule, entity) pair. Prevents repeated firing by time-supervisor scans.
    if (rule.runOnce) {
      const existingRun = await prisma.automationExecution.findFirst({
        where: {
          ruleId: rule.id,
          entityType: ctx.entityType,
          entityId: ctx.entityId,
          status: "completed",
        },
        select: { id: true },
      });
      if (existingRun) continue;
    }

    // Evaluate conditions
    const conditionsMatched = evaluateConditions(rule.conditions, snapshot);

    // Create execution record — store previousValues + actor info for audit trail
    const executionMeta: Record<string, unknown> = {};
    if (ctx.meta?.previousValues) executionMeta.previousValues = ctx.meta.previousValues;
    if (ctx.meta?.actorId) executionMeta.actorId = ctx.meta.actorId;

    const execution = await prisma.automationExecution.create({
      data: {
        ruleId: rule.id,
        entityType: ctx.entityType,
        entityId: ctx.entityId,
        trigger: ctx.trigger,
        status: conditionsMatched ? "running" : "skipped",
        startedAt: new Date(),
        completedAt: conditionsMatched ? undefined : new Date(),
        meta: executionMeta as Prisma.InputJsonValue,
      },
    });

    if (!conditionsMatched) {
      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        conditionsMatched: false,
        actions: [],
        stopped: false,
      });
      continue;
    }

    appliedRuleIds.add(rule.id);

    const actions = rule.actions as AutomationAction[];
    const actionResults: ActionResult[] = [];
    let executionFailed = false;
    let stopProcessing = false;

    for (const action of actions) {
      const result = await executeAutomationAction(action, snapshot);
      actionResults.push(result);
      if (action.type === "stop_processing") {
        stopProcessing = true;
        break;
      }
      if (result.errorMessage) executionFailed = true;
    }

    // Persist steps
    if (actionResults.length > 0) {
      await prisma.automationExecutionStep.createMany({
        data: actionResults.map((r) => ({
          executionId: execution.id,
          actionType: r.type,
          applied: r.applied,
          skippedReason: r.skippedReason ?? null,
          errorMessage: r.errorMessage ?? null,
          meta: (r.meta ?? {}) as Prisma.InputJsonValue,
        })),
      });
    }

    await prisma.automationExecution.update({
      where: { id: execution.id },
      data: {
        status: executionFailed ? "failed" : "completed",
        completedAt: new Date(),
      },
    });

    // Reload snapshot so subsequent rules see changes made by this rule
    if (ctx.entityType === "ticket") {
      const fresh = await loadTicketSnapshot(ctx.entityId);
      if (fresh) snapshot = fresh;
    }

    const shouldStop = rule.stopOnMatch || stopProcessing;
    results.push({
      ruleId: rule.id,
      ruleName: rule.name,
      conditionsMatched: true,
      actions: actionResults,
      stopped: shouldStop,
    });

    if (shouldStop) stopped = true;
  }

  return results;
}

// ── Convenience wrappers ──────────────────────────────────────────────────────

export async function runAutomationForTicket(
  ticketId: number,
  trigger: AutomationTriggerType,
  meta?: Record<string, unknown>,
  category?: AutomationCategory,
): Promise<void> {
  try {
    await runAutomationEngine({ trigger, entityType: "ticket", entityId: ticketId, meta, category });
  } catch (e) {
    console.error("[automation-engine] Error running automation for ticket", ticketId, e);
  }
}
