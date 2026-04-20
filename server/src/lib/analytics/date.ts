/**
 * server/src/lib/analytics/date.ts
 *
 * Date-range resolution for the Analytics Engine.
 *
 * All preset logic runs at query time, so the "last 30 days"
 * always means the 30 days ending *now*, not when the metric was defined.
 */
import type { DateRange } from "core/schemas/analytics.ts";
import type { ResolvedDateRange } from "./types";

// ── Resolution ────────────────────────────────────────────────────────────────

/** Resolve a DateRange input into concrete UTC-midnight Date objects. */
export function resolveDateRange(input: DateRange): ResolvedDateRange {
  const now = new Date();

  if (input.preset === "custom") {
    const since = startOfDay(parseISODate(input.from));
    const until = endOfDay(parseISODate(input.to));
    return { since, until, preset: "custom" };
  }

  return resolvePreset(input.preset, now);
}

/**
 * Given a current date range, return the immediately-preceding period of the
 * same length — used for period-over-period comparisons.
 *
 * Example: last_30_days 2026-03-22→2026-04-20
 *          comparison   2026-02-20→2026-03-21  (same 30-day span, 1 day prior)
 */
export function resolveComparisonRange(current: ResolvedDateRange): ResolvedDateRange {
  const spanMs = current.until.getTime() - current.since.getTime();
  const until  = new Date(current.since.getTime() - 1); // 1 ms before current start
  const since  = new Date(until.getTime() - spanMs);
  return { since, until };
}

// ── Preset table ──────────────────────────────────────────────────────────────

function resolvePreset(preset: string, now: Date): ResolvedDateRange {
  switch (preset) {
    case "today":
      return { since: startOfDay(now), until: endOfDay(now), preset };

    case "yesterday": {
      const d = addDays(now, -1);
      return { since: startOfDay(d), until: endOfDay(d), preset };
    }

    case "last_7_days":
      return {
        since: startOfDay(addDays(now, -6)),
        until: endOfDay(now),
        preset,
      };

    case "last_30_days":
      return {
        since: startOfDay(addDays(now, -29)),
        until: endOfDay(now),
        preset,
      };

    case "last_90_days":
      return {
        since: startOfDay(addDays(now, -89)),
        until: endOfDay(now),
        preset,
      };

    case "this_week": {
      const mon = startOfWeek(now);
      return { since: startOfDay(mon), until: endOfDay(now), preset };
    }

    case "last_week": {
      const mon = startOfWeek(addDays(now, -7));
      const sun = addDays(mon, 6);
      return { since: startOfDay(mon), until: endOfDay(sun), preset };
    }

    case "this_month": {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { since: startOfDay(first), until: endOfDay(now), preset };
    }

    case "last_month": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last  = new Date(now.getFullYear(), now.getMonth(), 0);
      return { since: startOfDay(first), until: endOfDay(last), preset };
    }

    case "this_quarter": {
      const q     = Math.floor(now.getMonth() / 3);
      const first = new Date(now.getFullYear(), q * 3, 1);
      return { since: startOfDay(first), until: endOfDay(now), preset };
    }

    case "last_quarter": {
      const q     = Math.floor(now.getMonth() / 3);
      const first = new Date(now.getFullYear(), (q - 1) * 3, 1);
      const last  = new Date(now.getFullYear(), q * 3, 0);
      return { since: startOfDay(first), until: endOfDay(last), preset };
    }

    case "this_year": {
      const first = new Date(now.getFullYear(), 0, 1);
      return { since: startOfDay(first), until: endOfDay(now), preset };
    }

    case "last_year": {
      const first = new Date(now.getFullYear() - 1, 0, 1);
      const last  = new Date(now.getFullYear() - 1, 11, 31);
      return { since: startOfDay(first), until: endOfDay(last), preset };
    }

    default:
      // Fallback — last 30 days
      return {
        since: startOfDay(addDays(now, -29)),
        until: endOfDay(now),
        preset: "last_30_days",
      };
  }
}

// ── Date fill helper (for time-series gap-filling) ────────────────────────────

/**
 * Generate an array of YYYY-MM-DD strings covering [since, until] inclusive.
 * Used by compute functions to fill zero-value days in time series.
 */
export function fillDateSeries(since: Date, until: Date): string[] {
  const dates: string[] = [];
  const cursor = new Date(since);
  while (cursor <= until) {
    dates.push(toISODate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/**
 * Fill a time-series lookup map with zero-value days.
 */
export function fillSeriesGaps<T>(
  since: Date,
  until: Date,
  lookup: Map<string, T>,
  empty: T,
): Array<{ date: string; value: T }> {
  return fillDateSeries(since, until).map(date => ({
    date,
    value: lookup.get(date) ?? empty,
  }));
}

// ── Pure date helpers ─────────────────────────────────────────────────────────

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseISODate(s: string): Date {
  const parts = s.split("-").map(Number);
  return new Date(parts[0]!, (parts[1] ?? 1) - 1, parts[2] ?? 1);
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Monday of the ISO week containing d. */
function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day);
  return addDays(d, diff);
}
