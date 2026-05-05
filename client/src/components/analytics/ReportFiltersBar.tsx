/**
 * ReportFiltersBar — canvas-level filter row for the report builder.
 *
 * Sits below the toolbar and offers multi-select filters that scope every
 * widget on the canvas (a widget can still override at the per-widget
 * level via WidgetConfigPanel.filters; canvas filters are the default).
 *
 * Each pill represents one filter dimension. Clicking opens a popover
 * with multi-select checkboxes. The pill turns primary-tinted when active
 * and shows the selected count (e.g. "Team · 2"). An X button on each
 * active pill clears it without opening the popover.
 *
 * Empty filter sets are not persisted — the bar only emits `conditions`
 * for dimensions where the user has actually selected at least one value.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Filter, ChevronDown, X, Check, Search,
  CircleDot, Flame, Tag, Ticket as TicketIcon, Users, Building2, Inbox,
} from "lucide-react";
import { ticketStatuses, statusLabel } from "core/constants/ticket-status.ts";
import { ticketPriorities, priorityLabel } from "core/constants/ticket-priority.ts";
import { ticketCategories, categoryLabel } from "core/constants/ticket-category.ts";
import { ticketTypes, ticketTypeLabel } from "core/constants/ticket-type.ts";
import type { FilterSet, FilterCondition } from "core/schemas/analytics.ts";
import { cn } from "@/lib/utils";
import { useState } from "react";

// ── Filter dimension definitions ─────────────────────────────────────────────
//
// Each dimension declares its server-side field key + display metadata. The
// `kind` distinguishes static enum lists (compiled from constants) from
// dynamic remote lookups (fetched from /api at first popover open).

type Dimension =
  | { id: "status";         field: "status";         label: "Status";          icon: React.ElementType; kind: "static"; options: { value: string; label: string }[] }
  | { id: "priority";       field: "priority";       label: "Priority";        icon: React.ElementType; kind: "static"; options: { value: string; label: string }[] }
  | { id: "category";       field: "category";       label: "Category";        icon: React.ElementType; kind: "static"; options: { value: string; label: string }[] }
  | { id: "ticketType";     field: "ticketType";     label: "Type";            icon: React.ElementType; kind: "static"; options: { value: string; label: string }[] }
  | { id: "team";           field: "teamId";         label: "Team";            icon: React.ElementType; kind: "team" }
  | { id: "organization";   field: "organizationId"; label: "Organisation";    icon: React.ElementType; kind: "organization" }
  | { id: "source";         field: "source";         label: "Channel";         icon: React.ElementType; kind: "static"; options: { value: string; label: string }[] };

const DIMENSIONS: Dimension[] = [
  {
    id: "status", field: "status", label: "Status", icon: CircleDot, kind: "static",
    options: ticketStatuses
      .filter((s) => s !== "new" && s !== "processing")
      .map((s) => ({ value: s, label: statusLabel[s] })),
  },
  {
    id: "priority", field: "priority", label: "Priority", icon: Flame, kind: "static",
    options: ticketPriorities.map((p) => ({ value: p, label: priorityLabel[p] })),
  },
  {
    id: "category", field: "category", label: "Category", icon: Tag, kind: "static",
    options: ticketCategories.map((c) => ({ value: c, label: categoryLabel[c] })),
  },
  {
    id: "ticketType", field: "ticketType", label: "Type", icon: TicketIcon, kind: "static",
    options: ticketTypes.map((t) => ({ value: t, label: ticketTypeLabel[t] })),
  },
  { id: "team", field: "teamId", label: "Team", icon: Users, kind: "team" },
  { id: "organization", field: "organizationId", label: "Organisation", icon: Building2, kind: "organization" },
  {
    id: "source", field: "source", label: "Channel", icon: Inbox, kind: "static",
    options: [
      { value: "email",  label: "Email" },
      { value: "portal", label: "Portal" },
      { value: "agent",  label: "Agent (manual)" },
      { value: "api",    label: "API" },
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Pull the array of selected values for a given field from the filter set,
 *  or an empty array if the dimension isn't currently filtered. */
function getSelected(filters: FilterSet | undefined, field: string): (string | number)[] {
  if (!filters) return [];
  const cond = filters.conditions.find((c) => c.field === field);
  if (!cond) return [];
  if (Array.isArray(cond.value)) return cond.value as (string | number)[];
  if (cond.value != null) return [cond.value as string | number];
  return [];
}

/** Replace (or remove) the condition for a field. Conditions with empty
 *  selections are dropped so the saved filter set stays minimal. */
function setSelected(
  filters: FilterSet | undefined,
  field: string,
  values: (string | number)[],
): FilterSet | undefined {
  const others = (filters?.conditions ?? []).filter((c) => c.field !== field);
  const next: FilterCondition[] = [...(others as FilterCondition[])];
  if (values.length > 0) {
    next.push({ field, op: "in", value: values });
  }
  if (next.length === 0) return undefined;
  return { logic: "and", conditions: next };
}

// ── Popover content per dimension type ───────────────────────────────────────

function StaticOptionList({
  options,
  selected,
  onToggle,
}: {
  options: { value: string; label: string }[];
  selected: (string | number)[];
  onToggle: (value: string | number) => void;
}) {
  const selectedSet = new Set(selected.map(String));
  return (
    <div className="max-h-64 overflow-y-auto -mx-1 px-1">
      {options.map((o) => {
        const active = selectedSet.has(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left transition-colors",
              active ? "bg-primary/10 text-primary" : "hover:bg-muted/60 text-foreground/85",
            )}
          >
            <span className={cn(
              "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0",
              active ? "bg-primary border-primary" : "border-muted-foreground/40",
            )}>
              {active && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
            </span>
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function RemoteOptionList<T extends { id: number; name: string; color?: string | null }>({
  endpoint,
  queryKey,
  responseKey,
  selected,
  onToggle,
  emptyText = "No options",
  showColorDot = false,
}: {
  endpoint: string;
  queryKey: string[];
  responseKey: string;
  selected: (string | number)[];
  onToggle: (value: number) => void;
  emptyText?: string;
  showColorDot?: boolean;
}) {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data } = await axios.get<Record<string, T[]>>(endpoint);
      return (data[responseKey] ?? []) as T[];
    },
    staleTime: 60_000,
  });
  const items = (data ?? []).filter((it) =>
    !search || it.name.toLowerCase().includes(search.toLowerCase()),
  );
  const selectedSet = new Set(selected.map(Number));
  return (
    <>
      <div className="relative mb-1">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="h-7 pl-7 text-xs"
          autoFocus
        />
      </div>
      <div className="max-h-56 overflow-y-auto -mx-1 px-1">
        {isLoading && (
          <p className="text-[11px] text-muted-foreground py-2 text-center">Loading…</p>
        )}
        {!isLoading && items.length === 0 && (
          <p className="text-[11px] text-muted-foreground py-2 text-center">{emptyText}</p>
        )}
        {items.map((it) => {
          const active = selectedSet.has(it.id);
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onToggle(it.id)}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left transition-colors",
                active ? "bg-primary/10 text-primary" : "hover:bg-muted/60 text-foreground/85",
              )}
            >
              <span className={cn(
                "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0",
                active ? "bg-primary border-primary" : "border-muted-foreground/40",
              )}>
                {active && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
              </span>
              {showColorDot && (
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: it.color ?? "#94a3b8" }} />
              )}
              <span className="truncate">{it.name}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ── Filter pill ──────────────────────────────────────────────────────────────

interface PillProps {
  dim: Dimension;
  selected: (string | number)[];
  onChange: (values: (string | number)[]) => void;
}

function FilterPill({ dim, selected, onChange }: PillProps) {
  const Icon = dim.icon;
  const count = selected.length;
  const active = count > 0;
  const [open, setOpen] = useState(false);

  // Build the active pill label — a label-mapped first value when N=1, else
  // a "N selected" summary so long enum lists don't blow out the toolbar.
  const summary = (() => {
    if (count === 0) return "All";
    if (dim.kind === "static" && count === 1) {
      const opt = dim.options.find((o) => String(o.value) === String(selected[0]));
      if (opt) return opt.label;
    }
    return `${count} selected`;
  })();

  function toggle(value: string | number) {
    const set = new Set(selected.map(String));
    if (set.has(String(value))) set.delete(String(value));
    else set.add(String(value));
    // Preserve numeric vs string typing: dimensions with numeric ids
    // need numbers persisted, otherwise the server's `in` check won't
    // match Prisma's typed fields.
    const isNumeric = dim.kind === "team" || dim.kind === "organization";
    onChange(Array.from(set).map((v) => isNumeric ? Number(v) : v));
  }

  function clear(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onChange([]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group inline-flex items-center gap-1.5 rounded-full border px-2.5 h-7 text-[11px] font-medium transition-all",
            active
              ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
              : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/20",
          )}
        >
          <Icon className="h-3 w-3 shrink-0" />
          <span>{dim.label}</span>
          <span className={cn(
            "px-1 rounded text-[10px] font-semibold tabular-nums",
            active ? "bg-primary/20 text-primary" : "text-muted-foreground/70",
          )}>
            {summary}
          </span>
          {active ? (
            <span
              role="button"
              onClick={clear}
              title={`Clear ${dim.label} filter`}
              className="rounded p-0.5 hover:bg-primary/25"
            >
              <X className="h-2.5 w-2.5" />
            </span>
          ) : (
            <ChevronDown className="h-3 w-3 opacity-50" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-60 p-2">
        <div className="flex items-center justify-between gap-2 px-1 pb-1.5 border-b mb-1.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Filter by {dim.label}
          </p>
          {active && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[10px] text-primary hover:underline"
            >
              Clear
            </button>
          )}
        </div>
        {dim.kind === "static" && (
          <StaticOptionList options={dim.options} selected={selected} onToggle={toggle} />
        )}
        {dim.kind === "team" && (
          <RemoteOptionList
            endpoint="/api/teams"
            queryKey={["teams"]}
            responseKey="teams"
            selected={selected}
            onToggle={toggle}
            emptyText="No teams"
            showColorDot
          />
        )}
        {dim.kind === "organization" && (
          <RemoteOptionList
            endpoint="/api/organizations"
            queryKey={["organizations-light"]}
            responseKey="organizations"
            selected={selected}
            onToggle={toggle}
            emptyText="No organisations"
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Main bar ─────────────────────────────────────────────────────────────────

export interface ReportFiltersBarProps {
  filters: FilterSet | undefined;
  onChange: (filters: FilterSet | undefined) => void;
  /** When true, renders pills as buttons; when false, displays read-only summaries. */
  editable: boolean;
}

export function ReportFiltersBar({ filters, onChange, editable }: ReportFiltersBarProps) {
  const activeCount = useMemo(
    () => DIMENSIONS.filter((d) => getSelected(filters, d.field).length > 0).length,
    [filters],
  );

  // View-mode summary — render only the active pills as small read-only
  // chips so users can see the report's filter scope without entering edit.
  if (!editable) {
    if (activeCount === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-border/40 bg-muted/20">
        <Filter className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mr-1">
          Filters
        </span>
        {DIMENSIONS.map((dim) => {
          const selected = getSelected(filters, dim.field);
          if (selected.length === 0) return null;
          const Icon = dim.icon;
          const summary = dim.kind === "static" && selected.length === 1
            ? dim.options.find((o) => String(o.value) === String(selected[0]))?.label ?? `${selected.length} selected`
            : `${selected.length} selected`;
          return (
            <span
              key={dim.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-background border px-2 h-6 text-[10px] font-medium text-foreground"
            >
              <Icon className="h-2.5 w-2.5 text-muted-foreground" />
              <span className="text-muted-foreground">{dim.label}:</span>
              <span>{summary}</span>
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-border/40 bg-muted/10">
      <div className="inline-flex items-center gap-1.5 mr-1">
        <Filter className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Filters
        </span>
        {activeCount > 0 && (
          <span className="text-[10px] font-semibold tabular-nums text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
            {activeCount}
          </span>
        )}
      </div>
      {DIMENSIONS.map((dim) => (
        <FilterPill
          key={dim.id}
          dim={dim}
          selected={getSelected(filters, dim.field)}
          onChange={(values) => onChange(setSelected(filters, dim.field, values))}
        />
      ))}
      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive transition-colors"
        >
          <X className="h-3 w-3" />
          Clear all
        </button>
      )}
    </div>
  );
}
