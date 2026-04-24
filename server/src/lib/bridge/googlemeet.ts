/**
 * Google Meet Video Bridge Provider
 *
 * Uses the Google Calendar API to create an event with a Meet link.
 * Setup in Google Cloud Console:
 *   1. Enable "Google Calendar API" for your project.
 *   2. Create an OAuth 2.0 Client ID (Web Application type).
 *   3. Obtain a Refresh Token via the OAuth Playground (oauth2.googleapis.com/token):
 *      - Scope required: https://www.googleapis.com/auth/calendar.events
 *      - Use your Client ID + Secret, then authorize and copy the refresh token.
 *   4. Paste Client ID, Client Secret, and Refresh Token into settings.
 *
 * The refresh token never expires as long as it is used at least once every
 * 6 months and the OAuth consent screen status is "Testing" or "In production".
 */
import type { BridgeProvider, BridgeMeeting } from "./types";
import { BridgeError } from "./types";
import { randomUUID } from "crypto";

interface GoogleTokenResponse {
  access_token: string;
  token_type:   string;
  expires_in:   number;
}

interface GoogleCalendarEvent {
  id: string;
  conferenceData?: {
    entryPoints?: Array<{
      entryPointType: string;
      uri: string;
      label?: string;
    }>;
    conferenceId?: string;
  };
  hangoutLink?: string;
}

export class GoogleMeetBridgeProvider implements BridgeProvider {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly refreshToken: string,
  ) {}

  private async getToken(): Promise<string> {
    const params = new URLSearchParams({
      grant_type:    "refresh_token",
      client_id:     this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
    });

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });

    if (!res.ok) {
      let body = await res.text();
      // Parse Google's JSON error response for a friendlier message
      try {
        const parsed = JSON.parse(body) as { error?: string; error_description?: string };
        if (parsed.error) {
          body = parsed.error_description
            ? `${parsed.error} — ${parsed.error_description}`
            : parsed.error;
        }
      } catch { /* leave body as-is if not JSON */ }
      throw new BridgeError("googlemeet", `Token refresh failed (HTTP ${res.status}): ${body}`);
    }

    const data = (await res.json()) as GoogleTokenResponse;
    return data.access_token;
  }

  async createMeeting(title: string): Promise<BridgeMeeting> {
    // Let the BridgeError from getToken() propagate as-is — it already contains
    // the Google error body (e.g. "invalid_grant", "invalid_client") which is
    // far more useful to the user than a generic wrapper message.
    const token = await this.getToken();

    const now     = new Date();
    const endTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);

    const body = {
      summary: title,
      start:   { dateTime: now.toISOString(), timeZone: "UTC" },
      end:     { dateTime: endTime.toISOString(), timeZone: "UTC" },
      conferenceData: {
        createRequest: {
          requestId:             randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    };

    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("conferenceDataVersion", "1");

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new BridgeError("googlemeet", `Event creation failed (${res.status}): ${errorBody}`);
    }

    const data = (await res.json()) as GoogleCalendarEvent;

    // Prefer the video entry point URI; fall back to hangoutLink
    const videoEntry = data.conferenceData?.entryPoints?.find(
      ep => ep.entryPointType === "video",
    );
    const joinUrl = videoEntry?.uri ?? data.hangoutLink ?? "";

    if (!joinUrl) {
      throw new BridgeError(
        "googlemeet",
        "Calendar event created but no Meet link was returned. Ensure the Google Calendar API and meet settings allow Meet link generation.",
      );
    }

    return {
      joinUrl,
      meetingId: data.conferenceData?.conferenceId ?? data.id,
    };
  }
}
