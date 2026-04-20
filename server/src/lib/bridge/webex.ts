/**
 * Webex Video Bridge Provider
 *
 * Uses a Webex Bot Token or Personal Access Token.
 * Setup in developer.webex.com:
 *   1. Create a Bot (or use your Personal Access Token for testing).
 *   2. Copy the token into settings as "Webex Bot Token".
 *   3. Set "Webex Site URL" to your org's Webex domain (e.g. company.webex.com).
 *
 * Token type guidance:
 *   - Personal Access Token: expires in 12 h — fine for testing, not production.
 *   - Bot Token: never expires — recommended for production.
 *   - Integration (OAuth): requires user-delegated consent — not supported here.
 */
import type { BridgeProvider, BridgeMeeting } from "./types";
import { BridgeError } from "./types";

interface WebexMeetingResponse {
  id: string;
  webLink: string;
  sipAddress?: string;
}

export class WebexBridgeProvider implements BridgeProvider {
  constructor(
    private readonly botToken: string,
    private readonly siteUrl: string,
  ) {}

  async createMeeting(title: string): Promise<BridgeMeeting> {
    const now = new Date();
    const start = now.toISOString();
    const end   = new Date(now.getTime() + 60 * 60 * 1000).toISOString(); // 1-hour window

    // siteName is the subdomain portion (strip https:// and trailing slashes)
    const siteName = this.siteUrl
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .split(".")[0] ?? "";

    const body: Record<string, unknown> = {
      title,
      start,
      end,
      enabledAutoRecordMeeting: false,
      allowAnyUserToBeCoHost: true,
      enabledJoinBeforeHost: true,
      joinBeforeHostMinutes: 15,
      publicMeeting: false,
    };

    if (siteName) body.siteName = siteName;

    const res = await fetch("https://webexapis.com/v1/meetings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new BridgeError("webex", `Meeting creation failed (${res.status}): ${errorBody}`);
    }

    const data = (await res.json()) as WebexMeetingResponse;
    return {
      joinUrl:   data.webLink,
      meetingId: data.id,
    };
  }
}
