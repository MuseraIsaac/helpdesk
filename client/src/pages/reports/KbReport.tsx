import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import ChartCard from "@/components/reports/ChartCard";
import KpiCard from "@/components/reports/KpiCard";
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
import { Badge } from "@/components/ui/badge";
import type { BatchQueryResponse, AnalyticsQueryResponse } from "@/lib/reports/analytics-types";
import { fmtPct } from "@/lib/reports/utils";
import type { PeriodOption } from "@/lib/reports/types";
import { fetchKbSearchStats } from "@/lib/reports/api";

const PERIOD_TO_PRESET: Record<string, string> = {
  "7":  "last_7_days",
  "30": "last_30_days",
  "90": "last_90_days",
};

function buildBatch(preset: string) {
  const dateRange = { preset };
  return {
    queries: [
      { widgetId: "count",      metricId: "kb.article_count",    dateRange },
      { widgetId: "views",      metricId: "kb.view_count",        dateRange },
      { widgetId: "helpful",    metricId: "kb.helpful_ratio",     dateRange },
      { widgetId: "trend",      metricId: "kb.feedback_trend",    dateRange },
      { widgetId: "top",        metricId: "kb.top_articles",      dateRange, limit: 10, visualization: "leaderboard" },
      { widgetId: "best",       metricId: "kb.most_helpful",      dateRange, limit: 10 },
      { widgetId: "published",  metricId: "kb.published_trend",   dateRange },
    ],
  };
}

async function fetchBatch(preset: string): Promise<BatchQueryResponse> {
  const { data } = await axios.post<BatchQueryResponse>("/api/analytics/batch", buildBatch(preset));
  return data;
}

function statValue(result: AnalyticsQueryResponse | null): number | null {
  if (!result) return null;
  if (result.result.type === "stat") return result.result.value;
  return null;
}

export default function KbReport() {
  const [searchParams] = useSearchParams();
  const period = (searchParams.get("period") ?? "30") as PeriodOption;
  const preset = PERIOD_TO_PRESET[period] ?? "last_30_days";

  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics", "kb", preset],
    queryFn: () => fetchBatch(preset),
  });

  const { data: searchStats } = useQuery({
    queryKey: ["reports", "kb-search-stats", period],
    queryFn:  () => fetchKbSearchStats(period),
    staleTime: 60_000,
  });

  if (isLoading) return <ReportLoading kpiCount={3} chartCount={3} />;
  if (error) return <ErrorAlert error={error} fallback="Failed to load KB report" />;
  if (!data) return null;

  const r = data.results;

  function get(id: string): AnalyticsQueryResponse | null {
    const item = r[id];
    if (!item || "error" in item) return null;
    return item;
  }

  const countRes   = get("count");
  const viewsRes   = get("views");
  const helpfulRes = get("helpful");
  const trendRes   = get("trend");
  const topRes     = get("top");
  const bestRes    = get("best");
  const pubRes     = get("published");

  const trendPoints = trendRes?.result.type === "time_series" ? trendRes.result.points : [];
  const pubPoints   = pubRes?.result.type   === "time_series" ? pubRes.result.points   : [];

  return (
    <div className="space-y-6">
      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Published Articles"
          value={statValue(countRes) ?? "—"}
          sub="Currently published"
        />
        <KpiCard
          title="Total Views"
          value={statValue(viewsRes)?.toLocaleString() ?? "—"}
          sub="All-time across published articles"
        />
        <KpiCard
          title="Helpful Vote Ratio"
          value={statValue(helpfulRes) != null ? fmtPct(statValue(helpfulRes)!) : "—"}
          sub="In selected period"
        />
      </div>

      {/* ── Feedback trend ────────────────────────────────────────────────── */}
      <ChartCard accentColor="bg-cyan-500" title="KB Feedback Trend" description="Daily helpful vs. not-helpful votes">
        {trendPoints.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendPoints}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="helpful"    name="Helpful"     stroke="#22c55e" dot={false} />
              <Line type="monotone" dataKey="notHelpful" name="Not Helpful"  stroke="#ef4444" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-muted-foreground py-4 text-center">No feedback data</p>}
      </ChartCard>

      {/* ── Articles published trend ──────────────────────────────────────── */}
      <ChartCard accentColor="bg-teal-500" title="Articles Published" description="Daily count of newly published articles">
        {pubPoints.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={pubPoints}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="articles" name="Published" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-muted-foreground py-4 text-center">No publish data</p>}
      </ChartCard>

      {/* ── Top articles tables ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard accentColor="bg-blue-500" title="Top Articles by Views" description="Most viewed published articles">
          {topRes?.result.type === "leaderboard" && topRes.result.entries.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Article</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                  <TableHead className="text-right">Helpful</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topRes.result.entries.map(e => (
                  <TableRow key={e.key}>
                    <TableCell className="text-muted-foreground">{e.rank}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{e.label}</TableCell>
                    <TableCell className="text-right">{e.columns.views ?? 0}</TableCell>
                    <TableCell className="text-right">{e.columns.helpful ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <p className="text-sm text-muted-foreground py-4 text-center">No data</p>}
        </ChartCard>

        <ChartCard accentColor="bg-emerald-500" title="Most Helpful Articles" description="Ranked by helpful vote ratio">
          {bestRes?.result.type === "leaderboard" && bestRes.result.entries.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Article</TableHead>
                  <TableHead className="text-right">Helpful %</TableHead>
                  <TableHead className="text-right">Votes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bestRes.result.entries.map(e => (
                  <TableRow key={e.key}>
                    <TableCell className="text-muted-foreground">{e.rank}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{e.label}</TableCell>
                    <TableCell className="text-right">{fmtPct(Number(e.columns.helpfulPct ?? 0))}</TableCell>
                    <TableCell className="text-right">{e.columns.total ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <p className="text-sm text-muted-foreground py-4 text-center">No data</p>}
        </ChartCard>
      </div>

      {/* ── Search analytics ─────────────────────────────────────────────── */}
      {searchStats && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard
              title="Total Searches"
              value={searchStats.totalSearches.toLocaleString()}
              sub="portal KB searches in period"
            />
            <KpiCard
              title="Unique Queries"
              value={searchStats.uniqueQueries.toLocaleString()}
              sub="distinct search terms"
            />
            <KpiCard
              title="Zero-Result Rate"
              value={searchStats.zeroResultRate != null ? fmtPct(searchStats.zeroResultRate) : "—"}
              sub="searches that found nothing"
              variant={
                searchStats.zeroResultRate == null ? "default" :
                searchStats.zeroResultRate <= 15   ? "success" :
                searchStats.zeroResultRate <= 30   ? "warning" : "danger"
              }
            />
          </div>

          
        <ChartCard accentColor="bg-cyan-500"
            title="Top Search Queries"
            description="Most-searched terms in the selected period. High zero-result rate = content gap."
            contentClassName="p-0"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Query</TableHead>
                  <TableHead className="text-right">Searches</TableHead>
                  <TableHead className="text-right">Avg Results</TableHead>
                  <TableHead className="text-right">Zero Results</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {searchStats.topQueries.map((q, i) => (
                  <TableRow key={q.query}>
                    <TableCell className="text-muted-foreground text-xs w-8">{i + 1}</TableCell>
                    <TableCell className="text-sm font-medium">
                      {q.query}
                      {q.zeroResultsCount > 0 && q.avgResultCount < 1 && (
                        <Badge variant="destructive" className="ml-2 text-[10px]">Gap</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{q.count}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {q.avgResultCount.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={q.zeroResultsCount > 0 ? "text-destructive font-medium" : "text-muted-foreground"}>
                        {q.zeroResultsCount}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {searchStats.topQueries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8 text-sm">
                      No search data for this period
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ChartCard>
        </div>
      )}
    </div>
  );
}
