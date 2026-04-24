/**
 * Automation Engine — Capacity Routing
 *
 * Round-robin and least-loaded assignment strategies for the
 * `assign_round_robin` and `assign_least_loaded` actions.
 *
 * Round-robin uses a Redis-like atomic counter stored in a SystemSetting
 * JSON blob keyed by team id. For the initial implementation, it reads a
 * simple counter from the SystemSetting table (section = "_automation_rr").
 */

import prisma from "../../db";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getTeamAgentIds(teamId: number): Promise<string[]> {
  const members = await prisma.teamMember.findMany({
    where: { teamId },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

// ── Round-robin ───────────────────────────────────────────────────────────────

const RR_SECTION = "_automation_rr";

async function getRrCounter(teamId: number): Promise<number> {
  const setting = await prisma.systemSetting.findUnique({ where: { section: RR_SECTION } });
  const data = (setting?.data as Record<string, number>) ?? {};
  return data[String(teamId)] ?? 0;
}

async function bumpRrCounter(teamId: number, total: number): Promise<void> {
  const setting = await prisma.systemSetting.findUnique({ where: { section: RR_SECTION } });
  const data = ((setting?.data as Record<string, number>) ?? {});
  data[String(teamId)] = (data[String(teamId)] ?? 0 + 1) % total;
  await prisma.systemSetting.upsert({
    where:  { section: RR_SECTION },
    create: { section: RR_SECTION, data },
    update: { data },
  });
}

/**
 * Selects the next agent in round-robin order for the given team.
 * Returns null when the team has no members.
 */
export async function roundRobinAgentId(teamId: number): Promise<string | null> {
  const agentIds = await getTeamAgentIds(teamId);
  if (agentIds.length === 0) return null;
  const idx = await getRrCounter(teamId);
  const agentId = agentIds[idx % agentIds.length] ?? null;
  await bumpRrCounter(teamId, agentIds.length);
  return agentId;
}

// ── Least-loaded ──────────────────────────────────────────────────────────────

/**
 * Selects the team member with the fewest open tickets.
 * Open = status in ["open", "in_progress", "escalated"].
 * Returns null when the team has no members.
 */
export async function leastLoadedAgentId(teamId: number): Promise<string | null> {
  const agentIds = await getTeamAgentIds(teamId);
  if (agentIds.length === 0) return null;

  const counts = await prisma.ticket.groupBy({
    by: ["assignedToId"],
    where: {
      assignedToId: { in: agentIds },
      status: { in: ["open", "in_progress", "escalated"] },
      deletedAt: null,
    },
    _count: { id: true },
  });

  const loadMap = new Map<string, number>(
    counts.map((c) => [c.assignedToId!, c._count.id])
  );

  // Sort agents: prefer those not in loadMap (0 tickets), then ascending
  const sorted = [...agentIds].sort(
    (a, b) => (loadMap.get(a) ?? 0) - (loadMap.get(b) ?? 0)
  );

  const first = sorted[0];
  return first !== undefined ? first : null;
}
