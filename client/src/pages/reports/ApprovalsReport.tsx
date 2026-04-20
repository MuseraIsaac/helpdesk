import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, Timer } from "lucide-react";
import ErrorAlert from "@/components/ErrorAlert";
import KpiCard from "@/components/reports/KpiCard";
import ChartCard from "@/components/reports/ChartCard";
import ReportLoading from "@/components/reports/ReportLoading";
import { fetchApprovalReport } from "@/lib/reports/api";
import { fmtDuration } from "@/lib/reports/utils";

const STATUS_COLORS: Record<string, string> = {
  pending:  "hsl(43, 96%, 56%)",
  approved: "hsl(142, 71%, 45%)",
  rejected: "hsl(0, 84%, 60%)",
  expired:  "hsl(215, 16%, 60%)",
  cancelled:"hsl(0, 0%, 60%)",
};

const STATUS_LABELS: Record<string, string> = {
  pending:  "Pending",
  approved: "Approved",
  rejected: "Rejected",
  expired:  "Expired",
  cancelled:"Cancelled",
};

export default function ApprovalsReport() {
  const [searchParams] = useSearchParams();
  const period = searchParams.get("period") ?? "30";

  const { data, isLoading, error } = useQuery({
    queryKey: ["reports", "approvals", period],
    queryFn: () => fetchApprovalReport(period),
  });

  if (isLoading) return <ReportLoading kpiCount={4} chartCount={1} />;
  if (error)     return <ErrorAlert error={error as Error} fallback="Failed to load approval data" />;
  if (!data)     return null;

  const approved  = data.byStatus.find(s => s.status === "approved")?.count ?? 0;
  const rejected  = data.byStatus.find(s => s.status === "rejected")?.count ?? 0;
  const pending   = data.byStatus.find(s => s.status === "pending")?.count  ?? 0;
  const approvalRate = (approved + rejected) > 0
    ? Math.round((approved / (approved + rejected)) * 100)
    : null;

  const donutData = data.byStatus
    .filter(s => s.count > 0)
    .map(s => ({
      name:  STATUS_LABELS[s.status] ?? s.status,
      value: s.count,
      color: STATUS_COLORS[s.status] ?? "hsl(215, 16%, 70%)",
    }));

  return (
    <div className="space-y-6">
      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          title="Total Approvals"
          value={data.total.toLocaleString()}
          sub={`in last ${period} days`}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <KpiCard
          title="Approval Rate"
          value={approvalRate != null ? `${approvalRate}%` : "—"}
          sub={`${approved} approved / ${rejected} rejected`}
          variant={approvalRate == null ? "default" : approvalRate >= 80 ? "success" : "warning"}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <KpiCard
          title="Pending"
          value={pending.toLocaleString()}
          sub="awaiting decision"
          variant={pending > 10 ? "warning" : "default"}
          icon={<Clock className="h-4 w-4" />}
        />
        <KpiCard
          title="Avg Turnaround"
          value={fmtDuration(data.avgTurnaroundSeconds)}
          sub="submission to decision"
          icon={<Timer className="h-4 w-4" />}
        />
      </div>

      {/* ── Status donut + oldest pending table ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Approval Status Distribution">
          {donutData.length > 0 ? (
            <div className="flex gap-4 items-center py-2">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={donutData} dataKey="value" cx="50%" cy="50%"
                    innerRadius={40} outerRadius={62} paddingAngle={2}>
                    {donutData.map(d => (
                      <Cell key={d.name} fill={d.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [v, n]} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="space-y-2 flex-1">
                {donutData.map(d => (
                  <li key={d.name} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="text-muted-foreground">{d.name}</span>
                    <span className="ml-auto font-medium tabular-nums">{d.value.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">No data</p>
          )}
        </ChartCard>

        <ChartCard
          title="Oldest Pending Approvals"
          description="Longest-waiting approvals — may need escalation."
          contentClassName="p-0"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Days Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.oldestPending.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="text-sm font-medium max-w-[180px] truncate">
                    {item.title}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {item.subjectType.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={item.daysOpen > 7 ? "text-destructive font-semibold" : "font-medium"}>
                      {item.daysOpen}d
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {data.oldestPending.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8 text-sm">
                    No pending approvals
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ChartCard>
      </div>

      {rejected > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 rounded-lg bg-muted/30 border">
          <XCircle className="h-4 w-4 text-destructive shrink-0" />
          <span>
            <strong className="text-foreground">{rejected}</strong> approval{rejected !== 1 && "s"} rejected
            in this period. Review rejection reasons in the Approvals module.
          </span>
        </div>
      )}
    </div>
  );
}
