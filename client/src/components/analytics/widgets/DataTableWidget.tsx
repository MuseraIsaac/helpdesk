/**
 * DataTableWidget — tabular result with sortable columns.
 * Uses compact 11px type for density.
 */
import { useState } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TableResult, TableRow } from "@/lib/reports/analytics-types";

function fmtCell(value: string | number | boolean | null): string {
  if (value == null)  return "—";
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

interface Props {
  result: TableResult;
  onRowClick?: (row: TableRow) => void;
}

export function DataTableWidget({ result, onRowClick }: Props) {
  const { rows, columnDefs } = result;
  const [sortKey, setSortKey]   = useState<string | null>(null);
  const [sortDir, setSortDir]   = useState<"asc" | "desc">("asc");

  if (rows.length === 0) return null;

  function handleSort(key: string) {
    if (!columnDefs.find(c => c.key === key)?.sortable) return;
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = sortKey
    ? [...rows].sort((a, b) => {
        const av = a[sortKey]; const bv = b[sortKey];
        const cmp =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av ?? "").localeCompare(String(bv ?? ""));
        return sortDir === "asc" ? cmp : -cmp;
      })
    : rows;

  return (
    <div className="w-full overflow-auto">
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="border-b border-border/60">
            {columnDefs.map(col => (
              <th
                key={col.key}
                className={cn(
                  "py-1.5 px-2 font-semibold text-muted-foreground text-left whitespace-nowrap select-none",
                  col.sortable && "cursor-pointer hover:text-foreground",
                )}
                onClick={() => handleSort(col.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {col.sortable && (
                    sortKey === col.key
                      ? sortDir === "asc"
                        ? <ArrowUp className="h-3 w-3 shrink-0" />
                        : <ArrowDown className="h-3 w-3 shrink-0" />
                      : <ArrowUpDown className="h-3 w-3 shrink-0 opacity-40" />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={i}
              className={cn(
                "border-b border-border/30 last:border-0 transition-colors",
                onRowClick && "cursor-pointer hover:bg-muted/40",
              )}
              onClick={() => onRowClick?.(row)}
            >
              {columnDefs.map(col => (
                <td key={col.key} className="py-1.5 px-2 text-foreground tabular-nums max-w-[200px] truncate">
                  {fmtCell(row[col.key] ?? null)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
