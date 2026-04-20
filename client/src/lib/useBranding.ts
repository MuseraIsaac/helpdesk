import { useQuery } from "@tanstack/react-query";
import axios from "axios";

interface PublicBranding {
  logoDataUrl: string;
  faviconDataUrl: string;
  companyName: string;
  primaryColor: string;
}

export function useBranding() {
  return useQuery<PublicBranding>({
    queryKey: ["public-branding"],
    queryFn: async () => {
      const { data } = await axios.get<{ data: PublicBranding }>(
        "/api/settings/branding/public"
      );
      return data.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes — branding changes are infrequent
  });
}
