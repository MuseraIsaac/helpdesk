import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  SYSTEM_DEFAULT_ASSET_VIEW_CONFIG,
  type AssetViewConfig,
} from "core/schemas/asset-view.ts";

export interface StoredAssetView {
  id:        number;
  userId:    string;
  name:      string;
  emoji:     string | null;
  isDefault: boolean;
  isShared:  boolean;
  config:    AssetViewConfig;
  createdAt: string;
  updatedAt: string;
}

export interface AssetViewsResponse {
  personal: StoredAssetView[];
  shared:   StoredAssetView[];
}

export const ASSET_VIEWS_QUERY_KEY = ["asset-views"] as const;

export function useAssetViews() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<AssetViewsResponse>({
    queryKey: ASSET_VIEWS_QUERY_KEY,
    queryFn:  async () => (await axios.get("/api/asset-views")).data,
  });

  const allViews = useMemo<StoredAssetView[]>(() => {
    if (!data) return [];
    return [...data.personal, ...data.shared];
  }, [data]);

  const activeView = useMemo<StoredAssetView | null>(
    () => data?.personal.find(v => v.isDefault) ?? null,
    [data],
  );

  const activeConfig: AssetViewConfig = activeView?.config ?? SYSTEM_DEFAULT_ASSET_VIEW_CONFIG;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ASSET_VIEWS_QUERY_KEY });

  const saveView = useMutation({
    mutationFn: async ({
      viewId, name, emoji, config, setAsDefault,
    }: {
      viewId:       number | null;
      name:         string;
      emoji?:       string;
      config:       AssetViewConfig;
      setAsDefault?: boolean;
    }): Promise<StoredAssetView> => {
      if (viewId) {
        const { data } = await axios.put<{ view: StoredAssetView }>(
          `/api/asset-views/${viewId}`,
          { name, emoji, config },
        );
        return data.view;
      }
      const { data } = await axios.post<{ view: StoredAssetView }>(
        "/api/asset-views",
        { name, emoji, config, setAsDefault: setAsDefault ?? true },
      );
      return data.view;
    },
    onSuccess: invalidate,
  });

  const setDefaultView = useMutation({
    mutationFn: async (viewId: number | null) => {
      if (viewId === null) {
        await axios.post("/api/asset-views/clear-default");
      } else {
        await axios.post(`/api/asset-views/${viewId}/set-default`);
      }
    },
    onSuccess: invalidate,
  });

  const deleteView = useMutation({
    mutationFn: async (viewId: number) => {
      await axios.delete(`/api/asset-views/${viewId}`);
    },
    onSuccess: invalidate,
  });

  return {
    viewList: data ?? null,
    allViews,
    activeView,
    activeConfig,
    isLoading,
    saveView,
    setDefaultView,
    deleteView,
  };
}
