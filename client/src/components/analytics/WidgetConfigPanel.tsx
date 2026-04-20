/**
 * WidgetConfigPanel — sheet drawer for editing a single widget's settings.
 * Lets users change: title, visualization type, group-by, limit, period comparison.
 */
import { useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { WidgetLayout } from "@/lib/reports/analytics-api";
import type { MetricMeta } from "@/lib/reports/analytics-api";

const VIZ_LABELS: Record<string, string> = {
  number:         "Number",
  number_change:  "Number + Change",
  gauge:          "Gauge",
  line:           "Line Chart",
  area:           "Area Chart",
  bar:            "Bar Chart",
  bar_horizontal: "Horizontal Bar",
  stacked_bar:    "Stacked Bar",
  donut:          "Donut",
  histogram:      "Histogram",
  leaderboard:    "Leaderboard",
  table:          "Table",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widget: WidgetLayout;
  metricMeta?: MetricMeta;
  onSave: (updated: WidgetLayout) => void;
}

export function WidgetConfigPanel({ open, onOpenChange, widget, metricMeta, onSave }: Props) {
  const [title,     setTitle]     = useState(widget.title ?? "");
  const [viz,       setViz]       = useState(widget.visualization);
  const [groupBy,   setGroupBy]   = useState(widget.groupBy ?? "");
  const [limit,     setLimit]     = useState(String(widget.limit ?? 10));
  const [compare,   setCompare]   = useState(widget.compareWithPrevious ?? false);

  const availableViz  = metricMeta?.supportedVisualizations ?? [widget.visualization];
  const availableGrp  = metricMeta?.supportedGroupBys ?? [];

  function handleSave() {
    onSave({
      ...widget,
      title:               title.trim() || undefined,
      visualization:       viz,
      groupBy:             groupBy || undefined,
      limit:               Math.max(1, Math.min(100, Number(limit) || 10)),
      compareWithPrevious: compare,
    });
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-80 flex flex-col gap-0 p-0" side="right">
        <SheetHeader className="px-5 pt-5 pb-4 border-b shrink-0">
          <SheetTitle className="text-sm">Edit Widget</SheetTitle>
          <p className="text-[11px] text-muted-foreground">{metricMeta?.label ?? widget.metricId}</p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Custom title */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
              Widget Title
            </Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={metricMeta?.label ?? widget.metricId}
              className="h-8 text-xs"
            />
          </div>

          {/* Visualization */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
              Visualization
            </Label>
            <Select value={viz} onValueChange={setViz}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableViz.map(v => (
                  <SelectItem key={v} value={v} className="text-xs">
                    {VIZ_LABELS[v] ?? v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Group by */}
          {availableGrp.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
                Group By
              </Label>
              <Select value={groupBy || "__none__"} onValueChange={v => setGroupBy(v === "__none__" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-xs">Default</SelectItem>
                  {availableGrp.map(g => (
                    <SelectItem key={g} value={g} className="text-xs capitalize">{g.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Row limit */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
              Row / Result Limit
            </Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={limit}
              onChange={e => setLimit(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          {/* Period comparison */}
          <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
            <div>
              <p className="text-[11px] font-medium">Compare with previous period</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Shows delta vs. prior period (stat widgets).</p>
            </div>
            <Switch checked={compare} onCheckedChange={setCompare} />
          </div>
        </div>

        <SheetFooter className="px-5 pb-5 pt-3 border-t shrink-0 flex gap-2">
          <Button variant="outline" className="flex-1 h-8 text-xs" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="flex-1 h-8 text-xs" onClick={handleSave}>
            Apply
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
