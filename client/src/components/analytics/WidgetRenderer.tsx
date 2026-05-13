/**
 * WidgetRenderer — dispatches a QueryResult to the correct chart component.
 * Also handles empty state and gauge (rendered as a stat with progress ring).
 */
import { lazy, Suspense } from "react";
import type { QueryResult } from "@/lib/reports/analytics-types";
import { StatWidget, StatChangeWidget } from "./widgets/StatWidget";
import { LeaderboardWidget } from "./widgets/LeaderboardWidget";
import { DataTableWidget } from "./widgets/DataTableWidget";
import { BarChart2 } from "lucide-react";

// Recharts-backed widgets are heavy (~150 KB). Lazy-load them so the
// initial bundle stays slim — they only mount inside dashboards / reports
// pages anyway, and most page loads don't include them on the hot path.
const TimeSeriesWidget = lazy(() =>
  import("./widgets/TimeSeriesWidget").then(m => ({ default: m.TimeSeriesWidget })),
);
const BarWidget = lazy(() =>
  import("./widgets/BarWidget").then(m => ({ default: m.BarWidget })),
);
const DonutWidget = lazy(() =>
  import("./widgets/DonutWidget").then(m => ({ default: m.DonutWidget })),
);

function ChartFallback({ height }: { height?: number }) {
  return (
    <div
      className="rounded-md bg-muted/30 animate-pulse w-full"
      style={{ minHeight: height ?? 200 }}
      aria-busy="true"
      aria-label="Loading chart"
    />
  );
}

interface Props {
  result: QueryResult;
  visualization: string;
  height?: number;
  onDrillDown?: (context: { type: string; key: string }) => void;
}

export function WidgetRenderer({ result, visualization, height = 200, onDrillDown }: Props) {
  switch (result.type) {
    case "stat":
      return <StatWidget result={result} />;

    case "stat_change":
      return <StatChangeWidget result={result} />;

    case "time_series":
      return (
        <Suspense fallback={<ChartFallback height={height} />}>
          <TimeSeriesWidget
            result={result}
            visualization={visualization as "line" | "area"}
            height={height}
          />
        </Suspense>
      );

    case "grouped_count":
      if (visualization === "donut") {
        return (
          <Suspense fallback={<ChartFallback height={height} />}>
            <DonutWidget result={result} height={height} />
          </Suspense>
        );
      }
      return (
        <Suspense fallback={<ChartFallback height={height} />}>
          <BarWidget
            result={result}
            visualization={visualization as "bar" | "bar_horizontal" | "stacked_bar"}
            height={height}
          />
        </Suspense>
      );

    case "distribution":
      return (
        <Suspense fallback={<ChartFallback height={height} />}>
          <BarWidget
            result={result}
            visualization={visualization === "histogram" ? "histogram" : "bar"}
            height={height}
          />
        </Suspense>
      );

    case "leaderboard":
      return (
        <LeaderboardWidget
          result={result}
          onRowClick={onDrillDown ? k => onDrillDown({ type: "leaderboard", key: k }) : undefined}
        />
      );

    case "table":
      return (
        <DataTableWidget
          result={result}
          onRowClick={
            onDrillDown
              ? row => onDrillDown({ type: "table", key: String(row.id ?? row.ticketNumber ?? "") })
              : undefined
          }
        />
      );

    default:
      return <EmptyWidget message="Unsupported visualization" />;
  }
}

export function EmptyWidget({ message = "No data for this period" }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 text-center py-6">
      <BarChart2 className="h-7 w-7 text-muted-foreground/30" strokeWidth={1.5} />
      <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[160px]">{message}</p>
    </div>
  );
}
