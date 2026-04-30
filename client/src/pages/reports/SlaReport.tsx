import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Lock, ShieldAlert, ShieldX, AlertTriangle, CheckCircle2 } from "lucide-react";
import { can } from "core/constants/permission.ts";
import { useSession } from "@/lib/auth-client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import ErrorAlert from "@/components/ErrorAlert";
import KpiCard from "@/components/reports/KpiCard";
import ChartCard from "@/components/reports/ChartCard";
import ReportLoading from "@/components/reports/ReportLoading";
import {
  fetchSlaByDimension,
  fetchAgentLeaderboard,
  fetchOperationalHealth,
} from "@/lib/reports/api";
import { fmtDuration, fmtPct, complianceClass } from "@/lib/reports/utils";
import { cn } from "@/lib/utils";
import type { SlaDimItem } from "@/lib/reports/types";

// ── Local sub-components ──────────────────────────────────────────────────────

const DIM_ACCENT: Record<string, string> = {
  Priority: "bg-orange-500",
  Category: "bg-blue-500",
  Team:     "bg-violet-500",
};

function SlaDimTable({ label, items }: { label: string; items: SlaDimItem[] }) {
  return (
    <ChartCard title={`SLA by ${label}`} contentClassName="p-0" accentColor={DIM_ACCENT[label] ?? "bg-slate-500"}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{label}</TableHead>
            <TableHead className="text-right">With SLA</TableHead>
            <TableHead className="text-right">Breached</TableHead>
            <TableHead className="text-right">Compliance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map(item => (
            <TableRow key={item.key}>
              <TableCell className="capitalize text-sm">{item.label ?? item.key}</TableCell>
              <TableCell className="text-right text-sm tabular-nums">{item.totalWithSla}</TableCell>
              <TableCell className="text-right text-sm tabular-nums">
                <span className={item.breached > 0 ? "text-destructive font-medium" : ""}>
                  {item.breached}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <span className={cn("text-sm font-semibold tabular-nums", complianceClass(item.compliance))}>
                  {fmtPct(item.compliance)}
                </span>
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8 text-sm">
                No data for this period
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </ChartCard>
  );
}

// ── Main report ───────────────────────────────────────────────────────────────

export default function SlaReport() {
  const [searchParams] = useSearchParams();
  const period = searchParams.get("period") ?? "30";

  const { data: session } = useSession();
  const role = session?.user?.role ?? "";
  const canViewAdvanced = can(role, "reports.advanced_view");

  const { data: slaData, isLoading: loadingSla, error: slaErr } = useQuery({
    queryKey: ["reports", "sla", period],
    queryFn: () => fetchSlaByDimension(period),
  });

  const { data: health, isLoading: loadingHealth } = useQuery({
    queryKey: ["reports", "operational-health"],
    queryFn: fetchOperationalHealth,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const { data: agents, isLoading: loadingLeader } = useQuery({
    queryKey: ["reports", "leaderboard", period],
    queryFn: () => fetchAgentLeaderboard(period),
    enabled: canViewAdvanced,
  });

  if (loadingSla) return <ReportLoading kpiCount={4} chartCount={3} />;
  if (slaErr) return <ErrorAlert error={slaErr as Error} fallback="Failed to load SLA data" />;

  // Derive overall compliance from priority breakdown
  const allWithSla   = (slaData?.byPriority ?? []).reduce((s, r) => s + r.totalWithSla, 0);
  const allBreached  = (slaData?.byPriority ?? []).reduce((s, r) => s + r.breached, 0);
  const overallPct   = allWithSla > 0 ? Math.round(((allWithSla - allBreached) / allWithSla) * 100) : null;

  return (
    <div className="space-y-6">
      {/* ── Live SLA health KPIs ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          title="SLA Compliance"
          value={fmtPct(overallPct)}
          sub={`${allBreached} breached of ${allWithSla}`}
          variant={
            overallPct == null ? "default" :
            overallPct >= 90   ? "success" :
            overallPct >= 70   ? "warning" : "danger"
          }
          valueClass={complianceClass(overallPct)}
          icon={<ShieldAlert className="h-4 w-4" />}
        />
        <KpiCard
          title="Breached Open"
          value={loadingHealth ? "…" : (health?.overdue ?? 0).toLocaleString()}
          sub="Still open past SLA"
          variant={(health?.overdue ?? 0) > 0 ? "danger" : "success"}
          icon={<ShieldX className="h-4 w-4" />}
        />
        <KpiCard
          title="At SLA Risk"
          value={loadingHealth ? "…" : (health?.atRisk ?? 0).toLocaleString()}
          sub="Approaching SLA deadline"
          variant={(health?.atRisk ?? 0) > 0 ? "warning" : "success"}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <KpiCard
          title="On Track"
          value={loadingHealth ? "…" : (
            (health?.open ?? 0) - (health?.overdue ?? 0) - (health?.atRisk ?? 0)
          ).toLocaleString()}
          sub="Open with SLA headroom"
          variant="success"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
      </div>

      {/* ── SLA compliance by dimension ──────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SlaDimTable label="Priority" items={slaData?.byPriority ?? []} />
        <SlaDimTable label="Category" items={slaData?.byCategory ?? []} />
        <SlaDimTable label="Team"     items={slaData?.byTeam     ?? []} />
      </div>

      {/* ── Agent leaderboard (reports.advanced_view required) ───────────── */}
      {canViewAdvanced ? (
        <ChartCard
          title="Agent Leaderboard"
          description="Top agents by tickets resolved — avg resolution time and SLA compliance."
          contentClassName="p-0"
          accentColor="bg-emerald-500"
        >
          {loadingLeader ? (
            <div className="p-6"><Skeleton className="h-52" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Resolved</TableHead>
                  <TableHead className="text-right">Avg Resolution</TableHead>
                  <TableHead className="text-right">SLA Compliance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(agents ?? []).map((agent, i) => (
                  <TableRow key={agent.agentId}>
                    <TableCell className="text-xs text-muted-foreground tabular-nums w-8">{i + 1}</TableCell>
                    <TableCell className="text-sm font-medium">{agent.agentName}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums font-medium">{agent.resolved}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {fmtDuration(agent.avgResolutionSeconds)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={cn("text-sm font-semibold tabular-nums", complianceClass(agent.slaCompliancePct))}>
                        {fmtPct(agent.slaCompliancePct)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {(agents ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-10 text-sm">
                      No agent data for this period
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </ChartCard>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
            <Lock className="h-8 w-8" />
            <p className="text-sm font-medium">Agent-level data requires elevated access</p>
            <p className="text-xs">Available to admins and supervisors.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
