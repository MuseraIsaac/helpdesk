import { useState, useCallback, useRef, useEffect } from "react";
import { useParams, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { type Incident } from "core/constants/incident.ts";
import { incidentStatusLabel, incidentStatusTransitions } from "core/constants/incident-status.ts";
import type { IncidentStatus } from "core/constants/incident-status.ts";
import { incidentPriorityLabel, incidentPriorityShortLabel, incidentPriorities } from "core/constants/incident-priority.ts";
import type { IncidentPriority } from "core/constants/incident-priority.ts";
import {
  incidentUpdateTypes,
  incidentUpdateTypeLabel,
} from "core/constants/incident-update-type.ts";
import {
  createIncidentUpdateSchema,
  type CreateIncidentUpdateInput,
} from "core/schemas/incidents.ts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import RichTextEditor from "@/components/RichTextEditor";
import RichTextRenderer from "@/components/RichTextRenderer";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import SearchableSelect from "@/components/SearchableSelect";
import BackLink from "@/components/BackLink";
import ErrorAlert from "@/components/ErrorAlert";
import {
  IncidentPriorityBadge,
  IncidentStatusBadge,
  SlaBadgeInline,
} from "./IncidentsPage";
import NewProblemDialog from "@/components/NewProblemDialog";
import CiLinksPanel from "@/components/CiLinksPanel";
import AssetLinksPanel from "@/components/AssetLinksPanel";
import SaveAsTemplateDialog from "@/components/SaveAsTemplateDialog";
import IncidentPresenceIndicator from "@/components/IncidentPresenceIndicator";
import FollowButton from "@/components/FollowButton";
import BridgeCallButton from "@/components/BridgeCallButton";
import { useIncidentPresence } from "@/hooks/useIncidentPresence";
import { useSession } from "@/lib/auth-client";
import {
  Flame,
  Users,
  Clock,
  UserCog,
  Shield,
  Server,
  MessageSquare,
  CheckCircle2,
  Pencil,
  Save,
  X,
  GitMerge,
  Link2,
  BookmarkPlus,
  Activity,
  ArrowRight,
  AlertTriangle,
  Database,
  Paperclip,
  Image,
  FileText,
} from "lucide-react";

// ── Palette helpers ───────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  open:          "bg-blue-50     text-blue-700   border-blue-200",
  acknowledged:  "bg-purple-50   text-purple-700 border-purple-200",
  in_progress:   "bg-orange-50   text-orange-700 border-orange-200",
  resolved:      "bg-emerald-50  text-emerald-700 border-emerald-200",
  closed:        "bg-muted       text-muted-foreground border-muted-foreground/20",
};

const UPDATE_TYPE_STYLES: Record<string, string> = {
  update:     "bg-muted/60      text-muted-foreground",
  workaround: "bg-amber-500/15  text-amber-700 dark:text-amber-400",
  resolution: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  escalation: "bg-red-500/15    text-destructive",
  all_clear:  "bg-blue-500/15   text-blue-700 dark:text-blue-400",
};

const UPDATE_TYPE_DOT: Record<string, string> = {
  update:     "bg-muted-foreground/40",
  workaround: "bg-amber-500",
  resolution: "bg-emerald-500",
  escalation: "bg-destructive",
  all_clear:  "bg-blue-500",
};

const EVENT_LABELS: Record<string, (meta: Record<string, unknown>) => string> = {
  "incident.created":           ()    => "Incident declared",
  "incident.major_declared":    ()    => "Flagged as major incident",
  "incident.major_cleared":     ()    => "Major incident flag removed",
  "incident.status_changed":    (m)   => `Status: ${incidentStatusLabel[m.from as IncidentStatus] ?? m.from} → ${incidentStatusLabel[m.to as IncidentStatus] ?? m.to}`,
  "incident.priority_changed":  (m)   => `Priority: ${incidentPriorityShortLabel[m.from as IncidentPriority] ?? m.from} → ${incidentPriorityShortLabel[m.to as IncidentPriority] ?? m.to}`,
  "incident.commander_changed": (m)   => m.to ? "Commander assigned" : "Commander removed",
  "incident.assigned":          (m)   => m.to ? "Assignee changed" : "Assignee removed",
  "incident.update_added":      (m)   => `Update added (${incidentUpdateTypeLabel[m.updateType as string] ?? m.updateType})`,
  "incident.promoted_to_problem": (m) => `Promoted to problem ${m.problemNumber ?? ""}`,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(iso));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Shared section card ───────────────────────────────────────────────────────

function SectionCard({
  icon: Icon, title, children, noPad = false,
}: {
  icon?: React.ElementType; title: string; children: React.ReactNode; noPad?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-muted/20">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">{title}</span>
      </div>
      <div className={noPad ? "" : "p-4"}>{children}</div>
    </div>
  );
}

// ── Update timeline ───────────────────────────────────────────────────────────

const UPDATE_TYPE_OPTIONS = incidentUpdateTypes.map((t) => ({
  value: t,
  label: incidentUpdateTypeLabel[t],
}));

interface StagedFile { id: number; filename: string; size: number; mimeType: string; }

function AttachmentList({ attachments, incidentId }: {
  attachments: { id: number; filename: string; mimeType: string; size: number }[];
  incidentId: number;
}) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((a) => {
        const isImage = a.mimeType.startsWith("image/");
        const url = `/api/incidents/${incidentId}/attachments/${a.id}/download`;
        return (
          <a key={a.id} href={url} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            {isImage
              ? <Image className="h-3.5 w-3.5 shrink-0" />
              : <FileText className="h-3.5 w-3.5 shrink-0" />}
            <span className="max-w-[140px] truncate">{a.filename}</span>
            <span className="opacity-60">({formatBytes(a.size)})</span>
          </a>
        );
      })}
    </div>
  );
}

function UpdateTimeline({ updates = [], incidentId, status }: {
  updates: Incident["updates"]; incidentId: number; status: string;
}) {
  const queryClient = useQueryClient();
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { handleSubmit, reset, control, setValue } = useForm<CreateIncidentUpdateInput>({
    resolver: zodResolver(createIncidentUpdateSchema),
    defaultValues: { updateType: "update", body: "" },
  });

  const handleEditorChange = useCallback((html: string, text: string) => {
    setBodyHtml(html);
    setBodyText(text);
    setValue("body", text, { shouldValidate: false });
  }, [setValue]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: StagedFile[] = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const { data } = await axios.post<StagedFile>(
          `/api/incidents/${incidentId}/attachments/upload`,
          fd,
          { headers: { "Content-Type": "multipart/form-data" } }
        );
        uploaded.push(data);
      }
      setStagedFiles((prev) => [...prev, ...uploaded]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeStaged(id: number) {
    setStagedFiles((prev) => prev.filter((f) => f.id !== id));
  }

  const addUpdate = useMutation({
    mutationFn: async (formData: CreateIncidentUpdateInput) => {
      const { data: result } = await axios.post(
        `/api/incidents/${incidentId}/updates`,
        {
          updateType: formData.updateType,
          body: bodyText || " ",
          bodyHtml,
          attachmentIds: stagedFiles.map((f) => f.id),
        }
      );
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incident", String(incidentId)] });
      reset({ updateType: "update", body: " " });
      setBodyHtml(""); setBodyText(""); setEditorKey((k) => k + 1);
      setStagedFiles([]);
    },
  });

  const isClosed = status === "closed";

  return (
    <div className="space-y-4">
      {updates.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-2 text-center">
          <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No updates posted yet.</p>
          <p className="text-xs text-muted-foreground/60">Post the first status update to keep stakeholders informed.</p>
        </div>
      ) : (
        <ol className="space-y-0">
          {updates.map((u) => {
            const cls = UPDATE_TYPE_STYLES[u.updateType] ?? UPDATE_TYPE_STYLES.update;
            const dot = UPDATE_TYPE_DOT[u.updateType] ?? "bg-border";
            return (
              <li key={u.id} className="flex gap-3">
                <div className="flex flex-col items-center pt-2">
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${dot}`} />
                  <div className="w-px flex-1 bg-border/60 mt-1 mb-1" />
                </div>
                <div className="flex-1 pb-4 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
                      {incidentUpdateTypeLabel[u.updateType] ?? u.updateType}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {u.author?.name ?? "System"} · {formatDate(u.createdAt)}
                    </span>
                  </div>
                  {u.bodyHtml
                    ? <RichTextRenderer content={u.bodyHtml} />
                    : <p className="text-sm whitespace-pre-wrap leading-relaxed">{u.body}</p>
                  }
                  <AttachmentList attachments={u.attachments ?? []} incidentId={incidentId} />
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {!isClosed && (
        <form onSubmit={handleSubmit((d) => addUpdate.mutate(d))}
          className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium">Post update</span>
          </div>
          <Controller name="updateType" control={control}
            render={({ field }) => (
              <SearchableSelect
                value={field.value}
                onChange={field.onChange}
                options={UPDATE_TYPE_OPTIONS}
                className="w-48 h-8 text-xs"
              />
            )}
          />
          <RichTextEditor
            key={editorKey}
            content={bodyHtml}
            onChange={handleEditorChange}
            placeholder="What's the current status? Any workarounds? Impact updates? Use @ to mention someone"
            minHeight="90px"
            disabled={addUpdate.isPending}
            enableMentions
          />

          {/* Staged attachments */}
          {stagedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {stagedFiles.map((f) => {
                const isImage = f.mimeType.startsWith("image/");
                return (
                  <span key={f.id}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                    {isImage ? <Image className="h-3.5 w-3.5 shrink-0" /> : <FileText className="h-3.5 w-3.5 shrink-0" />}
                    <span className="max-w-[120px] truncate">{f.filename}</span>
                    <span className="opacity-60">({formatBytes(f.size)})</span>
                    <button type="button" onClick={() => removeStaged(f.id)}
                      className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {addUpdate.error && <ErrorAlert error={addUpdate.error} fallback="Failed to post update" />}

          <div className="flex items-center justify-between gap-2">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
                className="hidden"
                onChange={handleFileChange}
                disabled={uploading || addUpdate.isPending}
              />
              <Button type="button" variant="ghost" size="sm" className="gap-1.5 h-8 text-muted-foreground"
                disabled={uploading || addUpdate.isPending}
                onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="h-3.5 w-3.5" />
                {uploading ? "Uploading…" : "Attach"}
              </Button>
            </div>
            <Button type="submit" size="sm" className="gap-1.5" disabled={addUpdate.isPending || uploading || !bodyText.trim()}>
              {addUpdate.isPending ? "Posting…" : <><MessageSquare className="h-3.5 w-3.5" />Post Update</>}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Assignment panel ──────────────────────────────────────────────────────────

function AssignmentPanel({ incident }: { incident: Incident }) {
  const queryClient = useQueryClient();
  const [editingCommander, setEditingCommander] = useState(false);
  const [commanderValue, setCommanderValue] = useState(incident.commander?.id ?? "none");

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: { id: string; name: string }[] }>("/api/agents");
      return data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { data } = await axios.patch(`/api/incidents/${incident.id}`, patch);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incident", String(incident.id)] });
      setEditingCommander(false);
    },
  });

  const isClosed = incident.status === "closed";

  const agentOptions = [
    { value: "none", label: "Unassigned" },
    ...(agentsData?.agents ?? []).map((a) => ({ value: a.id, label: a.name })),
  ];

  return (
    <div className="space-y-4">
      {/* Commander */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Incident Commander</p>
        {editingCommander ? (
          <div className="flex items-center gap-2">
            <SearchableSelect
              value={commanderValue}
              onChange={setCommanderValue}
              options={agentOptions}
              className="flex-1 h-8 text-sm"
            />
            <Button size="sm" variant="ghost" className="h-8 px-2 shrink-0"
              onClick={() => updateMutation.mutate({ commanderId: commanderValue === "none" ? null : commanderValue })}
              disabled={updateMutation.isPending}>
              <Save className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 px-2 shrink-0" onClick={() => setEditingCommander(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {incident.commander ? (
                <>
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary shrink-0">
                    {incident.commander.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium">{incident.commander.name}</span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground italic">Unassigned</span>
              )}
            </div>
            {!isClosed && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-muted-foreground"
                onClick={() => setEditingCommander(true)}>
                <Pencil className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Assigned agent */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Assigned Agent</p>
        {isClosed ? (
          <div className="flex items-center gap-2">
            {incident.assignedTo ? (
              <>
                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground shrink-0">
                  {incident.assignedTo.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <span className="text-sm">{incident.assignedTo.name}</span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground italic">Unassigned</span>
            )}
          </div>
        ) : (
          <SearchableSelect
            value={incident.assignedTo?.id ?? "none"}
            onChange={(val) => updateMutation.mutate({ assignedToId: val === "none" ? null : val })}
            options={agentOptions}
            className="h-9 text-sm"
          />
        )}
      </div>
    </div>
  );
}

// ── Major incident toggle ─────────────────────────────────────────────────────

function MajorIncidentToggle({ incident }: { incident: Incident }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (isMajor: boolean) => {
      const { data } = await axios.patch(`/api/incidents/${incident.id}`, { isMajor });
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["incident", String(incident.id)] }),
  });

  if (incident.status === "closed") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Flame className={`h-3.5 w-3.5 ${incident.isMajor ? "text-destructive" : ""}`} />
        {incident.isMajor ? "Was major incident" : "Not a major incident"}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <Switch
        id="major-toggle"
        checked={incident.isMajor}
        onCheckedChange={(v) => mutation.mutate(v)}
        disabled={mutation.isPending}
      />
      <Label htmlFor="major-toggle" className="cursor-pointer flex items-center gap-1.5 text-sm">
        <Flame className={`h-3.5 w-3.5 ${incident.isMajor ? "text-destructive" : "text-muted-foreground"}`} />
        {incident.isMajor ? "Major incident" : "Mark as major"}
      </Label>
    </div>
  );
}

// ── Lifecycle action buttons ──────────────────────────────────────────────────

function LifecycleActions({ incident }: { incident: Incident }) {
  const queryClient = useQueryClient();
  const transitionMutation = useMutation({
    mutationFn: async (status: IncidentStatus) => {
      const { data } = await axios.patch(`/api/incidents/${incident.id}`, { status });
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["incident", String(incident.id)] }),
  });

  const validNext = incidentStatusTransitions[incident.status as IncidentStatus] ?? [];
  const LABELS: Partial<Record<IncidentStatus, string>> = {
    acknowledged: "Acknowledge",
    in_progress:  "Mark In Progress",
    resolved:     "Mark Resolved",
    closed:       "Close Incident",
  };

  if (validNext.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {validNext.map((next) => (
        <Button key={next} size="sm"
          variant={next === "closed" ? "outline" : "default"}
          className="h-8 gap-1.5"
          disabled={transitionMutation.isPending}
          onClick={() => transitionMutation.mutate(next)}>
          <ArrowRight className="h-3.5 w-3.5" />
          {LABELS[next] ?? next}
        </Button>
      ))}
    </div>
  );
}

// ── Event audit trail ─────────────────────────────────────────────────────────

function EventTrail({ events = [] }: { events: Incident["events"] }) {
  if (!events || events.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 gap-2 text-center">
        <Activity className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      </div>
    );
  }
  return (
    <ol className="space-y-3">
      {events.map((ev) => {
        const labelFn = EVENT_LABELS[ev.action];
        const label = labelFn ? labelFn(ev.meta) : ev.action.replace("incident.", "").replace(/_/g, " ");
        return (
          <li key={ev.id} className="flex items-start gap-3">
            <div className="mt-1.5 h-2 w-2 rounded-full bg-border shrink-0" />
            <div>
              <p className="text-sm capitalize">{label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {ev.actor && <>{ev.actor.name} · </>}
                {formatDate(ev.createdAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ── Inline editable field ─────────────────────────────────────────────────────

function InlineField({
  label, value, onSave, placeholder,
}: {
  label: string; value: string | number | null | undefined;
  onSave: (val: string | number | null) => void; placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">{label}</p>
      {editing ? (
        <div className="flex items-center gap-1.5">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)}
            className="h-8 text-sm" placeholder={placeholder} autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") { onSave(draft || null); setEditing(false); }
              if (e.key === "Escape") { setDraft(String(value ?? "")); setEditing(false); }
            }}
          />
          <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { onSave(draft || null); setEditing(false); }}>
            <Save className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setDraft(String(value ?? "")); setEditing(false); }}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <button
          className="flex items-center gap-1.5 text-sm text-left hover:text-foreground/70 transition-colors group w-full"
          onClick={() => setEditing(true)}>
          {value !== null && value !== undefined && value !== "" ? (
            <span>{value}</span>
          ) : (
            <span className="text-muted-foreground italic">{placeholder ?? "—"}</span>
          )}
          <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity shrink-0" />
        </button>
      )}
    </div>
  );
}

// ── IncidentDetailPage ────────────────────────────────────────────────────────

const PRIORITY_OPTIONS = incidentPriorities.map((p) => ({
  value: p,
  label: incidentPriorityLabel[p],
}));

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [templateDialog, setTemplateDialog] = useState(false);
  const { data: session } = useSession();

  const { data: incident, isLoading, error } = useQuery({
    queryKey: ["incident", id],
    queryFn: async () => {
      const { data } = await axios.get<Incident>(`/api/incidents/${id}`);
      return data;
    },
    refetchInterval: 30_000,
  });

  const incidentIdNum = incident?.id ?? 0;
  const viewers = useIncidentPresence(incidentIdNum, incidentIdNum > 0);

  const updateMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { data } = await axios.patch(`/api/incidents/${id}`, patch);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["incident", id] }),
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

  if (error || !incident) return <ErrorAlert error={error} fallback="Incident not found" />;

  const statusPalette = STATUS_COLORS[incident.status] ?? STATUS_COLORS.open;
  const isClosed = incident.status === "closed";

  return (
    <div className="flex flex-col min-h-full bg-muted/20">

      {/* ── Header ── */}
      <div className="border-b bg-background shadow-sm">
        <div className="px-6 pt-3 pb-0">
          <BackLink to="/incidents">Back to Incidents</BackLink>
        </div>

        <div className="px-6 py-4">
          {/* Number + action row */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-muted-foreground">
                <AlertTriangle className="h-3 w-3" />
                {incident.incidentNumber}
              </span>
              {incident.isMajor && (
                <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-[11px] font-semibold text-destructive">
                  <Flame className="h-3 w-3" />
                  Major Incident
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
              {/* Live presence: blinking eye shows who else is viewing */}
              {session?.user && (
                <IncidentPresenceIndicator
                  viewers={viewers}
                  currentUserId={session.user.id}
                />
              )}
              <FollowButton entityPath="incidents" entityId={incident.id} />
              <BridgeCallButton
                incidentId={incident.id}
                bridgeCallUrl={incident.bridgeCallUrl ?? null}
                bridgeCallProvider={incident.bridgeCallProvider ?? null}
                bridgeCallCreatedAt={incident.bridgeCallCreatedAt ?? null}
                canManage={
                  session?.user?.role === "admin" ||
                  session?.user?.role === "supervisor" ||
                  session?.user?.role === "agent"
                }
              />
              <Button type="button" variant="outline" size="sm" className="gap-1.5 h-8"
                onClick={() => setTemplateDialog(true)}>
                <BookmarkPlus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Save as Template</span>
              </Button>
              <LifecycleActions incident={incident} />
            </div>
          </div>

          {/* Title */}
          <h1 className="mt-2 text-xl font-semibold leading-snug">{incident.title}</h1>

          {/* Status chips */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${statusPalette}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
              {incidentStatusLabel[incident.status as IncidentStatus] ?? incident.status}
            </span>
            <IncidentPriorityBadge priority={incident.priority} />
            {incident.slaStatus !== "completed" && (
              <SlaBadgeInline slaStatus={incident.slaStatus} minutesUntilBreach={incident.minutesUntilBreach} />
            )}
            {incident.assignedTo && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1 text-[11px] text-muted-foreground bg-muted/30">
                <UserCog className="h-3 w-3" />
                {incident.assignedTo.name}
              </span>
            )}
            {incident.affectedSystem && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1 text-[11px] text-muted-foreground bg-muted/30">
                <Server className="h-3 w-3" />
                {incident.affectedSystem}
              </span>
            )}
          </div>

          {/* Description */}
          {incident.description && (
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed border-t border-border/40 pt-3">
              {incident.description}
            </p>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 px-6 py-5">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">

          {/* ── Main content ── */}
          <div className="space-y-4 min-w-0">
            <SectionCard icon={MessageSquare} title="Incident Timeline">
              <UpdateTimeline updates={incident.updates} incidentId={incident.id} status={incident.status} />
            </SectionCard>

            {incident.events && incident.events.length > 0 && (
              <SectionCard icon={Activity} title="Activity Log">
                <EventTrail events={incident.events} />
              </SectionCard>
            )}
          </div>

          {/* ── Sidebar ── */}
          <div className="space-y-4">

            {/* Ownership */}
            <SectionCard icon={Users} title="Ownership">
              <AssignmentPanel incident={incident} />
            </SectionCard>

            {/* Details */}
            <SectionCard icon={AlertTriangle} title="Details">
              <div className="space-y-4">
                <MajorIncidentToggle incident={incident} />

                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Priority</p>
                  <SearchableSelect
                    value={incident.priority}
                    onChange={(val) => updateMutation.mutate({ priority: val as IncidentPriority })}
                    disabled={isClosed}
                    options={PRIORITY_OPTIONS}
                    className="h-9 text-sm"
                  />
                </div>

                <InlineField
                  label="Affected System"
                  value={incident.affectedSystem}
                  placeholder="e.g. Payment gateway"
                  onSave={(val) => updateMutation.mutate({ affectedSystem: val })}
                />

                <InlineField
                  label="Affected Users"
                  value={incident.affectedUserCount}
                  placeholder="0"
                  onSave={(val) => updateMutation.mutate({ affectedUserCount: val !== null ? Number(val) : null })}
                />

                {incident.team && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Team</p>
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{incident.team.name}</span>
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* SLA */}
            <SectionCard icon={Clock} title="SLA">
              <div className="space-y-2.5">
                {[
                  { label: "Response deadline", value: incident.responseDeadline },
                  { label: "Resolution deadline", value: incident.resolutionDeadline },
                  { label: "Acknowledged", value: incident.acknowledgedAt },
                  { label: "Resolved", value: incident.resolvedAt },
                ].filter((r) => r.value).map((row) => (
                  <div key={row.label} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-medium">{formatDate(row.value!)}</span>
                  </div>
                ))}
                {!incident.responseDeadline && !incident.resolutionDeadline && (
                  <p className="text-sm text-muted-foreground/60 italic">No SLA configured</p>
                )}
              </div>
            </SectionCard>

            {/* Affected CIs */}
            <SectionCard icon={Database} title="Affected CIs">
              <CiLinksPanel
                entityType="incidents"
                entityId={incident.id}
                linkedCis={incident.ciLinks ?? []}
                onChanged={() => queryClient.invalidateQueries({ queryKey: ["incident", id] })}
              />
            </SectionCard>

            {/* Affected Assets */}
            <SectionCard icon={Server} title="Affected Assets">
              <AssetLinksPanel
                entityType="incidents"
                entityId={incident.id}
              />
            </SectionCard>

            {/* Problem Management */}
            <SectionCard icon={GitMerge} title="Problem Management">
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  If this incident has a recurring root cause, promote it to a problem record for investigation.
                </p>
                <NewProblemDialog
                  initialIncidentId={incident.id}
                  initialTitle={incident.title}
                  trigger={
                    <button className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                      <GitMerge className="h-3.5 w-3.5" />
                      Promote to Problem
                    </button>
                  }
                />
              </div>
            </SectionCard>

            {/* Source Ticket */}
            {incident.sourceTicket && (
              <SectionCard icon={Link2} title="Source Ticket">
                <div className="space-y-2">
                  <Link to={`/tickets/${incident.sourceTicket.id}`}
                    className="font-medium text-primary hover:underline block text-sm">
                    {incident.sourceTicket.ticketNumber}
                  </Link>
                  <p className="text-xs text-muted-foreground leading-snug line-clamp-2">
                    {incident.sourceTicket.subject}
                  </p>
                  <div className="flex gap-1 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{incident.sourceTicket.status}</Badge>
                    {incident.sourceTicket.priority && (
                      <Badge variant="outline" className="text-[10px]">{incident.sourceTicket.priority}</Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">From: {incident.sourceTicket.senderName}</p>
                </div>
              </SectionCard>
            )}

            {/* Created info */}
            <div className="text-xs text-muted-foreground space-y-1 px-1">
              <p>Created by {incident.createdBy?.name ?? "System"}</p>
              <p>{formatDate(incident.createdAt)}</p>
            </div>
          </div>
        </div>
      </div>

      <SaveAsTemplateDialog
        open={templateDialog}
        onOpenChange={setTemplateDialog}
        type="ticket"
        defaultTitle={incident.title}
        defaultBody={incident.description ?? ""}
      />
    </div>
  );
}
