import { useState } from "react";
import { type TicketStatus } from "core/constants/ticket-status.ts";
import { type TicketType } from "core/constants/ticket-type.ts";
import { type TicketCategory } from "core/constants/ticket-category.ts";
import { type TicketPriority } from "core/constants/ticket-priority.ts";
import { type TicketSeverity } from "core/constants/ticket-severity.ts";
import { type TicketView } from "core/schemas/tickets.ts";
import { Button } from "@/components/ui/button";
import TicketsTable from "./TicketsTable";
import TicketsFilters from "./TicketsFilters";
import NewTicketDialog from "@/components/NewTicketDialog";
import { AlertTriangle, Clock, ShieldAlert, UserX } from "lucide-react";

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

export default function TicketsPage() {
  const [filters, setFilters] = useState<TicketFilters>({});
  const [activeQuickView, setActiveQuickView] = useState<QuickView["id"] | null>(null);

  function applyQuickView(viewId: QuickView["id"] | null) {
    setActiveQuickView(viewId);
    if (!viewId) {
      setFilters({});
    } else if (viewId === "escalated") {
      setFilters({ escalated: true });
    } else {
      // view param — clears other filters for a clean predefined query
      setFilters({ view: viewId as TicketView });
    }
  }

  function handleFiltersChange(next: TicketFilters) {
    // If the user changes individual filters, clear the quick view
    setActiveQuickView(null);
    setFilters(next);
  }

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

      {/* Only show standard filters when no predefined view is active */}
      {!filters.view && (
        <TicketsFilters filters={filters} onChange={handleFiltersChange} />
      )}

      <TicketsTable filters={filters} />
    </div>
  );
}
