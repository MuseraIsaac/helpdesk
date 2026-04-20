/**
 * DateRangePicker — combines a period preset Select with a custom date range
 * popover. When "Custom range" is selected the calendar popover appears.
 *
 * Props:
 *   period      – active preset ("7", "30", "90", "this_month", "last_month", "custom")
 *   customFrom  – ISO date string for custom start (YYYY-MM-DD)
 *   customTo    – ISO date string for custom end   (YYYY-MM-DD)
 *   onPeriod    – called with the preset string when a preset is chosen
 *   onCustom    – called with {from, to} ISO strings when a custom range is picked
 */
import { useState } from "react";
import { type DateRange } from "react-day-picker";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// ── Shared period list (also exported so ReportsLayout can use it) ────────────

export const PERIOD_OPTIONS = [
  { value: "7",          label: "Last 7 days" },
  { value: "30",         label: "Last 30 days" },
  { value: "90",         label: "Last 90 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "custom",     label: "Custom range…" },
] as const;

export type PeriodPreset = (typeof PERIOD_OPTIONS)[number]["value"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

// ── Component ─────────────────────────────────────────────────────────────────

interface DateRangePickerProps {
  period: string;
  customFrom?: string;
  customTo?: string;
  onPeriod: (v: string) => void;
  onCustom: (range: { from: string; to: string }) => void;
  className?: string;
}

export default function DateRangePicker({
  period,
  customFrom,
  customTo,
  onPeriod,
  onCustom,
  className,
}: DateRangePickerProps) {
  const [calOpen, setCalOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>(
    customFrom
      ? {
          from: new Date(customFrom + "T00:00:00"),
          to:   customTo ? new Date(customTo + "T00:00:00") : undefined,
        }
      : undefined,
  );

  function handleSelect(r: DateRange | undefined) {
    setRange(r);
    if (r?.from && r?.to) {
      onCustom({ from: toISO(r.from), to: toISO(r.to) });
      setCalOpen(false);
    }
  }

  function handlePresetChange(v: string) {
    if (v === "custom") {
      setCalOpen(true);
      onPeriod("custom");
    } else {
      setCalOpen(false);
      onPeriod(v);
    }
  }

  const isCustomActive = period === "custom" && customFrom;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Select value={period} onValueChange={handlePresetChange}>
        <SelectTrigger className="w-40 h-9">
          <SelectValue>
            {isCustomActive
              ? `${fmtDate(customFrom!)}${customTo ? ` – ${fmtDate(customTo)}` : ""}`
              : PERIOD_OPTIONS.find(o => o.value === period)?.label ?? period}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {PERIOD_OPTIONS.map(o => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Inline calendar popover — only visible when custom is selected */}
      <Popover open={calOpen} onOpenChange={setCalOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-9 gap-1.5 text-xs",
              !isCustomActive && "hidden",
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {isCustomActive
              ? `${fmtDate(customFrom!)}${customTo ? ` – ${fmtDate(customTo)}` : " …"}`
              : "Pick dates"}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            selected={range}
            onSelect={handleSelect}
            numberOfMonths={2}
            disabled={{ after: new Date() }}
            defaultMonth={range?.from ?? new Date()}
          />
          <div className="border-t px-3 py-2 text-xs text-muted-foreground">
            {range?.from && !range.to
              ? "Select end date"
              : !range?.from
              ? "Select start date"
              : null}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
