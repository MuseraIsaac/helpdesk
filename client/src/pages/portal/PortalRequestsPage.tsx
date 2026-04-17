import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { PlusCircle, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorAlert from "@/components/ErrorAlert";

interface PortalRequest {
  id: number;
  requestNumber: string;
  title: string;
  status: string;
  priority: string;
  approvalStatus: string;
  catalogItemName: string | null;
  slaDueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft:            "Draft",
  submitted:        "Submitted",
  pending_approval: "Pending Approval",
  approved:         "Approved",
  in_fulfillment:   "In Fulfillment",
  fulfilled:        "Fulfilled",
  closed:           "Closed",
  rejected:         "Rejected",
  cancelled:        "Cancelled",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft:            "secondary",
  submitted:        "secondary",
  pending_approval: "outline",
  approved:         "default",
  in_fulfillment:   "default",
  fulfilled:        "outline",
  closed:           "outline",
  rejected:         "destructive",
  cancelled:        "secondary",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function PortalRequestsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["portal-requests"],
    queryFn: async () => {
      const { data } = await axios.get<{ requests: PortalRequest[] }>(
        "/api/portal/requests"
      );
      return data;
    },
  });

  const requests = data?.requests ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track the status of your service requests
          </p>
        </div>
        <Button asChild>
          <Link to="/portal/new-request">
            <PlusCircle className="h-4 w-4 mr-2" />
            New Request
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
        <ErrorAlert error={error} fallback="Failed to load your requests" />
      )}

      {!isLoading && requests.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">No requests yet.</p>
          <Button asChild variant="link" className="mt-2">
            <Link to="/portal/new-request">Submit your first request</Link>
          </Button>
        </div>
      )}

      {requests.length > 0 && (
        <div className="divide-y divide-border border rounded-lg overflow-hidden">
          {requests.map((req) => (
            <Link
              key={req.id}
              to={`/portal/requests/${req.id}`}
              className="flex items-center justify-between px-5 py-4 hover:bg-accent/50 transition-colors"
            >
              <div className="min-w-0 mr-4 flex-1">
                <p className="font-mono text-[11px] font-semibold text-muted-foreground mb-0.5">
                  {req.requestNumber}
                </p>
                <p className="font-medium text-sm truncate">{req.title}</p>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                  {req.catalogItemName && (
                    <span>{req.catalogItemName}</span>
                  )}
                  <span>Submitted {formatDate(req.createdAt)}</span>
                  {req.updatedAt !== req.createdAt && (
                    <span>· Updated {formatDate(req.updatedAt)}</span>
                  )}
                </div>
              </div>
              <Badge variant={STATUS_VARIANT[req.status] ?? "secondary"}>
                {STATUS_LABEL[req.status] ?? req.status}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
