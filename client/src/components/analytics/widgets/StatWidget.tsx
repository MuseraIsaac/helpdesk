/**
 * StatWidget — renders stat and stat_change result types.
 *
 * stat:        Large number, optional sub-text.
 * stat_change: Number with previous-period delta badge (▲▼ %).
 */
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatResult, StatChangeResult } from "@/lib/reports/analytics-types";

// ── Formatters ────────────────────────────────────────────────────────────────

function formatValue(value: number | null, unit?: string): string {
  if (value == null) return "—";
  if (unit === "percent") return `${value}%`;
  if (unit === "score")   return value.toFixed(2);
  if (unit === "seconds") return fmtSeconds(value);
  if (unit === "hours")   return `${value.toFixed(1)} h`;
  if (unit === "days")    return `${value.toFixed(1)} d`;
  return value.toLocaleString();
}

function fmtSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86400).toFixed(1)}d`;
}

// ── Stat (simple) ─────────────────────────────────────────────────────────────

export function StatWidget({ result }: { result: StatResult }) {
  return (
    <div className="flex flex-col justify-center h-full px-1 py-1 select-none">
      <p className="text-[2.4rem] font-bold tabular-nums leading-none tracking-tight text-foreground">
        {formatValue(result.value, result.unit)}
      </p>
      {result.sub && (
        <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">{result.sub}</p>
      )}
    </div>
  );
}

// ── Stat change (with period comparison) ──────────────────────────────────────

export function StatChangeWidget({ result }: { result: StatChangeResult }) {
  const dir = result.changeDirection;

  const deltaColor =
    dir === "up"   ? "text-emerald-500 dark:text-emerald-400" :
    dir === "down" ? "text-destructive" :
    "text-muted-foreground";

  const DeltaIcon =
    dir === "up"   ? TrendingUp :
    dir === "down" ? TrendingDown :
    Minus;

  return (
    <div className="flex flex-col justify-center h-full px-1 py-1 select-none">
      <p className="text-[2.4rem] font-bold tabular-nums leading-none tracking-tight text-foreground">
        {formatValue(result.value, result.unit)}
      </p>

      {result.changePercent != null && (
        <div className={cn("flex items-center gap-1 mt-2", deltaColor)}>
          <DeltaIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs font-semibold tabular-nums">
            {result.changePercent > 0 ? "+" : ""}{result.changePercent}
            {result.unit === "percent" ? " pp" : "%"}
          </span>
          <span className="text-[10px] text-muted-foreground font-normal">vs prev. period</span>
        </div>
      )}

      {result.previousValue != null && (
        <p className="text-[10px] text-muted-foreground mt-1">
          Prev: {formatValue(result.previousValue, result.unit)}
        </p>
      )}

      {result.sub && (
        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{result.sub}</p>
      )}
    </div>
  );
}
