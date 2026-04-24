/**
 * AutomationPlatformPage — Enterprise Automation Control Center
 *
 * Layout: persistent left sidebar (category nav + integration links + observability)
 *         + right content pane (dense rule table, filterable, sortable).
 *
 * Features:
 *  - Per-category rule list in a dense admin table
 *  - Inline enable/disable toggle
 *  - Clone, reorder, delete (with confirm dialog)
 *  - Status indicators: active / disabled / last-run failed
 *  - Search + status filter per category
 *  - Global stats strip across the top
 *  - Navigation to Execution Log, Governance (audit), Routing, Webhooks
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import axios from "axios";
import {
  Plus, Zap, Clock, ArrowRightLeft, Bell, Settings2, DatabaseZap,
  RefreshCw, GitBranch, Webhook, Trash2, Search, Activity, GitFork,
  MoreHorizontal, Copy, ToggleLeft, ChevronRight, AlertTriangle,
  CheckCircle2, XCircle, Circle, History, ShieldCheck, Power,
  GripVertical, BarChart3, BookOpen, FlaskConical, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import ErrorAlert from "@/components/ErrorAlert";
import type { AutomationCategory } from "core/constants/automation";
import {
  AUTOMATION_CATEGORIES, AUTOMATION_TRIGGER_LABELS,
  AUTOMATION_ACTION_LABELS,
} from "core/constants/automation";

// ── Types ────────────────────────────────────────────────────────────────────

interface LastExecution {
  id: number;
  status: string;
  startedAt: string;
  completedAt: string | null;
}

interface AutomationRule {
  id: number;
  name: string;
  description: string | null;
  category: AutomationCategory;
  isEnabled: boolean;
  order: number;
  triggers: Array<{ type: string }>;
  actions: Array<{ type: string }>;
  runOnce: boolean;
  stopOnMatch: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string } | null;
  updatedBy: { id: string; name: string } | null;
  _count: { executions: number };
  executions: LastExecution[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<AutomationCategory, React.ReactNode> = {
  intake_routing:          <ArrowRightLeft className="size-3.5" />,
  event_workflow:          <GitBranch className="size-3.5" />,
  time_supervisor:         <Clock className="size-3.5" />,
  assignment_routing:      <RefreshCw className="size-3.5" />,
  approval_automation:     <Settings2 className="size-3.5" />,
  notification_automation: <Bell className="size-3.5" />,
  field_automation:        <DatabaseZap className="size-3.5" />,
  lifecycle:               <Activity className="size-3.5" />,
  integration_webhook:     <Webhook className="size-3.5" />,
};

const ALL_CATEGORIES = Object.keys(AUTOMATION_CATEGORIES) as AutomationCategory[];

const DESTRUCTIVE_ACTIONS = new Set([
  "suppress_creation", "mark_spam", "close_stale", "merge_into_ticket",
  "quarantine", "resolve", "close",
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function hasDestructiveAction(rule: AutomationRule): boolean {
  return rule.actions.some((a) => DESTRUCTIVE_ACTIONS.has(a.type));
}

function lastRunStatus(rule: AutomationRule): "success" | "failed" | "none" {
  const last = rule.executions?.[0];
  if (!last) return "none";
  return last.status === "completed" ? "success" : "failed";
}

// ── Status dot component ─────────────────────────────────────────────────────

function StatusDot({ rule }: { rule: AutomationRule }) {
  const runStatus = lastRunStatus(rule);

  if (!rule.isEnabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center justify-center size-2 rounded-full bg-muted-foreground/30" />
        </TooltipTrigger>
        <TooltipContent>Disabled</TooltipContent>
      </Tooltip>
    );
  }
  if (runStatus === "failed") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center justify-center size-2 rounded-full bg-destructive animate-pulse" />
        </TooltipTrigger>
        <TooltipContent>Active — last run failed</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center justify-center size-2 rounded-full bg-emerald-500" />
      </TooltipTrigger>
      <TooltipContent>Active</TooltipContent>
    </Tooltip>
  );
}

// ── Left sidebar ─────────────────────────────────────────────────────────────

type NavSection = AutomationCategory | "all" | "executions" | "governance";

function Sidebar({
  rules,
  active,
  onChange,
}: {
  rules: AutomationRule[];
  active: NavSection;
  onChange: (s: NavSection) => void;
}) {
  const navigate = useNavigate();

  const countFor = (cat: AutomationCategory) => rules.filter((r) => r.category === cat).length;
  const activeFor = (cat: AutomationCategory) => rules.filter((r) => r.category === cat && r.isEnabled).length;

  function NavItem({
    id, icon, label, count, activeBadge, extra,
  }: {
    id: NavSection;
    icon: React.ReactNode;
    label: string;
    count?: number;
    activeBadge?: boolean;
    extra?: React.ReactNode;
  }) {
    const isActive = active === id;
    return (
      <button
        type="button"
        onClick={() => onChange(id)}
        className={`
          w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left text-sm transition-colors
          ${isActive
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"}
        `}
      >
        <span className="shrink-0">{icon}</span>
        <span className="flex-1 truncate leading-none">{label}</span>
        {count !== undefined && count > 0 && (
          <Badge
            variant={isActive || activeBadge ? "default" : "secondary"}
            className="text-[10px] px-1.5 h-4 shrink-0"
          >
            {count}
          </Badge>
        )}
        {extra}
      </button>
    );
  }

  return (
    <aside className="w-52 shrink-0 flex flex-col gap-1 py-2 border-r pr-3 min-h-0">
      {/* Rules section */}
      <p className="px-3 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-1 mt-2">
        Rules
      </p>

      <NavItem
        id="all"
        icon={<Layers className="size-3.5" />}
        label="All Rules"
        count={rules.length}
        activeBadge={rules.some((r) => r.isEnabled)}
      />

      {ALL_CATEGORIES.map((cat) => {
        const total  = countFor(cat);
        const active = activeFor(cat);
        return (
          <NavItem
            key={cat}
            id={cat}
            icon={CATEGORY_ICONS[cat]}
            label={AUTOMATION_CATEGORIES[cat].label}
            count={total}
            activeBadge={active > 0}
          />
        );
      })}

      {/* Integrations section */}
      <p className="px-3 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-1 mt-4">
        Integrations
      </p>

      <button
        type="button"
        onClick={() => navigate("/automations/routing")}
        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <GitFork className="size-3.5 shrink-0" />
        <span className="flex-1 truncate">Routing Config</span>
        <ChevronRight className="size-3 shrink-0 opacity-40" />
      </button>

      <button
        type="button"
        onClick={() => navigate("/automations/webhooks")}
        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <Webhook className="size-3.5 shrink-0" />
        <span className="flex-1 truncate">Outbound Webhooks</span>
        <ChevronRight className="size-3 shrink-0 opacity-40" />
      </button>

      {/* Observability section */}
      <p className="px-3 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-1 mt-4">
        Observability
      </p>

      <NavItem
        id="executions"
        icon={<History className="size-3.5" />}
        label="Execution Log"
      />

      <NavItem
        id="governance"
        icon={<ShieldCheck className="size-3.5" />}
        label="Governance"
      />
    </aside>
  );
}

// ── Global stats strip ───────────────────────────────────────────────────────

function StatsStrip({ rules }: { rules: AutomationRule[] }) {
  const total       = rules.length;
  const active      = rules.filter((r) => r.isEnabled).length;
  const disabled    = total - active;
  const totalRuns   = rules.reduce((s, r) => s + r._count.executions, 0);
  const recentFails = rules.filter((r) => lastRunStatus(r) === "failed").length;

  return (
    <div className="flex items-center gap-6 px-1 py-3 border-b text-sm">
      <div className="flex items-center gap-1.5">
        <span className="font-semibold text-foreground">{total}</span>
        <span className="text-muted-foreground">rules</span>
      </div>
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="size-3.5 text-emerald-500" />
        <span className="font-semibold">{active}</span>
        <span className="text-muted-foreground">active</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Circle className="size-3.5 text-muted-foreground/50" />
        <span className="font-semibold">{disabled}</span>
        <span className="text-muted-foreground">disabled</span>
      </div>
      <div className="flex items-center gap-1.5">
        <BarChart3 className="size-3.5 text-muted-foreground" />
        <span className="font-semibold">{totalRuns.toLocaleString()}</span>
        <span className="text-muted-foreground">total executions</span>
      </div>
      {recentFails > 0 && (
        <div className="flex items-center gap-1.5 text-destructive">
          <XCircle className="size-3.5" />
          <span className="font-semibold">{recentFails}</span>
          <span className="text-destructive/80">recent failures</span>
        </div>
      )}
    </div>
  );
}

// ── Rule table ────────────────────────────────────────────────────────────────

function RuleTable({
  rules,
  onToggle,
  onClone,
  onDelete,
}: {
  rules: AutomationRule[];
  onToggle: (id: number) => void;
  onClone: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState<AutomationRule | null>(null);

  if (rules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-muted p-4 mb-3">
          <Zap className="size-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">No rules in this category</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
          Create your first rule to start automating.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
              <th className="w-8 px-3 py-2 text-left font-medium">#</th>
              <th className="w-6 px-2 py-2"></th>
              <th className="px-3 py-2 text-left font-medium">Rule</th>
              <th className="w-40 px-3 py-2 text-left font-medium">Triggers</th>
              <th className="w-40 px-3 py-2 text-left font-medium">Actions</th>
              <th className="w-28 px-3 py-2 text-left font-medium">Last Run</th>
              <th className="w-16 px-3 py-2 text-right font-medium">Runs</th>
              <th className="w-16 px-3 py-2 text-center font-medium">Ver</th>
              <th className="w-12 px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rules.map((rule) => {
              const lastRun = rule.executions?.[0];
              const triggerLabel = AUTOMATION_TRIGGER_LABELS[rule.triggers[0]?.type as keyof typeof AUTOMATION_TRIGGER_LABELS] ?? rule.triggers[0]?.type ?? "—";
              const actionLabel  = AUTOMATION_ACTION_LABELS[rule.actions[0]?.type  as keyof typeof AUTOMATION_ACTION_LABELS]  ?? rule.actions[0]?.type  ?? "—";
              const isDestructive = hasDestructiveAction(rule);

              return (
                <tr
                  key={rule.id}
                  className="group hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => navigate(`/automations/rules/${rule.id}`)}
                >
                  {/* Order */}
                  <td className="px-3 py-2.5 text-xs text-muted-foreground font-mono w-8">
                    {rule.order}
                  </td>

                  {/* Status dot */}
                  <td className="px-2 py-2.5 w-6" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center">
                      <StatusDot rule={rule} />
                    </div>
                  </td>

                  {/* Rule name */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-medium truncate block max-w-64 ${rule.isEnabled ? "text-foreground" : "text-muted-foreground"}`}>
                            {rule.name}
                          </span>
                          {isDestructive && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertTriangle className="size-3 text-amber-500 shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>Contains destructive action</TooltipContent>
                            </Tooltip>
                          )}
                          {rule.runOnce && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="text-[9px] px-1 h-3.5 shrink-0">once</Badge>
                              </TooltipTrigger>
                              <TooltipContent>Run once per entity</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        {rule.description && (
                          <span className="text-xs text-muted-foreground truncate block max-w-64">
                            {rule.description}
                          </span>
                        )}
                        {rule.updatedBy && (
                          <span className="text-[10px] text-muted-foreground/60 block">
                            Modified by {rule.updatedBy.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Triggers */}
                  <td className="px-3 py-2.5 w-40">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 h-4 shrink-0 font-mono">
                            {rule.triggers.length}
                          </Badge>
                          <span className="text-xs text-muted-foreground truncate max-w-28">{triggerLabel}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        <p className="text-xs font-medium mb-1">Triggers:</p>
                        {rule.triggers.map((t, i) => (
                          <p key={i} className="text-xs">{AUTOMATION_TRIGGER_LABELS[t.type as keyof typeof AUTOMATION_TRIGGER_LABELS] ?? t.type}</p>
                        ))}
                      </TooltipContent>
                    </Tooltip>
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-2.5 w-40">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 h-4 shrink-0 font-mono">
                            {rule.actions.length}
                          </Badge>
                          <span className="text-xs text-muted-foreground truncate max-w-28">{actionLabel}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        <p className="text-xs font-medium mb-1">Actions:</p>
                        {rule.actions.map((a, i) => (
                          <p key={i} className={`text-xs ${DESTRUCTIVE_ACTIONS.has(a.type) ? "text-amber-400" : ""}`}>
                            {DESTRUCTIVE_ACTIONS.has(a.type) ? "⚠ " : ""}
                            {AUTOMATION_ACTION_LABELS[a.type as keyof typeof AUTOMATION_ACTION_LABELS] ?? a.type}
                          </p>
                        ))}
                      </TooltipContent>
                    </Tooltip>
                  </td>

                  {/* Last run */}
                  <td className="px-3 py-2.5 w-28">
                    {lastRun ? (
                      <div className="flex items-center gap-1.5">
                        {lastRun.status === "completed"
                          ? <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />
                          : <XCircle className="size-3 text-destructive shrink-0" />}
                        <span className="text-xs text-muted-foreground">{relativeTime(lastRun.startedAt)}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                  </td>

                  {/* Run count */}
                  <td className="px-3 py-2.5 w-16 text-right">
                    <span className="text-xs font-mono text-muted-foreground">{rule._count.executions.toLocaleString()}</span>
                  </td>

                  {/* Version */}
                  <td className="px-3 py-2.5 w-16 text-center" onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={rule.isEnabled}
                      onCheckedChange={() => onToggle(rule.id)}
                      className="scale-75"
                      aria-label={rule.isEnabled ? "Disable rule" : "Enable rule"}
                    />
                  </td>

                  {/* Actions menu */}
                  <td className="px-3 py-2.5 w-12" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 opacity-0 group-hover:opacity-100"
                        >
                          <MoreHorizontal className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => navigate(`/automations/rules/${rule.id}`)}>
                          <BookOpen className="size-3.5 mr-2" />
                          Edit rule
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onClone(rule.id)}>
                          <Copy className="size-3.5 mr-2" />
                          Clone (copy)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(`/automations/rules/${rule.id}?tab=executions`)}>
                          <History className="size-3.5 mr-2" />
                          Execution history
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onToggle(rule.id)}>
                          <Power className="size-3.5 mr-2" />
                          {rule.isEnabled ? "Disable" : "Enable"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setConfirmDelete(rule)}
                        >
                          <Trash2 className="size-3.5 mr-2" />
                          Delete rule
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-destructive" />
              Delete Automation Rule
            </AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>{confirmDelete?.name}</strong>? This will permanently remove the rule and all its
              execution history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (confirmDelete) {
                  onDelete(confirmDelete.id);
                  setConfirmDelete(null);
                }
              }}
            >
              Delete rule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Category content panel ────────────────────────────────────────────────────

function CategoryPanel({
  category,
  rules,
  isLoading,
  onToggle,
  onClone,
  onDelete,
}: {
  category: AutomationCategory | "all";
  rules: AutomationRule[];
  isLoading: boolean;
  onToggle: (id: number) => void;
  onClone: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">("all");

  const meta = category === "all" ? null : AUTOMATION_CATEGORIES[category];
  const categoryRules = category === "all" ? rules : rules.filter((r) => r.category === category);

  const filtered = useMemo(() => {
    let list = categoryRules;
    if (statusFilter === "active")   list = list.filter((r) => r.isEnabled);
    if (statusFilter === "disabled") list = list.filter((r) => !r.isEnabled);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.name.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.triggers.some((t) => t.type.includes(q)) ||
        r.actions.some((a) => a.type.includes(q))
      );
    }
    return list;
  }, [categoryRules, search, statusFilter]);

  const activeCount   = categoryRules.filter((r) => r.isEnabled).length;
  const disabledCount = categoryRules.length - activeCount;

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0">
      {/* Category header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">
            {meta ? meta.label : "All Rules"}
          </h2>
          {meta && (
            <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{categoryRules.length}</span> rules
            </span>
            <span className="text-xs text-emerald-600">
              <CheckCircle2 className="size-3 inline mr-0.5" />
              {activeCount} active
            </span>
            {disabledCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {disabledCount} disabled
              </span>
            )}
          </div>
        </div>

        <Button
          size="sm"
          onClick={() => navigate(`/automations/rules/new${category !== "all" ? `?category=${category}` : ""}`)}
        >
          <Plus className="size-3.5 mr-1.5" />
          New rule
        </Button>
      </div>

      {/* Toolbar: search + filter */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search rules, triggers, actions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="flex items-center border rounded-md overflow-hidden h-8">
          {(["all", "active", "disabled"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={`px-3 text-xs h-full transition-colors border-r last:border-r-0 ${
                statusFilter === f
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        {(search || statusFilter !== "all") && (
          <Button
            variant="ghost" size="sm" className="h-8 text-xs"
            onClick={() => { setSearch(""); setStatusFilter("all"); }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : (
        <RuleTable
          rules={filtered}
          onToggle={onToggle}
          onClone={onClone}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

// ── Execution log panel (inline, lightweight) ─────────────────────────────────

function ExecutionLogPanel({ rules }: { rules: AutomationRule[] }) {
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["automation-executions-recent"],
    queryFn: async () => {
      const { data } = await axios.get("/api/automations/executions?limit=50");
      return data as { executions: any[]; total: number };
    },
  });

  const executions = data?.executions ?? [];

  return (
    <div className="flex-1 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Execution Log</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Recent rule evaluations across all categories.
            {data ? ` ${data.total.toLocaleString()} total.` : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/automations/executions")}>
          <History className="size-3.5 mr-1.5" />
          Full log
        </Button>
      </div>

      {error && <ErrorAlert error={error} fallback="Failed to load executions" />}

      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-9" />)}</div>
      ) : executions.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <History className="size-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No executions yet</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Rule</th>
                <th className="w-28 px-3 py-2 text-left font-medium">Category</th>
                <th className="w-32 px-3 py-2 text-left font-medium">Trigger</th>
                <th className="w-24 px-3 py-2 text-left font-medium">Entity</th>
                <th className="w-20 px-3 py-2 text-center font-medium">Status</th>
                <th className="w-24 px-3 py-2 text-right font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {executions.map((ex: any) => (
                <tr key={ex.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="font-medium text-foreground hover:underline truncate block max-w-48 text-left"
                      onClick={() => navigate(`/automations/rules/${ex.ruleId}`)}
                    >
                      {ex.rule?.name ?? `Rule #${ex.ruleId}`}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {ex.rule?.category ? AUTOMATION_CATEGORIES[ex.rule.category as AutomationCategory]?.label : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground font-mono truncate max-w-[120px]">{ex.trigger}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    <span className="font-mono">{ex.entityType}:{ex.entityId}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {ex.status === "completed" ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600">
                        <CheckCircle2 className="size-3" /> ok
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-destructive">
                        <XCircle className="size-3" /> fail
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{relativeTime(ex.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Governance panel (rule change history) ────────────────────────────────────

function GovernancePanel() {
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["automation-governance"],
    queryFn: async () => {
      const { data } = await axios.get("/api/automations/governance?limit=100");
      return data as { rules: any[]; total: number };
    },
  });

  const rules = data?.rules ?? [];

  return (
    <div className="flex-1 flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">Rule Governance</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Change history, version tracking, and authorship for all automation rules.
        </p>
      </div>

      {error && <ErrorAlert error={error} fallback="Failed to load governance data" />}

      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-9" />)}</div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Rule</th>
                <th className="w-28 px-3 py-2 text-left font-medium">Category</th>
                <th className="w-20 px-3 py-2 text-center font-medium">Status</th>
                <th className="w-12 px-3 py-2 text-center font-medium">Ver</th>
                <th className="w-32 px-3 py-2 text-left font-medium">Created by</th>
                <th className="w-32 px-3 py-2 text-left font-medium">Last modified by</th>
                <th className="w-28 px-3 py-2 text-right font-medium">Modified</th>
                <th className="w-16 px-3 py-2 text-right font-medium">Runs</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rules.map((rule: any) => (
                <tr key={rule.id} className="hover:bg-muted/20 transition-colors group">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="font-medium text-foreground hover:underline truncate block max-w-48 text-left"
                      onClick={() => navigate(`/automations/rules/${rule.id}`)}
                    >
                      {rule.name}
                    </button>
                    {rule.description && (
                      <span className="text-muted-foreground/70 truncate block max-w-48">{rule.description}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {AUTOMATION_CATEGORIES[rule.category as AutomationCategory]?.label ?? rule.category}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-flex items-center gap-1 ${rule.isEnabled ? "text-emerald-600" : "text-muted-foreground"}`}>
                      {rule.isEnabled
                        ? <><CheckCircle2 className="size-3" /> Active</>
                        : <><Circle className="size-3" /> Off</>}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-muted-foreground">v{rule.version}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {rule.createdBy?.name ?? "System"}
                    <span className="block text-muted-foreground/50">{new Date(rule.createdAt).toLocaleDateString()}</span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {rule.updatedBy?.name ?? rule.createdBy?.name ?? "System"}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{relativeTime(rule.updatedAt)}</td>
                  <td className="px-3 py-2 text-right font-mono text-muted-foreground">{rule._count.executions.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AutomationPlatformPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const activeSection = (searchParams.get("section") ?? "all") as NavSection;
  const setSection = (s: NavSection) => {
    setSearchParams(s === "all" ? {} : { section: s }, { replace: true });
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["automation-rules"],
    queryFn: async () => {
      const { data } = await axios.get<{ rules: AutomationRule[]; total: number }>(
        "/api/automations?limit=200"
      );
      return data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => axios.patch(`/api/automations/${id}/toggle`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
      toast.success("Rule updated");
    },
    onError: () => toast.error("Failed to update rule"),
  });

  const cloneMutation = useMutation({
    mutationFn: (id: number) => axios.post(`/api/automations/${id}/clone`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
      toast.success("Rule cloned — new rule is disabled by default");
      navigate(`/automations/rules/${res.data.rule.id}`);
    },
    onError: () => toast.error("Failed to clone rule"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axios.delete(`/api/automations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
      toast.success("Rule deleted");
    },
    onError: () => toast.error("Failed to delete rule"),
  });

  const rules = data?.rules ?? [];

  function renderContent() {
    if (activeSection === "executions") return <ExecutionLogPanel rules={rules} />;
    if (activeSection === "governance") return <GovernancePanel />;
    return (
      <CategoryPanel
        category={activeSection === "all" ? "all" : activeSection as AutomationCategory}
        rules={rules}
        isLoading={isLoading}
        onToggle={(id) => toggleMutation.mutate(id)}
        onClone={(id) => cloneMutation.mutate(id)}
        onDelete={(id) => deleteMutation.mutate(id)}
      />
    );
  }

  return (
    <TooltipProvider>
    <div className="flex flex-col h-full">
      {/* Top header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between gap-4 max-w-screen-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Zap className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Automation Platform</h1>
              <p className="text-xs text-muted-foreground">
                Define, manage, and monitor automation rules across all ITSM processes.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/automations/routing")}>
              <GitFork className="size-3.5 mr-1.5" />
              Routing
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/automations/webhooks")}>
              <Webhook className="size-3.5 mr-1.5" />
              Webhooks
            </Button>
            <Button
              size="sm"
              onClick={() => navigate(
                activeSection === "all" || activeSection === "executions" || activeSection === "governance"
                  ? "/automations/rules/new"
                  : `/automations/rules/new?category=${activeSection}`
              )}
            >
              <Plus className="size-3.5 mr-1.5" />
              New rule
            </Button>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      {rules.length > 0 && (
        <div className="border-b px-6 max-w-screen-2xl">
          <StatsStrip rules={rules} />
        </div>
      )}

      {error && (
        <div className="px-6 pt-4">
          <ErrorAlert error={error} fallback="Failed to load automation rules" />
        </div>
      )}

      {/* Two-panel layout: sidebar + content */}
      <div className="flex flex-1 gap-0 overflow-hidden px-6 pt-5 pb-6 max-w-screen-2xl">
        <Sidebar
          rules={rules}
          active={activeSection}
          onChange={setSection}
        />
        <div className="flex-1 pl-6 overflow-y-auto">
          {renderContent()}
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}
