import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useState } from "react";
import { useNavigate } from "react-router";
import { AlertCircle, Clock, CheckCircle2, Ticket, Zap, ShieldAlert, Timer, TrendingUp, GitCompare } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import ErrorAlert from "@/components/ErrorAlert";
import KpiCard from "@/components/reports/KpiCard";
import type { KpiTrend } from "@/components/reports/KpiCard";
import ChartCard from "@/components/reports/ChartCard";
import ReportLoading from "@/components/reports/ReportLoading";
import { fetchOverview, fetchAging, fetchTopOpenTickets, fetchBreakdowns } from "@/lib/reports/api";
import { fmtDuration, fmtPct, complianceClass, periodToRange, rangeQS } from "@/lib/reports/utils";
import type { ReportOverview } from "@/lib/reports/types";
import { cn } from "@/lib/utils";

// ── Color maps ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  open:        "hsl(217, 91%, 60%)",   // blue
  in_progress: "hsl(262, 83%, 65%)",   // violet
  resolved:    "hsl(142, 71%, 45%)",   // green
  closed:      "hsl(215, 16%, 60%)",   // gray
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "hsl(0, 84%, 60%)",       // red
  high:   "hsl(24, 95%, 53%)",      // orange
  medium: "hsl(43, 96%, 56%)",      // amber
  low:    "hsl(217, 91%, 60%)",     // blue
  unset:  "hsl(215, 16%, 70%)",     // gray
};

const PRIORITY_TEXT: Record<string, string> = {
  urgent: "text-destructive",
  high:   "text-orange-600 dark:text-orange-400",
  medium: "text-amber-600 dark:text-amber-400",
  low:    "text-blue-600 dark:text-blue-400",
};

// ── Donut chart helper ────────────────────────────────────────────────────────

function DonutChart({
  data, colorMap, total, onSliceClick,
}: {
  data: { key: string; label: string; total: number }[];
  colorMap: Record<string, string>;
  total: number;
  onSliceClick?: (key: string) => void;
}) {
  const RADIAN = Math.PI / 180;
  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: {
    cx: number; cy: number; midAngle: number;
    innerRadius: number; outerRadius: number; percent: number;
  }) => {
    if (percent < 0.05) return null;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
        fontSize={11} fontWeight="600">
        {`${Math.round(percent * 100)}%`}
      </text>
    );
  };

  return (
    <div className="flex gap-4 items-center">
      <ResponsiveContainer width={140} height={140}>
        <PieChart>
          <Pie
            data={data}
            dataKey="total"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={42}
            outerRadius={65}
            paddingAngle={2}
            labelLine={false}
            label={renderLabel}
            onClick={onSliceClick ? (d) => onSliceClick(d.key as string) : undefined}
            style={onSliceClick ? { cursor: "pointer" } : undefined}
          >
            {data.map(entry => (
              <Cell
                key={entry.key}
                fill={colorMap[entry.key] ?? "hsl(215, 16%, 70%)"}
                stroke="transparent"
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(val: number, name: string) => [
              `${val.toLocaleString()} (${total > 0 ? Math.round((val / total) * 100) : 0}%)`,
              name,
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
      <ul className="flex-1 space-y-1.5 min-w-0">
        {data.map(d => (
          <li key={d.key} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ background: colorMap[d.key] ?? "hsl(215, 16%, 70%)" }}
            />
            <span className="capitalize text-muted-foreground truncate">{d.label}</span>
            <span className="ml-auto font-medium tabular-nums text-foreground">{d.total.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

// ── Comparison delta helper ───────────────────────────────────────────────────

function makeTrend(
  current: number | null,
  previous: number | null,
  upIsGood = true,
): KpiTrend | undefined {
  if (current == null || previous == null || previous === 0) return undefined;
  const delta = current - previous;
  const pct   = Math.round(Math.abs((delta / previous) * 100));
  const direction: KpiTrend["direction"] =
    delta > 0 ? "up" : delta < 0 ? "down" : "neutral";
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  return { direction, label: `${sign}${pct}%`, upIsGood };
}

function prevQS(period: string, customFrom?: string, customTo?: string): string {
  const range = periodToRange(period, customFrom, customTo);
  const from  = new Date(range.from);
  const to    = new Date(range.to);
  const days  = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const prevTo   = new Date(from); prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - (days - 1));
  return rangeQS({ from: prevTo.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) })
    .replace(
      prevTo.toISOString().slice(0, 10),
      `${prevFrom.toISOString().slice(0, 10)}&to=${prevTo.toISOString().slice(0, 10)}`,
    )
    .replace("from=", "from=")
    || `from=${prevFrom.toISOString().slice(0, 10)}&to=${prevTo.toISOString().slice(0, 10)}`;
}

// Simpler reimplementation
function buildPrevQS(period: string, customFrom?: string, customTo?: string): string {
  const range   = periodToRange(period, customFrom, customTo);
  const fromMs  = new Date(range.from).getTime();
  const toMs    = new Date(range.to).getTime();
  const spanMs  = toMs - fromMs + 86_400_000;
  const prevTo  = new Date(fromMs - 86_400_000).toISOString().slice(0, 10);
  const prevFrom= new Date(fromMs - spanMs).toISOString().slice(0, 10);
  return `from=${prevFrom}&to=${prevTo}`;
}

export default function OverviewReport() {
  const [searchParams] = useSearchParams();
  const period     = searchParams.get("period")  ?? "30";
  const customFrom = searchParams.get("from")    ?? undefined;
  const customTo   = searchParams.get("to")      ?? undefined;
  const rangeKey   = period === "custom" ? `${customFrom}-${customTo}` : period;
  const qs         = rangeQS(periodToRange(period, customFrom, customTo));

  const [compare, setCompare] = useState(false);
  const navigate = useNavigate();

  const { data: overview, isLoading: loadingOv, error: ovErr } = useQuery({
    queryKey: ["reports", "overview", rangeKey],
    queryFn: () => fetchOverview(qs),
  });

  const { data: aging, isLoading: loadingAging } = useQuery({
    queryKey: ["reports", "aging"],
    queryFn: fetchAging,
    staleTime: 60_000,
  });

  const { data: topTickets, isLoading: loadingTop } = useQuery({
    queryKey: ["reports", "top-open-tickets"],
    queryFn: fetchTopOpenTickets,
    staleTime: 60_000,
  });

  const { data: breakdowns, isLoading: loadingBreakdowns } = useQuery({
    queryKey: ["reports", "breakdowns", rangeKey],
    queryFn: () => fetchBreakdowns(qs),
    staleTime: 60_000,
  });

  const prevQs = buildPrevQS(period, customFrom, customTo);
  const { data: prevOverview } = useQuery<ReportOverview>({
    queryKey: ["reports", "overview", "prev", rangeKey],
    queryFn: () => fetchOverview(prevQs),
    enabled: compare,
    staleTime: 120_000,
  });

  if (loadingOv) return <ReportLoading kpiCount={8} chartCount={3} />;
  if (ovErr) return <ErrorAlert error={ovErr as Error} fallback="Failed to load overview data" />;
  if (!overview) return null;

  const prev = compare ? prevOverview : undefined;

  // ── Prepare distribution data ────────────────────────────────────────────

  const priorityData = (breakdowns?.byPriority ?? []).map(p => ({
    key:   p.priority ?? "unset",
    label: p.label,
    total: p.total,
  }));
  const priorityTotal = priorityData.reduce((s, d) => s + d.total, 0);

  const statusData = [
    { key: "open",        label: "Open",        total: overview.openTickets },
    { key: "resolved",    label: "Resolved",    total: overview.resolvedTickets },
    { key: "closed",      label: "Closed",      total: overview.closedTickets },
  ].filter(d => d.total > 0);
  const statusTotal = statusData.reduce((s, d) => s + d.total, 0);

  return (
    <div className="space-y-6">
      {/* ── Compare toggle ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 justify-end">
        <GitCompare className="h-3.5 w-3.5 text-muted-foreground" />
        <Label htmlFor="compare-toggle" className="text-xs text-muted-foreground cursor-pointer">
          Compare to previous period
        </Label>
        <Switch
          id="compare-toggle"
          checked={compare}
          onCheckedChange={setCompare}
          className="scale-75"
        />
      </div>

      {/* ── KPI row 1: core volume ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          title="Total Tickets"
          value={overview.totalTickets.toLocaleString()}
          sub={`in last ${period} days`}
          trend={makeTrend(overview.totalTickets, prev?.totalTickets ?? null)}
          icon={<Ticket className="h-4 w-4" />}
        />
        <KpiCard
          title="Open"
          value={overview.openTickets.toLocaleString()}
          variant={overview.openTickets > 50 ? "warning" : "default"}
          trend={makeTrend(overview.openTickets, prev?.openTickets ?? null, false)}
          icon={<AlertCircle className="h-4 w-4" />}
        />
        <KpiCard
          title="Resolved"
          value={overview.resolvedTickets.toLocaleString()}
          variant="success"
          trend={makeTrend(overview.resolvedTickets, prev?.resolvedTickets ?? null)}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <KpiCard
          title="AI Auto-resolved"
          value={`${overview.aiResolutionRate}%`}
          sub={`${overview.resolvedByAI.toLocaleString()} tickets`}
          variant="info"
          trend={makeTrend(overview.aiResolutionRate, prev?.aiResolutionRate ?? null)}
          icon={<Zap className="h-4 w-4" />}
        />
      </div>

      {/* ── KPI row 2: performance & SLA ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          title="SLA Compliance"
          value={fmtPct(overview.slaComplianceRate)}
          sub={`${overview.breachedTickets} breached`}
          variant={
            overview.slaComplianceRate == null ? "default" :
            overview.slaComplianceRate >= 90   ? "success" :
            overview.slaComplianceRate >= 70   ? "warning" : "danger"
          }
          valueClass={complianceClass(overview.slaComplianceRate)}
          trend={makeTrend(overview.slaComplianceRate, prev?.slaComplianceRate ?? null)}
          icon={<ShieldAlert className="h-4 w-4" />}
        />
        <KpiCard
          title="Avg First Response"
          value={fmtDuration(overview.avgFirstResponseSeconds)}
          sub="to first agent reply"
          trend={makeTrend(
            overview.avgFirstResponseSeconds,
            prev?.avgFirstResponseSeconds ?? null,
            false, // lower is better
          )}
          icon={<Timer className="h-4 w-4" />}
        />
        <KpiCard
          title="Avg Resolution Time"
          value={fmtDuration(overview.avgResolutionSeconds)}
          sub="creation to resolution"
          trend={makeTrend(
            overview.avgResolutionSeconds,
            prev?.avgResolutionSeconds ?? null,
            false, // lower is better
          )}
          icon={<Clock className="h-4 w-4" />}
        />
        <KpiCard
          title="Escalated"
          value={overview.escalatedTickets.toLocaleString()}
          sub={`${overview.reopenedTickets} reopened`}
          variant={overview.escalatedTickets > 10 ? "warning" : "default"}
          trend={makeTrend(overview.escalatedTickets, prev?.escalatedTickets ?? null, false)}
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      {/* ── Distribution donuts ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard
          title="Ticket Priority Distribution"
          description="Breakdown by priority for the selected period."
          accentColor="bg-orange-500"
        >
          {loadingBreakdowns ? (
            <Skeleton className="h-36" />
          ) : priorityData.length > 0 ? (
            <DonutChart
              data={priorityData}
              colorMap={PRIORITY_COLORS}
              total={priorityTotal}
              onSliceClick={key => navigate(`/tickets?priority=${key}`)}
            />
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">No data</p>
          )}
        </ChartCard>

        <ChartCard
          title="Ticket Status Distribution"
          description="Open vs. resolved vs. closed in the period."
          accentColor="bg-blue-500"
        >
          {statusData.length > 0 ? (
            <DonutChart data={statusData} colorMap={STATUS_COLORS} total={statusTotal} />
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">No data</p>
          )}
        </ChartCard>
      </div>

      {/* ── Open ticket aging ────────────────────────────────────────────── */}
      <ChartCard
        title="Open Ticket Age"
        description="Currently-open tickets bucketed by how long they have been waiting (live)."
        accentColor="bg-amber-500"
      >
        {loadingAging ? (
          <Skeleton className="h-44" />
        ) : (
          <ChartContainer
            config={{ count: { label: "Open tickets", color: "hsl(var(--chart-1))" } }}
            className="h-44"
          >
            <BarChart data={aging ?? []} barSize={52}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="bucket" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={32} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" radius={[5, 5, 0, 0]} fill="hsl(43, 96%, 56%)" />
            </BarChart>
          </ChartContainer>
        )}
      </ChartCard>

      {/* ── Longest-waiting tickets ──────────────────────────────────────── */}
      <ChartCard
        title="Longest-Waiting Open Tickets"
        description="The 10 oldest open tickets by creation date — live snapshot."
        contentClassName="p-0"
        accentColor="bg-rose-500"
      >
        {loadingTop ? (
          <div className="p-6"><Skeleton className="h-52" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead className="text-right">Days Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(topTickets ?? []).map(t => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">{t.ticketNumber}</TableCell>
                  <TableCell className="max-w-xs truncate text-sm">{t.subject}</TableCell>
                  <TableCell>
                    {t.priority ? (
                      <span className={cn("text-xs font-medium capitalize", PRIORITY_TEXT[t.priority] ?? "")}>
                        {t.priority}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{t.assigneeName}</TableCell>
                  <TableCell className="text-right">
                    <span className={cn("text-sm font-medium tabular-nums", t.slaBreached && "text-destructive")}>
                      {t.daysOpen}
                      {t.slaBreached && <span className="ml-1 text-xs">⚠</span>}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {(topTickets ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-10 text-sm">
                    No open tickets
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </ChartCard>
    </div>
  );
}
