import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { type TicketStatus } from "core/constants/ticket-status.ts";
import { type TicketType } from "core/constants/ticket-type.ts";
import { type TicketCategory, categoryLabel } from "core/constants/ticket-category.ts";
import { type TicketPriority } from "core/constants/ticket-priority.ts";
import { type TicketSeverity } from "core/constants/ticket-severity.ts";
import { type TicketView } from "core/schemas/tickets.ts";
import { SYSTEM_DEFAULT_VIEW_CONFIG } from "core/schemas/ticket-view.ts";
import { useTicketViews } from "@/hooks/useTicketViews";
import { Button } from "@/components/ui/button";
import TicketsTable from "./TicketsTable";
import TicketsFilters from "./TicketsFilters";
import NewTicketDialog from "@/components/NewTicketDialog";
import TicketViewCustomizer from "@/components/TicketViewCustomizer";
import {
  AlertTriangle,
  Clock,
  ShieldAlert,
  UserX,
  X,
  Columns3,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface TicketFilters {
  status?: TicketStatus;
  ticketType?: TicketType;
  category?: TicketCategory;
  priority?: TicketPriority;
  severity?: TicketSeverity;
  search?: string;
  escalated?: boolean;
  assignedToMe?: boolean;
  view?: TicketView;
  teamId?: number | "none";
}

interface QuickView {
  id: TicketView | "escalated" | "all";
  label: string;
  icon: React.ReactNode;
  description: string;
}

const QUICK_VIEWS: QuickView[] = [
  {
    id: "escalated",
    label: "Escalated",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    description: "Tickets that have been escalated",
  },
  {
    id: "overdue",
    label: "Overdue",
    icon: <Clock className="h-3.5 w-3.5" />,
    description: "Tickets past their SLA deadline",
  },
  {
    id: "at_risk",
    label: "At Risk",
    icon: <ShieldAlert className="h-3.5 w-3.5" />,
    description: "Tickets approaching SLA breach (within 2h)",
  },
  {
    id: "unassigned_urgent",
    label: "Unassigned Urgent",
    icon: <UserX className="h-3.5 w-3.5" />,
    description: "Urgent tickets with no assigned agent",
  },
];

// ── URL serialization ─────────────────────────────────────────────────────────

/** Read TicketFilters from URLSearchParams. */
export function parseFiltersFromParams(params: URLSearchParams): TicketFilters {
  const f: TicketFilters = {};
  if (params.has("status"))       f.status       = params.get("status") as TicketStatus;
  if (params.has("ticketType"))   f.ticketType   = params.get("ticketType") as TicketType;
  if (params.has("category"))     f.category     = params.get("category") as TicketCategory;
  if (params.has("priority"))     f.priority     = params.get("priority") as TicketPriority;
  if (params.has("severity"))     f.severity     = params.get("severity") as TicketSeverity;
  if (params.has("search"))       f.search       = params.get("search")!;
  if (params.get("escalated") === "true")     f.escalated     = true;
  if (params.get("assignedToMe") === "true")  f.assignedToMe  = true;
  if (params.has("view"))         f.view         = params.get("view") as TicketView;
  if (params.has("teamId")) {
    const v = params.get("teamId")!;
    f.teamId = v === "none" ? "none" : Number(v);
  }
  return f;
}

/** Serialize TicketFilters to a plain Record for setSearchParams. */
function filtersToRecord(
  filters: TicketFilters,
  vid?: string | null,
): Record<string, string> {
  const p: Record<string, string> = {};
  if (filters.status)       p.status       = filters.status;
  if (filters.ticketType)   p.ticketType   = filters.ticketType;
  if (filters.category)     p.category     = filters.category;
  if (filters.priority)     p.priority     = filters.priority;
  if (filters.severity)     p.severity     = filters.severity;
  if (filters.search)       p.search       = filters.search;
  if (filters.escalated)    p.escalated    = "true";
  if (filters.assignedToMe) p.assignedToMe = "true";
  if (filters.view)         p.view         = filters.view;
  if (filters.teamId !== undefined) p.teamId = String(filters.teamId);
  if (vid)                  p.vid          = vid;
  return p;
}

/** Human-readable summary of the active filters for the drill-down banner. */
function describeFilters(filters: TicketFilters): string {
  if (filters.view === "overdue")           return "Overdue tickets — SLA deadline exceeded";
  if (filters.view === "at_risk")           return "At-risk tickets — within 2h of SLA breach";
  if (filters.view === "unassigned_urgent") return "Unassigned urgent tickets";
  if (filters.escalated)                   return "Escalated tickets";
  if (filters.assignedToMe)                return "My open tickets";

  const parts: string[] = [];
  if (filters.status)     parts.push(`Status: ${filters.status}`);
  if (filters.priority)   parts.push(`Priority: ${filters.priority}`);
  if (filters.severity)   parts.push(`Severity: ${filters.severity}`);
  if (filters.ticketType) parts.push(`Type: ${filters.ticketType}`);
  if (filters.category)   parts.push(`Category: ${categoryLabel[filters.category] ?? filters.category}`);
  if (filters.search)     parts.push(`Search: "${filters.search}"`);
  if (filters.teamId !== undefined) parts.push(`Team: ${filters.teamId}`);
  return parts.join(" · ");
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TicketsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [customizerOpen, setCustomizerOpen] = useState(false);

  const { viewList, activeView, activeConfig } = useTicketViews();

  // The `vid` param tracks the active saved view (column config + filter preset)
  const vid = searchParams.get("vid");

  // Resolve the column config: vid → matching view, or user's saved default, or system default
  const resolvedViewConfig = useMemo(() => {
    if (vid) {
      const allViews = [...(viewList?.personal ?? []), ...(viewList?.shared ?? [])];
      const found = allViews.find(v => String(v.id) === vid);
      return found?.config ?? activeConfig;
    }
    return activeConfig;
  }, [vid, viewList, activeConfig]);

  // Derive filter state from URL — no separate useState needed
  const filters = useMemo(
    () => parseFiltersFromParams(searchParams),
    [searchParams],
  );

  // Derive the active quick-view pill from the filter state
  const activeQuickView: QuickView["id"] | null = useMemo(() => {
    if (filters.view)      return filters.view as QuickView["id"];
    if (filters.escalated) return "escalated";
    return null;
  }, [filters]);

  // Whether any non-search filter from the dashboard is active
  const hasActiveFilters = Object.keys(filters).length > 0 && !vid;

  function applyQuickView(viewId: QuickView["id"] | null) {
    if (!viewId) {
      setSearchParams({}, { replace: true });
    } else if (viewId === "escalated") {
      setSearchParams({ escalated: "true" }, { replace: true });
    } else {
      setSearchParams({ view: viewId }, { replace: true });
    }
  }

  function applyNamedView(v: { id: number; config: typeof SYSTEM_DEFAULT_VIEW_CONFIG; name: string }) {
    const presetFilters = v.config.filters ?? {};
    const record: Record<string, string> = { vid: String(v.id) };
    if (presetFilters.status)       record.status       = presetFilters.status;
    if (presetFilters.ticketType)   record.ticketType   = presetFilters.ticketType;
    if (presetFilters.category)     record.category     = presetFilters.category;
    if (presetFilters.priority)     record.priority     = presetFilters.priority;
    if (presetFilters.severity)     record.severity     = presetFilters.severity;
    if (presetFilters.escalated)    record.escalated    = "true";
    if (presetFilters.assignedToMe) record.assignedToMe = "true";
    if (presetFilters.teamId !== undefined) record.teamId = String(presetFilters.teamId);
    setSearchParams(record, { replace: true });
  }

  function handleFiltersChange(next: TicketFilters) {
    // Preserve vid when changing individual filters
    setSearchParams(filtersToRecord(next, vid), { replace: true });
  }

  const filterDescription = describeFilters(filters);
  const allViews = [...(viewList?.personal ?? []), ...(viewList?.shared ?? [])];
  const activeVidView = vid ? allViews.find(v => String(v.id) === vid) : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setCustomizerOpen(true)}
          >
            <Columns3 className="h-4 w-4" />
            {activeView ? activeView.name : "Columns"}
          </Button>
          <NewTicketDialog />
        </div>
      </div>

      {/* Quick view pills + saved views dropdown */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs text-muted-foreground font-medium mr-1">Quick views:</span>
        <Button
          variant={activeQuickView === null && !vid ? "secondary" : "ghost"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => applyQuickView(null)}
        >
          All tickets
        </Button>
        {QUICK_VIEWS.map(qv => (
          <Button
            key={qv.id}
            variant={activeQuickView === qv.id ? "secondary" : "ghost"}
            size="sm"
            className={`h-7 text-xs gap-1.5 ${
              activeQuickView === qv.id
                ? qv.id === "escalated" || qv.id === "overdue"
                  ? "bg-red-500/10 text-red-600 hover:bg-red-500/15"
                  : qv.id === "at_risk"
                  ? "bg-amber-500/10 text-amber-600 hover:bg-amber-500/15"
                  : ""
                : ""
            }`}
            title={qv.description}
            onClick={() => applyQuickView(activeQuickView === qv.id ? null : qv.id)}
          >
            {qv.icon}
            {qv.label}
          </Button>
        ))}

        {/* Saved views dropdown */}
        {allViews.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={vid ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs gap-1"
              >
                {activeVidView ? (
                  <>
                    {activeVidView.emoji && <span>{activeVidView.emoji}</span>}
                    {activeVidView.name}
                  </>
                ) : (
                  "Saved views"
                )}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              {viewList?.personal && viewList.personal.length > 0 && (
                <>
                  <div className="px-2 py-1 text-xs text-muted-foreground font-medium">
                    Personal
                  </div>
                  {viewList.personal.map(v => (
                    <DropdownMenuItem
                      key={v.id}
                      className="gap-2 cursor-pointer"
                      onClick={() => applyNamedView(v)}
                    >
                      {v.emoji && <span>{v.emoji}</span>}
                      <span className="flex-1">{v.name}</span>
                      {v.isDefault && (
                        <span className="text-xs text-muted-foreground">default</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              {viewList?.shared && viewList.shared.length > 0 && (
                <>
                  {viewList.personal.length > 0 && <DropdownMenuSeparator />}
                  <div className="px-2 py-1 text-xs text-muted-foreground font-medium">
                    Shared
                  </div>
                  {viewList.shared.map(v => (
                    <DropdownMenuItem
                      key={v.id}
                      className="gap-2 cursor-pointer"
                      onClick={() => applyNamedView(v)}
                    >
                      {v.emoji && <span>{v.emoji}</span>}
                      <span>{v.name}</span>
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Active view banner when a named view is selected */}
      {activeVidView && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm mb-3">
          {activeVidView.emoji && <span>{activeVidView.emoji}</span>}
          <span className="font-medium flex-1">View: {activeVidView.name}</span>
          <button
            type="button"
            aria-label="Clear view"
            onClick={() => setSearchParams({}, { replace: true })}
            className="ml-1 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/*
        Active filter banner — shown when standard (non-quick-view) filters are
        set, e.g. arriving via a dashboard drill-down link.
      */}
      {hasActiveFilters && !activeQuickView && filterDescription && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm mb-3">
          <span className="text-muted-foreground shrink-0">Filtered:</span>
          <span className="font-medium flex-1">{filterDescription}</span>
          <button
            type="button"
            aria-label="Clear filters"
            onClick={() => setSearchParams({}, { replace: true })}
            className="ml-1 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Only show standard filters when no predefined view is active */}
      {!filters.view && (
        <TicketsFilters filters={filters} onChange={handleFiltersChange} />
      )}

      {/* Use key to reset table sort state when the view changes */}
      <TicketsTable
        key={vid ?? "default"}
        filters={filters}
        viewConfig={resolvedViewConfig}
      />

      <TicketViewCustomizer
        open={customizerOpen}
        onOpenChange={setCustomizerOpen}
      />
    </div>
  );
}
