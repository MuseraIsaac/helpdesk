import { useState, useCallback } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import axios from "axios";
import type { ServiceRequest } from "core/constants/request.ts";
import { requestStatuses, requestStatusLabel } from "core/constants/request-status.ts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ErrorAlert from "@/components/ErrorAlert";
import ModuleBulkActionsBar from "@/components/ModuleBulkActionsBar";
import { Inbox, ChevronRight, Clock, User, Plus } from "lucide-react";

// ── Badges ────────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  draft:            "bg-muted text-muted-foreground",
  submitted:        "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  pending_approval: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  approved:         "bg-teal-500/15 text-teal-700 dark:text-teal-400",
  in_fulfillment:   "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400",
  fulfilled:        "bg-green-500/15 text-green-700 dark:text-green-400",
  closed:           "bg-muted text-muted-foreground",
  rejected:         "bg-destructive/15 text-destructive",
  cancelled:        "bg-muted text-muted-foreground",
};

export function RequestStatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? STATUS_STYLES.submitted;
  return (
    <Badge variant="outline" className={`text-[11px] ${cls}`}>
      {requestStatusLabel[status as keyof typeof requestStatusLabel] ?? status}
    </Badge>
  );
}

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "bg-red-500/15 text-red-700 border-red-200 dark:text-red-400",
  high:   "bg-orange-500/15 text-orange-700 border-orange-200 dark:text-orange-400",
  medium: "bg-yellow-500/15 text-yellow-700 border-yellow-200 dark:text-yellow-400",
  low:    "bg-muted text-muted-foreground border-border",
};

export function RequestPriorityBadge({ priority }: { priority: string }) {
  const cls = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.low;
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {priority}
    </span>
  );
}

export function ApprovalStatusPill({ status }: { status: string }) {
  if (status === "not_required") return null;
  const styles: Record<string, string> = {
    pending:  "text-amber-600 dark:text-amber-400",
    approved: "text-green-600 dark:text-green-400",
    rejected: "text-destructive",
  };
  const labels: Record<string, string> = {
    pending: "Approval pending",
    approved: "Approved",
    rejected: "Rejected",
  };
  return (
    <span className={`text-[11px] font-medium ${styles[status] ?? ""}`}>
      {labels[status] ?? status}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(diff / 3_600_000);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── RequestsPage ──────────────────────────────────────────────────────────────

const ACTIVE_STATUSES = requestStatuses.filter(
  (s) => s !== "closed" && s !== "rejected" && s !== "cancelled"
);

export default function RequestsPage() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const clearSelection = useCallback(() => setSelectedIds([]), []);

  function toggleRow(id: number) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }
  function toggleAll(ids: number[]) {
    setSelectedIds((prev) => prev.length === ids.length && ids.every((id) => prev.includes(id)) ? [] : ids);
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ["requests", { statusFilter, priorityFilter, assignedToMe, search }],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: "50" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (assignedToMe) params.set("assignedToMe", "true");
      if (search.trim()) params.set("search", search.trim());
      const { data } = await axios.get<{
        requests: ServiceRequest[];
        meta: { total: number };
      }>(`/api/requests?${params}`);
      return data;
    },
  });

  const requests = data?.requests ?? [];
  const total = data?.meta.total ?? 0;
  const pendingApproval = requests.filter((r) => r.status === "pending_approval").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Service Requests</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} request{total !== 1 ? "s" : ""}
            {pendingApproval > 0 && (
              <span className="ml-2 text-amber-600 dark:text-amber-400 font-medium">
                · {pendingApproval} pending approval
              </span>
            )}
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => navigate("/requests/new")}>
          <Plus className="h-4 w-4" />
          New Request
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Input
            placeholder="Search requests…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs w-52 pl-3"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active (non-terminal)</SelectItem>
            {requestStatuses.map((s) => (
              <SelectItem key={s} value={s}>
                {requestStatusLabel[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {["urgent", "high", "medium", "low"].map((p) => (
              <SelectItem key={p} value={p} className="capitalize">
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={assignedToMe ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={() => setAssignedToMe((v) => !v)}
        >
          <User className="h-3.5 w-3.5 mr-1.5" />
          Assigned to me
        </Button>
      </div>

      {error && <ErrorAlert error={error} fallback="Failed to load requests" />}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
          <Inbox className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No requests found</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 pl-3">
                  <input type="checkbox" className="accent-primary h-3.5 w-3.5 cursor-pointer"
                    checked={requests.length > 0 && selectedIds.length === requests.length}
                    ref={(el) => { if (el) el.indeterminate = selectedIds.length > 0 && selectedIds.length < requests.length; }}
                    onChange={() => toggleAll(requests.map((r) => r.id))} />
                </TableHead>
                <TableHead className="w-28">Number</TableHead>
                <TableHead>Request</TableHead>
                <TableHead className="w-20">Priority</TableHead>
                <TableHead className="w-36">Status</TableHead>
                <TableHead className="w-36">Requester</TableHead>
                <TableHead className="w-36">Assigned To</TableHead>
                <TableHead className="w-24">Due</TableHead>
                <TableHead className="w-24">Created</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((req) => (
                <TableRow key={req.id} className={`group ${selectedIds.includes(req.id) ? "bg-primary/5" : ""}`}>
                  <TableCell className="pl-3">
                    <input type="checkbox" className="accent-primary h-3.5 w-3.5 cursor-pointer"
                      checked={selectedIds.includes(req.id)}
                      onChange={() => toggleRow(req.id)}
                      onClick={(e) => e.stopPropagation()} />
                  </TableCell>
                  <TableCell className="font-mono text-xs font-medium text-muted-foreground">
                    <Link
                      to={`/requests/${req.id}`}
                      className="hover:text-foreground transition-colors"
                    >
                      {req.requestNumber}
                    </Link>
                  </TableCell>

                  <TableCell>
                    <Link
                      to={`/requests/${req.id}`}
                      className="hover:text-foreground/80 transition-colors"
                    >
                      <div className="font-medium truncate max-w-xs">{req.title}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {req.catalogItemName && (
                          <span className="text-xs text-muted-foreground">
                            {req.catalogItemName}
                          </span>
                        )}
                        <ApprovalStatusPill status={req.approvalStatus} />
                      </div>
                    </Link>
                  </TableCell>

                  <TableCell>
                    <RequestPriorityBadge priority={req.priority} />
                  </TableCell>

                  <TableCell>
                    <RequestStatusBadge status={req.status} />
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    <div>{req.requesterName}</div>
                    <div className="text-xs">{req.requesterEmail}</div>
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {req.assignedTo?.name ?? (
                      <span className="italic text-xs">Unassigned</span>
                    )}
                  </TableCell>

                  <TableCell className="text-xs text-muted-foreground">
                    {req.dueDate ? (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(req.dueDate)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </TableCell>

                  <TableCell className="text-xs text-muted-foreground">
                    {formatRelative(req.createdAt)}
                  </TableCell>

                  <TableCell>
                    <Link to={`/requests/${req.id}`}>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ModuleBulkActionsBar
        selectedIds={selectedIds}
        onClearSelection={clearSelection}
        endpoint="/api/requests"
        queryKey={["requests"]}
        entityLabel="request"
        statusOptions={requestStatuses.map((s) => ({ value: s, label: requestStatusLabel[s] }))}
      />
    </div>
  );
}
