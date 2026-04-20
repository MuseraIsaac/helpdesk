/**
 * EscalationRulesManager — inline component for the Incidents and Requests
 * settings sections. Lets admins define condition-based rules that route
 * incidents/requests to specific agents or teams.
 *
 * Field groups:
 *  - Module-specific built-in fields (e.g. p1-p4 priority for incidents)
 *  - Source Ticket fields (available when the record was created from a ticket)
 *  - Custom Fields — dynamically loaded from /api/custom-fields
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Plus, Trash2, Pencil, GripVertical, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import ErrorAlert from "@/components/ErrorAlert";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RuleModule = "incident" | "request" | "ticket";

interface Condition {
  field:    string;
  operator: "equals" | "not_equals" | "in";
  value:    string;
}

interface EscalationRule {
  id:               number;
  name:             string;
  module:           RuleModule;
  conditions:       Condition[];
  conditionLogic:   "AND" | "OR";
  escalateToTeamId: number | null;
  escalateToUserId: string | null;
  position:         number;
  isActive:         boolean;
  notifyByEmail:    boolean;
  notifyInApp:      boolean;
  notificationNote: string | null;
  createdAt:        string;
}

interface Agent { id: string; name: string }
interface Team  { id: number; name: string; color: string }

interface CustomFieldRaw {
  key:       string;
  label:     string;
  fieldType: string;
  options:   string[];
}

// ─── Field metadata ───────────────────────────────────────────────────────────

interface FieldOption { value: string; label: string }
interface FieldDef    { value: string; label: string; options: FieldOption[]; type?: "text" }
interface FieldGroup  { label: string; fields: FieldDef[] }

// ── Common reusable option sets ───────────────────────────────────────────────

const TICKET_PRIORITY_OPTIONS: FieldOption[] = [
  { value: "urgent", label: "Urgent" },
  { value: "high",   label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low",    label: "Low" },
];

const SEVERITY_OPTIONS: FieldOption[] = [
  { value: "sev1", label: "Sev 1 — Critical" },
  { value: "sev2", label: "Sev 2 — Major" },
  { value: "sev3", label: "Sev 3 — Minor" },
  { value: "sev4", label: "Sev 4 — Low" },
];

const IMPACT_OPTIONS: FieldOption[] = [
  { value: "high",   label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low",    label: "Low" },
];

const URGENCY_OPTIONS: FieldOption[] = [
  { value: "high",   label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low",    label: "Low" },
];

const CATEGORY_OPTIONS: FieldOption[] = [
  { value: "general_question",   label: "General Question" },
  { value: "technical_question", label: "Technical Question" },
  { value: "refund_request",     label: "Refund Request" },
];

const SOURCE_OPTIONS: FieldOption[] = [
  { value: "email",  label: "Email" },
  { value: "portal", label: "Portal" },
  { value: "agent",  label: "Agent (manual)" },
];

const BOOL_OPTIONS: FieldOption[] = [
  { value: "true",  label: "Yes" },
  { value: "false", label: "No" },
];

// ── Source Ticket fields (shared between incident and request modules) ─────────

const SOURCE_TICKET_FIELDS: FieldDef[] = [
  { value: "ticketPriority",   label: "Ticket Priority",    options: TICKET_PRIORITY_OPTIONS },
  { value: "severity",         label: "Severity",           options: SEVERITY_OPTIONS },
  { value: "impact",           label: "Impact",             options: IMPACT_OPTIONS },
  { value: "urgency",          label: "Urgency",            options: URGENCY_OPTIONS },
  { value: "category",         label: "Category",           options: CATEGORY_OPTIONS },
  { value: "source",           label: "Source / Channel",   options: SOURCE_OPTIONS },
  { value: "ticketSlaBreached", label: "Ticket SLA Breached", options: BOOL_OPTIONS },
  { value: "ticketIsEscalated", label: "Ticket Escalated",    options: BOOL_OPTIONS },
];

// ── Per-module field groups ───────────────────────────────────────────────────

const INCIDENT_FIELD_GROUPS: FieldGroup[] = [
  {
    label: "Incident",
    fields: [
      { value: "priority", label: "Priority", options: [
        { value: "p1", label: "P1 — Critical" },
        { value: "p2", label: "P2 — High" },
        { value: "p3", label: "P3 — Medium" },
        { value: "p4", label: "P4 — Low" },
      ]},
      { value: "status", label: "Status", options: [
        { value: "new",          label: "New" },
        { value: "acknowledged", label: "Acknowledged" },
        { value: "in_progress",  label: "In Progress" },
        { value: "resolved",     label: "Resolved" },
        { value: "closed",       label: "Closed" },
      ]},
      { value: "isMajor",           label: "Is Major Incident",    options: BOOL_OPTIONS },
      { value: "slaBreached",       label: "SLA Breached",         options: BOOL_OPTIONS },
      { value: "affectedSystem",    label: "Affected System",      options: [], type: "text" },
      { value: "affectedUserCount", label: "Affected User Count",  options: [], type: "text" },
    ],
  },
  {
    label: "Source Ticket",
    fields: SOURCE_TICKET_FIELDS,
  },
];

const REQUEST_FIELD_GROUPS: FieldGroup[] = [
  {
    label: "Service Request",
    fields: [
      { value: "priority", label: "Priority", options: TICKET_PRIORITY_OPTIONS },
      { value: "status", label: "Status", options: [
        { value: "draft",            label: "Draft" },
        { value: "submitted",        label: "Submitted" },
        { value: "pending_approval", label: "Pending Approval" },
        { value: "approved",         label: "Approved" },
        { value: "in_fulfillment",   label: "In Fulfillment" },
        { value: "fulfilled",        label: "Fulfilled" },
        { value: "rejected",         label: "Rejected" },
        { value: "cancelled",        label: "Cancelled" },
        { value: "closed",           label: "Closed" },
      ]},
      { value: "approvalStatus", label: "Approval Status", options: [
        { value: "not_required", label: "Not Required" },
        { value: "pending",      label: "Pending" },
        { value: "approved",     label: "Approved" },
        { value: "rejected",     label: "Rejected" },
      ]},
      { value: "slaBreached",     label: "SLA Breached",        options: BOOL_OPTIONS },
      { value: "catalogItemName", label: "Catalog Item Name",   options: [], type: "text" },
    ],
  },
  {
    label: "Source Ticket",
    fields: SOURCE_TICKET_FIELDS,
  },
];

const TICKET_FIELD_GROUPS: FieldGroup[] = [
  {
    label: "Ticket",
    fields: [
      { value: "priority",    label: "Priority",        options: TICKET_PRIORITY_OPTIONS },
      { value: "severity",    label: "Severity",        options: SEVERITY_OPTIONS },
      { value: "impact",      label: "Impact",          options: IMPACT_OPTIONS },
      { value: "urgency",     label: "Urgency",         options: URGENCY_OPTIONS },
      { value: "category",    label: "Category",        options: CATEGORY_OPTIONS },
      { value: "ticketType",  label: "Ticket Type",     options: [
        { value: "incident",        label: "Incident" },
        { value: "service_request", label: "Service Request" },
        { value: "problem",         label: "Problem" },
        { value: "change_request",  label: "Change Request" },
      ]},
      { value: "status", label: "Status", options: [
        { value: "new",         label: "New" },
        { value: "processing",  label: "Processing" },
        { value: "open",        label: "Open" },
        { value: "in_progress", label: "In Progress" },
        { value: "resolved",    label: "Resolved" },
        { value: "closed",      label: "Closed" },
      ]},
      { value: "source",      label: "Source / Channel", options: SOURCE_OPTIONS },
      { value: "slaBreached", label: "SLA Breached",     options: BOOL_OPTIONS },
      { value: "isEscalated", label: "Is Escalated",     options: BOOL_OPTIONS },
    ],
  },
];

function getFieldGroups(module: RuleModule): FieldGroup[] {
  if (module === "incident") return INCIDENT_FIELD_GROUPS;
  if (module === "request")  return REQUEST_FIELD_GROUPS;
  return TICKET_FIELD_GROUPS;
}

function moduleToEntityType(module: RuleModule): string {
  return module === "request" ? "request" : "ticket";
}

// Convert a raw custom field from the API to a FieldDef
function customFieldToDef(cf: CustomFieldRaw): FieldDef {
  if (cf.fieldType === "select" || cf.fieldType === "multiselect") {
    return {
      value:   cf.key,
      label:   cf.label,
      options: cf.options.map((o) => ({ value: o, label: o })),
    };
  }
  if (cf.fieldType === "switch") {
    return { value: cf.key, label: cf.label, options: BOOL_OPTIONS };
  }
  return { value: cf.key, label: cf.label, options: [], type: "text" };
}

// ─── Condition summary text ───────────────────────────────────────────────────

function conditionSummary(c: Condition, allFields: FieldDef[]): string {
  const fieldDef  = allFields.find((f) => f.value === c.field);
  const fieldLabel = fieldDef?.label ?? c.field;
  const valueParts = c.value.split(",").map((v) => {
    const opt = fieldDef?.options.find((o) => o.value === v.trim());
    return opt?.label ?? v.trim();
  });
  const opLabel =
    c.operator === "equals"     ? "is" :
    c.operator === "not_equals" ? "is not" :
                                  "is one of";
  return `${fieldLabel} ${opLabel} ${valueParts.join(", ")}`;
}

// ─── Rule form ────────────────────────────────────────────────────────────────

interface RuleFormValues {
  name:             string;
  conditionLogic:   "AND" | "OR";
  conditions:       Condition[];
  escalateToTeamId: number | null;
  escalateToUserId: string | null;
  position:         number;
  isActive:         boolean;
  notifyByEmail:    boolean;
  notifyInApp:      boolean;
  notificationNote: string;
}

function emptyCondition(): Condition {
  return { field: "", operator: "equals", value: "" };
}

interface RuleFormProps {
  fieldGroups:     FieldGroup[];
  customFieldDefs: FieldDef[];
  agents:          Agent[];
  teams:           Team[];
  initial?:        Partial<RuleFormValues>;
  onSubmit:        (values: RuleFormValues) => void;
  isPending:       boolean;
  error:           Error | null;
  submitLabel:     string;
}

function RuleForm({
  fieldGroups, customFieldDefs, agents, teams,
  initial, onSubmit, isPending, error, submitLabel,
}: RuleFormProps) {
  const allFields = useMemo(
    () => [...fieldGroups.flatMap((g) => g.fields), ...customFieldDefs],
    [fieldGroups, customFieldDefs]
  );

  const [name,             setName]             = useState(initial?.name ?? "");
  const [conditionLogic,   setConditionLogic]   = useState<"AND" | "OR">(initial?.conditionLogic ?? "AND");
  const [conditions,       setConditions]       = useState<Condition[]>(
    initial?.conditions?.length ? initial.conditions : [emptyCondition()]
  );
  const [escalateTarget,   setEscalateTarget]   = useState<"team" | "user">(
    initial?.escalateToTeamId ? "team" : "user"
  );
  const [teamId,           setTeamId]           = useState<number | null>(initial?.escalateToTeamId ?? null);
  const [userId,           setUserId]           = useState<string | null>(initial?.escalateToUserId ?? null);
  const [position,         setPosition]         = useState(initial?.position ?? 0);
  const [isActive,         setIsActive]         = useState(initial?.isActive ?? true);
  const [notifyByEmail,    setNotifyByEmail]    = useState(initial?.notifyByEmail ?? false);
  const [notifyInApp,      setNotifyInApp]      = useState(initial?.notifyInApp ?? true);
  const [notificationNote, setNotificationNote] = useState(initial?.notificationNote ?? "");

  function updateCondition(i: number, patch: Partial<Condition>) {
    setConditions((prev) =>
      prev.map((c, j) =>
        j === i ? { ...c, ...patch, ...(patch.field ? { value: "" } : {}) } : c
      )
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name, conditionLogic, conditions,
      escalateToTeamId: escalateTarget === "team" ? teamId : null,
      escalateToUserId: escalateTarget === "user" ? userId : null,
      position, isActive,
      notifyByEmail, notifyInApp,
      notificationNote,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Name */}
      <div className="space-y-1.5">
        <Label>Rule name <span className="text-destructive">*</span></Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. P1 Critical → NOC Team"
          required
        />
      </div>

      {/* Conditions */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Conditions <span className="text-destructive">*</span></Label>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Match</span>
            <Select value={conditionLogic} onValueChange={(v) => setConditionLogic(v as "AND" | "OR")}>
              <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="AND">ALL</SelectItem>
                <SelectItem value="OR">ANY</SelectItem>
              </SelectContent>
            </Select>
            <span>of the following</span>
          </div>
        </div>

        <div className="space-y-2">
          {conditions.map((cond, i) => {
            const fieldDef = allFields.find((f) => f.value === cond.field);
            const isTextField = !fieldDef || fieldDef.type === "text";

            return (
              <div key={i} className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0" />

                {/* Field — grouped Select */}
                <Select
                  value={cond.field || "__none__"}
                  onValueChange={(v) => updateCondition(i, { field: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue placeholder="Select field…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {fieldGroups.map((group) => (
                      <SelectGroup key={group.label}>
                        <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70 px-2">
                          {group.label}
                        </SelectLabel>
                        {group.fields.map((f) => (
                          <SelectItem key={f.value} value={f.value} className="text-xs">
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                    {customFieldDefs.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70 px-2">
                          Custom Fields
                        </SelectLabel>
                        {customFieldDefs.map((f) => (
                          <SelectItem key={f.value} value={f.value} className="text-xs">
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>

                {/* Operator */}
                <Select
                  value={cond.operator}
                  onValueChange={(v) => updateCondition(i, { operator: v as Condition["operator"] })}
                >
                  <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">is</SelectItem>
                    <SelectItem value="not_equals">is not</SelectItem>
                    <SelectItem value="in">is one of</SelectItem>
                  </SelectContent>
                </Select>

                {/* Value */}
                {isTextField ? (
                  <Input
                    className="h-8 text-xs flex-1"
                    value={cond.value}
                    onChange={(e) => updateCondition(i, { value: e.target.value })}
                    placeholder={fieldDef?.type === "text" ? `Enter ${fieldDef.label.toLowerCase()}…` : "Value…"}
                  />
                ) : (
                  <Select
                    value={cond.value || "__none__"}
                    onValueChange={(v) => updateCondition(i, { value: v === "__none__" ? "" : v })}
                  >
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <SelectValue placeholder="Select value…" />
                    </SelectTrigger>
                    <SelectContent>
                      {fieldDef!.options.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="text-xs">
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Remove */}
                <Button
                  type="button" variant="ghost" size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setConditions((prev) => prev.filter((_, j) => j !== i))}
                  disabled={conditions.length === 1}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>

        <Button
          type="button" variant="outline" size="sm" className="h-7 text-xs gap-1.5"
          onClick={() => setConditions((prev) => [...prev, emptyCondition()])}
        >
          <Plus className="h-3 w-3" />
          Add condition
        </Button>
      </div>

      {/* Escalate to */}
      <div className="space-y-2">
        <Label>Escalate to <span className="text-destructive">*</span></Label>
        <div className="flex gap-2">
          <Button
            type="button" size="sm"
            variant={escalateTarget === "team" ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => setEscalateTarget("team")}
          >
            <Check className={`h-3.5 w-3.5 mr-1.5 ${escalateTarget === "team" ? "opacity-100" : "opacity-0"}`} />
            Team / Group
          </Button>
          <Button
            type="button" size="sm"
            variant={escalateTarget === "user" ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => setEscalateTarget("user")}
          >
            <Check className={`h-3.5 w-3.5 mr-1.5 ${escalateTarget === "user" ? "opacity-100" : "opacity-0"}`} />
            Agent
          </Button>
        </div>

        {escalateTarget === "team" ? (
          <Select
            value={teamId != null ? String(teamId) : "__none__"}
            onValueChange={(v) => setTeamId(v === "__none__" ? null : Number(v))}
          >
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select team…" /></SelectTrigger>
            <SelectContent>
              {teams.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                    {t.name}
                  </span>
                </SelectItem>
              ))}
              {teams.length === 0 && (
                <div className="py-2 px-2 text-xs text-muted-foreground">No teams configured</div>
              )}
            </SelectContent>
          </Select>
        ) : (
          <Select
            value={userId ?? "__none__"}
            onValueChange={(v) => setUserId(v === "__none__" ? null : v)}
          >
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select agent…" /></SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
              {agents.length === 0 && (
                <div className="py-2 px-2 text-xs text-muted-foreground">No agents found</div>
              )}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Notifications */}
      <div className="space-y-2">
        <Label>Notifications <span className="text-xs font-normal text-muted-foreground">(sent to the escalation target)</span></Label>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <Switch checked={notifyInApp} onCheckedChange={setNotifyInApp} />
            In-app notification
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <Switch checked={notifyByEmail} onCheckedChange={setNotifyByEmail} />
            Email notification
          </label>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Optional message to include in notification</Label>
          <Input
            value={notificationNote}
            onChange={(e) => setNotificationNote(e.target.value)}
            placeholder="e.g. This is a P1 incident — please respond within 15 minutes"
            className="text-sm"
            maxLength={500}
          />
        </div>
      </div>

      {/* Position + Active */}
      <div className="flex items-center gap-4">
        <div className="space-y-1">
          <Label className="text-xs">Evaluation Order</Label>
          <Input
            type="number" min={0} className="h-8 w-20 text-xs"
            value={position}
            onChange={(e) => setPosition(parseInt(e.target.value, 10) || 0)}
          />
        </div>
        <div className="flex items-center gap-2 pt-5">
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          <span className="text-xs text-muted-foreground">Active</span>
        </div>
      </div>

      {error && <ErrorAlert error={error} fallback="Failed to save rule" />}

      <div className="flex justify-end pt-1">
        <Button
          type="submit"
          disabled={isPending || !name.trim() || conditions.some((c) => !c.field || !c.value)}
        >
          {isPending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ─── EscalationRulesManager ───────────────────────────────────────────────────

interface EscalationRulesManagerProps {
  module: RuleModule;
}

export default function EscalationRulesManager({ module }: EscalationRulesManagerProps) {
  const qc = useQueryClient();
  const [createOpen,   setCreateOpen]   = useState(false);
  const [editTarget,   setEditTarget]   = useState<EscalationRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EscalationRule | null>(null);

  const fieldGroups   = getFieldGroups(module);
  const entityType    = moduleToEntityType(module);

  // Data fetching
  const { data: rulesData, isLoading } = useQuery<{ rules: EscalationRule[] }>({
    queryKey: ["escalation-rules", module],
    queryFn:  async () => { const { data } = await axios.get(`/api/escalation-rules?module=${module}`); return data; },
  });

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn:  async () => { const { data } = await axios.get<{ agents: Agent[] }>("/api/agents"); return data.agents; },
  });

  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn:  async () => { const { data } = await axios.get<{ teams: Team[] }>("/api/teams"); return data.teams; },
  });

  // Load custom fields for this module's entity type
  const { data: customFieldsData } = useQuery<{ fields: CustomFieldRaw[] }>({
    queryKey: ["custom-fields", entityType],
    queryFn:  async () => {
      const { data } = await axios.get(`/api/custom-fields?entityType=${entityType}`);
      return data;
    },
  });

  const rules          = rulesData?.rules  ?? [];
  const agents         = agentsData        ?? [];
  const teams          = teamsData         ?? [];
  const customFieldDefs = useMemo(
    () => (customFieldsData?.fields ?? []).map(customFieldToDef),
    [customFieldsData]
  );
  const allFields = useMemo(
    () => [...fieldGroups.flatMap((g) => g.fields), ...customFieldDefs],
    [fieldGroups, customFieldDefs]
  );

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (values: RuleFormValues) => {
      await axios.post("/api/escalation-rules", { ...values, module });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["escalation-rules", module] });
      setCreateOpen(false);
    },
  });

  const editMutation = useMutation({
    mutationFn: async (values: RuleFormValues) => {
      await axios.put(`/api/escalation-rules/${editTarget!.id}`, values);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["escalation-rules", module] });
      setEditTarget(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      await axios.put(`/api/escalation-rules/${id}`, { isActive });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["escalation-rules", module] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await axios.delete(`/api/escalation-rules/${id}`); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["escalation-rules", module] });
      setDeleteTarget(null);
    },
  });

  function targetLabel(rule: EscalationRule): string {
    if (rule.escalateToTeamId) {
      const team = teams.find((t) => t.id === rule.escalateToTeamId);
      return team ? `Team: ${team.name}` : `Team #${rule.escalateToTeamId}`;
    }
    if (rule.escalateToUserId) {
      const agent = agents.find((a) => a.id === rule.escalateToUserId);
      return agent ? `Agent: ${agent.name}` : "Agent";
    }
    return "—";
  }

  const sharedFormProps = { fieldGroups, customFieldDefs, agents, teams };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Escalation Rules</p>
          <p className="text-xs text-muted-foreground">
            Rules are evaluated in order. The first matching rule wins.
          </p>
        </div>
        <Button
          type="button" size="sm" variant="outline" className="h-8 text-xs gap-1.5"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add rule
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      )}

      {!isLoading && rules.length === 0 && (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">No escalation rules defined.</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Add a rule to automatically route records to a team or agent based on field values.
          </p>
        </div>
      )}

      {rules.length > 0 && (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`rounded-lg border px-4 py-3 ${!rule.isActive ? "opacity-55 bg-muted/20" : "bg-background"}`}
            >
              <div className="flex items-start gap-3">
                <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{rule.name}</span>
                    {!rule.isActive && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Inactive</Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono">
                      {rule.conditionLogic}
                    </Badge>
                  </div>
                  {/* Conditions */}
                  <div className="flex flex-wrap gap-1">
                    {rule.conditions.map((c, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {conditionSummary(c, allFields)}
                      </span>
                    ))}
                  </div>
                  {/* Escalate to */}
                  <p className="text-xs text-muted-foreground">
                    → <span className="font-medium text-foreground">{targetLabel(rule)}</span>
                  </p>
                  {/* Notification badges */}
                  <div className="flex gap-1.5 flex-wrap mt-0.5">
                    {rule.notifyInApp && (
                      <span className="text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-400 rounded px-1.5 py-0.5">In-app</span>
                    )}
                    {rule.notifyByEmail && (
                      <span className="text-[10px] bg-green-500/10 text-green-700 dark:text-green-400 rounded px-1.5 py-0.5">Email</span>
                    )}
                    {rule.notificationNote && (
                      <span className="text-[10px] text-muted-foreground/70 truncate max-w-[200px]" title={rule.notificationNote}>
                        "{rule.notificationNote}"
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <Switch
                    checked={rule.isActive}
                    onCheckedChange={(v) => toggleMutation.mutate({ id: rule.id, isActive: v })}
                    className="scale-90"
                  />
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => setEditTarget(rule)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteTarget(rule)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Escalation Rule</DialogTitle>
          </DialogHeader>
          <RuleForm
            {...sharedFormProps}
            onSubmit={(v) => createMutation.mutate(v)}
            isPending={createMutation.isPending}
            error={createMutation.error}
            submitLabel="Create Rule"
          />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editTarget !== null} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Escalation Rule</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <RuleForm
              key={editTarget.id}
              {...sharedFormProps}
              initial={{
                name:             editTarget.name,
                conditionLogic:   editTarget.conditionLogic,
                conditions:       editTarget.conditions,
                escalateToTeamId: editTarget.escalateToTeamId,
                escalateToUserId: editTarget.escalateToUserId,
                position:         editTarget.position,
                isActive:         editTarget.isActive,
                notifyByEmail:    editTarget.notifyByEmail,
                notifyInApp:      editTarget.notifyInApp,
                notificationNote: editTarget.notificationNote ?? "",
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
            <AlertDialogTitle>Delete escalation rule?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong> will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.isError && <ErrorAlert message="Failed to delete rule" />}
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
