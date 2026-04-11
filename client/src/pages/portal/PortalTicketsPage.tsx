import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { PlusCircle, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ErrorAlert from "@/components/ErrorAlert";
import { Skeleton } from "@/components/ui/skeleton";

interface PortalTicket {
  id: number;
  subject: string;
  status: string;
  category: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  new: "Received",
  processing: "Under Review",
  open: "Open",
  resolved: "Resolved",
  closed: "Closed",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  new: "secondary",
  processing: "secondary",
  open: "default",
  resolved: "outline",
  closed: "outline",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function PortalTicketsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["portal-tickets"],
    queryFn: async () => {
      const { data } = await axios.get<{ tickets: PortalTicket[] }>(
        "/api/portal/tickets"
      );
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Tickets</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track the status of your support requests
          </p>
        </div>
        <Button asChild>
          <Link to="/portal/new-ticket">
            <PlusCircle className="h-4 w-4 mr-2" />
            New Ticket
          </Link>
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      )}

      {error && (
        <ErrorAlert error={error} fallback="Failed to load your tickets" />
      )}

      {data && data.tickets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Ticket className="h-10 w-10 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">No tickets yet.</p>
          <Button asChild variant="link" className="mt-2">
            <Link to="/portal/new-ticket">Submit your first request</Link>
          </Button>
        </div>
      )}

      {data && data.tickets.length > 0 && (
        <div className="divide-y divide-border border rounded-lg overflow-hidden">
          {data.tickets.map((ticket) => (
            <Link
              key={ticket.id}
              to={`/portal/tickets/${ticket.id}`}
              className="flex items-center justify-between px-5 py-4 hover:bg-accent/50 transition-colors"
            >
              <div className="min-w-0 mr-4">
                <p className="font-medium text-sm truncate">{ticket.subject}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Submitted {formatDate(ticket.createdAt)}
                  {ticket.updatedAt !== ticket.createdAt && (
                    <> · Updated {formatDate(ticket.updatedAt)}</>
                  )}
                </p>
              </div>
              <Badge variant={STATUS_VARIANT[ticket.status] ?? "secondary"}>
                {STATUS_LABEL[ticket.status] ?? ticket.status}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
