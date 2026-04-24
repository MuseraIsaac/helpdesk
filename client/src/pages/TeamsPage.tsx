import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createTeamSchema,
  type CreateTeamInput,
  updateTeamSchema,
  type UpdateTeamInput,
  setTeamMembersSchema,
  type SetTeamMembersInput,
} from "core/schemas/teams.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import {
  Pencil,
  Trash2,
  Users,
  Plus,
  Ticket,
  UserCheck,
  ShieldCheck,
  User,
  Mail,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { Link } from "react-router";

interface Team {
  id: number;
  name: string;
  description: string | null;
  color: string;
  email: string | null;
  ticketCount: number;
  memberCount: number;
  createdAt: string;
}

interface TeamDetail extends Team {
  members: { id: string; name: string; email: string; role: string }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// ── Team Form Dialog ──────────────────────────────────────────────────────────

interface TeamFormDialogProps {
  team?: TeamDetail | null;
  onClose: () => void;
}

function TeamFormDialog({ team, onClose }: TeamFormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(team);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CreateTeamInput>({
    resolver: zodResolver(isEdit ? updateTeamSchema : createTeamSchema),
    defaultValues: {
      name: team?.name ?? "",
      description: team?.description ?? "",
      color: team?.color ?? "#6366f1",
      email: team?.email ?? "",
    },
  });

  const watchedColor = watch("color", team?.color ?? "#6366f1");
  const watchedEmail = watch("email", team?.email ?? "");

  const mutation = useMutation({
    mutationFn: async (data: CreateTeamInput | UpdateTeamInput) => {
      if (isEdit && team) {
        const { data: res } = await axios.patch(`/api/teams/${team.id}`, data);
        return res;
      }
      const { data: res } = await axios.post("/api/teams", data);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      onClose();
    },
  });

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg shadow-sm border"
            style={{
              backgroundColor: hexToRgba(watchedColor || "#6366f1", 0.15),
              borderColor: hexToRgba(watchedColor || "#6366f1", 0.3),
            }}
          >
            <Users className="h-4 w-4" style={{ color: watchedColor || "#6366f1" }} />
          </div>
          <DialogTitle>{isEdit ? "Edit Team" : "New Team"}</DialogTitle>
        </div>
      </DialogHeader>

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4 mt-1">
        {mutation.error && (
          <ErrorAlert error={mutation.error} fallback={`Failed to ${isEdit ? "update" : "create"} team`} />
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Team Name</label>
          <Input {...register("name")} placeholder="e.g. Billing Support" className="h-9" />
          {errors.name && <ErrorMessage message={errors.name.message} />}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Description</label>
          <Textarea
            {...register("description")}
            placeholder="What does this team handle?"
            rows={2}
            className="resize-none text-sm"
          />
          {errors.description && <ErrorMessage message={errors.description.message} />}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Team Color</label>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="color"
                {...register("color")}
                className="h-9 w-9 cursor-pointer rounded-lg border p-0.5 bg-transparent"
              />
            </div>
            <Input
              {...register("color")}
              placeholder="#6366f1"
              className="h-9 font-mono text-sm flex-1"
            />
            <div
              className="h-9 w-9 rounded-lg border shrink-0"
              style={{ backgroundColor: watchedColor || "#6366f1" }}
            />
          </div>
          {errors.color && <ErrorMessage message={errors.color.message} />}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Team Email <span className="text-muted-foreground/50 font-normal">(optional)</span>
          </label>
          <div className="relative">
            <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="email"
              {...register("email")}
              placeholder="support@yourcompany.com"
              className="h-9 pl-8 text-sm"
            />
          </div>
          {errors.email && <ErrorMessage message={errors.email.message} />}
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            When set, agent replies on tickets assigned to this team are sent as{" "}
            <span className="font-mono">Agent Name &lt;team@email.com&gt;</span>.
            Two teams cannot share the same email.
          </p>
          {watchedEmail && watchedEmail !== team?.email && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2.5 mt-1">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                This email must be configured as a verified sender in SendGrid before it can be used.{" "}
                <Link
                  to="/settings?section=integrations"
                  className="underline underline-offset-2 font-medium hover:opacity-80"
                  onClick={onClose}
                >
                  Go to Integrations Settings
                  <ExternalLink className="inline h-3 w-3 ml-0.5 -mt-0.5" />
                </Link>
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Team"}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

// ── Members Dialog ────────────────────────────────────────────────────────────

interface MembersDialogProps {
  team: TeamDetail;
  onClose: () => void;
}

function MembersDialog({ team, onClose }: MembersDialogProps) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(team.members.map((m) => m.id))
  );

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: { id: string; name: string; email: string }[] }>("/api/agents");
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: SetTeamMembersInput) => {
      const { data: res } = await axios.put(`/api/teams/${team.id}/members`, data);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      onClose();
    },
  });

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const agents = agentsData?.agents ?? [];

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg border shadow-sm"
            style={{
              backgroundColor: hexToRgba(team.color, 0.15),
              borderColor: hexToRgba(team.color, 0.3),
            }}
          >
            <UserCheck className="h-4 w-4" style={{ color: team.color }} />
          </div>
          <div>
            <DialogTitle>Team Members</DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{team.name}</p>
          </div>
        </div>
      </DialogHeader>

      <p className="text-xs text-muted-foreground -mt-1">
        Members appear in the agent picker when this team is selected on a ticket.
      </p>

      {mutation.error && (
        <ErrorAlert error={mutation.error} fallback="Failed to update members" />
      )}

      <div className="space-y-1 max-h-72 overflow-y-auto -mx-1 px-1">
        {agents.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">No agents found.</p>
        )}
        {agents.map((agent) => {
          const checked = selectedIds.has(agent.id);
          return (
            <label
              key={agent.id}
              className={[
                "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors",
                checked
                  ? "bg-primary/8 border border-primary/20"
                  : "hover:bg-muted/60 border border-transparent",
              ].join(" ")}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(agent.id)}
                className="h-4 w-4 rounded accent-primary"
              />
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                style={{
                  backgroundColor: checked ? hexToRgba(team.color, 0.2) : undefined,
                  color: checked ? team.color : undefined,
                }}
              >
                {!checked && (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                    {initials(agent.name)}
                  </span>
                )}
                {checked && initials(agent.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-tight">{agent.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{agent.email}</p>
              </div>
              {checked && (
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" style={{ color: team.color }} />
              )}
            </label>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-muted-foreground">
          {selectedIds.size} of {agents.length} selected
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ memberIds: Array.from(selectedIds) })}
          >
            {mutation.isPending ? "Saving…" : "Save Members"}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

// ── Team Card ─────────────────────────────────────────────────────────────────

interface TeamCardProps {
  team: Team;
  onEdit: () => void;
  onMembers: () => void;
  onDelete: () => void;
  deleteLoading: boolean;
}

function TeamCard({ team, onEdit, onMembers, onDelete, deleteLoading }: TeamCardProps) {
  return (
    <div className="group relative rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col transition-shadow hover:shadow-md">
      {/* Colored accent bar */}
      <div className="h-1 w-full shrink-0" style={{ backgroundColor: team.color }} />

      <div className="flex flex-col flex-1 p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border shadow-sm"
              style={{
                backgroundColor: hexToRgba(team.color, 0.12),
                borderColor: hexToRgba(team.color, 0.25),
              }}
            >
              <Users className="h-4 w-4" style={{ color: team.color }} />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-tight truncate">{team.name}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Created {new Date(team.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          {/* Action buttons — always visible */}
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title="Manage members"
              onClick={onMembers}
            >
              <Users className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title="Edit team"
              onClick={onEdit}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              title="Delete team"
              disabled={deleteLoading}
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-3 flex-1">
          {team.description || (
            <span className="italic opacity-60">No description</span>
          )}
        </p>

        {/* Team email badge */}
        {team.email && (
          <div className="flex items-center gap-1.5 mb-3">
            <Mail className="h-3 w-3 shrink-0" style={{ color: team.color }} />
            <span
              className="text-[11px] font-mono truncate"
              style={{ color: team.color }}
            >
              {team.email}
            </span>
          </div>
        )}

        {/* Stats footer */}
        <div className="flex items-center gap-3 pt-3 border-t">
          {/* Member avatars */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {team.memberCount === 0 ? (
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
                <User className="h-3 w-3" />
                No members yet
              </span>
            ) : (
              <>
                <div className="flex -space-x-1.5">
                  {Array.from({ length: Math.min(team.memberCount, 4) }).map((_, i) => (
                    <div
                      key={i}
                      className="h-6 w-6 rounded-full border-2 border-card flex items-center justify-center"
                      style={{
                        backgroundColor: hexToRgba(team.color, 0.18),
                        borderColor: "var(--card)",
                      }}
                    >
                      <User className="h-3 w-3" style={{ color: team.color }} />
                    </div>
                  ))}
                  {team.memberCount > 4 && (
                    <div className="h-6 w-6 rounded-full border-2 border-card bg-muted flex items-center justify-center text-[9px] font-semibold text-muted-foreground">
                      +{team.memberCount - 4}
                    </div>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {team.memberCount} {team.memberCount === 1 ? "member" : "members"}
                </span>
              </>
            )}
          </div>

          {/* Ticket count */}
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium"
            style={{
              backgroundColor: hexToRgba(team.color, 0.1),
              color: team.color,
            }}
          >
            <Ticket className="h-3 w-3" />
            {team.ticketCount} {team.ticketCount === 1 ? "ticket" : "tickets"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TeamsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTeam, setEditTeam] = useState<TeamDetail | null>(null);
  const [membersTeam, setMembersTeam] = useState<TeamDetail | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data } = await axios.get<{ teams: Team[] }>("/api/teams");
      return data.teams;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await axios.delete(`/api/teams/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });

  async function openEdit(team: Team) {
    const { data } = await axios.get<{ team: TeamDetail }>(`/api/teams/${team.id}`);
    setEditTeam(data.team);
  }

  async function openMembers(team: Team) {
    const { data } = await axios.get<{ team: TeamDetail }>(`/api/teams/${team.id}`);
    setMembersTeam(data.team);
  }

  const teams = data ?? [];

  return (
    <div className="space-y-6">

      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-gradient-to-r from-primary/[0.06] via-primary/[0.02] to-transparent p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 shadow-sm">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight">Teams</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Group agents and route tickets to the right people
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {teams.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {teams.length} {teams.length === 1 ? "team" : "teams"}
            </span>
          )}
          <Button size="sm" className="gap-1.5 shadow-sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            New Team
          </Button>
        </div>
      </div>

      {error && <ErrorAlert message="Failed to load teams" />}

      {/* ── Loading skeleton ───────────────────────────────────────────────── */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border bg-card shadow-sm overflow-hidden animate-pulse">
              <div className="h-1 bg-muted" />
              <div className="p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-muted shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3.5 w-32 rounded bg-muted" />
                    <div className="h-2.5 w-20 rounded bg-muted" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="h-2.5 w-full rounded bg-muted" />
                  <div className="h-2.5 w-3/4 rounded bg-muted" />
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="h-5 w-24 rounded bg-muted" />
                  <div className="h-5 w-16 rounded bg-muted" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!isLoading && teams.length === 0 && (
        <div className="rounded-xl border bg-card shadow-sm p-12 flex flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-primary/30 bg-primary/5">
            <Users className="h-6 w-6 text-primary/50" />
          </div>
          <div>
            <p className="font-semibold text-sm">No teams yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Create a team to group agents and route tickets to the right people.
            </p>
          </div>
          <Button size="sm" className="gap-1.5 mt-1" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            New Team
          </Button>
        </div>
      )}

      {/* ── Team cards grid ───────────────────────────────────────────────── */}
      {!isLoading && teams.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              onEdit={() => openEdit(team)}
              onMembers={() => openMembers(team)}
              onDelete={() => {
                if (confirm(`Delete team "${team.name}"? Tickets will not be deleted.`)) {
                  deleteMutation.mutate(team.id);
                }
              }}
              deleteLoading={deleteMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* ── Dialogs ───────────────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        {createOpen && <TeamFormDialog onClose={() => setCreateOpen(false)} />}
      </Dialog>

      <Dialog open={editTeam !== null} onOpenChange={(open) => !open && setEditTeam(null)}>
        {editTeam && <TeamFormDialog team={editTeam} onClose={() => setEditTeam(null)} />}
      </Dialog>

      <Dialog open={membersTeam !== null} onOpenChange={(open) => !open && setMembersTeam(null)}>
        {membersTeam && <MembersDialog team={membersTeam} onClose={() => setMembersTeam(null)} />}
      </Dialog>
    </div>
  );
}
