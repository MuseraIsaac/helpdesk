/**
 * RoutingConfigPage — Assignment & Capacity Routing admin interface.
 *
 * Features:
 *  - Global auto-assignment toggle (master kill-switch)
 *  - Per-team routing strategy cards with live agent load bars
 *  - Agent capacity profiles with inline editing
 *  - Routing decision audit log
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  ArrowLeft, RefreshCw, CheckCircle2, XCircle, Zap, GitFork,
  AlertTriangle, ChevronDown, ChevronRight, Users, BarChart3,
  Settings2, Power, Shield, Activity, TrendingUp, User,
  Clock, Star, MoreHorizontal, Save, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import ErrorAlert from "@/components/ErrorAlert";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentSummary {
  id: string;
  name: string;
  isAvailable: boolean;
  maxConcurrentTickets: number;
  skills: string[];
  weight: number;
  openTickets: number;
}

interface TeamWithRouting {
  id: number;
  name: string;
  color: string;
  memberCount: number;
  activeTickets: number;
  agents: AgentSummary[];
  routingConfig: RoutingConfig | null;
}

interface RoutingConfig {
  teamId: number;
  strategy: string;
  respectCapacity: boolean;
  respectShifts: boolean;
  skillMatchMode: string;
  fallbackAgentId: string | null;
  fallbackTeamId: number | null;
  overflowAt: number | null;
}

interface AgentProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  teams: { id: number; name: string }[];
  openTickets: number;
  defaultTimezone: string;
  defaultLanguage: string;
  capacityProfile: {
    isAvailable: boolean;
    maxConcurrentTickets: number;
    skills: string[];
    languages: string[];
    timezone: string;
    shiftStart: string | null;
    shiftEnd: string | null;
    shiftDays: number[];
    weight: number;
    notes: string | null;
  } | null;
}

interface RoutingDecision {
  id: number;
  ticketId: number;
  teamId: number;
  strategy: string;
  candidateCount: number;
  eligibleCount: number;
  selectedAgentId: string | null;
  selectedAgentName: string | null;
  reason: string;
  skillsRequired: string[];
  fallbackUsed: boolean;
  overflowUsed: boolean;
  durationMs: number;
  createdAt: string;
}

// ── Strategy config ────────────────────────────────────────────────────────────

const STRATEGY_CONFIG: Record<string, { label: string; desc: string; icon: React.ReactNode; color: string }> = {
  round_robin:  { label: "Round Robin",         desc: "Distribute evenly in turn",                    icon: <RefreshCw className="size-3.5" />,    color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800" },
  weighted_rr:  { label: "Weighted Round Robin", desc: "Distribute proportionally by agent weight",    icon: <TrendingUp className="size-3.5" />,    color: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800" },
  least_loaded: { label: "Least Loaded",         desc: "Assign to agent with fewest open tickets",     icon: <Activity className="size-3.5" />,      color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" },
  skill_based:  { label: "Skill-Based",          desc: "Match by skill score, tie-break by load",      icon: <Star className="size-3.5" />,          color: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800" },
  manual:       { label: "Manual Only",          desc: "Team assignment only — no agent auto-assign",  icon: <User className="size-3.5" />,          color: "bg-muted text-muted-foreground border-muted-foreground/20" },
};

const SKILL_MODE_LABELS: Record<string, string> = {
  none:      "None (ignore skills)",
  preferred: "Preferred (bias toward matches)",
  required:  "Required (must match at least one)",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

// ── Load bar ──────────────────────────────────────────────────────────────────

function LoadBar({ current, max, compact }: { current: number; max: number; compact?: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;
  const color = pct >= 100 ? "bg-destructive" : pct >= 75 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className={cn("flex items-center gap-2", compact ? "min-w-16" : "min-w-0")}>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground shrink-0">{current}/{max}</span>
    </div>
  );
}

// ── Global routing toggle banner ──────────────────────────────────────────────

function GlobalRoutingToggle({ autoEnabled, onToggle, isPending }: {
  autoEnabled: boolean;
  onToggle: (v: boolean) => void;
  isPending: boolean;
}) {
  return (
    <div className={cn(
      "rounded-xl border p-5 transition-all",
      autoEnabled
        ? "bg-gradient-to-r from-emerald-500/5 to-transparent border-emerald-200 dark:border-emerald-800/50"
        : "bg-gradient-to-r from-amber-500/5 to-transparent border-amber-200 dark:border-amber-800/50"
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className={cn(
            "rounded-lg p-2.5 shrink-0",
            autoEnabled ? "bg-emerald-500/10" : "bg-amber-500/10"
          )}>
            {autoEnabled
              ? <Zap className="size-5 text-emerald-600 dark:text-emerald-400" />
              : <Power className="size-5 text-amber-600 dark:text-amber-400" />
            }
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">
                {autoEnabled ? "Automatic Assignment Active" : "Manual Assignment Mode"}
              </h3>
              <Badge className={cn(
                "text-[10px] px-1.5 h-4 border",
                autoEnabled
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300/50"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300/50"
              )}>
                {autoEnabled ? "Auto" : "Manual"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {autoEnabled
                ? "Tickets are automatically assigned to agents using each team's routing strategy, capacity limits, and skill matching."
                : "Auto-assignment is disabled. Tickets are assigned manually by agents and supervisors. All routing rules are bypassed."}
            </p>
            {!autoEnabled && (
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1.5 flex items-center gap-1">
                <AlertTriangle className="size-3 shrink-0" />
                Automation rules using assign_smart, assign_round_robin, and assign_least_loaded will not assign agents.
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted-foreground hidden sm:block">
            {autoEnabled ? "Turn off to switch to manual mode" : "Turn on to re-enable auto routing"}
          </span>
          <Switch
            checked={autoEnabled}
            onCheckedChange={onToggle}
            disabled={isPending}
            className={cn(autoEnabled ? "" : "data-[state=unchecked]:bg-amber-200")}
          />
        </div>
      </div>
    </div>
  );
}

// ── Stats strip ───────────────────────────────────────────────────────────────

function StatsStrip({ teams, agents }: {
  teams: TeamWithRouting[];
  agents: AgentProfile[];
}) {
  const totalAgents   = agents.length;
  const available     = agents.filter((a) => a.capacityProfile?.isAvailable !== false).length;
  const atCapacity    = agents.filter((a) => {
    const p = a.capacityProfile;
    return p && a.openTickets >= p.maxConcurrentTickets;
  }).length;
  const totalOpen     = agents.reduce((s, a) => s + a.openTickets, 0);
  const autoTeams     = teams.filter((t) => t.routingConfig?.strategy !== "manual").length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: "Teams configured",    value: autoTeams,    total: teams.length,  icon: <GitFork className="size-4" />,        color: "text-primary" },
        { label: "Agents available",    value: available,    total: totalAgents,   icon: <Users className="size-4" />,          color: "text-emerald-600" },
        { label: "Agents at capacity",  value: atCapacity,   total: totalAgents,   icon: <AlertTriangle className="size-4" />,  color: atCapacity > 0 ? "text-amber-600" : "text-muted-foreground" },
        { label: "Open tickets total",  value: totalOpen,    total: null,          icon: <BarChart3 className="size-4" />,      color: "text-foreground" },
      ].map((s) => (
        <Card key={s.label} className="bg-background">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className={cn("shrink-0", s.color)}>{s.icon}</span>
              {s.total !== null && (
                <span className="text-[10px] text-muted-foreground">{s.total} total</span>
              )}
            </div>
            <div className="text-2xl font-bold tabular-nums">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Team routing card ─────────────────────────────────────────────────────────

function TeamRoutingCard({ team, autoEnabled }: { team: TeamWithRouting; autoEnabled: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Partial<RoutingConfig>>(team.routingConfig ?? {});

  const updateMutation = useMutation({
    mutationFn: (data: Partial<RoutingConfig>) =>
      axios.patch(`/api/routing/teams/${team.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routing-teams"] });
      toast.success("Routing config saved");
    },
    onError: () => toast.error("Failed to save routing config"),
  });

  const resetMutation = useMutation({
    mutationFn: () => axios.delete(`/api/routing/teams/${team.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routing-teams"] });
      setForm({});
      toast.success("Reset to defaults");
    },
  });

  const cfg      = team.routingConfig;
  const strategy = cfg?.strategy ?? "round_robin";
  const stratCfg = STRATEGY_CONFIG[strategy] ?? STRATEGY_CONFIG.round_robin!;

  const totalLoad  = team.agents.reduce((s, a) => s + a.openTickets, 0);
  const atCapacity = team.agents.filter((a) => a.openTickets >= a.maxConcurrentTickets).length;
  const available  = team.agents.filter((a) => a.isAvailable).length;

  return (
    <Card className={cn(
      "overflow-hidden transition-all",
      !autoEnabled && "opacity-60",
    )}>
      {/* Card top accent line using team color */}
      <div className="h-0.5 w-full" style={{ backgroundColor: team.color }} />

      <CardHeader className="pb-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="size-7 rounded-md shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
              style={{ backgroundColor: team.color }}
            >
              {team.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">{team.name}</h3>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                <span>{team.memberCount} agent{team.memberCount !== 1 ? "s" : ""}</span>
                <span>·</span>
                <span>{totalLoad} open</span>
                {atCapacity > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-amber-600 flex items-center gap-0.5">
                      <AlertTriangle className="size-2.5" />
                      {atCapacity} at cap
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className={cn("inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium", stratCfg.color)}>
              {stratCfg.icon}
              <span className="hidden sm:inline">{stratCfg.label}</span>
            </span>
            <button
              type="button"
              onClick={() => setExpanded((p) => !p)}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
            >
              {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          </div>
        </div>
      </CardHeader>

      {/* Agent load minimap */}
      <CardContent className="pt-0 pb-3 space-y-1.5">
        {team.agents.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No agents in this team</p>
        ) : (
          team.agents.slice(0, expanded ? undefined : 4).map((a) => (
            <div key={a.id} className="flex items-center gap-2">
              <div className={cn(
                "size-1.5 rounded-full shrink-0",
                a.isAvailable ? "bg-emerald-500" : "bg-muted-foreground/40"
              )} />
              <span className="w-24 truncate text-xs text-muted-foreground">{a.name}</span>
              <LoadBar current={a.openTickets} max={a.maxConcurrentTickets} />
            </div>
          ))
        )}
        {!expanded && team.agents.length > 4 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-xs text-primary/70 hover:text-primary transition-colors"
          >
            +{team.agents.length - 4} more agents…
          </button>
        )}
      </CardContent>

      {/* Expanded config form */}
      {expanded && (
        <>
          <Separator />
          <CardContent className="pt-4 pb-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Routing Strategy</Label>
                <Select
                  value={form.strategy ?? cfg?.strategy ?? "round_robin"}
                  onValueChange={(v) => setForm((f) => ({ ...f, strategy: v }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STRATEGY_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k} className="text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{v.icon}</span>
                          <div>
                            <span className="font-medium">{v.label}</span>
                            <span className="text-muted-foreground ml-1 text-[10px]">— {v.desc}</span>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Skill Matching</Label>
                <Select
                  value={form.skillMatchMode ?? cfg?.skillMatchMode ?? "none"}
                  onValueChange={(v) => setForm((f) => ({ ...f, skillMatchMode: v }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SKILL_MODE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Overflow threshold <span className="text-muted-foreground font-normal">(avg tickets)</span></Label>
                <Input
                  type="number" min={1}
                  className="h-8 text-xs"
                  placeholder="e.g. 8 — blank to disable"
                  value={form.overflowAt ?? cfg?.overflowAt ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, overflowAt: e.target.value ? Number(e.target.value) : null }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Overflow team ID <span className="text-muted-foreground font-normal">(numeric)</span></Label>
                <Input
                  type="number" min={1}
                  className="h-8 text-xs"
                  placeholder="Team ID — blank to disable"
                  value={form.fallbackTeamId ?? cfg?.fallbackTeamId ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, fallbackTeamId: e.target.value ? Number(e.target.value) : null }))}
                />
              </div>
            </div>

            <div className="flex items-center gap-6 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch
                  id={`cap-${team.id}`}
                  checked={form.respectCapacity ?? cfg?.respectCapacity ?? true}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, respectCapacity: v }))}
                  className="scale-90"
                />
                <span className="text-xs">Respect capacity limits</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch
                  id={`shift-${team.id}`}
                  checked={form.respectShifts ?? cfg?.respectShifts ?? false}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, respectShifts: v }))}
                  className="scale-90"
                />
                <span className="text-xs">Respect shift hours</span>
              </label>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" className="h-7 text-xs gap-1" onClick={() => updateMutation.mutate(form)} disabled={updateMutation.isPending}>
                <Save className="size-3" />
                {updateMutation.isPending ? "Saving…" : "Save changes"}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => resetMutation.mutate()} disabled={resetMutation.isPending}>
                <RotateCcw className="size-3" />
                Reset to defaults
              </Button>
            </div>
          </CardContent>
        </>
      )}
    </Card>
  );
}

// ── Agent capacity row ────────────────────────────────────────────────────────

function AgentCapacityRow({ agent }: { agent: AgentProfile }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const profile = agent.capacityProfile;
  const [skillInput, setSkillInput] = useState((profile?.skills ?? []).join(", "));

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      axios.patch(`/api/routing/agents/${agent.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routing-agents"] });
      toast.success("Agent profile saved");
      setEditing(false);
    },
    onError: () => toast.error("Failed to save"),
  });

  const isAvailable = profile?.isAvailable ?? true;

  return (
    <>
      <TableRow className="group">
        <TableCell>
          <div className="flex items-center gap-2.5">
            <div className={cn(
              "size-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0",
              isAvailable ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            )}>
              {initials(agent.name)}
            </div>
            <div>
              <div className="text-sm font-medium">{agent.name}</div>
              <div className="text-[11px] text-muted-foreground">{agent.teams.map((t) => t.name).join(", ") || "—"}</div>
            </div>
          </div>
        </TableCell>

        <TableCell className="text-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => updateMutation.mutate({ isAvailable: !isAvailable })}
                disabled={updateMutation.isPending}
                className="mx-auto block"
              >
                {isAvailable
                  ? <CheckCircle2 className="size-4 text-emerald-500 hover:text-emerald-600 transition-colors" />
                  : <XCircle className="size-4 text-muted-foreground/50 hover:text-muted-foreground transition-colors" />
                }
              </button>
            </TooltipTrigger>
            <TooltipContent>{isAvailable ? "Available — click to set Away" : "Away — click to set Available"}</TooltipContent>
          </Tooltip>
        </TableCell>

        <TableCell className="min-w-32">
          <LoadBar current={agent.openTickets} max={profile?.maxConcurrentTickets ?? 10} />
        </TableCell>

        <TableCell>
          <div className="flex flex-wrap gap-1">
            {(profile?.skills ?? []).slice(0, 3).map((s) => (
              <span key={s} className="text-[10px] bg-muted px-1.5 py-0.5 rounded border">{s}</span>
            ))}
            {(profile?.skills ?? []).length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{(profile?.skills ?? []).length - 3}</span>
            )}
            {(profile?.skills ?? []).length === 0 && (
              <span className="text-[11px] text-muted-foreground/50 italic">None</span>
            )}
          </div>
        </TableCell>

        <TableCell className="text-center">
          <span className={cn(
            "text-xs font-mono px-1.5 py-0.5 rounded",
            (profile?.weight ?? 1) > 1 ? "bg-violet-500/10 text-violet-700 dark:text-violet-400" : "text-muted-foreground"
          )}>
            ×{profile?.weight ?? 1}
          </span>
        </TableCell>

        <TableCell className="text-xs text-muted-foreground">
          {profile?.shiftStart && profile?.shiftEnd
            ? <span className="flex items-center gap-1"><Clock className="size-3" />{profile.shiftStart}–{profile.shiftEnd}</span>
            : <span className="text-muted-foreground/40">—</span>}
        </TableCell>

        <TableCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditing((p) => !p)}>
                <Settings2 className="size-3.5 mr-2" />
                {editing ? "Cancel edit" : "Edit profile"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => updateMutation.mutate({ isAvailable: !isAvailable })}>
                {isAvailable ? <XCircle className="size-3.5 mr-2" /> : <CheckCircle2 className="size-3.5 mr-2" />}
                Set {isAvailable ? "Away" : "Available"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      {editing && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/20 py-4 border-b">
            <div className="grid grid-cols-3 gap-3 px-2 max-w-2xl">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Max concurrent tickets</Label>
                <Input type="number" min={1} className="h-8 text-xs" defaultValue={profile?.maxConcurrentTickets ?? 10} id={`max-${agent.id}`} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-medium">Skills <span className="text-muted-foreground font-normal">(comma-separated)</span></Label>
                <Input className="h-8 text-xs" value={skillInput} onChange={(e) => setSkillInput(e.target.value)} placeholder="e.g. billing, enterprise, vpn" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Languages <span className="text-muted-foreground font-normal">(comma-separated)</span></Label>
                <Input className="h-8 text-xs" defaultValue={(profile?.languages ?? []).join(", ")} id={`lang-${agent.id}`} placeholder="e.g. en, fr, de" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Shift hours <span className="text-muted-foreground font-normal">(local time)</span></Label>
                <div className="flex items-center gap-1">
                  <Input className="h-8 text-xs w-20" placeholder="09:00" defaultValue={profile?.shiftStart ?? ""} id={`ss-${agent.id}`} />
                  <span className="text-xs text-muted-foreground">–</span>
                  <Input className="h-8 text-xs w-20" placeholder="17:00" defaultValue={profile?.shiftEnd ?? ""} id={`se-${agent.id}`} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Weight <span className="text-muted-foreground font-normal">(1–10, weighted RR only)</span></Label>
                <Input type="number" min={1} max={10} className="h-8 text-xs" defaultValue={profile?.weight ?? 1} id={`wt-${agent.id}`} />
              </div>
              <div className="flex items-end col-span-3">
                <Button size="sm" className="h-8 text-xs gap-1.5" disabled={updateMutation.isPending}
                  onClick={() => {
                    const get = (id: string) => (document.getElementById(id) as HTMLInputElement)?.value;
                    updateMutation.mutate({
                      maxConcurrentTickets: Number(get(`max-${agent.id}`) ?? 10),
                      skills: skillInput.split(",").map((s) => s.trim()).filter(Boolean),
                      languages: (get(`lang-${agent.id}`) ?? "").split(",").map((s) => s.trim()).filter(Boolean),
                      shiftStart: get(`ss-${agent.id}`) || null,
                      shiftEnd:   get(`se-${agent.id}`) || null,
                      weight: Number(get(`wt-${agent.id}`) ?? 1),
                    });
                  }}
                >
                  <Save className="size-3" />
                  {updateMutation.isPending ? "Saving…" : "Save profile"}
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs ml-2" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RoutingConfigPage() {
  const [activeTab, setActiveTab] = useState<"teams" | "agents" | "decisions">("teams");
  const queryClient = useQueryClient();

  const configQuery = useQuery<{ autoAssignmentEnabled: boolean }>({
    queryKey: ["routing-config"],
    queryFn: async () => {
      const { data } = await axios.get("/api/routing/config");
      return data;
    },
  });

  const teamsQuery = useQuery<{ teams: TeamWithRouting[] }>({
    queryKey: ["routing-teams"],
    queryFn: async () => {
      const { data } = await axios.get("/api/routing/teams");
      return data;
    },
  });

  const agentsQuery = useQuery<{ agents: AgentProfile[] }>({
    queryKey: ["routing-agents"],
    queryFn: async () => {
      const { data } = await axios.get("/api/routing/agents");
      return data;
    },
  });

  const decisionsQuery = useQuery<{ decisions: RoutingDecision[]; total: number }>({
    queryKey: ["routing-decisions"],
    queryFn: async () => {
      const { data } = await axios.get("/api/routing/decisions?limit=50");
      return data;
    },
    enabled: activeTab === "decisions",
  });

  const toggleMutation = useMutation({
    mutationFn: (autoAssignmentEnabled: boolean) =>
      axios.patch("/api/routing/config", { autoAssignmentEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routing-config"] });
      toast.success(
        configQuery.data?.autoAssignmentEnabled
          ? "Switched to manual assignment mode"
          : "Auto-assignment re-enabled"
      );
    },
    onError: () => toast.error("Failed to update routing settings"),
  });

  const autoEnabled = configQuery.data?.autoAssignmentEnabled ?? true;
  const teams  = teamsQuery.data?.teams   ?? [];
  const agents = agentsQuery.data?.agents ?? [];

  return (
    <TooltipProvider>
    <div className="flex flex-col min-h-screen bg-muted/10">

      {/* Sticky top bar */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-3 h-12 px-6 max-w-screen-xl">
          <Button variant="ghost" size="icon" className="size-8 shrink-0" asChild>
            <Link to="/automations">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <GitFork className="size-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold leading-none">Assignment & Capacity Routing</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={cn(
              "text-xs px-2 py-0.5 rounded-full border font-medium",
              autoEnabled
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800"
            )}>
              {autoEnabled ? "Auto routing on" : "Manual mode"}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { teamsQuery.refetch(); agentsQuery.refetch(); }}
              disabled={teamsQuery.isFetching || agentsQuery.isFetching}
            >
              <RefreshCw className={cn("size-3.5 mr-1.5", (teamsQuery.isFetching || agentsQuery.isFetching) && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto w-full px-6 py-8 space-y-6">

        {/* Errors */}
        {teamsQuery.error  && <ErrorAlert error={teamsQuery.error}  fallback="Failed to load teams" />}
        {agentsQuery.error && <ErrorAlert error={agentsQuery.error} fallback="Failed to load agents" />}

        {/* Global routing toggle */}
        {configQuery.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <GlobalRoutingToggle
            autoEnabled={autoEnabled}
            onToggle={(v) => toggleMutation.mutate(v)}
            isPending={toggleMutation.isPending}
          />
        )}

        {/* Stats strip — only when both loaded */}
        {!teamsQuery.isLoading && !agentsQuery.isLoading && teams.length > 0 && agents.length > 0 && (
          <StatsStrip teams={teams} agents={agents} />
        )}

        {/* Main tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="h-9">
            <TabsTrigger value="teams" className="gap-1.5 text-xs">
              <GitFork className="size-3.5" />
              Team Strategies
              {teams.length > 0 && (
                <span className="ml-1 bg-muted text-muted-foreground text-[10px] px-1.5 rounded-full">{teams.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="agents" className="gap-1.5 text-xs">
              <Users className="size-3.5" />
              Agent Profiles
              {agents.length > 0 && (
                <span className="ml-1 bg-muted text-muted-foreground text-[10px] px-1.5 rounded-full">{agents.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="decisions" className="gap-1.5 text-xs">
              <BarChart3 className="size-3.5" />
              Decision Log
            </TabsTrigger>
          </TabsList>

          {/* ── Team strategies ───────────────────────────────────────────── */}
          <TabsContent value="teams" className="mt-5">
            {teamsQuery.isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1,2,3].map((i) => <Skeleton key={i} className="h-48" />)}
              </div>
            ) : teams.length === 0 ? (
              <div className="flex flex-col items-center py-20 text-center">
                <GitFork className="size-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No teams found</p>
                <p className="text-xs text-muted-foreground mt-1">Create teams in <a href="/settings/general" className="underline">Settings → Teams</a> first.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {teams.map((team) => (
                  <TeamRoutingCard key={team.id} team={team} autoEnabled={autoEnabled} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Agent profiles ───────────────────────────────────────────── */}
          <TabsContent value="agents" className="mt-5">
            {agentsQuery.isLoading ? (
              <div className="space-y-2">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : agents.length === 0 ? (
              <div className="flex flex-col items-center py-20 text-center">
                <Users className="size-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No agents found</p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden bg-background">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="text-xs font-semibold">Agent</TableHead>
                      <TableHead className="w-20 text-center text-xs font-semibold">Available</TableHead>
                      <TableHead className="text-xs font-semibold min-w-32">Capacity</TableHead>
                      <TableHead className="text-xs font-semibold">Skills</TableHead>
                      <TableHead className="w-16 text-center text-xs font-semibold">Weight</TableHead>
                      <TableHead className="text-xs font-semibold">Shift</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agents.map((agent) => (
                      <AgentCapacityRow key={agent.id} agent={agent} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* ── Decision log ─────────────────────────────────────────────── */}
          <TabsContent value="decisions" className="mt-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{decisionsQuery.data?.total ?? 0}</span> routing decisions logged
              </p>
              <Button variant="outline" size="sm" onClick={() => decisionsQuery.refetch()} disabled={decisionsQuery.isFetching}>
                <RefreshCw className={cn("size-3.5 mr-1.5", decisionsQuery.isFetching && "animate-spin")} />
                Refresh
              </Button>
            </div>
            {decisionsQuery.error && <ErrorAlert error={decisionsQuery.error} fallback="Failed to load decisions" />}
            {decisionsQuery.isLoading ? (
              <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : (
              <div className="rounded-lg border overflow-hidden bg-background">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="text-xs font-semibold">Ticket</TableHead>
                      <TableHead className="text-xs font-semibold">Team</TableHead>
                      <TableHead className="text-xs font-semibold">Strategy</TableHead>
                      <TableHead className="text-xs font-semibold">Assigned to</TableHead>
                      <TableHead className="text-xs font-semibold">Eligible</TableHead>
                      <TableHead className="text-xs font-semibold max-w-48">Reason</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Duration</TableHead>
                      <TableHead className="text-xs font-semibold text-right">When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(decisionsQuery.data?.decisions ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-16">
                          <BarChart3 className="size-8 text-muted-foreground/30 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">No routing decisions yet</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Decisions are logged when assign_smart or assign_round_robin actions fire.</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      (decisionsQuery.data?.decisions ?? []).map((d) => {
                        const stratCfg = STRATEGY_CONFIG[d.strategy];
                        return (
                          <TableRow key={d.id} className="group">
                            <TableCell className="text-xs font-mono text-primary">
                              <a href={`/tickets/${d.ticketId}`} className="hover:underline">#{d.ticketId}</a>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">Team {d.teamId}</TableCell>
                            <TableCell>
                              <span className={cn("inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium", stratCfg?.color ?? "bg-muted text-muted-foreground border-muted-foreground/20")}>
                                {stratCfg?.icon}
                                {stratCfg?.label ?? d.strategy}
                              </span>
                            </TableCell>
                            <TableCell>
                              {d.selectedAgentId ? (
                                <div className="flex items-center gap-1.5">
                                  <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />
                                  <span className="text-xs truncate max-w-32">{d.selectedAgentName ?? d.selectedAgentId.slice(0, 8) + "…"}</span>
                                  {d.fallbackUsed && <Badge variant="secondary" className="text-[10px] px-1">fallback</Badge>}
                                  {d.overflowUsed && <Badge variant="secondary" className="text-[10px] px-1">overflow</Badge>}
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <XCircle className="size-3 text-destructive shrink-0" />
                                  <span className="text-xs text-destructive">unassigned</span>
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums text-muted-foreground text-center">
                              {d.eligibleCount}/{d.candidateCount}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-48 truncate">{d.reason}</TableCell>
                            <TableCell className="text-xs tabular-nums text-muted-foreground text-right">{d.durationMs}ms</TableCell>
                            <TableCell className="text-xs text-muted-foreground text-right whitespace-nowrap">{relativeTime(d.createdAt)}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
    </TooltipProvider>
  );
}
