/**
 * WidgetAppearanceEditor — a side-sheet for customising the visual style of
 * a single dashboard widget.
 *
 * Features:
 *   - Accent colour picker (20 curated swatches + hex input)
 *   - Chart-type override (where the widget supports it)
 *   - Up to 8 numeric threshold rules (metric / operator / value / colour)
 *   - Custom display-name override
 *   - Live preview of accent colour on the widget label
 */

import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Palette, Type, BarChart2, TrendingUp, PieChart, Activity,
  Plus, Trash2, Check, RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type WidgetId, WIDGET_META, WIDGET_PRESENTATION } from "core/schemas/dashboard.ts";
import type { WidgetAppearance, WidgetThreshold } from "core/schemas/dashboard.ts";

// ── Colour palette ─────────────────────────────────────────────────────────────

const SWATCHES = [
  "#3B82F6", "#6366F1", "#8B5CF6", "#A855F7", "#EC4899",
  "#EF4444", "#F97316", "#F59E0B", "#EAB308", "#84CC16",
  "#22C55E", "#10B981", "#14B8A6", "#06B6D4", "#0EA5E9",
  "#64748B", "#1E293B", "#7C3AED", "#BE185D", "#0369A1",
];

// ── Chart type options (only for chart-based widgets) ─────────────────────────

const CHART_TYPES: { value: string; label: string; icon: React.ElementType }[] = [
  { value: "default", label: "Default",    icon: BarChart2   },
  { value: "bar",     label: "Bar chart",  icon: BarChart2   },
  { value: "line",    label: "Line chart", icon: TrendingUp  },
  { value: "area",    label: "Area chart", icon: Activity    },
  { value: "pie",     label: "Pie/Donut",  icon: PieChart    },
];

const CHART_WIDGETS: WidgetId[] = [
  "tickets_per_day", "backlog_trend", "csat_trend", "resolution_dist",
  "channel_breakdown", "breakdowns",
];

const THRESHOLD_OPERATORS = [
  { value: "gt",  label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt",  label: "<" },
  { value: "lte", label: "≤" },
  { value: "eq",  label: "=" },
];

const THRESHOLD_COLORS = [
  { value: "#EF4444", label: "Red",    bg: "bg-red-500"    },
  { value: "#F97316", label: "Orange", bg: "bg-orange-500" },
  { value: "#F59E0B", label: "Amber",  bg: "bg-amber-500"  },
  { value: "#22C55E", label: "Green",  bg: "bg-green-500"  },
  { value: "#3B82F6", label: "Blue",   bg: "bg-blue-500"   },
  { value: "#8B5CF6", label: "Violet", bg: "bg-violet-500" },
  { value: "#64748B", label: "Gray",   bg: "bg-slate-500"  },
];

// ── Component ──────────────────────────────────────────────────────────────────

interface WidgetAppearanceEditorProps {
  open:        boolean;
  onOpenChange:(open: boolean) => void;
  widgetId:    WidgetId;
  appearance:  WidgetAppearance | undefined;
  onSave:      (appearance: WidgetAppearance) => void;
}

export default function WidgetAppearanceEditor({
  open, onOpenChange, widgetId, appearance, onSave,
}: WidgetAppearanceEditorProps) {
  const [accentColor,   setAccentColor]   = useState<string>(appearance?.accentColor ?? "");
  const [chartType,     setChartType]     = useState<string>(appearance?.chartType   ?? "default");
  const [titleOverride, setTitleOverride] = useState<string>(appearance?.titleOverride ?? "");
  const [thresholds,    setThresholds]    = useState<WidgetThreshold[]>(appearance?.thresholds ?? []);
  const [hexInput,      setHexInput]      = useState<string>(appearance?.accentColor ?? "");

  // Sync local state when appearance prop changes (e.g. different widget opened)
  useEffect(() => {
    setAccentColor(appearance?.accentColor ?? "");
    setChartType(appearance?.chartType ?? "default");
    setTitleOverride(appearance?.titleOverride ?? "");
    setThresholds(appearance?.thresholds ?? []);
    setHexInput(appearance?.accentColor ?? "");
  }, [widgetId, appearance]);

  const meta         = WIDGET_META[widgetId];
  const presentation = WIDGET_PRESENTATION[widgetId];
  const isChartWidget = CHART_WIDGETS.includes(widgetId);

  function handleSwatch(hex: string) {
    setAccentColor(hex);
    setHexInput(hex);
  }

  function handleHexInput(v: string) {
    setHexInput(v);
    if (/^#[0-9a-fA-F]{6}$/.test(v)) setAccentColor(v);
  }

  function addThreshold() {
    if (thresholds.length >= 8) return;
    setThresholds(prev => [...prev, { metric: "", operator: "gt", value: 0, color: "#EF4444" }]);
  }

  function removeThreshold(i: number) {
    setThresholds(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateThreshold<K extends keyof WidgetThreshold>(i: number, key: K, value: WidgetThreshold[K]) {
    setThresholds(prev => prev.map((t, idx) => idx === i ? { ...t, [key]: value } : t));
  }

  function handleSave() {
    const result: WidgetAppearance = {};
    if (accentColor)                                      result.accentColor   = accentColor as `#${string}`;
    if (chartType && chartType !== "default")             result.chartType     = chartType as WidgetAppearance["chartType"];
    if (titleOverride.trim())                             result.titleOverride = titleOverride.trim();
    if (thresholds.length > 0 && thresholds.every(t => t.metric)) result.thresholds = thresholds;
    onSave(result);
    onOpenChange(false);
  }

  function handleReset() {
    setAccentColor("");
    setChartType("default");
    setTitleOverride("");
    setThresholds([]);
    setHexInput("");
    onSave({});
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[380px] sm:w-[420px] overflow-y-auto flex flex-col gap-0 p-0">
        {/* Header */}
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border/50 bg-muted/20 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 transition-colors"
              style={{
                background: accentColor ? `${accentColor}18` : undefined,
                borderColor: accentColor ? `${accentColor}40` : undefined,
              }}
            >
              <Palette className="h-4.5 w-4.5" style={{ color: accentColor || undefined }} />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-sm leading-tight">Widget Style</SheetTitle>
              <SheetDescription className="text-[11px] leading-tight mt-0.5 truncate">
                {meta.label} · {presentation}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          {/* ── Display name ─────────────────────────────────────────────── */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Type className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Display Name
              </Label>
            </div>
            <Input
              value={titleOverride}
              onChange={e => setTitleOverride(e.target.value)}
              placeholder={meta.label}
              className="h-8 text-sm"
              maxLength={80}
            />
            <p className="text-[10px] text-muted-foreground/70">
              Leave blank to use the default widget name.
            </p>
          </section>

          <Separator />

          {/* ── Accent colour ─────────────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Palette className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Accent Colour
              </Label>
              {accentColor && (
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">{accentColor}</span>
              )}
            </div>

            {/* Swatch grid */}
            <div className="grid grid-cols-10 gap-1.5">
              {SWATCHES.map(hex => (
                <button
                  key={hex}
                  type="button"
                  title={hex}
                  onClick={() => handleSwatch(hex)}
                  className={cn(
                    "h-6 w-6 rounded-md border-2 transition-all hover:scale-110",
                    accentColor === hex
                      ? "border-foreground scale-110 shadow-sm"
                      : "border-transparent",
                  )}
                  style={{ background: hex }}
                />
              ))}
            </div>

            {/* Hex input */}
            <div className="flex items-center gap-2">
              <div
                className="h-7 w-7 rounded-md border shrink-0"
                style={{ background: /^#[0-9a-fA-F]{6}$/.test(hexInput) ? hexInput : "transparent" }}
              />
              <Input
                value={hexInput}
                onChange={e => handleHexInput(e.target.value)}
                placeholder="#3B82F6"
                className="h-7 text-xs font-mono flex-1"
                maxLength={7}
              />
              {accentColor && (
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground"
                  onClick={() => { setAccentColor(""); setHexInput(""); }}>
                  <RotateCcw className="h-3 w-3" />
                </Button>
              )}
            </div>

            {/* Preview strip */}
            {accentColor && (
              <div
                className="rounded-lg border px-3 py-2.5 flex items-center gap-2.5 text-sm font-medium"
                style={{ borderColor: `${accentColor}40`, background: `${accentColor}10`, color: accentColor }}
              >
                <div className="h-2 w-2 rounded-full" style={{ background: accentColor }} />
                {titleOverride || meta.label}
              </div>
            )}
          </section>

          {/* ── Chart type (chart widgets only) ───────────────────────────── */}
          {isChartWidget && (
            <>
              <Separator />
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <BarChart2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Chart Style
                  </Label>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {CHART_TYPES.map(ct => {
                    const Icon = ct.icon;
                    const active = chartType === ct.value;
                    return (
                      <button
                        key={ct.value}
                        type="button"
                        onClick={() => setChartType(ct.value)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 text-center text-[11px] font-medium transition-all",
                          active
                            ? "border-primary bg-primary/8 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {ct.label}
                        {active && <Check className="h-2.5 w-2.5" />}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground/70">
                  Note: some chart types may not suit every widget's data shape.
                </p>
              </section>
            </>
          )}

          {/* ── Value thresholds ──────────────────────────────────────────── */}
          <Separator />
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Colour Thresholds
                </Label>
              </div>
              {thresholds.length < 8 && (
                <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 px-2"
                  onClick={addThreshold}>
                  <Plus className="h-3 w-3" /> Add Rule
                </Button>
              )}
            </div>

            {thresholds.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 px-4 py-5 text-center space-y-1">
                <p className="text-xs text-muted-foreground/70">No threshold rules yet.</p>
                <p className="text-[10px] text-muted-foreground/50">
                  Rules highlight metric values in a colour when a condition is met.
                  <br />e.g. SLA Compliance &lt; 80 → show red.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {thresholds.map((t, i) => (
                  <div key={i} className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                    {/* Metric + operator + value */}
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={t.metric}
                        onChange={e => updateThreshold(i, "metric", e.target.value)}
                        placeholder="metric (e.g. totalTickets)"
                        className="h-7 text-xs flex-1 font-mono"
                      />
                      <Select value={t.operator} onValueChange={v => updateThreshold(i, "operator", v as WidgetThreshold["operator"])}>
                        <SelectTrigger className="h-7 w-14 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {THRESHOLD_OPERATORS.map(op => (
                            <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        value={t.value}
                        onChange={e => updateThreshold(i, "value", Number(e.target.value))}
                        className="h-7 w-20 text-xs text-right"
                      />
                    </div>

                    {/* Colour + label row */}
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1.5 flex-1">
                        {THRESHOLD_COLORS.map(tc => (
                          <button
                            key={tc.value}
                            type="button"
                            title={tc.label}
                            onClick={() => updateThreshold(i, "color", tc.value)}
                            className={cn(
                              "h-5 w-5 rounded-full flex items-center justify-center transition-transform",
                              tc.bg,
                              t.color === tc.value ? "ring-2 ring-offset-1 ring-foreground scale-110" : "hover:scale-110",
                            )}
                          >
                            {t.color === tc.value && <Check className="h-2.5 w-2.5 text-white" />}
                          </button>
                        ))}
                      </div>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => removeThreshold(i)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>

                    {/* Preview badge */}
                    <div
                      className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                      style={{ color: t.color, borderColor: `${t.color}40`, background: `${t.color}15` }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.color }} />
                      {t.metric || "metric"} {THRESHOLD_OPERATORS.find(o=>o.value===t.operator)?.label} {t.value}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Footer actions */}
        <div className="shrink-0 border-t border-border/50 px-5 py-4 flex items-center gap-2 bg-background">
          <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground hover:text-destructive"
            onClick={handleReset}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to default
          </Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" className="gap-1.5" onClick={handleSave}>
            <Check className="h-3.5 w-3.5" />
            Apply Style
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
