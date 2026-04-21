import type { DateRangeParams, PeriodOption } from "./types";

// ── Score formatter (CSAT 1–5) ────────────────────────────────────────────────

export function fmtScore(val: number | null | undefined): string {
  if (val == null) return "—";
  return `${val.toFixed(2)} ★`;
}

// ── Duration formatter ────────────────────────────────────────────────────────

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

// ── Date formatter (YYYY-MM-DD → "Apr 1") ────────────────────────────────────

export function fmtDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Use local-time constructor to avoid UTC-midnight off-by-one on negative TZ offsets
  return new Date(y, m - 1, d).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}

// ── Percentage formatter ──────────────────────────────────────────────────────

export function fmtPct(val: number | null | undefined): string {
  return val == null ? "—" : `${val}%`;
}

// ── Number formatter ──────────────────────────────────────────────────────────

export function fmtNumber(val: number | null | undefined): string {
  return val == null ? "—" : val.toLocaleString();
}

// ── Period → date range ───────────────────────────────────────────────────────

/**
 * Convert a PeriodOption (or custom from/to pair) to {from, to} YYYY-MM-DD.
 * Pass customFrom/customTo when period === "custom".
 */
export function periodToRange(
  period: PeriodOption | string,
  customFrom?: string,
  customTo?: string,
): DateRangeParams {
  if (period === "custom" && customFrom && customTo) {
    return { from: customFrom, to: customTo };
  }
  if (period === "custom" && customFrom) {
    return { from: customFrom, to: new Date().toISOString().slice(0, 10) };
  }
  // "custom" with no dates selected yet — fall back to last 30 days so that
  // _periodToRange never receives the literal string "custom", which produces
  // NaN dates and throws a RangeError during render.
  if (period === "custom") {
    return _periodToRange("30");
  }
  return _periodToRange(period);
}

function _periodToRange(period: PeriodOption | string): DateRangeParams {
  const now = new Date();

  if (period === "this_month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      from: from.toISOString().slice(0, 10),
      to:   now.toISOString().slice(0, 10),
    };
  }
  if (period === "last_month") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to   = new Date(now.getFullYear(), now.getMonth(), 0);
    return {
      from: from.toISOString().slice(0, 10),
      to:   to.toISOString().slice(0, 10),
    };
  }

  const days = Number(period);
  const to   = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);
  return {
    from: from.toISOString().slice(0, 10),
    to:   to.toISOString().slice(0, 10),
  };
}

/** Build ?period=X or ?period=custom&from=X&to=Y query string for API calls. */
export function periodQS(period: string, customFrom?: string, customTo?: string): string {
  if (period === "custom" && customFrom && customTo) {
    return `from=${customFrom}&to=${customTo}`;
  }
  return `period=${period}`;
}

/** Serialize DateRangeParams as a query string fragment ("from=X&to=Y"). */
export function rangeQS(range: DateRangeParams): string {
  return `from=${range.from}&to=${range.to}`;
}

// ── Chart helpers ─────────────────────────────────────────────────────────────

/**
 * Returns a Recharts XAxis `interval` that keeps the tick count at ~7
 * regardless of how many data points are in the series.
 */
export function xInterval(len: number): number {
  return Math.max(0, Math.ceil(len / 7) - 1);
}

// ── Compliance colour utility ─────────────────────────────────────────────────

/**
 * Returns a Tailwind text colour class appropriate for a compliance percentage:
 *   ≥ 90 % → green
 *   ≥ 70 % → amber (warning)
 *   < 70 % → destructive (red)
 *    null  → muted
 */
export function complianceClass(pct: number | null | undefined): string {
  if (pct == null) return "text-muted-foreground";
  if (pct >= 90) return "text-green-600 dark:text-green-400";
  if (pct >= 70) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}
