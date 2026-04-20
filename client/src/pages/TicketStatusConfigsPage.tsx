import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import axios from "axios";
import { CircleAlert, Pencil, Trash2, Plus, CircleDot, Info, PauseCircle, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { statusLabel } from "core/constants/ticket-status.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkflowState = "open" | "in_progress" | "resolved" | "closed";
type SlaBehavior = "continue" | "on_hold";

interface TicketStatusConfig {
  id:            number;
  label:         string;
  color:         string;
  workflowState: WorkflowState;
  slaBehavior:   SlaBehavior;
  position:      number;
  isActive:      boolean;
  createdAt:     string;
  _count:        { tickets: number };
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const statusFormSchema = z.object({
  label:         z.string().trim().min(1, "Label is required").max(80),
  color:         z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color"),
  workflowState: z.enum(["open", "in_progress", "resolved", "closed"]),
  slaBehavior:   z.enum(["continue", "on_hold"]),
  position:      z.number().int().min(0),
});

type StatusFormValues = z.infer<typeof statusFormSchema>;

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  "#6366f1", "#3b82f6", "#0ea5e9", "#10b981",
  "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6",
  "#64748b", "#f97316", "#84cc16", "#06b6d4",
];

const WORKFLOW_STATE_OPTIONS: { value: WorkflowState; label: string }[] = [
  { value: "open",        label: statusLabel.open },
  { value: "in_progress", label: statusLabel.in_progress },
  { value: "resolved",    label: statusLabel.resolved },
  { value: "closed",      label: statusLabel.closed },
];

// ─── Color picker ─────────────────────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`h-6 w-6 rounded-full border-2 transition-all ${
              value === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"
            }`}
            style={{ backgroundColor: c }}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-full border shrink-0" style={{ backgroundColor: value }} />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#6366f1"
          className="h-7 text-xs font-mono w-28"
          maxLength={7}
        />
      </div>
    </div>
  );
}

// ─── Status form (create + edit) ──────────────────────────────────────────────

interface StatusFormProps {
  defaultValues?: Partial<StatusFormValues>;
  onSubmit: (values: StatusFormValues) => void;
  isPending: boolean;
  error: Error | null;
  submitLabel: string;
}

function StatusForm({ defaultValues, onSubmit, isPending, error, submitLabel }: StatusFormProps) {
  const form = useForm<StatusFormValues>({
    resolver: zodResolver(statusFormSchema),
    defaultValues: {
      label:         defaultValues?.label         ?? "",
      color:         defaultValues?.color         ?? "#6366f1",
      workflowState: defaultValues?.workflowState ?? "open",
      slaBehavior:   defaultValues?.slaBehavior   ?? "continue",
      position:      defaultValues?.position      ?? 0,
    },
    shouldUnregister: false,
  });

  const color = form.watch("color");

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Label <span className="text-destructive">*</span></Label>
        <Input {...form.register("label")} placeholder="e.g. Waiting for Customer, In Review" />
        {form.formState.errors.label && (
          <ErrorMessage message={form.formState.errors.label.message} />
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Color <span className="text-destructive">*</span></Label>
        <ColorPicker value={color} onChange={(v) => form.setValue("color", v)} />
        {form.formState.errors.color && (
          <ErrorMessage message={form.formState.errors.color.message} />
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Workflow State <span className="text-destructive">*</span></Label>
        <Select
          value={form.watch("workflowState")}
          onValueChange={(v) => form.setValue("workflowState", v as WorkflowState)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WORKFLOW_STATE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground flex items-start gap-1">
          <Info className="h-3 w-3 mt-0.5 shrink-0" />
          Determines how the ticket behaves in SLA and reporting when this status is applied.
        </p>
      </div>

      <div className="space-y-2">
        <Label>SLA Behavior <span className="text-destructive">*</span></Label>
        <div className="grid grid-cols-2 gap-3">
          {(["continue", "on_hold"] as SlaBehavior[]).map((behavior) => {
            const selected = form.watch("slaBehavior") === behavior;
            return (
              <button
                key={behavior}
                type="button"
                onClick={() => form.setValue("slaBehavior", behavior)}
                className={`flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors ${
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  {behavior === "on_hold" ? (
                    <PauseCircle className={`h-4 w-4 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                  ) : (
                    <PlayCircle className={`h-4 w-4 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                  )}
                  <span className={`text-xs font-semibold ${selected ? "text-primary" : ""}`}>
                    {behavior === "on_hold" ? "SLA On Hold" : "SLA Continues"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {behavior === "on_hold"
                    ? "SLA timer pauses while this status is active. Use for awaiting customer or third-party response."
                    : "SLA timer keeps running normally. Use for statuses where agent action is still expected."}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Display Order</Label>
        <Controller
          name="position"
          control={form.control}
          render={({ field }) => (
            <Input
              type="number"
              min={0}
              className="w-24"
              value={field.value}
              onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
            />
          )}
        />
        <p className="text-[11px] text-muted-foreground">Lower numbers appear first in dropdowns.</p>
      </div>

      {error && <ErrorAlert error={error} fallback="Failed to save status" />}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ─── Built-in statuses info panel ─────────────────────────────────────────────

function BuiltInStatusesPanel() {
  const builtIns: { status: string; label: string; note: string }[] = [
    { status: "open",        label: "Open",        note: "Ticket is awaiting agent action." },
    { status: "in_progress", label: "In Progress",  note: "Agent is actively working on the ticket." },
    { status: "resolved",    label: "Resolved",     note: "Solution has been provided." },
    { status: "closed",      label: "Closed",       note: "Ticket is permanently closed." },
  ];

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <CircleAlert className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground">Built-in Statuses</span>
        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">System</Badge>
      </div>
      {builtIns.map((b) => (
        <div key={b.status} className="flex items-center gap-3 py-1">
          <span className="text-xs font-medium w-24">{b.label}</span>
          <span className="text-xs text-muted-foreground">{b.note}</span>
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground mt-2 pt-2 border-t">
        Built-in statuses cannot be edited or deleted. Custom statuses below appear alongside them in agent dropdowns.
      </p>
    </div>
  );
}

// ─── TicketStatusConfigsPage ──────────────────────────────────────────────────

export default function TicketStatusConfigsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TicketStatusConfig | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TicketStatusConfig | null>(null);

  const { data, isLoading, error } = useQuery<{ configs: TicketStatusConfig[] }>({
    queryKey: ["ticket-status-configs"],
    queryFn: async () => {
      const { data } = await axios.get("/api/ticket-status-configs");
      return data;
    },
  });
  const configs = data?.configs ?? [];

  const createMutation = useMutation({
    mutationFn: async (values: StatusFormValues) => {
      const { data } = await axios.post("/api/ticket-status-configs", values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-status-configs"] });
      setCreateOpen(false);
    },
  });

  const editMutation = useMutation({
    mutationFn: async (values: StatusFormValues) => {
      const { data } = await axios.put(`/api/ticket-status-configs/${editTarget!.id}`, values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-status-configs"] });
      setEditTarget(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      axios.put(`/api/ticket-status-configs/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ticket-status-configs"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axios.delete(`/api/ticket-status-configs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-status-configs"] });
      setDeleteTarget(null);
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <CircleDot className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">Ticket Statuses</h1>
        </div>
        <Button
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          New Status
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Create custom statuses to give agents more granular control over ticket states.
        Custom statuses are mapped to a built-in workflow state for SLA and reporting purposes.
      </p>

      <BuiltInStatusesPanel />

      <div className="mt-6">
        <h2 className="text-sm font-semibold mb-3">Custom Statuses</h2>

        {error && <ErrorAlert message="Failed to load statuses" />}

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : configs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <CircleDot className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No custom statuses yet</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Add statuses like "Waiting for Customer" or "Pending Approval" to give agents more context.
            </p>
            <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              New Status
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {configs.map((cfg) => (
              <div
                key={cfg.id}
                className={`flex items-center gap-4 rounded-lg border px-4 py-3 ${
                  !cfg.isActive ? "opacity-60 bg-muted/30" : "bg-background"
                }`}
              >
                {/* Color dot + label */}
                <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{cfg.label}</span>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                      {statusLabel[cfg.workflowState as keyof typeof statusLabel] ?? cfg.workflowState}
                    </Badge>
                    {cfg.slaBehavior === "on_hold" ? (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5 gap-0.5">
                        <PauseCircle className="h-2.5 w-2.5" />
                        SLA paused
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 gap-0.5 text-muted-foreground">
                        <PlayCircle className="h-2.5 w-2.5" />
                        SLA runs
                      </Badge>
                    )}
                    {!cfg.isActive && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Inactive</Badge>
                    )}
                    {cfg._count.tickets > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        {cfg._count.tickets} ticket{cfg._count.tickets !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Position {cfg.position}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => toggleMutation.mutate({ id: cfg.id, isActive: !cfg.isActive })}
                    disabled={toggleMutation.isPending}
                  >
                    {cfg.isActive ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setEditTarget(cfg)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteTarget(cfg)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Ticket Status</DialogTitle>
          </DialogHeader>
          <StatusForm
            onSubmit={(v) => createMutation.mutate(v)}
            isPending={createMutation.isPending}
            error={createMutation.error}
            submitLabel="Create Status"
          />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editTarget !== null} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Status</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <StatusForm
              key={editTarget.id}
              defaultValues={{
                label:         editTarget.label,
                color:         editTarget.color,
                workflowState: editTarget.workflowState,
                slaBehavior:   editTarget.slaBehavior,
                position:      editTarget.position,
              }}
              onSubmit={(v) => editMutation.mutate(v)}
              isPending={editMutation.isPending}
              error={editMutation.error}
              submitLabel="Save Changes"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) { setDeleteTarget(null); deleteMutation.reset(); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete status?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.label}</strong> will be permanently deleted.
              {(deleteTarget?._count.tickets ?? 0) > 0 && (
                <> The {deleteTarget!._count.tickets} ticket{deleteTarget!._count.tickets !== 1 ? "s" : ""} using this status will have their custom status cleared (the ticket remains open).</>
              )}
              {" "}This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.isError && <ErrorAlert message="Failed to delete status" />}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
