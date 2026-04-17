/**
 * ScenariosPage — admin/supervisor management page for Scenario Automations.
 *
 * Lists all scenario definitions with their action count, enabled state, and
 * run count. Provides create, edit, enable/disable, and delete controls.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createScenarioSchema,
  type CreateScenarioInput,
  type ScenarioAction,
} from "core/schemas/scenarios.ts";
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
import { Zap, Plus, Pencil, Trash2, X } from "lucide-react";
import { ticketTypes, ticketTypeLabel } from "core/constants/ticket-type.ts";
import { ticketPriorities, priorityLabel } from "core/constants/ticket-priority.ts";
import { ticketSeverities, severityLabel } from "core/constants/ticket-severity.ts";
import { agentTicketStatuses, statusLabel } from "core/constants/ticket-status.ts";
import { ticketCategories, categoryLabel } from "core/constants/ticket-category.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentOption {
  id: string;
  name: string;
}

interface TeamOption {
  id: number;
  name: string;
}

interface ScenarioSummary {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  isEnabled: boolean;
  actions: ScenarioAction[];
  _count: { executions: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACTION_TYPE_LABELS: Record<string, string> = {
  update_field: "Update Field",
  assign_user:  "Assign to Agent",
  assign_team:  "Assign to Team",
  add_note:     "Add Internal Note",
  escalate:     "Escalate",
};

// Human-readable label for a field value used in the list view summary
function fieldValueLabel(field: string, value: string): string {
  switch (field) {
    case "ticketType": return ticketTypeLabel[value as keyof typeof ticketTypeLabel] ?? value;
    case "priority":   return priorityLabel[value as keyof typeof priorityLabel] ?? value;
    case "severity":   return severityLabel[value as keyof typeof severityLabel] ?? value;
    case "status":     return statusLabel[value as keyof typeof statusLabel] ?? value;
    case "category":   return categoryLabel[value as keyof typeof categoryLabel] ?? value;
    default:           return value;
  }
}

function actionSummary(action: ScenarioAction): string {
  switch (action.type) {
    case "update_field": {
      const a = action as any;
      const fieldLabel = { priority: "Priority", severity: "Severity", status: "Status", category: "Category", ticketType: "Ticket Type" }[a.field as string] ?? a.field;
      return `Set ${fieldLabel} → ${fieldValueLabel(a.field, a.value)}`;
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

// ── Value picker — renders the right control based on which field is selected ──

// Options for each update_field target
const FIELD_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  ticketType: ticketTypes.map((v) => ({ value: v, label: ticketTypeLabel[v] })),
  priority:   ticketPriorities.map((v) => ({ value: v, label: priorityLabel[v] })),
  severity:   ticketSeverities.map((v) => ({ value: v, label: severityLabel[v] })),
  // Only agent-visible statuses — "new" and "processing" are system-only
  status:     agentTicketStatuses.map((v) => ({ value: v, label: statusLabel[v] })),
  category:   ticketCategories.map((v) => ({ value: v, label: categoryLabel[v] })),
};

interface FieldValuePickerProps {
  field: string;
  value: string;
  onChange: (v: string) => void;
}

function FieldValuePicker({ field, value, onChange }: FieldValuePickerProps) {
  const options = FIELD_OPTIONS[field];
  if (!options) {
    // Fallback for unknown fields
    return (
      <Input
        className="h-8 text-sm"
        placeholder="Value"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-sm">
        <SelectValue placeholder="Select value…" />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Action editor ─────────────────────────────────────────────────────────────

interface ActionEditorProps {
  index: number;
  value: ScenarioAction;
  onChange: (val: ScenarioAction) => void;
  onRemove: () => void;
  agents: AgentOption[];
  teams: TeamOption[];
}

function ActionEditor({ index, value, onChange, onRemove, agents, teams }: ActionEditorProps) {
  const selectedField = value.type === "update_field" ? (value as any).field as string ?? "" : "";

  return (
    <div className="rounded-md border p-3 space-y-2 bg-muted/30">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Action {index + 1}</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Action type selector — resetting dependent fields when type changes */}
      <Select
        value={value.type}
        onValueChange={(type) => onChange({ type } as ScenarioAction)}
      >
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder="Select action type" />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(ACTION_TYPE_LABELS).map(([t, label]) => (
            <SelectItem key={t} value={t}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* update_field — field selector then context-aware value picker */}
      {value.type === "update_field" && (
        <div className="space-y-2">
          <Select
            value={selectedField}
            onValueChange={(field) =>
              // Clear the value whenever the field changes so stale values don't persist
              onChange({ type: "update_field", field, value: "" } as any)
            }
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select field…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ticketType">Ticket Type</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="severity">Severity</SelectItem>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="category">Category</SelectItem>
            </SelectContent>
          </Select>

          {selectedField && (
            <FieldValuePicker
              field={selectedField}
              value={(value as any).value ?? ""}
              onChange={(v) => onChange({ ...value, value: v } as any)}
            />
          )}
        </div>
      )}

      {/* assign_user — agent dropdown with special "Me" sentinel */}
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
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Select agent…" />
          </SelectTrigger>
          <SelectContent>
            {/* "Me" sentinel — resolves to the invoking agent at run time */}
            <SelectItem value="__me__">
              <span className="flex items-center gap-1.5">
                <span className="font-medium">Me</span>
                <span className="text-muted-foreground text-[11px]">(whoever runs this scenario)</span>
              </span>
            </SelectItem>
            {agents.length > 0 && (
              <div className="mx-2 my-1 border-t" />
            )}
            {agents.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading agents…</div>
            )}
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* assign_team — team dropdown */}
      {value.type === "assign_team" && (
        <Select
          value={String((value as any).teamId ?? "")}
          onValueChange={(teamId) => {
            const team = teams.find((t) => String(t.id) === teamId);
            onChange({ type: "assign_team", teamId: Number(teamId), teamName: team?.name } as any);
          }}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Select team…" />
          </SelectTrigger>
          <SelectContent>
            {teams.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading teams…</div>
            )}
            {teams.map((team) => (
              <SelectItem key={team.id} value={String(team.id)}>
                {team.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* add_note — text area */}
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

      {/* escalate — no extra config needed */}
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

  // Fetch agents and teams — needed for assign_user / assign_team pickers
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

  const agents: AgentOption[] = agentsData ?? [];
  const teams: TeamOption[] = teamsData?.teams ?? [];

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateScenarioInput>({
    resolver: zodResolver(createScenarioSchema),
    defaultValues: existing
      ? {
          name: existing.name,
          description: existing.description ?? undefined,
          color: existing.color ?? undefined,
          actions: existing.actions,
        }
      : { name: "", actions: [{ type: "escalate" }] },
  });

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
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ScenarioSummary | null>(null);
  const [deleting, setDeleting] = useState<ScenarioSummary | null>(null);

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
                <ul className="mt-1.5 space-y-0.5">
                  {scenario.actions.map((action, idx) => (
                    <li key={idx} className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <span className="text-muted-foreground/40">→</span>
                      {actionSummary(action)}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-3 shrink-0">
                <Switch
                  checked={scenario.isEnabled}
                  onCheckedChange={(checked) =>
                    toggleMutation.mutate({ id: scenario.id, isEnabled: checked })
                  }
                />
                <button
                  type="button"
                  onClick={() => setEditing(scenario)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(scenario)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
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
