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

// Per-unit tone family — picks up a coloured backdrop and value tint so the
// stat reads as a meaningful indicator instead of a floating number.
function unitTone(unit?: string) {
  switch (unit) {
    case "percent":
      return {
        wash: "from-emerald-500/[0.06] via-transparent to-transparent",
        text: "text-emerald-700 dark:text-emerald-300",
        glow: "bg-emerald-500/15",
      };
    case "seconds":
    case "hours":
    case "days":
      return {
        wash: "from-blue-500/[0.06] via-transparent to-transparent",
        text: "text-blue-700 dark:text-blue-300",
        glow: "bg-blue-500/15",
      };
    case "score":
      return {
        wash: "from-amber-500/[0.06] via-transparent to-transparent",
        text: "text-amber-700 dark:text-amber-300",
        glow: "bg-amber-500/15",
      };
    default:
      return {
        wash: "from-violet-500/[0.06] via-transparent to-transparent",
        text: "text-foreground",
        glow: "bg-violet-500/15",
      };
  }
}

// ── Stat (simple) ─────────────────────────────────────────────────────────────

export function StatWidget({ result }: { result: StatResult }) {
  const tone = unitTone(result.unit);
  return (
    <div className="relative flex flex-col justify-center h-full px-1 py-1 select-none overflow-hidden">
      {/* Subtle backdrop wash + ambient glow orb in the corner */}
      <div className={cn("absolute inset-0 bg-gradient-to-br pointer-events-none", tone.wash)} />
      <div className={cn("absolute -top-6 -right-6 h-20 w-20 rounded-full blur-2xl pointer-events-none", tone.glow)} />

      <p className={cn("relative text-[2.4rem] font-bold tabular-nums leading-none tracking-tight", tone.text)}>
        {formatValue(result.value, result.unit)}
      </p>
      {result.sub && (
        <p className="relative text-[11px] text-muted-foreground mt-2 leading-relaxed">{result.sub}</p>
      )}
    </div>
  );
}

// ── Stat change (with period comparison) ──────────────────────────────────────

export function StatChangeWidget({ result }: { result: StatChangeResult }) {
  const dir = result.changeDirection;
  const tone = unitTone(result.unit);

  // Delta pill — full coloured tinted background, not just text+icon
  const deltaPill =
    dir === "up"   ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" :
    dir === "down" ? "bg-red-500/15     text-red-700     dark:text-red-300     border-red-500/30"     :
                     "bg-muted/60       text-muted-foreground                   border-border/50";

  const DeltaIcon =
    dir === "up"   ? TrendingUp :
    dir === "down" ? TrendingDown :
    Minus;

  return (
    <div className="relative flex flex-col justify-center h-full px-1 py-1 select-none overflow-hidden">
      <div className={cn("absolute inset-0 bg-gradient-to-br pointer-events-none", tone.wash)} />
      <div className={cn("absolute -top-6 -right-6 h-20 w-20 rounded-full blur-2xl pointer-events-none", tone.glow)} />

      <p className={cn("relative text-[2.4rem] font-bold tabular-nums leading-none tracking-tight", tone.text)}>
        {formatValue(result.value, result.unit)}
      </p>

      {result.changePercent != null && (
        <div className="relative flex items-center gap-1.5 mt-2">
          <span className={cn(
            "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums",
            deltaPill,
          )}>
            <DeltaIcon className="h-3 w-3 shrink-0" />
            {result.changePercent > 0 ? "+" : ""}{result.changePercent}
            {result.unit === "percent" ? " pp" : "%"}
          </span>
          <span className="text-[10px] text-muted-foreground font-normal">vs prev.</span>
        </div>
      )}

      {result.previousValue != null && (
        <p className="relative text-[10px] text-muted-foreground mt-1">
          Prev: <span className="tabular-nums">{formatValue(result.previousValue, result.unit)}</span>
        </p>
      )}

      {result.sub && (
        <p className="relative text-[11px] text-muted-foreground mt-1 leading-relaxed">{result.sub}</p>
      )}
    </div>
  );
}
