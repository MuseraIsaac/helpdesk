/**
 * useDashboardConfig
 *
 * Loads the user's saved dashboards and exposes the active config.
 * Provides mutations for saving, setting default, deleting, and cloning dashboards.
 *
 * Active config resolution order:
 *   1. Dashboard pointed to by defaultDashboardId (personal, team-visible, or shared)
 *   2. SYSTEM_DEFAULT_CONFIG (built-in baseline, never stored in DB)
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  SYSTEM_DEFAULT_CONFIG,
  type DashboardConfigData,
} from "core/schemas/dashboard.ts";

export interface StoredDashboard {
  id: number;
  userId: string | null;
  name: string;
  description: string | null;
  isShared: boolean;
  visibilityTeamId: number | null;
  sourceId: number | null;
  config: DashboardConfigData;
  createdAt: string;
  updatedAt: string;
  visibilityTeam: { id: number; name: string; color: string } | null;
}

export interface DashboardsResponse {
  personal: StoredDashboard[];
  shared: StoredDashboard[];
  teamVisible: StoredDashboard[];
  defaultDashboardId: number | null;
}

export const DASHBOARDS_QUERY_KEY = ["dashboards"] as const;

export function useDashboardConfig() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<DashboardsResponse>({
    queryKey: DASHBOARDS_QUERY_KEY,
    queryFn: async () => (await axios.get("/api/dashboards")).data,
  });

  const allDashboards = useMemo<StoredDashboard[]>(() => {
    if (!data) return [];
    // Deduplicate: a user's own personal dashboard that also has visibilityTeamId
    // appears in `personal` only; teamVisible excludes the user's own records.
    return [...data.personal, ...data.teamVisible, ...data.shared];
  }, [data]);

  const activeDashboard = useMemo<StoredDashboard | null>(() => {
    if (!data?.defaultDashboardId) return null;
    return allDashboards.find(d => d.id === data.defaultDashboardId) ?? null;
  }, [data, allDashboards]);

  const activeConfig: DashboardConfigData = activeDashboard?.config ?? SYSTEM_DEFAULT_CONFIG;

  // ── Mutations ────────────────────────────────────────────────────────────────

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: DASHBOARDS_QUERY_KEY });

  /** Save the config to an existing personal dashboard or create a new one. */
  const saveDashboard = useMutation({
    mutationFn: async ({
      dashboardId,
      name,
      description,
      config,
      isShared,
      visibilityTeamId,
    }: {
      dashboardId: number | null;
      name: string;
      description?: string | null;
      config: DashboardConfigData;
      isShared?: boolean;
      visibilityTeamId?: number | null;
    }): Promise<StoredDashboard> => {
      if (dashboardId) {
        const { data } = await axios.put<{ dashboard: StoredDashboard }>(
          `/api/dashboards/${dashboardId}`,
          { name, description, config, isShared, visibilityTeamId },
        );
        return data.dashboard;
      }
      // Creating new — always set as default so the user immediately sees it
      const { data } = await axios.post<{ dashboard: StoredDashboard }>(
        "/api/dashboards",
        { name, description, config, setAsDefault: true, isShared: isShared ?? false, visibilityTeamId },
      );
      return data.dashboard;
    },
    onSuccess: invalidate,
  });

  /** Set any accessible dashboard (personal, team, or shared) as the user's active default. */
  const setDefaultDashboard = useMutation({
    mutationFn: async (dashboardId: number | null) => {
      if (dashboardId === null) {
        await axios.patch("/api/me/preferences", { defaultDashboard: "overview" });
      } else {
        await axios.post(`/api/dashboards/${dashboardId}/set-default`);
      }
    },
    onSuccess: invalidate,
  });

  /** Delete a personal dashboard (admins can delete any). */
  const deleteDashboard = useMutation({
    mutationFn: async (dashboardId: number) => {
      await axios.delete(`/api/dashboards/${dashboardId}`);
    },
    onSuccess: invalidate,
  });

  /** Clone any accessible dashboard into a new personal copy. */
  const cloneDashboard = useMutation({
    mutationFn: async ({
      dashboardId,
      name,
      setAsDefault = false,
    }: {
      dashboardId: number;
      name?: string;
      setAsDefault?: boolean;
    }): Promise<StoredDashboard> => {
      const { data } = await axios.post<{ dashboard: StoredDashboard }>(
        `/api/dashboards/${dashboardId}/clone`,
        { name, setAsDefault },
      );
      return data.dashboard;
    },
    onSuccess: invalidate,
  });

  return {
    /** Full response (personal + teamVisible + shared lists + defaultDashboardId) */
    dashboardList: data ?? null,
    /** All dashboards the user can access (personal + team-visible + shared) */
    allDashboards,
    /** The dashboard currently set as their default, or null for system default */
    activeDashboard,
    /** Resolved config — activeDashboard.config or SYSTEM_DEFAULT_CONFIG */
    activeConfig,
    isLoading,
    saveDashboard,
    setDefaultDashboard,
    deleteDashboard,
    cloneDashboard,
  };
}
