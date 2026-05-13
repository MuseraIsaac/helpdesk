import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import type {
  UpdateProfileInput,
  UpdatePreferencesInput,
  ChangePasswordInput,
} from "core/schemas/preferences.ts";
import { setRolePermissions, type Permission } from "core/constants/permission.ts";

export interface UserPreference {
  jobTitle: string | null;
  phone: string | null;
  signature: string | null;
  language: string;
  timezone: string;
  dateFormat: string;
  timeFormat: "12h" | "24h";
  theme: "light" | "dark" | "system";
  sidebarCollapsed: boolean;
  defaultDashboard: string;
  ticketListDensity: "comfortable" | "compact";
  updatedAt: string;
}

export interface MeUser {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  preference: UserPreference | null;
  /**
   * Server-computed effective permissions for the current user's role.
   * Reflects any admin edits to the role definition since boot, so the
   * client UI gates (sidebar, route guards, button visibility) stay in
   * sync with what the API will actually authorise.
   */
  permissions: Permission[];
}

export function useMe() {
  const query = useQuery<{ user: MeUser }>({
    queryKey: ["me"],
    queryFn: async () => {
      const { data } = await axios.get("/api/me");
      return data;
    },
    // The /api/me payload changes only when the user updates their profile,
    // preferences, or an admin changes their role. All of those code paths
    // invalidate the "me" query directly, so caching aggressively here
    // prevents redundant fetches on every page mount.
    staleTime: 5 * 60 * 1000,
  });

  // Hydrate the in-memory ROLE_PERMISSIONS map with the server's effective
  // permission list whenever /api/me resolves. Without this, the client
  // permanently uses BUILTIN_ROLE_PERMISSIONS (the seeds from
  // permission.ts), so admin edits in Roles & Permissions never visibly
  // affect the sidebar / route gates / button gates for live sessions.
  const role  = query.data?.user?.role;
  const perms = query.data?.user?.permissions;
  useEffect(() => {
    if (role && perms) {
      setRolePermissions({ [role]: perms });
    }
  }, [role, perms]);

  return query;
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateProfileInput) => {
      await axios.patch("/api/me/profile", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdatePreferencesInput) => {
      await axios.patch("/api/me/preferences", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (body: ChangePasswordInput) => {
      await axios.patch("/api/me/password", body);
    },
  });
}
