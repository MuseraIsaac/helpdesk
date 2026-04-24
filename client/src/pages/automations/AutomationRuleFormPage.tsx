/**
 * AutomationRuleFormPage — Create or edit an automation rule.
 *
 * Supports all 9 categories, multiple triggers, AND/OR condition trees,
 * and the full action set defined in core/schemas/automations.ts.
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { z } from "zod/v4";
import {
  ArrowLeft, Plus, Trash2, Save, Zap, GripVertical,
  Copy, Play, AlertTriangle, CheckCircle2, ShieldAlert,
  GitCommit, ChevronRight, ChevronsUpDown, Check, Sparkles,
  Settings2, GitBranch, Clock, RefreshCw, Bell, DatabaseZap,
  Activity, Webhook, FlaskConical, Info, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import { createAutomationRuleSchema } from "core/schemas/automations";
import type { AutomationConditionGroup } from "core/schemas/automations";
import {
  AUTOMATION_CATEGORIES,
  AUTOMATION_TRIGGER_LABELS,
  AUTOMATION_ACTION_LABELS,
  CATEGORY_DEFAULT_TRIGGERS,
  CATEGORY_TRIGGERS,
} from "core/constants/automation";
import type {
  AutomationCategory,
  AutomationTriggerType,
  AutomationActionType,
} from "core/constants/automation";
import ConditionBuilder from "./ConditionBuilder";
import ExecutionLogPanel from "./ExecutionLogPanel";

// ── Form schema (client-side, slightly relaxed for UX) ───────────────────────

type FormValues = z.infer<typeof createAutomationRuleSchema>;

const ALL_CATEGORIES = Object.keys(AUTOMATION_CATEGORIES) as AutomationCategory[];
const ALL_TRIGGERS   = Object.keys(AUTOMATION_TRIGGER_LABELS) as AutomationTriggerType[];

// All triggers always available — category is for organisation, not restriction
function getTriggersForCategory(_category: AutomationCategory): AutomationTriggerType[] {
  return ALL_TRIGGERS;
}

// ── Grouped trigger options (for searchable picker) ────────────────────────────

const TRIGGER_GROUPS: Array<{ group: string; items: Array<{ value: string; label: string }> }> = [
  {
    group: "Ticket",
    items: [
      "ticket.created","ticket.updated","ticket.status_changed","ticket.assigned",
      "ticket.unassigned","ticket.escalated","ticket.deescalated","ticket.reply_received",
      "ticket.reply_sent","ticket.note_added","ticket.priority_changed","ticket.category_changed",
      "ticket.due_date_changed","ticket.custom_field_changed","ticket.sla_warning",
      "ticket.sla_breached","ticket.idle","ticket.pending_since","ticket.age",
      "ticket.reopened","ticket.merged",
    ].map((v) => ({ value: v, label: AUTOMATION_TRIGGER_LABELS[v as AutomationTriggerType] ?? v })),
  },
  {
    group: "Incident",
    items: [
      "incident.created","incident.severity_changed","incident.status_changed",
      "incident.assigned","incident.resolved","incident.closed",
    ].map((v) => ({ value: v, label: AUTOMATION_TRIGGER_LABELS[v as AutomationTriggerType] ?? v })),
  },
  {
    group: "Change",
    items: [
      "change.created","change.submitted_for_approval","change.approved",
      "change.rejected","change.implemented","change.rolled_back",
    ].map((v) => ({ value: v, label: AUTOMATION_TRIGGER_LABELS[v as AutomationTriggerType] ?? v })),
  },
  {
    group: "Service Request",
    items: [
      "request.created","request.status_changed","request.approved","request.rejected",
    ].map((v) => ({ value: v, label: AUTOMATION_TRIGGER_LABELS[v as AutomationTriggerType] ?? v })),
  },
  {
    group: "Problem",
    items: [
      "problem.created","problem.updated","problem.status_changed","problem.resolved",
    ].map((v) => ({ value: v, label: AUTOMATION_TRIGGER_LABELS[v as AutomationTriggerType] ?? v })),
  },
  {
    group: "Approval",
    items: ["approval.pending","approval.overdue"]
      .map((v) => ({ value: v, label: AUTOMATION_TRIGGER_LABELS[v as AutomationTriggerType] ?? v })),
  },
  {
    group: "Schedule",
    items: [{ value: "schedule.cron", label: "Scheduled (Cron)" }],
  },
];

// ── Grouped action options (for searchable picker) ─────────────────────────────

const ACTION_GROUPS: Array<{ group: string; items: Array<{ value: string; label: string }> }> = [
  {
    group: "Field & Status",
    items: ["set_field","set_priority","set_category","set_status","set_type","set_severity","set_impact","set_urgency","add_tag","remove_tag","set_affected_system"]
      .map((v) => ({ value: v, label: AUTOMATION_ACTION_LABELS[v as AutomationActionType] ?? v })),
  },
  {
    group: "Assignment",
    items: ["assign_agent","assign_team","assign_smart","assign_by_skill","assign_round_robin","assign_least_loaded","unassign"]
      .map((v) => ({ value: v, label: AUTOMATION_ACTION_LABELS[v as AutomationActionType] ?? v })),
  },
  {
    group: "Communication",
    items: ["add_note","send_reply","send_notification","send_auto_reply","notify_watchers","notify_requester","notify_approvers"]
      .map((v) => ({ value: v, label: AUTOMATION_ACTION_LABELS[v as AutomationActionType] ?? v })),
  },
  {
    group: "Lifecycle",
    items: ["escalate","deescalate","resolve","close","reopen"]
      .map((v) => ({ value: v, label: AUTOMATION_ACTION_LABELS[v as AutomationActionType] ?? v })),
  },
  {
    group: "Approval & SLA",
    items: ["create_approval","notify_approvers","pause_sla","resume_sla"]
      .map((v) => ({ value: v, label: AUTOMATION_ACTION_LABELS[v as AutomationActionType] ?? v })),
  },
  {
    group: "Intake",
    items: ["suppress_creation","mark_spam","quarantine","send_auto_reply","add_watcher"]
      .map((v) => ({ value: v, label: AUTOMATION_ACTION_LABELS[v as AutomationActionType] ?? v })),
  },
  {
    group: "Data Enrichment",
    items: ["enrich_from_requester","enrich_from_domain","enrich_from_keywords","enrich_from_mailbox","set_custom_field","map_field","infer_priority","copy_field"]
      .map((v) => ({ value: v, label: AUTOMATION_ACTION_LABELS[v as AutomationActionType] ?? v })),
  },
  {
    group: "Record Lifecycle",
    items: ["close_stale","create_linked_problem","create_linked_change","create_linked_request","create_child_ticket","create_follow_up","link_to_problem","update_linked_records","merge_into_ticket"]
      .map((v) => ({ value: v, label: AUTOMATION_ACTION_LABELS[v as AutomationActionType] ?? v })),
  },
  {
    group: "Integration",
    items: ["trigger_webhook","create_incident"]
      .map((v) => ({ value: v, label: AUTOMATION_ACTION_LABELS[v as AutomationActionType] ?? v })),
  },
  {
    group: "Workflow",
    items: ["create_linked_task","chain_workflow","stop_processing"]
      .map((v) => ({ value: v, label: AUTOMATION_ACTION_LABELS[v as AutomationActionType] ?? v })),
  },
];

// ── Category icon map ──────────────────────────────────────────────────────────

const CAT_ICONS: Record<AutomationCategory, React.ReactNode> = {
  intake_routing:          <FlaskConical className="size-3.5" />,
  event_workflow:          <GitBranch className="size-3.5" />,
  time_supervisor:         <Clock className="size-3.5" />,
  assignment_routing:      <RefreshCw className="size-3.5" />,
  approval_automation:     <Settings2 className="size-3.5" />,
  notification_automation: <Bell className="size-3.5" />,
  field_automation:        <DatabaseZap className="size-3.5" />,
  lifecycle:               <Activity className="size-3.5" />,
  integration_webhook:     <Webhook className="size-3.5" />,
};

// ── SearchableSelect ──────────────────────────────────────────────────────────

function SearchableSelect({
  value,
  onValueChange,
  placeholder = "Select…",
  options,
  groups,
  className,
  disabled,
  triggerClassName,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  groups?: Array<{ group: string; items: Array<{ value: string; label: string }> }>;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const allItems = groups
    ? groups.flatMap((g) => g.items)
    : (options ?? []);

  const selectedLabel = allItems.find((o) => o.value === value)?.label ?? "";

  const q = search.toLowerCase();
  const filteredGroups = groups?.map((g) => ({
    ...g,
    items: g.items.filter((i) => i.label.toLowerCase().includes(q) || i.value.toLowerCase().includes(q)),
  })).filter((g) => g.items.length > 0);

  const filteredOptions = options?.filter((o) =>
    o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
  );

  const hasResults = groups ? (filteredGroups?.length ?? 0) > 0 : (filteredOptions?.length ?? 0) > 0;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("justify-between font-normal h-9 text-sm w-full", triggerClassName)}
        >
          <span className={cn("truncate text-left", !value && "text-muted-foreground")}>
            {value ? selectedLabel : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-40" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[220px]"
        align="start"
        sideOffset={4}
      >
        <div className="flex items-center border-b px-3 py-2 gap-2">
          <Check className="size-3.5 text-muted-foreground/50 shrink-0" />
          <input
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="max-h-60 overflow-y-auto py-1">
          {!hasResults ? (
            <p className="text-xs text-muted-foreground py-6 text-center">No results for "{search}"</p>
          ) : groups ? (
            filteredGroups?.map((g) => (
              <div key={g.group}>
                <p className="px-3 pt-2 pb-0.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                  {g.group}
                </p>
                {g.items.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => { onValueChange(item.value); setOpen(false); setSearch(""); }}
                    className={cn(
                      "w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground rounded-sm mx-1 transition-colors",
                      value === item.value && "bg-accent text-accent-foreground font-medium"
                    )}
                    style={{ width: "calc(100% - 8px)" }}
                  >
                    <Check className={cn("size-3 shrink-0 text-primary", value === item.value ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
              </div>
            ))
          ) : (
            filteredOptions?.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => { onValueChange(item.value); setOpen(false); setSearch(""); }}
                className={cn(
                  "w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground rounded-sm mx-1 transition-colors",
                  value === item.value && "bg-accent text-accent-foreground font-medium"
                )}
                style={{ width: "calc(100% - 8px)" }}
              >
                <Check className={cn("size-3 shrink-0 text-primary", value === item.value ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{item.label}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}


// ── Enrichment requester source labels ────────────────────────────────────────

const REQUESTER_SOURCES = [
  { value: "language",         label: "Language" },
  { value: "timezone",         label: "Timezone" },
  { value: "supportTier",      label: "Support Tier" },
  { value: "orgName",          label: "Organization Name" },
  { value: "jobTitle",         label: "Job Title" },
  { value: "isVip",            label: "Is VIP" },
  { value: "country",          label: "Country" },
  { value: "preferredChannel", label: "Preferred Channel" },
  { value: "orgIndustry",      label: "Org Industry" },
  { value: "orgCountry",       label: "Org Country" },
];

const ENRICHABLE_FIELDS = [
  { value: "priority",        label: "Priority" },
  { value: "category",        label: "Category" },
  { value: "affectedSystem",  label: "Affected System" },
  { value: "source",          label: "Source" },
  { value: "teamId",          label: "Team ID" },
  { value: "custom_department",  label: "Custom: Department" },
  { value: "custom_sla_tier",    label: "Custom: SLA Tier" },
  { value: "custom_business_unit", label: "Custom: Business Unit" },
  { value: "custom_location",    label: "Custom: Location" },
  { value: "custom_service",     label: "Custom: Service" },
];

const PRIORITY_OPTIONS = [
  { value: "low",      label: "Low" },
  { value: "medium",   label: "Medium" },
  { value: "high",     label: "High" },
  { value: "critical", label: "Critical" },
];

// ── Trigger selector row ──────────────────────────────────────────────────────

function TriggerRow({
  index,
  value,
  onChange,
  onRemove,
  canRemove,
  category: _category,
}: {
  index: number;
  value: { type: string };
  onChange: (val: { type: string; [k: string]: unknown }) => void;
  onRemove: () => void;
  canRemove: boolean;
  category: AutomationCategory;
}) {
  const isTimeTrigger = ["ticket.idle", "ticket.pending_since", "ticket.age"].includes(value.type);
  const isCronTrigger = value.type === "schedule.cron";

  return (
    <div className="flex items-start gap-2">
      <div className="flex-1 space-y-2">
        <SearchableSelect
          value={value.type}
          onValueChange={(type) => onChange({ type })}
          placeholder="Search and select a trigger…"
          groups={TRIGGER_GROUPS}
        />

        {/* Time parameter for time-based triggers */}
        {isTimeTrigger && (
          <div className="flex items-center gap-2 pl-1">
            <span className="text-xs text-muted-foreground">After</span>
            <Input
              type="number"
              min={1}
              className="w-24 h-8 text-sm"
              placeholder="N"
              value={(value as any).hours ?? ""}
              onChange={(e) => onChange({ ...value, hours: Number(e.target.value) })}
            />
            <span className="text-xs text-muted-foreground">hours of inactivity</span>
          </div>
        )}

        {/* Cron expression for schedule triggers */}
        {isCronTrigger && (
          <div className="flex items-center gap-2 pl-1">
            <Input
              className="flex-1 h-8 text-sm font-mono"
              placeholder="Cron expression (e.g. 0 9 * * 1-5)"
              value={(value as any).cron ?? ""}
              onChange={(e) => onChange({ ...value, cron: e.target.value })}
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">UTC</span>
          </div>
        )}
      </div>

      {canRemove && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 mt-0.5 text-muted-foreground hover:text-destructive"
          type="button"
          onClick={onRemove}
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

// ── Action row ────────────────────────────────────────────────────────────────

function ActionRow({
  index,
  value,
  onChange,
  onRemove,
  agents,
  teams,
  webhooks,
}: {
  index: number;
  value: { type: string; [k: string]: unknown };
  onChange: (val: { type: string; [k: string]: unknown }) => void;
  onRemove: () => void;
  agents: Array<{ id: string; name: string }>;
  teams: Array<{ id: number; name: string }>;
  webhooks: Array<{ id: number; name: string }>;
}) {
  const actionType = value.type as AutomationActionType;

  const isDestructive = DESTRUCTIVE_ACTION_TYPES.has(actionType);

  return (
    <div className={cn(
      "flex items-start gap-2 p-3 rounded-md border transition-colors",
      isDestructive ? "bg-amber-50/50 border-amber-200/60 dark:bg-amber-950/20 dark:border-amber-800/40" : "bg-muted/20",
    )}>
      <GripVertical className="size-4 text-muted-foreground mt-2.5 shrink-0 cursor-grab" />

      <div className="flex-1 space-y-2">
        {isDestructive && (
          <div className="flex items-center gap-1.5 text-[10px] text-amber-700 dark:text-amber-400 mb-1">
            <AlertTriangle className="size-3" />
            <span>Destructive action — verify conditions are precise</span>
          </div>
        )}
        <SearchableSelect
          value={actionType}
          onValueChange={(type) => onChange({ type })}
          placeholder="Search and select an action…"
          groups={ACTION_GROUPS}
        />

        {/* Action parameters */}
        {actionType === "set_priority" && (
          <Select
            value={(value as any).priority ?? ""}
            onValueChange={(priority) => onChange({ ...value, priority })}
          >
            <SelectTrigger><SelectValue placeholder="Select priority..." /></SelectTrigger>
            <SelectContent>
              {["low", "medium", "high", "critical"].map((p) => (
                <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {actionType === "set_category" && (
          <Select
            value={(value as any).category ?? ""}
            onValueChange={(category) => onChange({ ...value, category })}
          >
            <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
            <SelectContent>
              {["billing", "technical", "account", "general", "hardware", "software", "network", "security"].map((c) => (
                <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {actionType === "set_status" && (
          <Select
            value={(value as any).status ?? ""}
            onValueChange={(status) => onChange({ ...value, status })}
          >
            <SelectTrigger><SelectValue placeholder="Select status..." /></SelectTrigger>
            <SelectContent>
              {["open", "in_progress", "escalated", "resolved", "closed"].map((s) => (
                <SelectItem key={s} value={s}>{s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {(actionType === "assign_agent") && (
          <SearchableSelect
            value={(value as any).agentId ?? ""}
            onValueChange={(agentId) => {
              const agent = agents.find((a) => a.id === agentId);
              onChange({ ...value, agentId, agentName: agent?.name });
            }}
            placeholder="Search and select agent…"
            options={agents.map((a) => ({ value: a.id, label: a.name }))}
          />
        )}

        {(actionType === "assign_smart") && (
          <div className="space-y-2">
            <SearchableSelect
              value={String((value as any).teamId ?? "")}
              onValueChange={(teamId) => {
                const team = teams.find((t) => String(t.id) === teamId);
                onChange({ ...value, teamId: Number(teamId), teamName: team?.name, requiredSkills: (value as any).requiredSkills ?? [] });
              }}
              placeholder="Search and select team (uses routing policy)…"
              options={teams.map((t) => ({ value: String(t.id), label: t.name }))}
            />
            <p className="text-xs text-muted-foreground">
              Routes using the team's configured strategy (round-robin, least-loaded, skill-based, etc.) with capacity and shift filters applied.
            </p>
          </div>
        )}

        {(actionType === "assign_by_skill") && (
          <div className="space-y-2">
            <SearchableSelect
              value={String((value as any).teamId ?? "")}
              onValueChange={(teamId) => {
                const team = teams.find((t) => String(t.id) === teamId);
                onChange({ ...value, teamId: Number(teamId), teamName: team?.name });
              }}
              placeholder="Search and select team…"
              options={teams.map((t) => ({ value: String(t.id), label: t.name }))}
            />
            <input
              type="text"
              placeholder="Required skills (comma-separated, e.g. billing, enterprise)..."
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              value={((value as any).requiredSkills ?? []).join(", ")}
              onChange={(e) => onChange({
                ...value,
                requiredSkills: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean),
              })}
            />
          </div>
        )}

        {(actionType === "assign_team" || actionType === "assign_round_robin" || actionType === "assign_least_loaded") && (
          <SearchableSelect
            value={String((value as any).teamId ?? "")}
            onValueChange={(teamId) => {
              const team = teams.find((t) => String(t.id) === teamId);
              onChange({ ...value, teamId: Number(teamId), teamName: team?.name });
            }}
            placeholder="Search and select team…"
            options={teams.map((t) => ({ value: String(t.id), label: t.name }))}
          />
        )}

        {actionType === "add_note" && (
          <Textarea
            placeholder="Note body..."
            rows={2}
            value={(value as any).body ?? ""}
            onChange={(e) => onChange({ ...value, body: e.target.value })}
          />
        )}

        {actionType === "create_approval" && (
          <div className="space-y-2">
            <Input
              placeholder="Approval title (supports {{ticket.number}}, {{ticket.subject}})..."
              value={(value as any).title ?? ""}
              onChange={(e) => onChange({ ...value, title: e.target.value })}
            />
            <Textarea
              placeholder="Description (optional)..."
              rows={2}
              value={(value as any).description ?? ""}
              onChange={(e) => onChange({ ...value, description: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={(value as any).approvalMode ?? "all"}
                onValueChange={(approvalMode) => onChange({ ...value, approvalMode })}
              >
                <SelectTrigger><SelectValue placeholder="Approval mode..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All must approve (sequential)</SelectItem>
                  <SelectItem value="any">Any N approvers (parallel)</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={1}
                placeholder="Expires in N hours (optional)..."
                value={(value as any).expiresInHours ?? ""}
                onChange={(e) => onChange({ ...value, expiresInHours: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Approver IDs:</span> enter user IDs below (comma-separated)
            </div>
            <Input
              placeholder="Agent IDs (comma-separated)..."
              value={((value as any).approverIds ?? []).join(", ")}
              onChange={(e) => onChange({
                ...value,
                approverIds: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean),
              })}
            />
            <div className="flex flex-wrap gap-1 mt-1">
              {agents.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="text-xs px-2 py-0.5 rounded border hover:bg-muted"
                  onClick={() => {
                    const current: string[] = (value as any).approverIds ?? [];
                    const next = current.includes(a.id)
                      ? current.filter((id: string) => id !== a.id)
                      : [...current, a.id];
                    onChange({ ...value, approverIds: next });
                  }}
                >
                  {((value as any).approverIds ?? []).includes(a.id) ? "✓ " : ""}{a.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {actionType === "notify_approvers" && (
          <div className="space-y-2">
            <Input
              placeholder="Notification title (e.g. Reminder: Approval needed for {{ticket.number}})..."
              value={(value as any).title ?? ""}
              onChange={(e) => onChange({ ...value, title: e.target.value })}
            />
            <Textarea
              placeholder="Message body..."
              rows={2}
              value={(value as any).body ?? ""}
              onChange={(e) => onChange({ ...value, body: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Notifies all pending approvers on this ticket's open approval requests.
            </p>
          </div>
        )}

        {actionType === "send_notification" && (
          <div className="space-y-2">
            <Select
              value={(value as any).recipientType ?? "assignee"}
              onValueChange={(recipientType) => onChange({ ...value, recipientType })}
            >
              <SelectTrigger><SelectValue placeholder="Recipient..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="assignee">Assigned agent</SelectItem>
                <SelectItem value="team">Assigned team (all members)</SelectItem>
                <SelectItem value="requester">Requester (email only)</SelectItem>
                <SelectItem value="watchers">All watchers</SelectItem>
                <SelectItem value="approvers">Pending approvers</SelectItem>
                <SelectItem value="supervisor">All supervisors & admins</SelectItem>
                <SelectItem value="specific">Specific agent</SelectItem>
                <SelectItem value="specific_team">Specific team</SelectItem>
              </SelectContent>
            </Select>
            {(value as any).recipientType === "specific" && (
              <Select
                value={(value as any).recipientId ?? ""}
                onValueChange={(recipientId) => onChange({ ...value, recipientId })}
              >
                <SelectTrigger><SelectValue placeholder="Select agent..." /></SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {(value as any).recipientType === "specific_team" && (
              <Select
                value={String((value as any).recipientTeamId ?? "")}
                onValueChange={(teamId) => onChange({ ...value, recipientTeamId: Number(teamId) })}
              >
                <SelectTrigger><SelectValue placeholder="Select team..." /></SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Input
              placeholder="Title (supports {{ticket.number}}, {{ticket.subject}}, {{requester.name}})..."
              value={(value as any).title ?? ""}
              onChange={(e) => onChange({ ...value, title: e.target.value })}
            />
            <Textarea
              placeholder="Body (optional, same template variables supported)..."
              rows={2}
              value={(value as any).body ?? ""}
              onChange={(e) => onChange({ ...value, body: e.target.value })}
            />
            <div className="text-xs text-muted-foreground">
              Variables: <code>{"{{ticket.number}}"}</code> <code>{"{{ticket.subject}}"}</code> <code>{"{{ticket.status}}"}</code> <code>{"{{requester.name}}"}</code> <code>{"{{agent.name}}"}</code>
            </div>
          </div>
        )}

        {actionType === "send_reply" && (
          <div className="space-y-2">
            <Input
              placeholder="Subject (optional — defaults to Re: {{ticket.subject}})..."
              value={(value as any).subject ?? ""}
              onChange={(e) => onChange({ ...value, subject: e.target.value })}
            />
            <Textarea
              placeholder="Reply body (supports {{ticket.number}}, {{requester.name}}, etc.)..."
              rows={3}
              value={(value as any).body ?? ""}
              onChange={(e) => onChange({ ...value, body: e.target.value })}
            />
            <div className="text-xs text-muted-foreground">
              Sends email to the ticket requester. Variables: <code>{"{{ticket.number}}"}</code> <code>{"{{ticket.subject}}"}</code> <code>{"{{requester.name}}"}</code>
            </div>
          </div>
        )}

        {actionType === "escalate" && (
          <div className="space-y-2">
            <Input
              placeholder="Escalation reason (optional)..."
              value={(value as any).reason ?? ""}
              onChange={(e) => onChange({ ...value, reason: e.target.value })}
            />
            <Select
              value={String((value as any).teamId ?? "")}
              onValueChange={(teamId) => onChange({ ...value, teamId: teamId ? Number(teamId) : undefined })}
            >
              <SelectTrigger><SelectValue placeholder="Escalate to team (optional)..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">No specific team</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {actionType === "notify_watchers" && (
          <div className="space-y-2">
            <Input
              placeholder="Notification title..."
              value={(value as any).title ?? ""}
              onChange={(e) => onChange({ ...value, title: e.target.value })}
            />
            <Textarea
              placeholder="Notification body..."
              rows={2}
              value={(value as any).body ?? ""}
              onChange={(e) => onChange({ ...value, body: e.target.value })}
            />
          </div>
        )}

        {actionType === "notify_requester" && (
          <div className="space-y-2">
            <Input
              placeholder="Email subject (optional)..."
              value={(value as any).subject ?? ""}
              onChange={(e) => onChange({ ...value, subject: e.target.value })}
            />
            <Textarea
              placeholder="Message body (sent as email to the requester)..."
              rows={3}
              value={(value as any).body ?? ""}
              onChange={(e) => onChange({ ...value, body: e.target.value })}
            />
          </div>
        )}

        {actionType === "create_linked_task" && (
          <div className="space-y-2">
            <Input
              placeholder="Task title..."
              value={(value as any).title ?? ""}
              onChange={(e) => onChange({ ...value, title: e.target.value })}
            />
            <Textarea
              placeholder="Description (optional)..."
              rows={2}
              value={(value as any).description ?? ""}
              onChange={(e) => onChange({ ...value, description: e.target.value })}
            />
            <Input
              type="number"
              placeholder="Due in N hours (optional)..."
              min={1}
              value={(value as any).dueInHours ?? ""}
              onChange={(e) => onChange({ ...value, dueInHours: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>
        )}

        {actionType === "chain_workflow" && (
          <p className="text-xs text-muted-foreground italic">
            Enter the target rule ID to chain to. The chained rule will evaluate using the current entity state.
          </p>
        )}

        {actionType === "send_auto_reply" && (
          <div className="space-y-2">
            <Input
              placeholder="Subject (optional — defaults to Re: {ticket subject})..."
              value={(value as any).subject ?? ""}
              onChange={(e) => onChange({ ...value, subject: e.target.value })}
            />
            <Textarea
              placeholder="Reply body (plain text)..."
              rows={3}
              value={(value as any).body ?? ""}
              onChange={(e) => onChange({ ...value, body: e.target.value })}
            />
          </div>
        )}

        {actionType === "add_watcher" && (
          <SearchableSelect
            value={(value as any).watcherId ?? ""}
            onValueChange={(watcherId) => {
              const agent = agents.find((a) => a.id === watcherId);
              onChange({ ...value, watcherId, watcherName: agent?.name });
            }}
            placeholder="Search and select agent to watch…"
            options={agents.map((a) => ({ value: a.id, label: a.name }))}
          />
        )}

        {actionType === "quarantine" && (
          <Input
            placeholder="Reason (optional)..."
            value={(value as any).reason ?? ""}
            onChange={(e) => onChange({ ...value, reason: e.target.value })}
          />
        )}

        {(actionType === "suppress_creation" || actionType === "mark_spam") && (
          <p className="text-xs text-muted-foreground italic">
            {actionType === "suppress_creation"
              ? "The ticket will be soft-deleted immediately. No further processing occurs."
              : "The ticket will be flagged as spam and closed. Counts against spam metrics."}
          </p>
        )}

        {actionType === "trigger_webhook" && (
          webhooks.length === 0 ? (
            <p className="text-xs text-muted-foreground italic px-1">
              No outbound webhooks configured.{" "}
              <a href="/automations/webhooks" className="underline">Set one up first.</a>
            </p>
          ) : (
            <SearchableSelect
              value={String((value as any).webhookId ?? "")}
              onValueChange={(webhookId) => {
                const wh = webhooks.find((w) => String(w.id) === webhookId);
                onChange({ ...value, webhookId: Number(webhookId), webhookName: wh?.name });
              }}
              placeholder="Search and select webhook…"
              options={webhooks.map((w) => ({ value: String(w.id), label: w.name }))}
            />
          )
        )}

        {/* ── Data Enrichment & Field Automation ───────────────────────────── */}

        {actionType === "enrich_from_requester" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Map requester / org attributes into ticket fields. Each row reads a source attribute and writes it to a target field.
            </p>
            {((value as any).mappings ?? [{ source: "supportTier", targetField: "custom_sla_tier", onlyIfEmpty: true }]).map(
              (m: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <Select
                    value={m.source ?? ""}
                    onValueChange={(source) => {
                      const mappings = [...((value as any).mappings ?? [])];
                      mappings[i] = { ...m, source };
                      onChange({ ...value, mappings });
                    }}
                  >
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Source attribute..." /></SelectTrigger>
                    <SelectContent>
                      {REQUESTER_SOURCES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground shrink-0">→</span>
                  <input
                    className="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    placeholder="Target field (e.g. priority, custom_dept)..."
                    value={m.targetField ?? ""}
                    onChange={(e) => {
                      const mappings = [...((value as any).mappings ?? [])];
                      mappings[i] = { ...m, targetField: e.target.value };
                      onChange({ ...value, mappings });
                    }}
                  />
                  <label className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={m.onlyIfEmpty ?? true}
                      onChange={(e) => {
                        const mappings = [...((value as any).mappings ?? [])];
                        mappings[i] = { ...m, onlyIfEmpty: e.target.checked };
                        onChange({ ...value, mappings });
                      }}
                    />
                    Only if empty
                  </label>
                  <Button
                    variant="ghost" size="icon" className="size-7 shrink-0"
                    type="button"
                    onClick={() => {
                      const mappings = ((value as any).mappings ?? []).filter((_: any, idx: number) => idx !== i);
                      onChange({ ...value, mappings });
                    }}
                  ><Trash2 className="size-3" /></Button>
                </div>
              )
            )}
            <Button
              variant="outline" size="sm" type="button"
              onClick={() => onChange({ ...value, mappings: [...((value as any).mappings ?? []), { source: "language", targetField: "", onlyIfEmpty: true }] })}
            >
              <Plus className="size-3 mr-1" /> Add Mapping
            </Button>
          </div>
        )}

        {actionType === "enrich_from_domain" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Set ticket fields based on the sender's email domain. Use <code>*</code> as a wildcard / fallback.
            </p>
            {((value as any).mappings ?? [{ domain: "", field: "priority", value: "" }]).map(
              (m: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="w-36 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm font-mono"
                    placeholder="Domain (e.g. acme.com)"
                    value={m.domain ?? ""}
                    onChange={(e) => {
                      const mappings = [...((value as any).mappings ?? [])];
                      mappings[i] = { ...m, domain: e.target.value };
                      onChange({ ...value, mappings });
                    }}
                  />
                  <span className="text-xs text-muted-foreground shrink-0">→</span>
                  <input
                    className="w-32 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    placeholder="Field (e.g. priority)"
                    value={m.field ?? ""}
                    onChange={(e) => {
                      const mappings = [...((value as any).mappings ?? [])];
                      mappings[i] = { ...m, field: e.target.value };
                      onChange({ ...value, mappings });
                    }}
                  />
                  <span className="text-xs text-muted-foreground shrink-0">=</span>
                  <input
                    className="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    placeholder="Value (e.g. high)"
                    value={m.value ?? ""}
                    onChange={(e) => {
                      const mappings = [...((value as any).mappings ?? [])];
                      mappings[i] = { ...m, value: e.target.value };
                      onChange({ ...value, mappings });
                    }}
                  />
                  <Button
                    variant="ghost" size="icon" className="size-7 shrink-0"
                    type="button"
                    onClick={() => {
                      const mappings = ((value as any).mappings ?? []).filter((_: any, idx: number) => idx !== i);
                      onChange({ ...value, mappings });
                    }}
                  ><Trash2 className="size-3" /></Button>
                </div>
              )
            )}
            <div className="flex items-center gap-3">
              <Button
                variant="outline" size="sm" type="button"
                onClick={() => onChange({ ...value, mappings: [...((value as any).mappings ?? []), { domain: "", field: "", value: "" }] })}
              >
                <Plus className="size-3 mr-1" /> Add Domain Rule
              </Button>
              <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={(value as any).firstMatchOnly ?? true}
                  onChange={(e) => onChange({ ...value, firstMatchOnly: e.target.checked })}
                />
                Stop at first match
              </label>
            </div>
          </div>
        )}

        {actionType === "enrich_from_keywords" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Set ticket fields when keywords are found in the subject or body. Each row matches any of its keywords.
            </p>
            {((value as any).patterns ?? [{ keywords: [], matchIn: "both", caseSensitive: false, field: "", value: "" }]).map(
              (p: any, i: number) => (
                <div key={i} className="space-y-1.5 p-2 rounded border bg-muted/20">
                  <div className="flex items-center gap-2">
                    <input
                      className="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                      placeholder="Keywords (comma-separated, e.g. VPN, remote access, tunnel)..."
                      value={(p.keywords ?? []).join(", ")}
                      onChange={(e) => {
                        const patterns = [...((value as any).patterns ?? [])];
                        patterns[i] = { ...p, keywords: e.target.value.split(",").map((k: string) => k.trim()).filter(Boolean) };
                        onChange({ ...value, patterns });
                      }}
                    />
                    <Select
                      value={p.matchIn ?? "both"}
                      onValueChange={(matchIn) => {
                        const patterns = [...((value as any).patterns ?? [])];
                        patterns[i] = { ...p, matchIn };
                        onChange({ ...value, patterns });
                      }}
                    >
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="subject">Subject</SelectItem>
                        <SelectItem value="body">Body</SelectItem>
                        <SelectItem value="both">Both</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground shrink-0">→ set</span>
                    <input
                      className="w-32 h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
                      placeholder="Field..."
                      value={p.field ?? ""}
                      onChange={(e) => {
                        const patterns = [...((value as any).patterns ?? [])];
                        patterns[i] = { ...p, field: e.target.value };
                        onChange({ ...value, patterns });
                      }}
                    />
                    <span className="text-xs text-muted-foreground">=</span>
                    <input
                      className="flex-1 h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
                      placeholder="Value..."
                      value={p.value ?? ""}
                      onChange={(e) => {
                        const patterns = [...((value as any).patterns ?? [])];
                        patterns[i] = { ...p, value: e.target.value };
                        onChange({ ...value, patterns });
                      }}
                    />
                    <Button
                      variant="ghost" size="icon" className="size-7 shrink-0"
                      type="button"
                      onClick={() => {
                        const patterns = ((value as any).patterns ?? []).filter((_: any, idx: number) => idx !== i);
                        onChange({ ...value, patterns });
                      }}
                    ><Trash2 className="size-3" /></Button>
                  </div>
                </div>
              )
            )}
            <div className="flex items-center gap-3">
              <Button
                variant="outline" size="sm" type="button"
                onClick={() => onChange({ ...value, patterns: [...((value as any).patterns ?? []), { keywords: [], matchIn: "both", caseSensitive: false, field: "", value: "" }] })}
              >
                <Plus className="size-3 mr-1" /> Add Keyword Pattern
              </Button>
              <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={(value as any).firstMatchOnly ?? false}
                  onChange={(e) => onChange({ ...value, firstMatchOnly: e.target.checked })}
                />
                Stop at first match
              </label>
            </div>
          </div>
        )}

        {actionType === "enrich_from_mailbox" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Set ticket fields based on the inbound mailbox alias (e.g. <code>billing</code>, <code>support</code>, <code>hr</code>).
            </p>
            {((value as any).mappings ?? [{ alias: "", field: "", value: "" }]).map(
              (m: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="w-28 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm font-mono"
                    placeholder="Alias..."
                    value={m.alias ?? ""}
                    onChange={(e) => {
                      const mappings = [...((value as any).mappings ?? [])];
                      mappings[i] = { ...m, alias: e.target.value };
                      onChange({ ...value, mappings });
                    }}
                  />
                  <span className="text-xs text-muted-foreground shrink-0">→</span>
                  <input
                    className="w-32 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    placeholder="Field..."
                    value={m.field ?? ""}
                    onChange={(e) => {
                      const mappings = [...((value as any).mappings ?? [])];
                      mappings[i] = { ...m, field: e.target.value };
                      onChange({ ...value, mappings });
                    }}
                  />
                  <span className="text-xs text-muted-foreground">=</span>
                  <input
                    className="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    placeholder="Value..."
                    value={m.value ?? ""}
                    onChange={(e) => {
                      const mappings = [...((value as any).mappings ?? [])];
                      mappings[i] = { ...m, value: e.target.value };
                      onChange({ ...value, mappings });
                    }}
                  />
                  <Button
                    variant="ghost" size="icon" className="size-7 shrink-0"
                    type="button"
                    onClick={() => {
                      const mappings = ((value as any).mappings ?? []).filter((_: any, idx: number) => idx !== i);
                      onChange({ ...value, mappings });
                    }}
                  ><Trash2 className="size-3" /></Button>
                </div>
              )
            )}
            <Button
              variant="outline" size="sm" type="button"
              onClick={() => onChange({ ...value, mappings: [...((value as any).mappings ?? []), { alias: "", field: "", value: "" }] })}
            >
              <Plus className="size-3 mr-1" /> Add Mailbox Rule
            </Button>
          </div>
        )}

        {actionType === "set_custom_field" && (
          <div className="space-y-2">
            <Input
              placeholder="Custom field key (e.g. department, business_unit)..."
              value={(value as any).key ?? ""}
              onChange={(e) => onChange({ ...value, key: e.target.value })}
            />
            <Input
              placeholder="Value (supports {{template.vars}} when enabled below)..."
              value={(value as any).value ?? ""}
              onChange={(e) => onChange({ ...value, value: e.target.value })}
            />
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(value as any).onlyIfEmpty ?? false}
                  onChange={(e) => onChange({ ...value, onlyIfEmpty: e.target.checked })}
                />
                Only if field is empty
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(value as any).useTemplateVars ?? false}
                  onChange={(e) => onChange({ ...value, useTemplateVars: e.target.checked })}
                />
                Resolve template variables
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Future custom fields are automatically supported — add any key/value pair here.
            </p>
          </div>
        )}

        {actionType === "map_field" && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                placeholder="Source field (e.g. requester.supportTier)..."
                value={(value as any).sourceField ?? ""}
                onChange={(e) => onChange({ ...value, sourceField: e.target.value })}
              />
              <input
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                placeholder="Target field (e.g. priority, custom_tier)..."
                value={(value as any).targetField ?? ""}
                onChange={(e) => onChange({ ...value, targetField: e.target.value })}
              />
            </div>
            <p className="text-xs text-muted-foreground">Lookup table: source value → target value</p>
            {((value as any).mappings ?? [{ from: "", to: "" }]).map((m: any, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="flex-1 h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
                  placeholder="From value..."
                  value={m.from ?? ""}
                  onChange={(e) => {
                    const mappings = [...((value as any).mappings ?? [])];
                    mappings[i] = { ...m, from: e.target.value };
                    onChange({ ...value, mappings });
                  }}
                />
                <span className="text-xs text-muted-foreground">→</span>
                <input
                  className="flex-1 h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
                  placeholder="To value..."
                  value={m.to ?? ""}
                  onChange={(e) => {
                    const mappings = [...((value as any).mappings ?? [])];
                    mappings[i] = { ...m, to: e.target.value };
                    onChange({ ...value, mappings });
                  }}
                />
                <Button variant="ghost" size="icon" className="size-7 shrink-0" type="button"
                  onClick={() => {
                    const mappings = ((value as any).mappings ?? []).filter((_: any, idx: number) => idx !== i);
                    onChange({ ...value, mappings });
                  }}><Trash2 className="size-3" /></Button>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" type="button"
                onClick={() => onChange({ ...value, mappings: [...((value as any).mappings ?? []), { from: "", to: "" }] })}
              ><Plus className="size-3 mr-1" /> Add Row</Button>
              <input
                className="flex-1 h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
                placeholder="Fallback value when no match (optional)..."
                value={(value as any).fallback ?? ""}
                onChange={(e) => onChange({ ...value, fallback: e.target.value || undefined })}
              />
            </div>
          </div>
        )}

        {actionType === "infer_priority" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Calculates priority from the ticket's <strong>impact</strong> × <strong>urgency</strong> combination.
              Only fires when both impact and urgency are set.
            </p>
            <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 text-xs">
              {[
                ["high_high","High × High"],["high_medium","High × Med"],["high_low","High × Low"],
                ["medium_high","Med × High"],["medium_medium","Med × Med"],["medium_low","Med × Low"],
                ["low_high","Low × High"],["low_medium","Low × Med"],["low_low","Low × Low"],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center gap-1">
                  <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
                  <Select
                    value={(value as any).matrix?.[key] ?? "medium"}
                    onValueChange={(v) => onChange({ ...value, matrix: { ...((value as any).matrix ?? {}), [key]: v } })}
                  >
                    <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={(value as any).onlyIfEmpty ?? true}
                onChange={(e) => onChange({ ...value, onlyIfEmpty: e.target.checked })}
              />
              Only infer if priority is not yet set
            </label>
          </div>
        )}

        {actionType === "copy_field" && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                placeholder="Source field (e.g. requester.language)..."
                value={(value as any).sourceField ?? ""}
                onChange={(e) => onChange({ ...value, sourceField: e.target.value })}
              />
              <input
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                placeholder="Target field (e.g. custom_locale)..."
                value={(value as any).targetField ?? ""}
                onChange={(e) => onChange({ ...value, targetField: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-3">
              <Select
                value={(value as any).transform ?? "none"}
                onValueChange={(transform) => onChange({ ...value, transform })}
              >
                <SelectTrigger className="flex-1"><SelectValue placeholder="Transform..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No transform</SelectItem>
                  <SelectItem value="uppercase">UPPERCASE</SelectItem>
                  <SelectItem value="lowercase">lowercase</SelectItem>
                  <SelectItem value="trim">Trim whitespace</SelectItem>
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={(value as any).onlyIfEmpty ?? false}
                  onChange={(e) => onChange({ ...value, onlyIfEmpty: e.target.checked })}
                />
                Only if target is empty
              </label>
            </div>
          </div>
        )}

        {/* ── Record Lifecycle Actions ──────────────────────────────────────── */}

        {actionType === "close_stale" && (
          <div className="space-y-2">
            <Textarea
              placeholder="Reason for closing (shown in auto-note, e.g. 'No response received in 14 days.')..."
              rows={2}
              value={(value as any).reason ?? ""}
              onChange={(e) => onChange({ ...value, reason: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Only closes tickets in these statuses: open, in_progress, escalated.
              Resolved and closed tickets are skipped automatically.
            </p>
            <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={(value as any).addNote ?? true}
                onChange={(e) => onChange({ ...value, addNote: e.target.checked })}
              />
              Add internal note explaining the closure
            </label>
          </div>
        )}

        {(actionType === "create_linked_problem" || actionType === "create_linked_change" || actionType === "create_linked_request") && (
          <div className="space-y-2">
            <Input
              placeholder={
                actionType === "create_linked_problem" ? "Problem title (supports {{ticket.subject}})..." :
                actionType === "create_linked_change"  ? "Change request title (supports {{ticket.subject}})..." :
                "Service request title..."
              }
              value={(value as any).title ?? ""}
              onChange={(e) => onChange({ ...value, title: e.target.value })}
            />
            <Textarea
              placeholder="Description (optional, template variables supported)..."
              rows={2}
              value={(value as any).description ?? ""}
              onChange={(e) => onChange({ ...value, description: e.target.value })}
            />
            <div className="flex items-center gap-3">
              {actionType === "create_linked_change" && (
                <Select
                  value={(value as any).changeType ?? "normal"}
                  onValueChange={(changeType) => onChange({ ...value, changeType })}
                >
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Change type..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Select
                value={(value as any).priority ?? "medium"}
                onValueChange={(priority) => onChange({ ...value, priority })}
              >
                <SelectTrigger className="flex-1"><SelectValue placeholder="Priority..." /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={(value as any).skipIfLinked ?? true}
                onChange={(e) => onChange({ ...value, skipIfLinked: e.target.checked })}
              />
              Skip if already linked (prevent duplicates)
            </label>
          </div>
        )}

        {actionType === "create_child_ticket" && (
          <div className="space-y-2">
            <Input
              placeholder="Subject (supports {{ticket.subject}}, {{ticket.number}})..."
              value={(value as any).subject ?? ""}
              onChange={(e) => onChange({ ...value, subject: e.target.value })}
            />
            <Textarea
              placeholder="Body / description..."
              rows={2}
              value={(value as any).body ?? ""}
              onChange={(e) => onChange({ ...value, body: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={(value as any).priority ?? ""}
                onValueChange={(priority) => onChange({ ...value, priority: priority || undefined })}
              >
                <SelectTrigger><SelectValue placeholder="Priority (inherit from parent)..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Inherit from parent</SelectItem>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String((value as any).teamId ?? "")}
                onValueChange={(teamId) => onChange({ ...value, teamId: teamId ? Number(teamId) : undefined })}
              >
                <SelectTrigger><SelectValue placeholder="Assign to team (optional)..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No team</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {actionType === "create_follow_up" && (
          <div className="space-y-2">
            <Input
              placeholder="Follow-up title (e.g. Post-incident review for {{ticket.number}})..."
              value={(value as any).title ?? ""}
              onChange={(e) => onChange({ ...value, title: e.target.value })}
            />
            <Textarea
              placeholder="Follow-up description / checklist..."
              rows={3}
              value={(value as any).body ?? ""}
              onChange={(e) => onChange({ ...value, body: e.target.value })}
            />
            <Input
              type="number"
              placeholder="Due in N hours (optional)..."
              min={1}
              value={(value as any).dueInHours ?? ""}
              onChange={(e) => onChange({ ...value, dueInHours: e.target.value ? Number(e.target.value) : undefined })}
            />
            <p className="text-xs text-muted-foreground">
              Created as a pinned internal note. Ideal for post-incident, post-change, and post-problem review items.
            </p>
          </div>
        )}

        {actionType === "link_to_problem" && (
          <div className="space-y-2">
            <Input
              type="number"
              placeholder="Problem ID (numeric ID from the problem list)..."
              min={1}
              value={(value as any).problemId ?? ""}
              onChange={(e) => onChange({ ...value, problemId: e.target.value ? Number(e.target.value) : undefined })}
            />
            <Input
              placeholder="Problem label (optional, for display in the rule)..."
              value={(value as any).problemLabel ?? ""}
              onChange={(e) => onChange({ ...value, problemLabel: e.target.value || undefined })}
            />
            <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={(value as any).skipIfLinked ?? true}
                onChange={(e) => onChange({ ...value, skipIfLinked: e.target.checked })}
              />
              Skip if ticket is already linked to this problem
            </label>
          </div>
        )}

        {actionType === "update_linked_records" && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 text-xs">
              {["incident","problem","change","request"].map((rt) => (
                <label key={rt} className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={((value as any).recordTypes ?? []).includes(rt)}
                    onChange={(e) => {
                      const current: string[] = (value as any).recordTypes ?? [];
                      const next = e.target.checked ? [...current, rt] : current.filter((r) => r !== rt);
                      onChange({ ...value, recordTypes: next });
                    }}
                  />
                  {rt.charAt(0).toUpperCase() + rt.slice(1)}
                </label>
              ))}
            </div>
            <Select
              value={(value as any).action ?? "add_note"}
              onValueChange={(a) => onChange({ ...value, action: a })}
            >
              <SelectTrigger><SelectValue placeholder="Action to perform..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="add_note">Add Note</SelectItem>
                <SelectItem value="set_status">Set Status</SelectItem>
                <SelectItem value="set_priority">Set Priority</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Value (note body, status, or priority)..."
              value={(value as any).value ?? ""}
              onChange={(e) => onChange({ ...value, value: e.target.value })}
            />
          </div>
        )}

        {actionType === "merge_into_ticket" && (
          <div className="space-y-2">
            <Input
              type="number"
              placeholder="Target ticket ID to merge into..."
              min={1}
              value={(value as any).targetTicketId ?? ""}
              onChange={(e) => onChange({ ...value, targetTicketId: e.target.value ? Number(e.target.value) : undefined })}
            />
            <Input
              placeholder="Merge reason (optional, shown in audit note)..."
              value={(value as any).reason ?? ""}
              onChange={(e) => onChange({ ...value, reason: e.target.value || undefined })}
            />
            <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={(value as any).notifyRequester ?? true}
                onChange={(e) => onChange({ ...value, notifyRequester: e.target.checked })}
              />
              Notify requester by email about the merge
            </label>
            <p className="text-xs text-muted-foreground">
              Guardrails: Will not merge into an already-closed ticket, an already-merged ticket, or itself.
            </p>
          </div>
        )}
      </div>

      <Button variant="ghost" size="icon" className="size-8 shrink-0 mt-1" onClick={onRemove}>
        <Trash2 className="size-3.5 text-muted-foreground" />
      </Button>
    </div>
  );
}

// ── Top navigation bar ────────────────────────────────────────────────────────

function FormTopBar({
  category,
  isEdit,
  ruleName,
  ruleVer,
  isEnabled,
  ruleId,
  onTest,
  onClone,
  clonePending,
}: {
  category: AutomationCategory;
  isEdit: boolean;
  ruleName: string;
  ruleVer?: number;
  isEnabled?: boolean;
  ruleId?: number;
  onTest?: () => void;
  onClone?: () => void;
  clonePending?: boolean;
}) {
  const navigate = useNavigate();
  const catMeta = AUTOMATION_CATEGORIES[category];

  return (
    <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur-sm">
      <div className="flex items-center justify-between h-12 px-6 gap-4">

        {/* Left: breadcrumb */}
        <div className="flex items-center gap-1.5 text-sm min-w-0 flex-1">
          <button
            type="button"
            onClick={() => navigate("/automations")}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <Zap className="size-3.5" />
            <span className="hidden sm:inline">Automation Platform</span>
          </button>
          <ChevronRight className="size-3.5 text-muted-foreground/40 shrink-0" />
          <button
            type="button"
            onClick={() => navigate(`/automations?section=${category}`)}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <span className="text-muted-foreground/70">{CAT_ICONS[category]}</span>
            <span className="hidden md:inline">{catMeta?.label}</span>
          </button>
          <ChevronRight className="size-3.5 text-muted-foreground/40 shrink-0" />
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-foreground truncate">
              {isEdit ? (ruleName || "Edit Rule") : "New Rule"}
            </span>
            {ruleVer && (
              <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded border text-muted-foreground shrink-0">
                v{ruleVer}
              </span>
            )}
            {isEdit && isEnabled === true && (
              <Badge className="text-[10px] h-4 px-1.5 shrink-0 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300/50 dark:border-emerald-700/50 hover:bg-emerald-500/15">
                Active
              </Badge>
            )}
            {isEdit && isEnabled === false && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">
                Disabled
              </Badge>
            )}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 shrink-0">
          {isEdit && ruleId && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={onTest}>
                <FlaskConical className="size-3.5 mr-1.5" />
                Test Run
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onClone} disabled={clonePending}>
                <Copy className="size-3.5 mr-1.5" />
                Clone
              </Button>
            </>
          )}
          <Button type="submit" size="sm" form="rule-form">
            <Save className="size-3.5 mr-1.5" />
            {isEdit ? "Save changes" : "Create rule"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Destructive action detector ─────────────────────────────────────────────

const DESTRUCTIVE_ACTION_TYPES = new Set([
  "suppress_creation", "mark_spam", "quarantine",
  "close_stale", "merge_into_ticket", "resolve", "close",
]);

const DESTRUCTIVE_LABELS: Record<string, string> = {
  suppress_creation:  "Suppress / Discard Ticket — permanently deletes the ticket",
  mark_spam:          "Mark as Spam — closes the ticket and flags it as spam",
  quarantine:         "Quarantine — holds the ticket back from normal queues",
  close_stale:        "Close Stale Record — automatically closes open tickets",
  merge_into_ticket:  "Merge Into Ticket — closes this ticket and merges it into another",
  resolve:            "Resolve Ticket — auto-resolves the ticket",
  close:              "Close Ticket — auto-closes the ticket",
};

function DestructiveWarnings({ actions }: { actions: Array<{ type: string }> }) {
  const found = actions.filter((a) => DESTRUCTIVE_ACTION_TYPES.has(a.type));
  if (found.length === 0) return null;

  return (
    <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/30 p-3">
      <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">
          This rule contains {found.length} destructive action{found.length !== 1 ? "s" : ""}
        </p>
        <ul className="space-y-0.5">
          {found.map((a, i) => (
            <li key={i} className="text-xs text-amber-700 dark:text-amber-400">
              • {DESTRUCTIVE_LABELS[a.type] ?? a.type}
            </li>
          ))}
        </ul>
        <p className="text-[10px] text-amber-600/80 dark:text-amber-500/80 mt-1.5">
          Ensure conditions are precise before enabling. Test with a dry-run first.
        </p>
      </div>
    </div>
  );
}

// ── Rule summary generator ───────────────────────────────────────────────────

function generateRuleSummary(
  triggers: Array<{ type: string }>,
  actions: Array<{ type: string }>,
  conditions: any,
): string {
  if (triggers.length === 0 || actions.length === 0) return "";

  const triggerNames = triggers.map((t) =>
    AUTOMATION_TRIGGER_LABELS[t.type as keyof typeof AUTOMATION_TRIGGER_LABELS] ?? t.type
  );
  const actionNames = actions.map((a) =>
    AUTOMATION_ACTION_LABELS[a.type as keyof typeof AUTOMATION_ACTION_LABELS] ?? a.type
  );

  const hasConditions =
    conditions?.type === "group"
      ? (conditions.conditions?.length ?? 0) > 0
      : !!conditions;

  const triggerStr = triggerNames.length === 1
    ? triggerNames[0]
    : `${triggerNames[0]} (+${triggerNames.length - 1} more)`;

  const actionStr = actionNames.length === 1
    ? actionNames[0]
    : `${actionNames[0]} (+${actionNames.length - 1} more)`;

  return `When ${triggerStr} — ${hasConditions ? "if conditions match → " : ""}${actionStr}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

// ── Test Run dialog ───────────────────────────────────────────────────────────

function TestRunDialog({ ruleId, onClose }: { ruleId: number; onClose: () => void }) {
  const [entityId, setEntityId] = useState("");
  const [result, setResult] = useState<unknown>(null);

  const testMutation = useMutation({
    mutationFn: async () => {
      const id = parseInt(entityId, 10);
      if (!id) throw new Error("Enter a valid numeric ticket/entity ID");
      const { data } = await axios.post(`/api/automations/${ruleId}/test`, { entityId: id });
      return data;
    },
    onSuccess: (data) => setResult(data),
    onError: (e: any) => toast.error(e?.response?.data?.error ?? e.message ?? "Test failed"),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Test Rule</DialogTitle>
          <DialogDescription>
            Dry-run this rule against a specific entity to preview which conditions match
            and what actions would fire. The run IS recorded in execution history.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Entity ID (e.g. ticket #42 → enter 42)..."
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && testMutation.mutate()}
              type="number"
              min={1}
              className="flex-1"
            />
            <Button onClick={() => testMutation.mutate()} disabled={testMutation.isPending || !entityId}>
              {testMutation.isPending ? "Running..." : "Run Test"}
            </Button>
          </div>
          {result && (
            <div className="rounded-md border bg-muted/20 p-3 space-y-2 max-h-72 overflow-y-auto">
              <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AutomationRuleFormPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = Boolean(id && id !== "new");
  const [showTestDialog, setShowTestDialog] = useState(false);

  const defaultCategory = (searchParams.get("category") ?? "event_workflow") as AutomationCategory;

  const { data: ruleData, isLoading: ruleLoading } = useQuery({
    queryKey: ["automation-rule", id],
    queryFn: async () => {
      const { data } = await axios.get<{ rule: FormValues & { id: number } }>(`/api/automations/${id}`);
      return data;
    },
    enabled: isEdit,
  });

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data } = await axios.get<{ users: Array<{ id: string; name: string }> }>("/api/users");
      return data;
    },
  });

  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data } = await axios.get<{ teams: Array<{ id: number; name: string }> }>("/api/teams");
      return data;
    },
  });

  const { data: webhooksData } = useQuery({
    queryKey: ["outbound-webhooks"],
    queryFn: async () => {
      const { data } = await axios.get<{ webhooks: Array<{ id: number; name: string }> }>("/api/webhooks/outbound");
      return data;
    },
  });

  const {
    register, control, handleSubmit, watch, setValue, reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(createAutomationRuleSchema),
    defaultValues: {
      name: "",
      description: "",
      category: defaultCategory,
      isEnabled: true,
      triggers: [{ type: CATEGORY_DEFAULT_TRIGGERS[defaultCategory][0] }],
      conditions: { type: "group", operator: "AND", conditions: [] },
      actions: [{ type: "set_priority", priority: "medium" }],
      runOnce: false,
      stopOnMatch: true,
    },
  });

  const { fields: triggerFields, append: appendTrigger, remove: removeTrigger } = useFieldArray({
    control,
    name: "triggers" as any,
  });

  const { fields: actionFields, append: appendAction, remove: removeAction } = useFieldArray({
    control,
    name: "actions" as any,
  });

  // Populate form when editing
  useEffect(() => {
    if (ruleData?.rule) {
      reset({
        name:        ruleData.rule.name,
        description: ruleData.rule.description ?? "",
        category:    ruleData.rule.category,
        isEnabled:   ruleData.rule.isEnabled,
        triggers:    ruleData.rule.triggers as any,
        conditions:  ruleData.rule.conditions as any,
        actions:     ruleData.rule.actions as any,
        runOnce:     ruleData.rule.runOnce,
        stopOnMatch: ruleData.rule.stopOnMatch,
      });
    }
  }, [ruleData, reset]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (isEdit) {
        await axios.patch(`/api/automations/${id}`, values);
      } else {
        await axios.post("/api/automations", values);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
      toast.success(isEdit ? "Rule updated" : "Rule created");
      navigate("/automations");
    },
    onError: () => toast.error(isEdit ? "Failed to update rule" : "Failed to create rule"),
  });

  const cloneMutation = useMutation({
    mutationFn: async () => {
      if (!ruleData?.rule) return;
      const r = ruleData.rule;
      await axios.post("/api/automations", {
        name:        `Copy of ${r.name}`,
        description: r.description,
        category:    r.category,
        isEnabled:   false,
        triggers:    r.triggers,
        conditions:  r.conditions,
        actions:     r.actions,
        runOnce:     r.runOnce,
        stopOnMatch: r.stopOnMatch,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
      toast.success("Rule cloned — find it disabled in the same category");
    },
    onError: () => toast.error("Failed to clone rule"),
  });

  const category = watch("category");
  const agents = agentsData?.users ?? [];
  const teams  = teamsData?.teams ?? [];
  const webhooks = webhooksData?.webhooks ?? [];

  if (isEdit && ruleLoading) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mb-6" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded" />)}
        </div>
      </div>
    );
  }

  const ruleId    = isEdit && id ? parseInt(id, 10) : undefined;
  const ruleVer   = (ruleData?.rule as any)?.version;
  const ruleUpdBy = (ruleData?.rule as any)?.updatedBy?.name ?? (ruleData?.rule as any)?.createdBy?.name;
  const ruleUpdAt = (ruleData?.rule as any)?.updatedAt;

  const watchedActions  = watch("actions") as Array<{ type: string }>;
  const watchedTriggers = watch("triggers") as Array<{ type: string }>;
  const watchedConds    = watch("conditions");
  const ruleSummary = generateRuleSummary(watchedTriggers ?? [], watchedActions ?? [], watchedConds);

  return (
    <TooltipProvider>
    <div className="flex flex-col min-h-screen bg-muted/10">
      {/* Test Run Dialog */}
      {showTestDialog && ruleId && (
        <TestRunDialog ruleId={ruleId} onClose={() => setShowTestDialog(false)} />
      )}

      {/* Sticky top nav bar */}
      <FormTopBar
        category={category}
        isEdit={isEdit}
        ruleName={watch("name") || ""}
        ruleVer={ruleVer}
        isEnabled={(ruleData?.rule as any)?.isEnabled}
        ruleId={ruleId}
        onTest={() => setShowTestDialog(true)}
        onClone={() => cloneMutation.mutate()}
        clonePending={cloneMutation.isPending}
      />

      {/* Page content */}
      <div className="max-w-3xl mx-auto w-full px-6 py-8 space-y-6">

        {/* Rule summary banner */}
        {(ruleSummary || ruleUpdBy) && (
          <div className="flex items-start gap-3 rounded-lg border bg-background px-4 py-3">
            <Sparkles className="size-4 text-primary/60 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              {ruleSummary && (
                <p className="text-sm text-muted-foreground italic">{ruleSummary}</p>
              )}
              {ruleUpdBy && ruleUpdAt && (
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                  Last modified by {ruleUpdBy} · {new Date(ruleUpdAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Destructive action warnings */}
        <DestructiveWarnings actions={watchedActions ?? []} />

      <form id="rule-form" onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-6">
        {/* Basic info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rule Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name <span className="text-destructive">*</span></Label>
              <Input id="name" placeholder="e.g. Route VIP tickets to enterprise team" {...register("name")} />
              {errors.name && <ErrorMessage message={errors.name.message} />}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" rows={2} placeholder="What does this rule do?" {...register("description")} />
            </div>

            <div className="space-y-1.5">
              <Label>Category</Label>
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {AUTOMATION_CATEGORIES[cat].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="flex items-center gap-3">
              <Controller
                control={control}
                name="isEnabled"
                render={({ field }) => (
                  <Switch
                    id="isEnabled"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <Label htmlFor="isEnabled">Enable this rule immediately</Label>
            </div>
          </CardContent>
        </Card>

        {/* Triggers */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Triggers</CardTitle>
                <CardDescription>Events that activate this rule.</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendTrigger({ type: "ticket.created" } as any)}
              >
                <Plus className="size-3.5 mr-1" />
                Add trigger
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {triggerFields.map((field, idx) => (
              <Controller
                key={field.id}
                control={control}
                name={`triggers.${idx}` as any}
                render={({ field: f }) => (
                  <TriggerRow
                    index={idx}
                    value={f.value}
                    onChange={f.onChange}
                    onRemove={() => removeTrigger(idx)}
                    canRemove={triggerFields.length > 1}
                    category={category}
                  />
                )}
              />
            ))}
            {errors.triggers && (
              <ErrorMessage message="At least one trigger is required." />
            )}
          </CardContent>
        </Card>

        {/* Conditions */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Conditions</CardTitle>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="size-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-64">
                  Leave empty to match every event from the selected trigger. Add conditions to
                  narrow which records this rule applies to. Supports email metadata, requester
                  data, ticket fields, and custom fields.
                </TooltipContent>
              </Tooltip>
            </div>
            <CardDescription>
              Optional filters — supports AND/OR groups, email metadata, requester data, and all ticket fields.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Controller
              control={control}
              name="conditions"
              render={({ field }) => {
                const group: AutomationConditionGroup =
                  field.value && (field.value as any).type === "group"
                    ? (field.value as AutomationConditionGroup)
                    : { type: "group", operator: "AND", conditions: [] };
                return (
                  <ConditionBuilder
                    value={group}
                    onChange={(g) => field.onChange(g)}
                  />
                );
              }}
            />
          </CardContent>
        </Card>

        {/* Actions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Actions</CardTitle>
                <CardDescription>Applied in order when conditions are met.</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendAction({ type: "add_note", body: "" } as any)}
              >
                <Plus className="size-3.5 mr-1" />
                Add action
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {actionFields.map((field, idx) => (
              <Controller
                key={field.id}
                control={control}
                name={`actions.${idx}` as any}
                render={({ field: f }) => (
                  <ActionRow
                    index={idx}
                    value={f.value}
                    onChange={f.onChange}
                    onRemove={() => removeAction(idx)}
                    agents={agents}
                    teams={teams}
                    webhooks={webhooks}
                  />
                )}
              />
            ))}
            {errors.actions && (
              <ErrorMessage message="At least one action is required." />
            )}
          </CardContent>
        </Card>

        {/* Advanced options */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Advanced Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Controller
                control={control}
                name="stopOnMatch"
                render={({ field }) => (
                  <Switch id="stopOnMatch" checked={field.value} onCheckedChange={field.onChange} />
                )}
              />
              <div>
                <Label htmlFor="stopOnMatch">Stop processing on match</Label>
                <p className="text-xs text-muted-foreground">
                  Do not evaluate subsequent rules in this category when this rule fires.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Controller
                control={control}
                name="runOnce"
                render={({ field }) => (
                  <Switch id="runOnce" checked={field.value} onCheckedChange={field.onChange} />
                )}
              />
              <div>
                <Label htmlFor="runOnce">Run at most once per record</Label>
                <p className="text-xs text-muted-foreground">
                  Prevents the rule from firing more than once on the same ticket/incident/etc.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {mutation.error && (
          <ErrorAlert error={mutation.error} fallback="Failed to save rule" />
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-2 pb-2">
          <Button type="button" variant="ghost" onClick={() => navigate("/automations")}>
            <ArrowLeft className="size-3.5 mr-1.5" />
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending || (!isDirty && isEdit)}>
            {mutation.isPending ? (
              <span className="flex items-center gap-2">
                <span className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Saving…
              </span>
            ) : (
              <>
                <Save className="size-3.5 mr-1.5" />
                {isEdit ? "Save changes" : "Create rule"}
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Execution history — only when editing */}
      {isEdit && ruleId && (
        <Card className="mb-8">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <History className="size-4 text-muted-foreground" />
              <CardTitle className="text-base">Execution History</CardTitle>
            </div>
            <CardDescription>All evaluations of this rule, most recent first.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ExecutionLogPanel ruleId={ruleId} />
          </CardContent>
        </Card>
      )}
      </div>{/* /max-w-3xl content */}
    </div>{/* /page wrapper */}
    </TooltipProvider>
  );
}
