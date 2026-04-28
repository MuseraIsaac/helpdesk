import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import type {
  UpdateProfileInput,
  UpdatePreferencesInput,
  ChangePasswordInput,
} from "core/schemas/preferences.ts";

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
}

export function useMe() {
  return useQuery<{ user: MeUser }>({
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
