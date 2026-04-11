import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createUserSchema,
  updateUserSchema,
  assignableRoles,
  type CreateUserInput,
  type UpdateUserInput,
} from "core/schemas/users";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export default function UserForm({ user, onSuccess }: UserFormProps) {
  const isEdit = !!user;
  const queryClient = useQueryClient();

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

  return (
    <form
      onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
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
          {assignableRoles.map((r) => (
            <option key={r} value={r}>
              {r.charAt(0).toUpperCase() + r.slice(1)}
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
  );
}
