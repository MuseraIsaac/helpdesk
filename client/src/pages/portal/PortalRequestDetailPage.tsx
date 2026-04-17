import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorAlert from "@/components/ErrorAlert";
import BackLink from "@/components/BackLink";
import {
  CheckCircle2,
  Clock,
  Circle,
  XCircle,
  PackageCheck,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PortalRequestItem {
  id: number;
  name: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  status: string;
  fulfilledAt: string | null;
}

interface PortalRequestTask {
  id: number;
  title: string;
  description: string | null;
  status: string;
  position: number;
  dueAt: string | null;
  completedAt: string | null;
}

interface PortalRequestDetail {
  id: number;
  requestNumber: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  approvalStatus: string;
  catalogItemName: string | null;
  formData: Record<string, unknown> | null;
  dueDate: string | null;
  slaDueAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignedTo: { id: string; name: string } | null;
  team: { id: number; name: string; color: string } | null;
  items: PortalRequestItem[];
  tasks: PortalRequestTask[];
}

// ── Status display helpers ─────────────────────────────────────────────────────

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

const APPROVAL_LABEL: Record<string, string> = {
  not_required: "Not required",
  pending:      "Pending",
  approved:     "Approved",
  rejected:     "Rejected",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TaskStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />;
    case "in_progress":
      return <Clock className="h-4 w-4 text-indigo-500 shrink-0" />;
    case "cancelled":
      return <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />;
    default:
      return <Circle className="h-4 w-4 text-muted-foreground shrink-0" />;
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PortalRequestDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: request, isLoading, error } = useQuery({
    queryKey: ["portal-request", id],
    queryFn: async () => {
      const { data } = await axios.get<{ request: PortalRequestDetail }>(
        `/api/portal/requests/${id}`
      );
      return data.request;
    },
    refetchInterval: 30_000,
  });

  const completedTasks = request?.tasks.filter((t) => t.status === "completed").length ?? 0;
  const totalTasks = request?.tasks.length ?? 0;

  return (
    <div className="space-y-6">
      <BackLink to="/portal/requests">Back to my requests</BackLink>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {error && (
        <ErrorAlert
          message={
            axios.isAxiosError(error) && error.response?.status === 404
              ? "Request not found"
              : "Failed to load request"
          }
        />
      )}

      {request && (
        <div className="space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[11px] font-semibold text-muted-foreground mb-1">
                  {request.requestNumber}
                </p>
                <h1 className="text-xl font-semibold">{request.title}</h1>
                {request.catalogItemName && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Service: {request.catalogItemName}
                  </p>
                )}
              </div>
              <Badge variant={STATUS_VARIANT[request.status] ?? "secondary"}>
                {STATUS_LABEL[request.status] ?? request.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Submitted {formatDateTime(request.createdAt)}
              {request.updatedAt !== request.createdAt && (
                <> · Updated {formatDateTime(request.updatedAt)}</>
              )}
            </p>
          </div>

          {/* Status tracker — visual progress stepper */}
          {!["cancelled", "rejected"].includes(request.status) && (
            <div className="rounded-lg border p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Request Progress
              </p>
              <div className="flex items-center gap-0">
                {[
                  { key: "submitted", label: "Submitted" },
                  ...(request.approvalStatus !== "not_required"
                    ? [{ key: "pending_approval", label: "Approval" }]
                    : []),
                  { key: "in_fulfillment", label: "Fulfillment" },
                  { key: "fulfilled", label: "Fulfilled" },
                  { key: "closed", label: "Closed" },
                ].map((step, idx, arr) => {
                  const ORDER = ["submitted", "pending_approval", "approved", "in_fulfillment", "fulfilled", "closed"];
                  const currentIdx = ORDER.indexOf(request.status);
                  const stepIdx = ORDER.indexOf(step.key);
                  const isDone = currentIdx > stepIdx;
                  const isActive = request.status === step.key || (step.key === "pending_approval" && request.status === "approved");
                  return (
                    <div key={step.key} className="flex items-center flex-1 min-w-0">
                      <div className="flex flex-col items-center shrink-0">
                        <div
                          className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-colors ${
                            isDone
                              ? "bg-primary border-primary text-primary-foreground"
                              : isActive
                              ? "border-primary text-primary bg-primary/10"
                              : "border-muted-foreground/30 text-muted-foreground/40 bg-background"
                          }`}
                        >
                          {isDone ? "✓" : idx + 1}
                        </div>
                        <span
                          className={`text-[10px] mt-1 font-medium text-center leading-tight ${
                            isActive ? "text-primary" : isDone ? "text-foreground" : "text-muted-foreground/50"
                          }`}
                        >
                          {step.label}
                        </span>
                      </div>
                      {idx < arr.length - 1 && (
                        <div
                          className={`flex-1 h-px mx-1 mt-[-14px] transition-colors ${
                            isDone ? "bg-primary" : "bg-muted-foreground/20"
                          }`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Rejection / cancellation notice */}
          {(request.status === "rejected" || request.status === "cancelled") && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
              <p className="text-sm font-medium text-destructive">
                {request.status === "rejected"
                  ? "This request was rejected."
                  : "This request was cancelled."}
              </p>
              {request.cancelledAt && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDateTime(request.cancelledAt)}
                </p>
              )}
            </div>
          )}

          {/* Description */}
          {request.description && (
            <div className="rounded-lg border p-4 bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground mb-2">Description</p>
              <p className="text-sm whitespace-pre-wrap">{request.description}</p>
            </div>
          )}

          {/* Requested items */}
          {request.items.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <PackageCheck className="h-4 w-4" />
                Requested Items
              </h2>
              <div className="rounded-lg border divide-y overflow-hidden">
                {request.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-sm text-muted-foreground">
                      <span>
                        {item.quantity}
                        {item.unit ? ` ${item.unit}` : ""}
                      </span>
                      <Badge
                        variant={item.status === "fulfilled" ? "default" : "outline"}
                        className="text-[10px]"
                      >
                        {item.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fulfillment tasks — visible to requester as progress checklist */}
          {request.tasks.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Fulfillment Progress</h2>
                <span className="text-xs text-muted-foreground">
                  {completedTasks}/{totalTasks} steps done
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: totalTasks > 0 ? `${(completedTasks / totalTasks) * 100}%` : "0%" }}
                />
              </div>

              <div className="space-y-1">
                {request.tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start gap-2 rounded-md border px-3 py-2"
                  >
                    <TaskStatusIcon status={task.status} />
                    <div className="flex-1 min-w-0">
                      <span
                        className={`text-sm ${
                          task.status === "completed"
                            ? "line-through text-muted-foreground"
                            : task.status === "cancelled"
                            ? "text-muted-foreground"
                            : ""
                        }`}
                      >
                        {task.title}
                      </span>
                      {task.completedAt && (
                        <p className="text-xs text-muted-foreground">
                          Completed {formatDateTime(task.completedAt)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sidebar info */}
          <div className="rounded-lg border p-4 space-y-3">
            <h2 className="text-sm font-semibold">Details</h2>

            {request.approvalStatus !== "not_required" && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Approval</p>
                <p className="text-sm mt-0.5">
                  {APPROVAL_LABEL[request.approvalStatus] ?? request.approvalStatus}
                </p>
              </div>
            )}

            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Priority</p>
              <p className="text-sm mt-0.5 capitalize">{request.priority}</p>
            </div>

            {request.assignedTo && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Handling Team</p>
                <p className="text-sm mt-0.5">
                  {request.team?.name ?? request.assignedTo.name}
                </p>
              </div>
            )}

            {request.slaDueAt && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Target Completion</p>
                <p className="text-sm mt-0.5">{formatDateTime(request.slaDueAt)}</p>
              </div>
            )}

            {request.resolvedAt && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Resolved</p>
                <p className="text-sm mt-0.5">{formatDateTime(request.resolvedAt)}</p>
              </div>
            )}

            {request.closedAt && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Closed</p>
                <p className="text-sm mt-0.5">{formatDateTime(request.closedAt)}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
