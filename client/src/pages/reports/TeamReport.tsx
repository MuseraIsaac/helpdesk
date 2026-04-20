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

const PERIOD_TO_PRESET: Record<string, string> = {
  "7":  "last_7_days",
  "30": "last_30_days",
  "90": "last_90_days",
};

function buildBatch(preset: string) {
  const dateRange = { preset };
  return {
    queries: [
      { widgetId: "resolved",   metricId: "team.tickets_resolved",    dateRange, limit: 10 },
      { widgetId: "resolution", metricId: "team.avg_resolution_time", dateRange, limit: 10 },
      { widgetId: "sla",        metricId: "team.sla_compliance",      dateRange, limit: 10 },
      { widgetId: "depth",      metricId: "team.queue_depth",         dateRange, limit: 10 },
      { widgetId: "csat",       metricId: "team.csat_score",          dateRange, limit: 10 },
      { widgetId: "response",   metricId: "team.first_response_time", dateRange, limit: 10 },
    ],
  };
}

async function fetchBatch(preset: string): Promise<BatchQueryResponse> {
  const { data } = await axios.post<BatchQueryResponse>("/api/analytics/batch", buildBatch(preset));
  return data;
}

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
          <TableHead>Team</TableHead>
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

export default function TeamReport() {
  const [searchParams] = useSearchParams();
  const period = (searchParams.get("period") ?? "30") as PeriodOption;
  const preset = PERIOD_TO_PRESET[period] ?? "last_30_days";

  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics", "team", preset],
    queryFn: () => fetchBatch(preset),
  });

  if (isLoading) return <ReportLoading kpiCount={0} chartCount={4} />;
  if (error) return <ErrorAlert error={error} fallback="Failed to load team report" />;
  if (!data) return null;

  const r = data.results;

  function get(id: string): AnalyticsQueryResponse | null {
    const item = r[id];
    if (!item || "error" in item) return null;
    return item;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard accentColor="bg-violet-500" title="Tickets Resolved by Team" description="Total resolved in selected period">
          {get("resolved") ? (
            <LeaderboardTable result={get("resolved")!} formatValue={(_k, v) => String(v ?? 0)} />
          ) : <p className="text-sm text-muted-foreground">No data</p>}
        </ChartCard>

        <ChartCard accentColor="bg-rose-500" title="Queue Depth (Live)" description="Currently open tickets per team">
          {get("depth") ? (
            <LeaderboardTable
              result={get("depth")!}
              formatValue={(_k, v) => String(v ?? 0)}
            />
          ) : <p className="text-sm text-muted-foreground">No data</p>}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard accentColor="bg-indigo-500" title="Avg Resolution Time by Team" description="Fastest resolving teams first">
          {get("resolution") ? (
            <LeaderboardTable
              result={get("resolution")!}
              formatValue={(key, v) => key === "avgSeconds" ? fmtDuration(Number(v)) : String(v ?? 0)}
            />
          ) : <p className="text-sm text-muted-foreground">No data</p>}
        </ChartCard>

        <ChartCard title="Avg First Response Time by Team" description="Fastest responding teams first">
          {get("response") ? (
            <LeaderboardTable
              result={get("response")!}
              formatValue={(key, v) => key === "avgSeconds" ? fmtDuration(Number(v)) : String(v ?? 0)}
            />
          ) : <p className="text-sm text-muted-foreground">No data</p>}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard accentColor="bg-emerald-500" title="SLA Compliance by Team" description="% of SLA-scoped tickets met on time">
          {get("sla") ? (
            <LeaderboardTable
              result={get("sla")!}
              formatValue={(key, v) => key === "compliance" ? fmtPct(Number(v)) : String(v ?? 0)}
            />
          ) : <p className="text-sm text-muted-foreground">No data</p>}
        </ChartCard>

        <ChartCard accentColor="bg-amber-500" title="CSAT Score by Team" description="Average customer satisfaction (1–5)">
          {get("csat") ? (
            <LeaderboardTable
              result={get("csat")!}
              formatValue={(key, v) =>
                key === "avgRating" ? `${Number(v ?? 0).toFixed(2)} ★` : String(v ?? 0)
              }
            />
          ) : <p className="text-sm text-muted-foreground">No data</p>}
        </ChartCard>
      </div>
    </div>
  );
}
