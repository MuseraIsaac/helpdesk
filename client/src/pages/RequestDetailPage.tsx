import { useState, useRef, useEffect } from "react";
import { useParams, Link } from "react-router";
import BackLink from "@/components/BackLink";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import type {
  ServiceRequest,
  FulfillmentTask,
  RequestEvent,
} from "core/constants/request.ts";
import {
  requestStatusTransitions,
  requestStatusLabel,
  terminalRequestStatuses,
} from "core/constants/request-status.ts";
import {
  fulfillmentTaskStatuses,
  fulfillmentTaskStatusLabel,
  fulfillmentTaskStatusTransitions,
} from "core/constants/fulfillment-task-status.ts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import ErrorAlert from "@/components/ErrorAlert";
import { RequestStatusBadge, RequestPriorityBadge, ApprovalStatusPill } from "./RequestsPage";
import {
  Plus,
  Check,
  X,
  Pencil,
  Trash2,
  Clock,
  User,
  Users,
  PackageCheck,
  ClipboardList,
  Activity,
  Link2,
  BookmarkPlus,
  Server,
} from "lucide-react";
import SaveAsTemplateDialog from "@/components/SaveAsTemplateDialog";
import WatchButton from "@/components/FollowButton";
import AssetLinksPanel from "@/components/AssetLinksPanel";

// ── Event label map ───────────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
  "request.created":              "Request submitted",
  "request.status_changed":       "Status changed",
  "request.priority_changed":     "Priority changed",
  "request.assigned":             "Assignment changed",
  "request.approval_requested":   "Approval requested",
  "request.task_created":         "Task added",
  "request.task_status_changed":  "Task status updated",
  "request.task_deleted":         "Task deleted",
};

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(diff / 3_600_000);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatDatetime(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Inline editable field ─────────────────────────────────────────────────────

function InlineField({
  label,
  value,
  onSave,
  type = "text",
}: {
  label: string;
  value: string | null | undefined;
  onSave: (val: string) => void;
  type?: "text" | "number" | "datetime-local";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(value ?? "");
    setEditing(true);
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function save() {
    onSave(draft);
    setEditing(false);
  }

  function cancel() {
    setEditing(false);
  }

  return (
    <div className="space-y-0.5">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      {editing ? (
        <div className="flex items-center gap-1">
          <Input
            ref={inputRef}
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-7 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") cancel();
            }}
          />
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={save}>
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={cancel}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <button
          onClick={startEdit}
          className="flex items-center gap-1 text-sm hover:text-foreground/70 group w-full text-left"
        >
          <span className={value ? "text-foreground" : "italic text-muted-foreground text-xs"}>
            {value ?? "Click to set"}
          </span>
          <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
        </button>
      )}
    </div>
  );
}

// ── Task list ─────────────────────────────────────────────────────────────────

function TaskList({
  tasks,
  requestId,
  isTerminal,
  refetch,
}: {
  tasks: FulfillmentTask[];
  requestId: number;
  isTerminal: boolean;
  refetch: () => void;
}) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");

  const addTaskMutation = useMutation({
    mutationFn: async (title: string) => {
      await axios.post(`/api/requests/${requestId}/tasks`, {
        title,
        description: newTaskDesc || undefined,
        position: tasks.length,
      });
    },
    onSuccess: () => {
      setAddOpen(false);
      setNewTaskTitle("");
      setNewTaskDesc("");
      refetch();
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({
      taskId,
      status,
    }: {
      taskId: number;
      status: string;
    }) => {
      await axios.patch(`/api/requests/${requestId}/tasks/${taskId}`, { status });
    },
    onSuccess: () => refetch(),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      await axios.delete(`/api/requests/${requestId}/tasks/${taskId}`);
    },
    onSuccess: () => refetch(),
  });

  const completedCount = tasks.filter((t) => t.status === "completed").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          Fulfillment Tasks
          {tasks.length > 0 && (
            <span className="text-xs text-muted-foreground font-normal">
              {completedCount}/{tasks.length} done
            </span>
          )}
        </h3>
        {!isTerminal && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add task
          </Button>
        )}
      </div>

      {/* Progress bar */}
      {tasks.length > 0 && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(completedCount / tasks.length) * 100}%` }}
          />
        </div>
      )}

      <div className="space-y-1">
        {tasks.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            No tasks yet. Add tasks to track fulfillment steps.
          </p>
        )}
        {tasks.map((task) => {
          const nextStatuses = fulfillmentTaskStatusTransitions[task.status] ?? [];
          return (
            <div
              key={task.id}
              className={`flex items-start gap-2 rounded-md border px-3 py-2 ${
                task.status === "completed"
                  ? "opacity-60"
                  : task.status === "cancelled"
                  ? "opacity-40"
                  : ""
              }`}
            >
              {/* Quick complete checkbox */}
              <button
                className="mt-0.5 h-4 w-4 shrink-0 rounded border border-input flex items-center justify-center hover:bg-muted transition-colors"
                onClick={() => {
                  if (task.status === "pending" || task.status === "in_progress") {
                    updateTaskMutation.mutate({ taskId: task.id, status: "completed" });
                  } else if (task.status === "completed") {
                    updateTaskMutation.mutate({ taskId: task.id, status: "in_progress" });
                  }
                }}
                disabled={task.status === "cancelled" || isTerminal}
              >
                {task.status === "completed" && <Check className="h-3 w-3" />}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span
                    className={`text-sm font-medium ${
                      task.status === "completed" ? "line-through text-muted-foreground" : ""
                    }`}
                  >
                    {task.title}
                  </span>
                  {task.status === "in_progress" && (
                    <Badge variant="outline" className="text-[11px] text-indigo-600 border-indigo-200">
                      In progress
                    </Badge>
                  )}
                  {task.status === "cancelled" && (
                    <Badge variant="outline" className="text-[11px] text-muted-foreground">
                      Cancelled
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                  {task.assignedTo && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {task.assignedTo.name}
                    </span>
                  )}
                  {task.dueAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDatetime(task.dueAt)}
                    </span>
                  )}
                </div>
              </div>

              {/* Status picker */}
              {!isTerminal && task.status !== "cancelled" && nextStatuses.length > 0 && (
                <Select
                  value={task.status}
                  onValueChange={(v) =>
                    updateTaskMutation.mutate({ taskId: task.id, status: v })
                  }
                >
                  <SelectTrigger className="h-7 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={task.status}>
                      {fulfillmentTaskStatusLabel[task.status]}
                    </SelectItem>
                    {nextStatuses.map((s) => (
                      <SelectItem key={s} value={s}>
                        {fulfillmentTaskStatusLabel[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {!isTerminal && task.status !== "completed" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => deleteTaskMutation.mutate(task.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add task dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Fulfillment Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="task-title"
                placeholder="What needs to be done?"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTaskTitle.trim()) {
                    addTaskMutation.mutate(newTaskTitle.trim());
                  }
                }}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-desc">Description</Label>
              <Textarea
                id="task-desc"
                placeholder="Optional details"
                rows={2}
                value={newTaskDesc}
                onChange={(e) => setNewTaskDesc(e.target.value)}
              />
            </div>
            {addTaskMutation.error && (
              <ErrorAlert error={addTaskMutation.error} fallback="Failed to add task" />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => newTaskTitle.trim() && addTaskMutation.mutate(newTaskTitle.trim())}
              disabled={!newTaskTitle.trim() || addTaskMutation.isPending}
            >
              Add Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Event Trail ───────────────────────────────────────────────────────────────

function EventTrail({ events }: { events: RequestEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="font-medium flex items-center gap-2 text-sm">
        <Activity className="h-4 w-4" />
        Audit Trail
      </h3>
      <ol className="relative border-l border-border ml-2 space-y-3">
        {[...events].reverse().map((ev) => {
          const meta = ev.meta as Record<string, unknown>;
          let detail = "";
          if (meta.from && meta.to)
            detail = `${String(meta.from)} → ${String(meta.to)}`;
          return (
            <li key={ev.id} className="ml-4">
              <div className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border border-background bg-border" />
              <div className="flex items-baseline gap-2">
                <span className="text-sm">
                  {EVENT_LABELS[ev.action] ?? ev.action}
                </span>
                {detail && (
                  <span className="text-xs text-muted-foreground">{detail}</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {ev.actor?.name ?? "System"} · {formatRelative(ev.createdAt)}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── Items list ────────────────────────────────────────────────────────────────

function ItemsList({ items }: { items: ServiceRequest["items"] }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="font-medium flex items-center gap-2 text-sm">
        <PackageCheck className="h-4 w-4" />
        Requested Items
      </h3>
      <div className="rounded-md border divide-y">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between px-3 py-2">
            <div>
              <span className="text-sm font-medium">{item.name}</span>
              {item.description && (
                <p className="text-xs text-muted-foreground">{item.description}</p>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>
                {item.quantity}
                {item.unit ? ` ${item.unit}` : ""}
              </span>
              <Badge
                variant="outline"
                className={`text-[11px] ${
                  item.status === "fulfilled"
                    ? "text-green-600"
                    : item.status === "cancelled"
                    ? "opacity-50"
                    : ""
                }`}
              >
                {item.status}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── RequestDetailPage ─────────────────────────────────────────────────────────

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [templateDialog, setTemplateDialog] = useState(false);

  const { data: request, isLoading, error, refetch } = useQuery({
    queryKey: ["request", id],
    queryFn: async () => {
      const { data } = await axios.get<ServiceRequest>(`/api/requests/${id}`);
      return data;
    },
    refetchInterval: 30_000,
  });

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: { id: string; name: string }[] }>("/api/agents");
      return data;
    },
  });

  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data } = await axios.get<{ teams: { id: number; name: string }[] }>("/api/teams");
      return data;
    },
  });

  const patchMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { data } = await axios.patch(`/api/requests/${id}`, patch);
      return data;
    },
    onSuccess: () => refetch(),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid grid-cols-3 gap-6 mt-6">
          <div className="col-span-2 space-y-4">
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !request) {
    return <ErrorAlert error={error} fallback="Request not found" />;
  }

  const isTerminal = terminalRequestStatuses.includes(request.status);
  const availableTransitions =
    requestStatusTransitions[request.status as keyof typeof requestStatusTransitions] ?? [];

  return (
    <div className="space-y-6">
      {/* Back link + header */}
      <div>
        <BackLink to="/requests">Back to Requests</BackLink>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm text-muted-foreground">
                {request.requestNumber}
              </span>
              <RequestStatusBadge status={request.status} />
              <RequestPriorityBadge priority={request.priority} />
              {request.approvalStatus !== "not_required" && (
                <ApprovalStatusPill status={request.approvalStatus} />
              )}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight mt-1 truncate">
              {request.title}
            </h1>
            {request.catalogItemName && (
              <p className="text-sm text-muted-foreground mt-0.5">
                Service: {request.catalogItemName}
              </p>
            )}
          </div>

          {/* Follow + Save as Template + status transitions */}
          <div className="flex items-center gap-2 flex-wrap">
            <WatchButton entityPath="requests" entityId={request.id} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 h-8"
              onClick={() => setTemplateDialog(true)}
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
              Save as Template
            </Button>

          {!isTerminal && availableTransitions.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {availableTransitions.map((nextStatus) => (
                <Button
                  key={nextStatus}
                  variant={
                    nextStatus === "cancelled" || nextStatus === "rejected"
                      ? "destructive"
                      : nextStatus === "closed" || nextStatus === "fulfilled"
                      ? "default"
                      : "outline"
                  }
                  size="sm"
                  disabled={patchMutation.isPending}
                  onClick={() => patchMutation.mutate({ status: nextStatus })}
                >
                  {requestStatusLabel[nextStatus]}
                </Button>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>

      <SaveAsTemplateDialog
        open={templateDialog}
        onOpenChange={setTemplateDialog}
        type="request"
        defaultTitle={request.title}
        defaultBody={request.description ?? ""}
      />

      {patchMutation.error && (
        <ErrorAlert error={patchMutation.error} fallback="Failed to update request" />
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Main content ────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          {request.description && (
            <div className="rounded-md border p-4">
              <h3 className="font-medium text-sm mb-2">Description</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {request.description}
              </p>
            </div>
          )}

          {/* Items */}
          <ItemsList items={request.items} />

          {/* Fulfillment tasks */}
          <div className="rounded-md border p-4">
            <TaskList
              tasks={request.tasks ?? []}
              requestId={Number(id)}
              isTerminal={isTerminal}
              refetch={refetch}
            />
          </div>

          {/* Event trail */}
          {request.events && request.events.length > 0 && (
            <div className="rounded-md border p-4">
              <EventTrail events={request.events} />
            </div>
          )}
        </div>

        {/* ── Sidebar ─────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Ownership card */}
          <div className="rounded-md border p-4 space-y-4">
            <h3 className="font-medium text-sm">Ownership</h3>

            {/* Requester (read-only) */}
            <div className="space-y-0.5">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Requester
              </span>
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <div>
                  <p className="text-sm">{request.requesterName}</p>
                  <p className="text-xs text-muted-foreground">{request.requesterEmail}</p>
                </div>
              </div>
            </div>

            {/* Assignee */}
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Assigned To
              </span>
              <Select
                value={request.assignedTo?.id ?? "none"}
                onValueChange={(v) =>
                  patchMutation.mutate({
                    assignedToId: v === "none" ? null : v,
                  })
                }
                disabled={isTerminal}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {agentsData?.agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Team */}
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Team
              </span>
              <Select
                value={request.team?.id != null ? String(request.team.id) : "none"}
                onValueChange={(v) =>
                  patchMutation.mutate({
                    teamId: v === "none" ? null : Number(v),
                  })
                }
                disabled={isTerminal}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="No team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No team</SelectItem>
                  {teamsData?.teams.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Priority card */}
          <div className="rounded-md border p-4 space-y-2">
            <h3 className="font-medium text-sm">Priority</h3>
            <Select
              value={request.priority}
              onValueChange={(v) => patchMutation.mutate({ priority: v })}
              disabled={isTerminal}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["low", "medium", "high", "urgent"].map((p) => (
                  <SelectItem key={p} value={p} className="capitalize">
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dates card */}
          <div className="rounded-md border p-4 space-y-3">
            <h3 className="font-medium text-sm">Dates</h3>

            <InlineField
              label="Due Date"
              value={
                request.dueDate
                  ? new Date(request.dueDate).toISOString().slice(0, 16)
                  : null
              }
              type="datetime-local"
              onSave={(v) => patchMutation.mutate({ dueDate: v || null })}
            />

            {request.slaDueAt && (
              <div className="space-y-0.5">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  SLA Target
                </span>
                <p className="text-sm">{formatDatetime(request.slaDueAt)}</p>
              </div>
            )}

            {request.resolvedAt && (
              <div className="space-y-0.5">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Resolved
                </span>
                <p className="text-sm">{formatDatetime(request.resolvedAt)}</p>
              </div>
            )}

            {request.closedAt && (
              <div className="space-y-0.5">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Closed
                </span>
                <p className="text-sm">{formatDatetime(request.closedAt)}</p>
              </div>
            )}

            <div className="space-y-0.5">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Submitted
              </span>
              <p className="text-sm">{formatDatetime(request.createdAt)}</p>
            </div>
          </div>

          {/* Source Ticket panel */}
          {request.sourceTicket && (
            <div className="rounded-md border p-4 space-y-2">
              <h3 className="font-medium text-sm flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5" />
                Source Ticket
              </h3>
              <Link
                to={`/tickets/${request.sourceTicket.id}`}
                className="font-medium text-primary hover:underline block text-sm"
              >
                {request.sourceTicket.ticketNumber}
              </Link>
              <p className="text-xs text-muted-foreground leading-snug line-clamp-2">
                {request.sourceTicket.subject}
              </p>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className="text-[11px]">
                  {request.sourceTicket.status}
                </Badge>
                {request.sourceTicket.priority && (
                  <Badge variant="outline" className="text-[11px]">
                    {request.sourceTicket.priority}
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                From: {request.sourceTicket.senderName}
              </p>
            </div>
          )}

          {/* Affected Assets */}
          <div className="rounded-md border p-4 space-y-3">
            <h3 className="font-medium text-sm flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5 text-muted-foreground" />
              Affected Assets
            </h3>
            <AssetLinksPanel
              entityType="requests"
              entityId={request.id}
              readonly={isTerminal}
            />
          </div>

          {/* Approval info card */}
          {request.approvalStatus !== "not_required" && (
            <div className="rounded-md border p-4 space-y-2">
              <h3 className="font-medium text-sm">Approval</h3>
              <div className="flex items-center gap-2">
                <ApprovalStatusPill status={request.approvalStatus} />
              </div>
              {request.approvalRequestId && (
                <p className="text-xs text-muted-foreground">
                  Approval #{request.approvalRequestId} ·{" "}
                  <Link
                    to="/approvals"
                    className="underline hover:text-foreground"
                  >
                    View in Approvals
                  </Link>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
