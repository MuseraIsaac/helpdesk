/**
 * useDashboardConfig
 *
 * Loads the user's saved dashboards and exposes the active config.
 * Provides mutations for saving, setting default, and deleting dashboards.
 *
 * Active config resolution order:
 *   1. Dashboard pointed to by defaultDashboardId (personal or shared)
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
  isShared: boolean;
  config: DashboardConfigData;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardsResponse {
  personal: StoredDashboard[];
  shared: StoredDashboard[];
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
    return [...data.personal, ...data.shared];
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
      config,
    }: {
      dashboardId: number | null;
      name: string;
      config: DashboardConfigData;
    }): Promise<StoredDashboard> => {
      if (dashboardId) {
        const { data } = await axios.put<{ dashboard: StoredDashboard }>(
          `/api/dashboards/${dashboardId}`,
          { name, config },
        );
        return data.dashboard;
      }
      // Creating new — always set as default so the user immediately sees it
      const { data } = await axios.post<{ dashboard: StoredDashboard }>(
        "/api/dashboards",
        { name, config, setAsDefault: true },
      );
      return data.dashboard;
    },
    onSuccess: invalidate,
  });

  /** Set any accessible dashboard (personal or shared) as the user's active default. */
  const setDefaultDashboard = useMutation({
    mutationFn: async (dashboardId: number | null) => {
      if (dashboardId === null) {
        // Revert to built-in system default
        await axios.patch("/api/me/preferences", { defaultDashboard: "overview" });
      } else {
        await axios.post(`/api/dashboards/${dashboardId}/set-default`);
      }
    },
    onSuccess: invalidate,
  });

  /** Delete a personal dashboard. */
  const deleteDashboard = useMutation({
    mutationFn: async (dashboardId: number) => {
      await axios.delete(`/api/dashboards/${dashboardId}`);
    },
    onSuccess: invalidate,
  });

  return {
    /** Full response (personal + shared lists + defaultDashboardId) */
    dashboardList: data ?? null,
    /** All dashboards the user can access (personal + shared) */
    allDashboards,
    /** The dashboard currently set as their default, or null for system default */
    activeDashboard,
    /** Resolved config — activeDashboard.config or SYSTEM_DEFAULT_CONFIG */
    activeConfig,
    isLoading,
    saveDashboard,
    setDefaultDashboard,
    deleteDashboard,
  };
}
