/**
 * Update / release manifest schemas.
 *
 * The bundled `release.json` shipped at the repo root is validated against
 * `releaseManifestSchema` on server boot. The same shape is returned to the
 * client by `/api/updates/current` so the Settings → Updates UI can render
 * highlights, breaking changes, and required actions consistently.
 *
 * Fields are deliberately conservative — we'd rather omit a field than
 * surface unvalidated upstream data. Add keys here as the orchestrator
 * (Phase 3+) needs them.
 */
import { z } from "zod/v4";

export const releaseChannels = ["stable", "beta", "nightly"] as const;
export type ReleaseChannel = (typeof releaseChannels)[number];

/** A single semantic version string — `MAJOR.MINOR.PATCH`, optional `-prerelease`. */
export const semverSchema = z.string().regex(
  /^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$/,
  "Must be a semver string like 1.2.3 or 1.2.3-beta.1",
);

export const releaseManifestSchema = z.object({
  version:        semverSchema,
  name:           z.string().min(1).max(80).optional(),
  publishedAt:    z.iso.date().or(z.iso.datetime()).optional(),
  channel:        z.enum(releaseChannels).default("stable"),
  /** The lowest currently-installed version that can upgrade directly to this release. */
  minFromVersion: semverSchema.optional(),
  /** Names of Prisma migration directories applied in this release (informational). */
  schemaMigrations: z.array(z.string()).default([]),
  /** Names of post-migration data tasks run by the orchestrator. */
  dataTasks:        z.array(z.string()).default([]),
  /** Free-form short notes that need an admin's attention before applying. */
  breakingChanges:  z.array(z.string()).default([]),
  /** "What's new" bullets shown on the Updates page. */
  highlights:       z.array(z.string()).default([]),
  /** When true, the orchestrator (Phase 3+) will require the admin to confirm a maintenance window. */
  requiresMaintenanceWindow: z.boolean().default(false),
  estimatedDurationMinutes:  z.number().int().min(0).max(1440).default(0),
});

export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;

// ── Client-facing shapes ──────────────────────────────────────────────────────

/** Single row in the install-history table. */
export interface AppVersionRecord {
  id:          number;
  version:     string;
  kind:        "install" | "upgrade" | "downgrade" | "reinstall";
  fromVersion: string | null;
  manifest:    ReleaseManifest;
  appliedBy:   { id: string; name: string } | null;
  appliedAt:   string; // ISO
}

/** Response for GET /api/updates/current */
export interface CurrentVersionResponse {
  /** Version the server binary was built with (read from release.json). */
  bundled: ReleaseManifest;
  /** Most-recent app_version row — the "live" version. */
  installed: AppVersionRecord | null;
  /**
   * True when the binary on disk is newer than the recorded install version
   * (transition pending) — Phase 3 will surface a "Finalize installation" step.
   */
  pendingFinalize: boolean;
}

/** Response for GET /api/updates/check. */
export interface UpdateCheckResponse {
  current:        string;
  latest:         string | null;
  available:      ReleaseManifest | null;
  /** Last time the check ran successfully. */
  checkedAt:      string;
  /** "ok" — caught up. "available" — newer release found. "disabled" — auto-check off. "error" — last check failed. */
  status:         "ok" | "available" | "disabled" | "error";
  errorMessage?:  string;
}

// ── Update channel configuration (system_setting.update_channel) ──────────────

export const updateChannelSchema = z.object({
  /** Base URL of the release server (e.g. https://zentraitsm.com). */
  baseUrl:        z.url().or(z.literal("")).default(""),
  /** "stable" | "beta" | "nightly" — which channel manifest to fetch. */
  channel:        z.enum(releaseChannels).default("stable"),
  /** Auto-check schedule (cron-like preset). "off" disables polling. */
  autoCheck:      z.enum(["off", "hourly", "daily", "weekly"]).default("daily"),
  /** Per-install identifier minted at first boot — included in every signed request. */
  installId:      z.string().default(""),
  /**
   * Per-install HMAC signing secret. Issued by the release server during
   * license enrollment — the helpdesk never generates this on its own. Treated
   * as a credential, never echoed back to the UI.
   */
  installSecret:  z.string().default(""),
  /** Last time a check ran (success or failure). */
  lastCheckedAt:  z.string().default(""),
  /** Last error from a failed check. Cleared on success. */
  lastError:      z.string().default(""),
  /**
   * Has this install been enrolled with a license? When false, the only
   * release-server call permitted is the public POST /enroll endpoint.
   */
  enrolled:       z.boolean().default(false),
  /** Display label returned by the release server (e.g. "Acme Corp — 5 seats"). */
  licenseName:    z.string().default(""),
  /** ISO date the license expires, or "" for no expiry. Returned by the server. */
  licenseExpires: z.string().default(""),
  /** ISO timestamp of successful enrollment. */
  enrolledAt:     z.string().default(""),
});

export type UpdateChannelSettings = z.infer<typeof updateChannelSchema>;

// ── License-key enrollment ────────────────────────────────────────────────────

/** Customer-facing license format: ZNTR-XXXX-XXXX-XXXX-XXXX (Crockford base32). */
export const licenseKeySchema = z.string()
  .regex(/^ZNTR-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/,
         "Format: ZNTR-XXXX-XXXX-XXXX-XXXX");

export const enrollLicenseSchema = z.object({
  licenseKey: licenseKeySchema,
});

export type EnrollLicenseBody = z.infer<typeof enrollLicenseSchema>;

/** Response from POST /enroll on the release server. */
export interface EnrollResponse {
  installSecret:  string;
  licenseName:    string;
  licenseExpires: string;   // ISO or ""
  channel:        ReleaseChannel;
}

// ── Orchestrator state machine ────────────────────────────────────────────────

export const updateRunStates = [
  "queued",
  "preflight",
  "backup",
  "maintenance_on",
  "fetch",
  "verify",
  "migrate",
  "data_tasks",
  "restart_required",
  "done",
  "failed",
  "cancelled",
  "rolling_back",
  "rolled_back",
] as const;

export type UpdateRunState = (typeof updateRunStates)[number];

export const TERMINAL_STATES: readonly UpdateRunState[] = [
  "done", "failed", "cancelled", "rolled_back",
];

export interface UpdateRunRecord {
  id:              number;
  fromVersion:     string;
  toVersion:       string;
  manifest:        ReleaseManifest;
  state:           UpdateRunState;
  currentStep:     string | null;
  errorMessage:    string | null;
  errorStep:       string | null;
  backupPath:      string | null;
  triggeredBy:     { id: string; name: string } | null;
  createdAt:       string;
  startedAt:       string | null;
  finishedAt:      string | null;
  rolledBackAt:    string | null;
  rollbackOfId:    number | null;
}

export interface UpdateRunEventRecord {
  id:        number;
  level:     "info" | "warn" | "error";
  step:      string | null;
  message:   string;
  data:      Record<string, unknown> | null;
  createdAt: string;
}

/** Body for POST /api/updates/apply */
export const applyUpdateSchema = z.object({
  /** The exact version string the admin is consenting to install. Server verifies it matches the latest available. */
  toVersion:           z.string().min(1).max(40),
  /** When true, skips the maintenance-window check (admin override). */
  skipMaintenanceWindow: z.boolean().default(false),
});

export type ApplyUpdateBody = z.infer<typeof applyUpdateSchema>;
