/**
 * Audit logging helper.
 *
 * All writes are best-effort: failures are captured to Sentry and logged to
 * stderr but never throw — an audit failure must never break the main flow.
 *
 * Settings are checked on every call (with a 60-second in-memory cache) so
 * that toggling `enabled` or any `capture*` category takes effect immediately
 * without requiring a server restart.
 *
 * Usage patterns:
 *   await logAudit(...)          // in route handlers — await so log is part of the response cycle
 *   void logAudit(...)           // in background jobs — fire-and-forget
 *
 * Meta conventions per action:
 *   ticket.created        { via: "agent" | "email" | "portal" }
 *   ticket.status_changed { from: TicketStatus, to: TicketStatus, automated?: boolean }
 *   ticket.priority_changed { from: string|null, to: string|null }
 *   ticket.severity_changed { from: string|null, to: string|null }
 *   ticket.category_changed { from: string|null, to: string|null }
 *   ticket.assigned       { from: {id,name}|null, to: {id,name}|null }
 *   ticket.sla_breached   { type: "first_response"|"resolution" }
 *   ticket.escalated      { reason: EscalationReason }
 *   ticket.deescalated    {}
 *   reply.created         { replyId: number, senderType: "agent"|"customer", automated?: boolean }
 *   note.created          { noteId: number }
 *   rule.applied          { ruleId: number, ruleName?: string, actions: string[] }
 *   workflow.executed     { workflowId: number }
 *   workflow.failed       { workflowId: number, error?: string }
 *   scenario.run          { scenarioId: number, scenarioName?: string }
 *
 * All ITSM / Asset / Approval / Customer / Team events (logged via logSystemAudit)
 * include these base meta fields so the UI can render entity links:
 *   entityType:   "incident" | "problem" | "change" | "request" | "asset" | "approval" | "customer" | "team"
 *   entityId:     number
 *   entityNumber: string  (human-readable, e.g. "INC-0001", "PRB-0003")
 *   entityTitle:  string  (optional — title/name of the entity)
 *
 * incident.*        { ...base, priority?, isMajor?, status? }
 * problem.*         { ...base, priority?, from?, to?, rootCause?, workaround? }
 * change.*          { ...base, changeType?, risk?, state?, from?, to? }
 * request.*         { ...base, priority?, from?, to?, via? }
 * asset.*           { ...base, assetTag?, type?, from?, to? }
 * approval.*        { ...base, approvalId, entityType, entityId, entityNumber, decidedBy? }
 * customer.*        { ...base, email? }
 * team.*            { ...base, memberId?, memberName? }
 */

import type { AuditAction } from "core/constants/audit-event.ts";
import type { AuditSettings } from "core/schemas/settings.ts";
import type { Prisma } from "../generated/prisma/client";
import prisma from "../db";
import Sentry from "./sentry";
import { getSection } from "./settings";

// ── Settings-to-action category mapping ──────────────────────────────────────
//
// Each audit action maps to one of the capture* toggles in AuditSettings.
// Actions not listed default to captureTicketEvents (all current events are
// ticket-scoped). Future categories (auth, settings, user, KB) are listed
// for forward-compatibility — add their action strings here as they're
// implemented.

type CaptureSetting = keyof Pick<
  AuditSettings,
  | "captureTicketEvents"
  | "captureIncidentEvents"
  | "captureProblemEvents"
  | "captureChangeEvents"
  | "captureRequestEvents"
  | "captureAssetEvents"
  | "captureApprovalEvents"
  | "captureCustomerEvents"
  | "captureTeamEvents"
  | "captureAuthEvents"
  | "captureSettingsChanges"
  | "captureUserManagement"
  | "captureKbEvents"
>;

const ACTION_CATEGORY: Partial<Record<AuditAction, CaptureSetting>> = {
  // ── Ticket lifecycle & collaboration ────────────────────────────────────
  "ticket.created":           "captureTicketEvents",
  "ticket.status_changed":    "captureTicketEvents",
  "ticket.priority_changed":  "captureTicketEvents",
  "ticket.severity_changed":  "captureTicketEvents",
  "ticket.category_changed":  "captureTicketEvents",
  "ticket.assigned":          "captureTicketEvents",
  "ticket.sla_breached":      "captureTicketEvents",
  "ticket.escalated":         "captureTicketEvents",
  "ticket.deescalated":       "captureTicketEvents",
  "ticket.merged":            "captureTicketEvents",
  "ticket.received_merge":    "captureTicketEvents",
  "ticket.unmerged":          "captureTicketEvents",
  "ticket.child_unmerged":    "captureTicketEvents",
  "ticket.intake_suppressed": "captureTicketEvents",
  "ticket.deleted":           "captureTicketEvents",
  "ticket.restored":          "captureTicketEvents",
  "reply.created":            "captureTicketEvents",
  "note.created":             "captureTicketEvents",
  "rule.applied":             "captureTicketEvents",
  "workflow.executed":        "captureTicketEvents",
  "workflow.failed":          "captureTicketEvents",
  "scenario.run":             "captureTicketEvents",
  // ── Incident lifecycle ──────────────────────────────────────────────────
  "incident.created":         "captureIncidentEvents",
  "incident.status_changed":  "captureIncidentEvents",
  "incident.assigned":        "captureIncidentEvents",
  "incident.priority_changed":"captureIncidentEvents",
  "incident.major_declared":  "captureIncidentEvents",
  "incident.major_cleared":   "captureIncidentEvents",
  "incident.update_posted":   "captureIncidentEvents",
  "incident.resolved":        "captureIncidentEvents",
  "incident.closed":          "captureIncidentEvents",
  "incident.sla_breached":    "captureIncidentEvents",
  "incident.linked_problem":  "captureIncidentEvents",
  "incident.deleted":         "captureIncidentEvents",
  // ── Problem lifecycle ───────────────────────────────────────────────────
  "problem.created":          "captureProblemEvents",
  "problem.status_changed":   "captureProblemEvents",
  "problem.assigned":         "captureProblemEvents",
  "problem.priority_changed": "captureProblemEvents",
  "problem.known_error_flagged": "captureProblemEvents",
  "problem.root_cause_updated":  "captureProblemEvents",
  "problem.workaround_updated":  "captureProblemEvents",
  "problem.linked_incident":  "captureProblemEvents",
  "problem.linked_ticket":    "captureProblemEvents",
  "problem.pir_completed":    "captureProblemEvents",
  "problem.resolved":         "captureProblemEvents",
  "problem.closed":           "captureProblemEvents",
  "problem.deleted":          "captureProblemEvents",
  // ── Change lifecycle ────────────────────────────────────────────────────
  "change.created":           "captureChangeEvents",
  "change.status_changed":    "captureChangeEvents",
  "change.assigned":          "captureChangeEvents",
  "change.submitted":         "captureChangeEvents",
  "change.approved":          "captureChangeEvents",
  "change.rejected":          "captureChangeEvents",
  "change.scheduled":         "captureChangeEvents",
  "change.started":           "captureChangeEvents",
  "change.completed":         "captureChangeEvents",
  "change.cancelled":         "captureChangeEvents",
  "change.rolled_back":       "captureChangeEvents",
  "change.task_created":      "captureChangeEvents",
  "change.task_completed":    "captureChangeEvents",
  "change.task_deleted":      "captureChangeEvents",
  "change.deleted":           "captureChangeEvents",
  // ── Service Request lifecycle ───────────────────────────────────────────
  "request.created":          "captureRequestEvents",
  "request.status_changed":   "captureRequestEvents",
  "request.assigned":         "captureRequestEvents",
  "request.approved":         "captureRequestEvents",
  "request.rejected":         "captureRequestEvents",
  "request.cancelled":        "captureRequestEvents",
  "request.completed":        "captureRequestEvents",
  "request.fulfilled":        "captureRequestEvents",
  "request.deleted":          "captureRequestEvents",
  // ── Asset lifecycle ─────────────────────────────────────────────────────
  "asset.created":            "captureAssetEvents",
  "asset.updated":            "captureAssetEvents",
  "asset.status_changed":     "captureAssetEvents",
  "asset.assigned":           "captureAssetEvents",
  "asset.unassigned":         "captureAssetEvents",
  "asset.deployed":           "captureAssetEvents",
  "asset.retired":            "captureAssetEvents",
  "asset.scrapped":           "captureAssetEvents",
  "asset.linked_ci":          "captureAssetEvents",
  "asset.linked_contract":    "captureAssetEvents",
  "asset.deleted":            "captureAssetEvents",
  // ── Approval lifecycle ──────────────────────────────────────────────────
  "approval.requested":       "captureApprovalEvents",
  "approval.approved":        "captureApprovalEvents",
  "approval.rejected":        "captureApprovalEvents",
  "approval.expired":         "captureApprovalEvents",
  // ── Customer / portal lifecycle ─────────────────────────────────────────
  "customer.registered":      "captureCustomerEvents",
  "customer.portal_login":    "captureCustomerEvents",
  "customer.portal_login_failed": "captureCustomerEvents",
  "customer.updated":         "captureCustomerEvents",
  "customer.deleted":         "captureCustomerEvents",
  // ── Team management ─────────────────────────────────────────────────────
  "team.created":             "captureTeamEvents",
  "team.updated":             "captureTeamEvents",
  "team.deleted":             "captureTeamEvents",
  "team.member_added":        "captureTeamEvents",
  "team.member_removed":      "captureTeamEvents",
  // ── Authentication ──────────────────────────────────────────────────────
  "auth.login":               "captureAuthEvents",
  "auth.logout":              "captureAuthEvents",
  "auth.login_failed":        "captureAuthEvents",
  // ── Settings changes ────────────────────────────────────────────────────
  "settings.updated":         "captureSettingsChanges",
  // ── User management ─────────────────────────────────────────────────────
  "user.created":             "captureUserManagement",
  "user.updated":             "captureUserManagement",
  "user.deleted":             "captureUserManagement",
  // ── Role management (filed under user management category) ──────────────
  "role.created":              "captureUserManagement",
  "role.updated":              "captureUserManagement",
  "role.permissions_changed":  "captureUserManagement",
  "role.deleted":              "captureUserManagement",
  // ── Knowledge base ──────────────────────────────────────────────────────
  "kb.article_created":           "captureKbEvents",
  "kb.article_published":         "captureKbEvents",
  "kb.article_archived":          "captureKbEvents",
  "kb.article_submitted_review":  "captureKbEvents",
  "kb.article_approved":          "captureKbEvents",
};

// ── Settings cache (1-minute TTL) ─────────────────────────────────────────────
//
// Avoids a DB round-trip on every single logAudit call while still picking up
// setting changes within a minute of them being saved.

let _settingsCache: { data: AuditSettings; expiresAt: number } | null = null;

async function getCachedAuditSettings(): Promise<AuditSettings> {
  if (_settingsCache && Date.now() < _settingsCache.expiresAt) {
    return _settingsCache.data;
  }
  const data = await getSection("audit");
  _settingsCache = { data, expiresAt: Date.now() + 60_000 };
  return data;
}

/** Invalidate the settings cache — call after saving audit settings. */
export function invalidateAuditSettingsCache(): void {
  _settingsCache = null;
}

// ── logAudit ──────────────────────────────────────────────────────────────────

/** Core write — shared by both logAudit and logSystemAudit. */
async function writeAuditEvent(
  ticketId: number | null,
  actorId: string | null,
  action: AuditAction,
  meta: Record<string, unknown>
): Promise<void> {
  try {
    const settings = await getCachedAuditSettings();
    if (!settings.enabled) return;

    const category: CaptureSetting = ACTION_CATEGORY[action] ?? "captureTicketEvents";
    if (!settings[category]) return;

    await prisma.auditEvent.create({
      data: {
        ...(ticketId !== null ? { ticketId } : {}),
        actorId,
        action,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { context: "audit", action } });
    console.error(`[audit] Failed to log "${action}":`, err);
  }
}

/**
 * Log an audit event scoped to a specific ticket.
 * All existing call sites use this signature.
 */
export async function logAudit(
  ticketId: number,
  actorId: string | null,
  action: AuditAction,
  meta: Record<string, unknown> = {}
): Promise<void> {
  return writeAuditEvent(ticketId, actorId, action, meta);
}

/**
 * Log a system-level audit event (no ticket context).
 * Used for auth, settings changes, user management, and KB events.
 *
 * Meta conventions:
 *   auth.login          { ip?, userAgent? }
 *   auth.logout         { ip? }
 *   auth.login_failed   { ip?, email? }
 *   settings.updated    { section: string, changedFields?: string[] }
 *   user.created        { userId: string, name: string, email: string, role: string }
 *   user.updated        { userId: string, name: string, changes: string[] }
 *   user.deleted        { userId: string, name: string, email: string }
 *   kb.article_created  { articleId: number, title: string, status: string }
 *   kb.article_published { articleId: number, title: string }
 *   kb.article_archived  { articleId: number, title: string }
 *   kb.article_submitted_review { articleId: number, title: string }
 *   kb.article_approved  { articleId: number, title: string }
 */
export async function logSystemAudit(
  actorId: string | null,
  action: AuditAction,
  meta: Record<string, unknown> = {}
): Promise<void> {
  return writeAuditEvent(null, actorId, action, meta);
}
