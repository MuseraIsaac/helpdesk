import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

export type FollowableEntity = "incidents" | "changes" | "requests" | "problems";

interface FollowStatus {
  following: boolean;
  followedAt: string | null;
}

/**
 * Manages follow state for any ITSM entity (incident, change, request, problem).
 *
 * @param entityPath  The plural URL path: "incidents" | "changes" | "requests" | "problems"
 * @param entityId    The numeric entity ID. Pass 0 when not yet loaded.
 */
export function useEntityFollow(entityPath: FollowableEntity, entityId: number) {
  const queryClient = useQueryClient();
  const queryKey = ["follow", entityPath, entityId];

  const { data, isLoading } = useQuery<FollowStatus>({
    queryKey,
    queryFn: async () => {
      const { data } = await axios.get<FollowStatus>(
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
    following:  data?.following ?? false,
    isLoading,
    isPending:  toggle.isPending,
    toggle:     () => toggle.mutate(),
  };
}
