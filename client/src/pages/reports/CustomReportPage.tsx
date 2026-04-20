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
import { useParams, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Pencil, Save, Download, RotateCcw, ChevronDown, Loader2, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ErrorAlert from "@/components/ErrorAlert";
import { ReportCanvas }      from "@/components/analytics/ReportCanvas";
import { MetricLibrary, defaultSize } from "@/components/analytics/MetricLibrary";
import { WidgetConfigPanel } from "@/components/analytics/WidgetConfigPanel";
import {
  getReport, createReport, updateReport, exportMetric,
  type WidgetLayout, type ReportConfig, type MetricMeta, listMetrics,
} from "@/lib/reports/analytics-api";
import { cn } from "@/lib/utils";

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
  const reportId = reportIdParam ? Number(reportIdParam) : null;
  const navigate = useNavigate();
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

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
    setWidgets(reportData.config.widgets);
    const p = (reportData.config.dateRange as { preset?: string }).preset ?? "last_30_days";
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

  async function handleExport(format: "csv" | "xlsx") {
    if (widgets.length === 0) return;
    const w = widgets[0];
    const blob = await exportMetric({ metricId: w.metricId, dateRange: { preset } }, format);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${reportName}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
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
  // We break out of that padding with -mx-6 -mt-8 so the toolbar and sidebar span full width,
  // and use natural document scroll (no h-full) since the parent has no explicit height set.
  return (
    <div className="-mx-6 -mt-8 -mb-8 flex flex-col">

      {/* ── Toolbar — full-width, sticky below Layout header (h-14 = 56px) ── */}
      <div className="sticky top-14 z-20 flex items-center gap-2 px-4 py-2 border-b border-border/60 bg-background/95 backdrop-blur-sm">
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
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Export
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-xs" onClick={() => handleExport("csv")}>
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs" onClick={() => handleExport("xlsx")}>
                  Export as Excel (.xlsx)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => setEditMode(true)}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
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
      <div className="flex min-h-[calc(100vh-120px)]">

        {/* Metric library sidebar — edit mode only, sticky so it stays on screen while scrolling */}
        {editMode && (
          <aside className="w-56 shrink-0 border-r border-border/60 bg-background flex flex-col sticky top-[96px] h-[calc(100vh-96px)] overflow-hidden">
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
        <div className="flex-1 min-w-0 bg-muted/20 p-4" ref={containerRef}>
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
    </div>
  );
}
