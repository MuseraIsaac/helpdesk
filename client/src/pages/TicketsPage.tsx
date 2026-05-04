/**
 * TicketsPage
 *
 * Views strip at the top gives instant access to:
 *   • System views  — All Tickets + 4 Quick Views (SLA / escalation focused)
 *   • Custom views  — personal saved views with full filter/column/sort config
 *   • Shared views  — admin-created views visible to all agents
 *
 * The "+" button opens TicketViewBuilderDialog to create a new view.
 * Each personal view chip has a hover context-menu: Edit, Set default, Delete.
 */

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { type TicketStatus }   from "core/constants/ticket-status.ts";
import { type TicketType }     from "core/constants/ticket-type.ts";
import { type TicketCategory, categoryLabel } from "core/constants/ticket-category.ts";
import { type TicketPriority } from "core/constants/ticket-priority.ts";
import { type TicketSeverity } from "core/constants/ticket-severity.ts";
import { type TicketImpact }   from "core/constants/ticket-impact.ts";
import { type TicketUrgency }  from "core/constants/ticket-urgency.ts";
import { type TicketView }     from "core/schemas/tickets.ts";
import { SYSTEM_DEFAULT_VIEW_CONFIG } from "core/schemas/ticket-view.ts";
import { useTicketViews, type StoredView } from "@/hooks/useTicketViews";
import { Button }    from "@/components/ui/button";
import { Badge }     from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import TicketsTable          from "./TicketsTable";
import TicketsFilters        from "./TicketsFilters";
import TicketsFilterSidebar  from "@/components/TicketsFilterSidebar";
import BulkActionsBar        from "@/components/BulkActionsBar";
import TicketViewCustomizer  from "@/components/TicketViewCustomizer";
import TicketViewBuilderDialog from "@/components/TicketViewBuilderDialog";
import TicketViewsDropdown     from "@/components/TicketViewsDropdown";
import {
  AlertTriangle, Clock, ShieldAlert, UserX,
  X, Columns3, Plus, Users, Star,
  MoreHorizontal, Pencil, Trash2, Check,
  Zap, ChevronRight, LayoutList,
  Ticket as TicketIcon,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TicketFilters {
  status?:             TicketStatus | TicketStatus[];
  customStatusId?:     number | number[];
  ticketType?:         TicketType | TicketType[];
  customTicketTypeId?: number | number[];
  category?:           TicketCategory | TicketCategory[];
  priority?:           TicketPriority | TicketPriority[];
  severity?:           TicketSeverity | TicketSeverity[];
  impact?:             TicketImpact | TicketImpact[];
  urgency?:            TicketUrgency | TicketUrgency[];
  source?:             "email" | "portal" | "agent" | ("email" | "portal" | "agent")[];
  search?:             string;
  escalated?:          boolean;
  assignedToMe?:       boolean;
  unassigned?:         boolean;
  assignedToId?:       string | string[];
  slaBreached?:        boolean;
  view?:               TicketView;
  teamId?:             number | "none" | (number | "none")[];
}

interface QuickView {
  id:          TicketView | "escalated" | "all";
  label:       string;
  icon:        React.ReactNode;
  description: string;
  color?:      string;
}

const QUICK_VIEWS: QuickView[] = [
  { id: "escalated",         label: "Escalated",         icon: <AlertTriangle className="h-3.5 w-3.5" />, description: "Tickets that have been escalated",                     color: "text-red-600 dark:text-red-400"   },
  { id: "overdue",           label: "Overdue",            icon: <Clock         className="h-3.5 w-3.5" />, description: "Tickets past their SLA deadline",                     color: "text-red-600 dark:text-red-400"   },
  { id: "at_risk",           label: "At Risk",            icon: <ShieldAlert   className="h-3.5 w-3.5" />, description: "Approaching SLA breach (within 2h)",                  color: "text-amber-600 dark:text-amber-400"},
  { id: "unassigned_urgent", label: "Unassigned Urgent",  icon: <UserX         className="h-3.5 w-3.5" />, description: "Urgent tickets with no assigned agent",               color: "text-orange-600 dark:text-orange-400"},
];

// ── URL serialization ─────────────────────────────────────────────────────────

function parseMulti<T>(raw: string | null): T | T[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean) as T[];
  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0] : parts;
}

function parseIntCsv(raw: string | null): number | number[] | undefined {
  if (!raw) return undefined;
  const ns = raw.split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
  if (ns.length === 0) return undefined;
  return ns.length === 1 ? ns[0] : ns;
}

function parseTeamCsv(raw: string | null): number | "none" | (number | "none")[] | undefined {
  if (!raw) return undefined;
  const items: (number | "none")[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (!t) continue;
    if (t === "none") items.push("none");
    else {
      const n = Number(t);
      if (Number.isInteger(n) && n > 0) items.push(n);
    }
  }
  if (items.length === 0) return undefined;
  return items.length === 1 ? items[0] : items;
}

export function parseFiltersFromParams(params: URLSearchParams): TicketFilters {
  const f: TicketFilters = {};
  const status = parseMulti<TicketStatus>(params.get("status"));      if (status)  f.status     = status;
  const cstat  = parseIntCsv(params.get("customStatusId"));            if (cstat !== undefined) f.customStatusId = cstat;
  const tt     = parseMulti<TicketType>(params.get("ticketType"));     if (tt)      f.ticketType = tt;
  const ctt    = parseIntCsv(params.get("customTicketTypeId"));        if (ctt !== undefined) f.customTicketTypeId = ctt;
  const cat = parseMulti<TicketCategory>(params.get("category"));   if (cat)     f.category = cat;
  const pri = parseMulti<TicketPriority>(params.get("priority"));   if (pri)     f.priority = pri;
  const sev = parseMulti<TicketSeverity>(params.get("severity"));   if (sev)     f.severity = sev;
  const imp = parseMulti<TicketImpact>(params.get("impact"));       if (imp)     f.impact   = imp;
  const urg = parseMulti<TicketUrgency>(params.get("urgency"));     if (urg)     f.urgency  = urg;
  const src = parseMulti<"email"|"portal"|"agent">(params.get("source")); if (src) f.source = src;
  const assignees = parseMulti<string>(params.get("assignedToId")); if (assignees) f.assignedToId = assignees;
  if (params.has("search"))       f.search       = params.get("search")!;
  if (params.get("escalated")    === "true") f.escalated    = true;
  if (params.get("assignedToMe") === "true") f.assignedToMe = true;
  if (params.get("unassigned")   === "true") f.unassigned   = true;
  if (params.get("slaBreached")  === "true") f.slaBreached  = true;
  if (params.has("view"))         f.view         = params.get("view") as TicketView;
  const team = parseTeamCsv(params.get("teamId")); if (team !== undefined) f.teamId = team;
  return f;
}

function serializeFilterValue(v: string | string[]): string {
  return Array.isArray(v) ? v.join(",") : v;
}

function serializeNumberish(v: number | (number | "none") | (number | "none")[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  if (Array.isArray(v)) return v.length > 0 ? v.map(String).join(",") : undefined;
  return String(v);
}

function filtersToRecord(filters: TicketFilters, vid?: string | null): Record<string, string> {
  const p: Record<string, string> = {};
  if (filters.status)             p.status             = serializeFilterValue(filters.status as string | string[]);
  if (filters.customStatusId !== undefined) {
    const v = serializeNumberish(filters.customStatusId);
    if (v) p.customStatusId = v;
  }
  if (filters.ticketType)         p.ticketType         = serializeFilterValue(filters.ticketType as string | string[]);
  if (filters.customTicketTypeId !== undefined) {
    const v = serializeNumberish(filters.customTicketTypeId);
    if (v) p.customTicketTypeId = v;
  }
  if (filters.category)     p.category     = serializeFilterValue(filters.category);
  if (filters.priority)     p.priority     = serializeFilterValue(filters.priority);
  if (filters.severity)     p.severity     = serializeFilterValue(filters.severity);
  if (filters.impact)        p.impact        = serializeFilterValue(filters.impact);
  if (filters.urgency)       p.urgency       = serializeFilterValue(filters.urgency);
  if (filters.source)        p.source        = serializeFilterValue(filters.source as string | string[]);
  if (filters.assignedToId)  p.assignedToId  = serializeFilterValue(filters.assignedToId as string | string[]);
  if (filters.search)        p.search        = filters.search;
  if (filters.escalated)     p.escalated     = "true";
  if (filters.assignedToMe)  p.assignedToMe  = "true";
  if (filters.unassigned)    p.unassigned    = "true";
  if (filters.slaBreached)   p.slaBreached   = "true";
  if (filters.view)          p.view          = filters.view;
  if (filters.teamId !== undefined) {
    const v = serializeNumberish(filters.teamId);
    if (v) p.teamId = v;
  }
  if (vid)                  p.vid          = vid;
  return p;
}

function describeFilterValue(v: string | string[]): string {
  return Array.isArray(v) ? v.join(", ") : v;
}

function describeFilters(
  filters: TicketFilters,
  teamLookup?: Map<number, string>,
): string {
  if (filters.view === "overdue")           return "Overdue tickets — SLA deadline exceeded";
  if (filters.view === "at_risk")           return "At-risk tickets — within 2h of SLA breach";
  if (filters.view === "unassigned_urgent") return "Unassigned urgent tickets";
  if (filters.escalated)                   return "Escalated tickets";
  if (filters.assignedToMe)                return "My open tickets";
  const parts: string[] = [];
  if (filters.status)     parts.push(`Status: ${describeFilterValue(filters.status as string | string[])}`);
  if (filters.priority)   parts.push(`Priority: ${describeFilterValue(filters.priority)}`);
  if (filters.severity)   parts.push(`Severity: ${describeFilterValue(filters.severity)}`);
  if (filters.impact)     parts.push(`Impact: ${describeFilterValue(filters.impact)}`);
  if (filters.urgency)    parts.push(`Urgency: ${describeFilterValue(filters.urgency)}`);
  if (filters.source)     parts.push(`Source: ${describeFilterValue(filters.source as string | string[])}`);
  if (filters.ticketType) parts.push(`Type: ${describeFilterValue(filters.ticketType as string | string[])}`);
  if (filters.category) {
    const cat = filters.category;
    const label = Array.isArray(cat)
      ? cat.map((c) => categoryLabel[c] ?? c).join(", ")
      : (categoryLabel[cat] ?? cat);
    parts.push(`Category: ${label}`);
  }
  if (filters.unassigned) parts.push("Agent unassigned");
  if (filters.slaBreached) parts.push("SLA breached");
  if (filters.search)     parts.push(`Search: "${filters.search}"`);
  if (filters.teamId !== undefined) {
    const tIds = Array.isArray(filters.teamId) ? filters.teamId : [filters.teamId];
    const labels = tIds.map((id) =>
      id === "none"
        ? "No team"
        : (teamLookup?.get(id) ?? `Team ${id}`),
    );
    parts.push(`Team: ${labels.join(", ")}`);
  }
  return parts.join(" · ");
}

// ── View chip component ───────────────────────────────────────────────────────

function ViewChip({
  active,
  onClick,
  icon,
  emoji,
  label,
  isDefault,
  isShared,
  activeColor,
  onEdit,
  onSetDefault,
  onClearDefault,
  onDelete,
  description,
}: {
  active:          boolean;
  onClick:         () => void;
  icon?:           React.ReactNode;
  emoji?:          string | null;
  label:           string;
  isDefault?:      boolean;
  isShared?:       boolean;
  activeColor?:    string;
  onEdit?:         () => void;
  onSetDefault?:   () => void;
  onClearDefault?: () => void;
  onDelete?:       () => void;
  description?:    string;
}) {
  const hasActions = !!(onEdit || onSetDefault || onClearDefault || onDelete);

  // Active-state recipe: when an `activeColor` (Tailwind text-* class) is
  // provided we use it as the chip's tint family — coloured background, ring,
  // and shadow that all glow in the same hue. The default (no activeColor)
  // falls back to the primary brand colour.
  const activeStyles = activeColor
    ? `${activeColor} bg-current/15 ring-1 ring-current/40 shadow-sm shadow-current/10 font-semibold`
    : "bg-primary text-primary-foreground shadow-sm shadow-primary/30 hover:bg-primary/90 font-semibold";

  const chip = (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group relative inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs transition-all whitespace-nowrap shrink-0 select-none",
        active
          ? activeStyles
          : "text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent hover:border-border/50 font-medium",
      ].join(" ")}
    >
      {emoji && <span className="text-sm leading-none">{emoji}</span>}
      {!emoji && icon && <span className={active && !activeColor ? "text-primary-foreground" : ""}>{icon}</span>}
      <span>{label}</span>
      {isDefault && !active && (
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" title="Default view" />
      )}
      {isShared && (
        <Users className="h-3 w-3 text-current opacity-60 shrink-0" />
      )}
    </button>
  );

  if (!hasActions) {
    if (description) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{chip}</TooltipTrigger>
            <TooltipContent className="text-xs">{description}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return chip;
  }

  return (
    <div className="group/chip relative inline-flex items-center shrink-0">
      {chip}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={[
              "absolute -right-0.5 -top-0.5 h-4 w-4 rounded-full flex items-center justify-center transition-all",
              "opacity-0 group-hover/chip:opacity-100 focus:opacity-100",
              active
                ? "bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30"
                : "bg-foreground/10 text-foreground hover:bg-foreground/20",
            ].join(" ")}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-2.5 w-2.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          {onEdit && (
            <DropdownMenuItem onClick={onEdit} className="gap-2">
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />Edit view
            </DropdownMenuItem>
          )}
          {onSetDefault && !isDefault && (
            <DropdownMenuItem onClick={onSetDefault} className="gap-2">
              <Star className="h-3.5 w-3.5 text-muted-foreground" />Set as default
            </DropdownMenuItem>
          )}
          {onClearDefault && isDefault && (
            <DropdownMenuItem onClick={onClearDefault} className="gap-2">
              <Star className="h-3.5 w-3.5 text-amber-500" />Remove as default
            </DropdownMenuItem>
          )}
          {onDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="gap-2 text-destructive focus:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />Delete view
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── Scope indicator ───────────────────────────────────────────────────────────

interface TicketScope {
  scoped: boolean;
  globalTicketView: boolean;
  teams: { id: number; name: string; color: string }[];
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TicketsPage() {
  const navigate     = useNavigate();
  const qc           = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [builderOpen,    setBuilderOpen]    = useState(false);
  const [viewToEdit,     setViewToEdit]     = useState<StoredView | null>(null);
  const [selectedIds,     setSelectedIds]    = useState<number[]>([]);
  const [selectionResetKey, setSelectionResetKey] = useState(0);

  const handleSelectionChange = useCallback((ids: number[]) => setSelectedIds(ids), []);
  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setSelectionResetKey((k) => k + 1);
  }, []);

  const { data: ticketScope } = useQuery<TicketScope>({
    queryKey: ["me-ticket-scope"],
    queryFn:  () => axios.get<TicketScope>("/api/me/ticket-scope").then((r) => r.data),
    staleTime: 60_000,
  });

  const {
    viewList, activeConfig,
    setDefaultView, deleteView,
  } = useTicketViews();

  const vid = searchParams.get("vid");

  const resolvedViewConfig = useMemo(() => {
    if (vid) {
      const allViews = [...(viewList?.personal ?? []), ...(viewList?.shared ?? [])];
      const found = allViews.find((v) => String(v.id) === vid);
      return found?.config ?? activeConfig;
    }
    return activeConfig;
  }, [vid, viewList, activeConfig]);

  const filters = useMemo(() => parseFiltersFromParams(searchParams), [searchParams]);

  // Teams lookup — used to render `Team: <name>` instead of `Team: <id>`.
  // Shares the ["dict","teams"] cache entry with TicketsFilterSidebar /
  // dialogs so we only fetch once per session.
  const { data: teamsData } = useQuery({
    queryKey: ["dict", "teams"],
    queryFn:  () => axios.get<{ teams: { id: number; name: string }[] }>("/api/teams").then((r) => r.data.teams),
    staleTime: 5 * 60_000,
    gcTime:    30 * 60_000,
  });
  const teamLookup = useMemo(() => {
    const m = new Map<number, string>();
    for (const t of teamsData ?? []) m.set(t.id, t.name);
    return m;
  }, [teamsData]);

  const activeQuickView: QuickView["id"] | null = useMemo(() => {
    if (filters.view)      return filters.view as QuickView["id"];
    if (filters.escalated) return "escalated";
    return null;
  }, [filters]);

  const hasActiveFilters = Object.keys(filters).length > 0 && !vid;
  const filterDescription = describeFilters(filters, teamLookup);

  function applyQuickView(viewId: QuickView["id"] | null) {
    if (!viewId) {
      setSearchParams({}, { replace: true });
    } else if (viewId === "escalated") {
      setSearchParams({ escalated: "true" }, { replace: true });
    } else {
      setSearchParams({ view: viewId }, { replace: true });
    }
  }

  function applyNamedView(v: StoredView) {
    const preset = v.config.filters ?? {};
    const record: Record<string, string> = { vid: String(v.id) };
    if (preset.status?.length)             record.status             = preset.status.join(",");
    if (preset.customStatusId?.length)     record.customStatusId     = preset.customStatusId.join(",");
    if (preset.ticketType?.length)         record.ticketType         = preset.ticketType.join(",");
    if (preset.customTicketTypeId?.length) record.customTicketTypeId = preset.customTicketTypeId.join(",");
    if (preset.category?.length)           record.category           = preset.category.join(",");
    if (preset.priority?.length)           record.priority           = preset.priority.join(",");
    if (preset.severity?.length)           record.severity           = preset.severity.join(",");
    if (preset.impact?.length)             record.impact             = preset.impact.join(",");
    if (preset.urgency?.length)            record.urgency            = preset.urgency.join(",");
    if (preset.source?.length)             record.source             = preset.source.join(",");
    if (preset.assignedToId?.length)       record.assignedToId       = preset.assignedToId.join(",");
    if (preset.teamId?.length)             record.teamId             = preset.teamId.map(String).join(",");
    if (preset.escalated)          record.escalated          = "true";
    if (preset.assignedToMe)       record.assignedToMe       = "true";
    if (preset.unassigned)         record.unassigned         = "true";
    if (preset.slaBreached)        record.slaBreached        = "true";
    setSearchParams(record, { replace: true });
  }

  function handleFiltersChange(next: TicketFilters) {
    setSearchParams(filtersToRecord(next, vid), { replace: true });
  }

  function openBuilder(view?: StoredView) {
    setViewToEdit(view ?? null);
    setBuilderOpen(true);
  }

  const allViews = useMemo(
    () => [...(viewList?.personal ?? []), ...(viewList?.shared ?? [])],
    [viewList],
  );
  const activeVidView = vid ? allViews.find((v) => String(v.id) === vid) ?? null : null;

  const personal = viewList?.personal ?? [];
  const shared   = viewList?.shared   ?? [];

  return (
    <div className="lg:pr-[20.5rem]">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-start gap-3.5 min-w-0">
          {/* Brand-tinted icon chip — uses primary so it picks up the active palette. */}
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/30 bg-gradient-to-br from-primary/15 via-primary/8 to-transparent shrink-0 shadow-sm">
            <TicketIcon className="h-5 w-5 text-primary" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight leading-tight">Tickets</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Inbound requests, incidents, and service work — across every channel.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline" size="sm" className="h-8 gap-1.5"
            onClick={() => setCustomizerOpen(true)}
          >
            <Columns3 className="h-4 w-4" />
            Columns
          </Button>
          <Button onClick={() => navigate("/tickets/new")} size="sm" className="h-8 shadow-sm">
            <Plus className="h-4 w-4 mr-1" />New Ticket
          </Button>
        </div>
      </div>

      {/* ── Team-scope indicator ── */}
      {ticketScope?.scoped && ticketScope.teams.length > 0 && (
        <div className="flex items-center gap-2 mb-4 rounded-xl bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-primary">
          <Users className="h-3.5 w-3.5 shrink-0" />
          <span>
            Showing tickets for your team{ticketScope.teams.length !== 1 ? "s" : ""}:{" "}
            {ticketScope.teams.map((t, i) => (
              <span key={t.id}>
                {i > 0 && ", "}
                <span className="font-semibold">{t.name}</span>
              </span>
            ))}
          </span>
          <span className="ml-auto opacity-60">Contact an admin for broader access.</span>
        </div>
      )}

      {/* ── Views strip ─────────────────────────────────────────────────────── */}
      <div className="mb-4">
        {/* Row 1: searchable dropdown trigger + new-view button */}
        <div className="flex items-center gap-2 mb-2">
          <TicketViewsDropdown
            activeLabel={
              activeVidView
                ? activeVidView.name
                : activeQuickView
                ? QUICK_VIEWS.find((q) => q.id === activeQuickView)?.label ?? "All Tickets"
                : "All Tickets"
            }
            activeEmoji={activeVidView?.emoji ?? null}
            activeIcon={
              activeVidView ? undefined :
              activeQuickView ? QUICK_VIEWS.find((q) => q.id === activeQuickView)?.icon : <Zap className="h-3.5 w-3.5" />
            }
            personal={personal}
            shared={shared}
            activeVid={vid}
            activeQuickId={activeQuickView as "all" | "escalated" | "overdue" | "at_risk" | "unassigned_urgent" | null}
            onApplyQuick={(id) => applyQuickView(id)}
            onApplyView={applyNamedView}
            onCreateView={() => openBuilder()}
            onEditView={(v) => openBuilder(v)}
            onSetDefault={(id) => setDefaultView.mutate(id)}
            onClearDefault={() => setDefaultView.mutate(null)}
            onDeleteView={(id) => deleteView.mutate(id)}
          />

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost" size="sm"
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1"
                  onClick={() => openBuilder()}
                >
                  <Plus className="h-3.5 w-3.5" />New view
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Create a custom view with saved filters</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Row 2: chips for quick access */}
        <div className="flex items-center gap-1.5 flex-wrap">

          {/* All tickets */}
          <ViewChip
            active={!vid && activeQuickView === null}
            onClick={() => applyQuickView(null)}
            label="All tickets"
            icon={<Zap className="h-3.5 w-3.5" />}
          />

          {/* Quick views */}
          {QUICK_VIEWS.map((qv) => (
            <ViewChip
              key={qv.id}
              active={activeQuickView === qv.id}
              onClick={() => applyQuickView(activeQuickView === qv.id ? null : qv.id)}
              icon={qv.icon}
              label={qv.label}
              description={qv.description}
              activeColor={qv.color}
            />
          ))}

          {/* Divider before custom views */}
          {(personal.length > 0 || shared.length > 0) && (
            <div className="h-5 w-px bg-border/60 mx-0.5 shrink-0" />
          )}

          {/* Personal saved views */}
          {personal.map((v) => (
            <ViewChip
              key={v.id}
              active={vid === String(v.id)}
              onClick={() => applyNamedView(v)}
              emoji={v.emoji}
              label={v.name}
              isDefault={v.isDefault}
              isShared={false}
              onEdit={() => openBuilder(v)}
              onSetDefault={() => setDefaultView.mutate(v.id)}
              onClearDefault={() => setDefaultView.mutate(null)}
              onDelete={() => deleteView.mutate(v.id)}
            />
          ))}

          {/* Shared views — read-only for non-owners */}
          {shared.map((v) => (
            <ViewChip
              key={v.id}
              active={vid === String(v.id)}
              onClick={() => applyNamedView(v)}
              emoji={v.emoji}
              label={v.name}
              isShared
            />
          ))}

          {/* Create button (also at end) */}
          {personal.length === 0 && shared.length === 0 && (
            <button
              type="button"
              onClick={() => openBuilder()}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-medium text-muted-foreground border border-dashed border-border/60 hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors shrink-0"
            >
              <Plus className="h-3 w-3" />
              Create your first view
            </button>
          )}
        </div>
      </div>

      {/* ── Active view banner ── */}
      {activeVidView && (
        <div className="flex items-center gap-2 rounded-xl border bg-card px-4 py-2.5 text-sm mb-4 shadow-sm">
          {activeVidView.emoji && <span className="text-base">{activeVidView.emoji}</span>}
          <div className="flex-1 min-w-0">
            <span className="font-semibold truncate">{activeVidView.name}</span>
            {activeVidView.isDefault && (
              <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 gap-1">
                <Star className="h-2.5 w-2.5 text-amber-500" />Default
              </Badge>
            )}
            {activeVidView.isShared && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 gap-1">
                <Users className="h-2.5 w-2.5" />Shared
              </Badge>
            )}
          </div>

          {/* Edit button for own views */}
          {!activeVidView.isShared && (
            <Button
              variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground"
              onClick={() => openBuilder(activeVidView)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}

          <button
            type="button"
            aria-label="Clear view"
            onClick={() => setSearchParams({}, { replace: true })}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Filter banner (dashboard drill-down) ── */}
      {hasActiveFilters && !activeQuickView && filterDescription && !activeVidView && (
        <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-4 py-2.5 text-sm mb-4">
          <span className="text-muted-foreground shrink-0 text-xs">Filtered:</span>
          <span className="font-medium flex-1 text-xs">{filterDescription}</span>
          <button
            type="button"
            aria-label="Clear filters"
            onClick={() => setSearchParams({}, { replace: true })}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Standard filter bar (hidden when a special view forces a preset query) */}
      {!filters.view && (
        <TicketsFilters filters={filters} onChange={handleFiltersChange} />
      )}

      {/* Full-width table — sidebar reserves 20rem on the right via the page wrapper */}
      <TicketsTable
        key={vid ?? "default"}
        filters={filters}
        viewConfig={resolvedViewConfig}
        onSelectionChange={handleSelectionChange}
        selectionResetKey={selectionResetKey}
      />

      {/* Far-right floating filter rail — fixed to viewport edge */}
      <TicketsFilterSidebar
        filters={filters}
        onChange={handleFiltersChange}
        onClear={() => setSearchParams({}, { replace: true })}
        onSaveAsView={() => openBuilder()}
      />

      <BulkActionsBar
        selectedIds={selectedIds}
        onClearSelection={clearSelection}
      />

      {/* ── Dialogs ── */}
      <TicketViewCustomizer
        open={customizerOpen}
        onOpenChange={setCustomizerOpen}
      />

      <TicketViewBuilderDialog
        open={builderOpen}
        onOpenChange={(open) => {
          setBuilderOpen(open);
          if (!open) setViewToEdit(null);
        }}
        viewToEdit={viewToEdit}
        onSaved={(saved) => {
          // Auto-activate the new/edited view
          applyNamedView(saved);
        }}
      />
    </div>
  );
}
