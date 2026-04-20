/** Result of creating a video bridge meeting. */
export interface BridgeMeeting {
  /** The URL attendees click to join the meeting. */
  joinUrl: string;
  /** Provider-specific meeting ID (useful for future management). */
  meetingId?: string;
  /** Host-only start URL (Zoom only). */
  startUrl?: string;
}

/** Common interface every provider must implement. */
export interface BridgeProvider {
  createMeeting(title: string): Promise<BridgeMeeting>;
}

/** Error thrown when a provider call fails, wrapping the original cause. */
export class BridgeError extends Error {
  readonly provider: string;
  override readonly cause?: unknown;

  constructor(provider: string, message: string, cause?: unknown) {
    super(`[${provider}] ${message}`);
    this.name = "BridgeError";
    this.provider = provider;
    this.cause = cause;
  }
}
