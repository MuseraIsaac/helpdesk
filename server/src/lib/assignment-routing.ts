/**
 * Assignment & Capacity Routing Service
 *
 * Provides professional agent-selection logic for all `assign_*` automation
 * actions. Replaces the simplistic round-robin counter and least-loaded
 * lookups with a configurable, filterable, auditable routing pipeline.
 *
 * Pipeline (in order):
 *   1. Load team routing config (defaults if not configured)
 *   2. Load all team members + their AgentCapacityProfile
 *   3. Filter: skip deleted/inactive users
 *   4. Filter: skip unavailable agents (isAvailable=false) when config.respectCapacity
 *   5. Filter: skip agents at capacity (load ≥ maxConcurrentTickets) when config.respectCapacity
 *   6. Filter: skip off-shift agents when config.respectShifts
 *   7. Skill matching: score each agent by skill overlap
 *      - If skillMatchMode="required" and no overlap → exclude
 *      - If skillMatchMode="preferred" → bias selection toward better matches
 *   8. Apply strategy: round_robin | weighted_rr | least_loaded | skill_based
 *   9. If no eligible agent → try fallback agent (if configured)
 *  10. If fallback also unavailable → signal overflow team (if configured)
 *  11. Log RoutingDecision for audit trail
 *  12. Return RoutingResult
 *
 * All strategies are deterministic given the same inputs — no randomness.
 * Weighted round-robin uses a virtual-slot expansion (agent A weight 3 = 3 slots).
 */

import prisma from "../db";
import { getAgentsOnDutyNow } from "../routes/duty-plans";

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface TicketRoutingContext {
  ticketId: number;
  requiredSkills?: string[];    // skills requested by the action (for skill-based routing)
  requiredLanguage?: string | null; // e.g. "fr" — from requester customer record
  priority?: string | null;     // may bias selection in future
}

export interface RoutingResult {
  agentId: string | null;
  teamId: number;               // may differ from input if overflow was used
  strategy: string;             // strategy applied
  reason: string;               // human-readable rationale
  candidateCount: number;       // agents in team before filtering
  eligibleCount: number;        // agents after all filters
  skillScore?: number;          // best skill match score (0–100)
  fallbackUsed: boolean;
  overflowUsed: boolean;
  overflowTeamId: number | null;
  durationMs: number;
}

// ── Internal agent record ─────────────────────────────────────────────────────

interface AgentRecord {
  userId: string;
  name: string;
  openTickets: number;
  profile: {
    isAvailable: boolean;
    maxConcurrentTickets: number;
    skills: string[];
    languages: string[];
    timezone: string;
    shiftStart: string | null;
    shiftEnd: string | null;
    shiftDays: number[];
    weight: number;
  } | null;
}

// ── Default profile (used when no AgentCapacityProfile row exists) ────────────

interface AgentProfileShape {
  isAvailable: boolean;
  maxConcurrentTickets: number;
  skills: string[];
  languages: string[];
  timezone: string;
  shiftStart: string | null;
  shiftEnd: string | null;
  shiftDays: number[];
  weight: number;
}

const DEFAULT_PROFILE: AgentProfileShape = {
  isAvailable: true,
  maxConcurrentTickets: 10,
  skills: [],
  languages: [],
  timezone: "UTC",
  shiftStart: null,
  shiftEnd: null,
  shiftDays: [1, 2, 3, 4, 5],
  weight: 1,
};

// ── Shift check ───────────────────────────────────────────────────────────────

function isAgentOnShift(profile: AgentProfileShape, now: Date): boolean {
  const { shiftStart, shiftEnd, shiftDays, timezone } = profile;
  if (!shiftStart || !shiftEnd) return true; // no shift defined = always on

  try {
    // Get weekday and time in agent's timezone
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      weekday: "narrow",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);

    const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "";
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);

    // Map narrow weekday to ISO weekday number (1=Mon…7=Sun)
    const dayMap: Record<string, number> = { M: 1, T: 2, W: 3, t: 4, F: 5, S: 6, s: 7 };
    // Intl narrow weekday varies by locale; use numeric approach instead
    const numericDay = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long" })
      .format(now);
    const dayNumbers: Record<string, number> = {
      Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4,
      Friday: 5, Saturday: 6, Sunday: 7,
    };
    const isoDay = dayNumbers[numericDay] ?? 1;

    if (!shiftDays.includes(isoDay)) return false;

    const currentMinutes = hour * 60 + minute;
    const [startH, startM] = (shiftStart as string).split(":").map(Number);
    const [endH, endM]     = (shiftEnd as string).split(":").map(Number);
    const startMinutes = (startH ?? 9)  * 60 + (startM ?? 0);
    const endMinutes   = (endH   ?? 17) * 60 + (endM   ?? 0);

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } catch {
    return true; // fail open
  }
}

// ── Skill scoring ─────────────────────────────────────────────────────────────

function scoreSkills(agentSkills: string[], requiredSkills: string[]): number {
  if (requiredSkills.length === 0) return 100;
  if (agentSkills.length === 0) return 0;
  const agentSet = new Set(agentSkills.map((s) => s.toLowerCase()));
  const matched = requiredSkills.filter((s) => agentSet.has(s.toLowerCase())).length;
  return Math.round((matched / requiredSkills.length) * 100);
}

// ── Strategy implementations ──────────────────────────────────────────────────

function applyRoundRobin(agents: AgentRecord[], teamId: number, counter: number): string | null {
  if (agents.length === 0) return null;
  return agents[counter % agents.length]!.userId;
}

function applyWeightedRoundRobin(agents: AgentRecord[], counter: number): string | null {
  if (agents.length === 0) return null;
  // Expand each agent into `weight` slots
  const slots: string[] = [];
  for (const agent of agents) {
    const w = Math.max(1, Math.min(10, agent.profile?.weight ?? 1));
    for (let i = 0; i < w; i++) slots.push(agent.userId);
  }
  if (slots.length === 0) return null;
  return slots[counter % slots.length] ?? null;
}

function applyLeastLoaded(agents: AgentRecord[]): string | null {
  if (agents.length === 0) return null;
  return agents.slice().sort((a, b) => a.openTickets - b.openTickets)[0]!.userId;
}

function applySkillBased(
  agents: AgentRecord[],
  requiredSkills: string[],
): { agentId: string | null; score: number } {
  if (agents.length === 0) return { agentId: null, score: 0 };

  const scored = agents.map((a) => ({
    userId: a.userId,
    score:  scoreSkills(a.profile?.skills ?? [], requiredSkills),
    load:   a.openTickets,
  }));

  // Primary: highest skill score. Tie-break: lowest load.
  scored.sort((a, b) => b.score - a.score || a.load - b.load);
  return { agentId: scored[0]!.userId, score: scored[0]!.score };
}

// ── Round-robin counter storage ───────────────────────────────────────────────

const RR_SECTION = "_routing_rr";

async function getRrCounter(teamId: number): Promise<number> {
  const setting = await prisma.systemSetting.findUnique({ where: { section: RR_SECTION } });
  const data = (setting?.data as Record<string, number>) ?? {};
  return data[String(teamId)] ?? 0;
}

async function bumpRrCounter(teamId: number, slots: number): Promise<void> {
  const setting = await prisma.systemSetting.findUnique({ where: { section: RR_SECTION } });
  const data = (setting?.data as Record<string, number>) ?? {};
  // Fix: correct operator precedence (was `data[key] ?? 0 + 1`)
  data[String(teamId)] = ((data[String(teamId)] ?? 0) + 1) % slots;
  await prisma.systemSetting.upsert({
    where:  { section: RR_SECTION },
    create: { section: RR_SECTION, data },
    update: { data },
  });
}

// ── Load routing config ───────────────────────────────────────────────────────

async function loadRoutingConfig(teamId: number) {
  const config = await prisma.teamRoutingConfig.findUnique({
    where: { teamId },
  });
  return {
    strategy:        config?.strategy        ?? "round_robin",
    respectCapacity: config?.respectCapacity ?? true,
    respectShifts:   config?.respectShifts   ?? false,
    skillMatchMode:  config?.skillMatchMode  ?? "none",
    fallbackAgentId: config?.fallbackAgentId ?? null,
    fallbackTeamId:  config?.fallbackTeamId  ?? null,
    overflowAt:      config?.overflowAt      ?? null,
  };
}

// ── Load team agents with capacity and workload ───────────────────────────────

async function loadTeamAgents(teamId: number): Promise<AgentRecord[]> {
  const members = await prisma.teamMember.findMany({
    where: { teamId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          deletedAt: true,
          capacityProfile: true,
        },
      },
    },
  });

  // Get current open ticket counts per agent in one query
  const agentIds = members
    .filter((m) => !m.user.deletedAt)
    .map((m) => m.userId);

  const loadCounts = await prisma.ticket.groupBy({
    by: ["assignedToId"],
    where: {
      assignedToId: { in: agentIds },
      status: { in: ["open", "in_progress", "escalated"] },
      deletedAt: null,
    },
    _count: { id: true },
  });

  const loadMap = new Map(loadCounts.map((c) => [c.assignedToId!, c._count.id]));

  return members
    .filter((m) => !m.user.deletedAt)
    .map((m) => ({
      userId:      m.userId,
      name:        m.user.name,
      openTickets: loadMap.get(m.userId) ?? 0,
      profile:     m.user.capacityProfile ?? null,
    }));
}

// ── Overflow check ────────────────────────────────────────────────────────────

function isTeamOverflowing(agents: AgentRecord[], threshold: number | null): boolean {
  if (!threshold || agents.length === 0) return false;
  const avgLoad = agents.reduce((sum, a) => sum + a.openTickets, 0) / agents.length;
  return avgLoad >= threshold;
}

// ── Log routing decision ──────────────────────────────────────────────────────

async function logDecision(
  ticketId: number,
  teamId: number,
  result: RoutingResult,
  requiredSkills: string[],
): Promise<void> {
  try {
    await prisma.routingDecision.create({
      data: {
        ticketId,
        teamId,
        strategy:        result.strategy,
        candidateCount:  result.candidateCount,
        eligibleCount:   result.eligibleCount,
        selectedAgentId: result.agentId,
        reason:          result.reason,
        skillsRequired:  requiredSkills,
        fallbackUsed:    result.fallbackUsed,
        overflowUsed:    result.overflowUsed,
        durationMs:      result.durationMs,
      },
    });
  } catch (e) {
    console.error("[routing] Failed to log routing decision:", e);
  }
}

// ── Main routing entry point ──────────────────────────────────────────────────

/**
 * Select an agent for a ticket using the team's configured routing strategy.
 * Always returns a RoutingResult — agentId is null if no eligible agent found.
 */
export async function isAutoAssignmentEnabled(): Promise<boolean> {
  const row = await prisma.systemSetting.findUnique({
    where: { section: "routing_global" },
    select: { data: true },
  });
  const data = (row?.data ?? {}) as Record<string, unknown>;
  return data.autoAssignmentEnabled !== false;
}

export async function routeToAgent(
  teamId: number,
  ctx: TicketRoutingContext,
  overrideStrategy?: string,
): Promise<RoutingResult> {
  const start = Date.now();
  const requiredSkills = ctx.requiredSkills ?? [];

  // Global kill-switch: return an unassigned result immediately when auto-assignment is off
  const autoEnabled = await isAutoAssignmentEnabled();

  if (!autoEnabled) {
    return {
      agentId: null,
      teamId,
      strategy: "manual",
      reason: "auto_assignment_disabled",
      candidateCount: 0,
      eligibleCount: 0,
      fallbackUsed: false,
      overflowUsed: false,
      overflowTeamId: null,
      durationMs: Date.now() - start,
    };
  }

  const config = await loadRoutingConfig(teamId);
  const strategy = overrideStrategy ?? config.strategy;
  let allAgents = await loadTeamAgents(teamId);
  const now = new Date();

  // ── Duty plan filter: restrict to agents currently on shift ──────────────────
  // Only applies when a published duty plan exists for the team today.
  try {
    const onDutyIds = await getAgentsOnDutyNow(teamId);
    if (onDutyIds !== null) {
      // A plan exists — filter to on-duty agents only.
      const dutySet = new Set(onDutyIds);
      allAgents = allAgents.filter((a) => dutySet.has(a.userId));
    }
    // null = no active duty plan → fall through to normal capacity routing
  } catch {
    // duty plan check failure should never block routing
  }

  const candidateCount = allAgents.length;

  // ── Check overflow before filtering ──────────────────────────────────────────
  if (isTeamOverflowing(allAgents, config.overflowAt) && config.fallbackTeamId) {
    const overflowResult = await routeToAgent(config.fallbackTeamId, ctx, strategy);
    const durationMs = Date.now() - start;
    const result: RoutingResult = {
      ...overflowResult,
      teamId:         config.fallbackTeamId,
      overflowUsed:   true,
      overflowTeamId: config.fallbackTeamId,
      durationMs,
    };
    void logDecision(ctx.ticketId, teamId, result, requiredSkills);
    return result;
  }

  // ── Apply eligibility filters ─────────────────────────────────────────────
  let eligible = allAgents.filter((a) => {
    const profile: AgentProfileShape = {
      ...DEFAULT_PROFILE,
      ...(a.profile ?? {}),
    };

    // Availability flag
    if (config.respectCapacity && !profile.isAvailable) return false;

    // Capacity limit
    if (config.respectCapacity && a.openTickets >= profile.maxConcurrentTickets) return false;

    // Shift hours
    if (config.respectShifts && !isAgentOnShift(profile, now)) return false;

    return true;
  });

  // ── Language filter (soft — prefer but don't exclude unless no one matches) ─
  if (ctx.requiredLanguage) {
    const lang = ctx.requiredLanguage.toLowerCase();
    const languageMatches = eligible.filter((a) =>
      (a.profile?.languages ?? []).some((l) => l.toLowerCase() === lang)
    );
    if (languageMatches.length > 0) eligible = languageMatches;
    // If no language matches: keep all eligible (soft preference)
  }

  // ── Skill filtering ───────────────────────────────────────────────────────
  if (requiredSkills.length > 0 && config.skillMatchMode !== "none") {
    if (config.skillMatchMode === "required") {
      const withSkills = eligible.filter(
        (a) => scoreSkills(a.profile?.skills ?? [], requiredSkills) > 0
      );
      if (withSkills.length > 0) eligible = withSkills;
      // If nobody has required skills: fall through (better than leaving unassigned)
    }
    // For "preferred": strategy handles score-based ordering below
  }

  const eligibleCount = eligible.length;

  // ── No eligible agents — try fallback ─────────────────────────────────────
  if (eligibleCount === 0) {
    if (config.fallbackAgentId) {
      const durationMs = Date.now() - start;
      const result: RoutingResult = {
        agentId:        config.fallbackAgentId,
        teamId,
        strategy,
        reason:         `fallback_agent:no_eligible_candidates_in_team_${teamId}`,
        candidateCount,
        eligibleCount:  0,
        fallbackUsed:   true,
        overflowUsed:   false,
        overflowTeamId: null,
        durationMs,
      };
      void logDecision(ctx.ticketId, teamId, result, requiredSkills);
      return result;
    }
    const durationMs = Date.now() - start;
    const result: RoutingResult = {
      agentId:       null,
      teamId,
      strategy,
      reason:        `no_eligible_agents_in_team_${teamId}`,
      candidateCount,
      eligibleCount: 0,
      fallbackUsed:  false,
      overflowUsed:  false,
      overflowTeamId: null,
      durationMs,
    };
    void logDecision(ctx.ticketId, teamId, result, requiredSkills);
    return result;
  }

  // ── Apply strategy ────────────────────────────────────────────────────────
  let agentId: string | null = null;
  let reason  = strategy;
  let skillScore: number | undefined;

  if (strategy === "least_loaded") {
    agentId = applyLeastLoaded(eligible);
    const agent = eligible.find((a) => a.userId === agentId);
    reason = `least_loaded:${agent?.openTickets ?? 0}_open_tickets`;

  } else if (strategy === "skill_based") {
    const { agentId: skillId, score } = applySkillBased(eligible, requiredSkills);
    agentId    = skillId;
    skillScore = score;
    reason     = `skill_based:score_${score}_of_100`;

  } else if (strategy === "weighted_rr") {
    const slots: string[] = [];
    for (const agent of eligible) {
      const w = Math.max(1, Math.min(10, agent.profile?.weight ?? 1));
      for (let i = 0; i < w; i++) slots.push(agent.userId);
    }
    const counter = await getRrCounter(teamId);
    agentId = slots[counter % slots.length] ?? null;
    await bumpRrCounter(teamId, slots.length);
    reason = `weighted_rr:slot_${counter % slots.length}_of_${slots.length}`;

  } else if (strategy === "manual") {
    // Manual = no agent auto-assigned; team assignment only
    agentId = null;
    reason  = "manual:team_assignment_only";

  } else {
    // Default: round_robin
    const counter = await getRrCounter(teamId);
    agentId = applyRoundRobin(eligible, teamId, counter);
    await bumpRrCounter(teamId, eligible.length);
    reason = `round_robin:slot_${counter % eligible.length}_of_${eligible.length}`;
  }

  const durationMs = Date.now() - start;
  const result: RoutingResult = {
    agentId,
    teamId,
    strategy,
    reason,
    candidateCount,
    eligibleCount,
    skillScore,
    fallbackUsed:   false,
    overflowUsed:   false,
    overflowTeamId: null,
    durationMs,
  };

  void logDecision(ctx.ticketId, teamId, result, requiredSkills);
  return result;
}

// ── Backward-compatible convenience functions ─────────────────────────────────
// These replace the old capacity-routing.ts exports and now go through the
// full routing pipeline, respecting TeamRoutingConfig when present.

/**
 * Round-robin assignment — delegates to routeToAgent with strategy override.
 * Respects capacity and availability filters from TeamRoutingConfig.
 */
export async function roundRobinAgentId(teamId: number, ticketId = 0): Promise<string | null> {
  const result = await routeToAgent(teamId, { ticketId }, "round_robin");
  return result.agentId;
}

/**
 * Least-loaded assignment — delegates to routeToAgent with strategy override.
 */
export async function leastLoadedAgentId(teamId: number, ticketId = 0): Promise<string | null> {
  const result = await routeToAgent(teamId, { ticketId }, "least_loaded");
  return result.agentId;
}
