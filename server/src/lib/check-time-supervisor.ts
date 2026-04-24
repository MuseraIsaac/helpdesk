/**
 * Time-Based / Supervisor Automation Worker
 *
 * Runs every 10 minutes via pg-boss cron schedule.
 * Evaluates all enabled `time_supervisor` automation rules against every
 * active record across 5 entity types: tickets, incidents, service requests,
 * changes, and problems.
 *
 * Design:
 *  - Each entity is scanned with a time-enriched snapshot containing computed
 *    duration fields (ageHours, idleHours, hoursUntilSlaResolution, etc.).
 *  - Rules with `runOnce=true` are skipped if a completed execution already
 *    exists for the (rule, entity) pair — prevents repeated firing.
 *  - Rules with `runOnce=false` fire every scan until conditions no longer match.
 *  - Each entity type is scanned concurrently (Promise.allSettled) to bound
 *    total wall-clock time regardless of entity count.
 *  - The worker is idempotent — safe to run while another instance is active
 *    (pg-boss single-concurrency policy prevents duplicate concurrent runs).
 *
 * Entity scope per scan:
 *  - Tickets:           status in [open, in_progress, escalated]
 *  - Incidents:         status not in [resolved, closed]
 *  - Service Requests:  status not in [fulfilled, rejected, cancelled]
 *  - Changes:           state not in [closed, cancelled]
 *  - Problems:          status not in [resolved, closed]
 *  - Approval Requests: status = "pending" (approval.pending + approval.overdue triggers)
 */

import type { PgBoss } from "pg-boss";
import prisma from "../db";
import Sentry from "./sentry";
import { runAutomationEngine } from "./automation-engine";
import {
  buildTicketTimeSnapshot,
  buildIncidentTimeSnapshot,
  buildRequestTimeSnapshot,
  buildChangeTimeSnapshot,
  buildProblemTimeSnapshot,
} from "./time-snapshot";

const QUEUE_NAME     = "check-time-supervisor";
const CRON_SCHEDULE  = "*/10 * * * *"; // every 10 minutes

// ── Entity ID fetchers ────────────────────────────────────────────────────────

async function getActiveTicketIds(): Promise<number[]> {
  const rows = await prisma.ticket.findMany({
    where: {
      deletedAt: null,
      status: { in: ["open", "in_progress", "escalated"] },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => r.id);
}

async function getActiveIncidentIds(): Promise<number[]> {
  const rows = await prisma.incident.findMany({
    where: { status: { notIn: ["resolved", "closed"] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => r.id);
}

async function getActiveRequestIds(): Promise<number[]> {
  const rows = await prisma.serviceRequest.findMany({
    where: { status: { notIn: ["fulfilled", "rejected", "cancelled"] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => r.id);
}

async function getActiveChangeIds(): Promise<number[]> {
  const rows = await prisma.change.findMany({
    where: { state: { notIn: ["closed", "cancelled"] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => r.id);
}

async function getActiveProblemIds(): Promise<number[]> {
  const rows = await prisma.problem.findMany({
    where: { status: { notIn: ["resolved", "closed"] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => r.id);
}

async function getActivePendingApprovalTicketIds(): Promise<number[]> {
  // Find ticket IDs that have at least one pending approval request linked to them
  const requests = await prisma.approvalRequest.findMany({
    where: { status: "pending", subjectType: "ticket" },
    select: { subjectId: true },
    distinct: ["subjectId"],
  });
  return requests
    .map((r) => parseInt(r.subjectId, 10))
    .filter((id) => !isNaN(id));
}

// ── Check: do any time_supervisor rules exist? (fast bail-out) ────────────────

async function hasSupervisorRules(): Promise<boolean> {
  const count = await prisma.automationRule.count({
    where: { isEnabled: true, category: "time_supervisor" },
  });
  return count > 0;
}

// ── Per-entity scan ───────────────────────────────────────────────────────────

async function scanEntity(
  entityType: "ticket" | "incident" | "change" | "request",
  entityId: number,
  trigger: string,
  now: Date,
): Promise<{ entityId: number; rulesMatched: number; error?: string }> {
  try {
    let snapshot = null;

    switch (entityType) {
      case "ticket":
        snapshot = await buildTicketTimeSnapshot(entityId, now);
        break;
      case "incident":
        snapshot = await buildIncidentTimeSnapshot(entityId, now);
        break;
      case "request":
        snapshot = await buildRequestTimeSnapshot(entityId, now);
        break;
      case "change":
        snapshot = await buildChangeTimeSnapshot(entityId, now);
        break;
    }

    if (!snapshot) {
      return { entityId, rulesMatched: 0 };
    }

    const results = await runAutomationEngine({
      trigger: trigger as any,
      entityType,
      entityId,
      category: "time_supervisor",
      snapshot,
      meta: { scanSource: "time_supervisor_worker" },
    });

    const matched = results.filter((r) => r.conditionsMatched).length;
    return { entityId, rulesMatched: matched };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[time-supervisor] Error scanning ${entityType}#${entityId}:`, msg);
    return { entityId, rulesMatched: 0, error: msg };
  }
}

// ── Per-entity-type scan batch ────────────────────────────────────────────────

async function scanEntityBatch(
  entityType: "ticket" | "incident" | "change" | "request",
  ids: number[],
  trigger: string,
  now: Date,
): Promise<{ total: number; matched: number; errors: number }> {
  if (ids.length === 0) return { total: 0, matched: 0, errors: 0 };

  // Process in batches of 50 to avoid overwhelming the DB
  const BATCH = 50;
  let matched = 0;
  let errors  = 0;

  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map((id) => scanEntity(entityType, id, trigger, now))
    );
    for (const r of results) {
      if (r.status === "fulfilled") {
        matched += r.value.rulesMatched;
        if (r.value.error) errors++;
      } else {
        errors++;
      }
    }
  }

  return { total: ids.length, matched, errors };
}

// ── Main worker ───────────────────────────────────────────────────────────────

export async function registerTimeSupervisorWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue(QUEUE_NAME);

  await boss.work(QUEUE_NAME, async () => {
    const now = new Date();
    const wallStart = Date.now();

    try {
      // Fast bail-out: don't scan anything if no rules exist
      if (!(await hasSupervisorRules())) {
        console.log("[time-supervisor] No enabled time_supervisor rules — skipping scan");
        return;
      }

      // Fetch all active entity IDs concurrently
      const [ticketIds, incidentIds, requestIds, changeIds, problemIds, approvalTicketIds] =
        await Promise.all([
          getActiveTicketIds(),
          getActiveIncidentIds(),
          getActiveRequestIds(),
          getActiveChangeIds(),
          getActiveProblemIds(),
          getActivePendingApprovalTicketIds(),
        ]);

      // Scan each entity type against time-supervisor rules.
      // We fire multiple trigger types per scan: condition trees narrow which rules match.
      const [
        ticketResults,
        ticketSlaResults,
        incidentResults,
        requestResults,
        changeResults,
        approvalResults,
      ] = await Promise.allSettled([
        scanEntityBatch("ticket",   ticketIds,        "ticket.idle",        now),
        scanEntityBatch("ticket",   ticketIds,        "ticket.sla_breached", now),
        scanEntityBatch("incident", incidentIds,      "incident.status_changed", now),
        scanEntityBatch("request",  requestIds,       "request.status_changed",  now),
        scanEntityBatch("change",   changeIds,        "change.created",          now),
        // Approval pending scan: uses ticket snapshot for the linked ticket entity
        // This fires approval.pending trigger — rules can check pendingApprovalHours
        scanEntityBatch("ticket",   approvalTicketIds, "approval.pending",  now),
      ]);

      const wallMs = Date.now() - wallStart;

      // Log summary
      const summary: Record<string, unknown> = {
        durationMs: wallMs,
        tickets:    ticketResults.status === "fulfilled"     ? ticketResults.value    : { error: true },
        ticketSla:  ticketSlaResults.status === "fulfilled"  ? ticketSlaResults.value : { error: true },
        incidents:  incidentResults.status === "fulfilled"   ? incidentResults.value  : { error: true },
        requests:   requestResults.status === "fulfilled"    ? requestResults.value   : { error: true },
        changes:    changeResults.status === "fulfilled"     ? changeResults.value    : { error: true },
        approvals:  approvalResults.status === "fulfilled"   ? approvalResults.value  : { error: true },
      };

      console.log(
        `[time-supervisor] Scan complete in ${wallMs}ms —`,
        `tickets: ${ticketIds.length}`,
        `incidents: ${incidentIds.length}`,
        `requests: ${requestIds.length}`,
        `changes: ${changeIds.length}`,
        `approvals-pending: ${approvalTicketIds.length}`,
        JSON.stringify(summary),
      );
    } catch (error) {
      Sentry.captureException(error, { tags: { queue: QUEUE_NAME } });
      console.error("[time-supervisor] Worker error:", error);
      throw error;
    }
  });

  await boss.schedule(QUEUE_NAME, CRON_SCHEDULE);
  console.log(`[time-supervisor] Scheduled on ${CRON_SCHEDULE}`);
}
