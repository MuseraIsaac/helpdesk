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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Zap, Plus, Pencil, Trash2, X, Globe, Users, Lock } from "lucide-react";
import {
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
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

  return (
    <div className="rounded-md border p-3 space-y-2 bg-muted/30">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Action {index + 1}</span>
        <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-destructive transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Action type */}
      <Select value={value.type} onValueChange={(type) => onChange({ type } as ScenarioAction)}>
        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select action type" /></SelectTrigger>
        <SelectContent>
          {Object.entries(ACTION_TYPE_LABELS).map(([t, label]) => (
            <SelectItem key={t} value={t}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* update_field — grouped field selector + value picker */}
      {value.type === "update_field" && (
        <div className="space-y-2">
          {/* Grouped field selector */}
          <Select
            value={selectedField || "__none__"}
            onValueChange={(field) => onChange({ type: "update_field", field: field === "__none__" ? "" : field, value: "" } as any)}
          >
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select field…" /></SelectTrigger>
            <SelectContent className="max-h-72">
              {STATIC_FIELD_GROUPS.map((group) => (
                <SelectGroup key={group.label}>
                  <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70 px-2">
                    {group.label}
                  </SelectLabel>
                  {group.fields.map((f) => (
                    <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                  ))}
                </SelectGroup>
              ))}
              {customGroup.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70 px-2">
                    Custom Fields
                  </SelectLabel>
                  {customGroup.map((f) => (
                    <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>

          {/* Value picker for selected field */}
          {selectedField && selectedDef && (
            selectedDef.isText ? (
              <Input
                className="h-8 text-sm"
                placeholder={`Enter ${selectedDef.label.toLowerCase()}…`}
                value={(value as any).value ?? ""}
                onChange={(e) => onChange({ ...value, value: e.target.value } as any)}
              />
            ) : (
              <Select
                value={(value as any).value ?? ""}
                onValueChange={(v) => onChange({ ...value, value: v } as any)}
              >
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select value…" /></SelectTrigger>
                <SelectContent>
                  {selectedDef.options.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          )}
        </div>
      )}

      {/* assign_user */}
      {value.type === "assign_user" && (
        <Select
          value={(value as any).agentId ?? ""}
          onValueChange={(agentId) => {
            if (agentId === "__me__") {
              onChange({ type: "assign_user", agentId: "__me__", agentName: "Me (whoever runs this)" } as any);
            } else {
              const agent = agents.find((a) => a.id === agentId);
              onChange({ type: "assign_user", agentId, agentName: agent?.name } as any);
            }
          }}
        >
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select agent…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__me__">
              <span className="flex items-center gap-1.5">
                <span className="font-medium">Me</span>
                <span className="text-muted-foreground text-[11px]">(whoever runs this scenario)</span>
              </span>
            </SelectItem>
            {agents.length > 0 && <div className="mx-2 my-1 border-t" />}
            {agents.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading agents…</div>}
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* assign_team */}
      {value.type === "assign_team" && (
        <Select
          value={String((value as any).teamId ?? "")}
          onValueChange={(teamId) => {
            const team = teams.find((t) => String(t.id) === teamId);
            onChange({ type: "assign_team", teamId: Number(teamId), teamName: team?.name } as any);
          }}
        >
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select team…" /></SelectTrigger>
          <SelectContent>
            {teams.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading teams…</div>}
            {teams.map((team) => (
              <SelectItem key={team.id} value={String(team.id)}>{team.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* add_note */}
      {value.type === "add_note" && (
        <div className="space-y-1.5">
          <Textarea
            className="text-sm min-h-[80px]"
            placeholder="Note body…"
            value={(value as any).body ?? ""}
            onChange={(e) => onChange({ ...value, body: e.target.value } as any)}
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
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
        <p className="text-xs text-muted-foreground">
          Marks the ticket as escalated and logs an escalation event.
        </p>
      )}
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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Scenario" : "New Scenario"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          {/* Name */}
          <div className="space-y-1">
            <Label>Name</Label>
            <Input {...register("name")} placeholder="e.g. Escalate to Tier 2" />
            {errors.name && <ErrorMessage message={errors.name.message} />}
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              {...register("description")}
              placeholder="Brief explanation shown to agents"
              className="min-h-[60px] text-sm"
            />
          </div>

          {/* Color */}
          <div className="space-y-1">
            <Label>Color <span className="text-muted-foreground font-normal">(optional hex, e.g. #3b82f6)</span></Label>
            <div className="flex items-center gap-2">
              <Input
                {...register("color")}
                placeholder="#3b82f6"
                className="h-8 text-sm font-mono flex-1"
              />
              <Controller
                control={control}
                name="color"
                render={({ field }) => (
                  <span
                    className="h-8 w-8 rounded border shrink-0"
                    style={{ backgroundColor: field.value || "transparent" }}
                  />
                )}
              />
            </div>
            {errors.color && <ErrorMessage message={errors.color.message} />}
          </div>

          {/* Visibility */}
          <div className="space-y-2">
            <Label>Visibility</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["public", "team", "private"] as ScenarioVisibility[]).map((v) => {
                const cfg = VISIBILITY_CONFIG[v];
                const Icon = cfg.icon;
                const active = watchedVisibility === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => { setValue("visibility", v); if (v !== "team") setValue("visibilityTeamId", undefined); }}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition-colors ${
                      active ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground hover:border-muted-foreground/40"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="font-medium">{cfg.label}</span>
                    <span className="text-[10px] text-center leading-tight">
                      {v === "public"  && "Everyone"}
                      {v === "team"    && "Your team"}
                      {v === "private" && "Only you"}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Team selector — shown only when visibility = "team" */}
            {watchedVisibility === "team" && (
              <Controller
                control={control}
                name="visibilityTeamId"
                render={({ field }) => (
                  <Select
                    value={field.value != null ? String(field.value) : ""}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select team…" />
                    </SelectTrigger>
                    <SelectContent>
                      {teams.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                      ))}
                      {teams.length === 0 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">No teams configured</div>
                      )}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <Label>Actions</Label>
            {errors.actions && (
              <ErrorMessage message={(errors.actions as any).message ?? "Invalid actions"} />
            )}
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs w-full"
              onClick={() => append({ type: "escalate" } as ScenarioAction)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Action
            </Button>
          </div>

          {mutation.isError && (
            <ErrorAlert error={mutation.error} fallback="Failed to save scenario" />
          )}

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting || mutation.isPending}>
              {existing ? "Save Changes" : "Create Scenario"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
