import { useState } from "react";
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
import { AlertTriangle } from "lucide-react";
import { Role } from "core/constants/role.ts";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";

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
    queryKey: ["roles-assignable"],
    queryFn: async () => {
      const { data } = await axios.get<{ roles: RoleOption[] }>("/api/roles");
      return data.roles.filter((r) => !r.isSystem);
    },
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
      form.reset();
      mutation.reset();
      onSuccess();
    },
  });

  const onSubmit = (data: CreateUserInput | UpdateUserInput) => {
    const isCustomerToInternal =
      isEdit &&
      user?.role === Role.customer &&
      data.role &&
      data.role !== Role.customer;
    if (isCustomerToInternal) {
      setPendingPayload(data);
      return;
    }
    mutation.mutate(data);
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
      {mutation.error && (
        <ErrorAlert
          error={mutation.error}
          fallback={`Failed to ${isEdit ? "update" : "create"} user`}
        />
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          {isEdit
            ? mutation.isPending ? "Saving..." : "Save Changes"
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
