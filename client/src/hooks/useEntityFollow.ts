import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

export type WatchableEntity = "incidents" | "changes" | "requests" | "problems";

/** @deprecated Use WatchableEntity */
export type FollowableEntity = WatchableEntity;

interface WatchStatus {
  following: boolean;
  followedAt: string | null;
}

/**
 * Manages watch state for any ITSM entity (incident, change, request, problem).
 *
 * @param entityPath  The plural URL path: "incidents" | "changes" | "requests" | "problems"
 * @param entityId    The numeric entity ID. Pass 0 when not yet loaded.
 */
export function useEntityWatch(entityPath: WatchableEntity, entityId: number) {
  const queryClient = useQueryClient();
  const queryKey = ["watch", entityPath, entityId];

  const { data, isLoading } = useQuery<WatchStatus>({
    queryKey,
    queryFn: async () => {
      const { data } = await axios.get<WatchStatus>(
        `/api/${entityPath}/${entityId}/followers/me`
      );
      return data;
    },
    enabled: entityId > 0,
    staleTime: 30_000,
  });

  const toggle = useMutation({
    mutationFn: async () => {
      if (data?.following) {
        await axios.delete(`/api/${entityPath}/${entityId}/followers`);
      } else {
        await axios.post(`/api/${entityPath}/${entityId}/followers`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    watching:  data?.following ?? false,
    isLoading,
    isPending: toggle.isPending,
    toggle:    () => toggle.mutate(),
  };
}

/** @deprecated Use useEntityWatch */
export const useEntityFollow = useEntityWatch;
