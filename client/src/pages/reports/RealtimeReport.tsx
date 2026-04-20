import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  RefreshCw, ShieldX, AlertTriangle, MessageSquareOff,
  Users, Clock, Activity, Wifi, WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ChartCard from "@/components/reports/ChartCard";
import KpiCard from "@/components/reports/KpiCard";
import ReportLoading from "@/components/reports/ReportLoading";
import ErrorAlert from "@/components/ErrorAlert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { BatchQueryResponse, AnalyticsQueryResponse } from "@/lib/reports/analytics-types";
import { useSSE } from "@/hooks/useSSE";

// ── SSE snapshot shape ─────────────────────────────────────────────────────────

interface RealtimeSnapshot {
  open:               number;
  unassigned:         number;
  overdue:            number;
  atRisk:             number;
  assignedNotReplied: number;
  activeIncidents:    number;
  pendingApprovals:   number;
  changesInProgress:  number;
  openProblems:       number;
  openRequests:       number;
  timestamp:          string;
}

// ── Agent workload via analytics batch (still polled — doesn't need SSE) ───────

const WORKLOAD_BATCH = {
  queries: [
    { widgetId: "workload", metricId: "realtime.agent_workload_snapshot",
      dateRange: { preset: "today" }, limit: 10 },
  ],
};

async function fetchWorkload(): Promise<BatchQueryResponse> {
  const { data } = await axios.post<BatchQueryResponse>("/api/analytics/batch", WORKLOAD_BATCH);
  return data;
}

// ── Connection state badge ────────────────────────────────────────────────────

function ConnBadge({ state }: { state: "connecting" | "open" | "closed" }) {
  if (state === "open")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400 font-medium">
        <Wifi className="h-3 w-3" /> Live
      </span>
    );
  if (state === "closed")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-destructive font-medium">
        <WifiOff className="h-3 w-3" /> Disconnected
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
      <RefreshCw className="h-3 w-3 animate-spin" /> Connecting…
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RealtimeReport() {
  const { data: snap, state: sseState } = useSSE<RealtimeSnapshot>(
    "/api/sse/realtime",
    "snapshot",
  );

  const {
    data: workloadData, isLoading: loadingWorkload, refetch: refetchWorkload, isFetching,
  } = useQuery({
    queryKey: ["analytics", "agent-workload"],
    queryFn:  fetchWorkload,
    refetchInterval: 60_000,
  });

  if (!snap && sseState === "connecting") return <ReportLoading kpiCount={9} chartCount={1} />;
  if (!snap && sseState === "closed") {
    return <ErrorAlert message="SSE connection closed. Refresh the page to reconnect." />;
  }

  const updatedAt = snap?.timestamp
    ? new Date(snap.timestamp).toLocaleTimeString()
    : "";

  function get(id: string): AnalyticsQueryResponse | null {
    const item = workloadData?.results[id];
    if (!item || "error" in item) return null;
    return item;
  }

  return (
    <div className="space-y-6">
      {/* ── Status bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5" />
          Updates every 30 seconds via SSE · Last pushed {updatedAt}
          <ConnBadge state={sseState} />
        </span>
        <Button variant="outline" size="sm" onClick={() => refetchWorkload()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh Workload
        </Button>
      </div>

      {/* ── Service Desk KPIs ────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Service Desk — Live
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <KpiCard
            title="Open Tickets"
            value={snap?.open ?? "—"}
            sub={snap ? `${snap.open - (snap.unassigned)} assigned` : undefined}
            icon={<Clock className="h-4 w-4" />}
          />
          <KpiCard
            title="Unassigned"
            value={snap?.unassigned ?? "—"}
            sub="Open without an agent"
            variant={(snap?.unassigned ?? 0) > 5 ? "danger" : (snap?.unassigned ?? 0) > 0 ? "warning" : "success"}
            icon={<Users className="h-4 w-4" />}
          />
          <KpiCard
            title="SLA Overdue"
            value={snap?.overdue ?? "—"}
            sub="Open & past deadline"
            variant={(snap?.overdue ?? 0) > 0 ? "danger" : "success"}
            icon={<ShieldX className="h-4 w-4" />}
          />
          <KpiCard
            title="At SLA Risk"
            value={snap?.atRisk ?? "—"}
            sub="Breach within 2 hours"
            variant={(snap?.atRisk ?? 0) > 0 ? "warning" : "success"}
            icon={<AlertTriangle className="h-4 w-4" />}
          />
          <KpiCard
            title="No Agent Reply"
            value={snap?.assignedNotReplied ?? "—"}
            sub="Assigned but unanswered"
            variant={(snap?.assignedNotReplied ?? 0) > 5 ? "warning" : "default"}
            icon={<MessageSquareOff className="h-4 w-4" />}
          />
        </div>
      </div>

      {/* ── ITSM KPIs ────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          ITSM Modules — Live
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <KpiCard
            title="Active Incidents"
            value={snap?.activeIncidents ?? "—"}
            sub="Non-resolved"
            variant={(snap?.activeIncidents ?? 0) > 0 ? "danger" : "success"}
          />
          <KpiCard
            title="Pending Approvals"
            value={snap?.pendingApprovals ?? "—"}
            sub="Awaiting decision"
            variant={(snap?.pendingApprovals ?? 0) > 0 ? "warning" : "default"}
          />
          <KpiCard
            title="Changes In Progress"
            value={snap?.changesInProgress ?? "—"}
            sub="Implementing"
          />
          <KpiCard
            title="Open Problems"
            value={snap?.openProblems ?? "—"}
            sub="Non-resolved"
            variant={(snap?.openProblems ?? 0) > 0 ? "warning" : "default"}
          />
          <KpiCard
            title="Open Requests"
            value={snap?.openRequests ?? "—"}
            sub="Pending fulfillment"
          />
        </div>
      </div>

      {/* ── Agent workload ────────────────────────────────────────────────── */}
      <ChartCard
        title="Agent Workload (Live)"
        description="Open + in-progress tickets per agent right now. Refreshes every 60 s."
        accentColor="bg-violet-500"
      >
        {loadingWorkload ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading workload…</p>
        ) : (() => {
          const res = get("workload");
          if (!res || res.result.type !== "leaderboard") {
            return <p className="text-sm text-muted-foreground">No workload data</p>;
          }
          const { entries } = res.result;
          if (entries.length === 0) {
            return (
              <p className="text-sm text-muted-foreground py-4 text-center">
                All caught up — no open tickets assigned
              </p>
            );
          }
          return (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                  <TableHead className="text-right">In Progress</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map(e => {
                  const total = Number(e.primaryValue);
                  return (
                    <TableRow key={e.key}>
                      <TableCell className="text-muted-foreground text-xs">{e.rank}</TableCell>
                      <TableCell className="font-medium">{e.label}</TableCell>
                      <TableCell className="text-right">{e.columns.open ?? "—"}</TableCell>
                      <TableCell className="text-right">{e.columns.inProgress ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={total > 10 ? "destructive" : total > 5 ? "secondary" : "outline"}>
                          {total}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          );
        })()}
      </ChartCard>
    </div>
  );
}
