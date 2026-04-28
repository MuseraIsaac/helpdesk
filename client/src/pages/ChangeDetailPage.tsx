import { useState, useRef } from "react";
import { useParams, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import type { Change, ChangeState } from "core/constants/change.ts";
import {
  changeStateLabel,
  changeTypeLabel,
  changeTypes,
  changeRiskLabel,
  changeRisks,
  changeModelLabel,
  changePurposeLabel,
  implementationOutcomes,
  implementationOutcomeLabel,
  implementationOutcomeColor,
} from "core/constants/change.ts";
import { ticketPriorities, priorityLabel } from "core/constants/ticket-priority.ts";
import { updateChangeSchema, type UpdateChangeInput } from "core/schemas/changes.ts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import BackLink from "@/components/BackLink";
import ErrorAlert from "@/components/ErrorAlert";
import RichTextRenderer from "@/components/RichTextRenderer";
import ChangeApprovalPanel from "@/components/ChangeApprovalPanel";
import ChangeConflictsTab from "@/components/ChangeConflictsTab";
import ChangeCiLinksPanel from "@/components/ChangeCiLinksPanel";
import AssetLinksPanel from "@/components/AssetLinksPanel";
import ChangeTimeline from "@/components/ChangeTimeline";
import ChangeAttachmentsPanel from "@/components/ChangeAttachmentsPanel";
import SaveAsTemplateDialog from "@/components/SaveAsTemplateDialog";
import WatchButton from "@/components/FollowButton";
import { toast } from "sonner";
import {
  GitMerge,
  User,
  Users,
  Calendar,
  CheckCircle2,
  Circle,
  AlertTriangle,
  ChevronRight,
  FileText,
  Database,
  Activity,
  Shield,
  Server,
  ListChecks,
  ClipboardCheck,
  Clock,
  Save,
  ExternalLink,
  RotateCcw,
  Paperclip,
  Pencil,
  ArrowRight,
  BookmarkPlus,
  ChevronsUpDown,
  Check,
  CalendarClock,
  Bell,
  X,
  Plus,
  Loader2,
  Trash2,
  SkipForward,
  Play,
} from "lucide-react";

// ── SearchableSelect ──────────────────────────────────────────────────────────

interface SearchableSelectOption { value: string; label: string }

interface SearchableSelectProps {
  value: string;
  onValueChange: (v: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
}

function SearchableSelect({
  value, onValueChange, options, placeholder = "Select…",
  disabled, triggerClassName,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const selected = options.find((o) => o.value === value);

  function pick(v: string) {
    onValueChange(v);
    setOpen(false);
    setSearch("");
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-expanded={open}
          className={[
            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2",
            "text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            triggerClassName ?? "",
          ].join(" ")}
        >
          <span className={selected ? "" : "text-muted-foreground"}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-40 shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[180px] p-0" align="start">
        <div className="p-2 border-b">
          <Input
            ref={inputRef}
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-8 text-sm border-0 shadow-none focus-visible:ring-0 bg-transparent px-1"
          />
        </div>
        <div className="max-h-52 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-3">No options found</p>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => pick(opt.value)}
                className={[
                  "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm",
                  "hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors",
                  opt.value === value ? "bg-accent/60 font-medium" : "",
                ].join(" ")}
              >
                {opt.label}
                {opt.value === value && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── State / risk palettes ─────────────────────────────────────────────────────

const STATE_COLOR: Record<string, { pill: string; dot: string; bar: string }> = {
  draft:     { pill: "bg-slate-100   text-slate-600  border-slate-200  dark:bg-slate-800 dark:text-slate-300",  dot: "bg-slate-400",   bar: "bg-slate-400"   },
  submitted: { pill: "bg-blue-50     text-blue-700   border-blue-200   dark:bg-blue-900/40 dark:text-blue-300", dot: "bg-blue-500",    bar: "bg-blue-500"    },
  assess:    { pill: "bg-purple-50   text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300", dot: "bg-purple-500", bar: "bg-purple-500" },
  authorize: { pill: "bg-amber-50    text-amber-700  border-amber-200  dark:bg-amber-900/40 dark:text-amber-300",  dot: "bg-amber-500",   bar: "bg-amber-500"  },
  scheduled: { pill: "bg-cyan-50     text-cyan-700   border-cyan-200   dark:bg-cyan-900/40 dark:text-cyan-300",   dot: "bg-cyan-500",    bar: "bg-cyan-500"   },
  implement: { pill: "bg-orange-50   text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300", dot: "bg-orange-500", bar: "bg-orange-500" },
  review:    { pill: "bg-violet-50   text-violet-700 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300", dot: "bg-violet-500", bar: "bg-violet-500" },
  closed:    { pill: "bg-emerald-50  text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300", dot: "bg-emerald-500", bar: "bg-emerald-500" },
  cancelled: { pill: "bg-muted       text-muted-foreground border-muted-foreground/20", dot: "bg-muted-foreground/40", bar: "bg-muted-foreground/30" },
  failed:    { pill: "bg-red-50      text-red-700    border-red-200    dark:bg-red-900/40 dark:text-red-300",    dot: "bg-red-500",     bar: "bg-red-500"    },
};

const RISK_COLOR: Record<string, string> = {
  low:      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300",
  medium:   "bg-yellow-50  text-yellow-700  border-yellow-200  dark:bg-yellow-900/30 dark:text-yellow-300",
  high:     "bg-orange-50  text-orange-700  border-orange-200  dark:bg-orange-900/30 dark:text-orange-300",
  critical: "bg-red-50     text-red-700     border-red-200     dark:bg-red-900/30 dark:text-red-300",
};

const LIFECYCLE_STATES = [
  "draft", "submitted", "assess", "authorize",
  "scheduled", "implement", "review", "closed",
] as const;

const STATE_TRANSITIONS: Partial<Record<ChangeState, { to: ChangeState; label: string; variant?: "default" | "destructive" | "outline" }[]>> = {
  draft:     [{ to: "submitted",  label: "Submit for Review",     variant: "default" }],
  submitted: [{ to: "assess",     label: "Begin Assessment",      variant: "default" },
              { to: "cancelled",  label: "Cancel",                variant: "outline" }],
  assess:    [{ to: "authorize",  label: "Move to Authorization", variant: "default" },
              { to: "submitted",  label: "Return to Submitted",   variant: "outline" },
              { to: "cancelled",  label: "Cancel",                variant: "outline" }],
  authorize: [{ to: "scheduled",  label: "Schedule",              variant: "default" },
              { to: "cancelled",  label: "Cancel",                variant: "outline" }],
  scheduled: [{ to: "implement",  label: "Start Implementation",  variant: "default" },
              { to: "cancelled",  label: "Cancel",                variant: "outline" }],
  implement: [{ to: "review",     label: "Move to PIR",           variant: "default" },
              { to: "failed",     label: "Mark Failed",           variant: "destructive" }],
  review:    [{ to: "closed",     label: "Close Change",          variant: "default" }],
};

// ── Helper components ─────────────────────────────────────────────────────────

function SectionCard({ icon: Icon, title, children, className = "", actions }: {
  icon?: React.ElementType; title: string; children: React.ReactNode; className?: string; actions?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/20">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">{title}</span>
        </div>
        {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-[11px] text-muted-foreground shrink-0 pt-0.5 min-w-[7rem]">{label}</span>
      <span className="text-sm font-medium text-right leading-snug">{children}</span>
    </div>
  );
}

function EditableSection({
  title, content, field, changeId, onSaved, readonly,
}: {
  title: string;
  content: string | null | undefined;
  field: string;
  changeId: number;
  onSaved: () => void;
  readonly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(content ?? "");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => axios.patch(`/api/changes/${changeId}`, { [field]: value || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["change", String(changeId)] });
      onSaved();
      setEditing(false);
      toast.success("Saved");
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Failed to save"),
  });

  return (
    <SectionCard
      icon={FileText}
      title={title}
      actions={
        !readonly ? (
          editing ? (
            <button
              onClick={() => setEditing(false)}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors"
            >
              <X className="h-3 w-3" /> Cancel
            </button>
          ) : (
            <button
              onClick={() => { setValue(content ?? ""); setEditing(true); }}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
          )
        ) : undefined
      }
    >
      {editing ? (
        <div className="space-y-3">
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={8}
            className="text-sm resize-y font-mono"
            placeholder={`Enter ${title.toLowerCase()}…`}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save
            </Button>
          </div>
        </div>
      ) : content ? (
        <RichTextRenderer content={content} className="text-sm text-foreground/90" />
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground/50 italic">Not recorded yet.</p>
          {!readonly && (
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => { setValue(""); setEditing(true); }}>
              <Plus className="h-3 w-3" /> Add
            </Button>
          )}
        </div>
      )}
    </SectionCard>
  );
}

const TASK_STATUS_CYCLE: Record<string, string> = {
  pending:     "in_progress",
  in_progress: "completed",
  completed:   "pending",
  failed:      "pending",
  skipped:     "pending",
};

const TASK_STATUS_ICON: Record<string, React.ReactNode> = {
  completed:   <CheckCircle2  className="h-4.5 w-4.5 text-emerald-500 shrink-0" />,
  in_progress: <Play          className="h-4 w-4 text-amber-500 fill-amber-500 shrink-0" />,
  failed:      <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />,
  skipped:     <SkipForward   className="h-4 w-4 text-muted-foreground/40 shrink-0" />,
  pending:     <Circle        className="h-4 w-4 text-muted-foreground/25 shrink-0" />,
};

const TASK_PHASE_LABEL: Record<string, string> = {
  pre_implementation:  "Pre",
  implementation:      "Impl",
  post_implementation: "Post",
};

const TASK_STATUS_LABEL: Record<string, string> = {
  pending:     "Pending",
  in_progress: "In Progress",
  completed:   "Completed",
  failed:      "Failed",
  skipped:     "Skipped",
};

// ── Task dialog (add/edit) ────────────────────────────────────────────────────

interface TaskDialogProps {
  changeId: number;
  task?: { id: number; title: string; description?: string | null; phase: string; assignedToId?: string | null };
  defaultPhase?: string;
  agents: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}

function TaskDialog({ changeId, task, defaultPhase, agents, onClose, onSaved }: TaskDialogProps) {
  const [title, setTitle]       = useState(task?.title ?? "");
  const [description, setDesc]  = useState(task?.description ?? "");
  const [phase, setPhase]       = useState(task?.phase ?? defaultPhase ?? "implementation");
  const [assignedToId, setAgt]  = useState(task?.assignedToId ?? "");
  const [open, setOpen]         = useState(false);
  const [search, setSearch]     = useState("");
  const qc = useQueryClient();

  const filtered = agents.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));

  const mutation = useMutation({
    mutationFn: () =>
      task
        ? axios.patch(`/api/changes/${changeId}/tasks/${task.id}`, { title, description: description || null, phase, assignedToId: assignedToId || null })
        : axios.post(`/api/changes/${changeId}/tasks`, { title, description: description || undefined, phase, assignedToId: assignedToId || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["change", String(changeId)] });
      onSaved();
      onClose();
      toast.success(task ? "Task updated" : "Task added");
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Failed"),
  });

  const selectedAgent = agents.find((a) => a.id === assignedToId);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <ListChecks className="h-4 w-4 text-primary" />
            </div>
            {task ? "Edit Task" : "Add Task"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Title <span className="text-destructive">*</span></Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Describe the task…"
              className="text-sm"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Optional details or acceptance criteria…"
              className="text-sm resize-none"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Phase</Label>
              <div className="flex flex-col gap-1">
                {(["pre_implementation", "implementation", "post_implementation"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPhase(p)}
                    className={[
                      "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs text-left transition-colors",
                      phase === p ? "border-primary bg-primary/8 text-primary font-medium" : "border-input hover:border-muted-foreground/30",
                    ].join(" ")}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${p === "pre_implementation" ? "bg-blue-500" : p === "implementation" ? "bg-amber-500" : "bg-emerald-500"}`} />
                    {p === "pre_implementation" ? "Pre-Implementation" : p === "implementation" ? "Implementation" : "Post-Implementation"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Assignee</Label>
              <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
                <PopoverTrigger asChild>
                  <button className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm shadow-sm hover:bg-accent/50 transition-colors">
                    <span className={selectedAgent ? "" : "text-muted-foreground"}>
                      {selectedAgent ? selectedAgent.name : "Unassigned"}
                    </span>
                    <ChevronsUpDown className="h-3.5 w-3.5 opacity-40 ml-2 shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-0" align="start">
                  <div className="p-2 border-b">
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="h-7 text-xs border-0 shadow-none focus-visible:ring-0 bg-transparent px-1" autoFocus />
                  </div>
                  <div className="max-h-40 overflow-y-auto p-1">
                    <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent cursor-pointer" onClick={() => { setAgt(""); setOpen(false); }}>
                      <span className="text-muted-foreground">Unassigned</span>
                    </button>
                    {filtered.map((a) => (
                      <button key={a.id} onClick={() => { setAgt(a.id); setOpen(false); setSearch(""); }}
                        className={["flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent cursor-pointer", a.id === assignedToId ? "bg-accent/60 font-medium" : ""].join(" ")}>
                        {a.name}
                        {a.id === assignedToId && <Check className="h-3 w-3 text-primary shrink-0" />}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="gap-1.5" onClick={() => mutation.mutate()} disabled={!title.trim() || mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {task ? "Save changes" : "Add task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Task row ──────────────────────────────────────────────────────────────────

function TaskRow({
  task, changeId, onSaved, readonly, agents,
}: {
  task: { id: number; title: string; description?: string | null; phase: string; status: string; assignedTo?: { id: string; name: string } | null; assignedToId?: string | null; completionNote?: string | null; completedBy?: { name: string } | null };
  changeId: number;
  onSaved: () => void;
  readonly?: boolean;
  agents: { id: string; name: string }[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const note = task.completionNote ?? "";
  const qc = useQueryClient();

  const statusMutation = useMutation({
    mutationFn: (status: string) => {
      const isCompleting = status === "completed";
      return axios.patch(`/api/changes/${changeId}/tasks/${task.id}`, {
        status,
        ...(isCompleting && note ? { completionNote: note } : {}),
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["change", String(changeId)] }); onSaved(); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => axios.delete(`/api/changes/${changeId}/tasks/${task.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["change", String(changeId)] }); onSaved(); toast.success("Task removed"); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Failed"),
  });

  const nextStatus = TASK_STATUS_CYCLE[task.status] ?? "in_progress";

  return (
    <>
      {editOpen && (
        <TaskDialog changeId={changeId} task={{ id: task.id, title: task.title, description: task.description, phase: task.phase, assignedToId: task.assignedToId }} agents={agents} onClose={() => setEditOpen(false)} onSaved={onSaved} />
      )}
      <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0 group/row">
        <button
          className="shrink-0 mt-0.5 hover:scale-110 transition-transform disabled:opacity-50"
          onClick={() => !readonly && statusMutation.mutate(nextStatus)}
          disabled={readonly || statusMutation.isPending}
          title={`Mark as ${TASK_STATUS_LABEL[nextStatus]}`}
        >
          {statusMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : TASK_STATUS_ICON[task.status]}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={["text-sm font-medium", task.status === "completed" ? "line-through text-muted-foreground" : ""].join(" ")}>
              {task.title}
            </span>
            <span className={[
              "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
              task.phase === "pre_implementation"  ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200/50" :
              task.phase === "post_implementation" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200/50" :
                                                     "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200/50",
            ].join(" ")}>
              {TASK_PHASE_LABEL[task.phase] ?? task.phase}
            </span>
          </div>
          {task.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
          )}
          <div className="flex items-center gap-3 mt-1">
            {task.assignedTo && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" /> {task.assignedTo.name}
              </p>
            )}
            {task.completionNote && (
              <p className="text-[11px] text-muted-foreground/70 italic">"{task.completionNote}"</p>
            )}
          </div>
        </div>

        {!readonly && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/70 hover:text-destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
function fmtShort(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

// ── Lifecycle stepper ─────────────────────────────────────────────────────────

function LifecycleBar({ currentState }: { currentState: string }) {
  const isFailed    = currentState === "failed";
  const isCancelled = currentState === "cancelled";
  const isOffPath   = isFailed || isCancelled;
  const currentIdx  = LIFECYCLE_STATES.indexOf(currentState as typeof LIFECYCLE_STATES[number]);
  const palette     = STATE_COLOR[currentState] ?? STATE_COLOR.draft;

  return (
    <div className="border-b bg-background px-6 py-3 shrink-0">
      <div className="flex items-center gap-0 overflow-x-auto scrollbar-hide">
        {LIFECYCLE_STATES.map((state, idx) => {
          const isDone    = !isOffPath && idx < currentIdx;
          const isCurrent = !isOffPath && state === currentState;
          const sc        = STATE_COLOR[state] ?? STATE_COLOR.draft;

          return (
            <div key={state} className="flex items-center shrink-0">
              {idx > 0 && (
                <div className={`h-0.5 w-6 shrink-0 transition-colors ${isDone ? "bg-primary/50" : "bg-border"}`} />
              )}
              <div className={[
                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all",
                isCurrent ? `${sc.pill} border shadow-sm` : "",
                isDone    ? "text-muted-foreground" : "",
                !isCurrent && !isDone ? "text-muted-foreground/40" : "",
              ].join(" ")}>
                {isDone ? (
                  <CheckCircle2 className="h-3 w-3 text-primary/60 shrink-0" />
                ) : (
                  <span className={`h-2 w-2 rounded-full shrink-0 ${isCurrent ? sc.dot : "bg-border"}`} />
                )}
                {changeStateLabel[state]}
              </div>
            </div>
          );
        })}

        {isOffPath && (
          <>
            <div className="h-0.5 w-6 bg-border shrink-0" />
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border shadow-sm ${palette.pill}`}>
              <span className={`h-2 w-2 rounded-full shrink-0 ${palette.dot}`} />
              {changeStateLabel[currentState as keyof typeof changeStateLabel] ?? currentState}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Edit change dialog ────────────────────────────────────────────────────────

const CHANGE_TYPE_OPTIONS = changeTypes.map((t) => ({ value: t, label: changeTypeLabel[t] }));
const CHANGE_RISK_OPTIONS = changeRisks.map((r) => ({ value: r, label: changeRiskLabel[r] }));
const PRIORITY_OPTIONS = ticketPriorities.map((p) => ({ value: p, label: priorityLabel[p] }));
const OUTCOME_OPTIONS = implementationOutcomes.map((o) => ({ value: o, label: implementationOutcomeLabel[o] }));

interface EditChangeDialogProps {
  changeId: number;
  change: Change;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function toLocalDT(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EditChangeDialog({ changeId, change, open, onOpenChange, onSaved }: EditChangeDialogProps) {
  // ── Plain state — no Zod on optional fields to avoid silent validation failures ──
  const [title,              setTitle]         = useState(change.title);
  const [changeType,         setChangeType]    = useState(change.changeType ?? "normal");
  const [risk,               setRisk]          = useState(change.risk ?? "medium");
  const [priority,           setPriority]      = useState(change.priority ?? "medium");
  const [description,        setDescription]   = useState(change.description ?? "");
  const [assignedToId,       setAssignedToId]  = useState((change as any).assignedTo?.id ?? "");
  const [coordGroupId,       setCoordGroupId]  = useState(
    (change as any).coordinatorGroup?.id ? String((change as any).coordinatorGroup.id) : ""
  );
  const [plannedStart,       setPlannedStart]  = useState(toLocalDT(change.plannedStart));
  const [plannedEnd,         setPlannedEnd]    = useState(toLocalDT(change.plannedEnd));
  const [saveError,          setSaveError]     = useState<string | null>(null);
  const [saving,             setSaving]        = useState(false);
  const [activeTab,          setActiveTab]     = useState("details");
  const [titleError,         setTitleError]    = useState("");

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: { id: string; name: string }[] }>("/api/agents");
      return data.agents;
    },
    enabled: open,
  });

  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data } = await axios.get<{ teams: { id: number; name: string }[] }>("/api/teams");
      return data.teams;
    },
    enabled: open,
  });

  const agentOptions = (agentsData ?? []).map((a) => ({ value: a.id, label: a.name }));
  const teamOptions  = (teamsData  ?? []).map((t) => ({ value: String(t.id), label: t.name }));

  function handleClose() {
    onOpenChange(false);
    setActiveTab("details");
    setSaveError(null);
    setTitleError("");
  }

  async function handleSave() {
    if (!title.trim()) { setTitleError("Title is required"); setActiveTab("details"); return; }
    setTitleError("");
    setSaveError(null);
    setSaving(true);
    try {
      await axios.patch(`/api/changes/${changeId}`, {
        title:              title.trim(),
        changeType,
        risk,
        priority,
        description:        description || null,
        assignedToId:       assignedToId || null,
        coordinatorGroupId: coordGroupId ? Number(coordGroupId) : null,
        plannedStart:       plannedStart ? new Date(plannedStart).toISOString() : null,
        plannedEnd:         plannedEnd   ? new Date(plannedEnd).toISOString()   : null,
      });
      onSaved();
      handleClose();
      toast.success("Change updated");
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setSaveError(err.response?.data?.error ?? "Failed to save changes");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Pencil className="h-4 w-4 text-primary" />
            </div>
            Edit Change Request
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-0 mt-1">
          {saveError && <ErrorAlert message={saveError} />}

          {/* Inner tab navigation */}
          <div className="flex gap-1 border-b mb-4">
            {[
              { id: "details",    label: "Details" },
              { id: "assignment", label: "Assignment & Schedule" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={[
                  "px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
                  activeTab === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === "details" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Title <span className="text-destructive">*</span></Label>
                <Input
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); if (e.target.value.trim()) setTitleError(""); }}
                  className="text-sm"
                  autoFocus
                />
                {titleError && <p className="text-xs text-destructive">{titleError}</p>}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Change Type</Label>
                  <SearchableSelect value={changeType} onValueChange={(v) => setChangeType(v as typeof changeType)} options={CHANGE_TYPE_OPTIONS} placeholder="Type…" triggerClassName="h-8 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Risk Level</Label>
                  <SearchableSelect value={risk} onValueChange={(v) => setRisk(v as typeof risk)} options={CHANGE_RISK_OPTIONS} placeholder="Risk…" triggerClassName="h-8 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Priority</Label>
                  <SearchableSelect value={priority} onValueChange={(v) => setPriority(v as typeof priority)} options={PRIORITY_OPTIONS} placeholder="Priority…" triggerClassName="h-8 text-xs" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="High-level description of the change…"
                  className="text-sm min-h-[90px] resize-y"
                />
              </div>
            </div>
          )}

          {activeTab === "assignment" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Assigned to</Label>
                  <SearchableSelect
                    value={assignedToId}
                    onValueChange={setAssignedToId}
                    options={[{ value: "", label: "Unassigned" }, ...agentOptions]}
                    placeholder="Agent…"
                    triggerClassName="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Coordinator group</Label>
                  <SearchableSelect
                    value={coordGroupId}
                    onValueChange={setCoordGroupId}
                    options={[{ value: "", label: "None" }, ...teamOptions]}
                    placeholder="Team…"
                    triggerClassName="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium">Planned change window</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground">Start</p>
                    <Input
                      type="datetime-local"
                      value={plannedStart}
                      onChange={(e) => setPlannedStart(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground">End</p>
                    <Input
                      type="datetime-local"
                      value={plannedEnd}
                      onChange={(e) => setPlannedEnd(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">Set the planned maintenance window for this change.</p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 pt-4">
            <Button type="button" variant="outline" size="sm" onClick={handleClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
              {saving
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</>
                : <><Save className="h-3.5 w-3.5" />Save Changes</>
              }
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Notifications form ────────────────────────────────────────────────────────

interface NotificationsFormProps {
  changeId: number;
  change: Change;
  onSaved: () => void;
  readonly: boolean;
}

function NotificationsForm({ changeId, change, onSaved, readonly }: NotificationsFormProps) {
  const { register, handleSubmit, control, formState: { isDirty, isSubmitting } } =
    useForm<UpdateChangeInput>({
      resolver: zodResolver(updateChangeSchema),
      defaultValues: {
        notificationRequired: change.notificationRequired ?? false,
        impactedUsers:        change.impactedUsers        ?? "",
        communicationNotes:   change.communicationNotes   ?? "",
      },
    });

  const [saveError, setSaveError] = useState<string | null>(null);

  const onSubmit = async (data: UpdateChangeInput) => {
    setSaveError(null);
    try {
      await axios.patch(`/api/changes/${changeId}`, {
        notificationRequired: data.notificationRequired ?? false,
        impactedUsers:        data.impactedUsers   || null,
        communicationNotes:   data.communicationNotes || null,
      });
      onSaved();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setSaveError(err.response?.data?.error ?? "Failed to save");
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {saveError && <ErrorAlert message={saveError} />}

      <SectionCard icon={Bell} title="Stakeholder Notification">
        <div className="flex items-center gap-3">
          <Controller name="notificationRequired" control={control}
            render={({ field }) => (
              <Switch checked={field.value ?? false} onCheckedChange={field.onChange} disabled={readonly} />
            )}
          />
          <span className="text-sm text-muted-foreground">
            Notification required for impacted customers / users
          </span>
        </div>
      </SectionCard>

      <SectionCard icon={Users} title="Impacted Users / Customers">
        <Textarea
          {...register("impactedUsers")}
          placeholder="List the impacted customers, user groups, or departments that need to be notified…"
          className="text-sm min-h-[80px] resize-y"
          disabled={readonly}
        />
      </SectionCard>

      <SectionCard icon={FileText} title="Communication Notes">
        <Textarea
          {...register("communicationNotes")}
          placeholder="Record what was communicated, to whom, through which channel, and when…"
          className="text-sm min-h-[120px] resize-y"
          disabled={readonly}
        />
      </SectionCard>

      {!readonly && (
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={!isDirty || isSubmitting} className="gap-1.5">
            {isSubmitting ? "Saving…" : <><Save className="h-3.5 w-3.5" />Save notification info</>}
          </Button>
        </div>
      )}
    </form>
  );
}

// ── Closure form ──────────────────────────────────────────────────────────────

const CLOSURE_ELIGIBLE = new Set(["implement", "review", "closed", "failed", "cancelled"]);

interface ClosureFormProps {
  changeId: number;
  change: Change;
  onSaved: () => void;
}

function ClosureForm({ changeId, change, onSaved }: ClosureFormProps) {
  const isReadonly = change.state === "closed" || change.state === "cancelled";

  const { register, handleSubmit, control, formState: { isDirty, isSubmitting } } =
    useForm<UpdateChangeInput>({
      resolver: zodResolver(updateChangeSchema),
      defaultValues: {
        implementationOutcome: change.implementationOutcome ?? undefined,
        rollbackUsed:   change.rollbackUsed   ?? false,
        closureCode:    change.closureCode    ?? "",
        closureNotes:   change.closureNotes   ?? "",
        reviewSummary:  change.reviewSummary  ?? "",
        lessonsLearned: change.lessonsLearned ?? "",
      },
    });

  const [saveError, setSaveError] = useState<string | null>(null);

  const onSubmit = async (data: UpdateChangeInput) => {
    setSaveError(null);
    try {
      await axios.patch(`/api/changes/${changeId}`, {
        implementationOutcome: data.implementationOutcome ?? null,
        rollbackUsed:   data.rollbackUsed ?? null,
        closureCode:    data.closureCode    || null,
        closureNotes:   data.closureNotes   || null,
        reviewSummary:  data.reviewSummary  || null,
        lessonsLearned: data.lessonsLearned || null,
      });
      onSaved();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setSaveError(err.response?.data?.error ?? "Failed to save closure information");
      }
    }
  };

  if (!CLOSURE_ELIGIBLE.has(change.state)) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center">
          <Clock className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="font-medium text-foreground">Closure not yet available</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Closure information is recorded once the change reaches the Implementation or Review stage.
          Current state: <strong>{changeStateLabel[change.state] ?? change.state}</strong>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {saveError && <ErrorAlert message={saveError} />}

      <SectionCard icon={ClipboardCheck} title="Implementation Outcome">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Outcome</Label>
            <Controller name="implementationOutcome" control={control}
              render={({ field }) => (
                <SearchableSelect
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || null)}
                  options={OUTCOME_OPTIONS}
                  placeholder="Select outcome…"
                  disabled={isReadonly}
                />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Rollback Executed</Label>
            <div className="flex items-center gap-2 h-9">
              <Controller name="rollbackUsed" control={control}
                render={({ field }) => (
                  <Switch checked={field.value ?? false} onCheckedChange={field.onChange} disabled={isReadonly} />
                )}
              />
              <span className="text-sm text-muted-foreground">
                {change.rollbackUsed ? "Yes — rollback was used" : "No rollback required"}
              </span>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={FileText} title="Closure Code">
        <Input
          {...register("closureCode")}
          placeholder="e.g. SUCC, FAIL, ORG-001"
          className="text-sm max-w-xs"
          disabled={isReadonly}
        />
        <p className="text-[11px] text-muted-foreground mt-2">
          Short closure code or status label used by your organisation.
        </p>
      </SectionCard>

      <SectionCard icon={FileText} title="Closure Notes">
        <Textarea
          {...register("closureNotes")}
          placeholder="Describe what occurred during implementation, any deviations from the plan, and how the change was completed or terminated…"
          className="text-sm min-h-[100px] resize-y"
          disabled={isReadonly}
        />
      </SectionCard>

      <SectionCard icon={Shield} title="Post-Implementation Review">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Review Summary</Label>
            <Textarea
              {...register("reviewSummary")}
              placeholder="Summarise the post-implementation review — what went well, what didn't…"
              className="text-sm min-h-[90px] resize-y"
              disabled={isReadonly}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Lessons Learned</Label>
            <Textarea
              {...register("lessonsLearned")}
              placeholder="Document process improvements, knowledge gaps identified, and recommendations…"
              className="text-sm min-h-[90px] resize-y"
              disabled={isReadonly}
            />
          </div>
        </div>
      </SectionCard>

      {!isReadonly ? (
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={!isDirty || isSubmitting} className="gap-1.5">
            {isSubmitting ? "Saving…" : <><Save className="h-3.5 w-3.5" />Save closure information</>}
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          Closure information is locked. Change is in <strong>{changeStateLabel[change.state]}</strong> state.
        </div>
      )}
    </form>
  );
}

// ── ChangeDetailPage ──────────────────────────────────────────────────────────

export default function ChangeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const changeId = parseInt(id ?? "", 10);
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [templateDialog, setTemplateDialog] = useState(false);
  const [taskDialog, setTaskDialog] = useState<{ open: boolean; task?: any; defaultPhase?: string }>({ open: false });

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: { id: string; name: string }[] }>("/api/agents");
      return data.agents;
    },
  });
  const agents = agentsData ?? [];

  const { data: change, isLoading, error } = useQuery({
    queryKey: ["change", String(changeId)],
    queryFn: async () => {
      const { data } = await axios.get<Change>(`/api/changes/${changeId}`);
      return data;
    },
    enabled: !isNaN(changeId),
  });

  const invalidateChange = () => {
    void queryClient.invalidateQueries({ queryKey: ["change", String(changeId)] });
  };

  const transitionMutation = useMutation({
    mutationFn: async (newState: ChangeState) => {
      await axios.patch(`/api/changes/${changeId}`, { state: newState });
    },
    onSuccess: invalidateChange,
  });

  if (isNaN(changeId)) return <div className="p-6"><ErrorAlert message="Invalid change ID" /></div>;

  const isClosed = change?.state === "closed" || change?.state === "cancelled" || change?.state === "failed";
  const palette  = STATE_COLOR[change?.state ?? "draft"] ?? STATE_COLOR.draft;

  return (
    <div className="flex flex-col h-full bg-muted/20">

      {/* ── Header ── */}
      <div className="border-b bg-background shadow-sm shrink-0">
        <div className="px-6 pt-3 pb-0">
          <BackLink to="/changes">All Changes</BackLink>
        </div>

        {isLoading && (
          <div className="px-6 py-4 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-96" />
            <Skeleton className="h-4 w-48" />
          </div>
        )}
        {error && <div className="px-6 py-3"><ErrorAlert error={error} fallback="Failed to load change" /></div>}

        {change && (
          <div className="px-6 py-4">
            {/* Top row: number + type breadcrumb + action buttons */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-muted-foreground">
                  <GitMerge className="h-3 w-3" />
                  {change.changeNumber}
                </span>
                <span className="text-muted-foreground/40 text-xs">·</span>
                <span className="text-xs text-muted-foreground">{changeTypeLabel[change.changeType] ?? change.changeType}</span>
                {change.categorizationTier1 && (
                  <>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
                    <span className="text-xs text-muted-foreground">{change.categorizationTier1}</span>
                  </>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                <WatchButton entityPath="changes" entityId={change.id} />
                <Button type="button" variant="outline" size="sm" className="gap-1.5 h-8"
                  onClick={() => setTemplateDialog(true)}>
                  <BookmarkPlus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Save as Template</span>
                </Button>
                {!isClosed && (
                  <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setEditOpen(true)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                )}
                {!isClosed && STATE_TRANSITIONS[change.state]?.map((t) => (
                  <Button
                    key={t.to}
                    size="sm"
                    variant={t.variant ?? "outline"}
                    className="h-8 gap-1.5"
                    disabled={transitionMutation.isPending}
                    onClick={() => transitionMutation.mutate(t.to)}
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Title */}
            <h1 className="mt-2 text-xl font-semibold leading-snug text-foreground">
              {change.title}
            </h1>

            {/* Status chips row */}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${palette.pill}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${palette.dot}`} />
                {changeStateLabel[change.state] ?? change.state}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${RISK_COLOR[change.risk] ?? ""}`}>
                <Shield className="h-3 w-3" />
                {changeRiskLabel[change.risk] ?? change.risk} Risk
              </span>
              {change.priority && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1 text-[11px] font-medium bg-muted/50 text-muted-foreground capitalize">
                  {priorityLabel[change.priority as keyof typeof priorityLabel] ?? change.priority} Priority
                </span>
              )}
              {change.implementationOutcome && (
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${implementationOutcomeColor[change.implementationOutcome]}`}>
                  {implementationOutcomeLabel[change.implementationOutcome]}
                </span>
              )}
              {change.assignedTo && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1 text-[11px] text-muted-foreground bg-muted/30">
                  <User className="h-3 w-3" />
                  {change.assignedTo.name}
                </span>
              )}
              {(change.plannedStart || change.plannedEnd) && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1 text-[11px] text-muted-foreground bg-muted/30">
                  <CalendarClock className="h-3 w-3" />
                  {fmtShort(change.plannedStart)} → {fmtShort(change.plannedEnd)}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Transition error ── */}
      {transitionMutation.isError && (
        <div className="px-6 pt-3">
          <ErrorAlert error={transitionMutation.error} fallback="State transition failed" />
        </div>
      )}

      {/* ── Lifecycle bar ── */}
      {change && <LifecycleBar currentState={change.state} />}

      {/* ── Body ── */}
      {change && (
        <div className="flex flex-1 overflow-hidden">

          {/* ── Main (tabbed) ── */}
          <div className="flex-1 overflow-y-auto">
            <Tabs defaultValue="overview" className="flex flex-col h-full">

              {/* Tab strip */}
              <div className="border-b px-6 bg-background shrink-0">
                <TabsList className="h-auto bg-transparent p-0 gap-0 rounded-none">
                  {[
                    { value: "overview",      label: "Overview",      icon: FileText },
                    { value: "planning",      label: "Planning",      icon: Shield },
                    { value: "tasks",         label: "Tasks",         icon: ListChecks,    badge: change.tasks?.length ?? 0 },
                    { value: "notifications", label: "Notifications", icon: Bell },
                    { value: "attachments",   label: "Attachments",   icon: Paperclip },
                    { value: "closure",       label: "Closure",       icon: ClipboardCheck },
                    { value: "conflicts",     label: "Conflicts",     icon: AlertTriangle },
                    { value: "history",       label: "History",       icon: Activity },
                  ].map(({ value, label, icon: Icon, badge }) => (
                    <TabsTrigger
                      key={value}
                      value={value}
                      className="flex items-center gap-1.5 px-3 py-3 text-[12px] font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground transition-colors"
                    >
                      <Icon className="h-3 w-3" />
                      {label}
                      {badge !== undefined && badge > 0 && (
                        <span className="ml-0.5 rounded-full bg-primary/10 text-primary px-1.5 text-[10px] font-semibold">
                          {badge}
                        </span>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              {/* ── Overview ── */}
              <TabsContent value="overview" className="flex-1 overflow-y-auto p-6 space-y-4 mt-0">
                {change.description && (
                  <SectionCard icon={FileText} title="Summary / Description">
                    <RichTextRenderer content={change.description} className="text-sm text-foreground/90" />
                  </SectionCard>
                )}

                <SectionCard icon={GitMerge} title="Classification">
                  <div className="space-y-0">
                    <InfoRow label="Change #">
                      <span className="font-mono text-xs">{change.changeNumber}</span>
                    </InfoRow>
                    {change.changeModel && (
                      <InfoRow label="Model">{changeModelLabel[change.changeModel] ?? change.changeModel}</InfoRow>
                    )}
                    {change.changePurpose && (
                      <InfoRow label="Purpose">{changePurposeLabel[change.changePurpose] ?? change.changePurpose}</InfoRow>
                    )}
                    <InfoRow label="Priority">
                      <span className="capitalize">{priorityLabel[change.priority as keyof typeof priorityLabel] ?? change.priority}</span>
                    </InfoRow>
                    {change.categorizationTier1 && (
                      <InfoRow label="Category">
                        <span>
                          {change.categorizationTier1}
                          {change.categorizationTier2 && <span className="text-muted-foreground"> › {change.categorizationTier2}</span>}
                          {change.categorizationTier3 && <span className="text-muted-foreground"> › {change.categorizationTier3}</span>}
                        </span>
                      </InfoRow>
                    )}
                    {change.serviceName && (
                      <InfoRow label="Service">
                        {change.service ? change.service.name : (
                          <span className="text-muted-foreground">{change.serviceName}</span>
                        )}
                      </InfoRow>
                    )}
                    {change.linkedProblem && (
                      <InfoRow label="Problem">
                        <Link to={`/problems/${change.linkedProblem.id}`}
                          className="inline-flex items-center gap-1 text-primary hover:underline text-xs">
                          {change.linkedProblem.problemNumber} · {change.linkedProblem.title}
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </Link>
                      </InfoRow>
                    )}
                  </div>
                </SectionCard>

                <SectionCard icon={CalendarClock} title="Schedule">
                  <div className="space-y-0">
                    <InfoRow label="Planned window">
                      {change.plannedStart || change.plannedEnd ? (
                        <span className="flex items-center gap-1.5 text-xs">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          {fmtShort(change.plannedStart)} → {fmtShort(change.plannedEnd)}
                        </span>
                      ) : <span className="text-muted-foreground/50 text-xs">Not scheduled</span>}
                    </InfoRow>
                    {(change.actualStart || change.actualEnd) && (
                      <InfoRow label="Actual window">
                        <span className="flex items-center gap-1.5 text-xs">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          {fmtShort(change.actualStart)} → {fmtShort(change.actualEnd)}
                        </span>
                      </InfoRow>
                    )}
                    <InfoRow label="Created"><span className="text-xs">{fmt(change.createdAt)}</span></InfoRow>
                    {change.submittedAt && <InfoRow label="Submitted"><span className="text-xs">{fmt(change.submittedAt)}</span></InfoRow>}
                    {change.approvedAt  && <InfoRow label="Approved"><span className="text-xs">{fmt(change.approvedAt)}</span></InfoRow>}
                    {change.closedAt    && <InfoRow label="Closed"><span className="text-xs">{fmt(change.closedAt)}</span></InfoRow>}
                  </div>
                </SectionCard>

                {change.justification && (
                  <SectionCard icon={FileText} title="Justification">
                    <RichTextRenderer content={change.justification} className="text-sm text-foreground/90" />
                  </SectionCard>
                )}

                {(change.notificationRequired != null || change.impactedUsers || change.communicationNotes) && (
                  <SectionCard icon={Bell} title="Notification & Communication">
                    <div className="space-y-0">
                      {change.notificationRequired != null && (
                        <InfoRow label="Notification">
                          {change.notificationRequired ? (
                            <span className="inline-flex items-center gap-1 text-amber-700 font-medium text-xs">Required</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">Not required</span>
                          )}
                        </InfoRow>
                      )}
                      {change.impactedUsers && (
                        <InfoRow label="Impacted users"><span className="text-xs">{change.impactedUsers}</span></InfoRow>
                      )}
                    </div>
                    {change.communicationNotes && (
                      <div className="mt-3 pt-3 border-t border-border/40">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Communication notes</p>
                        <p className="text-sm whitespace-pre-wrap">{change.communicationNotes}</p>
                      </div>
                    )}
                  </SectionCard>
                )}
              </TabsContent>

              {/* ── Planning ── */}
              <TabsContent value="planning" className="flex-1 overflow-y-auto p-6 space-y-4 mt-0">
                {!isClosed && (
                  <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
                    <Pencil className="h-3 w-3 shrink-0" />
                    Click <strong>Edit</strong> on any section below to update planning documents inline.
                  </div>
                )}
                <EditableSection title="Justification"              content={change.justification}             field="justification"             changeId={changeId} onSaved={invalidateChange} readonly={isClosed} />
                <EditableSection title="Work Instructions"           content={change.workInstructions}          field="workInstructions"          changeId={changeId} onSaved={invalidateChange} readonly={isClosed} />
                <EditableSection title="Service Impact Assessment"   content={change.serviceImpactAssessment}   field="serviceImpactAssessment"   changeId={changeId} onSaved={invalidateChange} readonly={isClosed} />
                <EditableSection title="Risk Assessment & Mitigation" content={change.riskAssessmentAndMitigation} field="riskAssessmentAndMitigation" changeId={changeId} onSaved={invalidateChange} readonly={isClosed} />
                <EditableSection title="Rollback Plan"               content={change.rollbackPlan}              field="rollbackPlan"              changeId={changeId} onSaved={invalidateChange} readonly={isClosed} />
              </TabsContent>

              {/* ── Notifications ── */}
              <TabsContent value="notifications" className="flex-1 overflow-y-auto p-6 mt-0">
                <NotificationsForm changeId={changeId} change={change} onSaved={invalidateChange} readonly={isClosed ?? false} />
              </TabsContent>

              {/* ── Tasks ── */}
              <TabsContent value="tasks" className="flex-1 overflow-y-auto p-6 space-y-4 mt-0">
                {taskDialog.open && (
                  <TaskDialog
                    changeId={changeId}
                    task={taskDialog.task}
                    defaultPhase={taskDialog.defaultPhase}
                    agents={agents}
                    onClose={() => setTaskDialog({ open: false })}
                    onSaved={invalidateChange}
                  />
                )}

                {(() => {
                  const allTasks = change.tasks ?? [];
                  const byPhase = {
                    pre_implementation:  allTasks.filter((t) => t.phase === "pre_implementation"),
                    implementation:      allTasks.filter((t) => t.phase === "implementation"),
                    post_implementation: allTasks.filter((t) => t.phase === "post_implementation"),
                  };

                  const PHASE_CONFIG = [
                    {
                      phase: "pre_implementation" as const,
                      title: "Pre-Implementation Tasks",
                      dot: "bg-blue-500",
                      checksField: "prechecks" as const,
                      checksTitle: "Pre-Implementation Checks",
                    },
                    {
                      phase: "implementation" as const,
                      title: "Implementation Tasks",
                      dot: "bg-amber-500",
                      checksField: null,
                      checksTitle: null,
                    },
                    {
                      phase: "post_implementation" as const,
                      title: "Post-Implementation Tasks",
                      dot: "bg-emerald-500",
                      checksField: "postchecks" as const,
                      checksTitle: "Post-Implementation Checks",
                    },
                  ] as const;

                  return (
                    <>
                      {PHASE_CONFIG.map(({ phase, title, dot, checksField, checksTitle }) => {
                        const phaseTasks = byPhase[phase];
                        return (
                          <div key={phase} className="space-y-3">
                            {/* Phase header */}
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full shrink-0 ${dot}`} />
                              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                                {title}
                              </span>
                              {phaseTasks.length > 0 && (
                                <span className="text-[10px] bg-muted text-muted-foreground px-1.5 rounded-full">{phaseTasks.length}</span>
                              )}
                            </div>

                            {/* Checklist notes for pre/post */}
                            {checksField && (
                              <EditableSection
                                title={checksTitle!}
                                content={(change as any)[checksField]}
                                field={checksField}
                                changeId={changeId}
                                onSaved={invalidateChange}
                                readonly={isClosed}
                              />
                            )}

                            {/* Tasks card */}
                            <SectionCard
                              icon={ListChecks}
                              title={`${phaseTasks.length} task${phaseTasks.length !== 1 ? "s" : ""}`}
                              actions={
                                !isClosed ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs gap-1 px-2"
                                    onClick={() => setTaskDialog({ open: true, task: undefined, defaultPhase: phase })}
                                  >
                                    <Plus className="h-3 w-3" /> Add
                                  </Button>
                                ) : undefined
                              }
                            >
                              {phaseTasks.length > 0 ? (
                                <div className="space-y-0 divide-y divide-border/50">
                                  {phaseTasks.map((task) => (
                                    <TaskRow
                                      key={task.id}
                                      task={task}
                                      changeId={changeId}
                                      onSaved={invalidateChange}
                                      readonly={isClosed}
                                      agents={agents}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <div className="flex items-center justify-between py-2">
                                  <p className="text-xs text-muted-foreground/50 italic">No tasks for this phase yet.</p>
                                  {!isClosed && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs gap-1 px-2 text-muted-foreground"
                                      onClick={() => setTaskDialog({ open: true, task: undefined, defaultPhase: phase })}
                                    >
                                      <Plus className="h-3 w-3" /> Add task
                                    </Button>
                                  )}
                                </div>
                              )}
                            </SectionCard>
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
              </TabsContent>

              {/* ── Attachments ── */}
              <TabsContent value="attachments" className="flex-1 overflow-y-auto p-6 mt-0">
                <ChangeAttachmentsPanel changeId={changeId} readonly={isClosed} />
              </TabsContent>

              {/* ── Closure ── */}
              <TabsContent value="closure" className="flex-1 overflow-y-auto p-6 mt-0">
                <ClosureForm changeId={changeId} change={change} onSaved={invalidateChange} />
              </TabsContent>

              {/* ── Conflicts ── */}
              <TabsContent value="conflicts" className="flex-1 overflow-y-auto p-6 mt-0">
                <ChangeConflictsTab changeId={changeId} />
              </TabsContent>

              {/* ── History ── */}
              <TabsContent value="history" className="flex-1 overflow-y-auto p-6 mt-0">
                <ChangeTimeline events={change.events ?? []} />
              </TabsContent>
            </Tabs>
          </div>

          {/* ── Sidebar ── */}
          <div className="w-72 shrink-0 border-l overflow-y-auto bg-background/60">

            {/* Staffing */}
            <div className="p-4 space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                Staffing
              </p>
              <div className="space-y-2">
                {change.assignedTo && (
                  <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-2.5">
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary shrink-0">
                      {change.assignedTo.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground">Assigned to</p>
                      <p className="text-xs font-medium truncate">{change.assignedTo.name}</p>
                    </div>
                  </div>
                )}
                {change.coordinatorGroup && (
                  <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-2.5">
                    <div
                      className="h-7 w-7 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: `${change.coordinatorGroup.color}20`, border: `1px solid ${change.coordinatorGroup.color}40` }}
                    >
                      <Users className="h-3.5 w-3.5" style={{ color: change.coordinatorGroup.color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground">Coordinator group</p>
                      <p className="text-xs font-medium truncate">{change.coordinatorGroup.name}</p>
                    </div>
                  </div>
                )}
                {change.createdBy && (
                  <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-2.5">
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground shrink-0">
                      {change.createdBy.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground">Requested by</p>
                      <p className="text-xs font-medium truncate">{change.createdBy.name}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Timeline */}
            <div className="p-4 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                Timeline
              </p>
              <div className="divide-y divide-border/40">
                <InfoRow label="Created"><span className="text-xs font-normal">{fmt(change.createdAt)}</span></InfoRow>
                {change.submittedAt && <InfoRow label="Submitted"><span className="text-xs font-normal">{fmt(change.submittedAt)}</span></InfoRow>}
                {change.approvedAt  && <InfoRow label="Approved"><span className="text-xs font-normal">{fmt(change.approvedAt)}</span></InfoRow>}
                {change.closedAt    && <InfoRow label="Closed"><span className="text-xs font-normal">{fmt(change.closedAt)}</span></InfoRow>}
                {change.plannedStart && <InfoRow label="Planned start"><span className="text-xs font-normal">{fmtShort(change.plannedStart)}</span></InfoRow>}
                {change.plannedEnd   && <InfoRow label="Planned end"><span className="text-xs font-normal">{fmtShort(change.plannedEnd)}</span></InfoRow>}
              </div>
            </div>

            {/* Closure quick-view */}
            {change.implementationOutcome && (
              <>
                <Separator />
                <div className="p-4 space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                    Closure
                  </p>
                  <div className="divide-y divide-border/40">
                    <InfoRow label="Outcome">
                      <span className={`text-xs ${implementationOutcomeColor[change.implementationOutcome]}`}>
                        {implementationOutcomeLabel[change.implementationOutcome]}
                      </span>
                    </InfoRow>
                    {change.closureCode && (
                      <InfoRow label="Code">
                        <span className="font-mono text-xs">{change.closureCode}</span>
                      </InfoRow>
                    )}
                    {change.rollbackUsed !== null && change.rollbackUsed !== undefined && (
                      <InfoRow label="Rollback">
                        <span className="flex items-center gap-1 text-xs font-normal">
                          <RotateCcw className="h-3 w-3 text-muted-foreground" />
                          {change.rollbackUsed ? "Executed" : "Not used"}
                        </span>
                      </InfoRow>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Notification flag */}
            {change.notificationRequired != null && (
              <>
                <Separator />
                <div className="p-4 space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                    Notifications
                  </p>
                  <div className="divide-y divide-border/40">
                    <InfoRow label="Required">
                      {change.notificationRequired ? (
                        <span className="text-amber-600 dark:text-amber-400 font-medium text-xs">Yes</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">No</span>
                      )}
                    </InfoRow>
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* CAB Approval */}
            <div className="p-4">
              <ChangeApprovalPanel changeId={changeId} changeState={change.state} />
            </div>

            <Separator />

            {/* CI Links */}
            <div className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-3 flex items-center gap-1.5">
                <Database className="h-3 w-3" />
                Configuration Items
              </p>
              <ChangeCiLinksPanel
                changeId={changeId}
                primaryCi={change.configurationItem ?? null}
                linkedCis={change.ciLinks ?? []}
                readonly={isClosed}
                onChanged={invalidateChange}
              />
            </div>

            {/* Asset Links */}
            <div className="p-4 border-t">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-3 flex items-center gap-1.5">
                <Server className="h-3 w-3" />
                Affected Assets
              </p>
              <AssetLinksPanel
                entityType="changes"
                entityId={changeId}
                readonly={isClosed}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Dialogs ── */}
      {change && (
        <>
          <EditChangeDialog
            changeId={changeId}
            change={change}
            open={editOpen}
            onOpenChange={setEditOpen}
            onSaved={invalidateChange}
          />
          <SaveAsTemplateDialog
            open={templateDialog}
            onOpenChange={setTemplateDialog}
            type="change"
            defaultTitle={change.title}
            defaultBody={[change.description, change.justification].filter(Boolean).join("\n\n")}
          />
        </>
      )}
    </div>
  );
}
