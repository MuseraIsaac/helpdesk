/**
 * Time-Snapshot Builder
 *
 * Builds enriched snapshots for the `time_supervisor` automation category.
 * Unlike event-driven snapshots (which capture the state at a point in time),
 * time snapshots compute relative duration fields so conditions can express:
 *   "ageHours > 48"  "idleHours > 24"  "hoursUntilSlaResolution < 2"
 *
 * All duration fields are in floating-point hours.
 * null = the metric is not applicable or data is unavailable.
 *
 * Supports:
 *  - Tickets  — full set of time metrics
 *  - Incidents — basic metrics (age, idle, status change time)
 *  - Service Requests — age, idle, pending approval time
 *  - Changes  — age, idle, state change time
 *  - Problems — age, idle, status change time
 *  - Approval Requests — pending duration
 */

import prisma from "../db";
import type { TicketSnapshot } from "./automation-engine/types";
import { isBusinessHours } from "./intake-routing";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MS_PER_HOUR = 3_600_000;

function hoursAgo(date: Date | null | undefined, now: Date): number | null {
  if (!date) return null;
  return (now.getTime() - date.getTime()) / MS_PER_HOUR;
}

function hoursUntil(date: Date | null | undefined, now: Date): number | null {
  if (!date) return null;
  return (date.getTime() - now.getTime()) / MS_PER_HOUR;
}

// ── Ticket time snapshot ──────────────────────────────────────────────────────

export async function buildTicketTimeSnapshot(
  ticketId: number,
  now: Date = new Date(),
): Promise<TicketSnapshot | null> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId, deletedAt: null },
    select: {
      id: true,
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
      deletedAt: true,
      // Intake
      emailMessageId: true,
      emailTo: true,
      emailCc: true,
      emailReplyTo: true,
      isAutoReply: true,
      isBounce: true,
      isSpam: true,
      isQuarantined: true,
      mailboxAlias: true,
      // Time-supervisor
      lastAgentReplyAt: true,
      lastCustomerReplyAt: true,
      statusChangedAt: true,
      // Requester enrichment
      customer: {
        select: {
          isVip: true,
          supportTier: true,
          timezone: true,
          language: true,
          organization: { select: { name: true, supportTier: true } },
        },
      },
    },
  });

  if (!ticket) return null;

  const { customer, ...ticketFields } = ticket;

  // Compute time since last reply (either agent or customer)
  const lastReplyDate =
    ticket.lastAgentReplyAt && ticket.lastCustomerReplyAt
      ? new Date(Math.max(ticket.lastAgentReplyAt.getTime(), ticket.lastCustomerReplyAt.getTime()))
      : (ticket.lastAgentReplyAt ?? ticket.lastCustomerReplyAt ?? null);

  const ageHours   = hoursAgo(ticket.createdAt, now) ?? 0;
  const idleHours  = hoursAgo(ticket.updatedAt, now) ?? 0;

  const senderDomain = ticket.senderEmail
    ? (ticket.senderEmail.split("@")[1] ?? null)
    : null;

  return {
    ...ticketFields,
    customFields: (ticket.customFields as Record<string, unknown>) ?? {},
    // Requester enrichment
    senderDomain,
    requesterIsVip:      customer?.isVip ?? false,
    requesterSupportTier: customer?.supportTier ?? customer?.organization?.supportTier ?? "standard",
    requesterOrgName:    customer?.organization?.name ?? null,
    requesterTimezone:   customer?.timezone ?? "UTC",
    requesterLanguage:   customer?.language ?? "en",
    isBusinessHours:     isBusinessHours(customer?.timezone ?? "UTC"),
    // Computed time metrics (hours)
    ageHours,
    idleHours,
    hoursSinceLastReply:        hoursAgo(lastReplyDate, now),
    hoursSinceLastAgentReply:   hoursAgo(ticket.lastAgentReplyAt, now),
    hoursSinceLastCustomerReply:hoursAgo(ticket.lastCustomerReplyAt, now),
    hoursUntilSlaFirstResponse: hoursUntil(ticket.firstResponseDueAt, now),
    hoursUntilSlaResolution:    hoursUntil(ticket.resolutionDueAt, now),
    hoursInCurrentStatus:       hoursAgo(ticket.statusChangedAt ?? ticket.createdAt, now),
    hoursUnassigned:            ticket.assignedToId ? null : ageHours,
  };
}

// ── Incident time snapshot (maps to TicketSnapshot shape) ─────────────────────

/**
 * Builds a TicketSnapshot-compatible object for an incident.
 * Field mapping: incident fields → TicketSnapshot fields where semantically equivalent.
 * Time fields are fully computed.
 */
export async function buildIncidentTimeSnapshot(
  incidentId: number,
  now: Date = new Date(),
): Promise<TicketSnapshot | null> {
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      assignedToId: true,
      teamId: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
      closedAt: true,
      acknowledgedAt: true,
      respondedAt: true,
      slaBreached: true,
      isMajor: true,
    },
  });

  if (!incident) return null;

  const ageHours  = hoursAgo(incident.createdAt, now) ?? 0;
  const idleHours = hoursAgo(incident.updatedAt, now) ?? 0;

  return {
    id: incident.id,
    subject:       incident.title,
    body:          incident.description ?? "",
    status:        incident.status,
    category:      null,
    priority:      incident.priority,
    severity:      incident.isMajor ? "sev1" : null,
    impact:        null,
    urgency:       null,
    ticketType:    "incident",
    source:        "incident",
    affectedSystem:null,
    senderEmail:   "",
    senderName:    "",
    assignedToId:  incident.assignedToId,
    teamId:        incident.teamId ?? null,
    isEscalated:   false,
    slaBreached:   incident.slaBreached,
    firstResponseDueAt: null,
    resolutionDueAt:    null,
    firstRespondedAt:   incident.respondedAt,
    resolvedAt:         incident.resolvedAt,
    linkedIncidentId:   null,
    customFields:       {},
    createdAt:     incident.createdAt,
    updatedAt:     incident.updatedAt,
    // Time metrics
    ageHours,
    idleHours,
    hoursInCurrentStatus: idleHours,
    isBusinessHours:      isBusinessHours(),
  };
}

// ── Service Request time snapshot ─────────────────────────────────────────────

export async function buildRequestTimeSnapshot(
  requestId: number,
  now: Date = new Date(),
): Promise<TicketSnapshot | null> {
  const req = await prisma.serviceRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      assignedToId: true,
      teamId: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
      slaDueAt: true,
      slaBreached: true,
      approvalStatus: true,
    },
  });

  if (!req) return null;

  const ageHours  = hoursAgo(req.createdAt, now) ?? 0;
  const idleHours = hoursAgo(req.updatedAt, now) ?? 0;

  // Pending approval hours — how long the request has been awaiting approval
  const pendingApprovalHours =
    req.approvalStatus === "pending"
      ? ageHours  // proxy: entire age as pending (no separate approval start stamp yet)
      : null;

  return {
    id: req.id,
    subject:       req.title,
    body:          req.description ?? "",
    status:        req.status,
    category:      null,
    priority:      req.priority,
    severity:      null,
    impact:        null,
    urgency:       null,
    ticketType:    "service_request",
    source:        "request",
    affectedSystem:null,
    senderEmail:   "",
    senderName:    "",
    assignedToId:  req.assignedToId,
    teamId:        req.teamId ?? null,
    isEscalated:   false,
    slaBreached:   req.slaBreached,
    firstResponseDueAt: null,
    resolutionDueAt:    req.slaDueAt,
    firstRespondedAt:   null,
    resolvedAt:         req.resolvedAt,
    linkedIncidentId:   null,
    customFields:       {},
    createdAt:     req.createdAt,
    updatedAt:     req.updatedAt,
    // Time metrics
    ageHours,
    idleHours,
    hoursUntilSlaResolution: hoursUntil(req.slaDueAt, now),
    hoursInCurrentStatus: idleHours,
    pendingApprovalHours,
    isBusinessHours: isBusinessHours(),
  };
}

// ── Change time snapshot ──────────────────────────────────────────────────────

export async function buildChangeTimeSnapshot(
  changeId: number,
  now: Date = new Date(),
): Promise<TicketSnapshot | null> {
  const change = await prisma.change.findUnique({
    where: { id: changeId },
    select: {
      id: true,
      title: true,
      description: true,
      state: true,
      priority: true,
      assignedToId: true,
      coordinatorGroupId: true,
      createdAt: true,
      updatedAt: true,
      submittedAt: true,
      approvedAt: true,
      plannedStart: true,
      plannedEnd: true,
    },
  });

  if (!change) return null;

  const ageHours  = hoursAgo(change.createdAt, now) ?? 0;
  const idleHours = hoursAgo(change.updatedAt, now) ?? 0;

  // Pending approval hours — if submitted but not yet approved
  const pendingApprovalHours =
    change.submittedAt && !change.approvedAt
      ? hoursAgo(change.submittedAt, now)
      : null;

  return {
    id: change.id,
    subject:       change.title,
    body:          change.description ?? "",
    status:        change.state,
    category:      null,
    priority:      change.priority,
    severity:      null,
    impact:        null,
    urgency:       null,
    ticketType:    "change_request",
    source:        "change",
    affectedSystem:null,
    senderEmail:   "",
    senderName:    "",
    assignedToId:  change.assignedToId,
    teamId:        change.coordinatorGroupId ?? null,
    isEscalated:   false,
    slaBreached:   false,
    firstResponseDueAt: null,
    resolutionDueAt: change.plannedEnd,
    firstRespondedAt:  null,
    resolvedAt:        null,
    linkedIncidentId:  null,
    customFields:      {},
    createdAt: change.createdAt,
    updatedAt: change.updatedAt,
    // Time metrics
    ageHours,
    idleHours,
    hoursInCurrentStatus: idleHours,
    hoursUntilSlaResolution: hoursUntil(change.plannedEnd, now),
    pendingApprovalHours,
    isBusinessHours: isBusinessHours(),
  };
}

// ── Problem time snapshot ─────────────────────────────────────────────────────

export async function buildProblemTimeSnapshot(
  problemId: number,
  now: Date = new Date(),
): Promise<TicketSnapshot | null> {
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      assignedToId: true,
      teamId: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
    },
  });

  if (!problem) return null;

  const ageHours  = hoursAgo(problem.createdAt, now) ?? 0;
  const idleHours = hoursAgo(problem.updatedAt, now) ?? 0;

  return {
    id: problem.id,
    subject:       problem.title,
    body:          problem.description ?? "",
    status:        problem.status,
    category:      null,
    priority:      problem.priority,
    severity:      null,
    impact:        null,
    urgency:       null,
    ticketType:    "problem",
    source:        "problem",
    affectedSystem:null,
    senderEmail:   "",
    senderName:    "",
    assignedToId:  problem.assignedToId,
    teamId:        problem.teamId ?? null,
    isEscalated:   false,
    slaBreached:   false,
    firstResponseDueAt: null,
    resolutionDueAt:    null,
    firstRespondedAt:   null,
    resolvedAt:         problem.resolvedAt,
    linkedIncidentId:   null,
    customFields:       {},
    createdAt: problem.createdAt,
    updatedAt: problem.updatedAt,
    ageHours,
    idleHours,
    hoursInCurrentStatus: idleHours,
    isBusinessHours: isBusinessHours(),
  };
}
