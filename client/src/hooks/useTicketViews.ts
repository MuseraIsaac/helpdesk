/**
 * useTicketViews
 *
 * Loads the user's saved ticket views and exposes the active column config.
 * Active view resolution order:
 *   1. Personal view with isDefault = true
 *   2. SYSTEM_DEFAULT_VIEW_CONFIG (built-in baseline, never stored in DB)
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  SYSTEM_DEFAULT_VIEW_CONFIG,
  type SavedViewConfig,
} from "core/schemas/ticket-view.ts";

export interface StoredView {
  id: number;
  userId: string;
  name: string;
  emoji: string | null;
  isDefault: boolean;
  isShared: boolean;
  config: SavedViewConfig;
  createdAt: string;
  updatedAt: string;
}

export interface TicketViewsResponse {
  personal: StoredView[];
  shared:   StoredView[];
}

export const TICKET_VIEWS_QUERY_KEY = ["ticket-views"] as const;

export function useTicketViews() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<TicketViewsResponse>({
    queryKey: TICKET_VIEWS_QUERY_KEY,
    queryFn: async () => (await axios.get("/api/ticket-views")).data,
  });

  const allViews = useMemo<StoredView[]>(() => {
    if (!data) return [];
    return [...data.personal, ...data.shared];
  }, [data]);

  const activeView = useMemo<StoredView | null>(() => {
    return data?.personal.find(v => v.isDefault) ?? null;
  }, [data]);

  const activeConfig: SavedViewConfig = activeView?.config ?? SYSTEM_DEFAULT_VIEW_CONFIG;

  // ── Mutations ────────────────────────────────────────────────────────────────

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: TICKET_VIEWS_QUERY_KEY });

  /** Save the config to an existing personal view or create a new one. */
  const saveView = useMutation({
    mutationFn: async ({
      viewId,
      name,
      emoji,
      config,
      setAsDefault,
    }: {
      viewId: number | null;
      name: string;
      emoji?: string;
      config: SavedViewConfig;
      setAsDefault?: boolean;
    }): Promise<StoredView> => {
      if (viewId) {
        const { data } = await axios.put<{ view: StoredView }>(
          `/api/ticket-views/${viewId}`,
          { name, emoji, config },
        );
        return data.view;
      }
      const { data } = await axios.post<{ view: StoredView }>(
        "/api/ticket-views",
        { name, emoji, config, setAsDefault: setAsDefault ?? true },
      );
      return data.view;
    },
    onSuccess: invalidate,
  });

  /** Set an owned personal view as the user's active default. */
  const setDefaultView = useMutation({
    mutationFn: async (viewId: number | null) => {
      if (viewId === null) {
        await axios.post("/api/ticket-views/clear-default");
      } else {
        await axios.post(`/api/ticket-views/${viewId}/set-default`);
      }
    },
    onSuccess: invalidate,
  });

  /** Delete a personal view. */
  const deleteView = useMutation({
    mutationFn: async (viewId: number) => {
      await axios.delete(`/api/ticket-views/${viewId}`);
    },
    onSuccess: invalidate,
  });

  return {
    /** Full response (personal + shared lists) */
    viewList: data ?? null,
    /** All views the user can access (personal + shared) */
    allViews,
    /** The personal view currently set as default, or null for system default */
    activeView,
    /** Resolved config — activeView.config or SYSTEM_DEFAULT_VIEW_CONFIG */
    activeConfig,
    isLoading,
    saveView,
    setDefaultView,
    deleteView,
  };
}
