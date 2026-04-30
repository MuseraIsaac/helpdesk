import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { Star } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import ErrorAlert from "@/components/ErrorAlert";
import KpiCard from "@/components/reports/KpiCard";
import ChartCard from "@/components/reports/ChartCard";
import ReportLoading from "@/components/reports/ReportLoading";
import { fetchCsatTrend, fetchCsatBreakdown } from "@/lib/reports/api";
import { fmtDay, xInterval, fmtPct } from "@/lib/reports/utils";
import { cn } from "@/lib/utils";
import type { CsatPoint } from "@/lib/reports/types";

// ── Color map for CSAT star ratings (red → green) ─────────────────────────────

const STAR_COLORS = [
  "hsl(0, 84%, 60%)",    // 1 star — red
  "hsl(24, 95%, 53%)",   // 2 stars — orange
  "hsl(43, 96%, 56%)",   // 3 stars — amber
  "hsl(88, 55%, 52%)",   // 4 stars — lime-green
  "hsl(142, 71%, 45%)",  // 5 stars — green
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeOverall(points: CsatPoint[]) {
  const rated = points.filter(p => p.avgRating !== null && p.count > 0);
  const total = rated.reduce((s, p) => s + p.count, 0);
  const avg   = rated.length > 0
    ? rated.reduce((s, p) => s + p.avgRating! * p.count, 0) / total
    : null;
  return { rated, total, avg };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CsatReport() {
  const [searchParams] = useSearchParams();
  const period = searchParams.get("period") ?? "30";

  const { data: points, isLoading: loadingTrend, error } = useQuery({
    queryKey: ["reports", "csat", period],
    queryFn: () => fetchCsatTrend(period),
  });

  const { data: breakdown, isLoading: loadingBreakdown } = useQuery({
    queryKey: ["reports", "csat-breakdown", period],
    queryFn: () => fetchCsatBreakdown(period),
  });

  if (loadingTrend) return <ReportLoading kpiCount={4} chartCount={2} />;
  if (error)        return <ErrorAlert error={error as Error} fallback="Failed to load CSAT data" />;

  const all = points ?? [];
  const { rated, total, avg } = computeOverall(all);
  const coverage = all.length > 0 ? Math.round((rated.length / all.length) * 100) : 0;

  const avgValueClass =
    avg == null ? undefined :
    avg >= 4    ? "text-green-600 dark:text-green-400" :
    avg >= 3    ? "text-amber-600 dark:text-amber-400" :
    "text-destructive";

  return (
    <div className="space-y-6">
      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          title="Avg CSAT Score"
          value={avg != null ? avg.toFixed(2) : "—"}
          sub="out of 5.00"
          valueClass={avgValueClass}
          variant={avg == null ? "default" : avg >= 4 ? "success" : avg >= 3 ? "warning" : "danger"}
          icon={<Star className="h-4 w-4" />}
        />
        <KpiCard
          title="Total Ratings"
          value={total.toLocaleString()}
          sub="responses received"
        />
        <KpiCard
          title="Days with Ratings"
          value={rated.length}
          sub={`of ${all.length} days in period`}
        />
        <KpiCard
          title="Coverage"
          value={`${coverage}%`}
          sub="days with at least 1 rating"
          variant={coverage >= 60 ? "success" : coverage >= 30 ? "warning" : "danger"}
        />
      </div>

      {/* ── Rating breakdown ─────────────────────────────────────────────── */}
      <ChartCard
        title="Rating Breakdown"
        description="Distribution of ratings by star level (1 = very dissatisfied, 5 = very satisfied)."
        accentColor="bg-amber-500"
      >
        {loadingBreakdown ? (
          <div className="space-y-2 py-2">
            {[1,2,3,4,5].map(n => (
              <div key={n} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-14 shrink-0">{n} star{n !== 1 && "s"}</span>
                <div className="flex-1 h-5 bg-muted rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2.5 py-1">
            {(breakdown?.breakdown ?? [1,2,3,4,5].map(n => ({ rating: n, label: `${n} stars`, count: 0, pct: 0 }))).map((b, i) => (
              <div key={b.rating} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-14 shrink-0 tabular-nums">
                  {b.rating} star{b.rating !== 1 && "s"}
                </span>
                <div className="flex-1 h-5 bg-muted/60 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width:      `${b.pct}%`,
                      minWidth:   b.count > 0 ? "4px" : "0",
                      background: STAR_COLORS[i],
                    }}
                  />
                </div>
                <span className="text-xs font-medium tabular-nums w-20 text-right text-foreground shrink-0">
                  {b.count.toLocaleString()}
                  <span className="text-muted-foreground font-normal ml-1">({fmtPct(b.pct)})</span>
                </span>
              </div>
            ))}
            {(breakdown?.total ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground py-2 text-center">No ratings in this period</p>
            )}
          </div>
        )}
      </ChartCard>

      {/* ── Daily trend ──────────────────────────────────────────────────── */}
      <ChartCard
        title="Daily Average CSAT Score"
        description="Mean satisfaction per day (1–5 scale). Gaps indicate days with no responses."
        accentColor="bg-emerald-500"
      >
        <ChartContainer
          config={{ avgRating: { label: "Avg Rating", color: "var(--chart-2)" } }}
          className="h-56"
        >
          <LineChart data={all}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDay}
              interval={xInterval(all.length)}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              domain={[0, 5]}
              ticks={[1, 2, 3, 4, 5]}
              tickLine={false}
              axisLine={false}
              width={24}
              tick={{ fontSize: 11 }}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              type="monotone"
              dataKey="avgRating"
              stroke="hsl(142, 71%, 45%)"
              strokeWidth={2}
              dot={{ r: 3, fill: "hsl(142, 71%, 45%)", strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              connectNulls={false}
            />
          </LineChart>
        </ChartContainer>
      </ChartCard>

      {rated.length === 0 && (
        <p className="text-center text-muted-foreground text-sm py-2">
          No CSAT ratings were submitted in this period.
        </p>
      )}
    </div>
  );
}
