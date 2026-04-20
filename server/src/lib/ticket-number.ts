/**
 * ticket-number.ts — Concurrency-safe ticket number generation.
 *
 * Strategy
 * ────────
 * PostgreSQL's `INSERT … ON CONFLICT DO UPDATE … RETURNING` is an atomic
 * upsert that acquires a row-level exclusive lock on the target row before
 * the update executes. This serialises concurrent increments for the same
 * (series, period_key) without needing explicit transactions or advisory
 * locks, and without burning sequences or leaving gaps.
 *
 * Counter seeding
 * ───────────────
 * • First INSERT for a (series, period_key) pair uses `startAt` from settings.
 * • All subsequent calls increment last_value by 1.
 * • The migration pre-seeds the generic counter with MAX(id) so backfilled
 *   TKT numbers and future generated ones cannot collide.
 *
 * Format
 * ──────
 * {prefix}{dateSegment?}{zeroPaddedSequence}
 * Examples: INC0042  |  SR20240300001  |  TKT001000
 */

import prisma from "../db";
import { getSection } from "./settings";
import type { TicketType } from "../generated/prisma/client";

// ── Series mapping ────────────────────────────────────────────────────────────

export type TicketSeries = "ticket" | "change_request" | "problem";

/**
 * Maps a Prisma TicketType to its counter series.
 *
 * Incidents, service requests, and untyped tickets all share the "ticket"
 * series so their numbers are interleaved (TKT0001, TKT0002, …) rather than
 * counted separately. Change requests and problems keep dedicated series.
 */
export function ticketTypeToSeries(
  ticketType: TicketType | null | undefined
): TicketSeries {
  switch (ticketType) {
    case "change_request": return "change_request";
    case "problem":        return "problem";
    default:               return "ticket"; // incident, service_request, generic
  }
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function buildPeriodKey(resetPeriod: string, now: Date): string {
  if (resetPeriod === "yearly")  return String(now.getUTCFullYear());
  if (resetPeriod === "monthly") {
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    return `${y}${m}`;
  }
  return "";
}

function buildDateSegment(includeDateSegment: string, now: Date): string {
  if (includeDateSegment === "year")  return String(now.getUTCFullYear());
  if (includeDateSegment === "year_month") {
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    return `${y}${m}`;
  }
  return "";
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the next formatted ticket number for the given ticket type.
 * Safe to call from concurrent requests — the DB upsert serialises increments.
 *
 * @param ticketType  Prisma TicketType enum value, or null/undefined for generic
 * @param now         Injection point for the current time (defaults to new Date())
 */
export async function generateTicketNumber(
  ticketType: TicketType | null | undefined,
  now = new Date()
): Promise<string> {
  const settings = await getSection("ticket_numbering");
  const series   = ticketTypeToSeries(ticketType);
  const config   = settings[series];

  const pk = buildPeriodKey(config.resetPeriod, now);

  // Atomic counter increment.
  // • No existing row  → inserts startAt, returns startAt.
  // • Existing row     → increments last_value, returns new value.
  const [row] = await prisma.$queryRaw<[{ last_value: number }]>`
    INSERT INTO ticket_counter (series, period_key, last_value)
    VALUES (${series}, ${pk}, ${config.startAt})
    ON CONFLICT (series, period_key)
    DO UPDATE SET last_value = ticket_counter.last_value + 1
    RETURNING last_value
  `;

  const ds     = buildDateSegment(config.includeDateSegment, now);
  const padded = String(row.last_value).padStart(config.paddingLength, "0");

  return `${config.prefix}${ds}${padded}`;
}

/**
 * Preview the formatted number that would be generated right now for a series,
 * WITHOUT advancing the counter. Used by the settings UI live preview.
 * Not safe to use for actual ticket creation.
 */
export async function previewNextTicketNumber(
  series: TicketSeries,
  now = new Date()
): Promise<string> {
  const settings = await getSection("ticket_numbering");
  const config   = settings[series];

  const pk = buildPeriodKey(config.resetPeriod, now);

  // Peek at the current counter value without mutating it
  const row = await prisma.ticketCounter.findUnique({
    where: { series_periodKey: { series, periodKey: pk } },
    select: { lastValue: true },
  });

  const nextVal = (row?.lastValue ?? config.startAt - 1) + 1;
  const ds      = buildDateSegment(config.includeDateSegment, now);
  const padded  = String(nextVal).padStart(config.paddingLength, "0");

  return `${config.prefix}${ds}${padded}`;
}
