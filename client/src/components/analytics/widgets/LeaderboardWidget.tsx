/**
 * LeaderboardWidget — ranked table with medal badges for top 3.
 * Compact, enterprise-dense. Supports drill-down via onRowClick.
 */
import { cn } from "@/lib/utils";
import type { LeaderboardResult } from "@/lib/reports/analytics-types";

function fmtCell(value: string | number | null, unit?: string): string {
  if (value == null) return "—";
  if (unit === "percent") return `${value}%`;
  if (unit === "score")   return Number(value).toFixed(2);
  if (unit === "seconds") {
    const s = Number(value);
    if (s < 60)    return `${s}s`;
    if (s < 3600)  return `${Math.round(s / 60)}m`;
    if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
    return `${(s / 86400).toFixed(1)}d`;
  }
  return typeof value === "number" ? value.toLocaleString() : String(value);
}

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

interface Props {
  result: LeaderboardResult;
  onRowClick?: (key: string) => void;
}

export function LeaderboardWidget({ result, onRowClick }: Props) {
  const { entries, columnDefs } = result;
  if (entries.length === 0) return null;

  return (
    <div className="w-full overflow-auto">
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="border-b border-border/60">
            <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground w-6 shrink-0">#</th>
            <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground">Name</th>
            {columnDefs.map(col => (
              <th key={col.key} className="text-right py-1.5 px-2 font-semibold text-muted-foreground whitespace-nowrap">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map(entry => (
            <tr
              key={entry.key}
              className={cn(
                "border-b border-border/30 last:border-0 transition-colors",
                onRowClick && "cursor-pointer hover:bg-muted/40",
              )}
              onClick={() => onRowClick?.(entry.key)}
            >
              <td className="py-1.5 px-2 text-muted-foreground tabular-nums">
                {MEDAL[entry.rank] ?? entry.rank}
              </td>
              <td className="py-1.5 px-2 font-medium text-foreground max-w-[160px] truncate">
                {entry.label}
              </td>
              {columnDefs.map(col => (
                <td key={col.key} className="py-1.5 px-2 text-right tabular-nums text-foreground">
                  {fmtCell(entry.columns[col.key] ?? null, col.unit)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
