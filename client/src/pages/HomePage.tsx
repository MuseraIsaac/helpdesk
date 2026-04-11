import { useMemo, useState } from "react";
import { Link } from "react-router";
import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorAlert from "@/components/ErrorAlert";
import {
  TicketIcon,
  CircleDot,
  Sparkles,
  TrendingUp,
  Clock,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  RotateCcw,
  Star,
  ThumbsUp,
  ThumbsDown,
  BarChart2,
  Timer,
  Hourglass,
  Info,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function pct(v: number | null | undefined): string {
  return v == null ? "—" : `${v}%`;
}

function formatDate(iso: string, period: number): string {
  const d = new Date(iso + "T00:00:00");
  if (period <= 7) {
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface OverviewStats {
  totalTickets: number;
  openTickets: number;
  resolvedTickets: number;
  closedTickets: number;
  resolvedByAI: number;
  aiResolutionRate: number;
  ticketsWithSlaTarget: number;
  breachedTickets: number;
  slaComplianceRate: number | null;
  escalatedTickets: number;
  reopenedTickets: number;
  avgFirstResponseSeconds: number | null;
  avgResolutionSeconds: number | null;
}

interface VolumeData {
  data: { date: string; tickets: number }[];
}

interface CategoryBreakdown {
  category: string | null;
  label: string;
  total: number;
  open: number;
}

interface PriorityBreakdown {
  priority: string | null;
  label: string;
  total: number;
  open: number;
}

interface AssigneeBreakdown {
  agentId: string;
  agentName: string;
  total: number;
  open: number;
  resolved: number;
}

interface Breakdowns {
  byCategory: CategoryBreakdown[];
  byPriority: PriorityBreakdown[];
  byAssignee: AssigneeBreakdown[];
}

interface AgingBucket {
  bucket: string;
  count: number;
  sort: number;
}

interface CsatSummary {
  totalRatings: number;
  avgRating: number | null;
  positiveRate: number | null;
  negativeRate: number | null;
  responseRate: number;
  distribution: Record<number, number>;
  recentRatings: {
    id: number;
    ticketId: number;
    ticketSubject: string;
    rating: number;
    comment: string | null;
    submittedAt: string;
  }[];
}

// ── Chart configs ─────────────────────────────────────────────────────────────

const volumeChartConfig = {
  tickets: { label: "Tickets", color: "var(--primary)" },
} satisfies ChartConfig;

const barChartConfig = {
  total: { label: "Total", color: "var(--primary)" },
} satisfies ChartConfig;

const agingChartConfig = {
  count: { label: "Open tickets", color: "var(--primary)" },
} satisfies ChartConfig;

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "hsl(var(--destructive))",
  high:   "#f97316",
  medium: "#eab308",
  low:    "#22c55e",
};

// Aging bucket → urgency color (sort 1 = fresh → 4 = stale)
const AGING_COLORS: Record<number, string> = {
  1: "#22c55e",
  2: "#eab308",
  3: "#f97316",
  4: "hsl(var(--destructive))",
};

// ── Sub-components ────────────────────────────────────────────────────────────

type Variant = "default" | "good" | "warn" | "bad";

interface MetricCardProps {
  title: string;
  value: string | number | undefined;
  icon: React.ElementType;
  hint?: string;
  loading?: boolean;
  variant?: Variant;
}

function MetricCard({ title, value, icon: Icon, hint, loading, variant = "default" }: MetricCardProps) {
  const valueColor =
    variant === "good" ? "text-green-600 dark:text-green-400" :
    variant === "warn" ? "text-amber-500" :
    variant === "bad"  ? "text-destructive" :
    "text-foreground";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-[13px] font-medium text-muted-foreground leading-tight">
            {title}
          </CardTitle>
          <div className="flex items-center gap-1 shrink-0">
            {hint && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground/50 cursor-default" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px] text-xs">
                    {hint}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-9 w-20" />
        ) : (
          <p className={`text-3xl font-semibold tracking-tight ${valueColor}`}>
            {value ?? "—"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
      {children}
    </h2>
  );
}

function HorizontalBarChart({
  data,
  dataKey,
  labelKey,
  config,
  colorKey,
  sortKey,
  colorMap,
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  labelKey: string;
  config: ChartConfig;
  colorKey?: string;
  sortKey?: string;
  colorMap?: Record<string | number, string>;
}) {
  if (!data.length) {
    return <p className="text-sm text-muted-foreground py-6 text-center">No data</p>;
  }
  return (
    <ChartContainer config={config} className="h-[220px] w-full">
      <BarChart layout="vertical" data={data} margin={{ left: 0, right: 28, top: 4, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey={labelKey}
          width={110}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12 }}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey={dataKey} radius={[0, 4, 4, 0]}>
          {data.map((entry, i) => {
            let fill = "var(--primary)";
            if (colorMap && colorKey) {
              fill = colorMap[entry[colorKey] as string | number] ?? "var(--primary)";
            } else if (colorMap && sortKey) {
              fill = colorMap[entry[sortKey] as string | number] ?? "var(--primary)";
            } else if (colorKey) {
              fill = PRIORITY_COLORS[entry[colorKey] as string] ?? "var(--primary)";
            }
            return <Cell key={i} fill={fill} />;
          })}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

function StarRow({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5 shrink-0">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3 w-3 ${
            n <= rating
              ? "fill-yellow-400 text-yellow-400"
              : "fill-none text-muted-foreground/30"
          }`}
        />
      ))}
    </span>
  );
}

/** Mini rating distribution: shows proportional bars for each star level. */
function RatingDistribution({ distribution, total }: { distribution: Record<number, number>; total: number }) {
  if (total === 0) return null;
  return (
    <div className="space-y-1.5">
      {[5, 4, 3, 2, 1].map((star) => {
        const count = distribution[star] ?? 0;
        const pctVal = Math.round((count / total) * 100);
        return (
          <div key={star} className="flex items-center gap-2">
            <span className="flex items-center gap-0.5 w-14 shrink-0">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span className="text-xs text-muted-foreground">{star}</span>
            </span>
            <Progress value={pctVal} className="h-2 flex-1" />
            <span className="text-xs text-muted-foreground w-8 text-right">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Period selector ───────────────────────────────────────────────────────────

type Period = 7 | 30 | 90;

function PeriodSelector({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border p-0.5 bg-muted/50">
      {([7, 30, 90] as Period[]).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`text-[13px] font-medium px-3 py-1 rounded-md transition-all ${
            value === p
              ? "bg-background shadow text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {p}d
        </button>
      ))}
    </div>
  );
}

// ── HomePage ──────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [period, setPeriod] = useState<Period>(30);

  const from = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - (period - 1));
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }, [period]);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: overview, isLoading: overviewLoading, error: overviewError } =
    useQuery<OverviewStats>({
      queryKey: ["reports-overview", period],
      queryFn: async () => (await axios.get(`/api/reports/overview?from=${from}`)).data,
    });

  const { data: volume, isLoading: volumeLoading, error: volumeError } =
    useQuery<VolumeData>({
      queryKey: ["reports-volume", period],
      queryFn: async () => (await axios.get(`/api/reports/volume?period=${period}`)).data,
    });

  const { data: breakdowns, isLoading: breakdownsLoading } =
    useQuery<Breakdowns>({
      queryKey: ["reports-breakdowns", period],
      queryFn: async () => (await axios.get(`/api/reports/breakdowns?from=${from}`)).data,
    });

  const { data: agingData, isLoading: agingLoading } =
    useQuery<{ aging: AgingBucket[] }>({
      queryKey: ["reports-aging"],
      queryFn: async () => (await axios.get("/api/reports/aging")).data,
    });

  const { data: csat, isLoading: csatLoading } =
    useQuery<CsatSummary>({
      queryKey: ["csat-summary"],
      queryFn: async () => (await axios.get("/api/csat/summary")).data,
    });

  // ── Derived variants ─────────────────────────────────────────────────────────

  const slaVariant: Variant =
    overview?.slaComplianceRate == null ? "default" :
    overview.slaComplianceRate >= 90 ? "good" :
    overview.slaComplianceRate >= 70 ? "warn" : "bad";

  const csatAvgVariant: Variant =
    csat?.avgRating == null ? "default" :
    csat.avgRating >= 4 ? "good" :
    csat.avgRating >= 3 ? "warn" : "bad";

  const csatPositiveVariant: Variant =
    csat?.positiveRate == null ? "default" :
    csat.positiveRate >= 70 ? "good" :
    csat.positiveRate >= 50 ? "warn" : "bad";

  const csatNegativeVariant: Variant =
    csat?.negativeRate == null ? "default" :
    csat.negativeRate <= 10 ? "good" :
    csat.negativeRate <= 25 ? "warn" : "bad";

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Showing data for the last {period} days
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {overviewError && (
        <ErrorAlert error={overviewError} fallback="Failed to load overview stats" />
      )}

      {/* ── Volume ───────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading>Volume</SectionHeading>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
          <MetricCard
            title="Total Tickets"
            value={overview?.totalTickets}
            icon={TicketIcon}
            loading={overviewLoading}
            hint="All non-system tickets (open, resolved, closed) in the selected period."
          />
          <MetricCard
            title="Open Tickets"
            value={overview?.openTickets}
            icon={CircleDot}
            loading={overviewLoading}
            hint="Tickets currently awaiting agent response."
          />
          <MetricCard
            title="Resolved"
            value={overview?.resolvedTickets}
            icon={TrendingUp}
            loading={overviewLoading}
            hint="Tickets marked resolved or closed."
          />
          <MetricCard
            title="Escalated"
            value={overview?.escalatedTickets}
            icon={AlertTriangle}
            loading={overviewLoading}
            variant={overview?.escalatedTickets ? "warn" : "default"}
            hint="Tickets that were escalated at any point."
          />
          <MetricCard
            title="Reopened"
            value={overview?.reopenedTickets}
            icon={RotateCcw}
            loading={overviewLoading}
            variant={overview?.reopenedTickets ? "warn" : "default"}
            hint="Resolved tickets that received a new customer reply and returned to open."
          />
        </div>
      </section>

      {/* ── Performance ──────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading>Performance</SectionHeading>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
          <MetricCard
            title="Avg First Response"
            value={formatDuration(overview?.avgFirstResponseSeconds)}
            icon={Timer}
            loading={overviewLoading}
            hint="Average time from ticket creation to the first agent reply."
          />
          <MetricCard
            title="Avg Resolution Time"
            value={formatDuration(overview?.avgResolutionSeconds)}
            icon={Hourglass}
            loading={overviewLoading}
            hint="Average time from creation to resolution, for resolved/closed tickets."
          />
          <MetricCard
            title="AI Resolution Rate"
            value={overview ? `${overview.aiResolutionRate}%` : undefined}
            icon={Sparkles}
            loading={overviewLoading}
            hint="Percentage of resolved tickets handled entirely by the AI agent."
          />
          <MetricCard
            title="SLA Compliance"
            value={pct(overview?.slaComplianceRate)}
            icon={ShieldCheck}
            loading={overviewLoading}
            variant={slaVariant}
            hint="Percentage of SLA-tracked tickets resolved within deadline."
          />
          <MetricCard
            title="SLA Breached"
            value={overview?.breachedTickets}
            icon={ShieldAlert}
            loading={overviewLoading}
            variant={overview?.breachedTickets ? "bad" : "default"}
            hint="Tickets that exceeded their SLA resolution deadline."
          />
        </div>
      </section>

      {/* ── Volume chart ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Tickets Per Day</CardTitle>
          <CardDescription>Last {period} days</CardDescription>
        </CardHeader>
        <CardContent>
          {volumeError ? (
            <ErrorAlert error={volumeError} fallback="Failed to load chart data" />
          ) : volumeLoading ? (
            <Skeleton className="h-[240px] w-full" />
          ) : (
            <ChartContainer config={volumeChartConfig} className="h-[240px] w-full">
              <BarChart accessibilityLayer data={volume?.data}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(v: string) => formatDate(v, period)}
                  interval="preserveStartEnd"
                  minTickGap={40}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(v: string) =>
                        new Date(v + "T00:00:00").toLocaleDateString("en-US", {
                          weekday: "long",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      }
                    />
                  }
                />
                <Bar dataKey="tickets" fill="var(--color-tickets)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Breakdowns ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">By Category</CardTitle>
            <CardDescription>Ticket distribution · {period}d</CardDescription>
          </CardHeader>
          <CardContent>
            {breakdownsLoading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : (
              <HorizontalBarChart
                data={breakdowns?.byCategory ?? []}
                dataKey="total"
                labelKey="label"
                config={barChartConfig}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">By Priority</CardTitle>
            <CardDescription>Ticket distribution · {period}d</CardDescription>
          </CardHeader>
          <CardContent>
            {breakdownsLoading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : (
              <HorizontalBarChart
                data={breakdowns?.byPriority ?? []}
                dataKey="total"
                labelKey="label"
                config={barChartConfig}
                colorKey="priority"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Ticket Aging</CardTitle>
            <CardDescription>Currently open tickets by age</CardDescription>
          </CardHeader>
          <CardContent>
            {agingLoading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : (
              <HorizontalBarChart
                data={agingData?.aging ?? []}
                dataKey="count"
                labelKey="bucket"
                config={agingChartConfig}
                sortKey="sort"
                colorMap={AGING_COLORS}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── By Assignee ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>By Assignee</CardTitle>
          <CardDescription>Ticket load per agent · {period}d</CardDescription>
        </CardHeader>
        <CardContent>
          {breakdownsLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          ) : !breakdowns?.byAssignee.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No assigned tickets in this period
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                  <TableHead className="text-right">Resolved</TableHead>
                  <TableHead className="w-[140px]">Open %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breakdowns.byAssignee.map((a) => {
                  const openPct = a.total > 0 ? Math.round((a.open / a.total) * 100) : 0;
                  return (
                    <TableRow key={a.agentId}>
                      <TableCell className="font-medium">{a.agentName}</TableCell>
                      <TableCell className="text-right">{a.total}</TableCell>
                      <TableCell className="text-right">{a.open}</TableCell>
                      <TableCell className="text-right">{a.resolved}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={openPct} className="h-1.5 flex-1" />
                          <span className="text-xs text-muted-foreground w-8 text-right">
                            {a.total > 0 ? `${openPct}%` : "—"}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Customer Satisfaction ────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading>Customer Satisfaction</SectionHeading>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Avg Rating"
            value={csat?.avgRating != null ? `${csat.avgRating} / 5` : "—"}
            icon={Star}
            loading={csatLoading}
            variant={csatAvgVariant}
            hint="Average CSAT score across all submitted ratings."
          />
          <MetricCard
            title="Positive Rate"
            value={pct(csat?.positiveRate)}
            icon={ThumbsUp}
            loading={csatLoading}
            variant={csatPositiveVariant}
            hint="Percentage of ratings that were 4★ or 5★."
          />
          <MetricCard
            title="Negative Rate"
            value={pct(csat?.negativeRate)}
            icon={ThumbsDown}
            loading={csatLoading}
            variant={csatNegativeVariant}
            hint="Percentage of ratings that were 1★ or 2★."
          />
          <MetricCard
            title="Response Rate"
            value={csat != null ? `${csat.responseRate}%` : "—"}
            icon={BarChart2}
            loading={csatLoading}
            hint="Percentage of resolved/closed tickets that received a CSAT rating."
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Rating Distribution</CardTitle>
              <CardDescription>
                {csat?.totalRatings
                  ? `${csat.totalRatings} rating${csat.totalRatings === 1 ? "" : "s"} total`
                  : "No ratings yet"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {csatLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
                </div>
              ) : !csat?.totalRatings ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No CSAT ratings yet.
                </p>
              ) : (
                <RatingDistribution
                  distribution={csat.distribution}
                  total={csat.totalRatings}
                />
              )}
            </CardContent>
          </Card>

          {/* Recent ratings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Recent Ratings</CardTitle>
              <CardDescription>Last 10 submissions</CardDescription>
            </CardHeader>
            <CardContent>
              {csatLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : !csat?.recentRatings.length ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No CSAT ratings have been submitted yet.
                </p>
              ) : (
                <div className="divide-y">
                  {csat.recentRatings.map((r) => (
                    <div key={r.id} className="py-3 flex items-start gap-3">
                      <StarRow rating={r.rating} />
                      <div className="flex-1 min-w-0">
                        <Link
                          to={`/tickets/${r.ticketId}`}
                          className="text-sm font-medium hover:underline truncate block"
                        >
                          #{r.ticketId} — {r.ticketSubject}
                        </Link>
                        {r.comment && (
                          <p className="text-xs text-muted-foreground mt-0.5 italic line-clamp-1">
                            "{r.comment}"
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(r.submittedAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
