import { useState, useRef, useEffect } from "react";
import { useParams, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import type { Problem, LinkedIncident, ProblemNote, ProblemEvent } from "core/constants/problem.ts";
import {
  problemStatusTransitions,
  problemStatusLabel,
  terminalProblemStatuses,
} from "core/constants/problem-status.ts";
import type { ProblemStatus } from "core/constants/problem-status.ts";
import {
  createProblemNoteSchema,
  type CreateProblemNoteInput,
} from "core/schemas/problems.ts";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BackLink from "@/components/BackLink";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import { ProblemStatusBadge, ProblemPriorityBadge } from "./ProblemsPage";
import {
  BookMarked,
  Plus,
  Trash2,
  Link2,
  Unlink,
  Pencil,
  Check,
  X,
  Activity,
  FileText,
  GitBranch,
  Lightbulb,
  AlertTriangle,
} from "lucide-react";

// ── Event label map ───────────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, (meta: Record<string, unknown>) => string> = {
  "problem.created":            () => "Problem recorded",
  "problem.status_changed":     (m) =>
    `Status: ${problemStatusLabel[m.from as ProblemStatus] ?? m.from} → ${problemStatusLabel[m.to as ProblemStatus] ?? m.to}`,
  "problem.priority_changed":   (m) => `Priority: ${m.from} → ${m.to}`,
  "problem.owner_changed":      (m) => m.to ? "Owner assigned" : "Owner removed",
  "problem.assigned":           (m) => m.to ? "Analyst assigned" : "Analyst removed",
  "problem.root_cause_updated": () => "Root cause analysis updated",
  "problem.workaround_updated": () => "Workaround updated",
  "problem.incident_linked":    (m) => `Incident ${m.incidentNumber} linked`,
  "problem.incident_unlinked":  (m) => `Incident #${m.incidentId} unlinked`,
  "problem.incidents_linked":   (m) => `${Array.isArray(m.incidentIds) ? m.incidentIds.length : 1} incident(s) linked`,
  "problem.note_added":         (m) => `Note added (${m.noteType})`,
};

const NOTE_TYPE_LABEL: Record<string, string> = {
  investigation: "Investigation",
  rca:           "Root Cause Analysis",
  workaround:    "Workaround",
  general:       "Note",
};

const NOTE_TYPE_STYLES: Record<string, string> = {
  investigation: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  rca:           "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  workaround:    "bg-green-500/15 text-green-700 dark:text-green-400",
  general:       "bg-muted text-muted-foreground",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(diff / 3_600_000);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric" });
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

// ── Inline editable text area ─────────────────────────────────────────────────

function InlineTextArea({
  label,
  placeholder,
  value,
  onSave,
  disabled,
}: {
  label: string;
  placeholder: string;
  value: string | null | undefined;
  onSave: (val: string | null) => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  function startEdit() {
    if (disabled) return;
    setDraft(value ?? "");
    setEditing(true);
  }

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function save() {
    onSave(draft.trim() || null);
    setEditing(false);
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {!disabled && !editing && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={startEdit}>
            <Pencil className="h-3 w-3 mr-1" />
            {value ? "Edit" : "Add"}
          </Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-1">
          <textarea
            ref={ref}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            className="w-full min-h-[100px] text-sm rounded-md border border-input bg-background px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex gap-1.5">
            <Button size="sm" className="h-7 text-xs" onClick={save}>
              <Check className="h-3 w-3 mr-1" />
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={`rounded-md ${
            value
              ? "text-sm whitespace-pre-wrap text-foreground"
              : "italic text-muted-foreground text-sm"
          } ${!disabled ? "cursor-pointer hover:bg-muted/50 p-2 -mx-2 rounded-md transition-colors" : ""}`}
          onClick={startEdit}
        >
          {value ?? placeholder}
        </div>
      )}
    </div>
  );
}

// ── Linked incidents panel ────────────────────────────────────────────────────

function LinkedIncidentsPanel({
  incidents,
  problemId,
  isTerminal,
  refetch,
}: {
  incidents: LinkedIncident[];
  problemId: number;
  isTerminal: boolean;
  refetch: () => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [incidentInput, setIncidentInput] = useState("");
  const [linkError, setLinkError] = useState("");

  const linkMutation = useMutation({
    mutationFn: async (incidentId: number) => {
      await axios.post(`/api/problems/${problemId}/incidents`, { incidentId });
    },
    onSuccess: () => {
      setLinkOpen(false);
      setIncidentInput("");
      setLinkError("");
      refetch();
    },
    onError: (err: any) => {
      setLinkError(
        err?.response?.data?.error ?? "Failed to link incident"
      );
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (incidentId: number) => {
      await axios.delete(`/api/problems/${problemId}/incidents/${incidentId}`);
    },
    onSuccess: () => refetch(),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Linked Incidents
          {incidents.length > 0 && (
            <span className="text-xs text-muted-foreground font-normal">
              ({incidents.length})
            </span>
          )}
        </h3>
        {!isTerminal && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setLinkOpen(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Link incident
          </Button>
        )}
      </div>

      {incidents.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No incidents linked yet. Link related incidents to build the recurrence picture.
        </p>
      ) : (
        <div className="space-y-1">
          {incidents.map((inc) => (
            <div
              key={inc.id}
              className="flex items-center justify-between rounded-md border px-3 py-2 group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono text-xs text-muted-foreground shrink-0">
                  {inc.incidentNumber}
                </span>
                <Link
                  to={`/incidents/${inc.id}`}
                  className="text-sm font-medium truncate hover:underline"
                >
                  {inc.title}
                </Link>
                <Badge
                  variant="outline"
                  className="text-[10px] shrink-0 capitalize"
                >
                  {inc.status.replace("_", " ")}
                </Badge>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground hidden group-hover:block">
                  linked {formatRelative(inc.linkedAt)}
                </span>
                {!isTerminal && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => unlinkMutation.mutate(inc.id)}
                  >
                    <Unlink className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Link dialog */}
      <Dialog open={linkOpen} onOpenChange={(v) => { setLinkOpen(v); if (!v) { setIncidentInput(""); setLinkError(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Link Incident</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter the numeric ID of the incident to link to this problem.
            </p>
            <div className="space-y-1.5">
              <Label>Incident ID</Label>
              <Input
                type="number"
                placeholder="e.g. 42"
                value={incidentInput}
                onChange={(e) => { setIncidentInput(e.target.value); setLinkError(""); }}
                autoFocus
              />
              {linkError && (
                <p className="text-xs text-destructive">{linkError}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const id = parseInt(incidentInput, 10);
                if (!id || id <= 0) { setLinkError("Enter a valid incident ID"); return; }
                linkMutation.mutate(id);
              }}
              disabled={!incidentInput || linkMutation.isPending}
            >
              Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Notes panel ───────────────────────────────────────────────────────────────

function NotesPanel({
  notes,
  problemId,
  isTerminal,
  refetch,
}: {
  notes: ProblemNote[];
  problemId: number;
  isTerminal: boolean;
  refetch: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreateProblemNoteInput>({
    resolver: zodResolver(createProblemNoteSchema),
    defaultValues: { noteType: "investigation" },
  });

  const addNote = useMutation({
    mutationFn: async (data: CreateProblemNoteInput) => {
      await axios.post(`/api/problems/${problemId}/notes`, data);
    },
    onSuccess: () => {
      reset();
      refetch();
    },
  });

  const deleteNote = useMutation({
    mutationFn: async (noteId: number) => {
      await axios.delete(`/api/problems/${problemId}/notes/${noteId}`);
    },
    onSuccess: () => refetch(),
  });

  return (
    <div className="space-y-4">
      {/* Existing notes */}
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No investigation notes yet.
        </p>
      ) : (
        <ol className="space-y-3">
          {notes.map((note) => {
            const cls = NOTE_TYPE_STYLES[note.noteType] ?? NOTE_TYPE_STYLES.general;
            return (
              <li key={note.id} className="flex gap-3 group">
                <div className="flex flex-col items-center pt-1">
                  <span className={`h-2 w-2 rounded-full ${cls.includes("bg-") ? cls.split(" ")[0] : "bg-border"}`} />
                  <div className="w-px flex-1 bg-border mt-1" />
                </div>
                <div className="flex-1 pb-3 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${cls}`}>
                      {NOTE_TYPE_LABEL[note.noteType] ?? note.noteType}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {note.author?.name ?? "System"} · {formatRelative(note.createdAt)}
                    </span>
                    {!isTerminal && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => deleteNote.mutate(note.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{note.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* Add note form */}
      {!isTerminal && (
        <form
          onSubmit={handleSubmit((d) => addNote.mutate(d))}
          className="rounded-md border p-3 space-y-2"
        >
          <div className="flex items-center gap-2">
            <Controller
              name="noteType"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-7 w-40 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="investigation">Investigation</SelectItem>
                    <SelectItem value="rca">Root Cause Analysis</SelectItem>
                    <SelectItem value="workaround">Workaround</SelectItem>
                    <SelectItem value="general">General Note</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            <span className="text-xs text-muted-foreground">
              Adding an RCA note will auto-advance status to "Root Cause Identified"
            </span>
          </div>
          <Textarea
            placeholder="Add investigation notes, RCA findings, or workaround steps…"
            rows={3}
            {...register("body")}
          />
          {errors.body && (
            <p className="text-xs text-destructive">{errors.body.message}</p>
          )}
          {addNote.error && (
            <ErrorAlert error={addNote.error} fallback="Failed to add note" />
          )}
          <Button
            type="submit"
            size="sm"
            className="h-7 text-xs"
            disabled={addNote.isPending}
          >
            {addNote.isPending ? "Adding…" : "Add Note"}
          </Button>
        </form>
      )}
    </div>
  );
}

// ── Audit Trail ───────────────────────────────────────────────────────────────

function EventTrail({ events }: { events: ProblemEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">No audit events yet.</p>
    );
  }

  return (
    <ol className="relative border-l border-border ml-2 space-y-3">
      {[...events].reverse().map((ev) => {
        const label = EVENT_LABELS[ev.action]?.(ev.meta) ?? ev.action;
        return (
          <li key={ev.id} className="ml-4">
            <div className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border border-background bg-border" />
            <div className="text-sm">{label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {ev.actor?.name ?? "System"} · {formatRelative(ev.createdAt)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ── Cluster hint banner ───────────────────────────────────────────────────────

function ClusterHintBanner({
  hint,
}: {
  hint: Problem["clusterHint"];
}) {
  if (!hint || hint.recurrenceCount < 2) return null;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
          Recurring incident cluster detected
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
          {hint.recurrenceCount} incidents linked
          {hint.commonAffectedSystem
            ? ` · most affecting "${hint.commonAffectedSystem}"`
            : ""}
          {hint.earliestIncidentAt
            ? ` · earliest ${formatRelative(hint.earliestIncidentAt)}`
            : ""}
          . A pattern-based clustering engine will provide deeper analysis in a
          future release.
        </p>
      </div>
    </div>
  );
}

// ── ProblemDetailPage ─────────────────────────────────────────────────────────

export default function ProblemDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: problem, isLoading, error, refetch } = useQuery({
    queryKey: ["problem", id],
    queryFn: async () => {
      const { data } = await axios.get<Problem>(`/api/problems/${id}`);
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
      const { data } = await axios.patch(`/api/problems/${id}`, patch);
      return data;
    },
    onSuccess: () => refetch(),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
    );
  }

  if (error || !problem) {
    return <ErrorAlert error={error} fallback="Problem not found" />;
  }

  const isTerminal = terminalProblemStatuses.includes(problem.status);
  const availableTransitions =
    problemStatusTransitions[problem.status as ProblemStatus] ?? [];

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div>
        <BackLink to="/problems" label="Back to Problems" />
        <div className="flex items-start justify-between gap-4 mt-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm text-muted-foreground">
                {problem.problemNumber}
              </span>
              <ProblemStatusBadge status={problem.status} />
              <ProblemPriorityBadge priority={problem.priority} />
              {problem.isKnownError && (
                <span className="inline-flex items-center gap-1 rounded border border-orange-200 bg-orange-500/10 px-1.5 py-0.5 text-[11px] font-medium text-orange-700 dark:text-orange-400">
                  <BookMarked className="h-3 w-3" />
                  Known Error · KEDB
                </span>
              )}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight mt-1">{problem.title}</h1>
            {problem.affectedService && (
              <p className="text-sm text-muted-foreground mt-0.5">
                Affected service: {problem.affectedService}
              </p>
            )}
          </div>

          {/* Status transitions */}
          {!isTerminal && availableTransitions.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {availableTransitions.map((nextStatus) => (
                <Button
                  key={nextStatus}
                  size="sm"
                  variant={
                    nextStatus === "closed"
                      ? "default"
                      : nextStatus === "resolved"
                      ? "default"
                      : "outline"
                  }
                  disabled={patchMutation.isPending}
                  onClick={() => patchMutation.mutate({ status: nextStatus })}
                >
                  {problemStatusLabel[nextStatus]}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>

      {patchMutation.error && (
        <ErrorAlert error={patchMutation.error} fallback="Failed to update problem" />
      )}

      {/* Cluster hint */}
      <ClusterHintBanner hint={problem.clusterHint} />

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Main content ─────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          {problem.description && (
            <div className="rounded-md border p-4">
              <h3 className="font-medium text-sm mb-2">Description</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {problem.description}
              </p>
            </div>
          )}

          {/* Tabbed investigation area */}
          <Tabs defaultValue="notes">
            <TabsList className="h-8">
              <TabsTrigger value="notes" className="text-xs">
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                Investigation Notes
              </TabsTrigger>
              <TabsTrigger value="rca" className="text-xs">
                <Lightbulb className="h-3.5 w-3.5 mr-1.5" />
                RCA &amp; Workaround
              </TabsTrigger>
              <TabsTrigger value="incidents" className="text-xs">
                <Link2 className="h-3.5 w-3.5 mr-1.5" />
                Incidents
                {(problem.linkedIncidents?.length ?? 0) > 0 && (
                  <span className="ml-1 text-[10px] bg-muted rounded-full px-1">
                    {problem.linkedIncidents?.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs">
                <Activity className="h-3.5 w-3.5 mr-1.5" />
                Audit Trail
              </TabsTrigger>
            </TabsList>

            <TabsContent value="notes" className="mt-4 rounded-md border p-4">
              <NotesPanel
                notes={problem.notes ?? []}
                problemId={Number(id)}
                isTerminal={isTerminal}
                refetch={refetch}
              />
            </TabsContent>

            <TabsContent value="rca" className="mt-4 rounded-md border p-4 space-y-6">
              <InlineTextArea
                label="Root Cause Analysis"
                placeholder="Describe the root cause of this problem in detail. Include contributing factors, timeline, and evidence."
                value={problem.rootCause}
                disabled={isTerminal}
                onSave={(v) => patchMutation.mutate({ rootCause: v })}
              />
              <div className="border-t pt-4">
                <InlineTextArea
                  label="Workaround"
                  placeholder="Document the workaround for affected users and teams. Include step-by-step instructions."
                  value={problem.workaround}
                  disabled={isTerminal}
                  onSave={(v) => patchMutation.mutate({ workaround: v })}
                />
              </div>
              {problem.linkedChangeRef && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-1">Linked Change</p>
                  <p className="text-sm font-mono text-muted-foreground">
                    {problem.linkedChangeRef}
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="incidents" className="mt-4 rounded-md border p-4">
              <LinkedIncidentsPanel
                incidents={problem.linkedIncidents ?? []}
                problemId={Number(id)}
                isTerminal={isTerminal}
                refetch={refetch}
              />
            </TabsContent>

            <TabsContent value="history" className="mt-4 rounded-md border p-4">
              <EventTrail events={problem.events ?? []} />
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Sidebar ──────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Ownership */}
          <div className="rounded-md border p-4 space-y-4">
            <h3 className="font-medium text-sm">Ownership</h3>

            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Problem Manager
              </span>
              <Select
                value={problem.owner?.id ?? "none"}
                onValueChange={(v) =>
                  patchMutation.mutate({ ownerId: v === "none" ? null : v })
                }
                disabled={isTerminal}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Unowned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unowned</SelectItem>
                  {agentsData?.agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Analyst
              </span>
              <Select
                value={problem.assignedTo?.id ?? "none"}
                onValueChange={(v) =>
                  patchMutation.mutate({ assignedToId: v === "none" ? null : v })
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

            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Team
              </span>
              <Select
                value={problem.team?.id != null ? String(problem.team.id) : "none"}
                onValueChange={(v) =>
                  patchMutation.mutate({ teamId: v === "none" ? null : Number(v) })
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

          {/* Priority */}
          <div className="rounded-md border p-4 space-y-2">
            <h3 className="font-medium text-sm">Priority</h3>
            <Select
              value={problem.priority}
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

          {/* Affected service + change ref */}
          <div className="rounded-md border p-4 space-y-3">
            <h3 className="font-medium text-sm">Details</h3>
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Affected Service / CI
              </span>
              <Input
                defaultValue={problem.affectedService ?? ""}
                placeholder="e.g. Payment API"
                className="h-8 text-sm"
                disabled={isTerminal}
                onBlur={(e) =>
                  patchMutation.mutate({
                    affectedService: e.target.value.trim() || null,
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Linked Change Ref.
              </span>
              <Input
                defaultValue={problem.linkedChangeRef ?? ""}
                placeholder="e.g. CHG-0042"
                className="h-8 text-sm font-mono"
                disabled={isTerminal}
                onBlur={(e) =>
                  patchMutation.mutate({
                    linkedChangeRef: e.target.value.trim() || null,
                  })
                }
              />
            </div>
          </div>

          {/* Dates */}
          <div className="rounded-md border p-4 space-y-2">
            <h3 className="font-medium text-sm">Timeline</h3>
            <div className="space-y-2 text-sm">
              {problem.resolvedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-xs uppercase tracking-wide font-medium">
                    Resolved
                  </span>
                  <span>{formatDatetime(problem.resolvedAt)}</span>
                </div>
              )}
              {problem.closedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-xs uppercase tracking-wide font-medium">
                    Closed
                  </span>
                  <span>{formatDatetime(problem.closedAt)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs uppercase tracking-wide font-medium">
                  Opened
                </span>
                <span>{formatDatetime(problem.createdAt)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
