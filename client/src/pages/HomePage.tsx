import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  XAxis,
  YAxis,
  ReferenceLine,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import ErrorAlert from "@/components/ErrorAlert";
import DashboardCustomizer from "@/components/DashboardCustomizer";
import { useDashboardConfig } from "@/hooks/useDashboardConfig";
import { type WidgetId } from "core/schemas/dashboard.ts";
import { ticketsUrl } from "@/lib/drill-down";
import {
  TicketIcon,
  CircleDot,
  Sparkles,
  TrendingUp,
  TrendingDown,
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
  Settings2,
  Siren,
  PackageCheck,
  GitBranch,
  CheckSquare,
  Users,
  Repeat2,
  ClipboardList,
} from "lucide-react";

// ── Density context ───────────────────────────────────────────────────────────
// Allows sub-components to read the current layout density without prop drilling.

type Density = "comfortable" | "compact";
const DensityContext = createContext<Density>("comfortable");
const useDensity = () => useContext(DensityContext);

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

interface SlaDimEntry {
  key: string;
  label: string;
  totalWithSla: number;
  breached: number;
  compliance: number | null;
}
interface SlaDimData {
  byPriority: SlaDimEntry[];
  byCategory: SlaDimEntry[];
  byTeam:     SlaDimEntry[];
}

interface IncidentStats {
  total: number;
  majorCount: number;
  slaBreached: number;
  mtta: number | null;
  mttr: number | null;
  byStatus:   { status: string; count: number }[];
  byPriority: { priority: string; count: number }[];
  volume:     { date: string; count: number }[];
}

interface RequestStats {
  total: number;
  slaBreached: number;
  avgFulfillmentSeconds: number | null;
  slaCompliance: number | null;
  byStatus: { status: string; count: number }[];
  topItems: { name: string; count: number; avgSeconds: number | null }[];
}

interface ProblemStats {
  total: number;
  knownErrors: number;
  withIncidents: number;
  recurring: number;
  avgResolutionDays: number | null;
  byStatus: { status: string; count: number }[];
}

interface ApprovalStats {
  total: number;
  avgTurnaroundSeconds: number | null;
  byStatus: { status: string; count: number }[];
  oldestPending: { id: number; title: string; subjectType: string; createdAt: string; daysOpen: number }[];
}

interface CsatTrendPoint { date: string; avgRating: number | null; count: number; }

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

const AGING_COLORS: Record<number, string> = {
  1: "#22c55e",
  2: "#eab308",
  3: "#f97316",
  4: "hsl(var(--destructive))",
};

const incidentChartConfig = {
  count: { label: "Incidents", color: "var(--primary)" },
} satisfies ChartConfig;

const csatTrendChartConfig = {
  avgRating: { label: "Avg Rating", color: "var(--primary)" },
} satisfies ChartConfig;

const INCIDENT_PRIORITY_COLORS: Record<string, string> = {
  p1: "hsl(var(--destructive))",
  p2: "#f97316",
  p3: "#eab308",
  p4: "#22c55e",
};

const INCIDENT_STATUS_COLORS: Record<string, string> = {
  new:          "hsl(var(--muted))",
  acknowledged: "#3b82f6",
  in_progress:  "#8b5cf6",
  resolved:     "#22c55e",
  closed:       "hsl(var(--muted))",
};

/** Compact compliance badge coloring */
function complianceVariant(v: number | null): Variant {
  if (v == null) return "default";
  return v >= 90 ? "good" : v >= 70 ? "warn" : "bad";
}

// ── Sub-components ────────────────────────────────────────────────────────────

type Variant = "default" | "good" | "warn" | "bad";

interface MetricCardProps {
  title: string;
  value: string | number | undefined;
  icon: React.ElementType;
  hint?: string;
  loading?: boolean;
  variant?: Variant;
  href?: string;
}

function MetricCard({ title, value, icon: Icon, hint, loading, variant = "default", href }: MetricCardProps) {
  const density = useDensity();
  const valueColor =
    variant === "good" ? "text-green-600 dark:text-green-400" :
    variant === "warn" ? "text-amber-500" :
    variant === "bad"  ? "text-destructive" :
    "text-foreground";

  const card = (
    <Card className={href ? "hover:bg-accent/50 transition-colors" : ""}>
      <CardHeader className={density === "compact" ? "pb-1" : "pb-2"}>
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
          <p className={`font-semibold tracking-tight ${valueColor} ${
            density === "compact" ? "text-2xl" : "text-3xl"
          }`}>
            {value ?? "—"}
          </p>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link to={href} className="block cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
        {card}
      </Link>
    );
  }
  return card;
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
  onBarClick,
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  labelKey: string;
  config: ChartConfig;
  colorKey?: string;
  sortKey?: string;
  colorMap?: Record<string | number, string>;
  onBarClick?: (entry: Record<string, unknown>) => void;
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
        <Bar
          dataKey={dataKey}
          radius={[0, 4, 4, 0]}
          style={{ cursor: onBarClick ? "pointer" : undefined }}
          onClick={onBarClick ? (entry) => onBarClick(entry as Record<string, unknown>) : undefined}
        >
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
  const navigate = useNavigate();

  // ── Dashboard config ─────────────────────────────────────────────────────────

  const {
    activeConfig,
    activeDashboard,
    dashboardList,
    saveDashboard,
    setDefaultDashboard,
    deleteDashboard,
  } = useDashboardConfig();

  const [customizerOpen, setCustomizerOpen] = useState(false);

  // Period: initialize once from saved config when it first loads.
  // After that, local changes are reflected immediately without auto-saving.
  const [period, setPeriod] = useState<Period>(30);
  const periodInitRef = useRef(false);
  useEffect(() => {
    if (!periodInitRef.current && activeConfig) {
      periodInitRef.current = true;
      setPeriod(activeConfig.period as Period);
    }
  }, [activeConfig]);

  const density = activeConfig.density;

  // Ordered visible widgets for rendering
  const orderedWidgets = useMemo(
    () =>
      [...activeConfig.widgets]
        .sort((a, b) => a.order - b.order)
        .filter(w => w.visible),
    [activeConfig],
  );

  // ── Queries ──────────────────────────────────────────────────────────────────

  const from = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - (period - 1));
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }, [period]);

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

  const { data: slaDim, isLoading: slaDimLoading } =
    useQuery<SlaDimData>({
      queryKey: ["reports-sla-dim", period],
      queryFn: async () => (await axios.get(`/api/reports/sla-by-dimension?from=${from}`)).data,
    });

  const { data: incidents, isLoading: incidentsLoading } =
    useQuery<IncidentStats>({
      queryKey: ["reports-incidents", period],
      queryFn: async () => (await axios.get(`/api/reports/incidents?period=${period}`)).data,
    });

  const { data: requests, isLoading: requestsLoading } =
    useQuery<RequestStats>({
      queryKey: ["reports-requests", period],
      queryFn: async () => (await axios.get(`/api/reports/requests?period=${period}`)).data,
    });

  const { data: problems, isLoading: problemsLoading } =
    useQuery<ProblemStats>({
      queryKey: ["reports-problems", period],
      queryFn: async () => (await axios.get(`/api/reports/problems?period=${period}`)).data,
    });

  const { data: approvals, isLoading: approvalsLoading } =
    useQuery<ApprovalStats>({
      queryKey: ["reports-approvals", period],
      queryFn: async () => (await axios.get(`/api/reports/approvals?period=${period}`)).data,
    });

  const { data: csatTrend, isLoading: csatTrendLoading } =
    useQuery<{ data: CsatTrendPoint[] }>({
      queryKey: ["reports-csat-trend", period],
      queryFn: async () => (await axios.get(`/api/reports/csat-trend?period=${period}`)).data,
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

  // ── Chart click handlers ──────────────────────────────────────────────────────

  function handleCategoryBarClick(entry: Record<string, unknown>) {
    const category = entry.category as string | null;
    if (category) navigate(ticketsUrl({ category }));
  }

  function handlePriorityBarClick(entry: Record<string, unknown>) {
    const priority = entry.priority as string | null;
    if (priority) navigate(ticketsUrl({ priority }));
  }

  // ── Customizer handlers ───────────────────────────────────────────────────────

  function handleSaveConfig(config: typeof activeConfig, name: string) {
    // Fold the current live period into the saved config
    saveDashboard.mutate(
      { dashboardId: activeDashboard?.id ?? null, name, config: { ...config, period } },
      { onSuccess: () => setCustomizerOpen(false) },
    );
  }

  // ── Widget renderer ───────────────────────────────────────────────────────────
  // Each widget is a named section rendered as a closure over the query data.

  function renderWidget(id: WidgetId): React.ReactNode {
    switch (id) {
      // ── Volume ──────────────────────────────────────────────────────────────
      case "volume":
        return (
          <section key="volume" className="space-y-3">
            <SectionHeading>Volume</SectionHeading>
            <div className={`grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 ${density === "compact" ? "gap-2" : "gap-4"}`}>
              <MetricCard title="Total Tickets"   value={overview?.totalTickets}    icon={TicketIcon}    loading={overviewLoading} hint="All non-system tickets in the selected period." href={ticketsUrl()} />
              <MetricCard title="Open Tickets"    value={overview?.openTickets}     icon={CircleDot}     loading={overviewLoading} hint="Tickets currently awaiting agent response." href={ticketsUrl({ status: "open" })} />
              <MetricCard title="Resolved"         value={overview?.resolvedTickets} icon={TrendingUp}    loading={overviewLoading} hint="Tickets marked resolved or closed." href={ticketsUrl({ status: "resolved" })} />
              <MetricCard title="Escalated"        value={overview?.escalatedTickets} icon={AlertTriangle} loading={overviewLoading} variant={overview?.escalatedTickets ? "warn" : "default"} hint="Tickets that were escalated at any point." href={ticketsUrl({ escalated: true })} />
              <MetricCard title="Reopened"         value={overview?.reopenedTickets} icon={RotateCcw}     loading={overviewLoading} variant={overview?.reopenedTickets ? "warn" : "default"} hint="Resolved tickets that received a new reply and returned to open." href={ticketsUrl({ status: "open" })} />
            </div>
          </section>
        );

      // ── Performance ─────────────────────────────────────────────────────────
      case "performance":
        return (
          <section key="performance" className="space-y-3">
            <SectionHeading>Performance (MTTA / MTTR)</SectionHeading>
            <div className={`grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 ${density === "compact" ? "gap-2" : "gap-4"}`}>
              <MetricCard title="MTTA" value={formatDuration(overview?.avgFirstResponseSeconds)} icon={Timer}       loading={overviewLoading} hint="Mean Time To Acknowledge — average time from ticket creation to first agent reply. Lower is better." href={ticketsUrl({ status: "open" })} />
              <MetricCard title="MTTR" value={formatDuration(overview?.avgResolutionSeconds)}    icon={Hourglass}   loading={overviewLoading} hint="Mean Time To Resolve — average time from creation to resolution. Core ITSM efficiency metric." href={ticketsUrl({ status: "open" })} />
              <MetricCard title="AI Resolution Rate"  value={overview ? `${overview.aiResolutionRate}%` : undefined} icon={Sparkles} loading={overviewLoading} hint="Percentage of resolved tickets handled entirely by the AI agent." href={ticketsUrl({ status: "resolved" })} />
              <MetricCard title="SLA Compliance"      value={pct(overview?.slaComplianceRate)} icon={ShieldCheck} loading={overviewLoading} variant={slaVariant} hint="Percentage of SLA-tracked tickets resolved within deadline." href={ticketsUrl({ view: "overdue" })} />
              <MetricCard title="SLA Breached"        value={overview?.breachedTickets} icon={ShieldAlert} loading={overviewLoading} variant={overview?.breachedTickets ? "bad" : "default"} hint="Tickets that exceeded their SLA resolution deadline." href={ticketsUrl({ view: "overdue" })} />
            </div>
          </section>
        );

      // ── Tickets Per Day ──────────────────────────────────────────────────────
      case "tickets_per_day":
        return (
          <Card key="tickets_per_day">
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
                              weekday: "long", month: "short", day: "numeric", year: "numeric",
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
        );

      // ── Breakdowns ───────────────────────────────────────────────────────────
      case "breakdowns":
        return (
          <div key="breakdowns" className={`grid grid-cols-1 lg:grid-cols-3 ${density === "compact" ? "gap-2" : "gap-4"}`}>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">By Category</CardTitle>
                <CardDescription>Ticket distribution · {period}d · click a bar to filter</CardDescription>
              </CardHeader>
              <CardContent>
                {breakdownsLoading ? <Skeleton className="h-[220px] w-full" /> : (
                  <HorizontalBarChart data={breakdowns?.byCategory ?? []} dataKey="total" labelKey="label" config={barChartConfig} onBarClick={handleCategoryBarClick} />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">By Priority</CardTitle>
                <CardDescription>Ticket distribution · {period}d · click a bar to filter</CardDescription>
              </CardHeader>
              <CardContent>
                {breakdownsLoading ? <Skeleton className="h-[220px] w-full" /> : (
                  <HorizontalBarChart data={breakdowns?.byPriority ?? []} dataKey="total" labelKey="label" config={barChartConfig} colorKey="priority" onBarClick={handlePriorityBarClick} />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Ticket Aging</CardTitle>
                <CardDescription>Currently open tickets by age · click to view</CardDescription>
              </CardHeader>
              <CardContent>
                {agingLoading ? <Skeleton className="h-[220px] w-full" /> : (
                  <HorizontalBarChart data={agingData?.aging ?? []} dataKey="count" labelKey="bucket" config={agingChartConfig} sortKey="sort" colorMap={AGING_COLORS} onBarClick={() => navigate(ticketsUrl({ status: "open" }))} />
                )}
              </CardContent>
            </Card>
          </div>
        );

      // ── By Assignee ──────────────────────────────────────────────────────────
      case "by_assignee":
        return (
          <Card key="by_assignee">
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
                <p className="text-sm text-muted-foreground py-4 text-center">No assigned tickets in this period</p>
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
        );

      // ── CSAT ─────────────────────────────────────────────────────────────────
      case "csat":
        return (
          <section key="csat" className="space-y-4">
            <SectionHeading>Customer Satisfaction</SectionHeading>
            <div className={`grid grid-cols-2 lg:grid-cols-4 ${density === "compact" ? "gap-2" : "gap-4"}`}>
              <MetricCard title="Avg Rating"    value={csat?.avgRating != null ? `${csat.avgRating} / 5` : "—"} icon={Star}      loading={csatLoading} variant={csatAvgVariant}      hint="Average CSAT score across all submitted ratings." />
              <MetricCard title="Positive Rate" value={pct(csat?.positiveRate)}                                icon={ThumbsUp}   loading={csatLoading} variant={csatPositiveVariant} hint="Percentage of ratings that were 4★ or 5★." />
              <MetricCard title="Negative Rate" value={pct(csat?.negativeRate)}                                icon={ThumbsDown} loading={csatLoading} variant={csatNegativeVariant} hint="Percentage of ratings that were 1★ or 2★." />
              <MetricCard title="Response Rate" value={csat != null ? `${csat.responseRate}%` : "—"}          icon={BarChart2}  loading={csatLoading} hint="Percentage of resolved/closed tickets that received a rating." />
            </div>
            <div className={`grid grid-cols-1 lg:grid-cols-2 ${density === "compact" ? "gap-2" : "gap-4"}`}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Rating Distribution</CardTitle>
                  <CardDescription>{csat?.totalRatings ? `${csat.totalRatings} rating${csat.totalRatings === 1 ? "" : "s"} total` : "No ratings yet"}</CardDescription>
                </CardHeader>
                <CardContent>
                  {csatLoading ? (
                    <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
                  ) : !csat?.totalRatings ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No CSAT ratings yet.</p>
                  ) : (
                    <RatingDistribution distribution={csat.distribution} total={csat.totalRatings} />
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Recent Ratings</CardTitle>
                  <CardDescription>Last 10 submissions</CardDescription>
                </CardHeader>
                <CardContent>
                  {csatLoading ? (
                    <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                  ) : !csat?.recentRatings.length ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No CSAT ratings have been submitted yet.</p>
                  ) : (
                    <div className="divide-y">
                      {csat.recentRatings.map((r) => (
                        <div key={r.id} className="py-3 flex items-start gap-3">
                          <StarRow rating={r.rating} />
                          <div className="flex-1 min-w-0">
                            <Link to={`/tickets/${r.ticketId}`} className="text-sm font-medium hover:underline truncate block">
                              #{r.ticketId} — {r.ticketSubject}
                            </Link>
                            {r.comment && (
                              <p className="text-xs text-muted-foreground mt-0.5 italic line-clamp-1">"{r.comment}"</p>
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
        );

      // ── SLA by Dimension ─────────────────────────────────────────────────────
      case "sla_by_dimension": {
        const fmtRow = (rows: SlaDimEntry[]) =>
          rows.filter(r => r.totalWithSla > 0).map(r => ({
            ...r,
            compliancePct: r.compliance ?? 0,
          }));

        const SlaDimTable = ({ rows }: { rows: SlaDimEntry[] }) => {
          const filtered = fmtRow(rows);
          if (!filtered.length) return <p className="text-sm text-muted-foreground py-4 text-center">No SLA-tracked data</p>;
          return (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dimension</TableHead>
                  <TableHead className="text-right">SLA Total</TableHead>
                  <TableHead className="text-right">Breached</TableHead>
                  <TableHead className="text-right">Compliance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => {
                  const v = complianceVariant(r.compliance);
                  const cls = v === "good" ? "text-green-600 dark:text-green-400 font-semibold" : v === "warn" ? "text-amber-500 font-semibold" : v === "bad" ? "text-destructive font-semibold" : "";
                  return (
                    <TableRow key={r.key}>
                      <TableCell className="font-medium">{r.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.totalWithSla}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.breached}</TableCell>
                      <TableCell className={`text-right tabular-nums ${cls}`}>{r.compliance != null ? `${r.compliance}%` : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          );
        };

        return (
          <Card key="sla_by_dimension">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> SLA Compliance by Dimension</CardTitle>
              <CardDescription>Ticket SLA compliance broken down by priority, category, and team · {period}d</CardDescription>
            </CardHeader>
            <CardContent>
              {slaDimLoading ? (
                <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
              ) : (
                <Tabs defaultValue="priority">
                  <TabsList className="mb-4">
                    <TabsTrigger value="priority">By Priority</TabsTrigger>
                    <TabsTrigger value="category">By Category</TabsTrigger>
                    <TabsTrigger value="team">By Team</TabsTrigger>
                  </TabsList>
                  <TabsContent value="priority"><SlaDimTable rows={slaDim?.byPriority ?? []} /></TabsContent>
                  <TabsContent value="category"><SlaDimTable rows={slaDim?.byCategory ?? []} /></TabsContent>
                  <TabsContent value="team"><SlaDimTable rows={slaDim?.byTeam ?? []} /></TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        );
      }

      // ── Incident Analytics ────────────────────────────────────────────────────
      case "incident_analytics":
        return (
          <section key="incident_analytics" className="space-y-4">
            <SectionHeading>Incident Analytics</SectionHeading>
            <div className={`grid grid-cols-2 sm:grid-cols-4 ${density === "compact" ? "gap-2" : "gap-4"}`}>
              <MetricCard title="Total Incidents" value={incidents?.total}     icon={Siren}      loading={incidentsLoading} hint="All incidents in the selected period." href="/incidents" />
              <MetricCard title="Major Incidents" value={incidents?.majorCount} icon={AlertTriangle} loading={incidentsLoading} variant={incidents?.majorCount ? "bad" : "default"} hint="Incidents flagged as major (war-room severity)." href="/incidents" />
              <MetricCard title="MTTA (Incidents)" value={formatDuration(incidents?.mtta)} icon={Timer}  loading={incidentsLoading} hint="Mean Time To Acknowledge — average time from incident creation to acknowledgement." />
              <MetricCard title="MTTR (Incidents)" value={formatDuration(incidents?.mttr)} icon={Hourglass} loading={incidentsLoading} hint="Mean Time To Resolve — average time from incident creation to resolution." />
            </div>
            <div className={`grid grid-cols-1 lg:grid-cols-2 ${density === "compact" ? "gap-2" : "gap-4"}`}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Incident Volume</CardTitle>
                  <CardDescription>Daily count · {period}d</CardDescription>
                </CardHeader>
                <CardContent>
                  {incidentsLoading ? <Skeleton className="h-[180px] w-full" /> : (
                    <ChartContainer config={incidentChartConfig} className="h-[180px] w-full">
                      <BarChart data={incidents?.volume ?? []}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={(v: string) => formatDate(v, period)} interval="preserveStartEnd" minTickGap={40} />
                        <ChartTooltip content={<ChartTooltipContent labelFormatter={(v: string) => new Date(v + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} />} />
                        <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">By Status &amp; Priority</CardTitle>
                  <CardDescription>Current breakdown</CardDescription>
                </CardHeader>
                <CardContent>
                  {incidentsLoading ? (
                    <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Status</p>
                        <div className="space-y-1.5">
                          {(incidents?.byStatus ?? []).map(s => (
                            <div key={s.status} className="flex items-center justify-between text-sm gap-2">
                              <span className="capitalize text-muted-foreground">{s.status.replace("_", " ")}</span>
                              <span className="font-semibold tabular-nums">{s.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Priority</p>
                        <div className="space-y-1.5">
                          {(incidents?.byPriority ?? []).map(p => (
                            <div key={p.priority} className="flex items-center justify-between text-sm gap-2">
                              <span className="font-medium uppercase" style={{ color: INCIDENT_PRIORITY_COLORS[p.priority] ?? "var(--foreground)" }}>{p.priority}</span>
                              <span className="font-semibold tabular-nums">{p.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>
        );

      // ── Request Fulfillment ───────────────────────────────────────────────────
      case "request_fulfillment":
        return (
          <section key="request_fulfillment" className="space-y-4">
            <SectionHeading>Request Fulfillment</SectionHeading>
            <div className={`grid grid-cols-2 sm:grid-cols-4 ${density === "compact" ? "gap-2" : "gap-4"}`}>
              <MetricCard title="Total Requests"       value={requests?.total}                                   icon={PackageCheck}  loading={requestsLoading} href="/requests" />
              <MetricCard title="Avg Fulfillment Time" value={formatDuration(requests?.avgFulfillmentSeconds)}   icon={Hourglass}     loading={requestsLoading} hint="Average time from request submission to fulfilment (closed/resolved)." />
              <MetricCard title="SLA Compliance"       value={pct(requests?.slaCompliance)}                      icon={ShieldCheck}   loading={requestsLoading} variant={complianceVariant(requests?.slaCompliance ?? null)} hint="Percentage of SLA-tracked requests fulfilled within target." />
              <MetricCard title="SLA Breached"         value={requests?.slaBreached}                             icon={ShieldAlert}   loading={requestsLoading} variant={requests?.slaBreached ? "bad" : "default"} />
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Top Catalog Items</CardTitle>
                <CardDescription>Most requested · {period}d · avg fulfillment time per item</CardDescription>
              </CardHeader>
              <CardContent>
                {requestsLoading ? (
                  <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
                ) : !(requests?.topItems.length) ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No requests in this period.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Catalog Item</TableHead>
                        <TableHead className="text-right">Requests</TableHead>
                        <TableHead className="text-right">Avg Fulfillment</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requests.topItems.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{item.count}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{formatDuration(item.avgSeconds)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </section>
        );

      // ── Problem Recurrence ────────────────────────────────────────────────────
      case "problem_recurrence":
        return (
          <section key="problem_recurrence" className="space-y-4">
            <SectionHeading>Problem Recurrence</SectionHeading>
            <div className={`grid grid-cols-2 sm:grid-cols-4 ${density === "compact" ? "gap-2" : "gap-4"}`}>
              <MetricCard title="Total Problems"     value={problems?.total}                                               icon={GitBranch}  loading={problemsLoading} href="/problems" />
              <MetricCard title="Known Errors"        value={problems?.knownErrors}                                         icon={ClipboardList} loading={problemsLoading} hint="Problems in KEDB — root cause identified; workaround or fix documented." href="/problems" />
              <MetricCard title="Recurring (≥2 INC)" value={problems?.recurring}                                           icon={Repeat2}    loading={problemsLoading} variant={problems?.recurring ? "warn" : "default"} hint="Problems linked to 2 or more incidents — likely systemic issues requiring permanent fix." />
              <MetricCard title="Avg Days to Resolve" value={problems?.avgResolutionDays != null ? `${problems.avgResolutionDays}d` : "—"} icon={Clock} loading={problemsLoading} hint="Average calendar days from problem creation to resolution." />
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Problem Status Breakdown</CardTitle>
                <CardDescription>{period}d · problems with linked incidents surface systemic risk</CardDescription>
              </CardHeader>
              <CardContent>
                {problemsLoading ? (
                  <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      {(problems?.byStatus ?? []).map(s => (
                        <div key={s.status} className="flex items-center justify-between text-sm gap-2">
                          <span className="capitalize text-muted-foreground">{s.status.replace(/_/g, " ")}</span>
                          <div className="flex items-center gap-2">
                            <Progress value={problems && problems.total > 0 ? Math.round((s.count / problems.total) * 100) : 0} className="h-1.5 w-20" />
                            <span className="font-semibold tabular-nums w-6 text-right">{s.count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-3 text-sm border-l pl-6">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">With any linked incident</span>
                        <span className="font-semibold">{problems?.withIncidents ?? "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Recurring (≥ 2 incidents)</span>
                        <span className={`font-semibold ${problems?.recurring ? "text-amber-500" : ""}`}>{problems?.recurring ?? "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Known errors in KEDB</span>
                        <span className="font-semibold">{problems?.knownErrors ?? "—"}</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        );

      // ── Approval Turnaround ───────────────────────────────────────────────────
      case "approval_turnaround":
        return (
          <section key="approval_turnaround" className="space-y-4">
            <SectionHeading>Approval Turnaround</SectionHeading>
            <div className={`grid grid-cols-2 sm:grid-cols-4 ${density === "compact" ? "gap-2" : "gap-4"}`}>
              <MetricCard title="Total Approvals"    value={approvals?.total}                                         icon={CheckSquare}  loading={approvalsLoading} href="/approvals" />
              <MetricCard title="Avg Turnaround"     value={formatDuration(approvals?.avgTurnaroundSeconds)}          icon={Timer}        loading={approvalsLoading} hint="Average time from approval request creation to a final approved/rejected decision." />
              <MetricCard title="Pending"            value={approvals?.byStatus.find(s => s.status === "pending")?.count ?? 0} icon={Clock} loading={approvalsLoading} variant={approvals?.byStatus.find(s => s.status === "pending")?.count ? "warn" : "default"} hint="Approvals currently awaiting a decision — long queues block fulfilment." />
              <MetricCard title="Approved"           value={approvals?.byStatus.find(s => s.status === "approved")?.count ?? 0} icon={TrendingUp} loading={approvalsLoading} variant="good" />
            </div>
            {(approvals?.oldestPending.length ?? 0) > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-amber-500" />
                    Oldest Pending Approvals
                  </CardTitle>
                  <CardDescription>Longest-waiting items — stale approvals block request fulfilment</CardDescription>
                </CardHeader>
                <CardContent>
                  {approvalsLoading ? (
                    <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Days Open</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(approvals?.oldestPending ?? []).map(a => (
                          <TableRow key={a.id}>
                            <TableCell className="font-medium max-w-[260px] truncate">{a.title}</TableCell>
                            <TableCell className="text-muted-foreground capitalize">{a.subjectType.replace(/_/g, " ")}</TableCell>
                            <TableCell className={`text-right tabular-nums font-semibold ${a.daysOpen >= 7 ? "text-destructive" : a.daysOpen >= 3 ? "text-amber-500" : ""}`}>{a.daysOpen}d</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )}
          </section>
        );

      // ── CSAT Trend ────────────────────────────────────────────────────────────
      case "csat_trend":
        return (
          <Card key="csat_trend">
            <CardHeader>
              <CardTitle>CSAT Trend</CardTitle>
              <CardDescription>Daily average satisfaction score · {period}d · hover for detail</CardDescription>
            </CardHeader>
            <CardContent>
              {csatTrendLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : (
                <ChartContainer config={csatTrendChartConfig} className="h-[200px] w-full">
                  <LineChart data={csatTrend?.data ?? []} margin={{ left: 4, right: 4 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={(v: string) => formatDate(v, period)} interval="preserveStartEnd" minTickGap={40} />
                    <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tickLine={false} axisLine={false} width={24} tick={{ fontSize: 11 }} />
                    <ReferenceLine y={4} stroke="#22c55e" strokeDasharray="4 2" strokeOpacity={0.5} />
                    <ReferenceLine y={3} stroke="#eab308" strokeDasharray="4 2" strokeOpacity={0.5} />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(v: string) =>
                            new Date(v + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
                          }
                          formatter={(value, _name, props) => {
                            const count = (props.payload as CsatTrendPoint)?.count;
                            return [`${value} / 5 (${count} rating${count === 1 ? "" : "s"})`, "Avg Rating"];
                          }}
                        />
                      }
                    />
                    <Line
                      dataKey="avgRating"
                      type="monotone"
                      stroke="var(--color-avgRating)"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "var(--color-avgRating)" }}
                      connectNulls={false}
                    />
                  </LineChart>
                </ChartContainer>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Green reference line = 4★ target · amber = 3★ threshold · gaps = no ratings that day
              </p>
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <DensityContext.Provider value={density}>
      <div className={density === "compact" ? "space-y-4" : "space-y-8"}>

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {activeDashboard ? activeDashboard.name : "Dashboard"}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Showing data for the last {period} days
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PeriodSelector value={period} onChange={setPeriod} />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setCustomizerOpen(true)}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Customize
            </Button>
          </div>
        </div>

        {overviewError && (
          <ErrorAlert error={overviewError} fallback="Failed to load overview stats" />
        )}

        {/* Ordered, visible widgets */}
        {orderedWidgets.map(w => renderWidget(w.id))}

        {/* Customizer dialog — remounted when opened so draft resets cleanly */}
        {customizerOpen && (
          <DashboardCustomizer
            key={activeDashboard?.id ?? "system"}
            open={customizerOpen}
            onOpenChange={setCustomizerOpen}
            activeConfig={{ ...activeConfig, period }}
            activeDashboard={activeDashboard}
            dashboardList={dashboardList}
            onSave={handleSaveConfig}
            onSetDefault={id => setDefaultDashboard.mutate(id)}
            onDelete={id => deleteDashboard.mutate(id)}
            isSaving={saveDashboard.isPending}
            saveError={saveDashboard.error}
          />
        )}
      </div>
    </DensityContext.Provider>
  );
}
