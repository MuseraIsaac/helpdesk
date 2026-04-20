/**
 * Bridge provider factory.
 * Returns the correct provider based on the active videoBridgeProvider setting.
 */
import type { IntegrationsSettings } from "core/schemas/settings.ts";
import { TeamsBridgeProvider }     from "./teams";
import { GoogleMeetBridgeProvider } from "./googlemeet";
import { ZoomBridgeProvider }       from "./zoom";
import { WebexBridgeProvider }      from "./webex";
import { BridgeError }              from "./types";
import type { BridgeProvider }      from "./types";

export { BridgeError };
export type { BridgeProvider, BridgeMeeting } from "./types";

export function getVideoBridgeProvider(cfg: IntegrationsSettings): BridgeProvider {
  switch (cfg.videoBridgeProvider) {
    case "teams":
      if (!cfg.teamsTenantId || !cfg.teamsClientId || !cfg.teamsClientSecret || !cfg.teamsOrganizerUserId) {
        throw new BridgeError("teams", "Incomplete Teams configuration. Tenant ID, Client ID, Client Secret, and Organizer User ID are all required.");
      }
      return new TeamsBridgeProvider(cfg.teamsTenantId, cfg.teamsClientId, cfg.teamsClientSecret, cfg.teamsOrganizerUserId);

    case "googlemeet":
      if (!cfg.googleClientId || !cfg.googleClientSecret || !cfg.googleRefreshToken) {
        throw new BridgeError("googlemeet", "Incomplete Google Meet configuration. Client ID, Client Secret, and Refresh Token are all required.");
      }
      return new GoogleMeetBridgeProvider(cfg.googleClientId, cfg.googleClientSecret, cfg.googleRefreshToken);

    case "zoom":
      if (!cfg.zoomAccountId || !cfg.zoomClientId || !cfg.zoomClientSecret) {
        throw new BridgeError("zoom", "Incomplete Zoom configuration. Account ID, Client ID, and Client Secret are all required.");
      }
      return new ZoomBridgeProvider(cfg.zoomAccountId, cfg.zoomClientId, cfg.zoomClientSecret);

    case "webex":
      if (!cfg.webexBotToken) {
        throw new BridgeError("webex", "Incomplete Webex configuration. Bot Token is required.");
      }
      return new WebexBridgeProvider(cfg.webexBotToken, cfg.webexSiteUrl);

    default:
      throw new BridgeError("none", "No video bridge provider is configured. Select a provider in Settings → Integrations.");
  }
}
