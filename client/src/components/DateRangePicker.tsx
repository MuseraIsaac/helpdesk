/**
 * DateRangePicker — unified period preset + custom date range selector.
 *
 * Layout: left panel (presets) + right panel (year strip → dual-month calendar → footer).
 *
 * Year navigation
 * ───────────────
 * A year strip sits above the calendar with:
 *   «  prev-year arrow — shifts view back one full year
 *   year chips         — ±3 years around the current view year, click to jump
 *   »  next-year arrow — shifts view forward one full year
 *
 * The calendar's own ‹ / › arrows remain for month-by-month navigation.
 * Together they let users jump years instantly and fine-tune with months.
 *
 * Flow
 * ────
 * • Preset selected → applies immediately, popover closes.
 * • Calendar touched → switches to "custom" mode, shows draft in footer.
 * • Apply clicked    → commits draft to URL params, popover closes.
 * • Cancel clicked   → resets draft to last committed range.
 */
import { useState, useCallback } from "react";
import { type DateRange } from "react-day-picker";
import {
  CalendarDays, ChevronDown, Check, ArrowRight,
  ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ── Period definitions ────────────────────────────────────────────────────────

export const PERIOD_OPTIONS = [
  { value: "today",      label: "Today"        },
  { value: "yesterday",  label: "Yesterday"    },
  { value: "7",          label: "Last 7 days"  },
  { value: "30",         label: "Last 30 days" },
  { value: "90",         label: "Last 90 days" },
  { value: "this_month", label: "This month"   },
  { value: "last_month", label: "Last month"   },
  { value: "custom",     label: "Custom range" },
] as const;

export type PeriodPreset = (typeof PERIOD_OPTIONS)[number]["value"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtTrigger(period: string, customFrom?: string, customTo?: string): string {
  if (period === "custom" && customFrom && customTo) {
    const fmt = (s: string) => {
      const [y, m, d] = s.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString("en", { month: "short", day: "numeric" });
    };
    const fromYear = customFrom.slice(0, 4);
    const toYear   = customTo.slice(0, 4);
    return fromYear === toYear
      ? `${fmt(customFrom)} – ${fmt(customTo)}, ${fromYear}`
      : `${fmtShort(customFrom)} – ${fmtShort(customTo)}`;
  }
  if (period === "custom") return "Custom range";
  return PERIOD_OPTIONS.find(o => o.value === period)?.label ?? `Last ${period} days`;
}

function startingMonth(customFrom?: string): Date {
  if (customFrom) {
    const [y, m] = customFrom.split("-").map(Number);
    return new Date(y, m - 1, 1);
  }
  const now = new Date();
  // Show [prev month | current month] so today is on the right
  return new Date(now.getFullYear(), now.getMonth() - 1, 1);
}

// ── Year strip ────────────────────────────────────────────────────────────────

const THIS_YEAR = new Date().getFullYear();
const MIN_YEAR  = 2018;

interface YearStripProps {
  viewYear:  number;
  onYear:    (year: number) => void;
  onPrevYear: () => void;
  onNextYear: () => void;
}

function YearStrip({ viewYear, onYear, onPrevYear, onNextYear }: YearStripProps) {
  // Show 7 chips centred on viewYear, clamped to [MIN_YEAR, THIS_YEAR]
  const chips: number[] = [];
  const center = Math.max(MIN_YEAR + 3, Math.min(THIS_YEAR - 3, viewYear));
  for (let y = center - 3; y <= center + 3; y++) {
    if (y >= MIN_YEAR && y <= THIS_YEAR) chips.push(y);
  }

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-border/50 bg-muted/20 select-none">
      {/* Prev year */}
      <button
        type="button"
        onClick={onPrevYear}
        disabled={viewYear <= MIN_YEAR}
        title="Previous year"
        className={cn(
          "flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground",
          "hover:bg-muted hover:text-foreground transition-colors",
          "disabled:opacity-30 disabled:cursor-not-allowed",
        )}
      >
        <ChevronsLeft className="h-3.5 w-3.5" />
      </button>

      {/* Year chips */}
      <div className="flex items-center gap-0.5 flex-1 justify-center">
        {chips.map(y => {
          const isCurrent = y === viewYear;
          return (
            <button
              key={y}
              type="button"
              onClick={() => onYear(y)}
              className={cn(
                "px-2.5 py-0.5 rounded-full text-xs font-medium transition-all",
                isCurrent
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {y}
            </button>
          );
        })}
      </div>

      {/* Next year */}
      <button
        type="button"
        onClick={onNextYear}
        disabled={viewYear >= THIS_YEAR}
        title="Next year"
        className={cn(
          "flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground",
          "hover:bg-muted hover:text-foreground transition-colors",
          "disabled:opacity-30 disabled:cursor-not-allowed",
        )}
      >
        <ChevronsRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface DateRangePickerProps {
  period:     string;
  customFrom?: string;
  customTo?:   string;
  onPeriod:   (v: string) => void;
  onCustom:   (range: { from: string; to: string }) => void;
  className?:  string;
}

export default function DateRangePicker({
  period,
  customFrom,
  customTo,
  onPeriod,
  onCustom,
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);

  // Controlled month for the calendar — lets the year strip drive navigation.
  const [viewMonth, setViewMonth] = useState<Date>(startingMonth(customFrom));

  // Draft range lives inside the popover until Apply is clicked.
  const [draft, setDraft] = useState<DateRange | undefined>(
    customFrom
      ? {
          from: new Date(customFrom + "T00:00:00"),
          to:   customTo ? new Date(customTo + "T00:00:00") : undefined,
        }
      : undefined,
  );

  const [hoveredPreset, setHoveredPreset] = useState<string | null>(null);

  const isCustom      = period === "custom";
  const hasFullDraft  = !!(draft?.from && draft?.to);
  const activePreset  = hoveredPreset ?? period;
  const viewYear      = viewMonth.getFullYear();

  // ── Year navigation ─────────────────────────────────────────────────────────

  const jumpToYear = useCallback((year: number) => {
    setViewMonth(m => new Date(year, m.getMonth(), 1));
  }, []);

  const prevYear = useCallback(() => {
    setViewMonth(m => new Date(m.getFullYear() - 1, m.getMonth(), 1));
  }, []);

  const nextYear = useCallback(() => {
    setViewMonth(m => {
      const next = new Date(m.getFullYear() + 1, m.getMonth(), 1);
      return next > new Date() ? m : next;          // don't advance past today
    });
  }, []);

  // ── Preset / calendar handlers ───────────────────────────────────────────────

  const handlePreset = useCallback((value: string) => {
    setHoveredPreset(null);
    if (value === "custom") {
      onPeriod("custom");
      return;
    }
    onPeriod(value);
    setOpen(false);
  }, [onPeriod]);

  const handleCalendarSelect = useCallback((r: DateRange | undefined) => {
    setDraft(r);
    if (period !== "custom") onPeriod("custom");
  }, [period, onPeriod]);

  const handleApply = useCallback(() => {
    if (!draft?.from || !draft?.to) return;
    onCustom({ from: toISO(draft.from), to: toISO(draft.to) });
    setOpen(false);
  }, [draft, onCustom]);

  const handleCancel = useCallback(() => {
    setDraft(
      customFrom
        ? {
            from: new Date(customFrom + "T00:00:00"),
            to:   customTo ? new Date(customTo + "T00:00:00") : undefined,
          }
        : undefined,
    );
    setOpen(false);
  }, [customFrom, customTo]);

  const isCustomActive = isCustom && !!customFrom && !!customTo;

  return (
    <Popover open={open} onOpenChange={setOpen}>

      {/* ── Trigger ─────────────────────────────────────────────────────────── */}
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9 gap-2 text-sm font-medium px-3 transition-all",
            isCustomActive
              ? "border-primary/50 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary/70"
              : "hover:border-border/80",
            className,
          )}
        >
          <CalendarDays className={cn(
            "h-3.5 w-3.5 shrink-0",
            isCustomActive ? "text-primary" : "text-muted-foreground",
          )} />
          <span className="max-w-[200px] truncate">
            {fmtTrigger(period, customFrom, customTo)}
          </span>
          <ChevronDown className={cn(
            "h-3.5 w-3.5 shrink-0 opacity-50 transition-transform duration-200",
            open && "rotate-180",
          )} />
        </Button>
      </PopoverTrigger>

      {/* ── Panel ───────────────────────────────────────────────────────────── */}
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-auto p-0 shadow-xl border-border/60 overflow-hidden"
      >
        <div className="flex">

          {/* ── Left: presets ────────────────────────────────────────────────── */}
          <div className="w-44 shrink-0 border-r border-border/60 bg-muted/30 py-2 flex flex-col">
            <p className="px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Quick select
            </p>

            <div className="flex flex-col gap-0.5 px-1.5">
              {PERIOD_OPTIONS.map(({ value, label }) => {
                const isActive    = activePreset === value;
                const isCommitted = period === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onMouseEnter={() => setHoveredPreset(value)}
                    onMouseLeave={() => setHoveredPreset(null)}
                    onClick={() => handlePreset(value)}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm transition-all text-left",
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-foreground hover:bg-muted/60",
                    )}
                  >
                    <span>{label}</span>
                    {isCommitted && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Applied range summary */}
            {isCustomActive && (
              <>
                <Separator className="my-2 mx-3" />
                <div className="px-3 space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    Applied range
                  </p>
                  <div className="flex flex-col gap-0.5 text-xs">
                    <span className="font-medium text-foreground">{fmtShort(customFrom!)}</span>
                    <span className="text-muted-foreground/60 text-[10px] leading-none">to</span>
                    <span className="font-medium text-foreground">{fmtShort(customTo!)}</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Right: year nav + calendar + footer ──────────────────────────── */}
          <div className="flex flex-col">

            {/* Year strip */}
            <YearStrip
              viewYear={viewYear}
              onYear={jumpToYear}
              onPrevYear={prevYear}
              onNextYear={nextYear}
            />

            {/* Calendar */}
            <div className="px-1 pt-1">
              <Calendar
                mode="range"
                selected={draft}
                onSelect={handleCalendarSelect}
                month={viewMonth}
                onMonthChange={setViewMonth}
                numberOfMonths={2}
                disabled={{ after: new Date() }}
                classNames={{
                  months:   "flex gap-4 p-2",
                  month:    "flex flex-col gap-3",
                  caption:  "flex justify-center items-center relative h-7",
                  caption_label: "text-sm font-semibold text-foreground",
                  button_previous: cn(
                    "absolute left-0 h-7 w-7 rounded-md border border-border/60 bg-background",
                    "flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity",
                  ),
                  button_next: cn(
                    "absolute right-0 h-7 w-7 rounded-md border border-border/60 bg-background",
                    "flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity",
                  ),
                  month_grid: "w-full border-collapse",
                  weekdays:   "flex mb-1",
                  weekday:    "text-muted-foreground/50 w-8 text-center text-[11px] font-medium",
                  week:       "flex w-full",
                  day: cn(
                    "relative p-0 text-center text-sm focus-within:z-20",
                    "[&:has([aria-selected])]:bg-primary/8",
                    "first:[&:has([aria-selected])]:rounded-l-full",
                    "last:[&:has([aria-selected])]:rounded-r-full",
                    "[&:has([aria-selected].day-range-end)]:rounded-r-full",
                    "[&:has([aria-selected].day-range-start)]:rounded-l-full",
                  ),
                  day_button: cn(
                    "h-8 w-8 rounded-full p-0 font-normal text-sm",
                    "hover:bg-muted transition-colors",
                    "aria-selected:opacity-100",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  ),
                  range_start:  "day-range-start [&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary/90 [&>button]:font-semibold",
                  range_end:    "day-range-end   [&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary/90 [&>button]:font-semibold",
                  range_middle: "aria-selected:bg-primary/10 aria-selected:text-foreground [&>button]:rounded-none",
                  selected:  "",
                  today:     "[&>button]:border [&>button]:border-primary/40 [&>button]:font-semibold",
                  outside:   "opacity-25",
                  disabled:  "opacity-25 cursor-not-allowed",
                  hidden:    "invisible",
                }}
              />
            </div>

            {/* Footer */}
            <div className="border-t border-border/60 bg-muted/20 px-4 py-2.5 flex items-center justify-between gap-6">
              {/* Live range preview */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
                {draft?.from ? (
                  <>
                    <span className="font-medium text-foreground tabular-nums">
                      {fmtShort(toISO(draft.from))}
                    </span>
                    <ArrowRight className="h-3 w-3 shrink-0 opacity-50" />
                    {draft.to
                      ? <span className="font-medium text-foreground tabular-nums">{fmtShort(toISO(draft.to))}</span>
                      : <span className="italic opacity-60">pick end date…</span>
                    }
                  </>
                ) : (
                  <span className="italic opacity-60">Click a start date</span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-3 text-xs text-muted-foreground hover:text-foreground"
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 px-3 text-xs"
                  disabled={!hasFullDraft}
                  onClick={handleApply}
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>

        </div>
      </PopoverContent>
    </Popover>
  );
}
