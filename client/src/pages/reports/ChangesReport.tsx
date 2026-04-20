import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from "@/components/ui/chart";
import { GitBranch, AlertOctagon, CheckCircle2, Timer } from "lucide-react";
import ErrorAlert from "@/components/ErrorAlert";
import KpiCard from "@/components/reports/KpiCard";
import ChartCard from "@/components/reports/ChartCard";
import ReportLoading from "@/components/reports/ReportLoading";
import { fetchChangeReport } from "@/lib/reports/api";
import { fmtDuration, fmtPct, fmtDay, xInterval, complianceClass } from "@/lib/reports/utils";

const STATE_LABELS: Record<string, string> = {
  draft:      "Draft",
  review:     "Review",
  approved:   "Approved",
  scheduled:  "Scheduled",
  implement:  "Implementing",
  review_post:"Post-Review",
  closed:     "Closed",
  failed:     "Failed",
};

const RISK_COLORS: Record<string, string> = {
  low:      "hsl(142, 71%, 45%)",
  moderate: "hsl(43, 96%, 56%)",
  high:     "hsl(24, 95%, 53%)",
  critical: "hsl(0, 84%, 60%)",
  unset:    "hsl(215, 16%, 70%)",
};

const TYPE_LABELS: Record<string, string> = {
  standard:   "Standard",
  normal:     "Normal",
  emergency:  "Emergency",
  pre_approved:"Pre-Approved",
  unset:      "Unset",
};

export default function ChangesReport() {
  const [searchParams] = useSearchParams();
  const period = searchParams.get("period") ?? "30";

  const { data, isLoading, error } = useQuery({
    queryKey: ["reports", "changes", period],
    queryFn: () => fetchChangeReport(period),
  });

  if (isLoading) return <ReportLoading kpiCount={4} chartCount={3} />;
  if (error)     return <ErrorAlert error={error as Error} fallback="Failed to load change data" />;
  if (!data)     return null;

  return (
    <div className="space-y-6">
      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          title="Total Changes"
          value={data.total.toLocaleString()}
          sub={`in last ${period} days`}
          icon={<GitBranch className="h-4 w-4" />}
        />
        <KpiCard
          title="Success Rate"
          value={fmtPct(data.successRate)}
          sub={`${data.failed} failed`}
          variant={
            data.successRate == null ? "default" :
            data.successRate >= 95   ? "success" :
            data.successRate >= 80   ? "warning" : "danger"
          }
          valueClass={complianceClass(data.successRate)}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <KpiCard
          title="Emergency Changes"
          value={data.emergency.toLocaleString()}
          sub="expedited / unplanned"
          variant={data.emergency > 5 ? "warning" : "default"}
          icon={<AlertOctagon className="h-4 w-4" />}
        />
        <KpiCard
          title="Avg Approval Time"
          value={fmtDuration(data.avgApprovalSec)}
          sub="submission to decision"
          icon={<Timer className="h-4 w-4" />}
        />
      </div>

      {/* ── Volume trend ─────────────────────────────────────────────────── */}
      <ChartCard
        title="Change Volume"
        description="Daily change requests created over the selected period."
      >
        <ChartContainer
          config={{ count: { label: "Changes", color: "hsl(var(--chart-3))" } }}
          className="h-48"
        >
          <AreaChart data={data.volume}>
            <defs>
              <linearGradient id="changeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="hsl(var(--chart-3))" stopOpacity={0.35} />
                <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDay}
              interval={xInterval(data.volume.length)}
              tickLine={false} axisLine={false} tick={{ fontSize: 11 }}
            />
            <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={28} tick={{ fontSize: 11 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              type="monotone" dataKey="count" name="Changes"
              stroke="hsl(var(--chart-3))" fill="url(#changeGrad)" strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </ChartCard>

      {/* ── By state + by risk ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Changes by State">
          <ChartContainer
            config={{ count: { label: "Count", color: "hsl(var(--chart-3))" } }}
            className="h-52"
          >
            <BarChart
              data={data.byState.map(s => ({ ...s, label: STATE_LABELS[s.state] ?? s.state }))}
              layout="vertical" barSize={14}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis dataKey="label" type="category" width={110} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="hsl(var(--chart-3))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        </ChartCard>

        <ChartCard title="Changes by Risk Level">
          <ChartContainer
            config={{ count: { label: "Count", color: "hsl(var(--chart-4))" } }}
            className="h-52"
          >
            <BarChart
              data={data.byRisk.map(r => ({
                ...r,
                label: r.risk.charAt(0).toUpperCase() + r.risk.slice(1),
                fill: RISK_COLORS[r.risk] ?? "hsl(var(--chart-4))",
              }))}
              layout="vertical" barSize={14}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis dataKey="label" type="category" width={80} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="hsl(var(--chart-4))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>

      {/* ── By type ──────────────────────────────────────────────────────── */}
      {data.byType.length > 0 && (
        <ChartCard title="Changes by Type" description="Standard vs. emergency vs. pre-approved breakdown.">
          <ChartContainer
            config={{ count: { label: "Count", color: "hsl(var(--chart-5))" } }}
            className="h-36"
          >
            <BarChart data={data.byType.map(t => ({ ...t, label: TYPE_LABELS[t.type] ?? t.type }))} barSize={32}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={28} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="hsl(var(--chart-5))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </ChartCard>
      )}
    </div>
  );
}
