import { useQuery } from "@tanstack/react-query";
import axios from "axios";

/** Fallback favicon served from the static asset directory. */
export const STATIC_FAVICON_URL = "/favicon.png";
/** Default logo — falls back to the static asset when no custom logo is uploaded. */
export const STATIC_LOGO_URL    = "/logo.png";

interface PublicBranding {
  logoDataUrl:          string;
  faviconDataUrl:       string;
  companyName:          string;
  platformSubtitle:     string;
  primaryColor:         string;
  companyWebsite:       string;
  portalAccentColor:    string;
  portalLoginHeadline:  string;
  portalLoginHighlight: string;
  portalLoginTagline:   string;
  portalLoginBadge:     string;
  agentLoginPanelColor: string;
  agentLoginHeadline:   string;
  agentLoginHighlight:  string;
  agentLoginTagline:    string;
  agentLoginBadge:      string;
  // Service desk contacts
  serviceDeskEmail:     string;
  serviceDeskPhone:     string;
  serviceDeskHours:     string;
  emergencyContact:     string;
  serviceDeskLocation:  string;
}

export function useBranding() {
  return useQuery<PublicBranding>({
    queryKey: ["public-branding"],
    queryFn: async () => {
      const { data } = await axios.get<{ data: PublicBranding }>(
        "/api/settings/branding/public"
      );
      return {
        ...data.data,
        // Use custom favicon if set, otherwise fall back to the static asset.
        faviconDataUrl: data.data.faviconDataUrl || STATIC_FAVICON_URL,
        logoDataUrl:    data.data.logoDataUrl    || STATIC_LOGO_URL,
        platformSubtitle: data.data.platformSubtitle || "Service Desk",
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
