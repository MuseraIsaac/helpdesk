/**
 * CustomReportPage — enterprise drag/drop analytics report builder.
 *
 * Modes:
 *   view  — locked grid, toolbar shows title + Edit button + Export
 *   edit  — metric library sidebar open, widgets draggable/resizable,
 *            toolbar shows Save/Discard + name field
 *
 * URL:
 *   /reports/custom          — new blank report
 *   /reports/custom/:id      — load existing saved report
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  Pencil, Save, Download, RotateCcw, ChevronDown, Loader2, Clock, Lock,
  ChevronRight, BarChart2, TrendingUp, ShieldCheck, AlertTriangle, Star,
  Users, UsersRound, BookOpen, Activity, Library, PackageCheck, Bug,
  CheckCircle2, GitBranch, Mail, FileDown, FileSpreadsheet, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ErrorAlert from "@/components/ErrorAlert";
import ShareReportEmailDialog from "@/components/reports/ShareReportEmailDialog";
import { usePrintReport } from "@/hooks/usePrintReport";
import { ReportCanvas }      from "@/components/analytics/ReportCanvas";
import { MetricLibrary, defaultSize } from "@/components/analytics/MetricLibrary";
import { WidgetConfigPanel } from "@/components/analytics/WidgetConfigPanel";
import {
  getReport, createReport, updateReport, exportMetric,
  type WidgetLayout, type ReportConfig, type MetricMeta, listMetrics,
} from "@/lib/reports/analytics-api";
import { cn } from "@/lib/utils";

// ── Compact reports section nav ───────────────────────────────────────────────

const REPORT_SECTIONS = [
  { path: "overview",   label: "Overview",       icon: BarChart2   },
  { path: "tickets",    label: "Tickets",         icon: TrendingUp  },
  { path: "sla",        label: "SLA",             icon: ShieldCheck },
  { path: "agents",     label: "Agents",          icon: Users       },
  { path: "teams",      label: "Teams",           icon: UsersRound  },
  { path: "incidents",  label: "Incidents",       icon: AlertTriangle },
  { path: "requests",   label: "Requests",        icon: PackageCheck },
  { path: "problems",   label: "Problems",        icon: Bug         },
  { path: "approvals",  label: "Approvals",       icon: CheckCircle2 },
  { path: "changes",    label: "Changes",         icon: GitBranch   },
  { path: "csat",       label: "CSAT",            icon: Star        },
  { path: "kb",         label: "KB",              icon: BookOpen    },
  { path: "realtime",   label: "Real-time",       icon: Activity    },
  { path: "library",    label: "Library",         icon: Library     },
] as const;

// ── Period options ────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { value: "last_7_days",  label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_90_days", label: "Last 90 days" },
  { value: "this_month",   label: "This month" },
  { value: "last_month",   label: "Last month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "this_year",    label: "This year" },
] as const;

// ── Blank report defaults ─────────────────────────────────────────────────────

const BLANK_CONFIG: ReportConfig = {
  dateRange: { preset: "last_30_days" },
  widgets: [],
  layout: "grid",
};

// ── Unique widget ID ──────────────────────────────────────────────────────────

let _counter = 0;
function uid() { return `w_${Date.now()}_${++_counter}`; }

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CustomReportPage() {
  const { id: reportIdParam } = useParams<{ id?: string }>();
  const reportId  = reportIdParam ? Number(reportIdParam) : null;
  const navigate  = useNavigate();
  const location  = useLocation();
  // curated=true is passed via location state when viewing a system report read-only
  const isCuratedView = (location.state as { curated?: boolean } | null)?.curated === true;
  const qc = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(900);

  // ── Measure container width ───────────────────────────────────────────────

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Report state ──────────────────────────────────────────────────────────

  const [editMode,  setEditMode]  = useState(!reportId);
  const [isDirty,   setIsDirty]   = useState(false);
  const [reportName, setReportName] = useState("Untitled Report");
  const [widgets,   setWidgets]   = useState<WidgetLayout[]>([]);
  const [preset,    setPreset]    = useState("last_30_days");

  // Widget editor state
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [shareOpen,  setShareOpen]  = useState(false);
  const printReport = usePrintReport();

  // ── Load existing report ──────────────────────────────────────────────────

  const { data: reportData, isLoading: loadingReport, error: reportError } = useQuery({
    queryKey: ["analytics", "report", reportId],
    queryFn: () => getReport(reportId!),
    enabled: reportId !== null,
    staleTime: 60_000,
  });

  // Sync fetched report into local state (runs once when data first arrives)
  const initialized = useRef(false);
  useEffect(() => {
    if (!reportData || initialized.current) return;
    initialized.current = true;
    setReportName(reportData.name);
    setWidgets(Array.isArray(reportData.config?.widgets) ? reportData.config.widgets : []);
    const p = (reportData.config?.dateRange as { preset?: string } | undefined)?.preset ?? "last_30_days";
    setPreset(p);
    setEditMode(false);
    setIsDirty(false);
  }, [reportData]);

  // ── Metric meta (for config panel) ───────────────────────────────────────

  const { data: allMetrics = [] } = useQuery({
    queryKey: ["analytics", "metrics"],
    queryFn: () => listMetrics(),
    staleTime: 5 * 60_000,
  });

  const editingWidget = widgets.find(w => w.id === editingId) ?? null;
  const editingMeta   = allMetrics.find(m => m.id === editingWidget?.metricId) ?? undefined;

  // ── Save mutation ─────────────────────────────────────────────────────────

  const saveMut = useMutation({
    mutationFn: async () => {
      const config: ReportConfig = {
        dateRange: { preset },
        widgets,
        layout: "grid",
      };
      if (reportId) {
        return updateReport(reportId, { name: reportName, config });
      }
      return createReport({ name: reportName, config, visibility: "private" });
    },
    onSuccess: (data) => {
      setIsDirty(false);
      setEditMode(false);
      qc.invalidateQueries({ queryKey: ["analytics", "reports"] });
      if (!reportId) navigate(`/reports/custom/${data.id}`, { replace: true });
    },
  });

  // ── Widget operations ─────────────────────────────────────────────────────

  const addWidget = useCallback((metric: MetricMeta) => {
    const { w, h } = defaultSize(metric.defaultVisualization);
    // Find next available y position
    const maxY = widgets.reduce((m, ww) => Math.max(m, ww.y + ww.h), 0);
    const newWidget: WidgetLayout = {
      id:                  uid(),
      metricId:            metric.id,
      visualization:       metric.defaultVisualization,
      limit:               10,
      compareWithPrevious: false,
      x: 0, y: maxY, w, h,
    };
    setWidgets(prev => [...prev, newWidget]);
    setIsDirty(true);
  }, [widgets]);

  const updateWidgets = useCallback((updated: WidgetLayout[]) => {
    setWidgets(updated);
    setIsDirty(true);
  }, []);

  const duplicateWidget = useCallback((id: string) => {
    setWidgets(prev => {
      const src = prev.find(w => w.id === id);
      if (!src) return prev;
      const maxY = prev.reduce((m, ww) => Math.max(m, ww.y + ww.h), 0);
      return [...prev, { ...src, id: uid(), y: maxY }];
    });
    setIsDirty(true);
  }, []);

  const removeWidget = useCallback((id: string) => {
    setWidgets(prev => prev.filter(w => w.id !== id));
    setIsDirty(true);
  }, []);

  const applyWidgetConfig = useCallback((updated: WidgetLayout) => {
    setWidgets(prev => prev.map(w => w.id === updated.id ? updated : w));
    setIsDirty(true);
  }, []);

  // ── Discard changes ───────────────────────────────────────────────────────

  async function handleDiscard() {
    if (!reportId) {
      navigate("/reports/overview");
      return;
    }
    const data = await qc.ensureQueryData({
      queryKey: ["analytics", "report", reportId],
      queryFn: () => getReport(reportId),
    });
    setReportName(data.name);
    setWidgets(data.config.widgets);
    const p = (data.config.dateRange as { preset?: string }).preset ?? "last_30_days";
    setPreset(p);
    setEditMode(false);
    setIsDirty(false);
  }

  // ── Export ────────────────────────────────────────────────────────────────

  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);

  async function handleExport(format: "csv" | "xlsx") {
    if (!reportId) return; // report must be saved before exporting
    setExporting(format);
    try {
      const resp = await axios.post(
        `/api/analytics/reports/${reportId}/export`,
        { format },
        { responseType: "blob" },
      );
      const ext  = format === "xlsx" ? "xlsx" : "csv";
      const mime = format === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv";
      const url  = URL.createObjectURL(new Blob([resp.data as BlobPart], { type: mime }));
      const a    = document.createElement("a");
      a.href = url; a.download = `${reportName}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadingReport) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading report…
      </div>
    );
  }
  if (reportError) {
    return <ErrorAlert error={reportError as Error} fallback="Failed to load report" />;
  }

  // Layout note: this page renders inside Layout's <main className="flex-1 px-6 py-8 max-w-[1200px]">.
  // We break out of that padding with -mx-6 -mt-8 so the toolbar and sidebar span full width.
  return (
    <div className="-mx-6 -mt-8 -mb-8 flex flex-col">

      {/* ── Reports nav bar — sticky at top-14 (just below the app header) ── */}
      {/*    Keeps all report section tabs visible no matter where you are.    */}
      <div className="sticky top-14 z-30 bg-background border-b border-border/60 shadow-sm">
        {/* Breadcrumb row */}
        <div className="flex items-center gap-1.5 px-4 py-2 text-xs text-muted-foreground border-b border-border/40">
          <Link to="/reports/overview" className="hover:text-foreground transition-colors font-medium">
            Reports
          </Link>
          <ChevronRight className="h-3 w-3 opacity-40 shrink-0" />
          <Link to="/reports/library" className="hover:text-foreground transition-colors">
            Library
          </Link>
          {reportId && (
            <>
              <ChevronRight className="h-3 w-3 opacity-40 shrink-0" />
              <span className="text-foreground font-medium truncate max-w-[200px]">{reportName}</span>
            </>
          )}
          {!reportId && (
            <>
              <ChevronRight className="h-3 w-3 opacity-40 shrink-0" />
              <span className="text-foreground font-medium">New Report</span>
            </>
          )}
          {isCuratedView && (
            <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/60">
              <Lock className="h-2.5 w-2.5" />Read-only
            </span>
          )}
          {editMode && !isCuratedView && (
            <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
              {reportId ? "Editing" : "Building"}
            </span>
          )}
        </div>

        {/* Section tabs — horizontally scrollable */}
        <nav className="flex overflow-x-auto scrollbar-none px-2" aria-label="Report sections">
          {REPORT_SECTIONS.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              to={`/reports/${path}?period=30`}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium whitespace-nowrap text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <Icon className="h-3 w-3 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>
      </div>

      {/* ── Toolbar — sticky below the reports nav bar (~top-14 + 72px = top-32) ── */}
      <div className="sticky top-32 z-20 flex items-center gap-2 px-4 py-2 border-b border-border/60 bg-background/95 backdrop-blur-sm">
        {editMode ? (
          <Input
            value={reportName}
            onChange={e => { setReportName(e.target.value); setIsDirty(true); }}
            className="h-7 w-56 text-sm font-semibold border-0 bg-muted/50 focus-visible:ring-1"
            placeholder="Report name…"
          />
        ) : (
          <h1 className="text-sm font-semibold text-foreground truncate max-w-xs">{reportName}</h1>
        )}

        <div className="flex items-center gap-1.5 ml-2 shrink-0">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={preset} onValueChange={v => { setPreset(v); setIsDirty(true); }}>
            <SelectTrigger className="h-7 text-[11px] border-0 bg-muted/50 gap-1 pr-2 focus:ring-1 w-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1" />

        {/* View mode actions */}
        {!editMode && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                  disabled={!!exporting || !reportId}
                  title={!reportId ? "Save the report first to enable export" : undefined}
                >
                  {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Export
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem className="text-xs gap-2" onClick={() => handleExport("xlsx")} disabled={exporting === "xlsx"}>
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                  Export as Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs gap-2" onClick={() => handleExport("csv")} disabled={exporting === "csv"}>
                  <FileText className="h-3.5 w-3.5 text-blue-500" />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-xs gap-2"
                  onClick={() => printReport({
                    title: reportName,
                    periodLabel: PERIOD_OPTIONS.find(o => o.value === preset)?.label ?? preset,
                  })}
                >
                  <FileDown className="h-3.5 w-3.5 text-muted-foreground" />
                  Save as PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline" size="sm" className="h-7 text-xs gap-1.5"
              onClick={() => setShareOpen(true)}
            >
              <Mail className="h-3.5 w-3.5" />
              Share
            </Button>
            {!isCuratedView && (
              <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => setEditMode(true)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            )}
          </>
        )}

        {/* Edit mode actions */}
        {editMode && (
          <>
            {isDirty && (
              <span className="text-[10px] text-muted-foreground">Unsaved changes</span>
            )}
            <Button
              variant="outline" size="sm" className="h-7 text-xs gap-1.5"
              onClick={handleDiscard} disabled={saveMut.isPending}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Discard
            </Button>
            <Button
              size="sm" className="h-7 text-xs gap-1.5"
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !reportName.trim()}
            >
              {saveMut.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Save className="h-3.5 w-3.5" />
              }
              {saveMut.isPending ? "Saving…" : "Save Report"}
            </Button>
          </>
        )}
      </div>

      {saveMut.isError && (
        <div className="px-4 pt-2">
          <ErrorAlert error={saveMut.error as Error} fallback="Failed to save report" />
        </div>
      )}

      {/* ── Body — sidebar + canvas as a natural-height row ─────────────── */}
      <div className="flex min-h-[calc(100vh-160px)]">

        {/* Metric library sidebar — edit mode only, sticky below nav + toolbar */}
        {editMode && (
          <aside className="w-56 shrink-0 border-r border-border/60 bg-background flex flex-col sticky top-[168px] h-[calc(100vh-168px)] overflow-hidden">
            <div className="px-3 pt-3 pb-1.5 shrink-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Metric Library
              </p>
            </div>
            <MetricLibrary
              onAddMetric={addWidget}
              existingIds={widgets.map(w => w.id)}
            />
          </aside>
        )}

        {/* Canvas — grows with widget content, page scrolls naturally */}
        <div id="report-print-area" className="flex-1 min-w-0 bg-muted/20 p-4" ref={containerRef}>
          <ReportCanvas
            widgets={widgets}
            dateRange={{ preset }}
            editMode={editMode}
            containerWidth={Math.max(containerWidth - 32, 400)}
            onLayoutChange={updateWidgets}
            onEditWidget={id => { setEditingId(id); setConfigOpen(true); }}
            onDuplicateWidget={duplicateWidget}
            onRemoveWidget={removeWidget}
          />
        </div>
      </div>

      {/* Widget config sheet */}
      {editingWidget && (
        <WidgetConfigPanel
          open={configOpen}
          onOpenChange={setConfigOpen}
          widget={editingWidget}
          metricMeta={editingMeta}
          onSave={applyWidgetConfig}
        />
      )}

      {/* Share via email dialog */}
      <ShareReportEmailDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        section="custom"
        period={preset.replace("last_", "").replace("_days", "")}
        reportId={reportId ?? undefined}
        reportName={reportName}
      />
    </div>
  );
}
