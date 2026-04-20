/**
 * Microsoft Teams Video Bridge Provider
 *
 * Uses Microsoft Graph API with an Azure AD App Registration.
 * Setup in Azure Portal → App Registrations:
 *   1. Register a new app (single-tenant or multi-tenant).
 *   2. Add API permission: Microsoft Graph → Application permission
 *      → OnlineMeetings.ReadWrite.All  (admin consent required)
 *   3. Create a Client Secret under "Certificates & secrets".
 *   4. Note: Tenant ID, Client ID, Client Secret → paste into settings.
 *   5. Organizer User ID: the UPN (email) or Object ID of the meeting organizer.
 *      The app acts ON BEHALF of this user via application permissions.
 *
 * Note on policy: Azure may require a meeting policy that allows app-created
 * meetings. Enable "Allow meeting creation via application" in Teams Admin Center
 * under Meetings → Meeting Policies.
 */
import type { BridgeProvider, BridgeMeeting } from "./types";
import { BridgeError } from "./types";

interface MsTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface MsOnlineMeeting {
  id: string;
  joinWebUrl: string;
  joinMeetingIdSettings?: { joinMeetingId: string };
}

export class TeamsBridgeProvider implements BridgeProvider {
  constructor(
    private readonly tenantId: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly organizerUserId: string,
  ) {}

  private async getToken(): Promise<string> {
    const params = new URLSearchParams({
      grant_type:    "client_credentials",
      client_id:     this.clientId,
      client_secret: this.clientSecret,
      scope:         "https://graph.microsoft.com/.default",
    });

    const res = await fetch(
      `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
      { method: "POST", body: params },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new BridgeError("teams", `Token request failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as MsTokenResponse;
    return data.access_token;
  }

  async createMeeting(title: string): Promise<BridgeMeeting> {
    let token: string;
    try {
      token = await this.getToken();
    } catch (e) {
      throw new BridgeError("teams", "Failed to obtain Microsoft access token", e);
    }

    const now     = new Date();
    const endTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // 8-hour window

    const body = {
      subject:       title,
      startDateTime: now.toISOString(),
      endDateTime:   endTime.toISOString(),
    };

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.organizerUserId)}/onlineMeetings`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const errorBody = await res.text();
      throw new BridgeError("teams", `Meeting creation failed (${res.status}): ${errorBody}`);
    }

    const data = (await res.json()) as MsOnlineMeeting;
    return {
      joinUrl:   data.joinWebUrl,
      meetingId: data.id,
    };
  }
}
