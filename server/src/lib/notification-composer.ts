/**
 * Notification Composer
 *
 * Resolves template variables in notification titles, bodies, and subjects
 * using the current ticket/entity snapshot context.
 *
 * Template variable syntax: {{namespace.field}}
 *
 * Supported variables:
 *   {{ticket.number}}        — ticketNumber (e.g. TKT0042)
 *   {{ticket.subject}}       — ticket subject line
 *   {{ticket.status}}        — current status (e.g. "in_progress")
 *   {{ticket.priority}}      — priority (e.g. "high")
 *   {{ticket.category}}      — category if set
 *   {{ticket.url}}           — relative URL (/tickets/:id)
 *   {{ticket.id}}            — numeric ticket ID
 *   {{requester.name}}       — senderName
 *   {{requester.email}}      — senderEmail
 *   {{requester.org}}        — requesterOrgName if enriched
 *   {{agent.name}}           — agent name (looked up by assignedToId)
 *   {{team.name}}            — team name (looked up by teamId)
 *
 * All unresolved variables are replaced with an empty string.
 * Composer never throws — failures leave the original text intact.
 */

import prisma from "../db";
import type { TicketSnapshot } from "./automation-engine/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TemplateContext {
  snapshot: TicketSnapshot;
  agentName?: string | null;
  teamName?: string | null;
}

// ── Variable resolution ───────────────────────────────────────────────────────

/**
 * Replaces all {{namespace.field}} occurrences in `template` with resolved values.
 * Context-agnostic; caller is responsible for enriching the context object.
 */
export function resolveVars(template: string, ctx: TemplateContext): string {
  const { snapshot } = ctx;

  const vars: Record<string, string | null | undefined> = {
    "ticket.number":    snapshot.ticketNumber ?? `#${snapshot.id}`,
    "ticket.subject":   snapshot.subject,
    "ticket.status":    snapshot.status,
    "ticket.priority":  snapshot.priority ?? "",
    "ticket.category":  snapshot.category ?? "",
    "ticket.url":       `/tickets/${snapshot.id}`,
    "ticket.id":        String(snapshot.id),
    "requester.name":   snapshot.senderName,
    "requester.email":  snapshot.senderEmail,
    "requester.org":    snapshot.requesterOrgName ?? "",
    "agent.name":       ctx.agentName ?? "",
    "team.name":        ctx.teamName ?? "",
    // Ticket aliases for backward compatibility
    "ticket.type":      snapshot.ticketType ?? "",
    "ticket.severity":  snapshot.severity ?? "",
    "ticket.impact":    snapshot.impact ?? "",
    "ticket.urgency":   snapshot.urgency ?? "",
  };

  return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const normalized = key.trim().toLowerCase();
    const value = vars[normalized];
    return value != null ? value : "";
  });
}

/**
 * Loads agent + team names for a snapshot and returns a fully populated context.
 * This is the async version used by action handlers.
 */
export async function buildTemplateContext(snapshot: TicketSnapshot): Promise<TemplateContext> {
  let agentName: string | null = null;
  let teamName: string | null = null;

  try {
    if (snapshot.assignedToId) {
      const agent = await prisma.user.findUnique({
        where: { id: snapshot.assignedToId },
        select: { name: true },
      });
      agentName = agent?.name ?? null;
    }

    if (snapshot.teamId) {
      const team = await prisma.team.findUnique({
        where: { id: snapshot.teamId },
        select: { name: true },
      });
      teamName = team?.name ?? null;
    }
  } catch {
    // Best-effort — leave null on any lookup failure
  }

  return { snapshot, agentName, teamName };
}

/**
 * Convenience: resolve template variables async, returning the composed string.
 */
export async function compose(template: string, snapshot: TicketSnapshot): Promise<string> {
  const ctx = await buildTemplateContext(snapshot);
  return resolveVars(template, ctx);
}
