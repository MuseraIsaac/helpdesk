/**
 * DutyPlanPage — Shift Scheduling hub.
 *
 * Shows all teams with their current/upcoming duty plans.
 * Admins can manage roles (grant manager/mandate) per team.
 * Plan managers/mandated agents can create & edit plans.
 * All agents can view published plans for their teams.
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router";
import axios from "axios";
import {
  CalendarDays, Plus, Users, Shield, ArrowRight, Clock,
  CheckCircle2, FileEdit, Archive, ChevronRight, ArrowLeft,
  Settings2, AlertTriangle, Loader2, MoreHorizontal,
  UserCheck, ShieldCheck, Unlock, Search, Building2,
  Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card, CardContent, CardHeader,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import ErrorAlert from "@/components/ErrorAlert";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DutyPlan {
  id: number;
  teamId: number;
  title: string;
  periodStart: string;
  periodEnd: string;
  is24x7: boolean;
  status: "draft" | "published" | "archived";
  notes: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
  team: { id: number; name: string; color: string };
  _count: { assignments: number };
}

interface DutyPlanRole {
  id: number;
  teamId: number;
  roleType: "manager" | "mandated";
  user: { id: string; name: string; email: string };
  team: { id: number; name: string; color: string };
  grantedBy: { id: string; name: string } | null;
  createdAt: string;
}

interface Team {
  id: number;
  name: string;
  color: string;
  _count?: { members: number };
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function planPeriodLabel(plan: DutyPlan) {
  const s = relativeDate(plan.periodStart);
  const e = relativeDate(plan.periodEnd);
  return `${s} – ${e}`;
}

const STATUS_CONFIG = {
  draft:     { label: "Draft",     class: "bg-muted text-muted-foreground border-muted-foreground/20" },
  published: { label: "Published", class: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300/50" },
  archived:  { label: "Archived",  class: "bg-slate-500/10 text-slate-500 border-slate-300/30" },
};

// ── Grant Role Dialog ─────────────────────────────────────────────────────────

function GrantRoleDialog({
  teamId,
  teamName,
  existingRoles,
  onClose,
}: {
  teamId: number;
  teamName: string;
  /** All duty-plan roles currently assigned to this team — shown above the
   *  grant form so admins can revoke and reassign in one place. */
  existingRoles: DutyPlanRole[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState("");
  const [roleType, setRoleType] = useState<"manager" | "mandated">("manager");
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const { data: membersData } = useQuery({
    queryKey: ["team-members", teamId],
    queryFn: async () => {
      const { data } = await axios.get<{ members: TeamMember[] }>(
        `/api/teams/${teamId}/members`
      );
      return data;
    },
  });
  const members = membersData?.members ?? [];

  const grantMutation = useMutation({
    mutationFn: () => axios.post("/api/duty-plans/roles", { teamId, userId, roleType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["duty-plan-roles"] });
      toast.success("Role granted");
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Failed to grant role"),
  });

  // Revoke is per-row — a single dialog handles many roles, so we track
  // which row is in flight via revokingId so only its button shows the
  // spinner.
  const revokeMutation = useMutation({
    mutationFn: (roleId: number) => axios.delete(`/api/duty-plans/roles/${roleId}`),
    onMutate: (roleId) => { setRevokingId(roleId); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["duty-plan-roles"] });
      toast.success("Role revoked");
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Failed to revoke role"),
    onSettled: () => { setRevokingId(null); },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Shield className="size-4 text-primary" />
            Manage Duty Plan Roles
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Team: {teamName}</p>
        </DialogHeader>

        <div className="space-y-4 py-2">

          {/* ── Existing roles + per-row revoke ──────────────────────── */}
          {existingRoles.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Current roles</label>
              <div className="rounded-lg border divide-y bg-muted/20">
                {existingRoles.map((r) => {
                  const isRevoking = revokeMutation.isPending && revokingId === r.id;
                  return (
                    <div key={r.id} className="flex items-center gap-2 px-2.5 py-2">
                      <span
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-md border shrink-0",
                          r.roleType === "manager"
                            ? "bg-primary/10 border-primary/25 text-primary"
                            : "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
                        )}
                      >
                        {r.roleType === "manager"
                          ? <ShieldCheck className="size-3.5" />
                          : <UserCheck className="size-3.5" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{r.user.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          <span className="capitalize">{r.roleType}</span>
                          {r.user.email && <> · {r.user.email}</>}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive shrink-0"
                        title={`Revoke ${r.roleType} role from ${r.user.name}`}
                        disabled={isRevoking}
                        onClick={() => {
                          if (window.confirm(`Revoke ${r.roleType} role from ${r.user.name}?`)) {
                            revokeMutation.mutate(r.id);
                          }
                        }}
                      >
                        {isRevoking
                          ? <Loader2 className="size-3.5 animate-spin" />
                          : <Trash2 className="size-3.5" />}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Grant new role ──────────────────────────────────────── */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">
              {existingRoles.length > 0 ? "Grant another role" : "Team member"}
            </label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select agent…" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <div>
                      <div className="font-medium">{m.name}</div>
                      <div className="text-xs text-muted-foreground">{m.email}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Role</label>
            <div className="grid grid-cols-2 gap-2">
              {(["manager", "mandated"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleType(r)}
                  className={cn(
                    "rounded-lg border p-3 text-left text-xs transition-all",
                    roleType === r
                      ? "border-primary bg-primary/8 text-primary"
                      : "border-muted hover:border-muted-foreground/30"
                  )}
                >
                  <div className="font-semibold capitalize mb-0.5">{r}</div>
                  <div className="text-[10px] text-muted-foreground leading-snug">
                    {r === "manager" ? "Full control + can grant mandate" : "Can create/edit plans only"}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <Button
            className="w-full gap-1.5"
            onClick={() => grantMutation.mutate()}
            disabled={!userId || grantMutation.isPending}
          >
            {grantMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
            Grant role
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Team Duty Card ────────────────────────────────────────────────────────────

function TeamDutyCard({
  team,
  plans,
  roles,
  myRole,
  isAdmin,
  onGrantRole,
}: {
  team: Team;
  plans: DutyPlan[];
  roles: DutyPlanRole[];
  myRole?: "manager" | "mandated" | null;
  isAdmin: boolean;
  onGrantRole: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const teamPlans = plans
    .filter((p) => p.teamId === team.id)
    .sort((a, b) => new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime());

  const activePlan = teamPlans.find((p) => p.status === "published");
  const draftPlan  = teamPlans.find((p) => p.status === "draft");
  const teamRoles  = roles.filter((r) => r.teamId === team.id);
  const canManage  = isAdmin || myRole === "manager" || myRole === "mandated";

  const archiveMutation = useMutation({
    mutationFn: (id: number) => axios.post(`/api/duty-plans/${id}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["duty-plans"] });
      toast.success("Plan archived");
    },
  });

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow group">
      <div className="h-1 w-full" style={{ backgroundColor: team.color }} />
      <CardHeader className="pb-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="size-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ backgroundColor: team.color }}
            >
              {team.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">{team.name}</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                {teamRoles.map((r) => (
                  <span key={r.id} className="text-[10px] flex items-center gap-0.5 text-muted-foreground">
                    {r.roleType === "manager"
                      ? <ShieldCheck className="size-2.5 text-primary/70" />
                      : <UserCheck className="size-2.5 text-amber-500/70" />
                    }
                    {r.user.name}
                  </span>
                ))}
                {teamRoles.length === 0 && (
                  <span className="text-[10px] text-muted-foreground/50">No planner assigned</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => navigate(`/duty-plans/${team.id}`)}
              >
                <CalendarDays className="size-3" />
                Manage
              </Button>
            )}
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7 opacity-0 group-hover:opacity-100">
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onGrantRole}>
                    <Shield className="size-3.5 mr-2" /> Grant role
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/duty-plans/${team.id}`)}>
                    <CalendarDays className="size-3.5 mr-2" /> View plans
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 pb-4 space-y-2">
        {activePlan ? (
          <div
            className="rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-500/5 px-3 py-2.5 cursor-pointer hover:bg-emerald-500/10 transition-colors"
            onClick={() => navigate(`/duty-plans/${team.id}/${activePlan.id}`)}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                <span className="text-xs font-medium truncate">{activePlan.title}</span>
              </div>
              <ChevronRight className="size-3.5 text-muted-foreground/50 shrink-0" />
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5 ml-5">
              {planPeriodLabel(activePlan)} · {activePlan._count.assignments} assignments
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed px-3 py-2.5 text-center">
            <p className="text-xs text-muted-foreground">No active plan</p>
          </div>
        )}

        {draftPlan && (
          <div
            className="rounded-lg border bg-muted/30 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => navigate(`/duty-plans/${team.id}/${draftPlan.id}`)}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileEdit className="size-3 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground truncate">{draftPlan.title}</span>
                <Badge variant="secondary" className="text-[9px] px-1 h-3.5">Draft</Badge>
              </div>
              <ChevronRight className="size-3 text-muted-foreground/30 shrink-0" />
            </div>
          </div>
        )}

        {canManage && !draftPlan && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs text-muted-foreground gap-1 border border-dashed hover:border-primary/30 hover:text-primary"
            onClick={() => navigate(`/duty-plans/${team.id}/new`)}
          >
            <Plus className="size-3" />
            Create plan
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DutyPlanPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin" || session?.user?.role === "supervisor";
  const [grantTarget, setGrantTarget] = useState<{ id: number; name: string } | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"teams" | "roles">("teams");

  const plansQuery = useQuery({
    queryKey: ["duty-plans"],
    queryFn: async () => {
      const { data } = await axios.get<{ plans: DutyPlan[] }>("/api/duty-plans");
      return data;
    },
  });

  const rolesQuery = useQuery({
    queryKey: ["duty-plan-roles"],
    queryFn: async () => {
      const { data } = await axios.get<{ roles: DutyPlanRole[] }>("/api/duty-plans/roles");
      return data;
    },
  });

  const teamsQuery = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data } = await axios.get<{ teams: Team[] }>("/api/teams");
      return data;
    },
  });

  const queryClient = useQueryClient();

  const revokeRoleMutation = useMutation({
    mutationFn: (id: number) => axios.delete(`/api/duty-plans/roles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["duty-plan-roles"] });
      toast.success("Role revoked");
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Failed"),
  });

  const plans  = plansQuery.data?.plans  ?? [];
  const roles  = rolesQuery.data?.roles  ?? [];
  const teams  = teamsQuery.data?.teams  ?? [];

  const filteredTeams = useMemo(() => {
    if (!search) return teams;
    const q = search.toLowerCase();
    return teams.filter((t) => t.name.toLowerCase().includes(q));
  }, [teams, search]);

  // My roles by teamId
  const myRoleMap = useMemo(() => {
    const m = new Map<number, "manager" | "mandated">();
    roles.forEach((r) => {
      if (r.user.id === session?.user?.id) m.set(r.teamId, r.roleType);
    });
    return m;
  }, [roles, session?.user?.id]);

  const activePlans  = plans.filter((p) => p.status === "published").length;
  const draftPlans   = plans.filter((p) => p.status === "draft").length;
  const totalPlanners = roles.length;

  return (
    <div className="flex flex-col min-h-screen bg-muted/10">
      {grantTarget && (
        <GrantRoleDialog
          teamId={grantTarget.id}
          teamName={grantTarget.name}
          existingRoles={roles.filter((r) => r.teamId === grantTarget.id)}
          onClose={() => setGrantTarget(null)}
        />
      )}

      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-3 h-12 px-6 max-w-screen-xl">
          <CalendarDays className="size-4 text-muted-foreground shrink-0" />
          <h1 className="text-sm font-semibold">Duty Plans</h1>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <div className="relative hidden sm:block">
              <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search teams…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 w-48 text-xs"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto w-full px-6 py-8 space-y-6">

        {/* Error states */}
        {plansQuery.error && <ErrorAlert error={plansQuery.error} fallback="Failed to load plans" />}

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Teams",           value: teams.length,   icon: <Building2 className="size-4 text-primary" /> },
            { label: "Active plans",    value: activePlans,    icon: <CheckCircle2 className="size-4 text-emerald-500" /> },
            { label: "Draft plans",     value: draftPlans,     icon: <FileEdit className="size-4 text-amber-500" /> },
            { label: "Planners",        value: totalPlanners,  icon: <ShieldCheck className="size-4 text-violet-500" /> },
          ].map((s) => (
            <Card key={s.label} className="bg-background">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  {s.icon}
                </div>
                <div className="text-2xl font-bold tabular-nums">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="h-9">
            <TabsTrigger value="teams" className="text-xs gap-1.5">
              <Users className="size-3.5" />
              Teams
              {teams.length > 0 && (
                <span className="ml-1 bg-muted text-muted-foreground text-[10px] px-1.5 rounded-full">{filteredTeams.length}</span>
              )}
            </TabsTrigger>
            {(isAdmin || roles.some((r) => r.user.id === session?.user?.id && r.roleType === "manager")) && (
              <TabsTrigger value="roles" className="text-xs gap-1.5">
                <Shield className="size-3.5" />
                Planners & Roles
                {roles.length > 0 && (
                  <span className="ml-1 bg-muted text-muted-foreground text-[10px] px-1.5 rounded-full">{roles.length}</span>
                )}
              </TabsTrigger>
            )}
          </TabsList>

          {/* Teams tab */}
          <TabsContent value="teams" className="mt-6">
            {teamsQuery.isLoading || plansQuery.isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1,2,3,4].map((i) => <Skeleton key={i} className="h-48" />)}
              </div>
            ) : filteredTeams.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <Building2 className="size-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No teams found</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredTeams.map((team) => (
                  <TeamDutyCard
                    key={team.id}
                    team={team}
                    plans={plans}
                    roles={roles}
                    myRole={myRoleMap.get(team.id) ?? null}
                    isAdmin={isAdmin}
                    onGrantRole={() => setGrantTarget({ id: team.id, name: team.name })}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Roles tab */}
          <TabsContent value="roles" className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{roles.length}</span> planner role{roles.length !== 1 ? "s" : ""} configured
              </p>
            </div>
            {rolesQuery.isLoading ? (
              <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : roles.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <Shield className="size-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No planner roles assigned</p>
                {isAdmin && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Click the ⋯ menu on a team card to grant a role.
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden bg-background">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 text-left font-medium">Agent</th>
                      <th className="px-4 py-2.5 text-left font-medium">Team</th>
                      <th className="px-4 py-2.5 text-left font-medium">Role</th>
                      <th className="px-4 py-2.5 text-left font-medium">Granted by</th>
                      <th className="px-4 py-2.5 text-right font-medium">Since</th>
                      <th className="w-10 px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {roles.map((r) => (
                      <tr key={r.id} className="group hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium">{r.user.name}</div>
                          <div className="text-xs text-muted-foreground">{r.user.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="size-3 rounded-full shrink-0" style={{ backgroundColor: r.team.color }} />
                            <span className="text-sm">{r.team.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium",
                            r.roleType === "manager"
                              ? "bg-primary/10 text-primary border-primary/20"
                              : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300/40"
                          )}>
                            {r.roleType === "manager" ? <ShieldCheck className="size-2.5" /> : <UserCheck className="size-2.5" />}
                            {r.roleType === "manager" ? "Manager" : "Mandated"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {r.grantedBy?.name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                          {new Date(r.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          {(isAdmin || (r.roleType === "mandated" && myRoleMap.get(r.teamId) === "manager")) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-7 opacity-0 group-hover:opacity-100">
                                  <MoreHorizontal className="size-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => revokeRoleMutation.mutate(r.id)}
                                >
                                  <Unlock className="size-3.5 mr-2" />
                                  Revoke role
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
