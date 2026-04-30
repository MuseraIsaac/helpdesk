import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
import { Plus, Search, Users as UsersIcon, Shield, UserCog, Headphones, UserCircle, AlertTriangle } from "lucide-react";
import { Role } from "core/constants/role.ts";
import UserForm from "./UserForm";
import UsersTable from "./UsersTable";

interface EditingUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface DeletingUser {
  id: string;
  name: string;
}

type DialogState = { mode: "create" } | { mode: "edit"; user: EditingUser } | null;

export default function UsersPage() {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [deletingUser, setDeletingUser] = useState<DeletingUser | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const queryClient = useQueryClient();

  const close = () => setDialog(null);

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data } = await axios.get<{ users: Array<{ role: string }> }>("/api/users");
      return data.users;
    },
  });

  const stats = {
    total: users?.length ?? 0,
    admins: users?.filter((u) => u.role === Role.admin).length ?? 0,
    supervisors: users?.filter((u) => u.role === Role.supervisor).length ?? 0,
    agents: users?.filter((u) => u.role === Role.agent).length ?? 0,
    customers: users?.filter((u) => u.role === Role.customer).length ?? 0,
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => axios.delete(`/api/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setDeletingUser(null);
    },
  });

  const statCards: Array<{ label: string; value: number; icon: typeof UsersIcon; tint: string; key: string }> = [
    { label: "Total",       value: stats.total,       icon: UsersIcon,    tint: "text-foreground",                          key: "all" },
    { label: "Admins",      value: stats.admins,      icon: Shield,       tint: "text-violet-600 dark:text-violet-400",     key: Role.admin },
    { label: "Supervisors", value: stats.supervisors, icon: UserCog,      tint: "text-blue-600 dark:text-blue-400",         key: Role.supervisor },
    { label: "Agents",      value: stats.agents,      icon: Headphones,   tint: "text-emerald-600 dark:text-emerald-400",   key: Role.agent },
    { label: "Customers",   value: stats.customers,   icon: UserCircle,   tint: "text-amber-600 dark:text-amber-400",       key: Role.customer },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage team members, roles, and ticket visibility.
          </p>
        </div>
        <Button onClick={() => setDialog({ mode: "create" })}>
          <Plus className="mr-2 h-4 w-4" />
          New User
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {statCards.map((s) => {
          const active = roleFilter === s.key;
          const Icon = s.icon;
          return (
            <Card
              key={s.label}
              onClick={() => setRoleFilter(s.key)}
              className={`cursor-pointer transition-all hover:shadow-sm hover:-translate-y-0.5 ${active ? "ring-2 ring-primary border-primary/40" : ""}`}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`rounded-md bg-muted/50 p-2 ${s.tint}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                  <div className="text-xl font-semibold tabular-nums leading-tight">{s.value}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search by name, email, or role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          aria-label="Search users"
        />
      </div>

      <UsersTable
        search={search}
        roleFilter={roleFilter}
        onEdit={(user) => setDialog({ mode: "edit", user })}
        onDelete={(user) => setDeletingUser(user)}
      />
      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) close(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "edit" ? "Edit User" : "Create User"}
            </DialogTitle>
          </DialogHeader>
          <UserForm
            key={dialog?.mode === "edit" ? dialog.user.id : "create"}
            user={dialog?.mode === "edit" ? dialog.user : undefined}
            onSuccess={close}
          />
        </DialogContent>
      </Dialog>
      <AlertDialog open={deletingUser !== null} onOpenChange={(open) => { if (!open) { setDeletingUser(null); deleteMutation.reset(); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete this user?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-1">
                <p>
                  You're about to delete{" "}
                  <span className="font-medium text-foreground">{deletingUser?.name}</span>.
                  This action <span className="font-medium text-destructive">cannot be undone</span>.
                </p>
                <ul className="text-xs space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <li>• Their account is permanently disabled and active sessions are revoked.</li>
                  <li>• Tickets currently assigned to them will be <span className="font-medium text-foreground">unassigned</span>.</li>
                  <li>• Their replies, notes, and audit history will be retained for compliance.</li>
                  <li>• They will be removed from all teams and groups.</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.isError && (
            <ErrorAlert message="Failed to delete user" />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingUser && deleteMutation.mutate(deletingUser.id)}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Yes, delete user
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
