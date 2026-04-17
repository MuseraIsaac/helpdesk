/**
 * ChangeDetailPage — enterprise ITSM change request form view.
 *
 * Layout:
 *   • Header bar  — breadcrumb, change number, title, key badges
 *   • Lifecycle bar — horizontal state progress indicator
 *   • Two-column body
 *       Left:  tabbed content (Overview | Planning | Tasks | Closure | Conflicts | History)
 *       Right: compact sidebar (metadata, approval, CI links)
 */

import { useState } from "react";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import BackLink from "@/components/BackLink";
import ErrorAlert from "@/components/ErrorAlert";
import RichTextRenderer from "@/components/RichTextRenderer";
import ChangeApprovalPanel from "@/components/ChangeApprovalPanel";
import ChangeConflictsTab from "@/components/ChangeConflictsTab";
import ChangeCiLinksPanel from "@/components/ChangeCiLinksPanel";
import ChangeTimeline from "@/components/ChangeTimeline";
import ChangeAttachmentsPanel from "@/components/ChangeAttachmentsPanel";
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
  ListChecks,
  ClipboardCheck,
  Clock,
  Save,
  ExternalLink,
  RotateCcw,
  Paperclip,
  Pencil,
  ArrowRight,
} from "lucide-react";

// ── State palette ─────────────────────────────────────────────────────────────

const STATE_BADGE: Record<string, string> = {
  draft:      "bg-muted text-muted-foreground border-muted-foreground/20",
  submitted:  "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-300/40",
  assess:     "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-300/40",
  authorize:  "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300/40",
  scheduled:  "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-300/40",
  implement:  "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-300/40",
  review:     "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-300/40",
  closed:     "bg-green-500/10 text-green-700 dark:text-green-400 border-green-300/40",
  cancelled:  "bg-muted text-muted-foreground border-muted-foreground/20",
  failed:     "bg-destructive/10 text-destructive border-destructive/30",
};

const STATE_DOT: Record<string, string> = {
  draft:      "bg-muted-foreground/40",
  submitted:  "bg-blue-500",
  assess:     "bg-purple-500",
  authorize:  "bg-amber-500",
  scheduled:  "bg-cyan-500",
  implement:  "bg-orange-500",
  review:     "bg-violet-500",
  closed:     "bg-green-500",
  cancelled:  "bg-muted-foreground/40",
  failed:     "bg-destructive",
};

const RISK_BADGE: Record<string, string> = {
  low:      "bg-green-500/10 text-green-700 dark:text-green-400 border-green-300/40",
  medium:   "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-300/30",
  high:     "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-300/40",
  critical: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-300/40",
};

// The main lifecycle flow (excludes cancelled/failed which are off-path)
const LIFECYCLE_STATES = [
  "draft", "submitted", "assess", "authorize",
  "scheduled", "implement", "review", "closed",
] as const;

// ── Lifecycle step bar ────────────────────────────────────────────────────────

function LifecycleBar({ currentState }: { currentState: string }) {
  const isFailed    = currentState === "failed";
  const isCancelled = currentState === "cancelled";
  const isOffPath   = isFailed || isCancelled;
  const currentIdx  = LIFECYCLE_STATES.indexOf(currentState as typeof LIFECYCLE_STATES[number]);

  return (
    <div className="border-b bg-muted/20 px-5 py-2.5">
      <div className="flex items-center gap-0 overflow-x-auto">
        {LIFECYCLE_STATES.map((state, idx) => {
          const isDone    = !isOffPath && idx < currentIdx;
          const isCurrent = !isOffPath && state === currentState;
          const isFuture  = isOffPath || idx > currentIdx;

          return (
            <div key={state} className="flex items-center shrink-0">
              {idx > 0 && (
                <div className={[
                  "h-px w-5 shrink-0",
                  isDone ? "bg-primary/60" : "bg-border",
                ].join(" ")} />
              )}
              <div className={[
                "flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors",
                isCurrent ? "bg-primary/10 text-primary" : "",
                isDone    ? "text-muted-foreground" : "",
                isFuture  ? "text-muted-foreground/50" : "",
              ].join(" ")}>
                {isDone ? (
                  <CheckCircle2 className="h-3 w-3 text-primary/60 shrink-0" />
                ) : (
                  <span className={[
                    "h-2 w-2 rounded-full shrink-0",
                    isCurrent ? "bg-primary" : STATE_DOT[state] ?? "bg-muted-foreground/30",
                  ].join(" ")} />
                )}
                {changeStateLabel[state]}
              </div>
            </div>
          );
        })}

        {/* Off-path terminal states */}
        {isOffPath && (
          <>
            <div className="h-px w-5 bg-border shrink-0" />
            <div className={[
              "flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium",
              currentState === "failed" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
            ].join(" ")}>
              <span className={`h-2 w-2 rounded-full shrink-0 ${STATE_DOT[currentState]}`} />
              {changeStateLabel[currentState as keyof typeof changeStateLabel] ?? currentState}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Field row — compact label/value pair ──────────────────────────────────────

function FieldRow({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-[7rem_1fr] gap-x-3 items-start py-1.5 border-b border-border/50 last:border-0 ${className}`}>
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide pt-0.5 shrink-0">
        {label}
      </span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
        {children}
      </span>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
}

// ── Rich-text block — label + rendered HTML ───────────────────────────────────

function RichBlock({ label, content }: { label: string; content: string | null | undefined }) {
  if (!content) return null;
  return (
    <div>
      <SectionHeader>{label}</SectionHeader>
      <RichTextRenderer content={content} className="text-sm text-foreground/90" />
    </div>
  );
}

// ── Task status icon ──────────────────────────────────────────────────────────

const TASK_ICON: Record<string, React.ReactNode> = {
  completed:   <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />,
  in_progress: <Circle       className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />,
  failed:      <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />,
  skipped:     <Circle       className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />,
  pending:     <Circle       className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0 mt-0.5" />,
};

// ── Date formatter ────────────────────────────────────────────────────────────

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function fmtShort(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

// ── Sidebar label/value row ───────────────────────────────────────────────────

function SideRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1 border-b border-border/40 last:border-0">
      <span className="text-[11px] text-muted-foreground shrink-0 pt-px">{label}</span>
      <span className="text-[12px] font-medium text-right">{children}</span>
    </div>
  );
}

// ── State transition map ──────────────────────────────────────────────────────
// Maps each state to the list of next states available from the UI.

const STATE_TRANSITIONS: Partial<Record<ChangeState, { to: ChangeState; label: string; variant?: "default" | "destructive" | "outline" }[]>> = {
  draft:     [{ to: "submitted",  label: "Submit for Review",   variant: "default" }],
  submitted: [{ to: "assess",     label: "Begin Assessment",    variant: "default" },
              { to: "cancelled",  label: "Cancel",              variant: "outline" }],
  assess:    [{ to: "authorize",  label: "Move to Authorization", variant: "default" },
              { to: "submitted",  label: "Return to Submitted", variant: "outline" },
              { to: "cancelled",  label: "Cancel",              variant: "outline" }],
  authorize: [{ to: "scheduled",  label: "Schedule",            variant: "default" },
              { to: "cancelled",  label: "Cancel",              variant: "outline" }],
  scheduled: [{ to: "implement",  label: "Start Implementation", variant: "default" },
              { to: "cancelled",  label: "Cancel",              variant: "outline" }],
  implement: [{ to: "review",     label: "Move to PIR",         variant: "default" },
              { to: "failed",     label: "Mark Failed",         variant: "destructive" }],
  review:    [{ to: "closed",     label: "Close Change",        variant: "default" }],
};

// ── Edit change dialog ────────────────────────────────────────────────────────

interface EditChangeDialogProps {
  changeId: number;
  change: Change;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function EditChangeDialog({ changeId, change, open, onOpenChange, onSaved }: EditChangeDialogProps) {
  const { register, handleSubmit, control, reset, formState: { isDirty, isSubmitting, errors } } =
    useForm<UpdateChangeInput>({
      resolver: zodResolver(updateChangeSchema),
      defaultValues: {
        title:       change.title,
        changeType:  change.changeType,
        risk:        change.risk,
        priority:    change.priority,
        description: change.description ?? "",
      },
    });

  const [saveError, setSaveError] = useState<string | null>(null);

  const onSubmit = async (data: UpdateChangeInput) => {
    setSaveError(null);
    try {
      await axios.patch(`/api/changes/${changeId}`, {
        title:       data.title,
        changeType:  data.changeType,
        risk:        data.risk,
        priority:    data.priority,
        description: data.description || null,
      });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setSaveError(err.response?.data?.error ?? "Failed to save changes");
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="h-4 w-4" />
            Edit Change Request
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {saveError && <ErrorAlert message={saveError} />}

          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Title <span className="text-destructive">*</span></Label>
            <Input {...register("title")} className="text-sm" />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          {/* Type / Risk / Priority */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Type</Label>
              <Controller
                name="changeType"
                control={control}
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {changeTypes.map((t) => (
                        <SelectItem key={t} value={t} className="text-xs">{changeTypeLabel[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Risk</Label>
              <Controller
                name="risk"
                control={control}
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {changeRisks.map((r) => (
                        <SelectItem key={r} value={r} className="text-xs">{changeRiskLabel[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Priority</Label>
              <Controller
                name="priority"
                control={control}
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ticketPriorities.map((p) => (
                        <SelectItem key={p} value={p} className="text-xs">{priorityLabel[p]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Description</Label>
            <Textarea
              {...register("description")}
              placeholder="High-level description of the change…"
              className="text-sm min-h-[90px] resize-y"
            />
          </div>

          <DialogFooter className="gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" className="text-xs"
              onClick={() => { onOpenChange(false); reset(); }} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="text-xs gap-1.5" disabled={!isDirty || isSubmitting}>
              <Save className="h-3 w-3" />
              {isSubmitting ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Clock className="h-4 w-4 shrink-0" />
        <span>
          Closure information is recorded once the change reaches the Implementation or Review stage.
          Current state: <strong>{changeStateLabel[change.state] ?? change.state}</strong>.
        </span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {saveError && <ErrorAlert message={saveError} />}

      {/* Outcome + Rollback row */}
      <div>
        <SectionHeader>Implementation Outcome</SectionHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Outcome</Label>
            <Controller
              name="implementationOutcome"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || null)}
                  disabled={isReadonly}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select outcome…" />
                  </SelectTrigger>
                  <SelectContent>
                    {implementationOutcomes.map((o) => (
                      <SelectItem key={o} value={o}>{implementationOutcomeLabel[o]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Rollback Executed</Label>
            <div className="flex items-center gap-2 h-8">
              <Controller
                name="rollbackUsed"
                control={control}
                render={({ field }) => (
                  <Switch
                    checked={field.value ?? false}
                    onCheckedChange={field.onChange}
                    disabled={isReadonly}
                  />
                )}
              />
              <span className="text-sm text-muted-foreground">
                {change.rollbackUsed ? "Yes — rollback was used" : "No rollback required"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Closure notes */}
      <div>
        <SectionHeader>Closure Notes</SectionHeader>
        <Textarea
          {...register("closureNotes")}
          placeholder="Describe what occurred during implementation, any deviations from the plan, and how the change was completed or terminated…"
          className="text-sm min-h-[100px] resize-y"
          disabled={isReadonly}
        />
      </div>

      {/* PIR */}
      <div>
        <SectionHeader>Post-Implementation Review</SectionHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Review Summary</Label>
            <Textarea
              {...register("reviewSummary")}
              placeholder="Summarise the post-implementation review — what went well, what didn't, and how the change performed against its objectives…"
              className="text-sm min-h-[90px] resize-y"
              disabled={isReadonly}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Lessons Learned</Label>
            <Textarea
              {...register("lessonsLearned")}
              placeholder="Document process improvements, knowledge gaps identified, and recommendations for future similar changes…"
              className="text-sm min-h-[90px] resize-y"
              disabled={isReadonly}
            />
          </div>
        </div>
      </div>

      {!isReadonly && (
        <div className="flex items-center justify-end pt-1">
          <Button type="submit" size="sm" disabled={!isDirty || isSubmitting} className="h-7 text-xs gap-1.5">
            <Save className="h-3 w-3" />
            {isSubmitting ? "Saving…" : "Save closure information"}
          </Button>
        </div>
      )}

      {/* Read-only summary if already filled */}
      {isReadonly && change.implementationOutcome && (
        <div className="rounded border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
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

  if (isNaN(changeId)) {
    return <div className="p-6"><ErrorAlert message="Invalid change ID" /></div>;
  }

  const isClosed = change?.state === "closed" || change?.state === "cancelled" || change?.state === "failed";

  return (
    <div className="flex flex-col h-full bg-background">

      {/* ── Header ── */}
      <div className="border-b bg-background px-5 py-2.5 shrink-0">
        <BackLink to="/changes" label="All Changes" />

        {isLoading && (
          <div className="mt-2 space-y-1">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-6 w-80" />
          </div>
        )}
        {error && <ErrorAlert error={error} fallback="Failed to load change" className="mt-2" />}

        {change && (
          <div className="mt-1.5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              {/* Breadcrumb line */}
              <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground flex-wrap">
                <span className="font-mono font-medium">{change.changeNumber}</span>
                <ChevronRight className="h-3 w-3 shrink-0" />
                <span className="capitalize">{changeTypeLabel[change.changeType] ?? change.changeType}</span>
                {change.categorizationTier1 && (
                  <>
                    <ChevronRight className="h-3 w-3 shrink-0" />
                    <span>{change.categorizationTier1}</span>
                  </>
                )}
              </div>
              {/* Title */}
              <h1 className="text-base font-semibold leading-snug mt-0.5 text-foreground">
                {change.title}
              </h1>
            </div>
            {/* Right: badges + actions */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold ${STATE_BADGE[change.state] ?? STATE_BADGE.draft}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[change.state] ?? "bg-muted-foreground"}`} />
                {changeStateLabel[change.state] ?? change.state}
              </span>
              <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold ${RISK_BADGE[change.risk] ?? ""}`}>
                {changeRiskLabel[change.risk] ?? change.risk} Risk
              </span>
              {change.implementationOutcome && (
                <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium border-border ${implementationOutcomeColor[change.implementationOutcome]}`}>
                  {implementationOutcomeLabel[change.implementationOutcome]}
                </span>
              )}

              {/* State transitions */}
              {!isClosed && STATE_TRANSITIONS[change.state]?.map((t) => (
                <Button
                  key={t.to}
                  size="sm"
                  variant={t.variant ?? "outline"}
                  className="h-7 text-xs gap-1"
                  disabled={transitionMutation.isPending}
                  onClick={() => transitionMutation.mutate(t.to)}
                >
                  <ArrowRight className="h-3 w-3" />
                  {t.label}
                </Button>
              ))}

              {/* Edit button */}
              {!isClosed && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Edit dialog ── */}
      {change && (
        <EditChangeDialog
          changeId={changeId}
          change={change}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSaved={invalidateChange}
        />
      )}

      {/* ── Transition error ── */}
      {transitionMutation.isError && (
        <div className="px-5 pt-2">
          <ErrorAlert error={transitionMutation.error} fallback="State transition failed" />
        </div>
      )}

      {/* ── Lifecycle bar ── */}
      {change && <LifecycleBar currentState={change.state} />}

      {/* ── Body ── */}
      {change && (
        <div className="flex flex-1 overflow-hidden">

          {/* ── Main content ── */}
          <div className="flex-1 overflow-y-auto">
            <Tabs defaultValue="overview" className="flex flex-col h-full">

              {/* Tab strip — understated underline style */}
              <div className="border-b px-5 pt-0 shrink-0 bg-background">
                <TabsList className="h-auto bg-transparent p-0 gap-0 rounded-none">
                  {[
                    { value: "overview",     label: "Overview",     icon: <FileText       className="h-3 w-3" /> },
                    { value: "planning",     label: "Planning",     icon: <Shield         className="h-3 w-3" /> },
                    { value: "tasks",        label: "Tasks",        icon: <ListChecks     className="h-3 w-3" />,
                      badge: change.tasks?.length ?? 0 },
                    { value: "attachments",  label: "Attachments",  icon: <Paperclip      className="h-3 w-3" /> },
                    { value: "closure",      label: "Closure",      icon: <ClipboardCheck className="h-3 w-3" /> },
                    { value: "conflicts",    label: "Conflicts",    icon: <AlertTriangle  className="h-3 w-3" /> },
                    { value: "history",      label: "History",      icon: <Activity       className="h-3 w-3" /> },
                  ].map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className={[
                        "flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-medium rounded-none border-b-2 border-transparent",
                        "data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent",
                        "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground",
                        "transition-colors",
                      ].join(" ")}
                    >
                      {tab.icon}
                      {tab.label}
                      {"badge" in tab && tab.badge > 0 && (
                        <span className="ml-0.5 rounded bg-muted px-1 text-[10px] font-normal">
                          {tab.badge}
                        </span>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              {/* ── Overview tab ── */}
              <TabsContent value="overview" className="flex-1 overflow-y-auto p-5 space-y-5 mt-0">

                {/* Summary section */}
                {change.description && (
                  <div>
                    <SectionHeader>Summary / Description</SectionHeader>
                    <RichTextRenderer content={change.description} className="text-sm text-foreground/90" />
                  </div>
                )}

                {/* Classification grid */}
                <div>
                  <SectionHeader>Classification</SectionHeader>
                  <div className="divide-y divide-border/50">
                    <FieldRow label="Change #">{change.changeNumber}</FieldRow>
                    {change.changeModel && (
                      <FieldRow label="Model">
                        {changeModelLabel[change.changeModel] ?? change.changeModel}
                      </FieldRow>
                    )}
                    {change.changePurpose && (
                      <FieldRow label="Purpose">
                        {changePurposeLabel[change.changePurpose] ?? change.changePurpose}
                      </FieldRow>
                    )}
                    <FieldRow label="Priority">
                      <span className="capitalize">
                        {priorityLabel[change.priority as keyof typeof priorityLabel] ?? change.priority}
                      </span>
                    </FieldRow>
                    {change.categorizationTier1 && (
                      <FieldRow label="Category">
                        {change.categorizationTier1}
                        {change.categorizationTier2 && <span className="text-muted-foreground"> › {change.categorizationTier2}</span>}
                        {change.categorizationTier3 && <span className="text-muted-foreground"> › {change.categorizationTier3}</span>}
                      </FieldRow>
                    )}
                    {change.serviceName && (
                      <FieldRow label="Service">
                        {change.service ? change.service.name : (
                          <span className="text-muted-foreground">{change.serviceName}</span>
                        )}
                      </FieldRow>
                    )}
                    {change.linkedProblem && (
                      <FieldRow label="Problem">
                        <Link
                          to={`/problems/${change.linkedProblem.id}`}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          {change.linkedProblem.problemNumber} · {change.linkedProblem.title}
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </Link>
                      </FieldRow>
                    )}
                  </div>
                </div>

                {/* Dates */}
                <div>
                  <SectionHeader>Schedule</SectionHeader>
                  <div className="divide-y divide-border/50">
                    <FieldRow label="Planned window">
                      {change.plannedStart || change.plannedEnd ? (
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          {fmtShort(change.plannedStart)} → {fmtShort(change.plannedEnd)}
                        </span>
                      ) : <span className="text-muted-foreground/50">Not scheduled</span>}
                    </FieldRow>
                    {(change.actualStart || change.actualEnd) && (
                      <FieldRow label="Actual window">
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          {fmtShort(change.actualStart)} → {fmtShort(change.actualEnd)}
                        </span>
                      </FieldRow>
                    )}
                    <FieldRow label="Created">{fmt(change.createdAt)}</FieldRow>
                    {change.submittedAt && <FieldRow label="Submitted">{fmt(change.submittedAt)}</FieldRow>}
                    {change.approvedAt  && <FieldRow label="Approved">{fmt(change.approvedAt)}</FieldRow>}
                    {change.closedAt    && <FieldRow label="Closed">{fmt(change.closedAt)}</FieldRow>}
                  </div>
                </div>

                {/* Justification */}
                {change.justification && <RichBlock label="Justification" content={change.justification} />}
              </TabsContent>

              {/* ── Planning tab ── */}
              <TabsContent value="planning" className="flex-1 overflow-y-auto p-5 space-y-6 mt-0">
                <RichBlock label="Work Instructions"           content={change.workInstructions} />
                <RichBlock label="Service Impact Assessment"   content={change.serviceImpactAssessment} />
                <RichBlock label="Risk Assessment & Mitigation" content={change.riskAssessmentAndMitigation} />
                <RichBlock label="Rollback Plan"               content={change.rollbackPlan} />

                {!change.workInstructions && !change.serviceImpactAssessment &&
                 !change.riskAssessmentAndMitigation && !change.rollbackPlan && (
                  <p className="text-sm text-muted-foreground py-4">No planning documents recorded.</p>
                )}
              </TabsContent>

              {/* ── Tasks tab ── */}
              <TabsContent value="tasks" className="flex-1 overflow-y-auto p-5 space-y-5 mt-0">

                {change.prechecks && (
                  <div>
                    <SectionHeader>Pre-Implementation Checks</SectionHeader>
                    <RichTextRenderer content={change.prechecks} className="text-sm" />
                  </div>
                )}

                {change.tasks && change.tasks.length > 0 ? (
                  <div>
                    <SectionHeader>Implementation Tasks</SectionHeader>
                    <div className="divide-y divide-border/50">
                      {change.tasks.map((task) => (
                        <div key={task.id} className="flex items-start gap-3 py-2.5">
                          {TASK_ICON[task.status] ?? TASK_ICON.pending}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium">{task.title}</span>
                              <span className="text-[10px] text-muted-foreground capitalize shrink-0">
                                {task.phase} · #{task.position}
                              </span>
                            </div>
                            {task.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                            )}
                            {task.assignedTo && (
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                → {task.assignedTo.name}
                              </p>
                            )}
                            {task.completionNote && (
                              <p className="text-[11px] text-muted-foreground italic mt-0.5">
                                "{task.completionNote}"
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  !change.prechecks && !change.postchecks && (
                    <p className="text-sm text-muted-foreground">No tasks recorded for this change.</p>
                  )
                )}

                {change.postchecks && (
                  <div>
                    <SectionHeader>Post-Implementation Checks</SectionHeader>
                    <RichTextRenderer content={change.postchecks} className="text-sm" />
                  </div>
                )}
              </TabsContent>

              {/* ── Attachments tab ── */}
              <TabsContent value="attachments" className="flex-1 overflow-y-auto p-5 mt-0">
                <ChangeAttachmentsPanel changeId={changeId} readonly={isClosed} />
              </TabsContent>

              {/* ── Closure tab ── */}
              <TabsContent value="closure" className="flex-1 overflow-y-auto p-5 mt-0">
                <ClosureForm changeId={changeId} change={change} onSaved={invalidateChange} />
              </TabsContent>

              {/* ── Conflicts tab ── */}
              <TabsContent value="conflicts" className="flex-1 overflow-y-auto p-5 mt-0">
                <ChangeConflictsTab changeId={changeId} />
              </TabsContent>

              {/* ── History tab ── */}
              <TabsContent value="history" className="flex-1 overflow-y-auto p-5 mt-0">
                <ChangeTimeline events={change.events ?? []} />
              </TabsContent>
            </Tabs>
          </div>

          {/* ── Sidebar ── */}
          <div className="w-60 shrink-0 border-l overflow-y-auto bg-muted/10">

            {/* Staffing */}
            <div className="px-4 pt-4 pb-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">
                Staffing
              </p>
              <div className="divide-y divide-border/40">
                {change.assignedTo && (
                  <SideRow label="Assigned to">
                    <span className="flex items-center gap-1 justify-end">
                      <User className="h-3 w-3 text-muted-foreground" />
                      {change.assignedTo.name}
                    </span>
                  </SideRow>
                )}
                {change.coordinatorGroup && (
                  <SideRow label="Coordinator">
                    <span className="flex items-center gap-1 justify-end">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ background: change.coordinatorGroup.color }}
                      />
                      {change.coordinatorGroup.name}
                    </span>
                  </SideRow>
                )}
                {change.createdBy && (
                  <SideRow label="Requested by">{change.createdBy.name}</SideRow>
                )}
              </div>
            </div>

            <Separator />

            {/* Key dates */}
            <div className="px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">
                Timeline
              </p>
              <div className="divide-y divide-border/40">
                <SideRow label="Created">{fmt(change.createdAt)}</SideRow>
                {change.submittedAt && <SideRow label="Submitted">{fmt(change.submittedAt)}</SideRow>}
                {change.approvedAt  && <SideRow label="Approved">{fmt(change.approvedAt)}</SideRow>}
                {change.closedAt    && <SideRow label="Closed">{fmt(change.closedAt)}</SideRow>}
                {(change.plannedStart || change.plannedEnd) && (
                  <>
                    <SideRow label="Planned start">{fmtShort(change.plannedStart)}</SideRow>
                    <SideRow label="Planned end">{fmtShort(change.plannedEnd)}</SideRow>
                  </>
                )}
              </div>
            </div>

            {/* Closure summary (sidebar quick-view) */}
            {change.implementationOutcome && (
              <>
                <Separator />
                <div className="px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">
                    Closure
                  </p>
                  <div className="divide-y divide-border/40">
                    <SideRow label="Outcome">
                      <span className={implementationOutcomeColor[change.implementationOutcome]}>
                        {implementationOutcomeLabel[change.implementationOutcome]}
                      </span>
                    </SideRow>
                    {change.rollbackUsed !== null && change.rollbackUsed !== undefined && (
                      <SideRow label="Rollback">
                        <span className="flex items-center gap-1">
                          <RotateCcw className="h-3 w-3 text-muted-foreground" />
                          {change.rollbackUsed ? "Executed" : "Not used"}
                        </span>
                      </SideRow>
                    )}
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* CAB Approval */}
            <div className="px-4 py-3">
              <ChangeApprovalPanel changeId={changeId} changeState={change.state} />
            </div>

            <Separator />

            {/* CI links */}
            <div className="px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2 flex items-center gap-1.5">
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
          </div>
        </div>
      )}
    </div>
  );
}
