import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import ErrorAlert from "@/components/ErrorAlert";
import KpiCard from "@/components/reports/KpiCard";
import ChartCard from "@/components/reports/ChartCard";
import ReportLoading from "@/components/reports/ReportLoading";
import { fetchIncidentReport } from "@/lib/reports/api";
import { fmtDuration, fmtPct, xInterval, fmtDay, complianceClass } from "@/lib/reports/utils";

const STATUS_LABELS: Record<string, string> = {
  open:          "Open",
  acknowledged:  "Acknowledged",
  in_progress:   "In Progress",
  resolved:      "Resolved",
  closed:        "Closed",
};

export default function IncidentsReport() {
  const [searchParams] = useSearchParams();
  const period = searchParams.get("period") ?? "30";

  const { data, isLoading, error } = useQuery({
    queryKey: ["reports", "incidents", period],
    queryFn: () => fetchIncidentReport(period),
  });

  if (isLoading) return <ReportLoading kpiCount={5} chartCount={2} />;
  if (error)     return <ErrorAlert error={error as Error} fallback="Failed to load incident data" />;
  if (!data)     return null;

  const totalWithSla = data.total; // slaBreached is a subset of total
  const slaCompliancePct =
    totalWithSla > 0 ? Math.round(((totalWithSla - data.slaBreached) / totalWithSla) * 100) : null;

  return (
    <div className="space-y-6">
      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard title="Total Incidents" value={data.total.toLocaleString()} />
        <KpiCard
          title="Major Incidents"
          value={data.majorCount}
          valueClass={data.majorCount > 0 ? "text-destructive" : undefined}
          sub="severity ≥ threshold"
        />
        <KpiCard
          title="SLA Compliance"
          value={fmtPct(slaCompliancePct)}
          sub={`${data.slaBreached} breached`}
          valueClass={complianceClass(slaCompliancePct)}
        />
        <KpiCard
          title="MTTA"
          value={fmtDuration(data.mtta)}
          sub="mean time to acknowledge"
        />
        <KpiCard
          title="MTTR"
          value={fmtDuration(data.mttr)}
          sub="mean time to resolve"
        />
      </div>

      {/* ── Volume over time ─────────────────────────────────────────────── */}
      <ChartCard
        title="Incident Volume"
        description="New incidents opened per day for the selected period."
        accentColor="bg-rose-500"
      >
        <ChartContainer
          config={{ count: { label: "Incidents", color: "hsl(var(--chart-1))" } }}
          className="h-48"
        >
          <LineChart data={data.volume}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDay}
              interval={xInterval(data.volume.length)}
              tickLine={false}
              axisLine={false}
            />
            <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={32} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              type="monotone"
              dataKey="count"
              stroke="var(--color-count)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </ChartCard>

      {/* ── Status + Priority distributions ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="By Status" accentColor="bg-slate-500">
          <ChartContainer
            config={{ count: { label: "Count", color: "hsl(var(--chart-1))" } }}
            className="h-52"
          >
            <BarChart data={data.byStatus} layout="vertical" barSize={14}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis
                dataKey="status"
                type="category"
                width={112}
                tickLine={false}
                axisLine={false}
                tickFormatter={s => STATUS_LABELS[s] ?? s}
                tick={{ fontSize: 11 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        </ChartCard>

        <ChartCard title="By Priority" accentColor="bg-orange-500">
          <ChartContainer
            config={{ count: { label: "Count", color: "hsl(var(--chart-4))" } }}
            className="h-52"
          >
            <BarChart data={data.byPriority} layout="vertical" barSize={14}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis
                dataKey="priority"
                type="category"
                width={64}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>
    </div>
  );
}
