import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PackageCheck, Clock, ShieldCheck, TrendingDown } from "lucide-react";
import ErrorAlert from "@/components/ErrorAlert";
import KpiCard from "@/components/reports/KpiCard";
import ChartCard from "@/components/reports/ChartCard";
import ReportLoading from "@/components/reports/ReportLoading";
import { fetchRequestReport } from "@/lib/reports/api";
import { fmtDuration, fmtPct, complianceClass } from "@/lib/reports/utils";

const STATUS_LABELS: Record<string, string> = {
  pending:    "Pending",
  approved:   "Approved",
  in_progress: "In Progress",
  resolved:   "Resolved",
  closed:     "Closed",
  cancelled:  "Cancelled",
  rejected:   "Rejected",
};

const STATUS_COLORS: Record<string, string> = {
  pending:     "hsl(43, 96%, 56%)",
  approved:    "hsl(142, 71%, 45%)",
  in_progress: "hsl(262, 83%, 65%)",
  resolved:    "hsl(142, 71%, 45%)",
  closed:      "hsl(215, 16%, 60%)",
  cancelled:   "hsl(0, 0%, 60%)",
  rejected:    "hsl(0, 84%, 60%)",
};

export default function RequestsReport() {
  const [searchParams] = useSearchParams();
  const period = searchParams.get("period") ?? "30";

  const { data, isLoading, error } = useQuery({
    queryKey: ["reports", "requests", period],
    queryFn: () => fetchRequestReport(period),
  });

  if (isLoading) return <ReportLoading kpiCount={4} chartCount={2} />;
  if (error)     return <ErrorAlert error={error as Error} fallback="Failed to load request data" />;
  if (!data)     return null;

  const statusData = data.byStatus.map(s => ({
    ...s,
    label: STATUS_LABELS[s.status] ?? s.status,
    fill:  STATUS_COLORS[s.status] ?? "hsl(var(--chart-1))",
  }));

  return (
    <div className="space-y-6">
      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          title="Total Requests"
          value={data.total.toLocaleString()}
          sub={`in last ${period} days`}
          icon={<PackageCheck className="h-4 w-4" />}
        />
        <KpiCard
          title="SLA Compliance"
          value={fmtPct(data.slaCompliance)}
          sub={`${data.slaBreached} breached`}
          variant={
            data.slaCompliance == null ? "default" :
            data.slaCompliance >= 90   ? "success" :
            data.slaCompliance >= 70   ? "warning" : "danger"
          }
          valueClass={complianceClass(data.slaCompliance)}
          icon={<ShieldCheck className="h-4 w-4" />}
        />
        <KpiCard
          title="Avg Fulfillment Time"
          value={fmtDuration(data.avgFulfillmentSeconds)}
          sub="creation to resolution"
          icon={<Clock className="h-4 w-4" />}
        />
        <KpiCard
          title="Breach Count"
          value={data.slaBreached.toLocaleString()}
          sub="SLA breaches in period"
          variant={data.slaBreached > 0 ? "danger" : "success"}
          icon={<TrendingDown className="h-4 w-4" />}
        />
      </div>

      {/* ── Status distribution ──────────────────────────────────────────── */}
      <ChartCard accentColor="bg-teal-500"
        title="Requests by Status"
        description="Distribution of service requests across fulfillment stages."
      >
        <ChartContainer
          config={{ count: { label: "Requests", color: "hsl(var(--chart-2))" } }}
          className="h-52"
        >
          <BarChart data={statusData} layout="vertical" barSize={14}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border" />
            <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: 11 }} />
            <YAxis
              dataKey="label"
              type="category"
              width={100}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              dataKey="count"
              radius={[0, 4, 4, 0]}
              fill="hsl(var(--chart-2))"
            />
          </BarChart>
        </ChartContainer>
      </ChartCard>

      {/* ── Top catalog items ────────────────────────────────────────────── */}
      <ChartCard accentColor="bg-teal-500"
        title="Top Catalog Items"
        description="Most requested service catalog items with average fulfillment time."
        contentClassName="p-0"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Catalog Item</TableHead>
              <TableHead className="text-right">Requests</TableHead>
              <TableHead className="text-right">Avg Fulfillment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.topItems.map((item, i) => (
              <TableRow key={item.name}>
                <TableCell className="text-muted-foreground text-xs w-8">{i + 1}</TableCell>
                <TableCell className="text-sm font-medium">{item.name}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{item.count}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {fmtDuration(item.avgSeconds)}
                </TableCell>
              </TableRow>
            ))}
            {data.topItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8 text-sm">
                  No request data for this period
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ChartCard>
    </div>
  );
}
