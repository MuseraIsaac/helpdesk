/**
 * ScenariosPage — admin/supervisor management page for Scenario Automations.
 *
 * Lists all scenario definitions with their action count, enabled state, and
 * run count. Provides create, edit, enable/disable, and delete controls.
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createScenarioSchema,
  type CreateScenarioInput,
  type ScenarioAction,
  type ScenarioVisibility,
} from "core/schemas/scenarios.ts";
import { useSession } from "@/lib/auth-client";
import BackLink from "@/components/BackLink";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
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
import {
  Zap,
  Plus,
  Pencil,
  Trash2,
  X,
  Globe,
  Users,
  Lock,
  Sparkles,
  Wand2,
  ListChecks,
  Eye,
  GripVertical,
  UserCircle2,
  PenSquare,
  ArrowRightCircle,
  StickyNote,
  AlertTriangle,
} from "lucide-react";
import SearchableSelect, {
  type SelectOption as SSOption,
  type SelectGroup as SSGroup,
} from "@/components/SearchableSelect";
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
interface TeamOption  { id: number; name: string }

interface CustomFieldDef {
  key: string;
  label: string;
  fieldType: string;
  options: string[];
}

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

const VISIBILITY_CONFIG: Record<ScenarioVisibility, { label: string; icon: React.ElementType; badge: string }> = {
  public:  { label: "Public",  icon: Globe,  badge: "bg-green-500/10 text-green-700 dark:text-green-400" },
  team:    { label: "Team",    icon: Users,  badge: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  private: { label: "Private", icon: Lock,   badge: "bg-muted text-muted-foreground" },
};

// ── Field group definitions for update_field ──────────────────────────────────

interface FieldOption { value: string; label: string }
interface FieldDef    { value: string; label: string; options: FieldOption[]; isText?: boolean }
interface FieldGroup  { label: string; fields: FieldDef[] }

const BOOL_OPTS: FieldOption[] = [{ value: "true", label: "Yes" }, { value: "false", label: "No" }];

// ── Static field groups covering every field of an incident-type ticket ────────

const STATIC_FIELD_GROUPS: FieldGroup[] = [
  {
    // The Ticket record that IS the incident (ticketType = "incident")
    label: "Incident Ticket",
    fields: [
      { value: "subject",        label: "Subject / Title",   options: [], isText: true },
      { value: "status",         label: "Status",            options: agentTicketStatuses.map((v) => ({ value: v, label: statusLabel[v] })) },
      { value: "priority",       label: "Priority",          options: ticketPriorities.map((v) => ({ value: v, label: priorityLabel[v] })) },
      { value: "severity",       label: "Severity",          options: ticketSeverities.map((v) => ({ value: v, label: severityLabel[v] })) },
      { value: "impact",         label: "Impact",            options: ticketImpacts.map((v) => ({ value: v, label: impactLabel[v] })) },
      { value: "urgency",        label: "Urgency",           options: ticketUrgencies.map((v) => ({ value: v, label: urgencyLabel[v] })) },
      { value: "category",       label: "Category",          options: ticketCategories.map((v) => ({ value: v, label: categoryLabel[v] })) },
      { value: "ticketType",     label: "Ticket Type",       options: ticketTypes.map((v) => ({ value: v, label: ticketTypeLabel[v] })) },
      { value: "source",         label: "Source / Channel",  options: [{ value: "email", label: "Email" }, { value: "portal", label: "Portal" }, { value: "agent", label: "Agent (manual)" }] },
      { value: "affectedSystem", label: "Affected System",   options: [], isText: true },
    ],
  },
  {
    // The linked Incident record (created/synced when ticketType = "incident")
    label: "Incident Record",
    fields: [
      { value: "isMajor",            label: "Is Major Incident",    options: BOOL_OPTS },
      { value: "incidentPriority",   label: "Priority (P1–P4)",     options: incidentPriorities.map((v) => ({ value: v, label: incidentPriorityLabel[v] })) },
      { value: "incidentStatus",     label: "Status",               options: incidentStatuses.map((v) => ({ value: v, label: incidentStatusLabel[v] })) },
      { value: "affectedUserCount",  label: "Affected User Count",  options: [], isText: true },
    ],
  },
];

function buildCustomFieldGroup(defs: CustomFieldDef[]): FieldDef[] {
  return defs.map((cf) => {
    if (cf.fieldType === "select" || cf.fieldType === "multiselect") {
      return { value: cf.key, label: cf.label, options: cf.options.map((o) => ({ value: o, label: o })) };
    }
    if (cf.fieldType === "switch") {
      return { value: cf.key, label: cf.label, options: BOOL_OPTS };
    }
    return { value: cf.key, label: cf.label, options: [], isText: true };
  });
}

// Flatten all field groups + custom group into one lookup map
function buildFieldMap(customDefs: CustomFieldDef[]): Map<string, FieldDef> {
  const map = new Map<string, FieldDef>();
  for (const group of STATIC_FIELD_GROUPS) {
    for (const f of group.fields) map.set(f.value, f);
  }
  for (const f of buildCustomFieldGroup(customDefs)) map.set(f.value, f);
  return map;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACTION_TYPE_LABELS: Record<string, string> = {
  update_field: "Update Field",
  assign_user:  "Assign to Agent",
  assign_team:  "Assign to Team",
  add_note:     "Add Internal Note",
  escalate:     "Escalate",
};

const ACTION_TYPE_META: Record<string, { icon: React.ElementType; tint: string; description: string }> = {
  update_field: { icon: PenSquare,        tint: "bg-blue-500/10 text-blue-600 dark:text-blue-400",       description: "Set a ticket or incident field to a value" },
  assign_user:  { icon: UserCircle2,      tint: "bg-violet-500/10 text-violet-600 dark:text-violet-400", description: "Hand the ticket off to a specific agent" },
  assign_team:  { icon: Users,            tint: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", description: "Route the ticket to a team queue" },
  add_note:     { icon: StickyNote,       tint: "bg-amber-500/10 text-amber-600 dark:text-amber-400",     description: "Append an internal note for agents" },
  escalate:     { icon: ArrowRightCircle, tint: "bg-rose-500/10 text-rose-600 dark:text-rose-400",         description: "Mark the ticket escalated" },
};

const FIELD_LABEL_MAP: Record<string, string> = {
  // Incident Ticket fields
  subject: "Subject / Title", status: "Ticket Status",
  priority: "Ticket Priority", severity: "Severity",
  impact: "Impact", urgency: "Urgency",
  category: "Category", ticketType: "Ticket Type",
  source: "Source / Channel", affectedSystem: "Affected System",
  // Incident Record fields
  isMajor: "Is Major Incident",
  incidentPriority: "Incident Priority (P1–P4)",
  incidentStatus: "Incident Status",
  affectedUserCount: "Affected User Count",
};

function fieldValueLabel(field: string, value: string, fieldMap: Map<string, FieldDef>): string {
  const def = fieldMap.get(field);
  if (def) {
    const opt = def.options.find((o) => o.value === value);
    if (opt) return opt.label;
  }
  return value;
}

function actionSummary(action: ScenarioAction, fieldMap: Map<string, FieldDef>): string {
  switch (action.type) {
    case "update_field": {
      const a = action as any;
      const fl = FIELD_LABEL_MAP[a.field as string] ?? a.field;
      return `Set ${fl} → ${fieldValueLabel(a.field, a.value, fieldMap)}`;
    }
    case "assign_user":
      return (action as any).agentId === "__me__"
        ? "Assign to Me (whoever runs this)"
        : `Assign to ${(action as any).agentName ?? (action as any).agentId}`;
    case "assign_team":
      return `Route to team ${(action as any).teamName ?? (action as any).teamId}`;
    case "add_note":
      return `Add note: "${String((action as any).body).slice(0, 40)}${String((action as any).body).length > 40 ? "…" : ""}"`;
    case "escalate":
      return "Escalate ticket";
    default:
      return action.type;
  }
}

// ── Action editor ─────────────────────────────────────────────────────────────

interface ActionEditorProps {
  index: number;
  value: ScenarioAction;
  onChange: (val: ScenarioAction) => void;
  onRemove: () => void;
  agents: AgentOption[];
  teams: TeamOption[];
  customFieldDefs: CustomFieldDef[];
}

function ActionEditor({ index, value, onChange, onRemove, agents, teams, customFieldDefs }: ActionEditorProps) {
  const selectedField = value.type === "update_field" ? (value as any).field as string ?? "" : "";
  const fieldMap      = buildFieldMap(customFieldDefs);
  const selectedDef   = selectedField ? fieldMap.get(selectedField) : undefined;
  const customGroup   = buildCustomFieldGroup(customFieldDefs);

  const meta = ACTION_TYPE_META[value.type];
  const Icon = meta?.icon ?? Zap;

  // Build options for action type as a flat list with icons
  const actionTypeOptions: SSOption[] = Object.entries(ACTION_TYPE_LABELS).map(([t, label]) => {
    const m = ACTION_TYPE_META[t]!;
    const I = m.icon;
    return {
      value: t,
      label,
      prefix: (
        <span className={`h-5 w-5 inline-flex items-center justify-center rounded ${m.tint}`}>
          <I className="h-3 w-3" />
        </span>
      ),
    };
  });

  // Build grouped field options
  const fieldGroups: SSGroup[] = [
    ...STATIC_FIELD_GROUPS.map((g) => ({
      label: g.label,
      options: g.fields.map((f) => ({ value: f.value, label: f.label })),
    })),
    ...(customGroup.length > 0
      ? [{ label: "Custom Fields", options: customGroup.map((f) => ({ value: f.value, label: f.label })) }]
      : []),
  ];

  // Agent options with a "Me" shortcut at the top
  const agentOptions: SSOption[] = [
    {
      value: "__me__",
      label: "Me",
      hint: "whoever runs this",
      prefix: (
        <span className="h-5 w-5 inline-flex items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-3 w-3" />
        </span>
      ),
    },
    ...agents.map((a) => ({
      value: a.id,
      label: a.name,
      prefix: (
        <span className="h-5 w-5 inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground text-[10px] font-medium">
          {a.name.charAt(0).toUpperCase()}
        </span>
      ),
    })),
  ];
  const teamOptions: SSOption[] = teams.map((t) => ({ value: String(t.id), label: t.name }));
  const valueOptions: SSOption[] = (selectedDef?.options ?? []).map((o) => ({ value: o.value, label: o.label }));

  return (
    <div className="group relative rounded-lg border bg-card overflow-hidden transition-all hover:shadow-sm hover:border-foreground/20">
      {/* Header strip */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
        <span className={`h-6 w-6 inline-flex items-center justify-center rounded-md ${meta?.tint ?? "bg-muted"}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Step {index + 1}
            </span>
            <span className="text-xs font-medium truncate">
              {ACTION_TYPE_LABELS[value.type] ?? "New action"}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          aria-label="Remove action"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="p-3 space-y-2.5">
        {/* Action type */}
        <div className="space-y-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Action</span>
          <SearchableSelect
            options={actionTypeOptions}
            value={value.type}
            onChange={(type) => onChange({ type } as ScenarioAction)}
            placeholder="Select action type"
            searchPlaceholder="Search actions…"
            className="h-8 text-sm"
          />
          {meta?.description && (
            <p className="text-[11px] text-muted-foreground/80 pl-0.5">{meta.description}</p>
          )}
        </div>

        {/* update_field */}
        {value.type === "update_field" && (
          <>
            <div className="space-y-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Field</span>
              <SearchableSelect
                groups={fieldGroups}
                value={selectedField}
                onChange={(field) => onChange({ type: "update_field", field, value: "" } as any)}
                placeholder="Select field…"
                searchPlaceholder="Search fields…"
                className="h-8 text-sm"
              />
            </div>

            {selectedField && selectedDef && (
              <div className="space-y-1">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Value</span>
                {selectedDef.isText ? (
                  <Input
                    className="h-8 text-sm"
                    placeholder={`Enter ${selectedDef.label.toLowerCase()}…`}
                    value={(value as any).value ?? ""}
                    onChange={(e) => onChange({ ...value, value: e.target.value } as any)}
                  />
                ) : (
                  <SearchableSelect
                    options={valueOptions}
                    value={(value as any).value ?? ""}
                    onChange={(v) => onChange({ ...value, value: v } as any)}
                    placeholder="Select value…"
                    searchPlaceholder="Search values…"
                    className="h-8 text-sm"
                  />
                )}
              </div>
            )}
          </>
        )}

        {/* assign_user */}
        {value.type === "assign_user" && (
          <div className="space-y-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Agent</span>
            <SearchableSelect
              options={agentOptions}
              value={(value as any).agentId ?? ""}
              onChange={(agentId) => {
                if (agentId === "__me__") {
                  onChange({ type: "assign_user", agentId: "__me__", agentName: "Me (whoever runs this)" } as any);
                } else {
                  const agent = agents.find((a) => a.id === agentId);
                  onChange({ type: "assign_user", agentId, agentName: agent?.name } as any);
                }
              }}
              placeholder={agents.length === 0 ? "Loading agents…" : "Select agent…"}
              searchPlaceholder="Search agents…"
              className="h-8 text-sm"
            />
          </div>
        )}

        {/* assign_team */}
        {value.type === "assign_team" && (
          <div className="space-y-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Team</span>
            <SearchableSelect
              options={teamOptions}
              value={String((value as any).teamId ?? "")}
              onChange={(teamId) => {
                const team = teams.find((t) => String(t.id) === teamId);
                onChange({ type: "assign_team", teamId: Number(teamId), teamName: team?.name } as any);
              }}
              placeholder={teams.length === 0 ? "Loading teams…" : "Select team…"}
              searchPlaceholder="Search teams…"
              className="h-8 text-sm"
            />
          </div>
        )}

        {/* add_note */}
        {value.type === "add_note" && (
          <div className="space-y-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Note</span>
            <Textarea
              className="text-sm min-h-[80px]"
              placeholder="Note body…"
              value={(value as any).body ?? ""}
              onChange={(e) => onChange({ ...value, body: e.target.value } as any)}
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={(value as any).isPinned ?? false}
                onChange={(e) => onChange({ ...value, isPinned: e.target.checked } as any)}
                className="rounded"
              />
              Pin note in conversation
            </label>
          </div>
        )}

        {/* escalate */}
        {value.type === "escalate" && (
          <div className="flex items-start gap-2 rounded-md bg-rose-500/5 border border-rose-500/20 p-2.5">
            <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground">
              Marks the ticket as escalated and logs an escalation event. No additional configuration needed.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Create/Edit dialog ────────────────────────────────────────────────────────

interface ScenarioDialogProps {
  open: boolean;
  onClose: () => void;
  existing?: ScenarioSummary;
}

function ScenarioDialog({ open, onClose, existing }: ScenarioDialogProps) {
  const queryClient = useQueryClient();

  const { data: agentsData } = useQuery({
    queryKey: ["agents-list"],
    queryFn: async () => {
      const { data } = await axios.get<{ users: AgentOption[] }>("/api/users");
      return data.users;
    },
    enabled: open,
  });

  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data } = await axios.get<{ teams: TeamOption[] }>("/api/teams");
      return data;
    },
    enabled: open,
  });

  // Global ticket custom fields (ticketTypeId = null — apply to all ticket types)
  const { data: globalCFData } = useQuery({
    queryKey: ["custom-fields-ticket-global"],
    queryFn: async () => {
      const { data } = await axios.get<{ fields: CustomFieldDef[] }>("/api/custom-fields?entityType=ticket");
      return data.fields;
    },
    enabled: open,
  });

  // TicketTypeConfig entries — find any named/slugged "incident" for type-specific custom fields
  const { data: ticketTypesData } = useQuery({
    queryKey: ["ticket-types"],
    queryFn: async () => {
      const { data } = await axios.get<{ ticketTypes: Array<{ id: number; slug: string; name: string }> }>("/api/ticket-types");
      return data.ticketTypes;
    },
    enabled: open,
  });

  const incidentTypeConfigs = (ticketTypesData ?? []).filter(
    (t) => t.slug.toLowerCase().includes("incident") || t.name.toLowerCase().includes("incident")
  );

  // Fetch custom fields for each incident-named TicketTypeConfig (usually 0 or 1)
  const { data: typeCFData } = useQuery({
    queryKey: ["custom-fields-incident-types", incidentTypeConfigs.map((t) => t.id)],
    queryFn: async () => {
      const results = await Promise.all(
        incidentTypeConfigs.map((tc) =>
          axios
            .get<{ fields: CustomFieldDef[] }>(`/api/custom-fields?entityType=ticket&ticketTypeId=${tc.id}`)
            .then((r) => r.data.fields)
        )
      );
      return results.flat();
    },
    enabled: open && incidentTypeConfigs.length > 0,
  });

  const agents: AgentOption[] = agentsData ?? [];
  const teams: TeamOption[]   = teamsData?.teams ?? [];

  // Merge global + type-specific custom fields, deduplicate by key
  const customFieldDefs: CustomFieldDef[] = (() => {
    const seen = new Set<string>();
    const merged: CustomFieldDef[] = [];
    for (const f of [...(globalCFData ?? []), ...(typeCFData ?? [])]) {
      if (!seen.has(f.key)) { seen.add(f.key); merged.push(f); }
    }
    return merged;
  })();

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateScenarioInput>({
    resolver: zodResolver(createScenarioSchema),
    defaultValues: existing
      ? {
          name:             existing.name,
          description:      existing.description ?? undefined,
          color:            existing.color ?? undefined,
          actions:          existing.actions,
          visibility:       existing.visibility,
          visibilityTeamId: existing.visibilityTeamId ?? undefined,
        }
      : { name: "", actions: [{ type: "escalate" }], visibility: "public" },
  });

  const watchedVisibility = watch("visibility");

  const { fields, append, remove, update } = useFieldArray({
    control,
    name: "actions",
  });

  const mutation = useMutation({
    mutationFn: async (data: CreateScenarioInput) => {
      if (existing) {
        await axios.patch(`/api/scenarios/${existing.id}`, data);
      } else {
        await axios.post("/api/scenarios", data);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["scenarios"] });
      reset();
      onClose();
    },
  });

  const handleClose = () => {
    reset();
    onClose();
  };

  const watchedColor = watch("color");
  const watchedName  = watch("name");
  const watchedActions = watch("actions");

  const COLOR_PRESETS = [
    "#3b82f6", "#8b5cf6", "#ec4899", "#ef4444",
    "#f59e0b", "#10b981", "#06b6d4", "#64748b",
  ];

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full sm:max-w-xl p-0 gap-0 flex flex-col"
      >
        <form
          onSubmit={handleSubmit((d) => mutation.mutate(d))}
          className="flex flex-col h-full"
        >
          {/* Cool gradient header */}
          <SheetHeader className="relative p-0 gap-0 shrink-0">
            <div
              className="relative px-6 py-5 border-b overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${watchedColor || "#3b82f6"}15 0%, transparent 60%), linear-gradient(180deg, hsl(var(--muted))/.4 0%, transparent 100%)`,
              }}
            >
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_hsl(var(--primary)/0.06)_0%,_transparent_60%)] pointer-events-none" />

              <div className="relative flex items-start gap-3">
                <div
                  className="h-10 w-10 rounded-xl shadow-sm border flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: watchedColor ? `${watchedColor}20` : "hsl(var(--primary) / 0.1)",
                    borderColor: watchedColor ? `${watchedColor}40` : undefined,
                  }}
                >
                  <Wand2
                    className="h-5 w-5"
                    style={{ color: watchedColor || "hsl(var(--primary))" }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-base font-semibold leading-tight">
                    {existing ? "Edit Scenario" : "New Scenario"}
                  </SheetTitle>
                  <SheetDescription className="text-xs mt-0.5">
                    {existing
                      ? "Update the actions agents perform when running this scenario."
                      : "Compose a one-click action sequence agents can run on any ticket."}
                  </SheetDescription>
                  {watchedName && (
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border bg-background/80 backdrop-blur px-2.5 py-0.5 text-[11px]">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: watchedColor || "hsl(var(--primary))" }}
                      />
                      <span className="font-medium truncate max-w-[200px]">{watchedName}</span>
                      {Array.isArray(watchedActions) && watchedActions.length > 0 && (
                        <span className="text-muted-foreground">
                          · {watchedActions.length} action{watchedActions.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </SheetHeader>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Section: Identity */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Identity
                </h3>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input {...register("name")} placeholder="e.g. Escalate to Tier 2" />
                {errors.name && <ErrorMessage message={errors.name.message} />}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  Description <span className="text-muted-foreground font-normal">· optional</span>
                </Label>
                <Textarea
                  {...register("description")}
                  placeholder="Brief explanation shown to agents"
                  className="min-h-[60px] text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  Accent color <span className="text-muted-foreground font-normal">· optional</span>
                </Label>
                <Controller
                  control={control}
                  name="color"
                  render={({ field }) => (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {COLOR_PRESETS.map((c) => {
                          const active = field.value?.toLowerCase() === c.toLowerCase();
                          return (
                            <button
                              key={c}
                              type="button"
                              onClick={() => field.onChange(c)}
                              className={`relative h-7 w-7 rounded-full transition-all ${
                                active ? "ring-2 ring-offset-2 ring-offset-background scale-110" : "hover:scale-110"
                              }`}
                              style={{ backgroundColor: c, ...(active ? { ["--tw-ring-color" as any]: c } : {}) }}
                              aria-label={`Set color ${c}`}
                            />
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => field.onChange("")}
                          className={`h-7 w-7 rounded-full border-2 border-dashed flex items-center justify-center text-muted-foreground hover:text-foreground transition ${
                            !field.value ? "border-foreground/40" : "border-muted-foreground/30"
                          }`}
                          aria-label="No color"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <Input
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value)}
                        placeholder="#3b82f6"
                        className="h-8 text-sm font-mono"
                      />
                    </div>
                  )}
                />
                {errors.color && <ErrorMessage message={errors.color.message} />}
              </div>
            </section>

            <div className="border-t" />

            {/* Section: Visibility */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Visibility
                </h3>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(["public", "team", "private"] as ScenarioVisibility[]).map((v) => {
                  const cfg = VISIBILITY_CONFIG[v];
                  const Icon = cfg.icon;
                  const active = watchedVisibility === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        setValue("visibility", v);
                        if (v !== "team") setValue("visibilityTeamId", undefined);
                      }}
                      className={`group relative flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs transition-all ${
                        active
                          ? "border-primary bg-primary/5 text-primary shadow-sm"
                          : "text-muted-foreground hover:border-foreground/30 hover:bg-muted/40"
                      }`}
                    >
                      <span
                        className={`h-7 w-7 inline-flex items-center justify-center rounded-lg transition-colors ${
                          active ? "bg-primary/10" : "bg-muted group-hover:bg-muted-foreground/10"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="font-semibold">{cfg.label}</span>
                      <span className="text-[10px] text-center leading-tight opacity-70">
                        {v === "public"  && "Everyone"}
                        {v === "team"    && "Your team"}
                        {v === "private" && "Only you"}
                      </span>
                    </button>
                  );
                })}
              </div>

              {watchedVisibility === "team" && (
                <Controller
                  control={control}
                  name="visibilityTeamId"
                  render={({ field }) => (
                    <SearchableSelect
                      options={teams.map((t) => ({ value: String(t.id), label: t.name }))}
                      value={field.value != null ? String(field.value) : ""}
                      onChange={(v) => field.onChange(Number(v))}
                      placeholder={teams.length === 0 ? "No teams configured" : "Select team…"}
                      searchPlaceholder="Search teams…"
                      className="h-9 text-sm"
                    />
                  )}
                />
              )}
            </section>

            <div className="border-t" />

            {/* Section: Actions */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Actions
                  </h3>
                  {fields.length > 0 && (
                    <span className="rounded-full bg-muted text-muted-foreground px-1.5 py-0.5 text-[10px] font-medium">
                      {fields.length}
                    </span>
                  )}
                </div>
              </div>

              {errors.actions && (
                <ErrorMessage message={(errors.actions as any).message ?? "Invalid actions"} />
              )}

              {fields.length === 0 ? (
                <div className="rounded-lg border border-dashed py-8 text-center">
                  <Zap className="h-6 w-6 text-muted-foreground/40 mx-auto" />
                  <p className="text-xs text-muted-foreground mt-2">No actions yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {fields.map((field, idx) => (
                    <Controller
                      key={field.id}
                      control={control}
                      name={`actions.${idx}`}
                      render={({ field: f }) => (
                        <ActionEditor
                          index={idx}
                          value={f.value as ScenarioAction}
                          onChange={(val) => update(idx, val)}
                          onRemove={() => remove(idx)}
                          agents={agents}
                          teams={teams}
                          customFieldDefs={customFieldDefs}
                        />
                      )}
                    />
                  ))}
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 text-xs w-full border-dashed hover:border-solid hover:bg-primary/5 hover:text-primary hover:border-primary/40 transition-colors"
                onClick={() => append({ type: "escalate" } as ScenarioAction)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Action
              </Button>
            </section>

            {mutation.isError && (
              <ErrorAlert error={mutation.error} fallback="Failed to save scenario" />
            )}
          </div>

          {/* Sticky footer */}
          <SheetFooter className="shrink-0 mt-0 px-6 py-3 border-t bg-muted/30 flex-row sm:justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || mutation.isPending}
              className="gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {existing ? "Save Changes" : "Create Scenario"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ScenariosPage() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ScenarioSummary | null>(null);
  const [deleting, setDeleting] = useState<ScenarioSummary | null>(null);

  const currentUserId   = session?.user?.id;
  const currentUserRole = (session?.user as any)?.role as string | undefined;
  const isAdminOrSupervisor = currentUserRole === "admin" || currentUserRole === "supervisor";

  const { data, isLoading, error } = useQuery({
    queryKey: ["scenarios"],
    queryFn: async () => {
      const { data } = await axios.get<{ scenarios: ScenarioSummary[] }>("/api/scenarios");
      return data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: number; isEnabled: boolean }) => {
      await axios.patch(`/api/scenarios/${id}`, { isEnabled });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scenarios"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await axios.delete(`/api/scenarios/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["scenarios"] });
      setDeleting(null);
    },
  });

  const scenarios = data?.scenarios ?? [];

  function canEdit(s: ScenarioSummary) {
    return isAdminOrSupervisor || s.createdById === currentUserId;
  }

  return (
    <div className="space-y-6">
      <BackLink to="/settings">Back to Settings</BackLink>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Scenario Automations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Named action sequences that agents can manually invoke on any ticket.
            Unlike workflow rules, scenarios never run automatically.
          </p>
        </div>
        <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New Scenario
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-16 rounded-lg border bg-muted/30 animate-pulse" />
          ))}
        </div>
      )}

      {error && <ErrorAlert error={error} fallback="Failed to load scenarios" />}

      {!isLoading && scenarios.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center gap-3">
          <Zap className="h-8 w-8 text-muted-foreground/40" />
          <div>
            <p className="font-medium text-sm">No scenarios yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create your first scenario to give agents one-click actions on tickets.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
            Create Scenario
          </Button>
        </div>
      )}

      {scenarios.length > 0 && (
        <div className="divide-y rounded-lg border">
          {scenarios.map((scenario) => (
            <div key={scenario.id} className="flex items-start gap-4 p-4">
              {/* Color dot */}
              <div className="pt-0.5">
                <span
                  className="block h-3 w-3 rounded-full border"
                  style={{
                    backgroundColor: scenario.color ?? "hsl(var(--muted-foreground))",
                  }}
                />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{scenario.name}</span>
                  {!scenario.isEnabled && (
                    <Badge variant="outline" className="text-[10px]">Disabled</Badge>
                  )}
                  {/* Visibility badge */}
                  {(() => {
                    const cfg = VISIBILITY_CONFIG[scenario.visibility];
                    const Icon = cfg.icon;
                    const teamName = scenario.visibilityTeam?.name;
                    return (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.badge}`}>
                        <Icon className="h-2.5 w-2.5" />
                        {scenario.visibility === "team" && teamName ? teamName : cfg.label}
                      </span>
                    );
                  })()}
                  <Badge variant="secondary" className="text-[10px]">
                    {scenario.actions.length} action{scenario.actions.length !== 1 ? "s" : ""}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {scenario._count.executions} run{scenario._count.executions !== 1 ? "s" : ""}
                  </span>
                </div>
                {scenario.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{scenario.description}</p>
                )}
                {scenario.createdBy && (
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    By {scenario.createdById === currentUserId ? "you" : scenario.createdBy.name}
                  </p>
                )}
                <ul className="mt-1.5 space-y-0.5">
                  {scenario.actions.map((action, idx) => (
                    <li key={idx} className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <span className="text-muted-foreground/40">→</span>
                      {actionSummary(action, buildFieldMap([]))}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-3 shrink-0">
                {canEdit(scenario) && (
                  <Switch
                    checked={scenario.isEnabled}
                    onCheckedChange={(checked) =>
                      toggleMutation.mutate({ id: scenario.id, isEnabled: checked })
                    }
                  />
                )}
                {canEdit(scenario) && (
                  <button
                    type="button"
                    onClick={() => setEditing(scenario)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                {canEdit(scenario) && (
                  <button
                    type="button"
                    onClick={() => setDeleting(scenario)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <ScenarioDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />

      {/* Edit dialog */}
      {editing && (
        <ScenarioDialog
          open={true}
          existing={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete scenario?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleting?.name}</strong> will be permanently deleted along with its
              execution history. Agents will no longer be able to invoke it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
              disabled={deleteMutation.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
