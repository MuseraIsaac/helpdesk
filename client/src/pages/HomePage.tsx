import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import ReactGridLayout, { WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "@/components/DashboardGrid.css";
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
  PieChart,
  Pie,
  AreaChart,
  Area,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ErrorAlert from "@/components/ErrorAlert";
import DashboardCustomizer from "@/components/DashboardCustomizer";
import DashboardTemplateDialog from "@/components/DashboardTemplateDialog";
import DashboardSwitcher from "@/components/DashboardSwitcher";
import WidgetAppearanceEditor from "@/components/WidgetAppearanceEditor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDashboardConfig } from "@/hooks/useDashboardConfig";
import type { SaveOpts } from "@/components/DashboardCustomizer";
import {
  type WidgetId,
  WIDGET_META,
  WIDGET_LAYOUT_DEFAULTS,
  WIDGET_CATEGORIES,
  WIDGET_PRESENTATION,
  SYSTEM_DEFAULT_CONFIG,
  type WidgetConfig,
  type WidgetAppearance,
} from "core/schemas/dashboard.ts";
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
  Copy,
  GripVertical,
  PenLine,
  Plus,
  Siren,
  PackageCheck,
  GitBranch,
  CheckSquare,
  Users,
  Repeat2,
  ClipboardList,
  Check,
  Activity,
  Target,
  Award,
  Layers,
  Inbox,
  Hash,
  LayoutGrid,
  Undo2,
  Redo2,
  Magnet,
  Move,
  Palette,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useMe } from "@/hooks/useMe";

// ── Grid layout engine ────────────────────────────────────────────────────────

const RGL = WidthProvider(ReactGridLayout);
const GRID_COLS = 12;
const ROW_HEIGHT_COMFORTABLE = 80;
const ROW_HEIGHT_COMPACT      = 60;

// ── Density context ───────────────────────────────────────────────────────────
// Allows sub-components to read the current layout density without prop drilling.

type Density = "comfortable" | "compact";
const DensityContext = createContext<Density>("comfortable");
const useDensity = () => useContext(DensityContext);

// ── EditMode context ──────────────────────────────────────────────────────────
// Lets widget content know whether the dashboard is in edit mode.

const EditModeContext = createContext(false);

// ── DashboardWidget ───────────────────────────────────────────────────────────
// Wrapper that renders the drag handle and width-preset controls in edit mode.

function DashboardWidget({
  id,
  editMode,
  currentW,
  appearance,
  onWidthChange,
  onEditStyle,
  children,
}: {
  id:            WidgetId;
  editMode:      boolean;
  currentW:      number;
  appearance?:   WidgetAppearance;
  onWidthChange: (w: number) => void;
  onEditStyle?:  () => void;
  children:      React.ReactNode;
}) {
  const label        = appearance?.titleOverride || WIDGET_META[id]?.label || id;
  const accentColor  = appearance?.accentColor;

  return (
    <div
      className={[
        "h-full flex flex-col overflow-hidden rounded-xl transition-all duration-200",
        editMode ? "ring-2 shadow-xl" : "hover:shadow-md",
      ].join(" ")}
      style={editMode
        ? { "--tw-ring-color": accentColor ? `${accentColor}50` : undefined } as React.CSSProperties
        : undefined}
    >
      {/* Drag handle bar — only visible in edit mode */}
      {editMode && (
        <div
          className="widget-drag-handle flex items-center justify-between px-3 py-1.5 border-b cursor-grab active:cursor-grabbing shrink-0 select-none"
          style={{
            background:  accentColor ? `${accentColor}10` : "hsl(var(--primary)/0.05)",
            borderColor: accentColor ? `${accentColor}25` : "hsl(var(--primary)/0.1)",
          }}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <GripVertical className="h-3.5 w-3.5 shrink-0" style={{ color: accentColor ?? "hsl(var(--primary)/0.5)" }} />
            <span style={{ color: accentColor ?? undefined }}>{label}</span>
            {accentColor && (
              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: accentColor }} />
            )}
          </div>

          <div className="flex items-center gap-0.5">
            {/* Style editor button */}
            {onEditStyle && (
              <button
                type="button"
                title="Edit widget style"
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onEditStyle(); }}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors mr-1"
              >
                <Palette className="h-3.5 w-3.5" style={{ color: accentColor ?? undefined }} />
              </button>
            )}
            {/* Separator */}
            <div className="h-3 w-px bg-border/60 mx-0.5" />
            {/* Width presets */}
            {[{ label: "½", w: 6 }, { label: "⅔", w: 8 }, { label: "Full", w: 12 }].map(preset => (
              <button
                key={preset.w}
                type="button"
                title={`${preset.label} width`}
                onMouseDown={e => e.stopPropagation()}
                onClick={() => onWidthChange(preset.w)}
                className={[
                  "px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors",
                  currentW === preset.w || (preset.w === 6 && currentW < 7)
                    ? "text-white"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                ].join(" ")}
                style={
                  currentW === preset.w || (preset.w === 6 && currentW < 7)
                    ? { background: accentColor ?? "hsl(var(--primary))" }
                    : undefined
                }
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Widget content */}
      <div className={`flex-1 min-h-0 overflow-auto ${editMode ? "pointer-events-none" : ""}`}>
        {children}
      </div>
    </div>
  );
}

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

interface ChannelBreakdown {
  data: { source: string; label: string; count: number }[];
}
interface ResolutionDist {
  buckets: { label: string; count: number; sort: number }[];
}
interface AgentLeaderboard {
  agents: {
    agentId: string;
    agentName: string;
    resolved: number;
    avgResolutionSeconds: number | null;
    slaCompliancePct: number | null;
  }[];
}
interface BacklogTrend {
  data: { date: string; opened: number; closed: number }[];
}
interface FcrData {
  total: number;
  firstContact: number;
  multiContact: number;
  rate: number | null;
}
interface TopOpenTickets {
  tickets: {
    id: number;
    ticketNumber: string;
    subject: string;
    priority: string | null;
    slaBreached: boolean;
    resolutionDueAt: string | null;
    createdAt: string;
    assigneeName: string;
    daysOpen: number;
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

const backlogChartConfig = {
  opened: { label: "Opened",  color: "hsl(var(--primary))" },
  closed: { label: "Resolved", color: "#22c55e" },
} satisfies ChartConfig;

const resolutionDistChartConfig = {
  count: { label: "Tickets", color: "hsl(var(--primary))" },
} satisfies ChartConfig;

/** Gradient colors for histogram buckets (fast → slow) */
const RESOLUTION_BUCKET_COLORS = ["#22c55e", "#4ade80", "#a3e635", "#facc15", "#fb923c", "#f97316", "#ef4444"];

/** Colors for the channel donut chart */
const CHANNEL_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#14b8a6", "#8b5cf6", "#f97316"];

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
  title:       string;
  value:       string | number | undefined;
  icon:        React.ElementType;
  hint?:       string;
  loading?:    boolean;
  variant?:    Variant;
  href?:       string;
  /** Hex or Tailwind-compatible CSS colour for the icon accent */
  accentColor?: string;
  /** Small sub-label below the value */
  sub?: string;
}

function MetricCard({
  title, value, icon: Icon, hint, loading,
  variant = "default", href, accentColor, sub,
}: MetricCardProps) {
  const density = useDensity();

  // Resolve colour: explicit accentColor wins; fall back to variant colours
  const resolvedColor =
    accentColor ? accentColor :
    variant === "good" ? "#22C55E" :
    variant === "warn" ? "#F59E0B" :
    variant === "bad"  ? "#EF4444" :
    undefined;

  const valueStyle = resolvedColor ? { color: resolvedColor } : undefined;

  const card = (
    <Card
      className={[
        "relative overflow-hidden transition-all duration-200 group/metric",
        href ? "hover:shadow-lg hover:-translate-y-0.5 cursor-pointer" : "",
        "shadow-sm",
      ].join(" ")}
      style={resolvedColor ? {
        borderTopColor: resolvedColor,
        borderTopWidth: 3,
        boxShadow: href ? undefined : `0 1px 3px 0 ${resolvedColor}15, 0 1px 2px -1px ${resolvedColor}10`,
      } : undefined}
    >
      {/* Gradient tint fill */}
      {resolvedColor && (
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-200 group-hover/metric:opacity-150"
          style={{ background: `linear-gradient(135deg, ${resolvedColor}0d 0%, ${resolvedColor}04 40%, transparent 70%)` }}
        />
      )}
      {/* Bottom glow line */}
      {resolvedColor && (
        <div
          className="absolute bottom-0 left-4 right-4 h-px pointer-events-none opacity-40"
          style={{ background: `linear-gradient(90deg, transparent, ${resolvedColor}, transparent)` }}
        />
      )}

      <CardHeader className={density === "compact" ? "pb-1 relative" : "pb-2 relative"}>
        <div className="flex items-start justify-between gap-2">
          {/* Icon badge with glow ring */}
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover/metric:scale-105"
            style={resolvedColor
              ? {
                  background: `linear-gradient(135deg, ${resolvedColor}22, ${resolvedColor}0f)`,
                  border: `1px solid ${resolvedColor}35`,
                  boxShadow: `0 0 0 3px ${resolvedColor}0f`,
                }
              : { background: "hsl(var(--muted))" }
            }
          >
            <Icon
              className="h-4.5 w-4.5"
              style={resolvedColor ? { color: resolvedColor } : { color: "hsl(var(--muted-foreground))" }}
            />
          </div>
          {/* Hint */}
          {hint && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground/30 cursor-default mt-0.5 shrink-0 hover:text-muted-foreground/60 transition-colors" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[200px] text-xs">{hint}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <CardTitle className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 leading-tight mt-2.5">
          {title}
        </CardTitle>
      </CardHeader>

      <CardContent className="relative pt-0">
        {loading ? (
          <Skeleton className={density === "compact" ? "h-7 w-16" : "h-9 w-20"} />
        ) : (
          <div>
            <p
              className={`font-black tracking-tight leading-none tabular-nums ${density === "compact" ? "text-2xl" : "text-[2rem]"}`}
              style={valueStyle}
            >
              {value ?? "—"}
            </p>
            {sub && <p className="text-[11px] text-muted-foreground mt-1.5 leading-tight">{sub}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link to={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
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

/** Consistent card header with icon badge + title + optional description */
function WidgetHeader({
  title,
  description,
  icon: Icon,
  iconColor = "text-primary",
  accentColor,
  action,
}: {
  title: string;
  description?: string;
  icon?: React.ElementType;
  iconColor?: string;
  accentColor?: string;
  action?: React.ReactNode;
}) {
  return (
    <CardHeader className="pb-3 relative">
      {/* Accent strip on the left edge */}
      {accentColor && (
        <div
          className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full"
          style={{ background: `linear-gradient(180deg, ${accentColor}, ${accentColor}40)` }}
        />
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon && (
            <div
              className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
              style={accentColor
                ? {
                    background: `linear-gradient(135deg, ${accentColor}22, ${accentColor}0e)`,
                    border: `1px solid ${accentColor}30`,
                    boxShadow: `0 0 0 3px ${accentColor}0a`,
                  }
                : { background: "hsl(var(--muted))" }
              }
            >
              <Icon
                className={`h-4 w-4 ${accentColor ? "" : iconColor}`}
                style={accentColor ? { color: accentColor } : undefined}
              />
            </div>
          )}
          <div className="min-w-0">
            <CardTitle className="text-[13px] font-bold leading-tight tracking-tight">{title}</CardTitle>
            {description && (
              <CardDescription className="text-[11px] mt-0.5 leading-snug">{description}</CardDescription>
            )}
          </div>
        </div>
        {action}
      </div>
    </CardHeader>
  );
}

/** Consistent empty state: centered icon + text */
function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
        <Icon className="h-5 w-5 text-muted-foreground/50" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {description && (
        <p className="text-xs text-muted-foreground/60 max-w-[200px] leading-snug">{description}</p>
      )}
    </div>
  );
}

/** Coloured priority pill */
function PriorityBadge({ priority }: { priority: string | null | undefined }) {
  const styles: Record<string, string> = {
    urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    high:   "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    low:    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  };
  if (!priority) return <span className="text-xs text-muted-foreground">—</span>;
  const label = priority.charAt(0).toUpperCase() + priority.slice(1);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${styles[priority] ?? "bg-muted text-muted-foreground"}`}>
      {label}
    </span>
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
    <ChartContainer config={config} className="h-full w-full min-h-[160px]">
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

// ── Widget Picker Dialog ──────────────────────────────────────────────────────
// Shown in edit mode; lets users add/remove widgets from the dashboard.

function WidgetPickerDialog({
  open,
  onOpenChange,
  widgets,
  onToggle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widgets: WidgetConfig[];
  onToggle: (id: WidgetId) => void;
}) {
  const visibleIds = new Set(widgets.filter(w => w.visible).map(w => w.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-primary" />
            Widget Library
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Toggle widgets on or off. Changes take effect when you save the layout.
          </p>
        </DialogHeader>
        <div className="space-y-6 mt-2">
          {WIDGET_CATEGORIES.map(cat => (
            <div key={cat.label}>
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2.5">
                {cat.label}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {cat.ids.map(id => {
                  const meta    = WIDGET_META[id];
                  const isOn    = visibleIds.has(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onToggle(id)}
                      className={[
                        "flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
                        isOn
                          ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                          : "border-border hover:border-primary/30 hover:bg-muted/40",
                      ].join(" ")}
                    >
                      <div className={`mt-0.5 h-6 w-6 rounded-md flex items-center justify-center shrink-0 ${isOn ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        {isOn
                          ? <Check className="h-3.5 w-3.5" />
                          : <Plus className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium leading-tight ${isOn ? "text-primary" : "text-foreground"}`}>
                          {meta.label}
                        </p>
                        <p className="text-[12px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                          {meta.description}
                        </p>
                        <span className="inline-block mt-1 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide">
                          {WIDGET_PRESENTATION[id]}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Time preset types & helpers ───────────────────────────────────────────────

type TimePreset = "today" | "yesterday" | "7d" | "30d" | "this_month" | "last_month" | "custom";

interface DateRange { from: string; to: string }

const PRESET_LABELS: Record<TimePreset, string> = {
  today:      "Today",
  yesterday:  "Yesterday",
  "7d":       "Last 7 days",
  "30d":      "Last 30 days",
  this_month: "This month",
  last_month: "Last month",
  custom:     "Custom range",
};

/** Returns today's date as YYYY-MM-DD in the user's local timezone. */
function localToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Returns a Date offset by `days` from today (local), formatted as YYYY-MM-DD. */
function localDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Resolves a preset to a concrete date range (no-op for "custom" — use customRange state). */
function resolvePreset(preset: Exclude<TimePreset, "custom">): DateRange {
  const today = localToday();
  const now = new Date();
  switch (preset) {
    case "today":     return { from: today, to: today };
    case "yesterday": { const s = localDaysAgo(1); return { from: s, to: s }; }
    case "7d":        return { from: localDaysAgo(6),  to: today };
    case "30d":       return { from: localDaysAgo(29), to: today };
    case "this_month": {
      const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      return { from, to: today };
    }
    case "last_month": {
      const first   = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      return { from: fmt(first), to: fmt(lastDay) };
    }
  }
}

/** Maps a preset to the nearest saved-config period (7 | 30 | 90). */
function presetToPeriod(preset: TimePreset): 7 | 30 | 90 {
  if (preset === "today" || preset === "yesterday" || preset === "7d") return 7;
  return 30;
}

/** Maps a saved-config period back to an initial preset. */
function periodToPreset(period: 7 | 30 | 90): TimePreset {
  return period === 7 ? "7d" : "30d";
}

// ── PeriodSelector ────────────────────────────────────────────────────────────

function PeriodSelector({
  preset,
  onPreset,
  customRange,
  onCustomRange,
}: {
  preset: TimePreset;
  onPreset: (p: TimePreset) => void;
  customRange: DateRange | null;
  onCustomRange: (r: DateRange | null) => void;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const [fromDraft, setFromDraft] = useState(customRange?.from ?? "");
  const [toDraft,   setToDraft]   = useState(customRange?.to   ?? "");

  function handleSelect(p: TimePreset) {
    if (p !== "custom") {
      onCustomRange(null);
      setShowCustom(false);
    } else {
      setShowCustom(true);
    }
    onPreset(p);
  }

  function applyCustom() {
    if (fromDraft && toDraft && fromDraft <= toDraft) {
      onCustomRange({ from: fromDraft, to: toDraft });
      setShowCustom(false);
    }
  }

  const selectLabel =
    preset === "custom" && customRange
      ? `${customRange.from} – ${customRange.to}`
      : PRESET_LABELS[preset];

  return (
    <div className="flex items-center gap-2">
      <Select value={preset} onValueChange={v => handleSelect(v as TimePreset)}>
        <SelectTrigger className="h-8 w-[160px] text-[13px]">
          <SelectValue>{selectLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="yesterday">Yesterday</SelectItem>
          <SelectItem value="7d">Last 7 days</SelectItem>
          <SelectItem value="30d">Last 30 days</SelectItem>
          <SelectItem value="this_month">This month</SelectItem>
          <SelectItem value="last_month">Last month</SelectItem>
          <SelectItem value="custom">
            {customRange ? `${customRange.from} – ${customRange.to}` : "Custom range…"}
          </SelectItem>
        </SelectContent>
      </Select>

      {showCustom && (
        <div className="flex items-center gap-1.5 rounded-lg border bg-background px-2 py-1 shadow-sm">
          <input
            type="date"
            value={fromDraft}
            onChange={e => setFromDraft(e.target.value)}
            className="text-xs bg-transparent border-none outline-none text-foreground"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <input
            type="date"
            value={toDraft}
            min={fromDraft}
            onChange={e => setToDraft(e.target.value)}
            className="text-xs bg-transparent border-none outline-none text-foreground"
          />
          <button
            type="button"
            onClick={applyCustom}
            disabled={!fromDraft || !toDraft || fromDraft > toDraft}
            className="text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-40 ml-1"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => { setShowCustom(false); if (!customRange) handleSelect("30d"); }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ── HomePage ──────────────────────────────────────────────────────────────────

export default function HomePage() {
  const navigate = useNavigate();
  const { data: meData } = useMe();
  const firstName = meData?.user?.name?.split(" ")[0] ?? "";

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const todayLabel = useMemo(() =>
    new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
  []);

  // ── Dashboard config ─────────────────────────────────────────────────────────

  const {
    activeConfig,
    activeDashboard,
    dashboardList,
    saveDashboard,
    setDefaultDashboard,
    deleteDashboard,
    cloneDashboard,
  } = useDashboardConfig();

  const [customizerOpen,     setCustomizerOpen]     = useState(false);
  const [widgetPickerOpen,   setWidgetPickerOpen]   = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [customRange,        setCustomRange]        = useState<DateRange | null>(null);
  const [editMode,           setEditMode]           = useState(false);
  // draftLayout holds the in-progress layout while editing; null = use config-derived layout
  const [draftLayout,        setDraftLayout]        = useState<Layout | null>(null);

  // ── Edit-mode enhancements ───────────────────────────────────────────────────
  /** Whether widgets auto-compact (snap) during edit. Default: free-form (false). */
  const [snapEnabled,        setSnapEnabled]        = useState(false);
  /** Undo/redo history: array of Layout snapshots + pointer */
  const [layoutHistory,      setLayoutHistory]      = useState<Layout[]>([]);
  const [historyIndex,       setHistoryIndex]       = useState(-1);
  /** Restore-to-default confirmation popover */
  const [resetPopoverOpen,   setResetPopoverOpen]   = useState(false);
  /** Which widget's style editor is open (id | null) */
  const [styleEditWidget,    setStyleEditWidget]    = useState<WidgetId | null>(null);

  // Preset: initialize once from saved config when it first loads.
  // After that, local selection is reflected immediately without auto-saving.
  const [preset, setPreset] = useState<TimePreset>("30d");
  const presetInitRef = useRef(false);
  useEffect(() => {
    if (!presetInitRef.current && activeConfig) {
      presetInitRef.current = true;
      setPreset(periodToPreset(activeConfig.period as 7 | 30 | 90));
    }
  }, [activeConfig]);

  const density = activeConfig.density;
  const rowHeight = density === "compact" ? ROW_HEIGHT_COMPACT : ROW_HEIGHT_COMFORTABLE;

  // All widgets sorted by order; visible ones go into the grid
  const sortedWidgets = useMemo(
    () => [...activeConfig.widgets].sort((a, b) => a.order - b.order),
    [activeConfig],
  );
  const orderedWidgets = useMemo(() => sortedWidgets.filter(w => w.visible), [sortedWidgets]);
  const hiddenWidgets  = useMemo(() => sortedWidgets.filter(w => !w.visible), [sortedWidgets]);

  // Grid layout — derived from widget configs + defaults (overridden by draftLayout in edit mode)
  //
  // y-position strategy:
  //   • Widgets that have an explicit saved y → use it (preserves gaps the user set)
  //   • Widgets with no saved y → stack below all positioned widgets
  //   This eliminates the old y:999 sentinel which caused ~79,920 px of empty space
  //   when compactType was null (free-form edit mode or gap-preserving view mode).
  const configLayout = useMemo((): Layout => {
    // Find the bottom edge of all widgets that have an explicit saved y
    const maxSavedBottom = orderedWidgets.reduce((m, w) => {
      if (w.y == null) return m;
      const def = WIDGET_LAYOUT_DEFAULTS[w.id];
      return Math.max(m, w.y + (w.h ?? def.h));
    }, 0);

    let nextY = maxSavedBottom;
    return orderedWidgets.map(w => {
      const def = WIDGET_LAYOUT_DEFAULTS[w.id];
      const h = w.h ?? def.h;
      const y = w.y != null ? w.y : (() => { const yy = nextY; nextY += h; return yy; })();
      return {
        i: w.id, x: w.x ?? def.x, y, w: w.w ?? def.w, h,
        minW: def.minW, minH: def.minH,
      };
    });
  }, [orderedWidgets]);

  const gridLayout = draftLayout ?? configLayout;

  // ── Queries ──────────────────────────────────────────────────────────────────

  // Resolved date range from the active preset (or custom range input)
  const { from, to } = useMemo((): DateRange => {
    if (preset === "custom" && customRange) return customRange;
    if (preset === "custom") return resolvePreset("30d"); // fallback until user applies range
    return resolvePreset(preset);
  }, [preset, customRange]);

  // Nearest saved-config period equivalent — used when saving and for period-based API params
  const period = presetToPeriod(preset);

  // Build query param strings
  const fromToParams = `from=${from}&to=${to}`;
  // Period-based endpoints get from/to too; they should ignore unknown params gracefully.
  const periodParams = `from=${from}&to=${to}`;

  const { data: overview, isLoading: overviewLoading, error: overviewError } =
    useQuery<OverviewStats>({
      queryKey: ["reports-overview", from, to],
      queryFn: async () => (await axios.get(`/api/reports/overview?${fromToParams}`)).data,
    });

  const { data: volume, isLoading: volumeLoading, error: volumeError } =
    useQuery<VolumeData>({
      queryKey: ["reports-volume", from, to],
      queryFn: async () => (await axios.get(`/api/reports/volume?${periodParams}`)).data,
    });

  const { data: breakdowns, isLoading: breakdownsLoading } =
    useQuery<Breakdowns>({
      queryKey: ["reports-breakdowns", from, to],
      queryFn: async () => (await axios.get(`/api/reports/breakdowns?${fromToParams}`)).data,
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
      queryKey: ["reports-sla-dim", from, to],
      queryFn: async () => (await axios.get(`/api/reports/sla-by-dimension?${fromToParams}`)).data,
    });

  const { data: incidents, isLoading: incidentsLoading } =
    useQuery<IncidentStats>({
      queryKey: ["reports-incidents", from, to],
      queryFn: async () => (await axios.get(`/api/reports/incidents?${periodParams}`)).data,
    });

  const { data: requests, isLoading: requestsLoading } =
    useQuery<RequestStats>({
      queryKey: ["reports-requests", from, to],
      queryFn: async () => (await axios.get(`/api/reports/requests?${periodParams}`)).data,
    });

  const { data: problems, isLoading: problemsLoading } =
    useQuery<ProblemStats>({
      queryKey: ["reports-problems", from, to],
      queryFn: async () => (await axios.get(`/api/reports/problems?${periodParams}`)).data,
    });

  const { data: approvals, isLoading: approvalsLoading } =
    useQuery<ApprovalStats>({
      queryKey: ["reports-approvals", from, to],
      queryFn: async () => (await axios.get(`/api/reports/approvals?${periodParams}`)).data,
    });

  const { data: csatTrend, isLoading: csatTrendLoading } =
    useQuery<{ data: CsatTrendPoint[] }>({
      queryKey: ["reports-csat-trend", from, to],
      queryFn: async () => (await axios.get(`/api/reports/csat-trend?${periodParams}`)).data,
    });

  const { data: channelBreakdown, isLoading: channelLoading } =
    useQuery<ChannelBreakdown>({
      queryKey: ["reports-channel", from, to],
      queryFn: async () => (await axios.get(`/api/reports/channel-breakdown?${fromToParams}`)).data,
    });

  const { data: resolutionDist, isLoading: resolutionLoading } =
    useQuery<ResolutionDist>({
      queryKey: ["reports-resolution-dist", from, to],
      queryFn: async () => (await axios.get(`/api/reports/resolution-distribution?${fromToParams}`)).data,
    });

  const { data: agentLeaderboard, isLoading: leaderboardLoading } =
    useQuery<AgentLeaderboard>({
      queryKey: ["reports-agent-leaderboard", from, to],
      queryFn: async () => (await axios.get(`/api/reports/agent-leaderboard?${fromToParams}`)).data,
    });

  const { data: backlogTrend, isLoading: backlogLoading } =
    useQuery<BacklogTrend>({
      queryKey: ["reports-backlog-trend", from, to],
      queryFn: async () => (await axios.get(`/api/reports/backlog-trend?${fromToParams}`)).data,
    });

  const { data: fcrData, isLoading: fcrLoading } =
    useQuery<FcrData>({
      queryKey: ["reports-fcr", from, to],
      queryFn: async () => (await axios.get(`/api/reports/fcr?${fromToParams}`)).data,
    });

  const { data: topOpen, isLoading: topOpenLoading } =
    useQuery<TopOpenTickets>({
      queryKey: ["reports-top-open"],
      queryFn: async () => (await axios.get("/api/reports/top-open-tickets")).data,
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

  const fcrVariant: Variant =
    fcrData?.rate == null ? "default" :
    fcrData.rate >= 70 ? "good" :
    fcrData.rate >= 50 ? "warn" : "bad";

  const maxResolved = Math.max(1, ...(agentLeaderboard?.agents.map(a => a.resolved) ?? [0]));

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

  function handleSaveConfig(config: typeof activeConfig, name: string, opts: SaveOpts) {
    // Fold the nearest period equivalent of the current preset into the saved config
    saveDashboard.mutate(
      {
        dashboardId: activeDashboard?.id ?? null,
        name,
        config: { ...config, period: presetToPeriod(preset) },
        description: opts.description,
        isShared: opts.isShared,
        visibilityTeamId: opts.visibilityTeamId,
      },
      { onSuccess: () => setCustomizerOpen(false) },
    );
  }

  function handleClone(dashboardId: number) {
    cloneDashboard.mutate(
      { dashboardId, setAsDefault: false },
    );
  }

  // ── Edit-mode layout handlers ─────────────────────────────────────────────

  function pushHistory(layout: Layout) {
    setLayoutHistory(prev => {
      const trimmed = prev.slice(0, historyIndex + 1);
      const next    = [...trimmed, layout].slice(-50);
      setHistoryIndex(next.length - 1);
      return next;
    });
  }

  const handleLayoutChange = useCallback((newLayout: Layout) => {
    if (!editMode) return;
    setDraftLayout(newLayout);
    setLayoutHistory(prev => {
      const next = [...prev.slice(0, historyIndex + 1), newLayout].slice(-50);
      setHistoryIndex(next.length - 1);
      return next;
    });
  }, [editMode, historyIndex]);

  function handleWidthPreset(widgetId: string, newW: number) {
    setDraftLayout(prev => {
      const base = prev ?? configLayout;
      const next = base.map(item =>
        item.i === widgetId
          ? { ...item, w: Math.min(newW, GRID_COLS), x: item.x + newW > GRID_COLS ? 0 : item.x }
          : item,
      );
      setLayoutHistory(h => {
        const trimmed = h.slice(0, historyIndex + 1);
        const updated = [...trimmed, next].slice(-50);
        setHistoryIndex(updated.length - 1);
        return updated;
      });
      return next;
    });
  }

  function undoLayout() {
    if (historyIndex <= 0) return;
    const idx = historyIndex - 1;
    setHistoryIndex(idx);
    setDraftLayout(layoutHistory[idx]);
  }

  function redoLayout() {
    if (historyIndex >= layoutHistory.length - 1) return;
    const idx = historyIndex + 1;
    setHistoryIndex(idx);
    setDraftLayout(layoutHistory[idx]);
  }

  function enterEditMode() {
    const initial = configLayout.map(item => ({ ...item }));
    setDraftLayout(initial);
    setLayoutHistory([initial]);
    setHistoryIndex(0);
    setEditMode(true);
  }

  function cancelEditMode() {
    setDraftLayout(null);
    setLayoutHistory([]);
    setHistoryIndex(-1);
    setEditMode(false);
  }

  function saveLayout() {
    const layout = draftLayout ?? configLayout;
    const newWidgets = activeConfig.widgets.map(w => {
      const item = layout.find(l => l.i === w.id);
      if (!item) return w;
      return { ...w, x: item.x, y: item.y, w: item.w, h: item.h };
    });
    handleSaveConfig({ ...activeConfig, widgets: newWidgets }, activeDashboard?.name ?? "My Dashboard", {});
    setEditMode(false);
    setDraftLayout(null);
    setLayoutHistory([]);
    setHistoryIndex(-1);
  }

  function restoreToDefault() {
    handleSaveConfig(SYSTEM_DEFAULT_CONFIG, "My Dashboard", {});
    setEditMode(false);
    setDraftLayout(null);
    setLayoutHistory([]);
    setHistoryIndex(-1);
    setResetPopoverOpen(false);
  }

  function saveWidgetAppearance(widgetId: WidgetId, appearance: WidgetAppearance) {
    const newWidgets = activeConfig.widgets.map(w =>
      w.id === widgetId ? { ...w, appearance } : w
    );
    handleSaveConfig({ ...activeConfig, widgets: newWidgets }, activeDashboard?.name ?? "My Dashboard", {});
  }

  /**
   * Auto-fit: repack all visible widgets into the tightest possible layout
   * with no gaps, using a greedy top-left first-fit algorithm.
   * Relative order (by current y then x) is preserved.
   */
  function autoFitLayout() {
    const base = draftLayout ?? configLayout;
    if (!base.length) return;

    // Sort by reading order (top-to-bottom, left-to-right)
    const sorted = [...base].sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);

    // Occupancy grid — track which cells are taken
    const occupied = new Set<string>();
    const cell = (x: number, y: number) => `${x},${y}`;

    function canPlace(x: number, y: number, w: number, h: number): boolean {
      for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++)
          if (occupied.has(cell(x + dx, y + dy))) return false;
      return true;
    }

    function markOccupied(x: number, y: number, w: number, h: number) {
      for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++)
          occupied.add(cell(x + dx, y + dy));
    }

    const packed = sorted.map(item => {
      const w = item.w, h = item.h;
      for (let y = 0; y < 200; y++) {
        for (let x = 0; x <= GRID_COLS - w; x++) {
          if (canPlace(x, y, w, h)) {
            markOccupied(x, y, w, h);
            return { ...item, x, y };
          }
        }
      }
      // Fallback: stack at the bottom
      const maxY = Math.max(0, ...packed.map(p => p.y + p.h));
      markOccupied(0, maxY, w, h);
      return { ...item, x: 0, y: maxY };
    });

    setDraftLayout(packed);
    setLayoutHistory(prev => {
      const next = [...prev.slice(0, historyIndex + 1), packed].slice(-50);
      setHistoryIndex(next.length - 1);
      return next;
    });
  }

  /** Show a hidden widget by making it visible and appending to the layout */
  function showWidget(id: WidgetId) {
    const def  = WIDGET_LAYOUT_DEFAULTS[id];
    const base = draftLayout ?? configLayout;
    // Use reduce (not spread) to find the real bottom — avoids issues with stale large y values
    const maxY = base.reduce((m, l) => Math.max(m, l.y + l.h), 0);
    const newItem = { i: id, x: def.x, y: maxY, w: def.w, h: def.h, minW: def.minW, minH: def.minH };
    const newLayout = [...base, newItem];
    setDraftLayout(newLayout);
    // Push onto history so the add can be undone
    setLayoutHistory(prev => {
      const next = [...prev.slice(0, historyIndex + 1), newLayout].slice(-50);
      setHistoryIndex(next.length - 1);
      return next;
    });
    const newWidgets = activeConfig.widgets.map(w => w.id === id ? { ...w, visible: true } : w);
    handleSaveConfig({ ...activeConfig, widgets: newWidgets }, activeDashboard?.name ?? "My Dashboard", {});
  }

  /** Remove a widget from the grid (marks it hidden) */
  function hideWidget(id: WidgetId) {
    setDraftLayout(prev => (prev ?? configLayout).filter(l => l.i !== id));
    const newWidgets = activeConfig.widgets.map(w => w.id === id ? { ...w, visible: false } : w);
    handleSaveConfig({ ...activeConfig, widgets: newWidgets }, activeDashboard?.name ?? "My Dashboard", {});
  }

  /**
   * Toggle widget visibility from the widget picker.
   * Visible → hidden (removes from grid draft). Hidden → visible (appends to grid).
   * Immediately persists, same as showWidget/hideWidget.
   */
  function toggleWidgetPicker(id: WidgetId) {
    const widget = activeConfig.widgets.find(w => w.id === id);
    if (!widget) return;
    if (widget.visible) {
      hideWidget(id);
    } else {
      showWidget(id);
    }
  }

  // ── Widget renderer ───────────────────────────────────────────────────────────
  // Each widget is a named section rendered as a closure over the query data.

  function renderWidget(id: WidgetId): React.ReactNode {
    switch (id) {
      // ── Volume ──────────────────────────────────────────────────────────────
      case "volume":
        return (
          <Card key="volume" className="h-full">
            <WidgetHeader
              title="Volume"
              description={`Ticket counts · ${PRESET_LABELS[preset]}`}
              icon={TicketIcon}
              accentColor="#6366F1"
            />
            <CardContent>
              <div className={`grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 ${density === "compact" ? "gap-2" : "gap-3"}`}>
                <MetricCard title="Total Tickets"   value={overview?.totalTickets}     icon={TicketIcon}    loading={overviewLoading} accentColor="#6366F1" hint="All non-system tickets in the selected period." href={ticketsUrl()} />
                <MetricCard title="Open"            value={overview?.openTickets}      icon={CircleDot}     loading={overviewLoading} accentColor="#F97316" hint="Tickets currently awaiting agent response." href={ticketsUrl({ status: "open" })} />
                <MetricCard title="Resolved"        value={overview?.resolvedTickets}  icon={TrendingUp}    loading={overviewLoading} accentColor="#22C55E" hint="Tickets marked resolved or closed." href={ticketsUrl({ status: "resolved" })} />
                <MetricCard title="Escalated"       value={overview?.escalatedTickets} icon={AlertTriangle} loading={overviewLoading} accentColor={overview?.escalatedTickets ? "#EF4444" : "#94A3B8"} hint="Tickets that were escalated at any point." href={ticketsUrl({ escalated: true })} />
                <MetricCard title="Reopened"        value={overview?.reopenedTickets}  icon={RotateCcw}     loading={overviewLoading} accentColor={overview?.reopenedTickets ? "#A855F7" : "#94A3B8"} hint="Resolved tickets that received a new reply and returned to open." href={ticketsUrl({ status: "open" })} />
              </div>
            </CardContent>
          </Card>
        );

      // ── Performance ─────────────────────────────────────────────────────────
      case "performance": {
        const slaColor =
          slaVariant === "good" ? "#22C55E" :
          slaVariant === "warn" ? "#F59E0B" :
          slaVariant === "bad"  ? "#EF4444" : "#3B82F6";
        return (
          <Card key="performance" className="h-full">
            <WidgetHeader
              title="Performance (MTTA / MTTR)"
              description={`Response & resolution times · ${PRESET_LABELS[preset]}`}
              icon={Timer}
              accentColor="#3B82F6"
            />
            <CardContent>
              <div className={`grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 ${density === "compact" ? "gap-2" : "gap-3"}`}>
                <MetricCard title="MTTA"           value={formatDuration(overview?.avgFirstResponseSeconds)} icon={Timer}       loading={overviewLoading} accentColor="#3B82F6" hint="Mean Time To Acknowledge — avg time from creation to first agent reply." href={ticketsUrl({ status: "open" })} />
                <MetricCard title="MTTR"           value={formatDuration(overview?.avgResolutionSeconds)}    icon={Hourglass}   loading={overviewLoading} accentColor="#6366F1" hint="Mean Time To Resolve — avg time from creation to resolution." href={ticketsUrl({ status: "open" })} />
                <MetricCard title="AI Resolution"  value={overview ? `${overview.aiResolutionRate}%` : undefined} icon={Sparkles} loading={overviewLoading} accentColor="#A855F7" hint="Percentage of resolved tickets handled entirely by the AI agent." href={ticketsUrl({ status: "resolved" })} />
                <MetricCard title="SLA Compliance" value={pct(overview?.slaComplianceRate)} icon={ShieldCheck} loading={overviewLoading} accentColor={slaColor} hint="% of SLA-tracked tickets resolved within deadline." href={ticketsUrl({ view: "overdue" })} />
                <MetricCard title="SLA Breached"   value={overview?.breachedTickets} icon={ShieldAlert} loading={overviewLoading} accentColor={overview?.breachedTickets ? "#EF4444" : "#94A3B8"} hint="Tickets that exceeded their SLA resolution deadline." href={ticketsUrl({ view: "overdue" })} />
              </div>
            </CardContent>
          </Card>
        );
      }

      // ── Tickets Per Day ──────────────────────────────────────────────────────
      case "tickets_per_day":
        return (
          <Card key="tickets_per_day" className="h-full flex flex-col">
            <WidgetHeader title="Tickets Per Day" description={PRESET_LABELS[preset]} icon={BarChart2} iconColor="text-primary" />
            <CardContent className="flex-1 pb-4">
              {volumeError ? (
                <ErrorAlert error={volumeError} fallback="Failed to load chart data" />
              ) : volumeLoading ? (
                <Skeleton className="h-full w-full min-h-[180px]" />
              ) : (
                <ChartContainer config={volumeChartConfig} className="h-full w-full min-h-[180px]">
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
                <CardDescription>Ticket distribution · {PRESET_LABELS[preset]} · click a bar to filter</CardDescription>
              </CardHeader>
              <CardContent>
                {breakdownsLoading ? <Skeleton className="h-full w-full min-h-[160px]" /> : (
                  <HorizontalBarChart data={breakdowns?.byCategory ?? []} dataKey="total" labelKey="label" config={barChartConfig} onBarClick={handleCategoryBarClick} />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">By Priority</CardTitle>
                <CardDescription>Ticket distribution · {PRESET_LABELS[preset]} · click a bar to filter</CardDescription>
              </CardHeader>
              <CardContent>
                {breakdownsLoading ? <Skeleton className="h-full w-full min-h-[160px]" /> : (
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
                {agingLoading ? <Skeleton className="h-full w-full min-h-[160px]" /> : (
                  <HorizontalBarChart data={agingData?.aging ?? []} dataKey="count" labelKey="bucket" config={agingChartConfig} sortKey="sort" colorMap={AGING_COLORS} onBarClick={() => navigate(ticketsUrl({ status: "open" }))} />
                )}
              </CardContent>
            </Card>
          </div>
        );

      // ── By Assignee ──────────────────────────────────────────────────────────
      case "by_assignee":
        return (
          <Card key="by_assignee" className="h-full flex flex-col">
            <WidgetHeader title="By Assignee" description={`Ticket load per agent · ${PRESET_LABELS[preset]}`} icon={Users} iconColor="text-indigo-500" />
            <CardContent className="flex-1 overflow-auto pb-2">
              {breakdownsLoading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
                </div>
              ) : !breakdowns?.byAssignee.length ? (
                <EmptyState icon={Users} title="No assigned tickets" description="Assigned ticket data will appear here" />
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
        const SlaRow = ({ r }: { r: SlaDimEntry }) => {
          const pct2 = r.compliance ?? 0;
          const barColor = pct2 >= 90 ? "#22C55E" : pct2 >= 70 ? "#F59E0B" : "#EF4444";
          const breachRate = r.totalWithSla > 0 ? Math.round((r.breached / r.totalWithSla) * 100) : 0;
          return (
            <div className="space-y-1.5 py-2 border-b border-border/40 last:border-0">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium truncate">{r.label}</span>
                <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                  <span className="tabular-nums">{r.totalWithSla} tracked</span>
                  {r.breached > 0 && (
                    <span className="tabular-nums font-medium" style={{ color: "#EF4444" }}>
                      {r.breached} breached
                    </span>
                  )}
                  <span
                    className="font-bold tabular-nums w-12 text-right"
                    style={{ color: barColor }}
                  >
                    {r.compliance != null ? `${r.compliance}%` : "—"}
                  </span>
                </div>
              </div>
              <div className="flex h-1.5 rounded-full bg-muted/40 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct2}%`, background: barColor }} />
                {breachRate > 0 && (
                  <div className="h-full rounded-full" style={{ width: `${breachRate}%`, background: "#EF444430" }} />
                )}
              </div>
            </div>
          );
        };

        const SlaDimRows = ({ rows }: { rows: SlaDimEntry[] }) => {
          const filtered = rows.filter(r => r.totalWithSla > 0);
          if (!filtered.length) return <p className="text-sm text-muted-foreground py-6 text-center">No SLA-tracked data for this period.</p>;
          return <div>{filtered.map(r => <SlaRow key={r.key} r={r} />)}</div>;
        };

        const overallCompliance = slaDim?.byPriority.length
          ? Math.round(slaDim.byPriority.filter(r => r.totalWithSla > 0).reduce((s, r) => s + (r.compliance ?? 0), 0) / Math.max(1, slaDim.byPriority.filter(r => r.totalWithSla > 0).length))
          : null;
        const overallColor = overallCompliance == null ? "#6366F1" : overallCompliance >= 90 ? "#22C55E" : overallCompliance >= 70 ? "#F59E0B" : "#EF4444";

        return (
          <Card key="sla_by_dimension" className="h-full flex flex-col">
            <WidgetHeader
              title="SLA Compliance by Dimension"
              description={`Priority · category · team · ${PRESET_LABELS[preset]}`}
              icon={ShieldCheck}
              accentColor={overallColor}
              action={overallCompliance != null ? (
                <div className="flex flex-col items-end">
                  <span className="text-2xl font-bold tabular-nums leading-none" style={{ color: overallColor }}>
                    {overallCompliance}%
                  </span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">avg compliance</span>
                </div>
              ) : undefined}
            />
            <CardContent className="flex-1 overflow-auto">
              {slaDimLoading ? (
                <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <Tabs defaultValue="priority">
                  <TabsList className="mb-3 h-8">
                    <TabsTrigger value="priority" className="text-xs h-6 px-2.5">Priority</TabsTrigger>
                    <TabsTrigger value="category" className="text-xs h-6 px-2.5">Category</TabsTrigger>
                    <TabsTrigger value="team"     className="text-xs h-6 px-2.5">Team</TabsTrigger>
                  </TabsList>
                  <TabsContent value="priority"><SlaDimRows rows={slaDim?.byPriority ?? []} /></TabsContent>
                  <TabsContent value="category"><SlaDimRows rows={slaDim?.byCategory ?? []} /></TabsContent>
                  <TabsContent value="team">    <SlaDimRows rows={slaDim?.byTeam     ?? []} /></TabsContent>
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
                  <CardDescription>Daily count · {PRESET_LABELS[preset]}</CardDescription>
                </CardHeader>
                <CardContent>
                  {incidentsLoading ? <Skeleton className="h-full w-full min-h-[140px]" /> : (
                    <ChartContainer config={incidentChartConfig} className="h-full w-full min-h-[140px]">
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
      case "request_fulfillment": {
        const reqSlaColor =
          complianceVariant(requests?.slaCompliance ?? null) === "good" ? "#22C55E" :
          complianceVariant(requests?.slaCompliance ?? null) === "warn" ? "#F59E0B" :
          complianceVariant(requests?.slaCompliance ?? null) === "bad"  ? "#EF4444" : "#0EA5E9";
        const maxReqCount = Math.max(1, ...(requests?.topItems.map(i => i.count) ?? [1]));
        const RANK_COLORS = ["#F59E0B", "#94A3B8", "#CD7F32"];

        return (
          <Card key="request_fulfillment" className="h-full flex flex-col">
            <WidgetHeader
              title="Request Fulfillment"
              description={`Service requests · ${PRESET_LABELS[preset]}`}
              icon={PackageCheck}
              accentColor="#0EA5E9"
            />
            <CardContent className="flex-1 flex flex-col gap-4 overflow-auto">
              {/* KPI strip */}
              <div className={`grid grid-cols-2 sm:grid-cols-4 ${density === "compact" ? "gap-2" : "gap-3"}`}>
                <MetricCard title="Total Requests"       value={requests?.total}                                  icon={PackageCheck}  loading={requestsLoading} accentColor="#0EA5E9" href="/requests" />
                <MetricCard title="Avg Fulfillment"      value={formatDuration(requests?.avgFulfillmentSeconds)}  icon={Hourglass}     loading={requestsLoading} accentColor="#6366F1" hint="Average time from request submission to fulfilment." />
                <MetricCard title="SLA Compliance"       value={pct(requests?.slaCompliance)}                     icon={ShieldCheck}   loading={requestsLoading} accentColor={reqSlaColor} hint="% of SLA-tracked requests fulfilled within target." />
                <MetricCard title="SLA Breached"         value={requests?.slaBreached}                            icon={ShieldAlert}   loading={requestsLoading} accentColor={requests?.slaBreached ? "#EF4444" : "#94A3B8"} />
              </div>

              {/* Top catalog items */}
              <div className="flex-1 min-h-0">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Top Catalog Items</p>
                  <p className="text-[10px] text-muted-foreground/60">avg fulfillment · {PRESET_LABELS[preset]}</p>
                </div>

                {requestsLoading ? (
                  <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                ) : !(requests?.topItems.length) ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No requests in this period.</p>
                ) : (
                  <div className="space-y-2">
                    {requests.topItems.map((item, i) => (
                      <div key={i} className="flex items-center gap-3 group">
                        {/* Rank badge */}
                        <div
                          className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                          style={{ background: RANK_COLORS[i] ?? "#6366F1" }}
                        >
                          {i + 1}
                        </div>

                        {/* Name + bar */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium truncate">{item.name}</span>
                            <div className="flex items-center gap-2 shrink-0 text-xs">
                              <span
                                className="font-bold tabular-nums"
                                style={{ color: "#0EA5E9" }}
                              >
                                {item.count}
                              </span>
                              {item.avgSeconds > 0 && (
                                <span className="text-muted-foreground tabular-nums">
                                  {formatDuration(item.avgSeconds)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${(item.count / maxReqCount) * 100}%`,
                                background: RANK_COLORS[i] ?? "#0EA5E9",
                                opacity: 0.8,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      }

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
                <CardDescription>{PRESET_LABELS[preset]} · problems with linked incidents surface systemic risk</CardDescription>
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
          <Card key="csat_trend" className="h-full flex flex-col">
            <WidgetHeader title="CSAT Trend" description={`Daily avg satisfaction · ${PRESET_LABELS[preset]}`} icon={Star} iconColor="text-yellow-500" />
            <CardContent>
              {csatTrendLoading ? (
                <Skeleton className="h-full w-full min-h-[160px]" />
              ) : (
                <ChartContainer config={csatTrendChartConfig} className="h-full w-full min-h-[160px]">
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

      // ── Channel Breakdown ────────────────────────────────────────────────────
      case "channel_breakdown": {
        const total = channelBreakdown?.data.reduce((s, d) => s + d.count, 0) ?? 0;
        const channelCfg = Object.fromEntries(
          (channelBreakdown?.data ?? []).map((d, i) => [
            d.source,
            { label: d.label, color: CHANNEL_COLORS[i % CHANNEL_COLORS.length] },
          ])
        ) satisfies ChartConfig;
        return (
          <Card key="channel_breakdown" className="h-full flex flex-col">
            <WidgetHeader
              title="Channel Breakdown"
              description={`Ticket intake by channel · ${PRESET_LABELS[preset]}`}
              icon={Layers}
              iconColor="text-indigo-500"
            />
            <CardContent className="flex-1 flex flex-col pb-4">
              {channelLoading ? (
                <Skeleton className="h-full w-full min-h-[180px]" />
              ) : !total ? (
                <EmptyState icon={Layers} title="No channel data" description="Ticket source data will appear once tickets are created" />
              ) : (
                <>
                  <ChartContainer config={channelCfg} className="min-h-[160px] flex-1">
                    <PieChart>
                      <Pie
                        data={channelBreakdown?.data}
                        dataKey="count"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        innerRadius="52%"
                        outerRadius="76%"
                        paddingAngle={3}
                        strokeWidth={2}
                      >
                        {channelBreakdown?.data.map((d, i) => (
                          <Cell key={d.source} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    </PieChart>
                  </ChartContainer>
                  <div className="space-y-1.5 mt-2">
                    {channelBreakdown?.data.map((d, i) => (
                      <div key={d.source} className="flex items-center gap-2 text-sm">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }} />
                        <span className="text-muted-foreground flex-1 text-[13px]">{d.label}</span>
                        <span className="font-semibold tabular-nums">{d.count.toLocaleString()}</span>
                        <span className="text-muted-foreground text-xs w-10 text-right">
                          {total > 0 ? `${Math.round((d.count / total) * 100)}%` : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        );
      }

      // ── Resolution Time Distribution ──────────────────────────────────────────
      case "resolution_dist":
        return (
          <Card key="resolution_dist" className="h-full flex flex-col">
            <WidgetHeader
              title="Resolution Time Distribution"
              description={`How long tickets take to close · ${PRESET_LABELS[preset]}`}
              icon={Activity}
              iconColor="text-violet-500"
            />
            <CardContent className="flex-1 pb-4">
              {resolutionLoading ? (
                <Skeleton className="h-full w-full min-h-[200px]" />
              ) : !resolutionDist?.buckets.length ? (
                <EmptyState icon={Activity} title="No resolved tickets" description="Resolution time data appears once tickets are closed" />
              ) : (
                <ChartContainer config={resolutionDistChartConfig} className="h-full w-full min-h-[200px]">
                  <BarChart data={resolutionDist.buckets} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval={0} />
                    <YAxis tickLine={false} axisLine={false} width={28} tick={{ fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {resolutionDist.buckets.map((b, i) => (
                        <Cell key={b.label} fill={RESOLUTION_BUCKET_COLORS[i] ?? "var(--primary)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        );

      // ── Agent Leaderboard ─────────────────────────────────────────────────────
      case "agent_leaderboard":
        return (
          <Card key="agent_leaderboard" className="h-full flex flex-col">
            <WidgetHeader
              title="Agent Leaderboard"
              description={`Top agents by tickets resolved · ${PRESET_LABELS[preset]}`}
              icon={Award}
              iconColor="text-amber-500"
            />
            <CardContent className="flex-1 pb-4">
              {leaderboardLoading ? (
                <div className="space-y-2.5">
                  {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : !agentLeaderboard?.agents.length ? (
                <EmptyState icon={Award} title="No agent data" description="Leaderboard appears once tickets are assigned and resolved" />
              ) : (
                <div className="space-y-2">
                  {agentLeaderboard.agents.map((agent, i) => (
                    <div key={agent.agentId} className="flex items-center gap-2.5">
                      <span className={`text-xs font-bold w-5 text-right shrink-0 ${i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : i === 2 ? "text-orange-400" : "text-muted-foreground"}`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[13px] font-medium truncate">{agent.agentName}</span>
                          <span className="text-sm font-bold tabular-nums ml-2 shrink-0">{agent.resolved}</span>
                        </div>
                        <Progress value={(agent.resolved / maxResolved) * 100} className="h-1.5" />
                      </div>
                      {agent.slaCompliancePct != null && (
                        <span className={`text-[11px] tabular-nums w-9 text-right shrink-0 font-medium ${
                          agent.slaCompliancePct >= 90 ? "text-green-600 dark:text-green-400" :
                          agent.slaCompliancePct >= 70 ? "text-amber-500" : "text-destructive"
                        }`}>
                          {agent.slaCompliancePct}%
                        </span>
                      )}
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground/60 pt-1 text-right">
                    bar = resolved · right = SLA compliance
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        );

      // ── Backlog Trend ─────────────────────────────────────────────────────────
      case "backlog_trend":
        return (
          <Card key="backlog_trend" className="h-full flex flex-col">
            <WidgetHeader
              title="Backlog Trend"
              description={`Daily tickets opened vs. resolved · ${PRESET_LABELS[preset]}`}
              icon={Activity}
              iconColor="text-blue-500"
            />
            <CardContent className="flex-1 pb-4">
              {backlogLoading ? (
                <Skeleton className="h-full w-full min-h-[180px]" />
              ) : !backlogTrend?.data.length ? (
                <EmptyState icon={Activity} title="No data" description="Backlog trend will appear once tickets are created" />
              ) : (
                <ChartContainer config={backlogChartConfig} className="h-full w-full min-h-[180px]">
                  <AreaChart data={backlogTrend.data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradOpened" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradClosed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: string) => formatDate(v, period)}
                      interval="preserveStartEnd"
                      minTickGap={40}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis tickLine={false} axisLine={false} width={28} tick={{ fontSize: 11 }} />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(v: string) =>
                            new Date(v + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                          }
                        />
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="opened"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#gradOpened)"
                    />
                    <Area
                      type="monotone"
                      dataKey="closed"
                      stroke="#22c55e"
                      strokeWidth={2}
                      fill="url(#gradClosed)"
                    />
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        );

      // ── First Contact Resolution ──────────────────────────────────────────────
      case "fcr_rate": {
        const fcrColorCls =
          fcrVariant === "good" ? "text-green-600 dark:text-green-400" :
          fcrVariant === "warn" ? "text-amber-500" :
          fcrVariant === "bad"  ? "text-destructive" : "text-foreground";
        return (
          <Card key="fcr_rate" className="h-full flex flex-col">
            <WidgetHeader
              title="First Contact Resolution"
              description={`Tickets resolved with no customer follow-up · ${PRESET_LABELS[preset]}`}
              icon={Target}
              iconColor="text-teal-500"
            />
            <CardContent className="flex-1 pb-4">
              {fcrLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-32" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-end gap-4">
                    <div>
                      <p className={`text-5xl font-bold tracking-tight ${fcrColorCls}`}>
                        {fcrData?.rate != null ? `${fcrData.rate}%` : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">FCR Rate</p>
                    </div>
                    <div className="flex-1 text-[13px] space-y-1 pb-1">
                      <div className="flex justify-between text-muted-foreground">
                        <span>First contact</span>
                        <span className="font-semibold text-foreground tabular-nums">{fcrData?.firstContact ?? "—"}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Multi-contact</span>
                        <span className="font-semibold text-foreground tabular-nums">{fcrData?.multiContact ?? "—"}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Total resolved</span>
                        <span className="font-semibold text-foreground tabular-nums">{fcrData?.total ?? "—"}</span>
                      </div>
                    </div>
                  </div>
                  {fcrData?.rate != null && (
                    <div>
                      <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
                        <span>FCR Rate</span>
                        <span className={fcrColorCls}>{fcrData.rate}% <span className="opacity-70">(target 70%)</span></span>
                      </div>
                      <Progress value={fcrData.rate} className="h-2.5 rounded-full" />
                      <div className="relative mt-1">
                        <div className="absolute left-[70%] -translate-x-1/2 -top-0.5 h-3 w-px bg-amber-400" />
                        <p className="text-[10px] text-muted-foreground/60 text-right">70% target</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      }

      // ── Top Open Tickets ──────────────────────────────────────────────────────
      case "top_open_tickets":
        return (
          <Card key="top_open_tickets" className="h-full flex flex-col">
            <WidgetHeader
              title="Oldest Open Tickets"
              description="Live snapshot — 10 longest-waiting tickets"
              icon={Inbox}
              iconColor="text-rose-500"
            />
            <CardContent className="flex-1 overflow-auto pb-2">
              {topOpenLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : !topOpen?.tickets.length ? (
                <EmptyState icon={Inbox} title="No open tickets" description="Great — there are no open tickets right now!" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[36px]"><Hash className="h-3 w-3" /></TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead className="hidden sm:table-cell">Assignee</TableHead>
                      <TableHead className="text-right">Age</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topOpen.tickets.map(t => (
                      <TableRow key={t.id} className={t.slaBreached ? "bg-destructive/5 hover:bg-destructive/10" : undefined}>
                        <TableCell className="font-mono text-[11px] text-muted-foreground pr-0">
                          <Link to={`/tickets/${t.id}`} className="hover:text-primary hover:underline">
                            {t.ticketNumber}
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <Link to={`/tickets/${t.id}`} className="font-medium text-[13px] hover:underline line-clamp-1 block">
                            {t.subject}
                          </Link>
                        </TableCell>
                        <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                        <TableCell className="hidden sm:table-cell text-[13px] text-muted-foreground truncate max-w-[120px]">
                          {t.assigneeName}
                        </TableCell>
                        <TableCell className={`text-right font-semibold tabular-nums text-[13px] ${
                          t.slaBreached ? "text-destructive" :
                          t.daysOpen >= 7 ? "text-amber-500" : ""
                        }`}>
                          {t.daysOpen}d
                          {t.slaBreached && <span className="ml-1 text-[9px] font-medium uppercase tracking-wide text-destructive/70">SLA</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <EditModeContext.Provider value={editMode}>
      <DensityContext.Provider value={density}>
        <div className="space-y-4">

          {/* ── Normal header ──────────────────────────────────────────────── */}
          {!editMode && (
            <div className="space-y-3">
              {/* ── Hero greeting strip ─────────────────────────────────── */}
              <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-background via-background to-primary/[0.04] px-6 py-5 shadow-sm">
                {/* Decorative glow orbs */}
                <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/8 blur-3xl" />
                <div className="pointer-events-none absolute -left-8 bottom-0 h-40 w-40 rounded-full bg-indigo-500/6 blur-2xl" />

                <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Left: greeting */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
                        <Activity className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h1 className="text-xl font-bold tracking-tight leading-tight">
                          {greeting}{firstName ? `, ${firstName}` : ""}
                        </h1>
                        <p className="text-xs text-muted-foreground mt-0.5">{todayLabel}</p>
                      </div>
                    </div>
                  </div>

                  {/* Right: live KPI pills */}
                  {!overviewLoading && overview && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {overview.openTickets > 0 && (
                        <Link to="/tickets?status=open"
                          className="group flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-100 transition-colors dark:border-orange-800/40 dark:bg-orange-950/30 dark:text-orange-400">
                          <CircleDot className="h-3 w-3" />
                          {overview.openTickets} open
                        </Link>
                      )}
                      {overview.escalatedTickets > 0 && (
                        <Link to="/tickets?escalated=true"
                          className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors dark:border-red-800/40 dark:bg-red-950/30 dark:text-red-400">
                          <AlertTriangle className="h-3 w-3" />
                          {overview.escalatedTickets} escalated
                        </Link>
                      )}
                      {overview.breachedTickets > 0 && (
                        <Link to="/tickets?view=overdue"
                          className="flex items-center gap-1.5 rounded-full border border-red-300 bg-red-100 px-3 py-1 text-xs font-semibold text-red-800 hover:bg-red-200 transition-colors dark:border-red-700/40 dark:bg-red-950/40 dark:text-red-300">
                          <ShieldAlert className="h-3 w-3" />
                          {overview.breachedTickets} SLA breached
                        </Link>
                      )}
                      {overview.openTickets === 0 && overview.escalatedTickets === 0 && overview.breachedTickets === 0 && (
                        <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-400">
                          <Check className="h-3 w-3" />
                          All clear
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Toolbar row ─────────────────────────────────────────── */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <DashboardSwitcher
                  activeDashboard={activeDashboard}
                  dashboardList={dashboardList}
                  onSwitch={id => setDefaultDashboard.mutate(id)}
                  onNew={name =>
                    saveDashboard.mutate({
                      dashboardId: null,
                      name,
                      config: { ...activeConfig, period: presetToPeriod(preset) },
                    })
                  }
                  onClone={() => {
                    if (activeDashboard) {
                      cloneDashboard.mutate({ dashboardId: activeDashboard.id, setAsDefault: true });
                    }
                  }}
                  onCustomize={() => setCustomizerOpen(true)}
                  isSwitching={setDefaultDashboard.isPending}
                  isCreating={saveDashboard.isPending}
                  isCloning={cloneDashboard.isPending}
                  switchError={setDefaultDashboard.error}
                />

                <div className="flex items-center gap-1.5 flex-wrap">
                  <PeriodSelector
                    preset={preset}
                    onPreset={p => { setPreset(p); if (p !== "custom") setCustomRange(null); }}
                    customRange={customRange}
                    onCustomRange={setCustomRange}
                  />

                  <div className="h-4 w-px bg-border/60 mx-0.5 hidden sm:block" />

                  {activeDashboard && (
                    <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground"
                      onClick={() => cloneDashboard.mutate({ dashboardId: activeDashboard.id, setAsDefault: true })}
                      disabled={cloneDashboard.isPending}>
                      {cloneDashboard.isPending
                        ? <Settings2 className="h-3.5 w-3.5 animate-spin" />
                        : <Copy className="h-3.5 w-3.5" />}
                      <span className="hidden sm:inline">Clone</span>
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground"
                    onClick={() => setTemplateDialogOpen(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">From Template</span>
                  </Button>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground"
                    onClick={enterEditMode}>
                    <PenLine className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Edit Layout</span>
                  </Button>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground"
                    onClick={() => setCustomizerOpen(true)}>
                    <Settings2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Customize</span>
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ── Edit mode banner ───────────────────────────────────────────── */}
          {editMode && (
            <div className="rounded-xl bg-primary/5 border border-primary/20 overflow-hidden">
              {/* Top row: info + main actions */}
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="flex items-center gap-2 text-sm text-primary font-medium min-w-0">
                  <PenLine className="h-4 w-4 shrink-0" />
                  <span className="hidden md:inline truncate">
                    Drag freely · resize from corners · use <Palette className="inline h-3 w-3" /> to style each widget
                  </span>
                  <span className="md:hidden">Edit layout</span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Undo */}
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                    title="Undo (Ctrl+Z)" disabled={historyIndex <= 0}
                    onClick={undoLayout}>
                    <Undo2 className="h-3.5 w-3.5" />
                  </Button>
                  {/* Redo */}
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                    title="Redo" disabled={historyIndex >= layoutHistory.length - 1}
                    onClick={redoLayout}>
                    <Redo2 className="h-3.5 w-3.5" />
                  </Button>

                  <div className="h-4 w-px bg-border/60 mx-0.5" />

                  {/* Snap toggle */}
                  <Button
                    variant={snapEnabled ? "default" : "outline"}
                    size="sm"
                    className={`h-8 gap-1.5 text-xs ${snapEnabled ? "" : "text-muted-foreground"}`}
                    title={snapEnabled ? "Snapping on — click to go free-form" : "Free-form — click to enable snapping"}
                    onClick={() => setSnapEnabled(s => !s)}
                  >
                    {snapEnabled
                      ? <Magnet    className="h-3.5 w-3.5" />
                      : <Move className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">{snapEnabled ? "Snap On" : "Free"}</span>
                  </Button>

                  <div className="h-4 w-px bg-border/60 mx-0.5" />

                  {/* Widgets picker */}
                  <Button variant="outline" size="sm" className="gap-1.5 h-8"
                    onClick={() => setWidgetPickerOpen(true)}>
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Widgets</span>
                  </Button>

                  {/* Auto-fit */}
                  <Button variant="outline" size="sm" className="gap-1.5 h-8"
                    title="Repack all widgets to eliminate gaps"
                    onClick={autoFitLayout}>
                    <Layers className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Auto-fit</span>
                  </Button>

                  {/* Reset to default */}
                  <Popover open={resetPopoverOpen} onOpenChange={setResetPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5 h-8 text-muted-foreground hover:text-destructive hover:border-destructive/40">
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Reset</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72 p-4">
                      <div className="space-y-3">
                        <div className="flex items-start gap-2.5">
                          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-semibold">Restore to default?</p>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                              This will replace the current layout with the system default. All custom widget positions, sizes, and styles will be lost.
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="destructive" className="flex-1 h-7 text-xs gap-1"
                            onClick={restoreToDefault}>
                            <RotateCcw className="h-3 w-3" /> Restore Default
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs"
                            onClick={() => setResetPopoverOpen(false)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  <div className="h-4 w-px bg-border/60 mx-0.5" />

                  <Button variant="outline" size="sm" className="h-8" onClick={cancelEditMode}>
                    Cancel
                  </Button>
                  <Button size="sm" className="h-8 gap-1.5" onClick={saveLayout} disabled={saveDashboard.isPending}>
                    {saveDashboard.isPending && <Settings2 className="h-3.5 w-3.5 animate-spin" />}
                    Save Layout
                  </Button>
                </div>
              </div>

              {/* Bottom hint strip */}
              <div className="px-4 py-1.5 border-t border-primary/10 bg-primary/[0.03] flex items-center gap-4 text-[10px] text-muted-foreground/70 flex-wrap">
                <span className="flex items-center gap-1"><Magnet className="h-2.5 w-2.5" /> Toggle snap for auto-compaction</span>
                <span className="flex items-center gap-1"><Layers className="h-2.5 w-2.5" /> Auto-fit repacks widgets to eliminate empty space</span>
                <span className="flex items-center gap-1"><Palette className="h-2.5 w-2.5" /> Click the palette icon on a widget's drag bar to style it</span>
                <span className="flex items-center gap-1"><Undo2 className="h-2.5 w-2.5" /> Undo/redo with the arrows · <RotateCcw className="inline h-2.5 w-2.5 mx-0.5" /> Reset restores defaults</span>
              </div>
            </div>
          )}

          {overviewError && (
            <ErrorAlert error={overviewError} fallback="Failed to load overview stats" />
          )}

          {/* ── Grid layout ────────────────────────────────────────────────── */}
          <RGL
            layout={gridLayout}
            cols={GRID_COLS}
            rowHeight={rowHeight}
            margin={[12, 12]}
            containerPadding={[0, 0]}
            compactType={editMode && snapEnabled ? "vertical" : null}
            isDraggable={editMode}
            isResizable={editMode}
            draggableHandle=".widget-drag-handle"
            onLayoutChange={handleLayoutChange}
            className={editMode ? "rgl-edit-mode" : ""}
            useCSSTransforms
            preventCollision={editMode && !snapEnabled}
          >
            {orderedWidgets.map(w => {
              const currentItem = gridLayout.find(l => l.i === w.id);
              const currentW    = currentItem?.w ?? (w.w ?? WIDGET_LAYOUT_DEFAULTS[w.id].w);
              const appearance  = (w as any).appearance as WidgetAppearance | undefined;
              return (
                <div key={w.id}>
                  <DashboardWidget
                    id={w.id}
                    editMode={editMode}
                    currentW={currentW}
                    appearance={appearance}
                    onWidthChange={newW => handleWidthPreset(w.id, newW)}
                    onEditStyle={editMode ? () => setStyleEditWidget(w.id) : undefined}
                  >
                    {renderWidget(w.id)}
                  </DashboardWidget>
                </div>
              );
            })}
          </RGL>

          {/* ── Widget appearance editor ──────────────────────────────────── */}
          {styleEditWidget && (
            <WidgetAppearanceEditor
              open={!!styleEditWidget}
              onOpenChange={v => { if (!v) setStyleEditWidget(null); }}
              widgetId={styleEditWidget}
              appearance={(activeConfig.widgets.find(w => w.id === styleEditWidget) as any)?.appearance}
              onSave={appearance => saveWidgetAppearance(styleEditWidget, appearance)}
            />
          )}

          {/* ── Widget picker dialog ──────────────────────────────────────── */}
          <WidgetPickerDialog
            open={widgetPickerOpen}
            onOpenChange={setWidgetPickerOpen}
            widgets={activeConfig.widgets}
            onToggle={toggleWidgetPicker}
          />

          {/* ── Customizer dialog ─────────────────────────────────────────── */}
          <DashboardTemplateDialog
            open={templateDialogOpen}
            onOpenChange={setTemplateDialogOpen}
          />

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
              onClone={handleClone}
              isSaving={saveDashboard.isPending}
              isCloning={cloneDashboard.isPending}
              saveError={saveDashboard.error}
            />
          )}
        </div>
      </DensityContext.Provider>
    </EditModeContext.Provider>
  );
}
