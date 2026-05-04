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
  LabelList,
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
  CUSTOM_FIELD_LAYOUT_DEFAULT,
  isCustomFieldWidget,
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
  CheckCircle2,
  Activity,
  Target,
  Award,
  Trophy,
  Medal,
  Tag,
  Layers,
  Inbox,
  Hash,
  LayoutGrid,
  Undo2,
  Redo2,
  Magnet,
  Move,
  Palette,
  Loader2,
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
  // Custom-field widgets don't have a static meta entry; show a clean
  // "Custom Field · <fieldKey>" label in the edit-mode drag bar so admins
  // can identify which widget they're moving without a giant raw id.
  const builtinLabel = WIDGET_META[id as keyof typeof WIDGET_META]?.label;
  const customLabel  = isCustomFieldWidget(id)
    ? `Custom Field · ${id.split(":").slice(2).join(":").replace(/^custom_/, "")}`
    : null;
  const label        = appearance?.titleOverride || builtinLabel || customLabel || id;
  const accentColor  = appearance?.accentColor;
  const scale        = appearance?.scale ?? 1;

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
            {/* Width presets — each highlights for the range up to its w
                (e.g. ¼ → 1-3, ½ → 4-6, ⅔ → 7-8, Full → 9-12) */}
            {([
              { label: "¼",    w: 3,  prev: 0 },
              { label: "½",    w: 6,  prev: 3 },
              { label: "⅔",    w: 8,  prev: 6 },
              { label: "Full", w: 12, prev: 8 },
            ] as const).map(preset => {
              const active = currentW > preset.prev && currentW <= preset.w;
              return (
                <button
                  key={preset.w}
                  type="button"
                  title={`${preset.label} width`}
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => onWidthChange(preset.w)}
                  className={[
                    "px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors",
                    active
                      ? "text-white"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  ].join(" ")}
                  style={active ? { background: accentColor ?? "hsl(var(--primary))" } : undefined}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Widget content — when scale != 1 we wrap in a transform-scale layer.
          The inner content still lays out at full cell size (so MetricCard's
          h-full fills the cell), then transform-scale visibly shrinks/grows
          it from the top-left corner. This gives the user "the small
          rectangle inside the widget" growing or shrinking, while the
          outer cell stays the size they laid out. */}
      <div className={`flex-1 min-h-0 overflow-auto ${editMode ? "pointer-events-none" : ""}`}>
        {scale !== 1 ? (
          <div
            className="origin-top-left h-full w-full"
            style={{ transform: `scale(${scale})` }}
          >
            {children}
          </div>
        ) : children}
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

interface ChangeAnalytics {
  total: number;
  failed: number;
  emergency: number;
  successRate: number | null;
  avgApprovalSec: number | null;
  byState: { state: string; count: number }[];
  byType:  { type:  string; count: number }[];
  byRisk:  { risk:  string; count: number }[];
}

interface AssetHealth {
  total:    number;
  active:   number;
  in_stock: number;
  deployed: number;
  in_use:   number;
  maint:    number;
  byStatus: { status: string; count: number }[];
  byType:   { type:   string; count: number }[];
}

interface KbInsights {
  totalSearches: number;
  uniqueQueries: number;
  zeroResultRate: number | null;
  topQueries: { query: string; count: number; zeroResultsCount: number }[];
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

// Direct hex codes — Recharts renders `fill` straight onto SVG which
// doesn't reliably resolve `hsl(var(--destructive))` when --destructive
// is itself an oklch() value (browser falls back to black). Use the
// underlying tailwind colour palette directly.
const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#ef4444",  // red-500
  high:   "#f97316",  // orange-500
  medium: "#eab308",  // yellow-500
  low:    "#22c55e",  // green-500
  unset:  "#94a3b8",  // slate-400 — mute the "no priority" bar so it doesn't fight the real categories
};

const AGING_COLORS: Record<number, string> = {
  1: "#22c55e",  // < 24h — fresh, healthy
  2: "#eab308",  // 1–3 days
  3: "#f97316",  // 3–7 days
  4: "#ef4444",  // > 7 days — overdue, needs attention
};

const incidentChartConfig = {
  count: { label: "Incidents", color: "var(--primary)" },
} satisfies ChartConfig;

const csatTrendChartConfig = {
  avgRating: { label: "Avg Rating", color: "var(--primary)" },
} satisfies ChartConfig;

const backlogChartConfig = {
  opened: { label: "Opened",   color: "hsl(var(--foreground))" },
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
  /** Stretch the card to fill its parent grid cell — used when a MetricCard
   *  is rendered as a standalone dashboard widget rather than nested inside
   *  a composite container. */
  fillCard?: boolean;
}

function MetricCard({
  title, value, icon: Icon, hint, loading,
  variant = "default", href, accentColor, sub, fillCard = false,
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

  const isEmpty = !loading && (value === null || value === undefined || value === "");

  const card = (
    <Card
      className={[
        "relative overflow-hidden rounded-2xl border transition-all duration-200 group/metric",
        href ? "hover:shadow-lg hover:-translate-y-0.5 cursor-pointer" : "",
        "shadow-[0_1px_2px_rgba(15,23,42,0.04),0_1px_3px_rgba(15,23,42,0.06)]",
        fillCard ? "flex flex-col w-[240px]" : "",
      ].join(" ")}
      style={resolvedColor ? {
        // Tinted top edge — same stroke colour as the accent, but as a soft
        // 2px bar baked into the border for a tighter, more refined look.
        borderTopColor: `${resolvedColor}cc`,
        borderTopWidth: 2,
      } : undefined}
    >
      {/* Soft diagonal tint wash — keeps the card feeling alive without competing with the number. */}
      {resolvedColor && (
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-300 opacity-90 group-hover/metric:opacity-100"
          style={{ background: `linear-gradient(135deg, ${resolvedColor}10 0%, ${resolvedColor}04 38%, transparent 75%)` }}
        />
      )}

      {/* Decorative blurred halo behind the number — purely visual polish. */}
      {resolvedColor && (
        <div
          className="absolute -bottom-12 -right-10 h-32 w-32 rounded-full pointer-events-none opacity-60 blur-3xl transition-opacity duration-300 group-hover/metric:opacity-90"
          style={{ background: `radial-gradient(circle at center, ${resolvedColor}30 0%, transparent 70%)` }}
        />
      )}

      {/* Crisp accent rail at the very bottom — anchors the card. */}
      {resolvedColor && (
        <div
          className="absolute bottom-0 left-0 right-0 h-[2px] pointer-events-none opacity-70"
          style={{ background: `linear-gradient(90deg, transparent 0%, ${resolvedColor}80 30%, ${resolvedColor}80 70%, transparent 100%)` }}
        />
      )}

      <CardHeader className={density === "compact" ? "pb-1 relative" : "pb-2 relative"}>
        <div className="flex items-start justify-between gap-2">
          {/* Icon badge — bigger, layered, with halo ring */}
          <div
            className="metric-card-icon-badge h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 group-hover/metric:scale-105 group-hover/metric:rotate-[-2deg]"
            style={resolvedColor
              ? {
                  background: `linear-gradient(140deg, ${resolvedColor}26 0%, ${resolvedColor}10 100%)`,
                  border: `1px solid ${resolvedColor}40`,
                  boxShadow: `inset 0 1px 0 0 ${resolvedColor}25, 0 0 0 4px ${resolvedColor}0a`,
                }
              : { background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }
            }
          >
            <Icon
              className="metric-card-icon h-[18px] w-[18px]"
              strokeWidth={2.25}
              style={resolvedColor ? { color: resolvedColor } : { color: "hsl(var(--muted-foreground))" }}
            />
          </div>
          {/* Hint */}
          {hint && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground/40 cursor-default mt-0.5 shrink-0 hover:text-muted-foreground transition-colors" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px] text-xs leading-relaxed">{hint}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <CardTitle className="metric-card-title text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80 leading-tight mt-3 inline-flex items-center gap-1.5">
          {/* Tiny accent dot */}
          {resolvedColor && (
            <span
              className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
              style={{ background: resolvedColor, boxShadow: `0 0 0 2px ${resolvedColor}25` }}
            />
          )}
          <span className="truncate">{title}</span>
        </CardTitle>
      </CardHeader>

      <CardContent className="relative pt-0">
        {loading ? (
          <Skeleton className={density === "compact" ? "h-7 w-16" : "h-9 w-20"} />
        ) : (
          <div>
            <p
              className={[
                "metric-card-value font-extrabold tracking-tight leading-none tabular-nums",
                density === "compact" ? "text-[1.75rem]" : "text-[2.25rem]",
                isEmpty ? "text-muted-foreground/50 font-bold" : "",
              ].join(" ")}
              style={isEmpty ? undefined : valueStyle}
            >
              {value ?? "—"}
            </p>
            {sub && <p className="text-[11px] text-muted-foreground mt-2 leading-tight">{sub}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );

  const linkClassName =
    "block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl";

  const wrapped = href ? (
    <Link to={href} className={linkClassName}>{card}</Link>
  ) : card;

  // When this MetricCard is rendered as a standalone dashboard widget
  // (fillCard), wrap it in an auto-fit scaler so the whole card — icon,
  // label, value, padding — grows and shrinks proportionally with the cell
  // in BOTH axes. The card itself renders at a fixed natural size and a
  // ResizeObserver-driven transform: scale() fits it into whatever the
  // grid cell is currently. This is what makes dragging the corner of a
  // widget actually scale the contents instead of just stretching the
  // outer border.
  if (fillCard) {
    return <AutoFitBox>{wrapped}</AutoFitBox>;
  }
  return wrapped;
}

/**
 * Wraps a child of arbitrary natural size in a layer that uses
 * `transform: scale()` to fit it inside the available cell while
 * preserving aspect ratio.
 *
 * The natural size is *measured*, not declared — the child renders at its
 * intrinsic content size (offsetWidth/Height), and a ResizeObserver
 * computes the scale needed to fit that box into the current cell. So
 * cells smaller than the content shrink the content; cells larger than
 * the content grow it. No clipped numbers, no fixed magic dimensions.
 */
function AutoFitBox({ children }: { children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const compute = () => {
      const cell = outer.getBoundingClientRect();
      // offsetWidth/Height return the *pre-transform* layout size, so
      // they're stable across our scale changes. getBoundingClientRect on
      // the inner would feed back into the calculation and oscillate.
      const natW = inner.offsetWidth;
      const natH = inner.offsetHeight;
      if (cell.width === 0 || cell.height === 0 || natW === 0 || natH === 0) return;
      const s = Math.min(cell.width / natW, cell.height / natH, 4);
      setScale(s);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outerRef} className="h-full w-full overflow-hidden flex items-center justify-center">
      <div
        ref={innerRef}
        style={{
          // Let the child take its intrinsic content size — neither
          // stretched by flex nor clamped by a parent. transform: scale
          // then fits whatever that intrinsic size happens to be.
          width:  "max-content",
          height: "max-content",
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          flexShrink: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
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

// ── CustomFieldWidget ────────────────────────────────────────────────────────
//
// Renders a generic distribution chart for an admin-defined custom field on
// any ITSM entity. Loads its own data via /api/reports/custom-field-distribution
// using the widget id (`cf:<entity>:<key>`) to derive the entity type and
// field key. Visual treatment matches the polished `breakdown_category`
// widget — header + top-bucket callout + ranked bar list — so it sits
// naturally beside the built-in distribution widgets on a dashboard.

interface CustomFieldDistribution {
  field:   { key: string; label: string; type: string; options: string[] };
  buckets: { value: string; label: string; count: number }[];
  total:   number;
  missing: number;
}

const CF_ENTITY_LABEL: Record<string, string> = {
  ticket:   "tickets",
  incident: "incidents",
  request:  "service requests",
  change:   "changes",
  problem:  "problems",
};

const CF_BAR_TONES = [
  { bar: "bg-gradient-to-r from-violet-400  to-violet-600",  dot: "bg-violet-500"  },
  { bar: "bg-gradient-to-r from-rose-400    to-rose-600",    dot: "bg-rose-500"    },
  { bar: "bg-gradient-to-r from-teal-400    to-teal-600",    dot: "bg-teal-500"    },
  { bar: "bg-gradient-to-r from-amber-400   to-amber-600",   dot: "bg-amber-500"   },
  { bar: "bg-gradient-to-r from-blue-400    to-blue-600",    dot: "bg-blue-500"    },
  { bar: "bg-gradient-to-r from-indigo-400  to-indigo-600",  dot: "bg-indigo-500"  },
  { bar: "bg-gradient-to-r from-emerald-400 to-emerald-600", dot: "bg-emerald-500" },
  { bar: "bg-gradient-to-r from-fuchsia-400 to-fuchsia-600", dot: "bg-fuchsia-500" },
];
function cfToneFor(label: string) {
  const seed = label.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  return CF_BAR_TONES[seed % CF_BAR_TONES.length]!;
}

function CustomFieldWidget({
  id,
  fromTo,
  preset,
}: {
  id: string;
  fromTo: string;
  preset: TimePreset;
}) {
  // Parse the dynamic id; bail out gracefully if it's malformed.
  const m = id.match(/^cf:([a-z]+):(.+)$/);
  const entityType = m?.[1] ?? null;
  const fieldKey   = m?.[2] ?? null;

  const { data, isLoading, error } = useQuery<CustomFieldDistribution>({
    queryKey: ["custom-field-distribution", entityType, fieldKey, fromTo],
    queryFn: () =>
      axios
        .get<CustomFieldDistribution>(
          `/api/reports/custom-field-distribution?entityType=${entityType}&fieldKey=${fieldKey}&${fromTo}`,
        )
        .then((r) => r.data),
    enabled: !!entityType && !!fieldKey,
    staleTime: STALE_TIME,
  });

  const buckets   = data?.buckets ?? [];
  const grandTot  = buckets.reduce((s, b) => s + b.count, 0);
  const maxCount  = buckets.reduce((m, b) => Math.max(m, b.count), 0) || 1;
  const top       = buckets[0] ?? null;
  const entityWord = CF_ENTITY_LABEL[entityType ?? ""] ?? "rows";

  return (
    <Card key={id} className="h-full flex flex-col">
      <WidgetHeader
        title={data?.field.label ?? "Custom field"}
        description={`Distribution by ${data?.field.label?.toLowerCase() ?? "field"} · ${PRESET_LABELS[preset]} · ${entityWord}`}
        icon={Tag}
        iconColor="text-fuchsia-500"
      />
      <CardContent className="flex-1 pb-4">
        {isLoading ? (
          <div className="space-y-2.5">
            <Skeleton className="h-14 w-full rounded-lg" />
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-lg" />)}
          </div>
        ) : error ? (
          <EmptyState icon={Tag} title="Couldn't load" description="The custom field's data couldn't be retrieved. Reload to try again." />
        ) : !buckets.length ? (
          <EmptyState
            icon={Tag}
            title="No data yet"
            description={`No ${entityWord} have a value for this field in the selected period.`}
          />
        ) : (
          <div className="flex flex-col h-full gap-3">

            {/* Top-bucket callout */}
            {top && (
              <div className="rounded-lg border border-fuchsia-500/25 bg-gradient-to-br from-fuchsia-500/[0.08] via-fuchsia-500/[0.04] to-transparent px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
                    Most common
                  </span>
                  <span className="ml-auto text-[10px] font-semibold tabular-nums text-muted-foreground">
                    {grandTot} total{data?.missing ? ` · ${data.missing} blank` : ""}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2 mt-0.5">
                  <span className="text-sm font-bold tracking-tight truncate">{top.label}</span>
                  <span className="text-xl font-bold tabular-nums tracking-tight text-fuchsia-600 dark:text-fuchsia-400 shrink-0">
                    {top.count}
                    <span className="text-[11px] font-medium text-muted-foreground ml-1">
                      ({grandTot > 0 ? Math.round((top.count / grandTot) * 100) : 0}%)
                    </span>
                  </span>
                </div>
              </div>
            )}

            {/* Bar list */}
            <ul className="space-y-1.5 flex-1 min-h-0 overflow-y-auto pr-1">
              {buckets.map((b) => {
                const tone  = cfToneFor(b.label);
                const pct   = (b.count / maxCount) * 100;
                const share = grandTot > 0 ? Math.round((b.count / grandTot) * 100) : 0;
                return (
                  <li key={b.value}>
                    <div className="rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${tone.dot}`} />
                        <span className="text-[12.5px] font-medium truncate flex-1">
                          {b.label}
                        </span>
                        <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                          {share}%
                        </span>
                        <span className="text-sm font-bold tabular-nums shrink-0 w-7 text-right">
                          {b.count}
                        </span>
                      </div>
                      <div className="relative h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={`absolute inset-y-0 left-0 rounded-full transition-all ${tone.bar}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
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

  // Resolve a colour for each row up-front so we can declare a unique
  // gradient per bar in <defs>. Recharts' Cell fill is referenced via a
  // url(#id) so each bar gets a smooth lighten-to-darken gradient instead
  // of a flat block of colour.
  const PRIMARY_FALLBACK = "#6366f1"; // indigo-500 — won't go black under any theme
  function resolveColor(entry: Record<string, unknown>): string {
    if (colorMap && colorKey) return colorMap[entry[colorKey] as string | number] ?? PRIMARY_FALLBACK;
    if (colorMap && sortKey)  return colorMap[entry[sortKey]  as string | number] ?? PRIMARY_FALLBACK;
    if (colorKey)             return PRIORITY_COLORS[entry[colorKey] as string] ?? PRIMARY_FALLBACK;
    return PRIMARY_FALLBACK;
  }
  const colors  = data.map(resolveColor);
  const max     = Math.max(...data.map((d) => Number(d[dataKey] ?? 0)), 1);
  // Stable id prefix so two charts on the same page don't fight each other
  // for the same gradient definitions.
  const gradId  = (i: number) => `hbar-grad-${labelKey}-${dataKey}-${i}`;

  return (
    <ChartContainer config={config} className="h-full w-full min-h-[160px]">
      <BarChart
        layout="vertical"
        data={data}
        margin={{ left: 0, right: 36, top: 6, bottom: 6 }}
        barCategoryGap="22%"
      >
        <defs>
          {colors.map((c, i) => (
            <linearGradient key={i} id={gradId(i)} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor={c} stopOpacity={0.65} />
              <stop offset="100%" stopColor={c} stopOpacity={1} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid horizontal={false} stroke="hsl(var(--border) / 0.4)" strokeDasharray="2 4" />
        <XAxis type="number" hide domain={[0, max * 1.15]} />
        <YAxis
          type="category"
          dataKey={labelKey}
          width={104}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fontWeight: 500, fill: "hsl(var(--muted-foreground))" }}
        />
        <ChartTooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} content={<ChartTooltipContent />} />
        <Bar
          dataKey={dataKey}
          // Slightly bigger pill radius — looks more "card-like" than a bar
          radius={[3, 6, 6, 3]}
          style={{ cursor: onBarClick ? "pointer" : undefined }}
          onClick={onBarClick ? (entry) => onBarClick(entry as Record<string, unknown>) : undefined}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={`url(#${gradId(i)})`} />
          ))}
          {/* Inline count at the end of each bar — saves the user from
              hovering just to read a number. Tabular-nums keeps multi-
              digit values aligned across bars. */}
          <LabelList
            dataKey={dataKey}
            position="right"
            offset={8}
            style={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))", fontVariantNumeric: "tabular-nums" }}
          />
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

/**
 * Compact health-status label for CSAT cards. Pairs with `accentColor` so
 * each card stays visually distinct (gold/green/rose/indigo) while the
 * sub-line still communicates the underlying trend health.
 */
function csatHealthLabel(v: Variant): string {
  if (v === "good") return "● Healthy";
  if (v === "warn") return "● Watch";
  if (v === "bad")  return "● At risk";
  return "● No data";
}

function RatingDistribution({ distribution, total }: { distribution: Record<number, number>; total: number }) {
  if (total === 0) return null;

  // Per-rating accent colour — sentiment-aware (5★ green → 1★ red)
  const TONE: Record<number, { color: string; bg: string }> = {
    5: { color: "#10b981", bg: "#10b98119" },
    4: { color: "#22c55e", bg: "#22c55e19" },
    3: { color: "#f59e0b", bg: "#f59e0b19" },
    2: { color: "#f97316", bg: "#f9731619" },
    1: { color: "#ef4444", bg: "#ef444419" },
  };

  // Weighted average for the summary header
  const sum = [1, 2, 3, 4, 5].reduce((s, n) => s + n * (distribution[n] ?? 0), 0);
  const avg = total > 0 ? sum / total : 0;
  const topBucket = [5, 4, 3, 2, 1].reduce((m, n) => ((distribution[n] ?? 0) > (distribution[m] ?? 0) ? n : m), 5);

  return (
    <div className="space-y-3">
      {/* Summary header — average rating + visual stars */}
      <div className="flex items-end gap-3 pb-3 border-b border-border/60">
        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-extrabold tabular-nums tracking-tight">
              {avg.toFixed(1)}
            </span>
            <span className="text-sm font-medium text-muted-foreground">/ 5</span>
          </div>
          <div className="flex items-center gap-0.5 mt-0.5">
            {[1, 2, 3, 4, 5].map((s) => {
              // Filled when avg >= s, half when between s-1 and s
              const filled = avg >= s;
              const half = !filled && avg > s - 1 && avg < s;
              return (
                <span key={s} className="relative inline-block h-3 w-3">
                  <Star className="absolute inset-0 h-3 w-3 text-amber-200" />
                  {(filled || half) && (
                    <span
                      className="absolute inset-0 overflow-hidden"
                      style={{ width: half ? "50%" : "100%" }}
                    >
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
        <div className="ml-auto text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Ratings</p>
          <p className="text-base font-bold tabular-nums leading-tight">{total.toLocaleString()}</p>
        </div>
      </div>

      {/* Distribution bars */}
      <div className="space-y-1.5">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = distribution[star] ?? 0;
          const pct   = total > 0 ? (count / total) * 100 : 0;
          const tone  = TONE[star]!;
          const isTop = star === topBucket && count > 0;
          return (
            <div
              key={star}
              className={[
                "group/row flex items-center gap-2.5 px-1.5 py-1 rounded-md transition-colors",
                isTop ? "" : "hover:bg-muted/40",
              ].join(" ")}
            >
              {/* Star label */}
              <span className="flex items-center gap-0.5 w-9 shrink-0 text-xs tabular-nums font-medium">
                <span style={{ color: tone.color }} className="font-semibold">{star}</span>
                <Star className="h-3 w-3" style={{ color: tone.color, fill: tone.color }} />
              </span>

              {/* Progress bar with gradient fill */}
              <div className="relative h-2 flex-1 rounded-full overflow-hidden" style={{ background: tone.bg }}>
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${tone.color}, ${tone.color}cc)`,
                    boxShadow: count > 0 ? `0 0 8px ${tone.color}40` : undefined,
                  }}
                />
              </div>

              {/* Count + percentage */}
              <div className="flex items-center gap-1 w-[68px] justify-end shrink-0">
                <span className="text-[10px] tabular-nums text-muted-foreground/70 w-9 text-right">
                  {count > 0 ? `${pct.toFixed(0)}%` : "—"}
                </span>
                <span
                  className={[
                    "text-xs font-bold tabular-nums w-6 text-right",
                    count === 0 ? "text-muted-foreground/40" : "",
                  ].join(" ")}
                  style={count > 0 ? { color: tone.color } : undefined}
                >
                  {count}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Widget Picker Dialog ──────────────────────────────────────────────────────
// Shown in edit mode; lets users add/remove widgets from the dashboard.

type WidgetPhase = "adding" | "added" | "removing" | "removed";

function WidgetPickerDialog({
  open,
  onOpenChange,
  widgets,
  onToggle,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widgets: WidgetConfig[];
  onToggle: (id: WidgetId) => void;
  /** True while the most recent toggle save is in flight. */
  isSaving: boolean;
}) {
  const visibleIds = new Set(widgets.filter(w => w.visible).map(w => w.id));

  // Fetch the global custom-field registry — admins can add a distribution
  // widget for any visible custom field on any ITSM form. Lazy-loaded when
  // the dialog opens so the picker stays cheap when nobody's customising.
  const { data: customFields = [], isLoading: loadingCustomFields } =
    useQuery<{ id: number; entityType: string; key: string; label: string; fieldType: string }[]>({
      queryKey: ["custom-fields-all"],
      queryFn: () =>
        axios.get<{ fields: { id: number; entityType: string; key: string; label: string; fieldType: string }[] }>(
          "/api/custom-fields/all",
        ).then((r) => r.data.fields),
      enabled: open,
      staleTime: 60_000,
    });

  // Group fields by entity type so each entity gets its own subsection in
  // the picker. Skip field types that can't be meaningfully bucketed
  // (free-form text, textarea, url, email, number) — the distribution
  // widget only makes sense for select/multiselect/switch/date.
  const DIST_FRIENDLY = new Set(["select", "multiselect", "switch"]);
  const ENTITY_LABELS: Record<string, string> = {
    ticket:   "Tickets",
    incident: "Incidents",
    request:  "Service Requests",
    change:   "Changes",
    problem:  "Problems",
  };
  const customFieldsByEntity = customFields
    .filter((f) => DIST_FRIENDLY.has(f.fieldType))
    .reduce<Record<string, typeof customFields>>((acc, f) => {
      (acc[f.entityType] ??= []).push(f);
      return acc;
    }, {});

  // Per-widget animated phase: "adding" / "removing" while the save is in
  // flight, then "added" / "removed" briefly to confirm success. Cleared
  // automatically. Ensures every click in this picker has a visible response
  // — the bug you saw ("clicking does nothing") was a missing entry in the
  // saved config combined with no UI feedback for the click itself.
  const [phase, setPhase] = useState<Record<string, WidgetPhase>>({});
  const inflight = useRef<{ id: WidgetId; intent: "adding" | "removing" } | null>(null);
  const timers   = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  // When isSaving transitions from true → false, the in-flight toggle just
  // resolved — flip its phase to the "done" variant for ~1s, then clear.
  const wasSaving = useRef(false);
  useEffect(() => {
    if (wasSaving.current && !isSaving && inflight.current) {
      const { id, intent } = inflight.current;
      setPhase(p => ({ ...p, [id]: intent === "adding" ? "added" : "removed" }));
      const t = setTimeout(() => {
        setPhase(p => { const n = { ...p }; delete n[id]; return n; });
      }, 1100);
      timers.current.push(t);
      inflight.current = null;
    }
    wasSaving.current = isSaving;
  }, [isSaving]);

  function handleClick(id: WidgetId) {
    const isOn = visibleIds.has(id);
    const intent: "adding" | "removing" = isOn ? "removing" : "adding";
    inflight.current = { id, intent };
    setPhase(p => ({ ...p, [id]: intent }));
    onToggle(id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-primary" />
            Widget Library
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Click any widget to add it to your dashboard. Changes save automatically.
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
                  const ph      = phase[id];
                  const busy    = ph === "adding" || ph === "removing";

                  // Phase → ring + chip styling
                  const ringClass =
                    ph === "adding"   || ph === "added"   ? "ring-2 ring-emerald-500/40 bg-emerald-500/5" :
                    ph === "removing" || ph === "removed" ? "ring-2 ring-amber-500/40  bg-amber-500/5"   : "";

                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleClick(id)}
                      disabled={busy}
                      className={[
                        "relative flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
                        isOn
                          ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                          : "border-border hover:border-primary/30 hover:bg-muted/40",
                        ringClass,
                        busy && "opacity-90",
                      ].filter(Boolean).join(" ")}
                    >
                      <div className={`mt-0.5 h-6 w-6 rounded-md flex items-center justify-center shrink-0 ${isOn ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        {busy
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : isOn
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

                      {/* Two-phase chip — Adding…/Added on add, Removing…/Removed on remove */}
                      {ph && (
                        <span
                          className={[
                            "pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider border shadow-sm animate-in fade-in slide-in-from-top-1",
                            (ph === "adding"   || ph === "added")   && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
                            (ph === "removing" || ph === "removed") && "bg-amber-500/15   text-amber-700  dark:text-amber-300  border-amber-500/30",
                          ].filter(Boolean).join(" ")}
                        >
                          {ph === "adding"   && <><Loader2 className="h-2.5 w-2.5 animate-spin" />Adding…</>}
                          {ph === "added"    && <><Check    className="h-2.5 w-2.5" />Added</>}
                          {ph === "removing" && <><Loader2 className="h-2.5 w-2.5 animate-spin" />Removing…</>}
                          {ph === "removed"  && <><Check    className="h-2.5 w-2.5" />Removed</>}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* ── Custom Fields section — one entry per admin-defined field ── */}
          {(loadingCustomFields || Object.keys(customFieldsByEntity).length > 0) && (
            <div>
              <div className="flex items-baseline gap-2 mb-2.5">
                <h3 className="text-[10px] font-semibold text-fuchsia-600 dark:text-fuchsia-400 uppercase tracking-widest">
                  Custom Fields
                </h3>
                <span className="text-[10px] text-muted-foreground/70">
                  Distribution widgets for fields you've added to ITSM forms
                </span>
              </div>

              {loadingCustomFields ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="h-[68px] rounded-lg border border-dashed border-border/50 bg-muted/20 animate-pulse" />
                  ))}
                </div>
              ) : (
                Object.entries(customFieldsByEntity).map(([entity, fields]) => (
                  <div key={entity} className="space-y-2 mb-4 last:mb-0">
                    <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="h-[2px] w-3 rounded-full bg-gradient-to-r from-fuchsia-500/60 to-fuchsia-500/0" />
                      {ENTITY_LABELS[entity] ?? entity}
                      <span className="text-muted-foreground/50">· {fields.length}</span>
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {fields.map((f) => {
                        const id    = `cf:${f.entityType}:${f.key}` as WidgetId;
                        const isOn  = visibleIds.has(id);
                        const ph    = phase[id];
                        const busy  = ph === "adding" || ph === "removing";
                        const ringClass =
                          ph === "adding"   || ph === "added"   ? "ring-2 ring-emerald-500/40 bg-emerald-500/5" :
                          ph === "removing" || ph === "removed" ? "ring-2 ring-amber-500/40  bg-amber-500/5"   : "";

                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => handleClick(id)}
                            disabled={busy}
                            className={[
                              "relative flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
                              isOn
                                ? "border-fuchsia-500/40 bg-fuchsia-500/[0.04] ring-1 ring-fuchsia-500/20"
                                : "border-border hover:border-fuchsia-500/30 hover:bg-muted/40",
                              ringClass,
                              busy && "opacity-90",
                            ].filter(Boolean).join(" ")}
                          >
                            <div className={`mt-0.5 h-6 w-6 rounded-md flex items-center justify-center shrink-0 ${isOn ? "bg-fuchsia-500 text-white" : "bg-muted"}`}>
                              {busy
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : isOn
                                  ? <Check className="h-3.5 w-3.5" />
                                  : <Plus className="h-3.5 w-3.5 text-muted-foreground" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium leading-tight truncate ${isOn ? "text-fuchsia-700 dark:text-fuchsia-300" : "text-foreground"}`}>
                                {f.label}
                              </p>
                              <p className="text-[12px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                                Distribution by {f.label.toLowerCase()} · {f.fieldType}
                              </p>
                              <span className="inline-block mt-1 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide">
                                custom field
                              </span>
                            </div>
                            {ph && (
                              <span
                                className={[
                                  "pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider border shadow-sm animate-in fade-in slide-in-from-top-1",
                                  (ph === "adding"   || ph === "added")   && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
                                  (ph === "removing" || ph === "removed") && "bg-amber-500/15   text-amber-700  dark:text-amber-300  border-amber-500/30",
                                ].filter(Boolean).join(" ")}
                              >
                                {ph === "adding"   && <><Loader2 className="h-2.5 w-2.5 animate-spin" />Adding…</>}
                                {ph === "added"    && <><Check    className="h-2.5 w-2.5" />Added</>}
                                {ph === "removing" && <><Loader2 className="h-2.5 w-2.5 animate-spin" />Removing…</>}
                                {ph === "removed"  && <><Check    className="h-2.5 w-2.5" />Removed</>}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
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
  // Layout-default lookup that gracefully handles dynamic `cf:*` widget IDs
  // — they don't have an entry in WIDGET_LAYOUT_DEFAULTS, so we fall back
  // to a sensible 4×4 default so they slot into the grid without exploding.
  const layoutDefaultFor = useCallback(
    (wid: string) =>
      isCustomFieldWidget(wid)
        ? CUSTOM_FIELD_LAYOUT_DEFAULT
        : (WIDGET_LAYOUT_DEFAULTS as Record<string, typeof CUSTOM_FIELD_LAYOUT_DEFAULT>)[wid] ?? CUSTOM_FIELD_LAYOUT_DEFAULT,
    [],
  );

  const configLayout = useMemo((): Layout => {
    // Find the bottom edge of all widgets that have an explicit saved y
    const maxSavedBottom = orderedWidgets.reduce((m, w) => {
      if (w.y == null) return m;
      const def = layoutDefaultFor(w.id);
      return Math.max(m, w.y + (w.h ?? def.h));
    }, 0);

    let nextY = maxSavedBottom;
    return orderedWidgets.map(w => {
      const def = layoutDefaultFor(w.id);
      const h = w.h ?? def.h;
      const y = w.y != null ? w.y : (() => { const yy = nextY; nextY += h; return yy; })();
      return {
        i: w.id, x: w.x ?? def.x, y, w: w.w ?? def.w, h,
        minW: def.minW, minH: def.minH,
      };
    });
  }, [orderedWidgets, layoutDefaultFor]);

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

  // ── Performance: only fetch data for widgets the user is actually viewing ────
  // Each widget toggles its query via `enabled`; staleTime keeps cached data fresh
  // for 5 minutes so tab-switches and remounts don't trigger refetch storms.
  const STALE_TIME = 5 * 60_000;
  const visibleWidgets = useMemo(
    () => new Set(activeConfig.widgets.filter(w => w.visible).map(w => w.id)),
    [activeConfig.widgets],
  );
  // A composite widget's queries should also fire when any of its atomic
  // split-outs is visible — users who migrated to the atomic widgets
  // (breakdown_category, csat_avg_rating, etc.) hide the composite, but the
  // atomics still depend on the composite's API response.
  const COMPOSITE_ATOMICS: Record<string, readonly string[]> = {
    volume:      ["volume_total", "volume_open", "volume_resolved", "volume_escalated", "volume_reopened"],
    performance: ["perf_mtta", "perf_mttr", "perf_ai_resolution", "perf_sla_compliance", "perf_sla_breached"],
    breakdowns:  ["breakdown_category", "breakdown_priority", "breakdown_aging", "by_assignee"],
    csat:        ["csat_avg_rating", "csat_positive_rate", "csat_negative_rate", "csat_response_rate", "csat_distribution", "csat_recent"],
  };
  const isVisible = (id: string) => {
    if (visibleWidgets.has(id)) return true;
    const atomics = COMPOSITE_ATOMICS[id];
    return !!atomics && atomics.some((a) => visibleWidgets.has(a));
  };

  const { data: overview, isLoading: overviewLoading, error: overviewError } =
    useQuery<OverviewStats>({
      queryKey: ["reports-overview", from, to],
      queryFn: async () => (await axios.get(`/api/reports/overview?${fromToParams}`)).data,
      staleTime: STALE_TIME,
    });

  const { data: volume, isLoading: volumeLoading, error: volumeError } =
    useQuery<VolumeData>({
      queryKey: ["reports-volume", from, to],
      queryFn: async () => (await axios.get(`/api/reports/volume?${periodParams}`)).data,
      enabled:   isVisible("volume"),
      staleTime: STALE_TIME,
    });

  const { data: breakdowns, isLoading: breakdownsLoading } =
    useQuery<Breakdowns>({
      queryKey: ["reports-breakdowns", from, to],
      queryFn: async () => (await axios.get(`/api/reports/breakdowns?${fromToParams}`)).data,
      enabled:   isVisible("breakdowns"),
      staleTime: STALE_TIME,
    });

  const { data: agingData, isLoading: agingLoading } =
    useQuery<{ aging: AgingBucket[] }>({
      queryKey: ["reports-aging"],
      queryFn: async () => (await axios.get("/api/reports/aging")).data,
      enabled:   isVisible("breakdowns") || isVisible("breakdown_aging"),
      staleTime: STALE_TIME,
    });

  const { data: csat, isLoading: csatLoading } =
    useQuery<CsatSummary>({
      queryKey: ["csat-summary"],
      queryFn: async () => (await axios.get("/api/csat/summary")).data,
      enabled:   isVisible("csat"),
      staleTime: STALE_TIME,
    });

  const { data: slaDim, isLoading: slaDimLoading } =
    useQuery<SlaDimData>({
      queryKey: ["reports-sla-dim", from, to],
      queryFn: async () => (await axios.get(`/api/reports/sla-by-dimension?${fromToParams}`)).data,
      enabled:   isVisible("sla_by_dimension"),
      staleTime: STALE_TIME,
    });

  const { data: incidents, isLoading: incidentsLoading } =
    useQuery<IncidentStats>({
      queryKey: ["reports-incidents", from, to],
      queryFn: async () => (await axios.get(`/api/reports/incidents?${periodParams}`)).data,
      enabled:   isVisible("incident_analytics"),
      staleTime: STALE_TIME,
    });

  const { data: requests, isLoading: requestsLoading } =
    useQuery<RequestStats>({
      queryKey: ["reports-requests", from, to],
      queryFn: async () => (await axios.get(`/api/reports/requests?${periodParams}`)).data,
      enabled:   isVisible("request_fulfillment"),
      staleTime: STALE_TIME,
    });

  const { data: problems, isLoading: problemsLoading } =
    useQuery<ProblemStats>({
      queryKey: ["reports-problems", from, to],
      queryFn: async () => (await axios.get(`/api/reports/problems?${periodParams}`)).data,
      enabled:   isVisible("problem_recurrence"),
      staleTime: STALE_TIME,
    });

  const { data: approvals, isLoading: approvalsLoading } =
    useQuery<ApprovalStats>({
      queryKey: ["reports-approvals", from, to],
      queryFn: async () => (await axios.get(`/api/reports/approvals?${periodParams}`)).data,
      enabled:   isVisible("approval_turnaround"),
      staleTime: STALE_TIME,
    });

  const { data: csatTrend, isLoading: csatTrendLoading } =
    useQuery<{ data: CsatTrendPoint[] }>({
      queryKey: ["reports-csat-trend", from, to],
      queryFn: async () => (await axios.get(`/api/reports/csat-trend?${periodParams}`)).data,
      enabled:   isVisible("csat_trend"),
      staleTime: STALE_TIME,
    });

  const { data: channelBreakdown, isLoading: channelLoading } =
    useQuery<ChannelBreakdown>({
      queryKey: ["reports-channel", from, to],
      queryFn: async () => (await axios.get(`/api/reports/channel-breakdown?${fromToParams}`)).data,
      enabled:   isVisible("channel_breakdown"),
      staleTime: STALE_TIME,
    });

  const { data: resolutionDist, isLoading: resolutionLoading } =
    useQuery<ResolutionDist>({
      queryKey: ["reports-resolution-dist", from, to],
      queryFn: async () => (await axios.get(`/api/reports/resolution-distribution?${fromToParams}`)).data,
      enabled:   isVisible("resolution_dist"),
      staleTime: STALE_TIME,
    });

  const { data: agentLeaderboard, isLoading: leaderboardLoading } =
    useQuery<AgentLeaderboard>({
      queryKey: ["reports-agent-leaderboard", from, to],
      queryFn: async () => (await axios.get(`/api/reports/agent-leaderboard?${fromToParams}`)).data,
      enabled:   isVisible("agent_leaderboard"),
      staleTime: STALE_TIME,
    });

  const { data: backlogTrend, isLoading: backlogLoading } =
    useQuery<BacklogTrend>({
      queryKey: ["reports-backlog-trend", from, to],
      queryFn: async () => (await axios.get(`/api/reports/backlog-trend?${fromToParams}`)).data,
      enabled:   isVisible("backlog_trend"),
      staleTime: STALE_TIME,
    });

  const { data: fcrData, isLoading: fcrLoading } =
    useQuery<FcrData>({
      queryKey: ["reports-fcr", from, to],
      queryFn: async () => (await axios.get(`/api/reports/fcr?${fromToParams}`)).data,
      enabled:   isVisible("fcr_rate"),
      staleTime: STALE_TIME,
    });

  const { data: topOpen, isLoading: topOpenLoading } =
    useQuery<TopOpenTickets>({
      queryKey: ["reports-top-open"],
      queryFn: async () => (await axios.get("/api/reports/top-open-tickets")).data,
      enabled:   isVisible("top_open_tickets"),
      staleTime: STALE_TIME,
    });

  const { data: changeAnalytics, isLoading: changeAnalyticsLoading } =
    useQuery<ChangeAnalytics>({
      queryKey: ["reports-changes", from, to],
      queryFn: async () => (await axios.get(`/api/reports/changes?${periodParams}`)).data,
      enabled:   isVisible("change_analytics"),
      staleTime: STALE_TIME,
    });

  const { data: assetHealth, isLoading: assetHealthLoading } =
    useQuery<AssetHealth>({
      queryKey: ["reports-assets", from, to],
      queryFn: async () => (await axios.get(`/api/reports/assets?${periodParams}`)).data,
      enabled:   isVisible("asset_health"),
      staleTime: STALE_TIME,
    });

  const { data: kbInsights, isLoading: kbInsightsLoading } =
    useQuery<KbInsights>({
      queryKey: ["reports-kb-insights", from, to],
      queryFn: async () => (await axios.get(`/api/reports/kb-search-stats?${periodParams}`)).data,
      enabled:   isVisible("kb_insights"),
      staleTime: STALE_TIME,
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
    const def  = layoutDefaultFor(id);
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
    // If the widget already exists in config → flip visible. If not (newer
    // widget added to the catalog after this dashboard was saved), append a
    // fresh entry so the toggle actually takes effect.
    const exists = activeConfig.widgets.some(w => w.id === id);
    const maxOrder = activeConfig.widgets.reduce((m, w) => Math.max(m, w.order), -1);
    const newWidgets = exists
      ? activeConfig.widgets.map(w => w.id === id ? { ...w, visible: true } : w)
      : [...activeConfig.widgets, { id, visible: true, order: maxOrder + 1 }];
    handleSaveConfig({ ...activeConfig, widgets: newWidgets }, activeDashboard?.name ?? "My Dashboard", {});
  }

  /** Remove a widget from the grid (marks it hidden) */
  function hideWidget(id: WidgetId) {
    setDraftLayout(prev => (prev ?? configLayout).filter(l => l.i !== id));
    const exists = activeConfig.widgets.some(w => w.id === id);
    const maxOrder = activeConfig.widgets.reduce((m, w) => Math.max(m, w.order), -1);
    const newWidgets = exists
      ? activeConfig.widgets.map(w => w.id === id ? { ...w, visible: false } : w)
      : [...activeConfig.widgets, { id, visible: false, order: maxOrder + 1 }];
    handleSaveConfig({ ...activeConfig, widgets: newWidgets }, activeDashboard?.name ?? "My Dashboard", {});
  }

  /**
   * Toggle widget visibility from the widget picker.
   * Visible → hidden (removes from grid draft). Hidden → visible (appends to grid).
   * Immediately persists, same as showWidget/hideWidget.
   *
   * Falls back to "show" when the widget id is missing from the saved config
   * — happens for widgets added to the catalog after this dashboard was last
   * saved (kb_insights, asset_health, change_analytics, by_assignee, etc.).
   */
  function toggleWidgetPicker(id: WidgetId) {
    const widget = activeConfig.widgets.find(w => w.id === id);
    if (!widget || !widget.visible) {
      showWidget(id);
    } else {
      hideWidget(id);
    }
  }

  // ── Widget renderer ───────────────────────────────────────────────────────────
  // Each widget is a named section rendered as a closure over the query data.

  function renderWidget(id: WidgetId): React.ReactNode {
    // Custom-field widgets (cf:<entityType>:<fieldKey>) are dynamic — they
    // can't live in a switch because the IDs aren't known at compile time.
    // Detect first and short-circuit to a generic distribution renderer.
    if (id.startsWith("cf:")) {
      return <CustomFieldWidget key={id} id={id} fromTo={fromToParams} preset={preset} />;
    }
    switch (id as Exclude<WidgetId, `cf:${string}:${string}`>) {
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
      case "tickets_per_day": {
        const series = volume?.data ?? [];
        const total  = series.reduce((s, d) => s + d.tickets, 0);
        const peak   = series.reduce((m, d) => Math.max(m, d.tickets), 0);
        const nonzero = series.filter((d) => d.tickets > 0).length;
        const avg    = nonzero > 0 ? total / nonzero : 0;
        const peakDay = series.find((d) => d.tickets === peak);
        return (
          <Card key="tickets_per_day" className="h-full flex flex-col overflow-hidden">
            <WidgetHeader title="Tickets Per Day" description={PRESET_LABELS[preset]} icon={BarChart2} iconColor="text-primary" />
            <CardContent className="flex-1 pb-4 pt-0 flex flex-col gap-3 min-h-0">
              {volumeError ? (
                <ErrorAlert error={volumeError} fallback="Failed to load chart data" />
              ) : volumeLoading ? (
                <Skeleton className="h-full w-full min-h-[180px]" />
              ) : (
                <>
                  {/* Compact KPI strip */}
                  <div className="grid grid-cols-3 gap-2 shrink-0">
                    <div className="rounded-lg border bg-muted/30 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        Total
                      </p>
                      <p className="text-lg font-bold tabular-nums leading-tight mt-0.5">{total.toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Avg / day
                      </p>
                      <p className="text-lg font-bold tabular-nums leading-tight mt-0.5">{avg ? avg.toFixed(1) : "—"}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Peak
                      </p>
                      <p className="text-lg font-bold tabular-nums leading-tight mt-0.5">
                        {peak || "—"}
                        {peakDay && (
                          <span className="ml-1 text-[10px] font-medium text-muted-foreground">
                            · {formatDate(peakDay.date, period)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Chart */}
                  <ChartContainer config={volumeChartConfig} className="h-full w-full min-h-[160px] flex-1">
                    <BarChart accessibilityLayer data={series} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="bar-tickets-grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"  stopColor="var(--color-tickets)" stopOpacity={1}   />
                          <stop offset="100%" stopColor="var(--color-tickets)" stopOpacity={0.55} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} strokeOpacity={0.35} strokeDasharray="3 4" />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tickFormatter={(v: string) => formatDate(v, period)}
                        interval="preserveStartEnd"
                        minTickGap={40}
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      />
                      <ChartTooltip
                        cursor={{ fill: "var(--color-tickets)", fillOpacity: 0.06, radius: 4 }}
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
                      {/* Average reference line */}
                      {avg > 0 && (
                        <ReferenceLine
                          y={avg}
                          stroke="hsl(var(--muted-foreground))"
                          strokeDasharray="3 3"
                          strokeOpacity={0.4}
                          label={{
                            value: `avg ${avg.toFixed(1)}`,
                            position: "right",
                            fill: "hsl(var(--muted-foreground))",
                            fontSize: 9,
                          }}
                        />
                      )}
                      <Bar
                        dataKey="tickets"
                        fill="url(#bar-tickets-grad)"
                        radius={[6, 6, 2, 2]}
                        maxBarSize={28}
                      >
                        {series.map((d, i) => (
                          <Cell
                            key={i}
                            fill={d.tickets === peak && peak > 0 ? "var(--color-tickets)" : "url(#bar-tickets-grad)"}
                            fillOpacity={d.tickets === 0 ? 0.18 : 1}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                </>
              )}
            </CardContent>
          </Card>
        );
      }

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
      case "by_assignee": {
        const list   = breakdowns?.byAssignee ?? [];
        const maxTot = list.reduce((m, a) => Math.max(m, a.total), 0) || 1;
        return (
          <Card key="by_assignee" className="h-full flex flex-col">
            <WidgetHeader title="By Assignee" description={`Ticket load per agent · ${PRESET_LABELS[preset]}`} icon={Users} iconColor="text-indigo-500" />
            <CardContent className="flex-1 overflow-auto pb-3 pt-0">
              {breakdownsLoading ? (
                <div className="space-y-2.5">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                </div>
              ) : !list.length ? (
                <EmptyState icon={Users} title="No assigned tickets" description="Assigned ticket data will appear here" />
              ) : (
                <ul className="divide-y divide-border/60">
                  {list.map((a, idx) => {
                    const openPct  = a.total > 0 ? Math.round((a.open / a.total) * 100) : 0;
                    const loadPct  = (a.total / maxTot) * 100;
                    const initials = a.agentName
                      .split(/\s+/)
                      .map((p) => p[0])
                      .filter(Boolean)
                      .slice(0, 2)
                      .join("")
                      .toUpperCase();
                    // Stable colour from the agent's id so the avatar doesn't change between renders
                    const palette  = ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444","#ec4899","#3b82f6"];
                    const seed     = String(a.agentId).split("").reduce((s, c) => s + c.charCodeAt(0), 0);
                    const color    = palette[seed % palette.length] ?? palette[0]!;
                    return (
                      <li
                        key={a.agentId}
                        className="group flex items-center gap-3 py-2.5 px-1 rounded-lg transition-colors hover:bg-muted/40"
                      >
                        {/* Rank + avatar */}
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className="text-[10px] font-semibold tabular-nums text-muted-foreground/60 w-4 text-right shrink-0">
                            {idx + 1}
                          </span>
                          <div
                            className="h-9 w-9 rounded-full flex items-center justify-center text-[11px] font-semibold tracking-wide shrink-0 ring-2 ring-background"
                            style={{
                              background: `linear-gradient(135deg, ${color}, ${color}cc)`,
                              color: "white",
                              boxShadow: `0 0 0 2px ${color}1a`,
                            }}
                            title={a.agentName}
                          >
                            {initials || "?"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-tight truncate">{a.agentName}</p>
                            {/* Mini split bar: open (color) + resolved (muted) */}
                            <div className="mt-1.5 flex items-center gap-2">
                              <div className="relative h-1.5 flex-1 rounded-full bg-muted/60 overflow-hidden">
                                {/* Resolved portion (cool muted) */}
                                <div
                                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                                  style={{
                                    width: `${loadPct}%`,
                                    background: `linear-gradient(90deg, ${color}55, ${color}22)`,
                                  }}
                                />
                                {/* Open portion (vivid, anchored left) */}
                                <div
                                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                                  style={{
                                    width: `${(a.open / maxTot) * 100}%`,
                                    background: `linear-gradient(90deg, ${color}, ${color}aa)`,
                                  }}
                                />
                              </div>
                              <span className="text-[10px] tabular-nums text-muted-foreground/70 w-9 text-right shrink-0">
                                {a.total > 0 ? `${openPct}%` : "—"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Counts */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className="inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-md"
                            title="Open"
                            style={{
                              color,
                              background: `${color}14`,
                              border: `1px solid ${color}30`,
                            }}
                          >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                            {a.open}
                          </span>
                          <span
                            className="inline-flex items-center gap-1 text-[11px] font-medium tabular-nums px-2 py-0.5 rounded-md text-muted-foreground bg-muted/60 border border-border/60"
                            title="Resolved"
                          >
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            {a.resolved}
                          </span>
                          <span
                            className="text-sm font-bold tabular-nums w-7 text-right"
                            title="Total"
                          >
                            {a.total}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      }

      // ── CSAT ─────────────────────────────────────────────────────────────────
      case "csat":
        return (
          <section key="csat" className="space-y-4">
            <SectionHeading>Customer Satisfaction</SectionHeading>
            <div className={`grid grid-cols-2 lg:grid-cols-4 ${density === "compact" ? "gap-2" : "gap-4"}`}>
              <MetricCard
                title="Avg Rating"
                value={csat?.avgRating != null ? `${csat.avgRating} / 5` : "—"}
                icon={Star}
                loading={csatLoading}
                accentColor="#f59e0b"
                hint="Average CSAT score across all submitted ratings."
                sub={csat ? csatHealthLabel(csatAvgVariant) : undefined}
              />
              <MetricCard
                title="Positive Rate"
                value={pct(csat?.positiveRate)}
                icon={ThumbsUp}
                loading={csatLoading}
                accentColor="#10b981"
                hint="Percentage of ratings that were 4★ or 5★."
                sub={csat ? csatHealthLabel(csatPositiveVariant) : undefined}
              />
              <MetricCard
                title="Negative Rate"
                value={pct(csat?.negativeRate)}
                icon={ThumbsDown}
                loading={csatLoading}
                accentColor="#f43f5e"
                hint="Percentage of ratings that were 1★ or 2★. Lower is better."
                sub={csat ? csatHealthLabel(csatNegativeVariant) : undefined}
              />
              <MetricCard
                title="Response Rate"
                value={csat != null ? `${csat.responseRate}%` : "—"}
                icon={BarChart2}
                loading={csatLoading}
                accentColor="#6366f1"
                hint="Percentage of resolved/closed tickets that received a rating."
                sub={csat?.totalRatings != null ? `${csat.totalRatings.toLocaleString()} rating${csat.totalRatings === 1 ? "" : "s"} collected` : undefined}
              />
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
      case "agent_leaderboard": {
        // Stable colour from agent id so each row's avatar stays consistent
        // between renders. Using a small palette keeps the visual chrome quiet
        // — the leaderboard is about ranks, not rainbow chaos.
        const avatarPalette = [
          "bg-violet-500/15 text-violet-700 dark:text-violet-300",
          "bg-rose-500/15 text-rose-700 dark:text-rose-300",
          "bg-teal-500/15 text-teal-700 dark:text-teal-300",
          "bg-amber-500/15 text-amber-700 dark:text-amber-300",
          "bg-blue-500/15 text-blue-700 dark:text-blue-300",
          "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
          "bg-purple-500/15 text-purple-700 dark:text-purple-300",
          "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
        ];
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
                  {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                </div>
              ) : !agentLeaderboard?.agents.length ? (
                <EmptyState icon={Award} title="No agent data" description="Leaderboard appears once tickets are assigned and resolved" />
              ) : (
                <div className="space-y-1.5">
                  {agentLeaderboard.agents.map((agent, i) => {
                    const initials = agent.agentName
                      .split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
                    const seed     = String(agent.agentId).split("").reduce((s, c) => s + c.charCodeAt(0), 0);
                    const tone     = avatarPalette[seed % avatarPalette.length]!;
                    const pct      = (agent.resolved / Math.max(maxResolved, 1)) * 100;

                    // Rank treatment — top three get a podium look (gold/silver/bronze).
                    const rankStyle =
                      i === 0 ? { bg: "bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-md shadow-amber-500/30", icon: Trophy,  iconCls: "h-3 w-3" } :
                      i === 1 ? { bg: "bg-gradient-to-br from-slate-300 to-slate-500 text-white shadow-md shadow-slate-400/30", icon: Medal,   iconCls: "h-3 w-3" } :
                      i === 2 ? { bg: "bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-md shadow-orange-500/30", icon: Medal, iconCls: "h-3 w-3" } :
                              { bg: "bg-muted/60 text-muted-foreground border border-border/60",                                   icon: null,  iconCls: "" };

                    // SLA chip tone family
                    const slaTone =
                      agent.slaCompliancePct == null               ? null :
                      agent.slaCompliancePct >= 90                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25" :
                      agent.slaCompliancePct >= 70                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25" :
                                                                      "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25";

                    return (
                      <div
                        key={agent.agentId}
                        className={[
                          "relative flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors",
                          i < 3 ? "bg-muted/30 hover:bg-muted/50" : "hover:bg-muted/40",
                        ].join(" ")}
                      >
                        {/* Rank badge — coin shape for podium, neutral pill otherwise */}
                        <span
                          className={[
                            "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold tabular-nums shrink-0",
                            rankStyle.bg,
                          ].join(" ")}
                        >
                          {rankStyle.icon
                            ? <rankStyle.icon className={rankStyle.iconCls} />
                            : i + 1
                          }
                        </span>

                        {/* Avatar */}
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold shrink-0 ${tone}`}>
                          {initials || "?"}
                        </span>

                        {/* Name + progress */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[13px] font-medium truncate">{agent.agentName}</span>
                            <span className="text-sm font-bold tabular-nums shrink-0 text-foreground">
                              {agent.resolved}
                            </span>
                          </div>
                          {/* Rich progress bar with rank-tinted fill */}
                          <div className="relative h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className={[
                                "absolute inset-y-0 left-0 rounded-full transition-all",
                                i === 0 ? "bg-gradient-to-r from-amber-400 to-amber-500" :
                                i === 1 ? "bg-gradient-to-r from-slate-400 to-slate-500" :
                                i === 2 ? "bg-gradient-to-r from-orange-400 to-orange-500" :
                                          "bg-gradient-to-r from-primary/60 to-primary",
                              ].join(" ")}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>

                        {/* SLA compliance chip */}
                        {slaTone && (
                          <span
                            className={`inline-flex items-center justify-center min-w-[42px] h-5 rounded-full border px-1.5 text-[10px] font-bold tabular-nums shrink-0 ${slaTone}`}
                            title={`SLA compliance · ${agent.slaCompliancePct}%`}
                          >
                            {agent.slaCompliancePct}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {/* Legend — no top border so the row continues the same
                      visual rhythm as the agents above it, keeping the widget
                      uniform from top to bottom. */}
                  <div className="flex items-center justify-end gap-3 pt-2 text-[10px] text-muted-foreground/70">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-3 rounded-full bg-gradient-to-r from-primary/60 to-primary" />
                      tickets resolved
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-3 w-3 rounded-full border border-emerald-500/40 bg-emerald-500/15" />
                      SLA compliance
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      }

      // ── Backlog Trend ─────────────────────────────────────────────────────────
      case "backlog_trend": {
        const totalOpened   = backlogTrend?.data.reduce((s, d) => s + d.opened, 0) ?? 0;
        const totalResolved = backlogTrend?.data.reduce((s, d) => s + d.closed, 0) ?? 0;
        const netChange     = totalOpened - totalResolved;
        const netImproving  = netChange < 0;   // resolving faster than opening = good
        const netSteady     = netChange === 0;
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
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-full w-full min-h-[180px]" />
                </div>
              ) : !backlogTrend?.data.length ? (
                <EmptyState icon={Activity} title="No data" description="Backlog trend will appear once tickets are created" />
              ) : (
                <div className="flex flex-col h-full gap-3">

                  {/* ── Stat strip — period totals + net direction ── */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-foreground/15 bg-foreground/[0.04] px-3 py-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
                        <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
                        Opened
                      </div>
                      <p className="text-xl font-bold tabular-nums tracking-tight mt-0.5 text-foreground">
                        {totalOpened}
                      </p>
                    </div>
                    <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Resolved
                      </div>
                      <p className="text-xl font-bold tabular-nums tracking-tight mt-0.5 text-emerald-600 dark:text-emerald-400">
                        {totalResolved}
                      </p>
                    </div>
                    <div
                      className={[
                        "rounded-lg border px-3 py-2",
                        netSteady    ? "border-border bg-muted/40" :
                        netImproving ? "border-emerald-500/25 bg-emerald-500/[0.06]" :
                                        "border-amber-500/30 bg-amber-500/[0.06]",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
                        {netSteady
                          ? <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                          : netImproving
                            ? <TrendingDown className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                            : <TrendingUp   className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                        }
                        Net
                      </div>
                      <p
                        className={[
                          "text-xl font-bold tabular-nums tracking-tight mt-0.5",
                          netSteady    ? "text-foreground" :
                          netImproving ? "text-emerald-600 dark:text-emerald-400" :
                                          "text-amber-600 dark:text-amber-400",
                        ].join(" ")}
                      >
                        {netChange > 0 ? "+" : ""}{netChange}
                      </p>
                    </div>
                  </div>

                  {/* ── Chart ── */}
                  <ChartContainer config={backlogChartConfig} className="flex-1 w-full min-h-[160px]">
                    <AreaChart data={backlogTrend.data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                      <defs>
                        {/* Opened uses the foreground colour token — black in
                            light mode, near-white in dark mode — so the line
                            stays readable without picking up the palette tint. */}
                        <linearGradient id="gradOpened" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="hsl(var(--foreground))" stopOpacity={0.20} />
                          <stop offset="95%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradClosed" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.32} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="currentColor" className="text-muted-foreground/15" />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: string) => formatDate(v, period)}
                        interval="preserveStartEnd"
                        minTickGap={40}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis tickLine={false} axisLine={false} width={28} tick={{ fontSize: 11 }} allowDecimals={false} />
                      <ChartTooltip
                        cursor={{ stroke: "hsl(var(--foreground))", strokeOpacity: 0.25, strokeDasharray: "3 3" }}
                        content={
                          <ChartTooltipContent
                            indicator="dot"
                            labelFormatter={(v: string) =>
                              new Date(v + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                            }
                          />
                        }
                      />
                      {/* Resolved drawn first so Opened sits on top — opened is
                          the more "actionable" signal for triage at a glance. */}
                      <Area
                        type="monotone"
                        dataKey="closed"
                        stroke="#22c55e"
                        strokeWidth={2}
                        fill="url(#gradClosed)"
                        activeDot={{ r: 4, strokeWidth: 2, fill: "hsl(var(--background))", stroke: "#22c55e" }}
                      />
                      <Area
                        type="monotone"
                        dataKey="opened"
                        stroke="hsl(var(--foreground))"
                        strokeWidth={2}
                        fill="url(#gradOpened)"
                        activeDot={{ r: 4, strokeWidth: 2, fill: "hsl(var(--background))", stroke: "hsl(var(--foreground))" }}
                      />
                    </AreaChart>
                  </ChartContainer>
                </div>
              )}
            </CardContent>
          </Card>
        );
      }

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
                          <Link to={`/tickets/${t.ticketNumber}`} className="hover:text-primary hover:underline">
                            {t.ticketNumber}
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <Link to={`/tickets/${t.ticketNumber}`} className="font-medium text-[13px] hover:underline line-clamp-1 block">
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

      // ── Change Analytics ─────────────────────────────────────────────────────
      case "change_analytics": {
        const CHANGE_STATE_COLORS: Record<string, string> = {
          draft: "#94a3b8", submitted_for_approval: "#f59e0b", approved: "#22c55e",
          rejected: "#ef4444", scheduled: "#3b82f6", implemented: "#10b981",
          rolled_back: "#f97316",
        };
        const CHANGE_TYPE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#14b8a6"];
        const CHANGE_RISK_COLORS: Record<string, string> = {
          low: "#22c55e", medium: "#f59e0b", high: "#f97316", critical: "#ef4444",
        };
        return (
          <section key="change_analytics" className="space-y-4">
            <SectionHeading>Change Analytics</SectionHeading>
            <div className={`grid grid-cols-2 sm:grid-cols-4 ${density === "compact" ? "gap-2" : "gap-4"}`}>
              <MetricCard title="Total Changes"   value={changeAnalytics?.total}        icon={GitBranch}   loading={changeAnalyticsLoading} href="/changes" />
              <MetricCard title="Success Rate"    value={changeAnalytics?.successRate != null ? `${changeAnalytics.successRate}%` : undefined} icon={Check} loading={changeAnalyticsLoading} variant={changeAnalytics?.successRate != null ? changeAnalytics.successRate >= 90 ? "good" : changeAnalytics.successRate >= 70 ? "warn" : "bad" : "default"} hint="Percentage of changes that were implemented without being rolled back or marked failed." />
              <MetricCard title="Emergency"       value={changeAnalytics?.emergency}    icon={AlertTriangle} loading={changeAnalyticsLoading} variant={changeAnalytics?.emergency ? "warn" : "default"} hint="Emergency changes bypass normal approval process and carry higher risk." />
              <MetricCard title="Avg Approval"    value={formatDuration(changeAnalytics?.avgApprovalSec)} icon={Timer} loading={changeAnalyticsLoading} hint="Average time from change submission to final CAB approval decision." />
            </div>
            <div className={`grid grid-cols-1 sm:grid-cols-3 ${density === "compact" ? "gap-2" : "gap-4"}`}>
              {/* By State */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-blue-500" />By State</CardTitle>
                </CardHeader>
                <CardContent>
                  {changeAnalyticsLoading ? <Skeleton className="h-40 w-full" /> : (
                    <div className="space-y-1.5">
                      {(changeAnalytics?.byState ?? []).map(s => {
                        const total = (changeAnalytics?.total ?? 0);
                        const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
                        const color = CHANGE_STATE_COLORS[s.state] ?? "#94a3b8";
                        return (
                          <div key={s.state} className="flex items-center gap-2 text-xs">
                            <span className="w-28 truncate text-muted-foreground capitalize">{s.state.replace(/_/g, " ")}</span>
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                            </div>
                            <span className="tabular-nums font-medium w-6 text-right">{s.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
              {/* By Type */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Layers className="h-4 w-4 text-violet-500" />By Type</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center">
                  {changeAnalyticsLoading ? <Skeleton className="h-40 w-full" /> : (
                    <ChartContainer config={{}} className="h-40 w-full">
                      <PieChart>
                        <Pie data={changeAnalytics?.byType ?? []} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={58} innerRadius={28} paddingAngle={2}>
                          {(changeAnalytics?.byType ?? []).map((e, i) => (
                            <Cell key={e.type} fill={CHANGE_TYPE_COLORS[i % CHANGE_TYPE_COLORS.length]} />
                          ))}
                        </Pie>
                        <ChartTooltip content={<ChartTooltipContent nameKey="type" />} />
                      </PieChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>
              {/* By Risk */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-orange-500" />By Risk</CardTitle>
                </CardHeader>
                <CardContent>
                  {changeAnalyticsLoading ? <Skeleton className="h-40 w-full" /> : (
                    <div className="space-y-1.5">
                      {(changeAnalytics?.byRisk ?? []).map(r => {
                        const total = (changeAnalytics?.total ?? 0);
                        const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
                        const color = CHANGE_RISK_COLORS[r.risk] ?? "#94a3b8";
                        return (
                          <div key={r.risk} className="flex items-center gap-2 text-xs">
                            <span className="w-16 truncate text-muted-foreground capitalize">{r.risk}</span>
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                            </div>
                            <span className="tabular-nums font-medium w-6 text-right">{r.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>
        );
      }

      // ── Asset Health ──────────────────────────────────────────────────────────
      case "asset_health": {
        const ASSET_STATUS_COLORS: Record<string, string> = {
          in_stock: "#6366f1", deployed: "#22c55e", in_use: "#10b981",
          under_maintenance: "#f59e0b", in_repair: "#f97316",
          decommissioned: "#94a3b8", disposed: "#cbd5e1",
        };
        const ASSET_TYPE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#14b8a6", "#8b5cf6", "#f97316", "#ec4899"];
        return (
          <section key="asset_health" className="space-y-4">
            <SectionHeading>Asset Health</SectionHeading>
            <div className={`grid grid-cols-2 sm:grid-cols-4 ${density === "compact" ? "gap-2" : "gap-4"}`}>
              <MetricCard title="Total Assets"   value={assetHealth?.total}    icon={Layers}    loading={assetHealthLoading} href="/assets" />
              <MetricCard title="Active (In Use)" value={assetHealth?.active}   icon={CheckSquare} loading={assetHealthLoading} variant="good" hint="Assets currently deployed or in use." />
              <MetricCard title="In Stock"       value={assetHealth?.in_stock} icon={Inbox}     loading={assetHealthLoading} />
              <MetricCard title="Under Maintenance" value={assetHealth?.maint} icon={RotateCcw} loading={assetHealthLoading} variant={assetHealth?.maint ? "warn" : "default"} hint="Assets temporarily removed from service for maintenance or repair." />
            </div>
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${density === "compact" ? "gap-2" : "gap-4"}`}>
              {/* By Status donut */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-emerald-500" />By Status</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center">
                  {assetHealthLoading ? <Skeleton className="h-44 w-full" /> : (
                    <ChartContainer config={{}} className="h-44 w-full">
                      <PieChart>
                        <Pie data={assetHealth?.byStatus ?? []} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={70} innerRadius={36} paddingAngle={2}>
                          {(assetHealth?.byStatus ?? []).map(e => (
                            <Cell key={e.status} fill={ASSET_STATUS_COLORS[e.status] ?? "#94a3b8"} />
                          ))}
                        </Pie>
                        <ChartTooltip content={<ChartTooltipContent nameKey="status" />} />
                      </PieChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>
              {/* By Type */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Layers className="h-4 w-4 text-cyan-500" />By Type</CardTitle>
                </CardHeader>
                <CardContent>
                  {assetHealthLoading ? <Skeleton className="h-44 w-full" /> : (
                    <div className="space-y-1.5 mt-1">
                      {(assetHealth?.byType ?? []).slice(0, 8).map((t, i) => {
                        const total = assetHealth?.total ?? 0;
                        const pct = total > 0 ? Math.round((t.count / total) * 100) : 0;
                        return (
                          <div key={t.type} className="flex items-center gap-2 text-xs">
                            <span className="w-28 truncate text-muted-foreground capitalize">{t.type.replace(/_/g, " ")}</span>
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: ASSET_TYPE_COLORS[i % ASSET_TYPE_COLORS.length] }} />
                            </div>
                            <span className="tabular-nums font-medium w-6 text-right">{t.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>
        );
      }

      // ── KB Insights ───────────────────────────────────────────────────────────
      case "kb_insights": {
        return (
          <section key="kb_insights" className="space-y-4">
            <SectionHeading>Knowledge Base Insights</SectionHeading>
            <div className={`grid grid-cols-2 sm:grid-cols-3 ${density === "compact" ? "gap-2" : "gap-4"}`}>
              <MetricCard title="Total Searches"  value={kbInsights?.totalSearches}  icon={Hash}       loading={kbInsightsLoading} hint="Total number of KB searches made by customers and agents during the period." />
              <MetricCard title="Unique Queries"  value={kbInsights?.uniqueQueries}  icon={Activity}   loading={kbInsightsLoading} hint="Number of distinct search terms used." />
              <MetricCard
                title="Zero-Result Rate"
                value={kbInsights?.zeroResultRate != null ? `${kbInsights.zeroResultRate}%` : undefined}
                icon={TrendingDown}
                loading={kbInsightsLoading}
                variant={kbInsights?.zeroResultRate != null ? kbInsights.zeroResultRate > 30 ? "bad" : kbInsights.zeroResultRate > 10 ? "warn" : "good" : "default"}
                hint="Percentage of searches that returned no KB results — high rate suggests content gaps."
              />
            </div>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-pink-500" />
                  Top Search Terms
                </CardTitle>
                <CardDescription>Most frequently searched queries this period</CardDescription>
              </CardHeader>
              <CardContent>
                {kbInsightsLoading ? (
                  <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
                ) : (kbInsights?.topQueries.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No searches recorded for this period.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Query</TableHead>
                        <TableHead className="text-right">Searches</TableHead>
                        <TableHead className="text-right">Zero Results</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(kbInsights?.topQueries ?? []).slice(0, 10).map(q => (
                        <TableRow key={q.query}>
                          <TableCell className="font-medium">{q.query}</TableCell>
                          <TableCell className="text-right tabular-nums">{q.count}</TableCell>
                          <TableCell className={`text-right tabular-nums ${q.zeroResultsCount > 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                            {q.zeroResultsCount > 0 ? q.zeroResultsCount : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </section>
        );
      }

      // ── Atomic volume tiles ───────────────────────────────────────────────
      case "volume_total":
        return (
          <MetricCard key="volume_total"     fillCard title="Total Tickets"   value={overview?.totalTickets}     icon={TicketIcon}    loading={overviewLoading} accentColor="#6366F1" hint="All non-system tickets in the selected period." href={ticketsUrl()} />
        );
      case "volume_open":
        return (
          <MetricCard key="volume_open"      fillCard title="Open Tickets"    value={overview?.openTickets}      icon={CircleDot}     loading={overviewLoading} accentColor="#F97316" hint="Tickets currently awaiting agent response."  href={ticketsUrl({ status: "open" })} />
        );
      case "volume_resolved":
        return (
          <MetricCard key="volume_resolved"  fillCard title="Resolved Tickets" value={overview?.resolvedTickets}  icon={TrendingUp}    loading={overviewLoading} accentColor="#22C55E" hint="Tickets marked resolved or closed."          href={ticketsUrl({ status: "resolved" })} />
        );
      case "volume_escalated":
        return (
          <MetricCard key="volume_escalated" fillCard title="Escalated Tickets" value={overview?.escalatedTickets} icon={AlertTriangle} loading={overviewLoading} accentColor={overview?.escalatedTickets ? "#EF4444" : "#94A3B8"} hint="Tickets that were escalated at any point." href={ticketsUrl({ escalated: true })} />
        );
      case "volume_reopened":
        return (
          <MetricCard key="volume_reopened"  fillCard title="Reopened Tickets" value={overview?.reopenedTickets}  icon={RotateCcw}     loading={overviewLoading} accentColor={overview?.reopenedTickets ? "#A855F7" : "#94A3B8"} hint="Resolved tickets that received a new reply and returned to open." href={ticketsUrl({ status: "open" })} />
        );

      // ── Atomic performance tiles ─────────────────────────────────────────
      case "perf_mtta":
        return (
          <MetricCard key="perf_mtta" fillCard title="MTTA" value={formatDuration(overview?.avgFirstResponseSeconds)} icon={Timer}    loading={overviewLoading} accentColor="#3B82F6" hint="Mean Time To Acknowledge — avg time from creation to first agent reply." href={ticketsUrl({ status: "open" })} />
        );
      case "perf_mttr":
        return (
          <MetricCard key="perf_mttr" fillCard title="MTTR" value={formatDuration(overview?.avgResolutionSeconds)}    icon={Hourglass} loading={overviewLoading} accentColor="#6366F1" hint="Mean Time To Resolve — avg time from creation to resolution." href={ticketsUrl({ status: "open" })} />
        );
      case "perf_ai_resolution":
        return (
          <MetricCard key="perf_ai_resolution" fillCard title="AI Resolution" value={overview ? `${overview.aiResolutionRate}%` : undefined} icon={Sparkles} loading={overviewLoading} accentColor="#A855F7" hint="Percentage of resolved tickets handled entirely by the AI agent." href={ticketsUrl({ status: "resolved" })} />
        );
      case "perf_sla_compliance": {
        const slaColor =
          slaVariant === "good" ? "#22C55E" :
          slaVariant === "warn" ? "#F59E0B" :
          slaVariant === "bad"  ? "#EF4444" : "#3B82F6";
        return (
          <MetricCard key="perf_sla_compliance" fillCard title="SLA Compliance" value={pct(overview?.slaComplianceRate)} icon={ShieldCheck} loading={overviewLoading} accentColor={slaColor} hint="% of SLA-tracked tickets resolved within deadline." href={ticketsUrl({ view: "overdue" })} />
        );
      }
      case "perf_sla_breached":
        return (
          <MetricCard key="perf_sla_breached" fillCard title="SLA Breached" value={overview?.breachedTickets} icon={ShieldAlert} loading={overviewLoading} accentColor={overview?.breachedTickets ? "#EF4444" : "#94A3B8"} hint="Tickets that exceeded their SLA resolution deadline." href={ticketsUrl({ view: "overdue" })} />
        );

      // ── Atomic breakdown charts ──────────────────────────────────────────
      case "breakdown_category": {
        const cats     = breakdowns?.byCategory ?? [];
        const grandTot = cats.reduce((s, c) => s + c.total, 0);
        const maxTot   = cats.reduce((m, c) => Math.max(m, c.total), 0) || 1;
        const top      = cats.length ? cats.reduce((b, c) => (c.total > b.total ? c : b), cats[0]!) : null;
        // Stable per-category accent — gives each bar its own colour identity
        // without the eye-watering rainbow effect of randomised palettes.
        const catTones = [
          { bar: "bg-gradient-to-r from-violet-400  to-violet-600",  dot: "bg-violet-500"  },
          { bar: "bg-gradient-to-r from-rose-400    to-rose-600",    dot: "bg-rose-500"    },
          { bar: "bg-gradient-to-r from-teal-400    to-teal-600",    dot: "bg-teal-500"    },
          { bar: "bg-gradient-to-r from-amber-400   to-amber-600",   dot: "bg-amber-500"   },
          { bar: "bg-gradient-to-r from-blue-400    to-blue-600",    dot: "bg-blue-500"    },
          { bar: "bg-gradient-to-r from-indigo-400  to-indigo-600",  dot: "bg-indigo-500"  },
          { bar: "bg-gradient-to-r from-emerald-400 to-emerald-600", dot: "bg-emerald-500" },
          { bar: "bg-gradient-to-r from-fuchsia-400 to-fuchsia-600", dot: "bg-fuchsia-500" },
        ];
        const toneFor = (label: string) => {
          const seed = label.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
          return catTones[seed % catTones.length]!;
        };
        return (
          <Card key="breakdown_category" className="h-full flex flex-col">
            <WidgetHeader
              title="By Category"
              description={`Ticket distribution · ${PRESET_LABELS[preset]} · click to filter`}
              icon={Tag}
              iconColor="text-fuchsia-500"
            />
            <CardContent className="flex-1 pb-4">
              {breakdownsLoading ? (
                <div className="space-y-2.5">
                  <Skeleton className="h-14 w-full rounded-lg" />
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-lg" />)}
                </div>
              ) : !cats.length ? (
                <EmptyState icon={Tag} title="No categories" description="Category data appears once tickets are created." />
              ) : (
                <div className="flex flex-col h-full gap-3">

                  {/* ── Top-category callout strip ── */}
                  {top && (
                    <div className="rounded-lg border border-fuchsia-500/25 bg-gradient-to-br from-fuchsia-500/[0.08] via-fuchsia-500/[0.04] to-transparent px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
                          Largest bucket
                        </span>
                        <span className="ml-auto text-[10px] font-semibold tabular-nums text-muted-foreground">
                          {grandTot} total
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2 mt-0.5">
                        <span className="text-sm font-bold tracking-tight truncate">{top.label}</span>
                        <span className="text-xl font-bold tabular-nums tracking-tight text-fuchsia-600 dark:text-fuchsia-400 shrink-0">
                          {top.total}
                          <span className="text-[11px] font-medium text-muted-foreground ml-1">
                            ({grandTot > 0 ? Math.round((top.total / grandTot) * 100) : 0}%)
                          </span>
                        </span>
                      </div>
                    </div>
                  )}

                  {/* ── Bar list ── */}
                  <ul className="space-y-1.5 flex-1 min-h-0 overflow-y-auto pr-1">
                    {cats.map((c) => {
                      const tone = toneFor(c.label);
                      const pct   = (c.total / maxTot) * 100;
                      const share = grandTot > 0 ? Math.round((c.total / grandTot) * 100) : 0;
                      return (
                        <li key={c.label}>
                          <button
                            type="button"
                            onClick={() => handleCategoryBarClick({ category: c.category, label: c.label })}
                            className="group w-full text-left rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50 focus:bg-muted/60 focus:outline-none"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`h-2 w-2 rounded-full shrink-0 ${tone.dot}`} />
                              <span className="text-[12.5px] font-medium truncate flex-1 group-hover:text-foreground">
                                {c.label}
                              </span>
                              <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                                {share}%
                              </span>
                              <span className="text-sm font-bold tabular-nums shrink-0 w-7 text-right">
                                {c.total}
                              </span>
                            </div>
                            <div className="relative h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className={`absolute inset-y-0 left-0 rounded-full transition-all ${tone.bar}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        );
      }
      case "breakdown_priority":
        return (
          <Card key="breakdown_priority" className="h-full flex flex-col">
            <CardHeader>
              <CardTitle className="text-sm">By Priority</CardTitle>
              <CardDescription>Ticket distribution · {PRESET_LABELS[preset]} · click a bar to filter</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              {breakdownsLoading ? <Skeleton className="h-full w-full min-h-[160px]" /> : (
                <HorizontalBarChart data={breakdowns?.byPriority ?? []} dataKey="total" labelKey="label" config={barChartConfig} colorKey="priority" onBarClick={handlePriorityBarClick} />
              )}
            </CardContent>
          </Card>
        );
      case "breakdown_aging":
        return (
          <Card key="breakdown_aging" className="h-full flex flex-col">
            <CardHeader>
              <CardTitle className="text-sm">Ticket Aging</CardTitle>
              <CardDescription>Currently open tickets by age · click to view</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              {agingLoading ? <Skeleton className="h-full w-full min-h-[160px]" /> : (
                <HorizontalBarChart data={agingData?.aging ?? []} dataKey="count" labelKey="bucket" config={agingChartConfig} sortKey="sort" colorMap={AGING_COLORS} onBarClick={() => navigate(ticketsUrl({ status: "open" }))} />
              )}
            </CardContent>
          </Card>
        );

      // ── Atomic CSAT tiles & cards ────────────────────────────────────────
      case "csat_avg_rating":
        return (
          <MetricCard
            key="csat_avg_rating" fillCard
            title="Avg Rating"
            value={csat?.avgRating != null ? `${csat.avgRating} / 5` : "—"}
            icon={Star} loading={csatLoading}
            accentColor="#f59e0b"
            sub={csat ? csatHealthLabel(csatAvgVariant) : undefined}
            hint="Average CSAT score across all submitted ratings."
          />
        );
      case "csat_positive_rate":
        return (
          <MetricCard
            key="csat_positive_rate" fillCard
            title="Positive Rate"
            value={pct(csat?.positiveRate)}
            icon={ThumbsUp} loading={csatLoading}
            accentColor="#10b981"
            sub={csat ? csatHealthLabel(csatPositiveVariant) : undefined}
            hint="Percentage of ratings that were 4★ or 5★."
          />
        );
      case "csat_negative_rate":
        return (
          <MetricCard
            key="csat_negative_rate" fillCard
            title="Negative Rate"
            value={pct(csat?.negativeRate)}
            icon={ThumbsDown} loading={csatLoading}
            accentColor="#f43f5e"
            sub={csat ? csatHealthLabel(csatNegativeVariant) : undefined}
            hint="Percentage of ratings that were 1★ or 2★. Lower is better."
          />
        );
      case "csat_response_rate":
        return (
          <MetricCard
            key="csat_response_rate" fillCard
            title="Response Rate"
            value={csat != null ? `${csat.responseRate}%` : "—"}
            icon={BarChart2} loading={csatLoading}
            accentColor="#6366f1"
            sub={csat?.totalRatings != null ? `${csat.totalRatings.toLocaleString()} rating${csat.totalRatings === 1 ? "" : "s"} collected` : undefined}
            hint="Percentage of resolved/closed tickets that received a rating."
          />
        );
      case "csat_distribution":
        return (
          <Card key="csat_distribution" className="h-full flex flex-col">
            <CardHeader>
              <CardTitle className="text-sm">Rating Distribution</CardTitle>
              <CardDescription>{csat?.totalRatings ? `${csat.totalRatings} rating${csat.totalRatings === 1 ? "" : "s"} total` : "No ratings yet"}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              {csatLoading ? (
                <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
              ) : !csat?.totalRatings ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No CSAT ratings yet.</p>
              ) : (
                <RatingDistribution distribution={csat.distribution} total={csat.totalRatings} />
              )}
            </CardContent>
          </Card>
        );
      case "csat_recent":
        return (
          <Card key="csat_recent" className="h-full flex flex-col">
            <CardHeader>
              <CardTitle className="text-sm">Recent Ratings</CardTitle>
              <CardDescription>Last 10 submissions</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
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
                  onTemplate={template =>
                    saveDashboard.mutate({
                      dashboardId: null,
                      name: template.name,
                      description: template.description,
                      config: { ...template.config, period: presetToPeriod(preset) },
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
              const currentW    = currentItem?.w ?? (w.w ?? layoutDefaultFor(w.id).w);
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
            isSaving={saveDashboard.isPending}
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
