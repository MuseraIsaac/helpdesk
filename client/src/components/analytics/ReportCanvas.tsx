/**
 * ReportCanvas — the react-grid-layout powered drag/drop/resize grid.
 *
 * In edit mode:   draggable + resizable, drag handle class = "drag-handle"
 * In view mode:   static layout, no drag/resize handles
 *
 * Each item in `widgets` is a WidgetLayout (x, y, w, h + metric config).
 * The canvas owns layout state and syncs back via onLayoutChange.
 */
// Grid layout base CSS — provides drag placeholder and resize handle styles
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import { useMemo, useCallback, Component, type ReactNode } from "react";
import GridLayout, { type Layout } from "react-grid-layout";
import { useMetricQuery } from "@/hooks/useMetricQuery";
import { WidgetShell } from "./WidgetShell";
import { WidgetRenderer, EmptyWidget } from "./WidgetRenderer";
import type { WidgetLayout } from "@/lib/reports/analytics-api";

// ── Per-widget error boundary ─────────────────────────────────────────────────
// Prevents a single widget crash from taking down the entire report canvas.

class WidgetErrorBoundary extends Component<
  { children: ReactNode; label: string },
  { crashed: boolean; message: string }
> {
  constructor(props: { children: ReactNode; label: string }) {
    super(props);
    this.state = { crashed: false, message: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { crashed: true, message: error.message };
  }
  render() {
    if (this.state.crashed) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-2 text-center py-6 bg-card border border-border/70 rounded-lg">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            {this.props.label}
          </p>
          <p className="text-[10px] text-destructive/70 max-w-[180px] leading-relaxed">
            Widget failed to render. Try refreshing.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Layout constants ──────────────────────────────────────────────────────────

const COLS      = 12;
const ROW_H     = 80; // px per row unit
const MARGIN_X  = 10; // px between columns
const MARGIN_Y  = 10; // px between rows

// ── Connected widget (fetches its own data) ───────────────────────────────────

interface ConnectedWidgetProps {
  widget: WidgetLayout;
  /** Canvas-level date range (used when widget has no per-widget override). */
  canvasDateRange: { preset: string };
  cellHeight: number;
  editMode: boolean;
  onEdit:      () => void;
  onDuplicate: () => void;
  onRemove:    () => void;
}

function ConnectedWidget({
  widget, canvasDateRange, cellHeight, editMode, onEdit, onDuplicate, onRemove,
}: ConnectedWidgetProps) {
  const dateRange = widget.dateRange ?? canvasDateRange;

  const { data, isLoading, error, refetch } = useMetricQuery(
    widget.id,
    {
      metricId:            widget.metricId,
      dateRange,
      filters:             widget.filters,
      groupBy:             widget.groupBy,
      visualization:       widget.visualization,
      sort:                widget.sort,
      limit:               widget.limit,
      compareWithPrevious: widget.compareWithPrevious,
    },
  );

  const contentH = cellHeight - 40 - 12; // subtract HEADER_H + PADDING

  const hasData = !!(data && !error && data.result);
  const isEmpty = hasData && (() => {
    const r = data!.result;
    if (r.type === "grouped_count") return r.items.length === 0;
    if (r.type === "distribution")  return r.buckets.length === 0;
    if (r.type === "leaderboard")   return r.entries.length === 0;
    if (r.type === "table")         return r.rows.length === 0;
    if (r.type === "time_series")   return r.points.length === 0;
    return false;
  })();

  return (
    <WidgetShell
      title={widget.title ?? data?.label ?? widget.metricId}
      badge={data?.unit ?? undefined}
      isLoading={isLoading}
      error={error ?? null}
      onRetry={() => refetch()}
      editMode={editMode}
      onEdit={editMode ? onEdit : undefined}
      onDuplicate={editMode ? onDuplicate : undefined}
      onRemove={editMode ? onRemove : undefined}
      totalHeight={cellHeight}
    >
      {hasData && !isEmpty ? (
        <WidgetRenderer
          result={data.result}
          visualization={widget.visualization}
          height={contentH}
        />
      ) : hasData && isEmpty ? (
        <EmptyWidget />
      ) : null}
    </WidgetShell>
  );
}

// ── Canvas ────────────────────────────────────────────────────────────────────

export interface ReportCanvasProps {
  widgets: WidgetLayout[];
  dateRange: { preset: string };
  editMode: boolean;
  containerWidth: number;
  onLayoutChange: (updated: WidgetLayout[]) => void;
  onEditWidget:      (id: string) => void;
  onDuplicateWidget: (id: string) => void;
  onRemoveWidget:    (id: string) => void;
}

export function ReportCanvas({
  widgets,
  dateRange,
  editMode,
  containerWidth,
  onLayoutChange,
  onEditWidget,
  onDuplicateWidget,
  onRemoveWidget,
}: ReportCanvasProps) {
  const layout: Layout[] = useMemo(
    () => widgets.map(w => ({ i: w.id, x: w.x, y: w.y, w: w.w, h: w.h, minW: 2, minH: 2 })),
    [widgets],
  );

  const handleLayoutChange = useCallback(
    (newLayout: Layout[]) => {
      const byId = new Map(newLayout.map(l => [l.i, l]));
      const updated = widgets.map(w => {
        const l = byId.get(w.id);
        if (!l) return w;
        return { ...w, x: l.x, y: l.y, w: l.w, h: l.h };
      });
      onLayoutChange(updated);
    },
    [widgets, onLayoutChange],
  );

  if (widgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center rounded-xl border-2 border-dashed border-border/50 text-muted-foreground">
        <p className="text-sm font-medium">No widgets yet</p>
        <p className="text-[11px] mt-1">Add metrics from the panel on the left to get started.</p>
      </div>
    );
  }

  return (
    <GridLayout
      className="layout"
      layout={layout}
      cols={COLS}
      rowHeight={ROW_H}
      width={containerWidth}
      margin={[MARGIN_X, MARGIN_Y]}
      isDraggable={editMode}
      isResizable={editMode}
      draggableHandle=".drag-handle"
      onLayoutChange={handleLayoutChange}
      useCSSTransforms
      resizeHandles={editMode ? ["se"] : []}
    >
      {widgets.map(widget => {
        const cellHeight = widget.h * ROW_H + (widget.h - 1) * MARGIN_Y;
        return (
          <div key={widget.id}>
            <WidgetErrorBoundary label={widget.title ?? widget.metricId}>
              <ConnectedWidget
                widget={widget}
                canvasDateRange={dateRange}
                cellHeight={cellHeight}
                editMode={editMode}
                onEdit={() => onEditWidget(widget.id)}
                onDuplicate={() => onDuplicateWidget(widget.id)}
                onRemove={() => onRemoveWidget(widget.id)}
              />
            </WidgetErrorBoundary>
          </div>
        );
      })}
    </GridLayout>
  );
}
