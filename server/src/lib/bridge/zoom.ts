/**
 * Zoom Video Bridge Provider
 *
 * Uses Zoom Server-to-Server OAuth (no user consent required).
 * Setup in the Zoom Marketplace:
 *   1. Create a "Server-to-Server OAuth" app.
 *   2. Grant scopes: meeting:write:admin, meeting:read:admin
 *   3. Copy Account ID, Client ID, Client Secret into settings.
 */
import type { BridgeProvider, BridgeMeeting } from "./types";
import { BridgeError } from "./types";

interface ZoomTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface ZoomMeetingResponse {
  id: number;
  join_url: string;
  start_url: string;
}

export class ZoomBridgeProvider implements BridgeProvider {
  constructor(
    private readonly accountId: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  private async getToken(): Promise<string> {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const res = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(this.accountId)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new BridgeError("zoom", `Token request failed (${res.status}): ${body}`);
    }
    const data = (await res.json()) as ZoomTokenResponse;
    return data.access_token;
  }

  async createMeeting(title: string): Promise<BridgeMeeting> {
    let token: string;
    try {
      token = await this.getToken();
    } catch (e) {
      throw new BridgeError("zoom", "Failed to obtain access token", e);
    }

    const body = {
      topic: title,
      type: 1, // Instant meeting
      settings: {
        join_before_host: true,
        waiting_room: false,
        auto_recording: "none",
        mute_upon_entry: false,
      },
    };

    const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new BridgeError("zoom", `Meeting creation failed (${res.status}): ${errorBody}`);
    }

    const data = (await res.json()) as ZoomMeetingResponse;
    return {
      joinUrl:   data.join_url,
      startUrl:  data.start_url,
      meetingId: String(data.id),
    };
  }
}
