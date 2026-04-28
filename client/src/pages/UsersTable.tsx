import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Role } from "core/constants/role.ts";
import ErrorAlert from "@/components/ErrorAlert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, Trash2, Globe, Inbox } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  globalTicketView: boolean;
  createdAt: string;
}

interface UsersTableProps {
  search?: string;
  roleFilter?: string;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
}

const roleBadgeVariant = (role: Role): "default" | "secondary" | "outline" | "destructive" => {
  if (role === Role.admin) return "default";
  if (role === Role.supervisor) return "default";
  if (role === Role.customer) return "outline";
  return "secondary";
};

const roleBadgeClass = (role: Role): string => {
  if (role === Role.admin) return "bg-violet-600 hover:bg-violet-600/90 text-white border-transparent";
  if (role === Role.supervisor) return "bg-blue-600 hover:bg-blue-600/90 text-white border-transparent";
  if (role === Role.agent) return "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 border-transparent";
  if (role === Role.customer) return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent";
  return "";
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

export default function UsersTable({ search = "", roleFilter = "all", onEdit, onDelete }: UsersTableProps) {
  const queryClient = useQueryClient();

  const { data: users, isLoading, error } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data } = await axios.get<{ users: User[] }>("/api/users");
      return data.users;
    },
  });

  const globalViewMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { data } = await axios.patch(`/api/users/${id}/global-view`, { globalTicketView: value });
      return data.user as User;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<User[]>(["users"], (prev) =>
        prev?.map((u) => (u.id === updated.id ? updated : u)) ?? prev
      );
    },
  });

  if (error) return <ErrorAlert message="Failed to fetch users" />;

  const q = search.trim().toLowerCase();
  const filtered = (users ?? []).filter((u) => {
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  const hasResults = isLoading || filtered.length > 0;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>
            <span className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              Global Ticket View
            </span>
          </TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="text-right pr-6">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 6 }).map((__, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                ))}
              </TableRow>
            ))
          : filtered.map((user) => {
              const isElevated = user.role === Role.admin || user.role === Role.supervisor;
              return (
                <TableRow key={user.id} className="group">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-primary/5 text-xs font-semibold text-primary ring-1 ring-border">
                        {initials(user.name) || "?"}
                      </div>
                      <span>{user.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={roleBadgeVariant(user.role)} className={roleBadgeClass(user.role)}>
                      {user.role}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    {isElevated ? (
                      <span
                        className="text-xs text-muted-foreground italic"
                        title="Admins and supervisors always see all tickets."
                      >
                        Always on
                      </span>
                    ) : (
                      <div
                        className="flex items-center gap-2"
                        title={
                          user.globalTicketView
                            ? `${user.name} can see all tickets across all teams.`
                            : `${user.name} only sees tickets in their assigned teams (when team-scoped visibility is enabled).`
                        }
                      >
                        <Switch
                          checked={user.globalTicketView}
                          onCheckedChange={(v) =>
                            globalViewMutation.mutate({ id: user.id, value: v })
                          }
                          disabled={globalViewMutation.isPending}
                          className="scale-90"
                          aria-label={`Global view for ${user.name}`}
                        />
                        {user.globalTicketView && (
                          <span className="text-xs text-primary font-medium">Global</span>
                        )}
                      </div>
                    )}
                  </TableCell>

                  <TableCell className="text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </TableCell>

                  <TableCell className="pr-6">
                    <div className="flex items-center justify-end gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(user)}
                        aria-label={`Edit ${user.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {user.role !== Role.admin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(user)}
                          aria-label={`Delete ${user.name}`}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
        {!isLoading && !hasResults && (
          <TableRow>
            <TableCell colSpan={6} className="py-12">
              <div className="flex flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <Inbox className="h-8 w-8 opacity-50" />
                <p className="text-sm">
                  {q || roleFilter !== "all"
                    ? "No users match your search."
                    : "No users yet."}
                </p>
              </div>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
    </div>
  );
}
