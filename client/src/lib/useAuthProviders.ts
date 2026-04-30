import { useQuery } from "@tanstack/react-query";
import axios from "axios";

interface AuthProviders {
  google: boolean;
}

/**
 * Public, unauthenticated query — tells login pages whether Google sign-in
 * is currently configured so they can hide the button when it isn't.
 */
export function useAuthProviders() {
  return useQuery<AuthProviders>({
    queryKey: ["public-auth-providers"],
    queryFn: async () => {
      const { data } = await axios.get<AuthProviders>(
        "/api/settings/auth-providers/public",
      );
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}
