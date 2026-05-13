/** A phone / SIP dial-in option associated with a bridge meeting. */
export interface BridgeDialIn {
  /** Display label, e.g. "+1 317-947-5097" or "Tel-Meet PIN". */
  label: string;
  /** Dial URI — `tel:+...` for PSTN, `sip:...` for SIP, https for Tel-Meet. */
  uri: string;
  /** PIN to enter after dialling, if the provider supplies one. */
  pin?: string;
  /** ISO country code, when known (e.g. "US"). */
  regionCode?: string;
}

/** Result of creating a video bridge meeting. */
export interface BridgeMeeting {
  /** The URL attendees click to join the meeting. */
  joinUrl: string;
  /** Provider-specific meeting ID (useful for future management). */
  meetingId?: string;
  /** Numeric/text passcode some providers (Teams, Zoom) attach to the meeting. */
  passcode?: string;
  /** Host-only start URL (Zoom only). */
  startUrl?: string;
  /** Email of the user the meeting was created under (when available). */
  organizerEmail?: string;
  /** PSTN / SIP dial-in entries. Empty array if the provider has none. */
  dialIn?: BridgeDialIn[];
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
