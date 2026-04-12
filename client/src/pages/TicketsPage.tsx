import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { type TicketStatus } from "core/constants/ticket-status.ts";
import { type TicketType } from "core/constants/ticket-type.ts";
import { type TicketCategory, categoryLabel } from "core/constants/ticket-category.ts";
import { type TicketPriority } from "core/constants/ticket-priority.ts";
import { type TicketSeverity } from "core/constants/ticket-severity.ts";
import { type TicketView } from "core/schemas/tickets.ts";
import { Button } from "@/components/ui/button";
import TicketsTable from "./TicketsTable";
import TicketsFilters from "./TicketsFilters";
import NewTicketDialog from "@/components/NewTicketDialog";
import { AlertTriangle, Clock, ShieldAlert, UserX, X } from "lucide-react";

export interface TicketFilters {
  status?: TicketStatus;
  ticketType?: TicketType;
  category?: TicketCategory;
  priority?: TicketPriority;
  severity?: TicketSeverity;
  search?: string;
  escalated?: boolean;
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
  if (params.has("status"))     f.status     = params.get("status") as TicketStatus;
  if (params.has("ticketType")) f.ticketType = params.get("ticketType") as TicketType;
  if (params.has("category"))   f.category   = params.get("category") as TicketCategory;
  if (params.has("priority"))   f.priority   = params.get("priority") as TicketPriority;
  if (params.has("severity"))   f.severity   = params.get("severity") as TicketSeverity;
  if (params.has("search"))     f.search     = params.get("search")!;
  if (params.get("escalated") === "true") f.escalated = true;
  if (params.has("view"))       f.view       = params.get("view") as TicketView;
  if (params.has("teamId")) {
    const v = params.get("teamId")!;
    f.teamId = v === "none" ? "none" : Number(v);
  }
  return f;
}

/** Serialize TicketFilters to a plain Record for setSearchParams. */
function filtersToRecord(filters: TicketFilters): Record<string, string> {
  const p: Record<string, string> = {};
  if (filters.status)     p.status     = filters.status;
  if (filters.ticketType) p.ticketType = filters.ticketType;
  if (filters.category)   p.category   = filters.category;
  if (filters.priority)   p.priority   = filters.priority;
  if (filters.severity)   p.severity   = filters.severity;
  if (filters.search)     p.search     = filters.search;
  if (filters.escalated)  p.escalated  = "true";
  if (filters.view)       p.view       = filters.view;
  if (filters.teamId !== undefined) p.teamId = String(filters.teamId);
  return p;
}

/** Human-readable summary of the active filters for the drill-down banner. */
function describeFilters(filters: TicketFilters): string {
  if (filters.view === "overdue")           return "Overdue tickets — SLA deadline exceeded";
  if (filters.view === "at_risk")           return "At-risk tickets — within 2h of SLA breach";
  if (filters.view === "unassigned_urgent") return "Unassigned urgent tickets";
  if (filters.escalated)                   return "Escalated tickets";

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
  const hasActiveFilters = Object.keys(filters).length > 0;

  function applyQuickView(viewId: QuickView["id"] | null) {
    if (!viewId) {
      setSearchParams({}, { replace: true });
    } else if (viewId === "escalated") {
      setSearchParams({ escalated: "true" }, { replace: true });
    } else {
      setSearchParams({ view: viewId }, { replace: true });
    }
  }

  function handleFiltersChange(next: TicketFilters) {
    // Changing an individual filter clears any quick-view
    setSearchParams(filtersToRecord(next), { replace: true });
  }

  const filterDescription = describeFilters(filters);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>
        <NewTicketDialog />
      </div>

      {/* Quick view pills */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs text-muted-foreground font-medium mr-1">Quick views:</span>
        <Button
          variant={activeQuickView === null ? "secondary" : "ghost"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => applyQuickView(null)}
        >
          All tickets
        </Button>
        {QUICK_VIEWS.map((qv) => (
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
      </div>

      {/*
        Active filter banner — shown when standard (non-quick-view) filters are
        set, e.g. arriving via a dashboard drill-down link. Lets the user see
        immediately what's being filtered and clear it with one click.
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

      <TicketsTable filters={filters} />
    </div>
  );
}
