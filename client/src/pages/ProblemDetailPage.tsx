import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import type { Problem, LinkedIncident, LinkedTicket, ProblemNote, ProblemEvent } from "core/constants/problem.ts";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import RichTextEditor from "@/components/RichTextEditor";
import RichTextRenderer from "@/components/RichTextRenderer";
import SearchableSelect from "@/components/SearchableSelect";
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
import { ProblemStatusBadge, ProblemPriorityBadge } from "./ProblemsPage";
import CiLinksPanel from "@/components/CiLinksPanel";
import AssetLinksPanel from "@/components/AssetLinksPanel";
import SaveAsTemplateDialog from "@/components/SaveAsTemplateDialog";
import WatchButton from "@/components/FollowButton";
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
  Lightbulb,
  AlertTriangle,
  Database,
  Ticket,
  BookmarkPlus,
  ArrowRight,
  Bug,
  Clock,
  User,
  Users,
  Server,
  ClipboardCheck,
} from "lucide-react";

// ── Palette helpers ───────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  new:                    "bg-slate-100   text-slate-700  border-slate-200",
  under_investigation:    "bg-blue-50     text-blue-700   border-blue-200",
  root_cause_identified:  "bg-purple-50   text-purple-700 border-purple-200",
  known_error:            "bg-amber-50    text-amber-700  border-amber-200",
  resolved:               "bg-emerald-50  text-emerald-700 border-emerald-200",
  closed:                 "bg-muted       text-muted-foreground border-muted-foreground/20",
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
  workaround:    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  general:       "bg-muted text-muted-foreground",
};

const NOTE_TYPE_DOT: Record<string, string> = {
  investigation: "bg-blue-500",
  rca:           "bg-amber-500",
  workaround:    "bg-emerald-500",
  general:       "bg-border",
};

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
  "problem.pir_completed":      () => "Post-Implementation Review completed",
  "problem.incident_linked":    (m) => `Incident ${m.incidentNumber} linked`,
  "problem.incident_unlinked":  (m) => `Incident #${m.incidentId} unlinked`,
  "problem.incidents_linked":   (m) => `${Array.isArray(m.incidentIds) ? m.incidentIds.length : 1} incident(s) linked`,
  "problem.ticket_linked":      (m) => `Ticket ${m.ticketNumber} linked`,
  "problem.ticket_unlinked":    (m) => `Ticket #${m.ticketId} unlinked`,
  "problem.note_added":         (m) => `Note added (${m.noteType})`,
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
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Shared card shell ─────────────────────────────────────────────────────────

function SectionCard({
  icon: Icon, title, action, children,
}: {
  icon?: React.ElementType; title: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/50 bg-muted/20">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">{title}</span>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ── Inline editable text area ─────────────────────────────────────────────────

function InlineTextArea({
  label, placeholder, value, onSave, disabled,
}: {
  label: string; placeholder: string; value: string | null | undefined;
  onSave: (val: string | null) => void; disabled?: boolean;
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

  function save() { onSave(draft.trim() || null); setEditing(false); }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">{label}</span>
        {!disabled && !editing && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground" onClick={startEdit}>
            <Pencil className="h-3 w-3" />
            {value ? "Edit" : "Add"}
          </Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            ref={ref}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            className="w-full min-h-[120px] text-sm rounded-lg border border-input bg-background px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs gap-1" onClick={save}>
              <Check className="h-3 w-3" />Save
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={`rounded-lg text-sm ${value ? "whitespace-pre-wrap text-foreground" : "italic text-muted-foreground/60"}
            ${!disabled ? "cursor-pointer hover:bg-muted/50 px-3 py-2 -mx-3 transition-colors rounded-lg" : ""}`}
          onClick={startEdit}
        >
          {value ?? placeholder}
        </div>
      )}
    </div>
  );
}

// ── Linked incidents panel ────────────────────────────────────────────────────

function LinkedIncidentsPanel({ incidents, problemId, isTerminal, refetch }: {
  incidents: LinkedIncident[]; problemId: number; isTerminal: boolean; refetch: () => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [incidentInput, setIncidentInput] = useState("");
  const [linkError, setLinkError] = useState("");

  const linkMutation = useMutation({
    mutationFn: async (incidentNumber: string) => {
      await axios.post(`/api/problems/${problemId}/incidents`, { incidentNumber });
    },
    onSuccess: () => { setLinkOpen(false); setIncidentInput(""); setLinkError(""); refetch(); },
    onError: (err: any) => { setLinkError(err?.response?.data?.error ?? "Failed to link incident"); },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (incidentId: number) => { await axios.delete(`/api/problems/${problemId}/incidents/${incidentId}`); },
    onSuccess: () => refetch(),
  });

  return (
    <div className="space-y-3">
      {incidents.length === 0 ? (
        <div className="flex flex-col items-center py-8 gap-2 text-center">
          <Link2 className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No incidents linked yet.</p>
          <p className="text-xs text-muted-foreground/60">Link related incidents to build the recurrence picture.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {incidents.map((inc) => (
            <div key={inc.id} className="group flex items-center justify-between rounded-lg border border-border/60 bg-card px-3 py-2.5 hover:border-border transition-colors">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="font-mono text-[11px] text-muted-foreground shrink-0">{inc.incidentNumber}</span>
                <Link to={`/incidents/${inc.id}`} className="text-sm font-medium truncate hover:text-primary transition-colors">
                  {inc.title}
                </Link>
                <Badge variant="outline" className="text-[10px] shrink-0 capitalize">{inc.status.replace("_", " ")}</Badge>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] text-muted-foreground hidden group-hover:block">linked {formatRelative(inc.linkedAt)}</span>
                {!isTerminal && (
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                    onClick={() => unlinkMutation.mutate(inc.id)}>
                    <Unlink className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isTerminal && (
        <Button variant="outline" size="sm" className="gap-1.5 h-8 w-full" onClick={() => setLinkOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Link incident
        </Button>
      )}

      <Dialog open={linkOpen} onOpenChange={(v) => { setLinkOpen(v); if (!v) { setIncidentInput(""); setLinkError(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Link Incident</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Enter an incident number (e.g. INC0004) or ticket number (e.g. TKT0001).</p>
            <div className="space-y-1.5">
              <Label>Incident or Ticket Number</Label>
              <Input type="text" placeholder="e.g. INC0004" value={incidentInput}
                onChange={(e) => { setIncidentInput(e.target.value); setLinkError(""); }} autoFocus />
              {linkError && <p className="text-xs text-destructive">{linkError}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button onClick={() => { const v = incidentInput.trim(); if (!v) { setLinkError("Enter a valid number"); return; } linkMutation.mutate(v); }} disabled={!incidentInput.trim() || linkMutation.isPending}>Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Linked tickets panel ──────────────────────────────────────────────────────

function LinkedTicketsPanel({ tickets, problemId, isTerminal, refetch }: {
  tickets: LinkedTicket[]; problemId: number; isTerminal: boolean; refetch: () => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [ticketInput, setTicketInput] = useState("");
  const [linkError, setLinkError] = useState("");

  const linkMutation = useMutation({
    mutationFn: async (ticketNumber: string) => { await axios.post(`/api/problems/${problemId}/tickets`, { ticketNumber }); },
    onSuccess: () => { setLinkOpen(false); setTicketInput(""); setLinkError(""); refetch(); },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } };
      setLinkError(e?.response?.data?.error ?? "Failed to link ticket");
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (ticketId: number) => { await axios.delete(`/api/problems/${problemId}/tickets/${ticketId}`); },
    onSuccess: () => refetch(),
  });

  return (
    <div className="space-y-3">
      {tickets.length === 0 ? (
        <div className="flex flex-col items-center py-8 gap-2 text-center">
          <Ticket className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No tickets linked yet.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {tickets.map((t) => (
            <div key={t.id} className="group flex items-center justify-between rounded-lg border border-border/60 bg-card px-3 py-2.5 hover:border-border transition-colors">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="font-mono text-[11px] text-muted-foreground shrink-0">{t.ticketNumber}</span>
                <Link to={`/tickets/${t.id}`} className="truncate hover:text-primary transition-colors text-sm">{t.subject}</Link>
                <span className="text-[10px] capitalize text-muted-foreground shrink-0">{t.status.replace(/_/g, " ")}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] text-muted-foreground hidden group-hover:block">linked {formatRelative(t.linkedAt)}</span>
                {!isTerminal && (
                  <button onClick={() => unlinkMutation.mutate(t.id)} disabled={unlinkMutation.isPending}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-opacity">
                    <Unlink className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isTerminal && (
        <Button size="sm" variant="outline" className="gap-1.5 h-8 w-full" onClick={() => setLinkOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Link ticket
        </Button>
      )}

      <Dialog open={linkOpen} onOpenChange={(v) => { setLinkOpen(v); if (!v) { setTicketInput(""); setLinkError(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Link Ticket</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Enter the ticket number to link (e.g. TKT0042).</p>
            <div className="space-y-1.5">
              <Label>Ticket Number</Label>
              <Input type="text" placeholder="e.g. TKT0042" value={ticketInput}
                onChange={(e) => { setTicketInput(e.target.value); setLinkError(""); }} autoFocus />
              {linkError && <p className="text-xs text-destructive">{linkError}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button onClick={() => { const v = ticketInput.trim(); if (!v) { setLinkError("Enter a valid ticket number"); return; } linkMutation.mutate(v); }} disabled={!ticketInput.trim() || linkMutation.isPending}>Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Notes panel ───────────────────────────────────────────────────────────────

const NOTE_TYPE_OPTIONS = [
  { value: "investigation", label: "Investigation" },
  { value: "rca",           label: "Root Cause Analysis" },
  { value: "workaround",    label: "Workaround" },
  { value: "general",       label: "General Note" },
];

function NotesPanel({ notes, problemId, isTerminal, refetch }: {
  notes: ProblemNote[]; problemId: number; isTerminal: boolean; refetch: () => void;
}) {
  const { control, handleSubmit, reset } = useForm<CreateProblemNoteInput>({
    resolver: zodResolver(createProblemNoteSchema),
    defaultValues: { noteType: "investigation", body: " " },
  });

  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyText, setBodyText] = useState("");

  const handleEditorChange = useCallback((html: string, text: string) => {
    setBodyHtml(html); setBodyText(text);
  }, []);

  const addNote = useMutation({
    mutationFn: async (data: CreateProblemNoteInput) => {
      await axios.post(`/api/problems/${problemId}/notes`, { ...data, body: bodyText, bodyHtml });
    },
    onSuccess: () => { reset({ noteType: "investigation", body: " " }); setBodyHtml(""); setBodyText(""); refetch(); },
  });

  const deleteNote = useMutation({
    mutationFn: async (noteId: number) => { await axios.delete(`/api/problems/${problemId}/notes/${noteId}`); },
    onSuccess: () => refetch(),
  });

  return (
    <div className="space-y-4">
      {notes.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-2 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No investigation notes yet.</p>
        </div>
      ) : (
        <ol className="space-y-0">
          {notes.map((note) => {
            const dot = NOTE_TYPE_DOT[note.noteType] ?? "bg-border";
            const cls = NOTE_TYPE_STYLES[note.noteType] ?? NOTE_TYPE_STYLES.general;
            return (
              <li key={note.id} className="flex gap-3 group">
                <div className="flex flex-col items-center pt-2">
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${dot}`} />
                  <div className="w-px flex-1 bg-border/60 mt-1 mb-1" />
                </div>
                <div className="flex-1 pb-4 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
                      {NOTE_TYPE_LABEL[note.noteType] ?? note.noteType}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {note.author?.name ?? "System"} · {formatRelative(note.createdAt)}
                    </span>
                    {!isTerminal && (
                      <Button variant="ghost" size="sm"
                        className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => deleteNote.mutate(note.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <RichTextRenderer content={note.bodyHtml ?? note.body} />
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {!isTerminal && (
        <form onSubmit={handleSubmit((d) => addNote.mutate(d))}
          className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Controller name="noteType" control={control}
              render={({ field }) => (
                <SearchableSelect
                  value={field.value}
                  onChange={field.onChange}
                  options={NOTE_TYPE_OPTIONS}
                  className="h-8 text-xs w-44"
                />
              )}
            />
            <span className="text-[11px] text-muted-foreground">
              RCA note auto-advances status to "Root Cause Identified"
            </span>
          </div>
          <RichTextEditor
            content={bodyHtml}
            onChange={handleEditorChange}
            placeholder="Add investigation notes… Use @ to mention a team member"
            minHeight="100px"
            disabled={addNote.isPending}
            enableMentions
          />
          {addNote.error && <ErrorAlert error={addNote.error} fallback="Failed to add note" />}
          <div className="flex justify-end">
            <Button type="submit" size="sm" className="gap-1.5" disabled={!bodyText.trim() || addNote.isPending}>
              {addNote.isPending ? "Adding…" : <><Plus className="h-3.5 w-3.5" />Add Note</>}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Audit Trail ───────────────────────────────────────────────────────────────

function EventTrail({ events }: { events: ProblemEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center py-10 gap-2 text-center">
        <Activity className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No audit events yet.</p>
      </div>
    );
  }
  return (
    <ol className="space-y-3">
      {[...events].reverse().map((ev) => {
        const label = EVENT_LABELS[ev.action]?.(ev.meta) ?? ev.action;
        return (
          <li key={ev.id} className="flex items-start gap-3">
            <div className="mt-1.5 h-2 w-2 rounded-full bg-border shrink-0" />
            <div>
              <p className="text-sm">{label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {ev.actor?.name ?? "System"} · {formatRelative(ev.createdAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ── Cluster hint banner ───────────────────────────────────────────────────────

function ClusterHintBanner({ hint }: { hint: Problem["clusterHint"] }) {
  if (!hint || hint.recurrenceCount < 2) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-500/[0.04] px-4 py-3.5 flex items-start gap-3">
      <div className="h-7 w-7 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
      </div>
      <div>
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          Recurring incident cluster detected
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
          {hint.recurrenceCount} incidents linked
          {hint.commonAffectedSystem ? ` · most affecting "${hint.commonAffectedSystem}"` : ""}
          {hint.earliestIncidentAt ? ` · earliest ${formatRelative(hint.earliestIncidentAt)}` : ""}.
          A pattern-based clustering engine will provide deeper analysis in a future release.
        </p>
      </div>
    </div>
  );
}

// ── Post-Implementation Review panel ─────────────────────────────────────────

const PIR_OUTCOME_OPTIONS = [
  { value: "successful",          label: "Successful — objectives fully met" },
  { value: "partially_successful",label: "Partially Successful — some issues remain" },
  { value: "unsuccessful",        label: "Unsuccessful — further action required" },
] as const;

type PirOutcome = "successful" | "partially_successful" | "unsuccessful";

function PirPanel({
  problem, isTerminal, onSave,
}: {
  problem: Problem;
  isTerminal: boolean;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [summary,     setSummary]     = useState(problem.pirSummary     ?? "");
  const [outcome,     setOutcome]     = useState<PirOutcome | "">(problem.pirOutcome ?? "");
  const [actionItems, setActionItems] = useState(problem.pirActionItems ?? "");
  const [saving,      setSaving]      = useState(false);

  const isDone = !!problem.pirCompletedAt;

  async function handleSave() {
    setSaving(true);
    onSave({
      pirSummary:    summary     || null,
      pirOutcome:    outcome     || null,
      pirActionItems:actionItems || null,
    });
    setSaving(false);
  }

  async function handleMarkComplete() {
    setSaving(true);
    onSave({
      pirSummary:    summary     || null,
      pirOutcome:    outcome     || null,
      pirActionItems:actionItems || null,
      pirCompletedAt: new Date().toISOString(),
    });
    setSaving(false);
  }

  return (
    <div className="space-y-5">
      {isDone ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-500/[0.06] px-4 py-2.5">
          <ClipboardCheck className="h-4 w-4 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            PIR completed · {formatDatetime(problem.pirCompletedAt)}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-500/[0.04] px-4 py-2.5">
          <ClipboardCheck className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Post-Implementation Review is not yet completed for this problem.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Outcome</label>
        <div className="flex flex-wrap gap-2">
          {PIR_OUTCOME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={isDone && isTerminal}
              onClick={() => setOutcome(opt.value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                outcome === opt.value
                  ? opt.value === "successful"
                    ? "border-emerald-400 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : opt.value === "partially_successful"
                    ? "border-amber-400 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    : "border-red-400 bg-red-500/10 text-red-700 dark:text-red-400"
                  : "border-border text-muted-foreground hover:border-foreground/40"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Review Summary</label>
        <textarea
          rows={5}
          placeholder="Summarise what happened, the effectiveness of the resolution, and lessons learned."
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          disabled={isDone && isTerminal}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y disabled:opacity-60"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Action Items</label>
        <textarea
          rows={4}
          placeholder="List follow-up actions, owners, and due dates. One item per line."
          value={actionItems}
          onChange={(e) => setActionItems(e.target.value)}
          disabled={isDone && isTerminal}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y disabled:opacity-60"
        />
      </div>

      {(!isDone || !isTerminal) && (
        <div className="flex items-center gap-2 justify-end border-t border-border/50 pt-4">
          <Button type="button" variant="outline" size="sm" onClick={handleSave} disabled={saving}>
            Save Draft
          </Button>
          {!isDone && (
            <Button type="button" size="sm" onClick={handleMarkComplete} disabled={saving || !outcome}>
              <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />
              Mark PIR Complete
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── ProblemDetailPage ─────────────────────────────────────────────────────────

const PRIORITY_OPTIONS = [
  { value: "low",    label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high",   label: "High" },
  { value: "urgent", label: "Urgent" },
];

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

  const [templateDialog, setTemplateDialog] = useState(false);

  const patchMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { data } = await axios.patch(`/api/problems/${id}`, patch);
      return data;
    },
    onSuccess: () => refetch(),
  });

  if (isLoading) {
    return (
      <div className="space-y-4 p-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !problem) return <ErrorAlert error={error} fallback="Problem not found" />;

  const isTerminal = terminalProblemStatuses.includes(problem.status);
  const availableTransitions = problemStatusTransitions[problem.status as ProblemStatus] ?? [];
  const statusPalette = STATUS_COLORS[problem.status] ?? STATUS_COLORS.new;

  const agentOptions = [
    { value: "none", label: "Unassigned" },
    ...(agentsData?.agents ?? []).map((a) => ({ value: a.id, label: a.name })),
  ];

  const teamOptions = [
    { value: "none", label: "No team" },
    ...(teamsData?.teams ?? []).map((t) => ({ value: String(t.id), label: t.name })),
  ];

  return (
    <div className="flex flex-col min-h-full bg-muted/20">

      {/* ── Header ── */}
      <div className="border-b bg-background shadow-sm">
        <div className="px-6 pt-3 pb-0">
          <BackLink to="/problems">Back to Problems</BackLink>
        </div>

        <div className="px-6 py-4">
          {/* Number + badges row */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-muted-foreground">
                <Bug className="h-3 w-3" />
                {problem.problemNumber}
              </span>
              {problem.isKnownError && (
                <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-orange-700">
                  <BookMarked className="h-3 w-3" />
                  Known Error · KEDB
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
              <WatchButton entityPath="problems" entityId={problem.id} />
              <Button type="button" variant="outline" size="sm" className="gap-1.5 h-8"
                onClick={() => setTemplateDialog(true)}>
                <BookmarkPlus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Save as Template</span>
              </Button>
              {!isTerminal && availableTransitions.map((nextStatus) => (
                <Button key={nextStatus} size="sm"
                  variant={nextStatus === "closed" || nextStatus === "resolved" ? "default" : "outline"}
                  className="h-8 gap-1.5"
                  disabled={patchMutation.isPending}
                  onClick={() => patchMutation.mutate({ status: nextStatus })}>
                  <ArrowRight className="h-3.5 w-3.5" />
                  {problemStatusLabel[nextStatus]}
                </Button>
              ))}
            </div>
          </div>

          {/* Title */}
          <h1 className="mt-2 text-xl font-semibold leading-snug">{problem.title}</h1>

          {/* Status chips */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${statusPalette}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
              {problemStatusLabel[problem.status] ?? problem.status}
            </span>
            <ProblemPriorityBadge priority={problem.priority} />
            {problem.affectedService && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1 text-[11px] text-muted-foreground bg-muted/30">
                <Server className="h-3 w-3" />
                {problem.affectedService}
              </span>
            )}
            {problem.owner && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1 text-[11px] text-muted-foreground bg-muted/30">
                <User className="h-3 w-3" />
                {problem.owner.name}
              </span>
            )}
          </div>
        </div>
      </div>

      {patchMutation.error && (
        <div className="px-6 pt-3">
          <ErrorAlert error={patchMutation.error} fallback="Failed to update problem" />
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex-1 px-6 py-5">
        <ClusterHintBanner hint={problem.clusterHint} />

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">

          {/* ── Main content ── */}
          <div className="space-y-4 min-w-0">

            {/* Description */}
            {problem.description && (
              <SectionCard icon={FileText} title="Description">
                <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                  {problem.description}
                </p>
              </SectionCard>
            )}

            {/* Tabbed investigation area */}
            <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
              <Tabs defaultValue="notes">
                <div className="border-b px-4 bg-muted/20">
                  <TabsList className="h-auto bg-transparent p-0 gap-0 rounded-none">
                    {[
                      { value: "notes",    icon: FileText,        label: "Investigation Notes" },
                      { value: "rca",      icon: Lightbulb,       label: "RCA & Workaround" },
                      { value: "pir",      icon: ClipboardCheck,  label: "PIR", badge: problem.pirCompletedAt ? 1 : 0, badgeLabel: "Done" },
                      { value: "incidents",icon: Link2,           label: "Incidents",   badge: problem.linkedIncidents?.length ?? 0 },
                      { value: "tickets",  icon: Ticket,          label: "Tickets",     badge: problem.linkedTickets?.length ?? 0 },
                      { value: "history",  icon: Activity,        label: "Audit Trail" },
                    ].map(({ value, icon: Icon, label, badge, badgeLabel }) => (
                      <TabsTrigger key={value} value={value}
                        className="flex items-center gap-1.5 px-3 py-3 text-[12px] font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground transition-colors">
                        <Icon className="h-3 w-3" />
                        {label}
                        {badge !== undefined && badge > 0 && (
                          <span className="ml-0.5 rounded-full bg-primary/10 text-primary px-1.5 text-[10px] font-semibold">{badgeLabel ?? badge}</span>
                        )}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>

                <TabsContent value="notes" className="p-4 mt-0">
                  <NotesPanel notes={problem.notes ?? []} problemId={Number(id)} isTerminal={isTerminal} refetch={refetch} />
                </TabsContent>

                <TabsContent value="rca" className="p-4 mt-0 space-y-5">
                  <InlineTextArea
                    label="Root Cause Analysis"
                    placeholder="Describe the root cause in detail. Include contributing factors, timeline, and evidence."
                    value={problem.rootCause}
                    disabled={isTerminal}
                    onSave={(v) => patchMutation.mutate({ rootCause: v })}
                  />
                  <div className="border-t border-border/50 pt-5">
                    <InlineTextArea
                      label="Workaround"
                      placeholder="Document the workaround. Include step-by-step instructions for affected users."
                      value={problem.workaround}
                      disabled={isTerminal}
                      onSave={(v) => patchMutation.mutate({ workaround: v })}
                    />
                  </div>
                  {problem.linkedChangeRef && (
                    <div className="border-t border-border/50 pt-5">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2">Linked Change</p>
                      <p className="text-sm font-mono text-muted-foreground">{problem.linkedChangeRef}</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="pir" className="p-4 mt-0">
                  <PirPanel problem={problem} isTerminal={isTerminal} onSave={(patch) => patchMutation.mutate(patch)} />
                </TabsContent>

                <TabsContent value="incidents" className="p-4 mt-0">
                  <LinkedIncidentsPanel incidents={problem.linkedIncidents ?? []} problemId={Number(id)} isTerminal={isTerminal} refetch={refetch} />
                </TabsContent>

                <TabsContent value="tickets" className="p-4 mt-0">
                  <LinkedTicketsPanel tickets={problem.linkedTickets ?? []} problemId={Number(id)} isTerminal={isTerminal} refetch={refetch} />
                </TabsContent>

                <TabsContent value="history" className="p-4 mt-0">
                  <EventTrail events={problem.events ?? []} />
                </TabsContent>
              </Tabs>
            </div>
          </div>

          {/* ── Sidebar ── */}
          <div className="space-y-4">

            {/* Ownership */}
            <SectionCard icon={Users} title="Ownership">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Problem Manager</span>
                  <SearchableSelect
                    value={problem.owner?.id ?? "none"}
                    onChange={(v) => patchMutation.mutate({ ownerId: v === "none" ? null : v })}
                    disabled={isTerminal}
                    placeholder="Unowned"
                    options={agentOptions}
                  />
                </div>
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Analyst</span>
                  <SearchableSelect
                    value={problem.assignedTo?.id ?? "none"}
                    onChange={(v) => patchMutation.mutate({ assignedToId: v === "none" ? null : v })}
                    disabled={isTerminal}
                    placeholder="Unassigned"
                    options={agentOptions}
                  />
                </div>
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Team</span>
                  <SearchableSelect
                    value={problem.team?.id != null ? String(problem.team.id) : "none"}
                    onChange={(v) => patchMutation.mutate({ teamId: v === "none" ? null : Number(v) })}
                    disabled={isTerminal}
                    placeholder="No team"
                    options={teamOptions}
                  />
                </div>
              </div>
            </SectionCard>

            {/* Priority */}
            <SectionCard icon={AlertTriangle} title="Priority">
              <SearchableSelect
                value={problem.priority}
                onChange={(v) => patchMutation.mutate({ priority: v })}
                disabled={isTerminal}
                placeholder="Select priority…"
                options={PRIORITY_OPTIONS}
              />
            </SectionCard>

            {/* Details */}
            <SectionCard icon={Server} title="Details">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Affected Service / CI</span>
                  <Input
                    defaultValue={problem.affectedService ?? ""}
                    placeholder="e.g. Payment API"
                    className="h-9 text-sm"
                    disabled={isTerminal}
                    onBlur={(e) => patchMutation.mutate({ affectedService: e.target.value.trim() || null })}
                  />
                </div>
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Linked Change Ref.</span>
                  <Input
                    defaultValue={problem.linkedChangeRef ?? ""}
                    placeholder="e.g. CRQ0042"
                    className="h-9 text-sm font-mono"
                    disabled={isTerminal}
                    onBlur={(e) => patchMutation.mutate({ linkedChangeRef: e.target.value.trim() || null })}
                  />
                </div>
              </div>
            </SectionCard>

            {/* Affected CIs */}
            <SectionCard icon={Database} title="Affected CIs">
              <CiLinksPanel
                entityType="problems"
                entityId={Number(id)}
                linkedCis={problem.ciLinks ?? []}
                readonly={isTerminal}
                onChanged={() => refetch()}
              />
            </SectionCard>

            {/* Affected Assets */}
            <SectionCard icon={Server} title="Affected Assets">
              <AssetLinksPanel
                entityType="problems"
                entityId={Number(id)}
                readonly={isTerminal}
              />
            </SectionCard>

            {/* Timeline */}
            <SectionCard icon={Clock} title="Timeline">
              <div className="space-y-2 text-sm">
                {problem.resolvedAt && (
                  <div className="flex justify-between">
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Resolved</span>
                    <span className="text-xs font-medium">{formatDatetime(problem.resolvedAt)}</span>
                  </div>
                )}
                {problem.closedAt && (
                  <div className="flex justify-between">
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Closed</span>
                    <span className="text-xs font-medium">{formatDatetime(problem.closedAt)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Opened</span>
                  <span className="text-xs font-medium">{formatDatetime(problem.createdAt)}</span>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>

      <SaveAsTemplateDialog
        open={templateDialog}
        onOpenChange={setTemplateDialog}
        type="problem"
        defaultTitle={problem.title}
        defaultBody={problem.description ?? ""}
      />
    </div>
  );
}
