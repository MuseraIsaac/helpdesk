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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Users, Plus } from "lucide-react";

interface Team {
  id: number;
  name: string;
  description: string | null;
  color: string;
  ticketCount: number;
  memberCount: number;
  createdAt: string;
}

interface TeamDetail extends Team {
  members: { id: string; name: string; email: string; role: string }[];
}

// ── Create / Edit dialog ──────────────────────────────────────────────────────

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
    formState: { errors },
  } = useForm<CreateTeamInput>({
    resolver: zodResolver(isEdit ? updateTeamSchema : createTeamSchema),
    defaultValues: {
      name: team?.name ?? "",
      description: team?.description ?? "",
      color: team?.color ?? "#6366f1",
    },
  });

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
        <DialogTitle>{isEdit ? "Edit Team" : "New Team"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4 mt-2">
        {mutation.error && (
          <ErrorAlert error={mutation.error} fallback={`Failed to ${isEdit ? "update" : "create"} team`} />
        )}
        <div className="space-y-1">
          <label className="text-sm font-medium">Name</label>
          <Input {...register("name")} placeholder="e.g. Billing Support" />
          {errors.name && <ErrorMessage message={errors.name.message} />}
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Description</label>
          <Textarea
            {...register("description")}
            placeholder="Optional description of this team's purpose"
            rows={2}
          />
          {errors.description && <ErrorMessage message={errors.description.message} />}
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              {...register("color")}
              className="h-9 w-12 cursor-pointer rounded border p-0.5"
            />
            <Input {...register("color")} placeholder="#6366f1" className="font-mono" />
          </div>
          {errors.color && <ErrorMessage message={errors.color.message} />}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Team"}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

// ── Members dialog ────────────────────────────────────────────────────────────

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
      const { data } = await axios.get<{ agents: { id: string; name: string }[] }>("/api/agents");
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

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Members — {team.name}</DialogTitle>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">
        Select agents who belong to this team. When a ticket is assigned to this team, only these agents will appear in the agent picker.
      </p>
      {mutation.error && (
        <ErrorAlert error={mutation.error} fallback="Failed to update members" />
      )}
      <div className="mt-2 space-y-1 max-h-72 overflow-y-auto">
        {(agentsData?.agents ?? []).map((agent) => (
          <label
            key={agent.id}
            className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selectedIds.has(agent.id)}
              onChange={() => toggle(agent.id)}
              className="h-4 w-4 rounded"
            />
            <p className="text-sm font-medium">{agent.name}</p>
          </label>
        ))}
        {agentsData && agentsData.agents.length === 0 && (
          <p className="text-sm text-muted-foreground px-3 py-2">No agents found.</p>
        )}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ memberIds: Array.from(selectedIds) })}
        >
          {mutation.isPending ? "Saving..." : "Save Members"}
        </Button>
      </div>
    </DialogContent>
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage support teams. Agents assigned to a team appear in the ticket agent picker when that team is selected.
          </p>
        </div>
        <Button className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New Team
        </Button>
      </div>

      {error && <ErrorAlert message="Failed to load teams" />}

      {!isLoading && data?.length === 0 && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="font-medium">No teams yet</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Create a team to group agents and route tickets to the right people.
            </p>
            <Button variant="outline" className="mt-1 gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              New Team
            </Button>
          </CardContent>
        </Card>
      )}

      {data && data.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base">All Teams</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-center">Tickets</TableHead>
                <TableHead className="text-center">Members</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((team) => (
                <TableRow key={team.id}>
                  <TableCell>
                    <span className="inline-flex items-center gap-2 font-medium">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: team.color }}
                      />
                      {team.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {team.description ?? "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{team.ticketCount}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{team.memberCount}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Manage members"
                        onClick={() => openMembers(team)}
                      >
                        <Users className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Edit team"
                        onClick={() => openEdit(team)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title="Delete team"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (confirm(`Delete team "${team.name}"? Tickets will not be deleted.`)) {
                            deleteMutation.mutate(team.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        {createOpen && <TeamFormDialog onClose={() => setCreateOpen(false)} />}
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editTeam !== null} onOpenChange={(open) => !open && setEditTeam(null)}>
        {editTeam && (
          <TeamFormDialog team={editTeam} onClose={() => setEditTeam(null)} />
        )}
      </Dialog>

      {/* Members dialog */}
      <Dialog open={membersTeam !== null} onOpenChange={(open) => !open && setMembersTeam(null)}>
        {membersTeam && (
          <MembersDialog team={membersTeam} onClose={() => setMembersTeam(null)} />
        )}
      </Dialog>
    </div>
  );
}
