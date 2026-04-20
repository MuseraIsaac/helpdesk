import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createCabGroupSchema,
  type CreateCabGroupInput,
  updateCabGroupSchema,
  type UpdateCabGroupInput,
} from "core/schemas/cab-groups.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { Skeleton } from "@/components/ui/skeleton";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import { ShieldCheck, Plus, Pencil, Trash2, Users, UserPlus, X, ChevronDown, ChevronRight } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CabMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface CabGroup {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  memberCount: number;
  members: CabMember[];
  createdAt: string;
}

interface Agent {
  id: string;
  name: string;
  email: string;
  role: string;
}

// ── CabGroupForm ──────────────────────────────────────────────────────────────

interface CabGroupFormProps {
  group?: CabGroup;
  onSuccess: () => void;
}

function CabGroupForm({ group, onSuccess }: CabGroupFormProps) {
  const isEdit = !!group;
  const queryClient = useQueryClient();

  const form = useForm<CreateCabGroupInput>({
    resolver: zodResolver(isEdit ? (updateCabGroupSchema as any) : createCabGroupSchema),
    defaultValues: {
      name:        group?.name ?? "",
      description: group?.description ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: CreateCabGroupInput | UpdateCabGroupInput) => {
      if (isEdit) {
        const { data: res } = await axios.patch(`/api/cab-groups/${group.id}`, data);
        return res;
      }
      const { data: res } = await axios.post("/api/cab-groups", data);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cab-groups"] });
      queryClient.invalidateQueries({ queryKey: ["cab-group-default"] });
      onSuccess();
    },
  });

  return (
    <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Name <span className="text-destructive">*</span></Label>
        <Input id="name" {...form.register("name")} placeholder="e.g. Change Advisory Board" />
        {form.formState.errors.name && <ErrorMessage message={form.formState.errors.name.message} />}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" {...form.register("description")}
          placeholder="Purpose of this CAB group, meeting cadence, scope…"
          className="resize-none" rows={3} />
      </div>
      {mutation.error && (
        <ErrorAlert error={mutation.error} fallback={`Failed to ${isEdit ? "update" : "create"} CAB group`} />
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Group"}
        </Button>
      </div>
    </form>
  );
}

// ── MembersPanel ──────────────────────────────────────────────────────────────

interface MembersPanelProps {
  group: CabGroup;
}

function MembersPanel({ group }: MembersPanelProps) {
  const queryClient = useQueryClient();

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: Agent[] }>("/api/agents");
      return data.agents;
    },
  });

  const memberIds = new Set(group.members.map((m) => m.id));
  const available = (agentsData ?? []).filter((a) => !memberIds.has(a.id));

  const mutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await axios.put(`/api/cab-groups/${group.id}/members`, { memberIds: ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cab-groups"] });
      queryClient.invalidateQueries({ queryKey: ["cab-group-default"] });
    },
  });

  function addMember(userId: string) {
    mutation.mutate([...group.members.map((m) => m.id), userId]);
  }

  function removeMember(userId: string) {
    mutation.mutate(group.members.map((m) => m.id).filter((id) => id !== userId));
  }

  return (
    <div className="space-y-3">
      {/* Add member */}
      {available.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                addMember(e.target.value);
                e.target.value = "";
              }
            }}
          >
            <option value="" disabled>Add member…</option>
            {available.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.email})</option>
            ))}
          </select>
          <UserPlus className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>
      )}

      {/* Current members */}
      {group.members.length === 0 ? (
        <p className="text-sm text-muted-foreground italic text-center py-4">
          No members yet. Add agents above to make them CAB approvers.
        </p>
      ) : (
        <div className="rounded-md border divide-y">
          {group.members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{m.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{m.email}</p>
              </div>
              <Badge variant="outline" className="text-[10px] capitalize shrink-0">{m.role}</Badge>
              <button
                type="button"
                onClick={() => removeMember(m.id)}
                disabled={mutation.isPending}
                className="text-muted-foreground hover:text-destructive transition-colors"
                title="Remove from CAB"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {mutation.isError && (
        <ErrorAlert error={mutation.error} fallback="Failed to update members" />
      )}
    </div>
  );
}

// ── CabGroupCard ──────────────────────────────────────────────────────────────

interface CabGroupCardProps {
  group: CabGroup;
  isDefault: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function CabGroupCard({ group, isDefault, onEdit, onDelete }: CabGroupCardProps) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const toggleActiveMutation = useMutation({
    mutationFn: (isActive: boolean) =>
      axios.patch(`/api/cab-groups/${group.id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cab-groups"] }),
  });

  return (
    <div className={`rounded-lg border ${!group.isActive ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">{group.name}</h3>
            {isDefault && (
              <Badge className="text-[10px] h-4 px-1.5 bg-primary/10 text-primary border-primary/30">
                Default CAB
              </Badge>
            )}
            {!group.isActive && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">
                Inactive
              </Badge>
            )}
          </div>
          {group.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{group.description}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            <span>{group.memberCount} member{group.memberCount !== 1 ? "s" : ""}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Switch
            checked={group.isActive}
            onCheckedChange={(v) => toggleActiveMutation.mutate(v)}
            className="scale-75"
            title={group.isActive ? "Deactivate group" : "Activate group"}
          />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setExpanded((e) => !e)}
            title="Manage members"
          >
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5" />
              : <ChevronRight className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Members
          </p>
          <MembersPanel group={group} />
        </div>
      )}
    </div>
  );
}

// ── CabGroupsPage ─────────────────────────────────────────────────────────────

type DialogState = { mode: "create" } | { mode: "edit"; group: CabGroup } | null;

export default function CabGroupsPage() {
  const queryClient = useQueryClient();
  const [dialog, setDialog]   = useState<DialogState>(null);
  const [deleting, setDeleting] = useState<CabGroup | null>(null);

  const { data: groups = [], isLoading, error } = useQuery<CabGroup[]>({
    queryKey: ["cab-groups"],
    queryFn: async () => {
      const { data } = await axios.get<{ groups: CabGroup[] }>("/api/cab-groups");
      return data.groups;
    },
  });

  // Read current default from settings to show the badge
  const { data: defaultGroup } = useQuery({
    queryKey: ["cab-group-default"],
    queryFn: async () => {
      const { data } = await axios.get<{ group: { id: number } | null }>("/api/cab-groups/default");
      return data.group;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axios.delete(`/api/cab-groups/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cab-groups"] });
      queryClient.invalidateQueries({ queryKey: ["cab-group-default"] });
      setDeleting(null);
    },
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-semibold tracking-tight">CAB Groups</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Change Advisory Board groups. Members of the default CAB group are the only
            eligible approvers when CAB review is required for a change type.
            Configure which group is the default in{" "}
            <a href="/settings/changes" className="text-primary underline underline-offset-2">
              Settings → Changes
            </a>.
          </p>
        </div>
        <Button onClick={() => setDialog({ mode: "create" })}>
          <Plus className="mr-2 h-4 w-4" />
          New CAB Group
        </Button>
      </div>

      {/* Info banner if no groups */}
      {!isLoading && groups.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium">No CAB groups yet</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Create a CAB group, add members, then set it as the default in Settings → Changes.
          </p>
          <Button size="sm" onClick={() => setDialog({ mode: "create" })}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create first CAB group
          </Button>
        </div>
      )}

      {error && <ErrorAlert message="Failed to load CAB groups" />}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <CabGroupCard
              key={g.id}
              group={g}
              isDefault={defaultGroup?.id === g.id}
              onEdit={() => setDialog({ mode: "edit", group: g })}
              onDelete={() => setDeleting(g)}
            />
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "edit" ? "Edit CAB Group" : "New CAB Group"}
            </DialogTitle>
          </DialogHeader>
          <CabGroupForm
            key={dialog?.mode === "edit" ? dialog.group.id : "create"}
            group={dialog?.mode === "edit" ? dialog.group : undefined}
            onSuccess={() => setDialog(null)}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => { if (!open) { setDeleting(null); deleteMutation.reset(); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete CAB group?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleting?.name}</strong> and its {deleting?.memberCount} member
              {deleting?.memberCount !== 1 ? "s" : ""} will be permanently removed.
              If this is the default CAB group, the default setting will be cleared.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.isError && <ErrorAlert message="Failed to delete CAB group" />}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
