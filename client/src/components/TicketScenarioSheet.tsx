/**
 * TicketScenarioSheet
 *
 * Right-side Sheet that opens from a ticket and provides three views:
 *   run    – searchable list of enabled scenarios; click to execute
 *   create – full scenario creation / edit form
 *   manage – browse, toggle, delete all visible scenarios
 *
 * Uses explicit state panel switching instead of Radix Tabs to avoid
 * lazy-mount rendering issues with react-hook-form inside Dialog portals.
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import {
  createScenarioSchema,
  type CreateScenarioInput,
  type ScenarioAction,
  type ScenarioVisibility,
} from "core/schemas/scenarios.ts";
import { useSession } from "@/lib/auth-client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SelectGroup, SelectLabel,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import {
  Zap, Plus, PlayCircle, CheckCircle2, AlertCircle,
  Loader2, Search, Pencil, Trash2, Globe, Users, Lock,
  X, Sparkles, ArrowLeft, Settings2, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ticketTypes, ticketTypeLabel } from "core/constants/ticket-type.ts";
import { ticketPriorities, priorityLabel } from "core/constants/ticket-priority.ts";
import { ticketSeverities, severityLabel } from "core/constants/ticket-severity.ts";
import { agentTicketStatuses, statusLabel } from "core/constants/ticket-status.ts";
import { ticketCategories, categoryLabel } from "core/constants/ticket-category.ts";
import { ticketImpacts, impactLabel } from "core/constants/ticket-impact.ts";
import { ticketUrgencies, urgencyLabel } from "core/constants/ticket-urgency.ts";
import { incidentPriorities, incidentPriorityLabel } from "core/constants/incident-priority.ts";
import { incidentStatuses, incidentStatusLabel } from "core/constants/incident-status.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentOption { id: string; name: string }
interface TeamOption  { id: number; name: string; color?: string | null }
interface CustomFieldDef { key: string; label: string; fieldType: string; options: string[] }

interface ScenarioSummary {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  isEnabled: boolean;
  actions: ScenarioAction[];
  visibility: ScenarioVisibility;
  visibilityTeamId: number | null;
  visibilityTeam: { id: number; name: string; color: string } | null;
  createdById: string | null;
  createdBy: { id: string; name: string } | null;
  _count: { executions: number };
}

interface RunResult {
  executionId: number;
  status: "completed" | "failed";
  results: { type: string; applied: boolean; skippedReason?: string; errorMessage?: string }[];
}

export interface TicketScenarioSheetProps {
  open: boolean;
  onClose: () => void;
  ticketId: number;
  initialTab?: "run" | "create" | "manage";
}

type View = "run" | "create" | "manage";

// ── Constants ─────────────────────────────────────────────────────────────────

const BOOL_OPTS = [{ value: "true", label: "Yes" }, { value: "false", label: "No" }];

const ACTION_META: Record<string, { label: string; color: string }> = {
  update_field: { label: "Update Field",      color: "#6366f1" },
  assign_user:  { label: "Assign to Agent",   color: "#22c55e" },
  assign_team:  { label: "Assign to Team",    color: "#f59e0b" },
  add_note:     { label: "Add Internal Note", color: "#14b8a6" },
  escalate:     { label: "Escalate",          color: "#ef4444" },
};

const VISIBILITY_CONFIG: Record<ScenarioVisibility, { label: string; icon: React.ElementType; desc: string }> = {
  public:  { label: "Public",  icon: Globe,  desc: "All agents" },
  team:    { label: "Team",    icon: Users,  desc: "Your team" },
  private: { label: "Private", icon: Lock,   desc: "Only you" },
};

const COLOR_PRESETS = [
  "#6366f1","#8b5cf6","#ec4899","#ef4444",
  "#f97316","#f59e0b","#22c55e","#14b8a6",
  "#3b82f6","#06b6d4","#84cc16","#a855f7",
];

const STATIC_FIELD_GROUPS = [
  {
    label: "Incident Ticket",
    fields: [
      { value: "subject",        label: "Subject / Title",  opts: [] as {value:string;label:string}[], isText: true },
      { value: "status",         label: "Status",           opts: agentTicketStatuses.map(v => ({ value: v, label: statusLabel[v] })) },
      { value: "priority",       label: "Priority",         opts: ticketPriorities.map(v => ({ value: v, label: priorityLabel[v] })) },
      { value: "severity",       label: "Severity",         opts: ticketSeverities.map(v => ({ value: v, label: severityLabel[v] })) },
      { value: "impact",         label: "Impact",           opts: ticketImpacts.map(v => ({ value: v, label: impactLabel[v] })) },
      { value: "urgency",        label: "Urgency",          opts: ticketUrgencies.map(v => ({ value: v, label: urgencyLabel[v] })) },
      { value: "category",       label: "Category",         opts: ticketCategories.map(v => ({ value: v, label: categoryLabel[v] })) },
      { value: "ticketType",     label: "Ticket Type",      opts: ticketTypes.map(v => ({ value: v, label: ticketTypeLabel[v] })) },
      { value: "source",         label: "Source / Channel", opts: [{ value: "email", label: "Email" },{ value: "portal", label: "Portal" },{ value: "agent", label: "Agent" }] },
      { value: "affectedSystem", label: "Affected System",  opts: [] as {value:string;label:string}[], isText: true },
    ],
  },
  {
    label: "Incident Record",
    fields: [
      { value: "isMajor",           label: "Is Major Incident",   opts: BOOL_OPTS },
      { value: "incidentPriority",  label: "Priority (P1–P4)",    opts: incidentPriorities.map(v => ({ value: v, label: incidentPriorityLabel[v] })) },
      { value: "incidentStatus",    label: "Status",              opts: incidentStatuses.map(v => ({ value: v, label: incidentStatusLabel[v] })) },
      { value: "affectedUserCount", label: "Affected User Count", opts: [] as {value:string;label:string}[], isText: true },
    ],
  },
];

// ── Action editor ─────────────────────────────────────────────────────────────

function ActionEditor({
  index, value, onChange, onRemove,
  agents, teams, customFields, total,
}: {
  index: number;
  value: ScenarioAction;
  onChange: (v: ScenarioAction) => void;
  onRemove: () => void;
  agents: AgentOption[];
  teams: TeamOption[];
  customFields: CustomFieldDef[];
  total: number;
}) {
  const meta = ACTION_META[value.type] ?? { label: value.type, color: "#94a3b8" };
  const a = value as any;

  // Build field options lookup
  const fieldMap = useMemo(() => {
    const m = new Map<string, { opts: {value:string;label:string}[]; isText?: boolean; label: string }>();
    for (const g of STATIC_FIELD_GROUPS) for (const f of g.fields) m.set(f.value, { opts: (f as any).opts, isText: (f as any).isText, label: f.label });
    for (const cf of customFields) {
      const opts = (cf.fieldType === "select" || cf.fieldType === "multiselect") ? cf.options.map(o => ({ value: o, label: o }))
        : cf.fieldType === "switch" ? BOOL_OPTS : [];
      m.set(cf.key, { opts, isText: opts.length === 0, label: cf.label });
    }
    return m;
  }, [customFields]);

  const selDef = value.type === "update_field" && a.field ? fieldMap.get(a.field) : undefined;

  const customGroup = useMemo(() => customFields.map(cf => {
    const opts = (cf.fieldType === "select" || cf.fieldType === "multiselect") ? cf.options.map(o => ({ value: o, label: o }))
      : cf.fieldType === "switch" ? BOOL_OPTS : [];
    return { value: cf.key, label: cf.label, opts, isText: opts.length === 0 };
  }), [customFields]);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 py-2 border-b shrink-0"
        style={{ backgroundColor: `${meta.color}10` }}>
        <div className="h-5 w-5 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${meta.color}20`, border: `1px solid ${meta.color}40` }}>
          <Zap className="h-3 w-3" style={{ color: meta.color }} />
        </div>
        <span className="text-xs font-semibold flex-1" style={{ color: meta.color }}>{meta.label}</span>
        <span className="text-[10px] text-muted-foreground/60 font-mono">#{index + 1}</span>
        <button type="button" onClick={onRemove} disabled={total <= 1}
          className="p-0.5 rounded text-muted-foreground/50 hover:text-destructive disabled:opacity-20 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="p-3 space-y-2">
        <Select value={value.type}
          onValueChange={t => onChange({ type: t } as ScenarioAction)}>
          <SelectTrigger className="h-8 text-xs border-dashed"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(ACTION_META).map(([t, m]) => (
              <SelectItem key={t} value={t} className="text-xs">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                  {m.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {value.type === "update_field" && (
          <div className="space-y-2">
            <Select value={a.field || "__none__"}
              onValueChange={f => onChange({ type: "update_field", field: f === "__none__" ? "" : f, value: "" } as any)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose field…" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {STATIC_FIELD_GROUPS.map(g => (
                  <SelectGroup key={g.label}>
                    <SelectLabel className="text-[10px] uppercase tracking-wider">{g.label}</SelectLabel>
                    {g.fields.map(f => <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>)}
                  </SelectGroup>
                ))}
                {customGroup.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[10px] uppercase tracking-wider">Custom Fields</SelectLabel>
                    {customGroup.map(f => <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>)}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
            {a.field && selDef && (
              selDef.isText
                ? <Input className="h-8 text-xs" placeholder="Enter value…" value={a.value ?? ""}
                    onChange={e => onChange({ ...value, value: e.target.value } as any)} />
                : <Select value={a.value ?? ""}
                    onValueChange={v => onChange({ ...value, value: v } as any)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose value…" /></SelectTrigger>
                    <SelectContent>{selDef.opts.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
                  </Select>
            )}
          </div>
        )}

        {value.type === "assign_user" && (
          <Select value={a.agentId ?? ""}
            onValueChange={id => {
              if (id === "__me__") onChange({ type: "assign_user", agentId: "__me__", agentName: "Me" } as any);
              else { const ag = agents.find(x => x.id === id); onChange({ type: "assign_user", agentId: id, agentName: ag?.name } as any); }
            }}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select agent…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__me__" className="text-xs font-medium">Me (whoever runs this)</SelectItem>
              {agents.length > 0 && <div className="mx-2 my-1 border-t" />}
              {agents.map(ag => <SelectItem key={ag.id} value={ag.id} className="text-xs">{ag.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {value.type === "assign_team" && (
          <Select value={String(a.teamId ?? "")}
            onValueChange={id => { const t = teams.find(x => String(x.id) === id); onChange({ type: "assign_team", teamId: Number(id), teamName: t?.name } as any); }}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select team…" /></SelectTrigger>
            <SelectContent>
              {teams.map(t => <SelectItem key={t.id} value={String(t.id)} className="text-xs">{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {value.type === "add_note" && (
          <div className="space-y-1.5">
            <Textarea className="text-xs min-h-[72px] resize-none" placeholder="Note content…"
              value={a.body ?? ""} onChange={e => onChange({ ...value, body: e.target.value } as any)} />
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input type="checkbox" checked={a.isPinned ?? false}
                onChange={e => onChange({ ...value, isPinned: e.target.checked } as any)} className="rounded" />
              Pin note
            </label>
          </div>
        )}

        {value.type === "escalate" && (
          <p className="text-xs text-muted-foreground">Marks the ticket as escalated and logs an audit event.</p>
        )}
      </div>
    </div>
  );
}

// ── Create / Edit panel ───────────────────────────────────────────────────────

function CreatePanel({
  existing,
  onSuccess,
  onBack,
}: {
  existing: ScenarioSummary | null;
  onSuccess: () => void;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: agentsRaw } = useQuery({ queryKey: ["agents-list"], queryFn: () => axios.get<{ users: AgentOption[] }>("/api/users").then(r => r.data.users) });
  const { data: teamsRaw }  = useQuery({ queryKey: ["teams"],       queryFn: () => axios.get<{ teams: TeamOption[] }>("/api/teams").then(r => r.data.teams) });
  const { data: cfRaw }     = useQuery({ queryKey: ["cf-global"],   queryFn: () => axios.get<{ fields: CustomFieldDef[] }>("/api/custom-fields?entityType=ticket").then(r => r.data.fields) });

  const agents = agentsRaw ?? [];
  const teams  = teamsRaw ?? [];
  const customFields = cfRaw ?? [];

  const defaultVals: CreateScenarioInput = existing
    ? { name: existing.name, description: existing.description ?? undefined, color: existing.color ?? undefined, actions: existing.actions, visibility: existing.visibility, visibilityTeamId: existing.visibilityTeamId ?? undefined }
    : { name: "", actions: [{ type: "escalate" } as ScenarioAction], visibility: "public" };

  const {
    register, control, handleSubmit, watch, setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateScenarioInput>({
    resolver: zodResolver(createScenarioSchema),
    defaultValues: defaultVals,
  });

  const { fields, append, remove, update } = useFieldArray({ control, name: "actions" });
  const watchedColor      = watch("color");
  const watchedVisibility = watch("visibility");

  const mutation = useMutation({
    mutationFn: (data: CreateScenarioInput) =>
      existing ? axios.patch(`/api/scenarios/${existing.id}`, data) : axios.post("/api/scenarios", data),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["scenarios"] }); onSuccess(); },
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Panel header */}
      <div className="shrink-0 flex items-center gap-2 px-6 py-3 border-b bg-muted/20">
        <button type="button" onClick={onBack}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold">{existing ? "Edit Scenario" : "New Scenario Automation"}</p>
      </div>

      {/* Scrollable form */}
      <div className="flex-1 overflow-y-auto">
        <form id="scenario-form" onSubmit={handleSubmit(d => mutation.mutate(d))}>
          <div className="px-6 py-5 space-y-5">

            {/* Identity */}
            <div className="space-y-3 rounded-xl border bg-card p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Identity</p>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Name <span className="text-destructive">*</span></Label>
                <Input {...register("name")} placeholder="e.g. Escalate to Tier 2" className="h-9" />
                {errors.name && <ErrorMessage message={errors.name.message} />}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Textarea {...register("description")} placeholder="Brief explanation shown to agents" className="text-sm min-h-[52px] resize-none" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Colour</Label>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {COLOR_PRESETS.map(c => (
                    <button key={c} type="button" onClick={() => setValue("color", c, { shouldDirty: true })}
                      className={cn("h-6 w-6 rounded-full border-2 transition-all shrink-0",
                        watchedColor === c ? "scale-110 border-foreground/80" : "border-transparent hover:scale-105")}
                      style={{ backgroundColor: c }} />
                  ))}
                  <div className="flex items-center gap-1.5 ml-1">
                    <input type="color"
                      value={watchedColor || "#6366f1"}
                      onChange={e => setValue("color", e.target.value, { shouldDirty: true })}
                      className="h-6 w-6 rounded-full border-0 cursor-pointer p-0 bg-transparent" />
                    <Input {...register("color")} placeholder="#6366f1"
                      className="h-6 w-[88px] text-[11px] font-mono px-1.5" maxLength={7} />
                  </div>
                </div>
              </div>
            </div>

            {/* Visibility */}
            <div className="space-y-3 rounded-xl border bg-card p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Visibility</p>
              <div className="grid grid-cols-3 gap-2">
                {(["public", "team", "private"] as ScenarioVisibility[]).map(v => {
                  const cfg = VISIBILITY_CONFIG[v];
                  const Icon = cfg.icon;
                  const active = watchedVisibility === v;
                  return (
                    <button key={v} type="button"
                      onClick={() => { setValue("visibility", v); if (v !== "team") setValue("visibilityTeamId", undefined); }}
                      className={cn("flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs transition-all",
                        active ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/30 hover:bg-muted/30")}>
                      <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                      <span className={cn("font-semibold text-[11px]", active ? "text-primary" : "")}>{cfg.label}</span>
                      <span className="text-[10px] text-muted-foreground leading-tight">{cfg.desc}</span>
                    </button>
                  );
                })}
              </div>
              {watchedVisibility === "team" && (
                <Controller control={control} name="visibilityTeamId" render={({ field }) => (
                  <Select value={field.value != null ? String(field.value) : ""}
                    onValueChange={v => field.onChange(Number(v))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select team…" /></SelectTrigger>
                    <SelectContent>
                      {teams.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )} />
              )}
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Actions</p>
                <span className="text-[11px] text-muted-foreground tabular-nums">{fields.length} / 20</span>
              </div>
              {errors.actions && <ErrorMessage message={(errors.actions as any).message ?? "At least one action required"} />}
              <div className="space-y-2">
                {fields.map((field, idx) => (
                  <Controller key={field.id} control={control} name={`actions.${idx}`}
                    render={({ field: f }) => (
                      <ActionEditor
                        index={idx} value={f.value as ScenarioAction}
                        onChange={val => update(idx, val)} onRemove={() => remove(idx)}
                        agents={agents} teams={teams} customFields={customFields} total={fields.length}
                      />
                    )} />
                ))}
              </div>
              {fields.length < 20 && (
                <Button type="button" variant="outline" size="sm"
                  className="w-full h-9 gap-2 border-dashed text-muted-foreground hover:text-foreground"
                  onClick={() => append({ type: "escalate" } as ScenarioAction)}>
                  <Plus className="h-3.5 w-3.5" />
                  Add action
                </Button>
              )}
            </div>

            {mutation.isError && <ErrorAlert error={mutation.error} fallback="Failed to save scenario" />}
          </div>
        </form>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t bg-muted/20 px-6 py-4 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>Cancel</Button>
        <Button type="submit" form="scenario-form" size="sm"
          disabled={isSubmitting || mutation.isPending} className="gap-1.5 min-w-[120px]">
          {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {mutation.isPending ? "Saving…" : existing ? "Save Changes" : "Create Scenario"}
        </Button>
      </div>
    </div>
  );
}

// ── Main sheet ────────────────────────────────────────────────────────────────

export default function TicketScenarioSheet({
  open, onClose, ticketId, initialTab = "run",
}: TicketScenarioSheetProps) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  const [view, setView]                   = useState<View>(initialTab);
  const [search, setSearch]               = useState("");
  const [editingScenario, setEditing]     = useState<ScenarioSummary | null>(null);
  const [deletingScenario, setDeleting]   = useState<ScenarioSummary | null>(null);
  const [runningId, setRunningId]         = useState<number | null>(null);
  const [lastResult, setLastResult]       = useState<{ id: number; result: RunResult } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const currentUserId = session?.user?.id;
  const isElevated    = (session?.user as any)?.role === "admin" || (session?.user as any)?.role === "supervisor";

  useEffect(() => {
    if (open) { setView(initialTab); setSearch(""); setLastResult(null); }
  }, [open, initialTab]);

  useEffect(() => {
    if (view === "run" && open) setTimeout(() => searchRef.current?.focus(), 80);
  }, [view, open]);

  const { data: scenariosData, isLoading } = useQuery({
    queryKey: ["scenarios"],
    queryFn: () => axios.get<{ scenarios: ScenarioSummary[] }>("/api/scenarios").then(r => r.data),
    enabled: open,
  });

  const scenarios = useMemo(() => scenariosData?.scenarios ?? [], [scenariosData]);
  const enabled   = useMemo(() => scenarios.filter(s => s.isEnabled), [scenarios]);
  const filtered  = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? enabled.filter(s => s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q)) : enabled;
  }, [enabled, search]);

  const runMutation = useMutation({
    mutationFn: ({ scenarioId }: { scenarioId: number }) =>
      axios.post<RunResult>(`/api/scenarios/${scenarioId}/run`, { ticketId }).then(r => r.data),
    onSuccess: (result, { scenarioId }) => {
      setLastResult({ id: scenarioId, result });
      setRunningId(null);
      void queryClient.invalidateQueries({ queryKey: ["ticket", String(ticketId)] });
    },
    onError: () => setRunningId(null),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isEnabled }: { id: number; isEnabled: boolean }) => axios.patch(`/api/scenarios/${id}`, { isEnabled }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["scenarios"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axios.delete(`/api/scenarios/${id}`),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["scenarios"] }); setDeleting(null); },
  });

  function handleRun(scenarioId: number) {
    setRunningId(scenarioId);
    setLastResult(null);
    runMutation.mutate({ scenarioId });
  }

  function canEdit(s: ScenarioSummary) {
    return isElevated || s.createdById === currentUserId;
  }

  // ── Nav pills ──────────────────────────────────────────────────────────────

  const NAV: { id: View; label: string; icon: React.ElementType }[] = [
    { id: "run",    label: "Run",    icon: PlayCircle },
    { id: "create", label: "Create", icon: Plus },
    { id: "manage", label: "Manage", icon: Settings2 },
  ];

  return (
    <>
      <Sheet open={open} onOpenChange={v => !v && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-[560px] p-0 flex flex-col" showCloseButton={false}>

          {/* Header */}
          <SheetHeader className="shrink-0 px-6 pt-5 pb-0 border-b-0">
            <div className="flex items-center gap-3 pb-3">
              <div className="h-8 w-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <Zap className="h-[18px] w-[18px] text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-base font-semibold leading-tight">Scenario Automations</SheetTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{enabled.length} active · Ticket #{ticketId}</p>
              </div>
              <button onClick={onClose}
                className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Only show nav when NOT in create view (which has its own back button) */}
            {view !== "create" && (
              <div className="flex gap-1 border-b">
                {NAV.filter(n => n.id !== "create").map(n => {
                  const Icon = n.icon;
                  return (
                    <button key={n.id} type="button"
                      onClick={() => setView(n.id)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
                        view === n.id
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      )}>
                      <Icon className="h-3.5 w-3.5" />{n.label}
                    </button>
                  );
                })}
              </div>
            )}
          </SheetHeader>

          {/* Content — explicit panel switching, no Radix Tabs lazy mounting */}
          <div className="flex-1 flex flex-col min-h-0">

            {/* ── RUN ── */}
            {view === "run" && (
              <div className="flex flex-col h-full">
                <div className="px-6 pt-3 pb-2 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="Search scenarios…" className="pl-9 h-9 bg-muted/40 border-border/60" />
                    {search && (
                      <button type="button" onClick={() => setSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 pb-6">
                  {isLoading ? (
                    <div className="space-y-2 pt-2">
                      {[1,2,3].map(n => <div key={n} className="h-20 rounded-xl border bg-muted/30 animate-pulse" />)}
                    </div>
                  ) : filtered.length > 0 ? (
                    <div className="space-y-2 pt-2">
                      {filtered.map(s => {
                        const isRunning = runningId === s.id;
                        const res       = lastResult?.id === s.id ? lastResult.result : null;
                        const hasErr    = res?.results.some(r => r.errorMessage);
                        const applied   = res?.results.filter(r => r.applied).length ?? 0;
                        const color     = s.color ?? "#f59e0b";

                        return (
                          <div key={s.id} className={cn("rounded-xl border bg-card overflow-hidden transition-all", isRunning && "opacity-60")}>
                            <div className="flex items-start gap-3 p-3.5">
                              <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                                style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}>
                                {isRunning
                                  ? <Loader2 className="h-4 w-4 animate-spin" style={{ color }} />
                                  : <Zap className="h-4 w-4" style={{ color }} />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold leading-tight truncate">{s.name}</p>
                                  <Badge variant="secondary" className="text-[9px] h-4 px-1.5 shrink-0">
                                    {s.actions.length}
                                  </Badge>
                                </div>
                                {s.description && (
                                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{s.description}</p>
                                )}
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {s.actions.slice(0, 3).map((a, i) => {
                                    const m = ACTION_META[a.type];
                                    return (
                                      <span key={i} className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                        style={{ backgroundColor: `${m?.color ?? "#94a3b8"}15`, color: m?.color ?? "#94a3b8" }}>
                                        {m?.label ?? a.type}
                                      </span>
                                    );
                                  })}
                                  {s.actions.length > 3 && (
                                    <span className="text-[10px] text-muted-foreground">+{s.actions.length - 3}</span>
                                  )}
                                </div>
                              </div>
                              <Button size="sm" className="h-8 gap-1.5 shrink-0 text-xs font-semibold border-0"
                                disabled={isRunning || runMutation.isPending}
                                onClick={() => handleRun(s.id)}
                                style={{ backgroundColor: color, color: "#fff" }}>
                                <PlayCircle className="h-3.5 w-3.5" />
                                Run
                              </Button>
                            </div>
                            {res && (
                              <div className={cn("px-3.5 py-2 border-t text-xs flex items-center gap-2",
                                hasErr ? "bg-destructive/5 text-destructive" : "bg-emerald-500/5 text-emerald-700 dark:text-emerald-400")}>
                                {hasErr ? <AlertCircle className="h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                                <span className="font-medium">
                                  {hasErr ? "Completed with errors" : applied === 0 ? "No changes needed" : `${applied} action${applied !== 1 ? "s" : ""} applied`}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : search ? (
                    <div className="flex flex-col items-center gap-3 py-16 text-center">
                      <Search className="h-8 w-8 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">No matches for <strong>"{search}"</strong></p>
                      <Button variant="ghost" size="sm" onClick={() => setSearch("")}>Clear</Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 py-16 text-center">
                      <div className="h-14 w-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                        <Zap className="h-7 w-7 text-amber-400" />
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-sm font-semibold">No active scenarios</p>
                        <p className="text-xs text-muted-foreground max-w-[240px] leading-relaxed">
                          Create scenario automations to apply multi-step actions in one click.
                        </p>
                      </div>
                      <Button size="sm" onClick={() => setView("create")} className="gap-1.5">
                        <Plus className="h-3.5 w-3.5" />
                        Create your first
                      </Button>
                    </div>
                  )}
                </div>

                <div className="shrink-0 border-t bg-muted/20 px-6 py-3">
                  <Button size="sm" variant="outline" className="w-full gap-1.5"
                    onClick={() => { setEditing(null); setView("create"); }}>
                    <Plus className="h-3.5 w-3.5" />
                    Create new scenario automation
                  </Button>
                </div>
              </div>
            )}

            {/* ── CREATE ── */}
            {view === "create" && (
              <CreatePanel
                key={editingScenario?.id ?? "new"}
                existing={editingScenario}
                onSuccess={() => { setEditing(null); setView(editingScenario ? "manage" : "run"); }}
                onBack={() => { setEditing(null); setView(editingScenario ? "manage" : "run"); }}
              />
            )}

            {/* ── MANAGE ── */}
            {view === "manage" && (
              <div className="flex flex-col h-full">
                <div className="flex-1 overflow-y-auto px-6 py-4">
                  {isLoading ? (
                    <div className="space-y-2">
                      {[1,2,3].map(n => <div key={n} className="h-14 rounded-xl border bg-muted/30 animate-pulse" />)}
                    </div>
                  ) : scenarios.length === 0 ? (
                    <div className="flex flex-col items-center gap-4 py-16 text-center">
                      <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                        <Settings2 className="h-6 w-6 text-muted-foreground/40" />
                      </div>
                      <p className="text-sm text-muted-foreground">No scenarios yet</p>
                      <Button size="sm" variant="outline" onClick={() => setView("create")}>
                        Create a scenario
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {scenarios.map(s => {
                        const color = s.color ?? "#f59e0b";
                        const VIcon = VISIBILITY_CONFIG[s.visibility].icon;
                        return (
                          <div key={s.id} className={cn("rounded-xl border bg-card overflow-hidden transition-all", !s.isEnabled && "opacity-60")}>
                            <div className="flex items-start gap-3 p-3.5">
                              <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                                style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}>
                                <Zap className="h-3.5 w-3.5" style={{ color }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-semibold truncate">{s.name}</p>
                                  {!s.isEnabled && <Badge variant="outline" className="text-[9px] h-4">Disabled</Badge>}
                                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <VIcon className="h-3 w-3" />{VISIBILITY_CONFIG[s.visibility].label}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                                  <span>{s.actions.length} action{s.actions.length !== 1 ? "s" : ""}</span>
                                  <span>·</span>
                                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{s._count.executions} runs</span>
                                </div>
                              </div>
                              {canEdit(s) && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <Switch checked={s.isEnabled}
                                    onCheckedChange={v => toggleMutation.mutate({ id: s.id, isEnabled: v })}
                                    className="scale-75" />
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                    onClick={() => { setEditing(s); setView("create"); }} title="Edit">
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    onClick={() => setDeleting(s)} title="Delete">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="shrink-0 border-t bg-muted/20 px-6 py-3">
                  <Button size="sm" className="w-full gap-1.5"
                    onClick={() => { setEditing(null); setView("create"); }}>
                    <Plus className="h-3.5 w-3.5" />
                    Create new scenario
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deletingScenario} onOpenChange={o => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete scenario?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deletingScenario?.name}</strong> and its execution history will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingScenario && deleteMutation.mutate(deletingScenario.id)}>
              {deleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

