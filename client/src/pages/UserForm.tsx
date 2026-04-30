import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createUserSchema,
  updateUserSchema,
  type CreateUserInput,
  type UpdateUserInput,
} from "core/schemas/users";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { AlertTriangle, Users as UsersIcon, X, Check } from "lucide-react";
import { Role } from "core/constants/role.ts";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";

interface TeamOption { id: number; name: string; color: string | null }

interface UserData {
  id: string;
  name: string;
  email: string;
  role?: string;
}

interface UserFormProps {
  user?: UserData;
  onSuccess: () => void;
}

interface RoleOption {
  key: string;
  name: string;
  isSystem: boolean;
}

export default function UserForm({ user, onSuccess }: UserFormProps) {
  const isEdit = !!user;
  const queryClient = useQueryClient();
  const [pendingPayload, setPendingPayload] = useState<CreateUserInput | UpdateUserInput | null>(null);

  // Fetch live role list — includes any custom roles created in the role editor.
  const { data: rolesData } = useQuery({
    queryKey: ["dict", "roles", "assignable"],
    queryFn: async () => {
      const { data } = await axios.get<{ roles: RoleOption[] }>("/api/roles");
      return data.roles.filter((r) => !r.isSystem);
    },
    staleTime: 5 * 60_000,
    gcTime:    30 * 60_000,
  });
  const assignable: RoleOption[] = rolesData ?? [
    { key: "admin",      name: "Admin",      isSystem: false },
    { key: "supervisor", name: "Supervisor", isSystem: false },
    { key: "agent",      name: "Agent",      isSystem: false },
    { key: "readonly",   name: "Read-only",  isSystem: false },
  ];

  const form = useForm<CreateUserInput | UpdateUserInput>({
    resolver: zodResolver(isEdit ? updateUserSchema : createUserSchema),
    defaultValues: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      password: "",
      role: (user?.role as CreateUserInput["role"]) ?? "agent",
    },
  });

  // ── Team membership (edit mode only, non-customers) ─────────────────────────
  const watchedRole = form.watch("role") as string | undefined;
  const supportsTeams = isEdit && watchedRole !== Role.customer;

  const { data: teamsData } = useQuery({
    queryKey: ["dict", "teams"],
    queryFn: async () => {
      const { data } = await axios.get<{ teams: TeamOption[] }>("/api/teams");
      return data.teams;
    },
    staleTime: 5 * 60_000,
    enabled: supportsTeams,
  });

  // Current memberships for this user (only fetched when editing)
  const { data: userTeamsData } = useQuery({
    queryKey: ["users", user?.id, "teams"],
    queryFn: async () => {
      const { data } = await axios.get<{ teams: TeamOption[] }>(`/api/users/${user!.id}/teams`);
      return data.teams;
    },
    enabled: !!user?.id && supportsTeams,
  });

  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<number>>(new Set());
  const [teamsTouched, setTeamsTouched] = useState(false);

  // Seed local selection from server response once.
  useEffect(() => {
    if (userTeamsData && !teamsTouched) {
      setSelectedTeamIds(new Set(userTeamsData.map((t) => t.id)));
    }
  }, [userTeamsData, teamsTouched]);

  function toggleTeam(id: number) {
    setTeamsTouched(true);
    setSelectedTeamIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const teamsMutation = useMutation({
    mutationFn: async (teamIds: number[]) => {
      const { data } = await axios.put(`/api/users/${user!.id}/teams`, { teamIds });
      return data.teams as TeamOption[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users", user!.id, "teams"] });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });

  const mutation = useMutation({
    mutationFn: async (payload: CreateUserInput | UpdateUserInput) => {
      if (isEdit) {
        const { data } = await axios.put(`/api/users/${user.id}`, payload);
        return data.user;
      }
      const { data } = await axios.post("/api/users", payload);
      return data.user;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  async function persistTeams() {
    if (!supportsTeams || !teamsTouched || !user?.id) return;
    await teamsMutation.mutateAsync([...selectedTeamIds]);
  }

  const onSubmit = async (data: CreateUserInput | UpdateUserInput) => {
    const isCustomerToInternal =
      isEdit &&
      user?.role === Role.customer &&
      data.role &&
      data.role !== Role.customer;
    if (isCustomerToInternal) {
      setPendingPayload(data);
      return;
    }
    try {
      await mutation.mutateAsync(data);
      await persistTeams();
    } catch {
      return; // mutation.error state already set; keep dialog open
    }
    form.reset();
    mutation.reset();
    onSuccess();
  };

  return (
    <>
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-4"
      autoComplete="off"
    >
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          placeholder="Full name"
          aria-invalid={!!form.formState.errors.name}
          {...form.register("name")}
        />
        {form.formState.errors.name && (
          <ErrorMessage message={form.formState.errors.name.message} />
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="user@example.com"
          autoComplete="off"
          aria-invalid={!!form.formState.errors.email}
          {...form.register("email")}
        />
        {form.formState.errors.email && (
          <ErrorMessage message={form.formState.errors.email.message} />
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder={isEdit ? "Leave blank to keep current" : "Minimum 8 characters"}
          autoComplete="new-password"
          aria-invalid={!!form.formState.errors.password}
          {...form.register("password")}
        />
        {form.formState.errors.password && (
          <ErrorMessage message={form.formState.errors.password.message} />
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        <select
          id="role"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          {...form.register("role")}
        >
          {assignable.map((r) => (
            <option key={r.key} value={r.key}>
              {r.name}
            </option>
          ))}
        </select>
        {form.formState.errors.role && (
          <ErrorMessage message={form.formState.errors.role.message} />
        )}
      </div>
      {/* ── Team membership (edit mode, internal roles only) ──────────── */}
      {supportsTeams && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5">
              <UsersIcon className="h-3.5 w-3.5 text-muted-foreground" />
              Teams
            </Label>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {selectedTeamIds.size} selected
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Assign this user to one or more teams. Tickets routed to those teams will surface for them.
          </p>
          {teamsData && teamsData.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-2">
              No teams have been created yet.
            </p>
          ) : (
            <div className="rounded-md border bg-muted/20 max-h-44 overflow-y-auto p-1">
              {(teamsData ?? []).map((t) => {
                const checked = selectedTeamIds.has(t.id);
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => toggleTeam(t.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm transition-colors ${
                      checked ? "bg-primary/10 text-foreground" : "hover:bg-muted/50"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        checked
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-input bg-background"
                      }`}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    {t.color && (
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: t.color }}
                      />
                    )}
                    <span className="truncate">{t.name}</span>
                  </button>
                );
              })}
            </div>
          )}
          {selectedTeamIds.size > 0 && teamsData && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {[...selectedTeamIds].map((id) => {
                const t = teamsData.find((x) => x.id === id);
                if (!t) return null;
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px]"
                  >
                    {t.color && (
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.color }} />
                    )}
                    {t.name}
                    <button
                      type="button"
                      onClick={() => toggleTeam(id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${t.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          {teamsMutation.error && (
            <ErrorAlert error={teamsMutation.error} fallback="Failed to update team membership" />
          )}
        </div>
      )}

      {mutation.error && (
        <ErrorAlert
          error={mutation.error}
          fallback={`Failed to ${isEdit ? "update" : "create"} user`}
        />
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending || teamsMutation.isPending}>
          {isEdit
            ? mutation.isPending || teamsMutation.isPending ? "Saving..." : "Save Changes"
            : mutation.isPending ? "Creating..." : "Create User"}
        </Button>
      </div>
    </form>
    <AlertDialog
      open={pendingPayload !== null}
      onOpenChange={(open) => { if (!open) setPendingPayload(null); }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Promote customer to internal role?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                You're about to change <span className="font-medium text-foreground">{user?.name}</span> from
                a <span className="font-medium text-foreground">customer</span> to{" "}
                <span className="font-medium text-foreground">{pendingPayload?.role}</span>.
              </p>
              <p>
                Internal roles can view and manage tickets across the helpdesk. The user will lose
                customer-portal limitations and gain access to staff-only features. Make sure this is
                intentional.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (pendingPayload) {
                mutation.mutate(pendingPayload);
                setPendingPayload(null);
              }
            }}
            className="bg-amber-600 text-white hover:bg-amber-600/90"
          >
            Yes, change role
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
