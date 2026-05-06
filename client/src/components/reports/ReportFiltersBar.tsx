/**
 * ReportFiltersBar — per-section dimensional filter strip for the analytics
 * reports surface. Filter values live in URL search params so they survive
 * reload, deep-link, and are picked up by the existing Export / Share / PDF
 * pipelines (which already forward URL filters to the server).
 *
 * Architecture
 * ────────────
 *   • Each section declares which filter IDs it supports via SECTION_FILTERS.
 *   • A filter ID maps to a definition (label, kind, options, URL param key).
 *   • Static option lists come from `core/constants/*` (single source of truth).
 *   • Dynamic option lists (teams, agents, organizations, catalog items) come
 *     from existing `/api/*` endpoints with React Query and a long staleTime.
 *
 * Stage scope
 * ───────────
 * Stage 1 (this file): UI + URL state. Filters flow through Export/Share which
 * already understand `priority|category|teamId|assigneeId|status`. Section-
 * specific filters not yet honored by the server are tagged `notYetWired` so
 * the UI shows them as preview-only — Stage 2 lifts that flag once the
 * backend supports them.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  Filter, X, ChevronDown, Check, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { ticketPriorities,  priorityLabel  } from "core/constants/ticket-priority.ts";
import { ticketCategories,  categoryLabel  } from "core/constants/ticket-category.ts";
import { agentTicketStatuses, statusLabel  } from "core/constants/ticket-status.ts";
import { ticketTypes,       ticketTypeLabel } from "core/constants/ticket-type.ts";
import { INTAKE_CHANNELS,   CHANNEL_LABEL  } from "core/constants/channel.ts";
import { incidentStatuses,  incidentStatusLabel } from "core/constants/incident-status.ts";
import { incidentPriorities,incidentPriorityLabel } from "core/constants/incident-priority.ts";
import { requestStatuses,   requestStatusLabel } from "core/constants/request-status.ts";
import { problemStatuses,   problemStatusLabel } from "core/constants/problem-status.ts";
import {
  changeTypes,    changeTypeLabel,
  changeRisks,    changeRiskLabel,
  changeStates,   changeStateLabel,
} from "core/constants/change.ts";
import {
  approvalStatuses,        approvalSubjectTypes,
  approvalSubjectTypeLabel,
} from "core/constants/approval.ts";
import {
  ASSET_TYPES, ASSET_STATUSES, ASSET_TYPE_LABEL, ASSET_STATUS_LABEL,
} from "core/constants/assets.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

type FilterKind = "select" | "lookup" | "toggle";

interface FilterOption { value: string; label: string; }

interface BaseFilterDef {
  id:          string;
  param:       string;     // URL search-param key
  label:       string;
  kind:        FilterKind;
  /** True if Stage 2 hasn't wired this server-side yet — UI labels it as "preview". */
  notYetWired?: boolean;
}

interface SelectFilterDef extends BaseFilterDef {
  kind: "select";
  options: FilterOption[];
}

interface LookupFilterDef extends BaseFilterDef {
  kind: "lookup";
  /** Fetcher must return options, with a stable cache key. */
  useOptions: () => { options: FilterOption[]; loading: boolean };
}

interface ToggleFilterDef extends BaseFilterDef {
  kind: "toggle";
  /** Value written to the URL when active. Absence = inactive. */
  activeValue: string;
}

type FilterDef = SelectFilterDef | LookupFilterDef | ToggleFilterDef;

// ── Lookup hooks (dynamic option sources) ────────────────────────────────────

function useTeamOptions() {
  const { data, isLoading } = useQuery({
    queryKey: ["report-filter", "teams"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await axios.get<{ teams: { id: number; name: string }[] }>("/api/teams");
      return data.teams;
    },
  });
  return {
    options: (data ?? []).map(t => ({ value: String(t.id), label: t.name })),
    loading: isLoading,
  };
}

function useAgentOptions() {
  const { data, isLoading } = useQuery({
    queryKey: ["report-filter", "agents"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await axios.get<{ agents: { id: string; name: string }[] }>("/api/agents");
      return data.agents;
    },
  });
  return {
    options: (data ?? []).map(a => ({ value: a.id, label: a.name })),
    loading: isLoading,
  };
}

function useOrganizationOptions() {
  const { data, isLoading } = useQuery({
    queryKey: ["report-filter", "organizations"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await axios.get<{
        organizations: { id: number; name: string }[];
      }>("/api/organizations?limit=200");
      return data.organizations;
    },
  });
  return {
    options: (data ?? []).map(o => ({ value: String(o.id), label: o.name })),
    loading: isLoading,
  };
}

function useCatalogItemOptions() {
  const { data, isLoading } = useQuery({
    queryKey: ["report-filter", "catalog-items"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await axios.get<{
        items: { id: number; name: string }[];
      }>("/api/catalog");
      return data.items;
    },
  });
  return {
    options: (data ?? []).map(i => ({ value: String(i.id), label: i.name })),
    loading: isLoading,
  };
}

/**
 * Merge system-default ticket statuses with admin-added custom statuses
 * (TicketStatusConfig). Custom rows are encoded as `custom_<id>` so a single
 * filter param carries either kind. Disabled (isActive=false) custom rows
 * are filtered out so the dropdown reflects current admin configuration.
 */
function useTicketStatusOptions() {
  const { data, isLoading } = useQuery({
    queryKey: ["report-filter", "ticket-status-configs"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await axios.get<{
        configs: { id: number; label: string; isActive: boolean }[];
      }>("/api/ticket-status-configs");
      return data.configs;
    },
  });
  const systemOptions: FilterOption[] = agentTicketStatuses.map(s => ({
    value: s, label: statusLabel[s],
  }));
  const customOptions: FilterOption[] = (data ?? [])
    .filter(c => c.isActive)
    .map(c => ({ value: `custom_${c.id}`, label: c.label }));
  return {
    options: [...systemOptions, ...customOptions],
    loading: isLoading,
  };
}

/**
 * Merge system-default ticket types with admin-added TicketTypeConfig rows.
 * Same `custom_<id>` encoding as status; disabled rows are dropped.
 */
function useTicketTypeOptions() {
  const { data, isLoading } = useQuery({
    queryKey: ["report-filter", "ticket-types"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await axios.get<{
        ticketTypes: { id: number; name: string; isActive: boolean }[];
      }>("/api/ticket-types");
      return data.ticketTypes;
    },
  });
  const systemOptions: FilterOption[] = ticketTypes.map(t => ({
    value: t, label: ticketTypeLabel[t],
  }));
  const customOptions: FilterOption[] = (data ?? [])
    .filter(c => c.isActive)
    .map(c => ({ value: `custom_${c.id}`, label: c.name }));
  return {
    options: [...systemOptions, ...customOptions],
    loading: isLoading,
  };
}

// ── Filter definitions ───────────────────────────────────────────────────────
//
// Definitions co-locate label, URL key, kind, and options.
// `notYetWired` flags filters whose values do not (yet) reshape the displayed
// data — Stage 2 will remove the flag as endpoints learn each filter.

const FILTERS: Record<string, FilterDef> = {
  // ── Generic ticket-domain filters (already wired for Export/Share) ──────
  priority:   { id: "priority",   param: "priority",   label: "Priority",   kind: "select",
                options: ticketPriorities.map(p => ({ value: p, label: priorityLabel[p] })) },
  category:   { id: "category",   param: "category",   label: "Category",   kind: "select",
                options: ticketCategories.map(c => ({ value: c, label: categoryLabel[c] })) },
  // Status & ticket type pull both system enums + admin-configured custom rows
  // (TicketStatusConfig / TicketTypeConfig). Custom rows are encoded as
  // `custom_<id>`; the server reads either form on the same URL param.
  status:     { id: "status",     param: "status",     label: "Status",     kind: "lookup",
                useOptions: useTicketStatusOptions },
  ticketType: { id: "ticketType", param: "ticketType", label: "Ticket Type", kind: "lookup",
                useOptions: useTicketTypeOptions },
  source:     { id: "source",     param: "source",     label: "Source / Channel", kind: "select",
                options: INTAKE_CHANNELS.map(c => ({ value: c, label: CHANNEL_LABEL[c] })) },
  teamId:     { id: "teamId",     param: "teamId",     label: "Team",       kind: "lookup",
                useOptions: useTeamOptions },
  assigneeId: { id: "assigneeId", param: "assigneeId", label: "Assignee",   kind: "lookup",
                useOptions: useAgentOptions },
  organizationId: { id: "organizationId", param: "organizationId", label: "Organization", kind: "lookup",
                useOptions: useOrganizationOptions },

  // ── Incident-specific ───────────────────────────────────────────────────
  incidentPriority: { id: "incidentPriority", param: "incidentPriority", label: "Priority", kind: "select",
                options: incidentPriorities.map(p => ({ value: p, label: incidentPriorityLabel[p] })) },
  incidentStatus:   { id: "incidentStatus",   param: "incidentStatus",   label: "Status",   kind: "select",
                options: incidentStatuses.map(s => ({ value: s, label: incidentStatusLabel[s] })) },
  isMajor:          { id: "isMajor", param: "isMajor", label: "Major incidents only", kind: "toggle",
                activeValue: "true" },

  // ── Request-specific ────────────────────────────────────────────────────
  requestStatus:  { id: "requestStatus", param: "requestStatus", label: "Status", kind: "select",
                options: requestStatuses.map(s => ({ value: s, label: requestStatusLabel[s] })) },
  catalogItemId:  { id: "catalogItemId", param: "catalogItemId", label: "Catalog Item", kind: "lookup",
                notYetWired: true,
                useOptions: useCatalogItemOptions },

  // ── Problem-specific ────────────────────────────────────────────────────
  problemStatus: { id: "problemStatus", param: "problemStatus", label: "Status", kind: "select",
                options: problemStatuses.map(s => ({ value: s, label: problemStatusLabel[s] })) },
  isKnownError: { id: "isKnownError", param: "isKnownError", label: "Known errors only", kind: "toggle",
                activeValue: "true" },

  // ── Change-specific ─────────────────────────────────────────────────────
  changeType:  { id: "changeType",  param: "changeType",  label: "Change Type", kind: "select",
                options: changeTypes.map(t => ({ value: t, label: changeTypeLabel[t] })) },
  changeRisk:  { id: "changeRisk",  param: "changeRisk",  label: "Risk",        kind: "select",
                options: changeRisks.map(r => ({ value: r, label: changeRiskLabel[r] })) },
  changeState: { id: "changeState", param: "changeState", label: "State",       kind: "select",
                options: changeStates.map(s => ({ value: s, label: changeStateLabel[s] })) },

  // ── Approval-specific ───────────────────────────────────────────────────
  approvalStatus: { id: "approvalStatus", param: "approvalStatus", label: "Status", kind: "select",
                options: approvalStatuses.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })) },
  subjectType:    { id: "subjectType",    param: "subjectType",    label: "Subject Type", kind: "select",
                options: approvalSubjectTypes.map(s => ({ value: s, label: approvalSubjectTypeLabel[s] })) },

  // ── CSAT ────────────────────────────────────────────────────────────────
  csatRating: { id: "csatRating", param: "csatRating", label: "Rating", kind: "select",
                options: [5,4,3,2,1].map(n => ({ value: String(n), label: `${n} star${n === 1 ? "" : "s"}` })) },

  // ── Asset-specific ──────────────────────────────────────────────────────
  assetType:   { id: "assetType",   param: "assetType",   label: "Asset Type", kind: "select",
                notYetWired: true,
                options: ASSET_TYPES.map(t => ({ value: t, label: ASSET_TYPE_LABEL[t] })) },
  assetStatus: { id: "assetStatus", param: "assetStatus", label: "Asset Status", kind: "select",
                notYetWired: true,
                options: ASSET_STATUSES.map(s => ({ value: s, label: ASSET_STATUS_LABEL[s] })) },
};

// ── Per-section filter sets ──────────────────────────────────────────────────
//
// Order here = display order in the bar.

export const SECTION_FILTERS: Record<string, string[]> = {
  overview:  ["priority", "category", "status", "ticketType", "source", "teamId", "assigneeId", "organizationId"],
  tickets:   ["priority", "category", "status", "ticketType", "source", "teamId", "assigneeId", "organizationId"],
  sla:       ["priority", "category", "ticketType", "teamId", "assigneeId"],
  agents:    ["priority", "category", "teamId"],
  teams:     ["priority", "category"],
  incidents: ["incidentPriority", "incidentStatus", "isMajor", "teamId", "assigneeId"],
  requests:  ["requestStatus", "priority", "catalogItemId", "teamId", "assigneeId"],
  problems:  ["problemStatus", "priority", "isKnownError", "assigneeId"],
  changes:   ["changeType", "changeRisk", "changeState", "assigneeId"],
  approvals: ["approvalStatus", "subjectType"],
  csat:      ["csatRating", "teamId", "assigneeId"],
  kb:        [],
  realtime:  ["priority", "teamId", "assigneeId"],
  assets:    ["assetType", "assetStatus", "assigneeId"],
  insights:  ["priority", "teamId"],
  library:   [],
};

// ── Component ────────────────────────────────────────────────────────────────

export interface ReportFiltersBarProps {
  section: string;
}

export default function ReportFiltersBar({ section }: ReportFiltersBarProps) {
  const filterIds = SECTION_FILTERS[section] ?? [];
  const [searchParams, setSearchParams] = useSearchParams();

  // Active values pulled from URL
  const activeValues = useMemo(() => {
    const out: Record<string, string> = {};
    for (const id of filterIds) {
      const def = FILTERS[id];
      if (!def) continue;
      const v = searchParams.get(def.param);
      if (v) out[id] = v;
    }
    return out;
  }, [filterIds, searchParams]);

  const activeCount = Object.keys(activeValues).length;

  function setFilter(id: string, value: string | null) {
    const def = FILTERS[id];
    if (!def) return;
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      if (value == null || value === "") p.delete(def.param);
      else                                p.set(def.param, value);
      return p;
    });
  }

  function clearAll() {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      for (const id of filterIds) {
        const def = FILTERS[id];
        if (def) p.delete(def.param);
      }
      return p;
    });
  }

  if (filterIds.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-t bg-muted/20" data-no-print>
      <div className="flex items-center gap-1.5 mr-1 text-xs font-medium text-muted-foreground">
        <Filter className="h-3.5 w-3.5" />
        Filters
      </div>

      {filterIds.map(id => {
        const def = FILTERS[id];
        if (!def) return null;
        const value = activeValues[id];
        return (
          <FilterControl
            key={id}
            def={def}
            value={value}
            onChange={(next) => setFilter(id, next)}
          />
        );
      })}

      {activeCount > 0 && (
        <>
          <Separator orientation="vertical" className="h-5 mx-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={clearAll}
          >
            <X className="h-3 w-3 mr-1" />
            Clear all ({activeCount})
          </Button>
        </>
      )}
    </div>
  );
}

// ── Per-filter control ───────────────────────────────────────────────────────

interface FilterControlProps {
  def: FilterDef;
  value: string | undefined;
  onChange: (next: string | null) => void;
}

function FilterControl({ def, value, onChange }: FilterControlProps) {
  if (def.kind === "toggle") return <ToggleFilter def={def} value={value} onChange={onChange} />;
  if (def.kind === "select") return <SelectFilter def={def} value={value} onChange={onChange} />;
  return <LookupFilter def={def} value={value} onChange={onChange} />;
}

function ToggleFilter({ def, value, onChange }: { def: ToggleFilterDef; value: string | undefined; onChange: (v: string | null) => void }) {
  const active = value === def.activeValue;
  return (
    <Button
      variant={active ? "default" : "outline"}
      size="sm"
      className="h-8 px-2.5 text-xs gap-1.5"
      onClick={() => onChange(active ? null : def.activeValue)}
    >
      {active && <Check className="h-3 w-3" />}
      {def.label}
    </Button>
  );
}

function SelectFilter({ def, value, onChange }: { def: SelectFilterDef; value: string | undefined; onChange: (v: string | null) => void }) {
  return (
    <FilterPopover
      label={def.label}
      value={value}
      valueLabel={def.options.find(o => o.value === value)?.label}
      notYetWired={def.notYetWired}
      onClear={() => onChange(null)}
    >
      <ScrollableOptions
        options={def.options}
        selected={value}
        onSelect={onChange}
      />
    </FilterPopover>
  );
}

function LookupFilter({ def, value, onChange }: { def: LookupFilterDef; value: string | undefined; onChange: (v: string | null) => void }) {
  const { options, loading } = def.useOptions();
  return (
    <FilterPopover
      label={def.label}
      value={value}
      valueLabel={options.find(o => o.value === value)?.label}
      notYetWired={def.notYetWired}
      onClear={() => onChange(null)}
    >
      {loading ? (
        <div className="px-3 py-6 text-xs text-muted-foreground text-center">Loading…</div>
      ) : options.length === 0 ? (
        <div className="px-3 py-6 text-xs text-muted-foreground text-center">No options available</div>
      ) : (
        <ScrollableOptions
          options={options}
          selected={value}
          onSelect={onChange}
          searchable={options.length > 8}
        />
      )}
    </FilterPopover>
  );
}

// ── Shared popover wrapper ────────────────────────────────────────────────────

interface FilterPopoverProps {
  label:        string;
  value:        string | undefined;
  valueLabel:   string | undefined;
  notYetWired?: boolean;
  onClear:      () => void;
  children:     React.ReactNode;
}

function FilterPopover({ label, value, valueLabel, notYetWired, onClear, children }: FilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const hasValue = !!value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 px-2.5 text-xs gap-1.5 max-w-[220px]",
            hasValue && "border-primary/40 bg-primary/5",
          )}
        >
          <span className="text-muted-foreground">{label}</span>
          {hasValue && (
            <>
              <span className="text-foreground/40">·</span>
              <span className="truncate font-medium">{valueLabel ?? value}</span>
              <span
                role="button"
                tabIndex={0}
                aria-label={`Clear ${label}`}
                className="-mr-1 p-0.5 rounded hover:bg-muted-foreground/15 inline-flex"
                onClick={(e) => { e.stopPropagation(); onClear(); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onClear(); } }}
              >
                <X className="h-3 w-3" />
              </span>
            </>
          )}
          {!hasValue && <ChevronDown className="h-3 w-3 opacity-60" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0" sideOffset={6}>
        <div className="px-3 py-2 border-b flex items-center justify-between">
          <span className="text-xs font-semibold">{label}</span>
          {notYetWired && (
            <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-medium">
              Preview
            </Badge>
          )}
        </div>
        {children}
      </PopoverContent>
    </Popover>
  );
}

// ── Shared options renderer ──────────────────────────────────────────────────

interface ScrollableOptionsProps {
  options:    FilterOption[];
  selected:   string | undefined;
  onSelect:   (value: string | null) => void;
  searchable?: boolean;
}

function ScrollableOptions({ options, selected, onSelect, searchable = false }: ScrollableOptionsProps) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [query, options]);

  return (
    <>
      {searchable && (
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="h-7 pl-7 text-xs"
            />
          </div>
        </div>
      )}
      <div className="max-h-64 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">No matches</div>
        ) : (
          filtered.map(opt => {
            const isActive = selected === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-left",
                  "hover:bg-muted/60 transition-colors",
                  isActive && "bg-muted/40 font-medium",
                )}
                onClick={() => onSelect(isActive ? null : opt.value)}
              >
                <span className="truncate">{opt.label}</span>
                {isActive && <Check className="h-3 w-3 shrink-0 text-primary" />}
              </button>
            );
          })
        )}
      </div>
    </>
  );
}
