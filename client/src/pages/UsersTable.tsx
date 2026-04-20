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
import { Pencil, Trash2, Globe } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  globalTicketView: boolean;
  createdAt: string;
}

interface UsersTableProps {
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
}

export default function UsersTable({ onEdit, onDelete }: UsersTableProps) {
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

  return (
    <Table>
      <TableHeader>
        <TableRow>
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
          <TableHead>Actions</TableHead>
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
          : users?.map((user) => {
              const isElevated = user.role === Role.admin || user.role === Role.supervisor;
              return (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === Role.admin ? "default" : "secondary"}>
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

                  <TableCell>
                    <div className="flex items-center gap-1">
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
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
      </TableBody>
    </Table>
  );
}
