import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from "@/components/ui/chart";
import { Bug, BookMarked, LinkIcon, RefreshCw } from "lucide-react";
import ErrorAlert from "@/components/ErrorAlert";
import KpiCard from "@/components/reports/KpiCard";
import ChartCard from "@/components/reports/ChartCard";
import ReportLoading from "@/components/reports/ReportLoading";
import { fetchProblemReport } from "@/lib/reports/api";

const STATUS_LABELS: Record<string, string> = {
  open:          "Open",
  investigating: "Investigating",
  known_error:   "Known Error",
  resolved:      "Resolved",
  closed:        "Closed",
};

export default function ProblemsReport() {
  const [searchParams] = useSearchParams();
  const period = searchParams.get("period") ?? "30";

  const { data, isLoading, error } = useQuery({
    queryKey: ["reports", "problems", period],
    queryFn: () => fetchProblemReport(period),
  });

  if (isLoading) return <ReportLoading kpiCount={4} chartCount={1} />;
  if (error)     return <ErrorAlert error={error as Error} fallback="Failed to load problem data" />;
  if (!data)     return null;

  const statusData = data.byStatus.map(s => ({
    ...s,
    label: STATUS_LABELS[s.status] ?? s.status,
  }));

  const knownErrorPct = data.total > 0
    ? Math.round((data.knownErrors / data.total) * 100)
    : 0;

  const recurringPct = data.total > 0
    ? Math.round((data.recurring / data.total) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          title="Total Problems"
          value={data.total.toLocaleString()}
          sub={`in last ${period} days`}
          icon={<Bug className="h-4 w-4" />}
        />
        <KpiCard
          title="Known Errors"
          value={data.knownErrors.toLocaleString()}
          sub={`${knownErrorPct}% of total`}
          variant={data.knownErrors > 0 ? "warning" : "success"}
          icon={<BookMarked className="h-4 w-4" />}
        />
        <KpiCard
          title="With Linked Incidents"
          value={data.withIncidents.toLocaleString()}
          sub="at least 1 incident linked"
          icon={<LinkIcon className="h-4 w-4" />}
        />
        <KpiCard
          title="Recurring Problems"
          value={data.recurring.toLocaleString()}
          sub={`${recurringPct}% with ≥ 2 incidents`}
          variant={data.recurring > 0 ? "danger" : "success"}
          icon={<RefreshCw className="h-4 w-4" />}
        />
      </div>

      {/* ── Avg resolution ───────────────────────────────────────────────── */}
      {data.avgResolutionDays != null && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard
            title="Avg Resolution Time"
            value={`${data.avgResolutionDays.toFixed(1)} days`}
            sub="creation to resolution"
          />
        </div>
      )}

      {/* ── Status distribution ──────────────────────────────────────────── */}
      <ChartCard
        title="Problems by Status"
        description="Distribution of problem records across investigation stages."
      >
        {statusData.length > 0 ? (
          <ChartContainer
            config={{ count: { label: "Problems", color: "hsl(var(--chart-4))" } }}
            className="h-52"
          >
            <BarChart data={statusData} layout="vertical" barSize={16}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis
                dataKey="label"
                type="category"
                width={110}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="hsl(var(--chart-4))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">No problem data for this period</p>
        )}
      </ChartCard>
    </div>
  );
}
