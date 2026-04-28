/**
 * TicketsFilterSidebar
 *
 * Right-rail companion to the tickets list. Two purposes:
 *   1. **Visualize** — show every filter currently applied to the active view
 *      as colored, removable chips grouped by category.
 *   2. **Refine** — let the user toggle quick filters (escalated / breached /
 *      unassigned / mine) and pick multi-value filters (priority, severity,
 *      category, source) without leaving the table.
 *
 * Designed to feel like a tool palette: sticky on scroll, gradient header,
 * subtle dividers between sections, hover lift on chips.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  Filter, X, ChevronRight, Sparkles, Zap, AlertTriangle, Clock,
  UserX, UserCheck, ShieldAlert, RotateCcw, Check, Tag, Flag,
  Activity, Mail, Globe, Headphones, Users, Settings2,
  Layers, Briefcase,
} from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { ticketPriorities, priorityLabel } from "core/constants/ticket-priority.ts";
import { ticketSeverities, severityShortLabel } from "core/constants/ticket-severity.ts";
import { agentTicketStatuses, statusLabel } from "core/constants/ticket-status.ts";
import { ticketTypes, ticketTypeLabel } from "core/constants/ticket-type.ts";
import { categoryLabel } from "core/constants/ticket-category.ts";
import type { TicketPriority } from "core/constants/ticket-priority.ts";
import type { TicketSeverity } from "core/constants/ticket-severity.ts";
import type { TicketStatus } from "core/constants/ticket-status.ts";
import type { TicketType } from "core/constants/ticket-type.ts";
import type { TicketCategory } from "core/constants/ticket-category.ts";
import type { TicketFilters } from "../pages/TicketsPage";

// ── Types ────────────────────────────────────────────────────────────────────

interface Team { id: number; name: string; color: string }
interface UserOpt { id: string; name: string; email: string }
interface CustomStatusConfig     { id: number; label: string; color: string; isActive: boolean }
interface CustomTicketTypeConfig { id: number; name: string; isActive: boolean }

interface Props {
  filters:      TicketFilters;
  onChange:     (next: TicketFilters) => void;
  onClear:      () => void;
  onSaveAsView?: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function toggleInArray<T>(arr: T[], value: T): T[] | undefined {
  const next = arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
  return next.length === 0 ? undefined : next;
}

function singleOrArray<T>(arr: T[] | undefined): T | T[] | undefined {
  if (!arr || arr.length === 0) return undefined;
  return arr.length === 1 ? arr[0] : arr;
}

// Color tokens per priority/severity — keep here so the sidebar stays self-contained
const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low:    "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30",
  medium: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
  high:   "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  urgent: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",
};

const SEVERITY_COLORS: Record<TicketSeverity, string> = {
  sev4: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30",
  sev3: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
  sev2: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30",
  sev1: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",
};

const SOURCE_META: Record<"email" | "portal" | "agent", { label: string; icon: React.ElementType; color: string }> = {
  email:  { label: "Email",  icon: Mail,       color: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30"           },
  portal: { label: "Portal", icon: Globe,      color: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30" },
  agent:  { label: "Agent",  icon: Headphones, color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
};

// ── Active filter pill ───────────────────────────────────────────────────────

function ActivePill({
  icon: Icon, label, value, onRemove, tone = "neutral",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  onRemove: () => void;
  tone?: "neutral" | "primary" | "warning" | "danger" | "success";
}) {
  const toneClasses: Record<typeof tone, string> = {
    neutral: "bg-muted/60 border-border/50 text-foreground/90",
    primary: "bg-primary/10 border-primary/30 text-primary",
    warning: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400",
    danger:  "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400",
    success: "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
  };
  return (
    <div className={[
      "group/pill flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-all",
      "hover:shadow-sm hover:-translate-y-px",
      toneClasses[tone],
    ].join(" ")}>
      <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-80" />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider opacity-60 leading-tight">{label}</div>
        <div className="font-medium leading-snug break-words">{value}</div>
      </div>
      <button
        type="button"
        aria-label={`Remove ${label} filter`}
        onClick={onRemove}
        className="shrink-0 rounded-md p-0.5 opacity-50 hover:opacity-100 hover:bg-current/10 transition-opacity"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ── Quick toggle row ─────────────────────────────────────────────────────────

function QuickToggle({
  active, label, icon: Icon, accent, onClick, description,
}: {
  active: boolean;
  label: string;
  icon: React.ElementType;
  accent: string;       // tailwind class for active state's color
  onClick: () => void;
  description?: string;
}) {
  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            className={[
              "group/toggle w-full flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-xs transition-all text-left",
              active
                ? `${accent} shadow-sm`
                : "bg-background border-border/60 hover:border-border hover:bg-muted/40 text-muted-foreground",
            ].join(" ")}
          >
            <Icon className={[
              "h-3.5 w-3.5 shrink-0 transition-transform",
              active ? "" : "opacity-60 group-hover/toggle:opacity-100",
            ].join(" ")} />
            <span className={active ? "font-semibold flex-1" : "flex-1"}>{label}</span>
            <span className={[
              "h-4 w-4 rounded-full border flex items-center justify-center transition-all shrink-0",
              active ? "bg-current border-current" : "border-border/70 group-hover/toggle:border-foreground/40",
            ].join(" ")}>
              {active && <Check className="h-2.5 w-2.5 text-background" strokeWidth={3} />}
            </span>
          </button>
        </TooltipTrigger>
        {description && (
          <TooltipContent side="left" className="text-xs max-w-[200px]">{description}</TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Multi-select chip group ──────────────────────────────────────────────────

function ChipGroup<T extends string>({
  options, selected, onToggle, colorMap, labelMap, dense,
}: {
  options:  readonly T[];
  selected: T[];
  onToggle: (val: T) => void;
  colorMap: Record<T, string>;
  labelMap: Record<T, string>;
  dense?:   boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const isOn = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={[
              "inline-flex items-center gap-1 rounded-full border text-xs font-medium transition-all",
              dense ? "px-2 py-0.5" : "px-2.5 py-1",
              isOn
                ? `${colorMap[opt]} shadow-sm scale-[1.02]`
                : "bg-background border-border/50 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            ].join(" ")}
          >
            {isOn && <Check className="h-2.5 w-2.5 shrink-0" strokeWidth={3} />}
            {labelMap[opt]}
          </button>
        );
      })}
    </div>
  );
}

// ── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon, title, count, action,
}: {
  icon: React.ElementType;
  title: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <Icon className="h-3 w-3 text-muted-foreground/70" />
      <h4 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80 flex-1">
        {title}
        {count != null && count > 0 && (
          <span className="ml-1.5 text-foreground/70 normal-case tracking-normal">{count}</span>
        )}
      </h4>
      {action}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function TicketsFilterSidebar({ filters, onChange, onClear, onSaveAsView }: Props) {
  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn:  () => axios.get<{ teams: Team[] }>("/api/teams").then((r) => r.data.teams),
  });
  const teams = teamsData ?? [];

  const { data: usersData } = useQuery({
    queryKey: ["agents-sidebar"],
    queryFn:  async () => {
      const { data } = await axios.get<{ agents: UserOpt[] }>("/api/agents");
      return data.agents;
    },
    staleTime: 60_000,
  });
  const users = usersData ?? [];

  const { data: customStatusesRaw } = useQuery({
    queryKey: ["ticket-status-configs"],
    queryFn:  () => axios.get<{ configs: CustomStatusConfig[] }>("/api/ticket-status-configs").then((r) => r.data.configs),
    staleTime: 60_000,
  });
  const customStatuses = (customStatusesRaw ?? []).filter((s) => s.isActive);

  const { data: customTypesRaw } = useQuery({
    queryKey: ["ticket-types"],
    queryFn:  () => axios.get<{ ticketTypes: CustomTicketTypeConfig[] }>("/api/ticket-types").then((r) => r.data.ticketTypes),
    staleTime: 60_000,
  });
  const customTypes = (customTypesRaw ?? []).filter((t) => t.isActive);

  // Normalize all multi-value filters to arrays for easier rendering
  const priorityArr   = asArray(filters.priority);
  const severityArr   = asArray(filters.severity);
  const categoryArr   = asArray(filters.category);
  const sourceArr     = asArray(filters.source);
  const statusArr     = asArray(filters.status);
  const customStatusArr     = asArray(filters.customStatusId);
  const ticketTypeArr       = asArray(filters.ticketType);
  const customTicketTypeArr = asArray(filters.customTicketTypeId);
  const teamIdArr           = asArray(filters.teamId);
  const assigneeArr         = asArray(filters.assignedToId);

  // Active filter count for header — separate from URL-controlled `view`/saved-view chips
  const activeCount = useMemo(() => {
    let n = 0;
    // Status (built-in or custom) counts as a single active filter
    if (statusArr.length || customStatusArr.length) n++;
    // Type (built-in or custom)
    if (ticketTypeArr.length || customTicketTypeArr.length) n++;
    if (priorityArr.length) n++;
    if (severityArr.length) n++;
    if (categoryArr.length) n++;
    if (sourceArr.length)   n++;
    if (filters.escalated)    n++;
    if (filters.assignedToMe) n++;
    if (filters.unassigned)   n++;
    if (filters.slaBreached)  n++;
    if (assigneeArr.length)   n++;
    if (filters.search)       n++;
    if (teamIdArr.length)     n++;
    if (filters.view)         n++;
    return n;
  }, [
    filters, priorityArr.length, severityArr.length, categoryArr.length, sourceArr.length,
    statusArr.length, customStatusArr.length, ticketTypeArr.length, customTicketTypeArr.length,
    teamIdArr.length, assigneeArr.length,
  ]);

  const hasFilters = activeCount > 0;

  // Toggle helpers
  const togglePriority = (p: TicketPriority) =>
    onChange({ ...filters, priority: singleOrArray(toggleInArray(priorityArr, p)) });
  const toggleSeverity = (s: TicketSeverity) =>
    onChange({ ...filters, severity: singleOrArray(toggleInArray(severityArr, s)) });
  const toggleCategory = (c: TicketCategory) =>
    onChange({ ...filters, category: singleOrArray(toggleInArray(categoryArr, c)) });
  const toggleSource = (s: "email" | "portal" | "agent") =>
    onChange({ ...filters, source: singleOrArray(toggleInArray(sourceArr, s)) as TicketFilters["source"] });

  // Render names for the active team-filter list (mixes numeric ids and the "none" sentinel)
  const teamNameFor = (id: number | "none"): string => {
    if (id === "none") return "No team";
    return teams.find((t) => t.id === id)?.name ?? `Team ${id}`;
  };
  const teamFilterLabels = teamIdArr.map(teamNameFor);

  // Status: combine built-in + custom into a single human-readable list
  const statusFilterLabels = [
    ...statusArr.map((s) => statusLabel[s as TicketStatus] ?? s),
    ...customStatusArr.map((id) => customStatuses.find((cs) => cs.id === id)?.label ?? `#${id}`),
  ];
  // Type: combine built-in + custom
  const typeFilterLabels = [
    ...ticketTypeArr.map((t) => ticketTypeLabel[t as TicketType] ?? t),
    ...customTicketTypeArr.map((id) => customTypes.find((ct) => ct.id === id)?.name ?? `#${id}`),
  ];
  // Assignee names
  const assigneeFilterLabels = assigneeArr.map((id) => users.find((u) => u.id === id)?.name ?? "Agent");

  // Multi-toggle helpers
  const toggleStatus = (s: TicketStatus) =>
    onChange({ ...filters, status: singleOrArray(toggleInArray(statusArr, s)) as TicketFilters["status"] });
  const toggleCustomStatus = (id: number) =>
    onChange({ ...filters, customStatusId: singleOrArray(toggleInArray(customStatusArr, id)) });
  const toggleTicketType = (t: TicketType) =>
    onChange({ ...filters, ticketType: singleOrArray(toggleInArray(ticketTypeArr, t)) as TicketFilters["ticketType"] });
  const toggleCustomType = (id: number) =>
    onChange({ ...filters, customTicketTypeId: singleOrArray(toggleInArray(customTicketTypeArr, id)) });
  const toggleTeam = (id: number | "none") =>
    onChange({ ...filters, teamId: singleOrArray(toggleInArray(teamIdArr, id)) });
  const toggleAssignee = (id: string) =>
    onChange({
      ...filters,
      assignedToId: singleOrArray(toggleInArray(assigneeArr, id)),
      // selecting an explicit assignee clears the mutually-exclusive toggles
      assignedToMe: undefined,
      unassigned: undefined,
    });

  return (
    <aside
      aria-label="Ticket filters"
      className={[
        // Pinned flush to the viewport's right edge, full available height below the app header
        "fixed right-0 top-14 bottom-0 w-80 z-20",
        // Hide on smaller screens where there isn't room next to the main content
        "hidden lg:flex flex-col",
      ].join(" ")}
    >
      <div className="flex flex-col flex-1 min-h-0 border-l bg-card/95 backdrop-blur-md shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.08)] overflow-hidden">

        {/* ── Header (gradient + decorative accent bar) ────────────────────── */}
        <div className="relative border-b bg-gradient-to-br from-primary/8 via-primary/4 to-transparent">
          {/* Left accent bar */}
          <div className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-primary/60 via-primary/30 to-transparent" />
          <div className="px-5 py-3.5 flex items-center gap-3">
            <div className={[
              "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-all",
              hasFilters
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
                : "bg-primary/15 border border-primary/30 text-primary",
            ].join(" ")}>
              <Filter className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold leading-tight tracking-tight">Filters</span>
                {hasFilters && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full text-[10px] font-bold tabular-nums bg-primary text-primary-foreground shadow-sm">
                    {activeCount}
                  </span>
                )}
              </div>
              <div className="text-[10.5px] text-muted-foreground leading-tight mt-0.5">
                {hasFilters
                  ? `${activeCount} ${activeCount === 1 ? "filter" : "filters"} applied`
                  : "Refine the ticket list"}
              </div>
            </div>
            {hasFilters && (
              <button
                type="button"
                onClick={onClear}
                title="Clear all filters"
                className="h-7 px-2 inline-flex items-center gap-1 text-[11px] rounded-md text-muted-foreground hover:text-foreground hover:bg-background/60 ring-1 ring-transparent hover:ring-border/60 transition-all"
              >
                <RotateCcw className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>
        </div>

        <div
          id="ticket-filters-panel"
          className="flex-1 min-h-0 overflow-y-auto"
        >

          {/* ── Active filters as pills ────────────────────────────────────── */}
          {hasFilters && (
            <div className="px-4 py-3 border-b bg-muted/20">
              <SectionHeader icon={Sparkles} title="Active" count={activeCount} />
              <div className="space-y-1.5">
                {filters.search && (
                  <ActivePill
                    icon={Filter} label="Search" value={`"${filters.search}"`} tone="primary"
                    onRemove={() => onChange({ ...filters, search: undefined })}
                  />
                )}
                {filters.view === "overdue" && (
                  <ActivePill icon={Clock} label="Quick view" value="Overdue" tone="danger"
                    onRemove={() => onChange({ ...filters, view: undefined })} />
                )}
                {filters.view === "at_risk" && (
                  <ActivePill icon={ShieldAlert} label="Quick view" value="At-risk SLA" tone="warning"
                    onRemove={() => onChange({ ...filters, view: undefined })} />
                )}
                {filters.view === "unassigned_urgent" && (
                  <ActivePill icon={UserX} label="Quick view" value="Unassigned urgent" tone="warning"
                    onRemove={() => onChange({ ...filters, view: undefined })} />
                )}
                {filters.escalated && (
                  <ActivePill icon={AlertTriangle} label="State" value="Escalated" tone="danger"
                    onRemove={() => onChange({ ...filters, escalated: undefined })} />
                )}
                {filters.slaBreached && (
                  <ActivePill icon={Clock} label="State" value="SLA breached" tone="danger"
                    onRemove={() => onChange({ ...filters, slaBreached: undefined })} />
                )}
                {filters.assignedToMe && (
                  <ActivePill icon={UserCheck} label="Assignee" value="Assigned to me" tone="success"
                    onRemove={() => onChange({ ...filters, assignedToMe: undefined })} />
                )}
                {filters.unassigned && (
                  <ActivePill icon={UserX} label="Assignee" value="Unassigned" tone="warning"
                    onRemove={() => onChange({ ...filters, unassigned: undefined })} />
                )}
                {statusFilterLabels.length > 0 && (
                  <ActivePill icon={Activity} label="Status" value={statusFilterLabels.join(", ")}
                    onRemove={() => onChange({ ...filters, status: undefined, customStatusId: undefined })} />
                )}
                {typeFilterLabels.length > 0 && (
                  <ActivePill icon={Tag} label="Type" value={typeFilterLabels.join(", ")}
                    onRemove={() => onChange({ ...filters, ticketType: undefined, customTicketTypeId: undefined })} />
                )}
                {priorityArr.length > 0 && (
                  <ActivePill icon={Flag} label="Priority"
                    value={priorityArr.map((p) => priorityLabel[p]).join(", ")}
                    onRemove={() => onChange({ ...filters, priority: undefined })} />
                )}
                {severityArr.length > 0 && (
                  <ActivePill icon={ShieldAlert} label="Severity"
                    value={severityArr.map((s) => severityShortLabel[s]).join(", ")}
                    onRemove={() => onChange({ ...filters, severity: undefined })} />
                )}
                {categoryArr.length > 0 && (
                  <ActivePill icon={Tag} label="Category"
                    value={categoryArr.map((c) => categoryLabel[c] ?? c).join(", ")}
                    onRemove={() => onChange({ ...filters, category: undefined })} />
                )}
                {sourceArr.length > 0 && (
                  <ActivePill icon={Mail} label="Source"
                    value={sourceArr.map((s) => SOURCE_META[s].label).join(", ")}
                    onRemove={() => onChange({ ...filters, source: undefined })} />
                )}
                {teamFilterLabels.length > 0 && (
                  <ActivePill icon={Users} label="Team" value={teamFilterLabels.join(", ")}
                    onRemove={() => onChange({ ...filters, teamId: undefined })} />
                )}
                {assigneeFilterLabels.length > 0 && (
                  <ActivePill icon={UserCheck} label="Assignee" value={assigneeFilterLabels.join(", ")}
                    onRemove={() => onChange({ ...filters, assignedToId: undefined })} />
                )}
              </div>
            </div>
          )}

          {/* ── Quick toggles ──────────────────────────────────────────────── */}
          <div className="px-4 py-3 border-b">
            <SectionHeader icon={Zap} title="Quick filters" />
            <div className="space-y-1.5">
              <QuickToggle
                active={!!filters.escalated}
                label="Escalated only"
                description="Tickets that have been escalated to another team or agent"
                icon={AlertTriangle}
                accent="bg-red-500/10 border-red-500/40 text-red-700 dark:text-red-300"
                onClick={() => onChange({ ...filters, escalated: filters.escalated ? undefined : true })}
              />
              <QuickToggle
                active={!!filters.slaBreached}
                label="SLA breached"
                description="Tickets that have missed their SLA deadline"
                icon={Clock}
                accent="bg-red-500/10 border-red-500/40 text-red-700 dark:text-red-300"
                onClick={() => onChange({ ...filters, slaBreached: filters.slaBreached ? undefined : true })}
              />
              <QuickToggle
                active={!!filters.assignedToMe}
                label="Assigned to me"
                description="Show only tickets assigned to your account"
                icon={UserCheck}
                accent="bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                onClick={() => onChange({
                  ...filters,
                  assignedToMe: filters.assignedToMe ? undefined : true,
                  unassigned: undefined,    // mutually exclusive
                  assignedToId: undefined,
                })}
              />
              <QuickToggle
                active={!!filters.unassigned}
                label="Unassigned"
                description="Tickets with no agent assigned"
                icon={UserX}
                accent="bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300"
                onClick={() => onChange({
                  ...filters,
                  unassigned: filters.unassigned ? undefined : true,
                  assignedToMe: undefined,
                  assignedToId: undefined,
                })}
              />
            </div>
          </div>

          {/* ── Priority ───────────────────────────────────────────────────── */}
          <div className="px-4 py-3 border-b">
            <SectionHeader icon={Flag} title="Priority" count={priorityArr.length} />
            <ChipGroup
              options={ticketPriorities}
              selected={priorityArr}
              onToggle={togglePriority}
              colorMap={PRIORITY_COLORS}
              labelMap={priorityLabel}
            />
          </div>

          {/* ── Severity ───────────────────────────────────────────────────── */}
          <div className="px-4 py-3 border-b">
            <SectionHeader icon={ShieldAlert} title="Severity" count={severityArr.length} />
            <ChipGroup
              options={ticketSeverities}
              selected={severityArr}
              onToggle={toggleSeverity}
              colorMap={SEVERITY_COLORS}
              labelMap={severityShortLabel}
            />
          </div>

          {/* ── Category ───────────────────────────────────────────────────── */}
          <div className="px-4 py-3 border-b">
            <SectionHeader icon={Tag} title="Category" count={categoryArr.length} />
            <ChipGroup
              options={["general_question", "technical_question", "refund_request"] as const}
              selected={categoryArr as ("general_question" | "technical_question" | "refund_request")[]}
              onToggle={(c) => toggleCategory(c)}
              colorMap={{
                general_question:  "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
                technical_question:"bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
                refund_request:    "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
              }}
              labelMap={categoryLabel}
              dense
            />
          </div>

          {/* ── Source / Channel ───────────────────────────────────────────── */}
          <div className="px-4 py-3 border-b">
            <SectionHeader icon={Mail} title="Source" count={sourceArr.length} />
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(SOURCE_META) as ("email" | "portal" | "agent")[]).map((src) => {
                const meta = SOURCE_META[src];
                const isOn = sourceArr.includes(src);
                const Icon = meta.icon;
                return (
                  <button
                    key={src}
                    type="button"
                    onClick={() => toggleSource(src)}
                    className={[
                      "flex flex-col items-center gap-1 rounded-lg border py-2 text-[11px] transition-all",
                      isOn
                        ? `${meta.color} shadow-sm`
                        : "bg-background border-border/50 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                    ].join(" ")}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className={isOn ? "font-semibold" : ""}>{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Status (multi) ─────────────────────────────────────────────── */}
          <div className="px-4 py-3 border-b">
            <SectionHeader icon={Activity} title="Status" count={statusArr.length + customStatusArr.length} />
            <div className="flex flex-wrap gap-1.5">
              {agentTicketStatuses.map((s) => {
                const isOn = statusArr.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleStatus(s)}
                    className={[
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                      isOn
                        ? "bg-primary/10 border-primary/40 text-primary shadow-sm scale-[1.02]"
                        : "bg-background border-border/50 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                    ].join(" ")}
                  >
                    {isOn && <Check className="h-2.5 w-2.5 shrink-0" strokeWidth={3} />}
                    {statusLabel[s]}
                  </button>
                );
              })}
              {customStatuses.map((cs) => {
                const isOn = customStatusArr.includes(cs.id);
                return (
                  <button
                    key={`cs-${cs.id}`}
                    type="button"
                    onClick={() => toggleCustomStatus(cs.id)}
                    className={[
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                      isOn
                        ? "shadow-sm scale-[1.02] border-current"
                        : "bg-background border-border/50 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                    ].join(" ")}
                    style={isOn ? { color: cs.color, backgroundColor: `${cs.color}1A` } : undefined}
                  >
                    {isOn && <Check className="h-2.5 w-2.5 shrink-0" strokeWidth={3} />}
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cs.color }} />
                    {cs.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Ticket type (multi) ────────────────────────────────────────── */}
          <div className="px-4 py-3 border-b">
            <SectionHeader icon={Layers} title="Type" count={ticketTypeArr.length + customTicketTypeArr.length} />
            <div className="flex flex-wrap gap-1.5">
              {ticketTypes.map((t) => {
                const isOn = ticketTypeArr.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTicketType(t)}
                    className={[
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                      isOn
                        ? "bg-indigo-500/10 border-indigo-500/40 text-indigo-700 dark:text-indigo-300 shadow-sm scale-[1.02]"
                        : "bg-background border-border/50 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                    ].join(" ")}
                  >
                    {isOn && <Check className="h-2.5 w-2.5 shrink-0" strokeWidth={3} />}
                    {ticketTypeLabel[t]}
                  </button>
                );
              })}
              {customTypes.map((ct) => {
                const isOn = customTicketTypeArr.includes(ct.id);
                return (
                  <button
                    key={`ct-${ct.id}`}
                    type="button"
                    onClick={() => toggleCustomType(ct.id)}
                    className={[
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                      isOn
                        ? "bg-fuchsia-500/10 border-fuchsia-500/40 text-fuchsia-700 dark:text-fuchsia-300 shadow-sm scale-[1.02]"
                        : "bg-background border-border/50 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                    ].join(" ")}
                  >
                    {isOn && <Check className="h-2.5 w-2.5 shrink-0" strokeWidth={3} />}
                    {ct.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Team picker (multi) ────────────────────────────────────────── */}
          {teams.length > 0 && (
            <div className="px-4 py-3 border-b">
              <SectionHeader icon={Users} title="Team" count={teamIdArr.length} />
              <div className="space-y-0.5 max-h-44 overflow-y-auto -mx-1 px-1">
                <button
                  type="button"
                  onClick={() => toggleTeam("none")}
                  className={[
                    "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors text-left",
                    teamIdArr.includes("none")
                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/30"
                      : "hover:bg-muted/60 text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  <span className="flex-1 italic">No team</span>
                  {teamIdArr.includes("none") && <Check className="h-3 w-3" strokeWidth={3} />}
                </button>
                {teams.map((t) => {
                  const isOn = teamIdArr.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTeam(t.id)}
                      className={[
                        "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors text-left",
                        isOn
                          ? "bg-primary/10 text-primary ring-1 ring-primary/30 font-medium"
                          : "hover:bg-muted/60 text-muted-foreground hover:text-foreground",
                      ].join(" ")}
                    >
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: t.color || "#64748b" }}
                      />
                      <span className="flex-1 truncate">{t.name}</span>
                      {isOn && <Check className="h-3 w-3" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Assignee picker (multi) ────────────────────────────────────── */}
          {users.length > 0 && (
            <div className="px-4 py-3 border-b">
              <SectionHeader icon={Briefcase} title="Assignee" count={assigneeArr.length} />
              {(filters.unassigned || filters.assignedToMe) && assigneeArr.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">
                  Disabled — clear the toggle above to pick specific agents.
                </p>
              ) : (
                <div className="space-y-0.5 max-h-44 overflow-y-auto -mx-1 px-1">
                  {users.map((u) => {
                    const isOn = assigneeArr.includes(u.id);
                    const initials = u.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleAssignee(u.id)}
                        className={[
                          "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors text-left",
                          isOn
                            ? "bg-primary/10 text-primary ring-1 ring-primary/30 font-medium"
                            : "hover:bg-muted/60 text-muted-foreground hover:text-foreground",
                        ].join(" ")}
                      >
                        <span className={[
                          "h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-semibold shrink-0",
                          isOn ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
                        ].join(" ")}>
                          {initials || "?"}
                        </span>
                        <span className="flex-1 truncate">{u.name}</span>
                        {isOn && <Check className="h-3 w-3" strokeWidth={3} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Footer: save current filters as a reusable view ────────────── */}
          {onSaveAsView && hasFilters && (
            <div className="px-4 py-3 bg-muted/10">
              <button
                type="button"
                onClick={onSaveAsView}
                className="w-full flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors group/save"
              >
                <Settings2 className="h-3 w-3" />
                <span className="flex-1 text-left">Save current filters as a view</span>
                <ChevronRight className="h-3 w-3 group-hover/save:translate-x-0.5 transition-transform" />
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
