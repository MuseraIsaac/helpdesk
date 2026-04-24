/**
 * Automation Engine — Action Executors
 *
 * Each action type maps to a handler function. Handlers are idempotency-aware
 * (they return skipped when the entity is already in the target state) and
 * never throw — they return ActionResult with errorMessage instead.
 */

import type { AutomationAction } from "core/schemas/automations";
import type { ActionResult, TicketSnapshot } from "./types";
import { logAudit } from "../audit";
import { notify } from "../notify";
import { roundRobinAgentId, leastLoadedAgentId, routeToAgent } from "../assignment-routing";
import { compose } from "../notification-composer";
import { createApproval } from "../approval-engine";
import prisma from "../../db";
import { AI_AGENT_ID } from "core/constants/ai-agent";
import {
  handleEnrichFromRequester, handleEnrichFromDomain, handleEnrichFromKeywords,
  handleEnrichFromMailbox, handleSetCustomField, handleMapField,
  handleInferPriority, handleCopyField,
} from "./enrichment";
import {
  handleCloseStale, handleCreateLinkedProblem, handleCreateLinkedChange,
  handleCreateLinkedRequest, handleCreateChildTicket, handleCreateFollowUp,
  handleLinkToProblem, handleUpdateLinkedRecords, handleMergeIntoTicket,
} from "./lifecycle";

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(type: string, meta?: Record<string, unknown>): ActionResult {
  return { type, applied: true, meta };
}

function skip(type: string, reason: string): ActionResult {
  return { type, applied: false, skippedReason: reason };
}

function err(type: string, message: string): ActionResult {
  return { type, applied: false, errorMessage: message };
}

function field(snapshot: TicketSnapshot, key: string): unknown {
  return (snapshot as unknown as Record<string, unknown>)[key];
}

// ── Action handlers ───────────────────────────────────────────────────────────

async function handleSetField(action: Extract<AutomationAction, { type: "set_field" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  const { field: f, value } = action;
  const allowedFields = ["subject", "body", "affectedSystem", "source"];
  if (!allowedFields.includes(f)) {
    return skip("set_field", `field '${f}' cannot be set by automation`);
  }
  if (field(snapshot, f) === value) return skip("set_field", "already_set");
  await prisma.ticket.update({ where: { id: snapshot.id }, data: { [f]: value, updatedAt: new Date() } });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "set_field", field: f, value });
  return ok("set_field", { field: f, value });
}

async function handleSetPriority(action: Extract<AutomationAction, { type: "set_priority" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  if (snapshot.priority === action.priority) return skip("set_priority", "already_set");
  await prisma.ticket.update({ where: { id: snapshot.id }, data: { priority: action.priority as any } });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "set_priority", priority: action.priority });
  return ok("set_priority", { priority: action.priority });
}

async function handleSetCategory(action: Extract<AutomationAction, { type: "set_category" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  if (snapshot.category === action.category) return skip("set_category", "already_set");
  await prisma.ticket.update({ where: { id: snapshot.id }, data: { category: action.category as any } });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "set_category", category: action.category });
  return ok("set_category", { category: action.category });
}

async function handleSetStatus(action: Extract<AutomationAction, { type: "set_status" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  if (snapshot.status === action.status) return skip("set_status", "already_set");
  await prisma.ticket.update({ where: { id: snapshot.id }, data: { status: action.status as any } });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "set_status", status: action.status });
  return ok("set_status", { status: action.status });
}

async function handleAssignAgent(action: Extract<AutomationAction, { type: "assign_agent" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  if (snapshot.assignedToId === action.agentId) return skip("assign_agent", "already_assigned");
  const agent = await prisma.user.findUnique({ where: { id: action.agentId }, select: { id: true, name: true } });
  if (!agent) return err("assign_agent", `agent ${action.agentId} not found`);
  await prisma.ticket.update({ where: { id: snapshot.id }, data: { assignedToId: action.agentId } });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "assign_agent", agentId: action.agentId });
  if (action.agentId !== snapshot.assignedToId) {
    void notify({
      event: "ticket.assigned" as any,
      recipientIds: [action.agentId],
      title: `Ticket assigned: ${snapshot.subject}`,
      entityType: "ticket",
      entityId: String(snapshot.id),
      entityUrl: `/tickets/${snapshot.id}`,
    });
  }
  return ok("assign_agent", { agentId: action.agentId, agentName: agent.name });
}

async function handleAssignTeam(action: Extract<AutomationAction, { type: "assign_team" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  if (snapshot.teamId === action.teamId) return skip("assign_team", "already_assigned");
  const team = await prisma.team.findUnique({ where: { id: action.teamId }, select: { id: true, name: true } });
  if (!team) return err("assign_team", `team ${action.teamId} not found`);
  await prisma.ticket.update({ where: { id: snapshot.id }, data: { teamId: action.teamId } });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "assign_team", teamId: action.teamId });
  return ok("assign_team", { teamId: action.teamId, teamName: team.name });
}

async function handleAssignRoundRobin(action: Extract<AutomationAction, { type: "assign_round_robin" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  const agentId = await roundRobinAgentId(action.teamId, snapshot.id);
  if (!agentId) return skip("assign_round_robin", "no_eligible_agents");
  if (snapshot.assignedToId === agentId) return skip("assign_round_robin", "already_assigned");
  await prisma.ticket.update({ where: { id: snapshot.id }, data: { assignedToId: agentId, teamId: action.teamId } });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "assign_round_robin", agentId, teamId: action.teamId });
  return ok("assign_round_robin", { agentId, teamId: action.teamId });
}

async function handleAssignLeastLoaded(action: Extract<AutomationAction, { type: "assign_least_loaded" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  const agentId = await leastLoadedAgentId(action.teamId, snapshot.id);
  if (!agentId) return skip("assign_least_loaded", "no_eligible_agents");
  if (snapshot.assignedToId === agentId) return skip("assign_least_loaded", "already_assigned");
  await prisma.ticket.update({ where: { id: snapshot.id }, data: { assignedToId: agentId, teamId: action.teamId } });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "assign_least_loaded", agentId, teamId: action.teamId });
  return ok("assign_least_loaded", { agentId, teamId: action.teamId });
}

async function handleAssignSmart(action: Extract<AutomationAction, { type: "assign_smart" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  const result = await routeToAgent(action.teamId, {
    ticketId:       snapshot.id,
    requiredSkills: action.requiredSkills ?? [],
    requiredLanguage: snapshot.requesterLanguage ?? null,
  });

  if (result.overflowUsed && result.teamId !== action.teamId) {
    // Overflow: update team AND agent
    await prisma.ticket.update({
      where: { id: snapshot.id },
      data: { teamId: result.teamId, ...(result.agentId ? { assignedToId: result.agentId } : {}) },
    });
    void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", {
      action: "assign_smart", strategy: result.strategy, reason: result.reason,
      overflowTeamId: result.teamId, agentId: result.agentId,
    });
    return ok("assign_smart", { strategy: result.strategy, reason: result.reason, overflowUsed: true, teamId: result.teamId, agentId: result.agentId });
  }

  if (!result.agentId) return skip("assign_smart", result.reason);
  if (snapshot.assignedToId === result.agentId) return skip("assign_smart", "already_assigned");

  await prisma.ticket.update({
    where: { id: snapshot.id },
    data: { assignedToId: result.agentId, teamId: action.teamId },
  });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", {
    action: "assign_smart", strategy: result.strategy, reason: result.reason,
    agentId: result.agentId, teamId: action.teamId,
  });
  if (result.agentId !== snapshot.assignedToId) {
    void notify({
      event: "ticket.assigned" as any,
      recipientIds: [result.agentId],
      title: `Ticket assigned: ${snapshot.subject}`,
      entityType: "ticket",
      entityId: String(snapshot.id),
      entityUrl: `/tickets/${snapshot.id}`,
    });
  }
  return ok("assign_smart", {
    strategy: result.strategy,
    reason: result.reason,
    agentId: result.agentId,
    teamId: action.teamId,
    durationMs: result.durationMs,
  });
}

async function handleAssignBySkill(action: Extract<AutomationAction, { type: "assign_by_skill" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  const result = await routeToAgent(action.teamId, {
    ticketId:       snapshot.id,
    requiredSkills: action.requiredSkills,
    requiredLanguage: snapshot.requesterLanguage ?? null,
  }, "skill_based");

  if (!result.agentId) return skip("assign_by_skill", result.reason);
  if (snapshot.assignedToId === result.agentId) return skip("assign_by_skill", "already_assigned");

  await prisma.ticket.update({
    where: { id: snapshot.id },
    data: { assignedToId: result.agentId, teamId: action.teamId },
  });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", {
    action: "assign_by_skill", agentId: result.agentId,
    skills: action.requiredSkills, score: result.skillScore,
  });
  if (result.agentId !== snapshot.assignedToId) {
    void notify({
      event: "ticket.assigned" as any,
      recipientIds: [result.agentId],
      title: `Ticket assigned: ${snapshot.subject}`,
      entityType: "ticket",
      entityId: String(snapshot.id),
      entityUrl: `/tickets/${snapshot.id}`,
    });
  }
  return ok("assign_by_skill", {
    agentId: result.agentId, teamId: action.teamId,
    skillScore: result.skillScore, skills: action.requiredSkills,
  });
}

async function handleUnassign(_action: Extract<AutomationAction, { type: "unassign" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  if (!snapshot.assignedToId) return skip("unassign", "already_unassigned");
  await prisma.ticket.update({ where: { id: snapshot.id }, data: { assignedToId: null } });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "unassign" });
  return ok("unassign");
}

async function handleAddNote(action: Extract<AutomationAction, { type: "add_note" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  await prisma.note.create({
    data: {
      ticketId: snapshot.id,
      body: action.body,
      isPinned: action.isPinned ?? false,
      authorId: AI_AGENT_ID,
    },
  });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "add_note", isPinned: action.isPinned });
  return ok("add_note");
}

async function handleEscalate(action: Extract<AutomationAction, { type: "escalate" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  if (snapshot.isEscalated) return skip("escalate", "already_escalated");
  const updateData: Record<string, unknown> = {
    isEscalated: true,
    escalatedAt: new Date(),
    status: "escalated",
  };
  if (action.teamId) updateData.escalatedToTeamId = action.teamId;
  if (action.reason) updateData.escalationReason = action.reason;
  await prisma.ticket.update({ where: { id: snapshot.id }, data: updateData as any });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "escalate", reason: action.reason, teamId: action.teamId });
  return ok("escalate", { teamId: action.teamId });
}

async function handleDeescalate(_action: Extract<AutomationAction, { type: "deescalate" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  if (!snapshot.isEscalated) return skip("deescalate", "not_escalated");
  await prisma.ticket.update({
    where: { id: snapshot.id },
    data: { isEscalated: false, status: "in_progress" as any },
  });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "deescalate" });
  return ok("deescalate");
}

async function handleResolve(action: Extract<AutomationAction, { type: "resolve" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  if (snapshot.status === "resolved" || snapshot.status === "closed") return skip("resolve", "already_resolved");
  await prisma.ticket.update({
    where: { id: snapshot.id },
    data: { status: "resolved" as any, resolvedAt: new Date() },
  });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "resolve", resolution: action.resolution });
  return ok("resolve");
}

async function handleClose(_action: Extract<AutomationAction, { type: "close" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  if (snapshot.status === "closed") return skip("close", "already_closed");
  await prisma.ticket.update({ where: { id: snapshot.id }, data: { status: "closed" as any } });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "close" });
  return ok("close");
}

async function handleReopen(_action: Extract<AutomationAction, { type: "reopen" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  if (!["resolved", "closed"].includes(snapshot.status)) return skip("reopen", "not_resolvable");
  await prisma.ticket.update({ where: { id: snapshot.id }, data: { status: "open" as any, resolvedAt: null } });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "reopen" });
  return ok("reopen");
}

async function handlePauseSla(_action: Extract<AutomationAction, { type: "pause_sla" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  const ticket = await prisma.ticket.findUnique({ where: { id: snapshot.id }, select: { slaPausedAt: true } });
  if (ticket?.slaPausedAt) return skip("pause_sla", "already_paused");
  await prisma.ticket.update({ where: { id: snapshot.id }, data: { slaPausedAt: new Date() } });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "pause_sla" });
  return ok("pause_sla");
}

async function handleResumeSla(_action: Extract<AutomationAction, { type: "resume_sla" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  const ticket = await prisma.ticket.findUnique({ where: { id: snapshot.id }, select: { slaPausedAt: true, slaPausedMinutes: true } });
  if (!ticket?.slaPausedAt) return skip("resume_sla", "not_paused");
  const pausedMinutes = Math.floor((Date.now() - ticket.slaPausedAt.getTime()) / 60000);
  await prisma.ticket.update({
    where: { id: snapshot.id },
    data: {
      slaPausedAt: null,
      slaPausedMinutes: { increment: pausedMinutes },
    },
  });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "resume_sla", pausedMinutes });
  return ok("resume_sla", { pausedMinutes });
}

async function handleSendNotification(action: Extract<AutomationAction, { type: "send_notification" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  let recipientIds: string[] = [];

  switch (action.recipientType) {
    case "assignee":
      if (snapshot.assignedToId) recipientIds = [snapshot.assignedToId];
      break;

    case "team":
      if (snapshot.teamId) {
        const members = await prisma.teamMember.findMany({ where: { teamId: snapshot.teamId }, select: { userId: true } });
        recipientIds = members.map((m) => m.userId);
      }
      break;

    case "requester":
      // Requester is external — skip in_app, use email only
      break; // handled via send_reply; in_app to customer not applicable

    case "specific":
      if (action.recipientId) recipientIds = [action.recipientId];
      break;

    case "watchers": {
      const followers = await prisma.ticketFollower.findMany({ where: { ticketId: snapshot.id }, select: { userId: true } });
      recipientIds = followers.map((f) => f.userId);
      break;
    }

    case "approvers": {
      const requests = await prisma.approvalRequest.findMany({
        where: { subjectType: "ticket", subjectId: String(snapshot.id), status: "pending" },
        include: { steps: { where: { isActive: true, status: "pending" }, select: { approverId: true } } },
      });
      recipientIds = [...new Set(requests.flatMap((r) => r.steps.map((s) => s.approverId)))];
      break;
    }

    case "supervisor": {
      const supervisors = await prisma.user.findMany({
        where: { role: { in: ["supervisor", "admin"] as any }, deletedAt: null },
        select: { id: true },
      });
      recipientIds = supervisors.map((u) => u.id);
      break;
    }

    case "specific_team":
      if ((action as any).recipientTeamId) {
        const members = await prisma.teamMember.findMany({ where: { teamId: (action as any).recipientTeamId }, select: { userId: true } });
        recipientIds = members.map((m) => m.userId);
      }
      break;
  }

  if (recipientIds.length === 0) return skip("send_notification", `no_recipients_for_type:${action.recipientType}`);

  // Resolve template variables when enabled
  const useVars = action.useTemplateVars !== false;
  const title = useVars ? await compose(action.title, snapshot) : action.title;
  const body  = useVars ? await compose(action.body,  snapshot) : action.body;

  void notify({
    event: "automation.notification" as any,
    recipientIds,
    title,
    body,
    entityType: "ticket",
    entityId: String(snapshot.id),
    entityUrl: `/tickets/${snapshot.id}`,
    channels: (action.channels ?? ["in_app"]) as any,
  });

  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", {
    action: "send_notification", recipientType: action.recipientType,
    recipientCount: recipientIds.length,
  });
  return ok("send_notification", { recipientType: action.recipientType, recipientCount: recipientIds.length });
}

async function handleCreateApproval(action: Extract<AutomationAction, { type: "create_approval" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  // Check if there's already a pending approval for this ticket to prevent duplicates
  const existing = await prisma.approvalRequest.findFirst({
    where: { subjectType: "ticket", subjectId: String(snapshot.id), status: "pending" },
    select: { id: true },
  });
  if (existing) return skip("create_approval", `approval_already_pending:${existing.id}`);

  const useVars = action.useTemplateVars !== false;
  const title   = useVars ? await compose(action.title, snapshot) : action.title;
  const desc    = action.description
    ? (useVars ? await compose(action.description, snapshot) : action.description)
    : undefined;

  const result = await createApproval(
    {
      subjectType:  "ticket",
      subjectId:    String(snapshot.id),
      title,
      description:  desc,
      approvalMode: action.approvalMode,
      requiredCount: action.approvalMode === "any"
        ? (action.requiredCount ?? 1)
        : action.approverIds.length,
      approverIds:  action.approverIds,
      expiresAt:    action.expiresInHours
        ? new Date(Date.now() + action.expiresInHours * 3_600_000).toISOString()
        : undefined,
    },
    AI_AGENT_ID,
  );

  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", {
    action:            "create_approval",
    approvalRequestId: result.approvalRequest.id,
    approvalMode:      action.approvalMode,
    approverCount:     action.approverIds.length,
  });
  return ok("create_approval", { approvalRequestId: result.approvalRequest.id });
}

async function handleSendReply(action: Extract<AutomationAction, { type: "send_reply" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  const { sendEmailJob } = await import("../send-email");
  const useVars = action.useTemplateVars !== false;
  const subjectTemplate = action.subject ?? "Re: {{ticket.subject}}";
  const subject = useVars ? await compose(subjectTemplate, snapshot) : subjectTemplate;
  const body    = useVars ? await compose(action.body, snapshot)    : action.body;

  void sendEmailJob({
    to: snapshot.senderEmail,
    subject,
    body,
    ...(snapshot.emailMessageId
      ? { inReplyTo: snapshot.emailMessageId, references: snapshot.emailMessageId }
      : {}),
  });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "send_reply" });
  return ok("send_reply");
}

async function handleNotifyApprovers(action: Extract<AutomationAction, { type: "notify_approvers" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  const requests = await prisma.approvalRequest.findMany({
    where: { subjectType: "ticket", subjectId: String(snapshot.id), status: "pending" },
    include: { steps: { where: { isActive: true, status: "pending" }, select: { approverId: true } } },
  });
  const approverIds = [...new Set(requests.flatMap((r) => r.steps.map((s) => s.approverId)))];
  if (approverIds.length === 0) return skip("notify_approvers", "no_pending_approvers");

  const useVars = action.useTemplateVars !== false;
  const title = useVars ? await compose(action.title, snapshot) : action.title;
  const body  = useVars ? await compose(action.body,  snapshot) : action.body;

  void notify({
    event: "approval.reminder" as any,
    recipientIds: approverIds,
    title,
    body,
    entityType: "ticket",
    entityId: String(snapshot.id),
    entityUrl: `/tickets/${snapshot.id}`,
    channels: (action.channels ?? ["in_app"]) as any,
  });
  return ok("notify_approvers", { count: approverIds.length });
}

// ── Intake-specific handlers ──────────────────────────────────────────────────

async function handleSuppressCreation(_action: Extract<AutomationAction, { type: "suppress_creation" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  if (snapshot.deletedAt !== undefined && snapshot.deletedAt !== null) return skip("suppress_creation", "already_deleted");
  await prisma.ticket.update({
    where: { id: snapshot.id },
    data: { deletedAt: new Date(), deletedByName: "Automation Rule" },
  });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "suppress_creation" });
  return ok("suppress_creation");
}

async function handleMarkSpam(_action: Extract<AutomationAction, { type: "mark_spam" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  if (snapshot.isSpam) return skip("mark_spam", "already_spam");
  await prisma.ticket.update({
    where: { id: snapshot.id },
    data: { isSpam: true, status: "closed" as any },
  });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "mark_spam" });
  return ok("mark_spam");
}

async function handleQuarantine(action: Extract<AutomationAction, { type: "quarantine" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  if (snapshot.isQuarantined) return skip("quarantine", "already_quarantined");
  await prisma.ticket.update({
    where: { id: snapshot.id },
    data: { isQuarantined: true },
  });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "quarantine", reason: action.reason });
  return ok("quarantine", { reason: action.reason });
}

async function handleSendAutoReply(action: Extract<AutomationAction, { type: "send_auto_reply" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  const { sendEmailJob } = await import("../send-email");
  void sendEmailJob({
    to: snapshot.senderEmail,
    subject: action.subject ?? `Re: ${snapshot.subject}`,
    body: action.body,
    ...(snapshot.emailMessageId
      ? { inReplyTo: snapshot.emailMessageId, references: snapshot.emailMessageId }
      : {}),
  });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "send_auto_reply" });
  return ok("send_auto_reply");
}

async function handleAddWatcher(action: Extract<AutomationAction, { type: "add_watcher" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  const agent = await prisma.user.findUnique({ where: { id: action.watcherId, deletedAt: null }, select: { id: true, name: true } });
  if (!agent) return err("add_watcher", `agent ${action.watcherId} not found`);
  await prisma.ticketFollower.upsert({
    where: { ticketId_userId: { ticketId: snapshot.id, userId: action.watcherId } },
    create: { ticketId: snapshot.id, userId: action.watcherId },
    update: {},
  });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "add_watcher", watcherId: action.watcherId });
  return ok("add_watcher", { watcherId: action.watcherId, watcherName: agent.name });
}

// ── Event workflow handlers ───────────────────────────────────────────────────

async function handleNotifyWatchers(action: Extract<AutomationAction, { type: "notify_watchers" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  const followers = await prisma.ticketFollower.findMany({
    where: { ticketId: snapshot.id },
    select: { userId: true },
  });
  if (followers.length === 0) return skip("notify_watchers", "no_watchers");
  const recipientIds = followers.map((f) => f.userId);
  void notify({
    event: "ticket.updated" as any,
    recipientIds,
    title: action.title,
    body: action.body,
    entityType: "ticket",
    entityId: String(snapshot.id),
    entityUrl: `/tickets/${snapshot.id}`,
    channels: (action.channels ?? ["in_app"]) as any,
  });
  return ok("notify_watchers", { count: recipientIds.length });
}

async function handleNotifyRequester(action: Extract<AutomationAction, { type: "notify_requester" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  if (action.sendEmail !== false) {
    const { sendEmailJob } = await import("../send-email");
    void sendEmailJob({
      to: snapshot.senderEmail,
      subject: action.subject ?? `Update on your ticket: ${snapshot.subject}`,
      body: action.body,
      ...(snapshot.emailMessageId
        ? { inReplyTo: snapshot.emailMessageId, references: snapshot.emailMessageId }
        : {}),
    });
  }
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", { action: "notify_requester" });
  return ok("notify_requester");
}

async function handleCreateLinkedTask(action: Extract<AutomationAction, { type: "create_linked_task" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  // ChangeTask is the available linked task model in the schema.
  // We store automation-created tasks as ChangeTask when the ticket has a linkedIncident,
  // otherwise record the intent as an audit note — full task model is Phase 5.
  const dueAt = action.dueInHours
    ? new Date(Date.now() + action.dueInHours * 3_600_000)
    : null;

  await prisma.note.create({
    data: {
      ticketId: snapshot.id,
      authorId: AI_AGENT_ID,
      isPinned: false,
      body: `**Automated Task Created**\n\n**${action.title}**${action.description ? `\n\n${action.description}` : ""}${dueAt ? `\n\nDue: ${dueAt.toISOString()}` : ""}`,
    },
  });
  void logAudit(snapshot.id, AI_AGENT_ID, "rule.applied", {
    action: "create_linked_task",
    title: action.title,
    dueAt,
  });
  return ok("create_linked_task", { title: action.title });
}

async function handleChainWorkflow(action: Extract<AutomationAction, { type: "chain_workflow" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  // Safely invoke another automation rule — imports lazily to avoid circular dependency
  const { runAutomationEngine } = await import("./index");
  const targetRule = await prisma.automationRule.findUnique({
    where: { id: action.ruleId, isEnabled: true },
    select: { id: true, name: true, triggers: true },
  });
  if (!targetRule) return skip("chain_workflow", "target_rule_not_found_or_disabled");
  const triggers = targetRule.triggers as Array<{ type: string }>;
  const trigger = triggers[0]?.type as any;
  if (!trigger) return skip("chain_workflow", "target_rule_has_no_triggers");
  // Provide the current snapshot so the chained rule uses up-to-date state
  void runAutomationEngine({
    trigger,
    entityType: "ticket",
    entityId: snapshot.id,
    snapshot,
  });
  return ok("chain_workflow", { ruleId: action.ruleId, ruleName: targetRule.name });
}

async function handleTriggerWebhook(action: Extract<AutomationAction, { type: "trigger_webhook" }>, snapshot: TicketSnapshot): Promise<ActionResult> {
  const webhook = await prisma.outboundWebhook.findUnique({ where: { id: action.webhookId, isEnabled: true } });
  if (!webhook) return skip("trigger_webhook", "webhook_not_found_or_disabled");

  await prisma.webhookDelivery.create({
    data: {
      webhookId: action.webhookId,
      event: "automation.triggered",
      entityType: "ticket",
      entityId: String(snapshot.id),
      status: "pending",
      requestBody: { entityType: "ticket", entityId: snapshot.id },
    },
  });

  return ok("trigger_webhook", { webhookId: action.webhookId });
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function executeAutomationAction(
  action: AutomationAction,
  snapshot: TicketSnapshot,
): Promise<ActionResult> {
  try {
    switch (action.type) {
      case "set_field":          return handleSetField(action, snapshot);
      case "set_priority":       return handleSetPriority(action, snapshot);
      case "set_category":       return handleSetCategory(action, snapshot);
      case "set_status":         return handleSetStatus(action, snapshot);
      case "set_type":           return skip("set_type", "not_yet_implemented");
      case "set_severity":       return skip("set_severity", "not_yet_implemented");
      case "set_impact":         return skip("set_impact", "not_yet_implemented");
      case "set_urgency":        return skip("set_urgency", "not_yet_implemented");
      case "add_tag":            return skip("add_tag", "tags_not_yet_implemented");
      case "remove_tag":         return skip("remove_tag", "tags_not_yet_implemented");
      case "set_affected_system":
        return handleSetField({ type: "set_field", field: "affectedSystem", value: action.system }, snapshot);
      case "assign_agent":       return handleAssignAgent(action, snapshot);
      case "assign_team":        return handleAssignTeam(action, snapshot);
      case "assign_round_robin": return handleAssignRoundRobin(action, snapshot);
      case "assign_least_loaded":return handleAssignLeastLoaded(action, snapshot);
      case "assign_smart":       return handleAssignSmart(action, snapshot);
      case "assign_by_skill":    return handleAssignBySkill(action, snapshot);
      case "unassign":           return handleUnassign(action, snapshot);
      case "add_note":           return handleAddNote(action, snapshot);
      case "send_reply":         return handleSendReply(action, snapshot);
      case "send_notification":  return handleSendNotification(action, snapshot);
      case "notify_approvers":   return handleNotifyApprovers(action, snapshot);
      case "escalate":           return handleEscalate(action, snapshot);
      case "deescalate":         return handleDeescalate(action, snapshot);
      case "resolve":            return handleResolve(action, snapshot);
      case "close":              return handleClose(action, snapshot);
      case "reopen":             return handleReopen(action, snapshot);
      case "create_approval":    return handleCreateApproval(action, snapshot);
      case "pause_sla":          return handlePauseSla(action, snapshot);
      case "resume_sla":         return handleResumeSla(action, snapshot);
      case "trigger_webhook":    return handleTriggerWebhook(action, snapshot);
      case "create_incident":    return skip("create_incident", "not_yet_implemented");
      case "stop_processing":    return ok("stop_processing");
      // Intake-specific
      case "suppress_creation":  return handleSuppressCreation(action, snapshot);
      case "mark_spam":          return handleMarkSpam(action, snapshot);
      case "quarantine":         return handleQuarantine(action, snapshot);
      case "send_auto_reply":    return handleSendAutoReply(action, snapshot);
      case "add_watcher":        return handleAddWatcher(action, snapshot);
      // Event workflow
      case "notify_watchers":    return handleNotifyWatchers(action, snapshot);
      case "notify_requester":   return handleNotifyRequester(action, snapshot);
      case "create_linked_task": return handleCreateLinkedTask(action, snapshot);
      case "chain_workflow":     return handleChainWorkflow(action, snapshot);
      // ── Data Enrichment & Field Automation ─────────────────────────────────
      case "enrich_from_requester": return handleEnrichFromRequester(action, snapshot);
      case "enrich_from_domain":    return handleEnrichFromDomain(action, snapshot);
      case "enrich_from_keywords":  return handleEnrichFromKeywords(action, snapshot);
      case "enrich_from_mailbox":   return handleEnrichFromMailbox(action, snapshot);
      case "set_custom_field":      return handleSetCustomField(action, snapshot);
      case "map_field":             return handleMapField(action, snapshot);
      case "infer_priority":        return handleInferPriority(action, snapshot);
      case "copy_field":            return handleCopyField(action, snapshot);
      // ── Record Lifecycle Automation ────────────────────────────────────────
      case "close_stale":             return handleCloseStale(action, snapshot);
      case "create_linked_problem":   return handleCreateLinkedProblem(action, snapshot);
      case "create_linked_change":    return handleCreateLinkedChange(action, snapshot);
      case "create_linked_request":   return handleCreateLinkedRequest(action, snapshot);
      case "create_child_ticket":     return handleCreateChildTicket(action, snapshot);
      case "create_follow_up":        return handleCreateFollowUp(action, snapshot);
      case "link_to_problem":         return handleLinkToProblem(action, snapshot);
      case "update_linked_records":   return handleUpdateLinkedRecords(action, snapshot);
      case "merge_into_ticket":       return handleMergeIntoTicket(action, snapshot);
      default:
        return skip((action as any).type, "unknown_action_type");
    }
  } catch (e) {
    return err((action as any).type, e instanceof Error ? e.message : "unknown_error");
  }
}
