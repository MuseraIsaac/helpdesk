import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import ChartCard from "@/components/reports/ChartCard";
import ReportLoading from "@/components/reports/ReportLoading";
import ErrorAlert from "@/components/ErrorAlert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BatchQueryResponse, AnalyticsQueryResponse } from "@/lib/reports/analytics-types";
import { fmtDuration, fmtPct } from "@/lib/reports/utils";
import type { PeriodOption } from "@/lib/reports/types";

// ── Period → date preset mapping ──────────────────────────────────────────────

const PERIOD_TO_PRESET: Record<string, string> = {
  "7":  "last_7_days",
  "30": "last_30_days",
  "90": "last_90_days",
};

// ── Metric query helpers ──────────────────────────────────────────────────────

function buildBatch(preset: string) {
  const dateRange = { preset };
  return {
    queries: [
      { widgetId: "resolved",      metricId: "agent.tickets_resolved",     dateRange, limit: 10 },
      { widgetId: "resolution",    metricId: "agent.avg_resolution_time",  dateRange, limit: 10 },
      { widgetId: "csat",          metricId: "agent.csat_score",           dateRange, limit: 10 },
      { widgetId: "response",      metricId: "agent.first_response_time",  dateRange, limit: 10 },
      { widgetId: "sla",           metricId: "agent.sla_compliance",       dateRange, limit: 10 },
      { widgetId: "fcr",           metricId: "agent.fcr_rate",             dateRange, limit: 10 },
      { widgetId: "workload",      metricId: "agent.workload",             dateRange, limit: 10 },
      { widgetId: "trend",         metricId: "agent.volume_trend",         dateRange },
    ],
  };
}

async function fetchBatch(preset: string): Promise<BatchQueryResponse> {
  const { data } = await axios.post<BatchQueryResponse>("/api/analytics/batch", buildBatch(preset));
  return data;
}

// ── Leaderboard table helper ──────────────────────────────────────────────────

function LeaderboardTable({ result, formatValue }: {
  result: AnalyticsQueryResponse;
  formatValue?: (key: string, val: number | string | null) => string;
}) {
  if (result.result.type !== "leaderboard") return null;
  const { entries, columnDefs } = result.result;
  if (entries.length === 0) return <p className="text-sm text-muted-foreground py-4 text-center">No data</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">#</TableHead>
          <TableHead>Agent</TableHead>
          {columnDefs.map(col => (
            <TableHead key={col.key} className="text-right">{col.label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map(entry => (
          <TableRow key={entry.key}>
            <TableCell className="text-muted-foreground">{entry.rank}</TableCell>
            <TableCell className="font-medium">{entry.label}</TableCell>
            {columnDefs.map(col => {
              const raw = entry.columns[col.key];
              const val = formatValue ? formatValue(col.key, raw) : (raw ?? "—");
              return <TableCell key={col.key} className="text-right">{val}</TableCell>;
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AgentReport() {
  const [searchParams] = useSearchParams();
  const period = (searchParams.get("period") ?? "30") as PeriodOption;
  const preset = PERIOD_TO_PRESET[period] ?? "last_30_days";

  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics", "agent", preset],
    queryFn: () => fetchBatch(preset),
  });

  if (isLoading) return <ReportLoading kpiCount={3} chartCount={3} />;
  if (error) return <ErrorAlert error={error} fallback="Failed to load agent report" />;
  if (!data) return null;

  const r = data.results;

  function getLeaderboard(id: string): AnalyticsQueryResponse | null {
    const item = r[id];
    if (!item || "error" in item) return null;
    return item;
  }

  const resolved   = getLeaderboard("resolved");
  const resolution = getLeaderboard("resolution");
  const csat       = getLeaderboard("csat");
  const response   = getLeaderboard("response");
  const sla        = getLeaderboard("sla");
  const fcr        = getLeaderboard("fcr");
  const workload   = getLeaderboard("workload");

  return (
    <div className="space-y-6">
      {/* ── Top leaderboards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard accentColor="bg-violet-500" title="Tickets Resolved" description="Ranked by resolved ticket count">
          {resolved ? (
            <LeaderboardTable
              result={resolved}
              formatValue={(key, v) => key === "resolved" || key === "open" ? String(v ?? 0) : String(v ?? "—")}
            />
          ) : <p className="text-sm text-muted-foreground">No data</p>}
        </ChartCard>

        <ChartCard accentColor="bg-sky-500" title="Current Workload" description="Open + in-progress tickets per agent (live)">
          {workload ? (
            <LeaderboardTable
              result={workload}
              formatValue={(_k, v) => String(v ?? 0)}
            />
          ) : <p className="text-sm text-muted-foreground">No data</p>}
        </ChartCard>
      </div>

      {/* ── Quality metrics ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard accentColor="bg-indigo-500" title="Avg Resolution Time" description="Fastest resolving agents first">
          {resolution ? (
            <LeaderboardTable
              result={resolution}
              formatValue={(key, v) =>
                key === "avgSeconds" ? fmtDuration(Number(v)) : String(v ?? "—")
              }
            />
          ) : <p className="text-sm text-muted-foreground">No data</p>}
        </ChartCard>

        <ChartCard accentColor="bg-blue-500" title="Avg First Response Time" description="Fastest responding agents first">
          {response ? (
            <LeaderboardTable
              result={response}
              formatValue={(key, v) =>
                key === "avgSeconds" ? fmtDuration(Number(v)) : String(v ?? "—")
              }
            />
          ) : <p className="text-sm text-muted-foreground">No data</p>}
        </ChartCard>
      </div>

      {/* ── CSAT + SLA + FCR ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartCard accentColor="bg-amber-500" title="CSAT Score by Agent" description="Avg rating (1–5)">
          {csat ? (
            <LeaderboardTable
              result={csat}
              formatValue={(key, v) =>
                key === "avgRating" ? `${Number(v ?? 0).toFixed(2)} ★` : String(v ?? 0)
              }
            />
          ) : <p className="text-sm text-muted-foreground">No data</p>}
        </ChartCard>

        <ChartCard accentColor="bg-emerald-500" title="SLA Compliance by Agent" description="% of SLA-scoped tickets met">
          {sla ? (
            <LeaderboardTable
              result={sla}
              formatValue={(key, v) =>
                key === "compliance" ? fmtPct(Number(v)) : String(v ?? 0)
              }
            />
          ) : <p className="text-sm text-muted-foreground">No data</p>}
        </ChartCard>

        <ChartCard accentColor="bg-teal-500" title="First Contact Resolution" description="% resolved without customer follow-up">
          {fcr ? (
            <LeaderboardTable
              result={fcr}
              formatValue={(key, v) =>
                key === "fcrPct" ? fmtPct(Number(v)) : String(v ?? 0)
              }
            />
          ) : <p className="text-sm text-muted-foreground">No data</p>}
        </ChartCard>
      </div>
    </div>
  );
}
