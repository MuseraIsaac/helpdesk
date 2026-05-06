/**
 * Update channel — settings + signed-fetch client for the release server.
 *
 * Storage
 * ───────
 * The channel config lives in `system_setting` under the row `update_channel`.
 * That row is bypassing the typed `getSection`/`setSection` helpers because
 * it isn't part of the user-facing Settings UI sidebar — it's an
 * administrator-internal configuration.
 *
 * Provisioning
 * ────────────
 * On first boot, `ensureChannelProvisioned()` mints a per-install pair:
 *   • installId      — public identifier (UUID) sent in cleartext
 *   • installSecret  — 32-byte hex secret used as the HMAC key
 * The release server's allowlist is keyed by installId; the secret never
 * leaves this server. Together they prove the request originated from the
 * official update process running on this Helpdesk install.
 *
 * Signed fetch
 * ────────────
 * Every release-server call carries:
 *   X-Zentra-Install-Id : <installId>
 *   X-Zentra-Timestamp  : <unix ms>
 *   X-Zentra-Nonce      : <16 random bytes hex>
 *   X-Zentra-Signature  : hex(hmac-sha256(secret, "<method>\n<path>\n<ts>\n<nonce>\n<bodyHash>"))
 *
 * The release server replays the same calculation and compares. Replays
 * older than 5 minutes are rejected via the timestamp window.
 */
import crypto from "crypto";
import prisma from "../db";
import {
  updateChannelSchema,
  type UpdateChannelSettings,
  releaseManifestSchema,
  type ReleaseManifest,
} from "core/schemas/updates.ts";
import Sentry from "./sentry";

const SECTION = "update_channel";

// ── Read / write ─────────────────────────────────────────────────────────────

/** Read the update-channel settings, applying defaults to any missing fields. */
export async function getChannelConfig(): Promise<UpdateChannelSettings> {
  const row = await prisma.systemSetting.findUnique({ where: { section: SECTION } });
  return updateChannelSchema.parse(row?.data ?? {});
}

/**
 * Write a partial update. Merges over current stored value, validates, persists.
 * The `installSecret` field is treated as a credential — the routes layer
 * filters it out of any API response so it never reaches the browser.
 */
export async function setChannelConfig(
  patch: Partial<UpdateChannelSettings>,
  updatedById?: string,
): Promise<UpdateChannelSettings> {
  const existing = await getChannelConfig();
  const merged   = { ...existing, ...patch };
  const validated = updateChannelSchema.parse(merged);
  await prisma.systemSetting.upsert({
    where:  { section: SECTION },
    create: { section: SECTION, data: validated as object, updatedById: updatedById ?? null },
    update: { data: validated as object, updatedById: updatedById ?? null },
  });
  return validated;
}

// ── First-boot provisioning ──────────────────────────────────────────────────

/**
 * Mint installId on first boot if missing. The secret is NOT generated here —
 * it's issued by the release server during license enrollment and stored in
 * the same row. This keeps the helpdesk install in a clearly "unenrolled"
 * state until the customer pastes a license key.
 */
export async function ensureChannelProvisioned(): Promise<UpdateChannelSettings> {
  const cfg = await getChannelConfig();
  if (cfg.installId) return cfg;
  const next = await setChannelConfig({ installId: crypto.randomUUID() });
  console.log(`[update-channel] Provisioned installId=${next.installId} — awaiting license enrollment`);
  return next;
}

/**
 * Trade a license key for an install secret with the configured release
 * server. On success, persists the secret + license metadata atomically so
 * subsequent signed-fetch calls just work.
 *
 * The license key is single-use in the sense that it never leaves this
 * function — we don't store it. The release server records the enrollment
 * against the licenseKey row in its own database, and re-enrollment with the
 * same key (e.g. after secret regeneration) replaces the previous secret.
 */
export async function enrollWithLicense(licenseKey: string): Promise<UpdateChannelSettings> {
  const cfg = await getChannelConfig();
  if (!cfg.baseUrl) throw new Error("Set the release server URL before enrolling");
  if (!cfg.installId) {
    // Defensive: ensureChannelProvisioned should have run on boot.
    await setChannelConfig({ installId: crypto.randomUUID() });
  }

  const ready = await getChannelConfig();
  const body  = {
    licenseKey,
    installId: ready.installId,
    channel:   ready.channel,
    hostname:  process.env.HELPDESK_HOSTNAME || "",
    bundledVersion: "", // populated by callers if useful for the audit
  };

  const url = new URL("/enroll", ready.baseUrl).toString();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept":       "application/json",
        "User-Agent":   "Zentra-Helpdesk-Updater/1.0",
      },
      body:   JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Enrollment refused (HTTP ${resp.status}): ${text || resp.statusText}`);
    }
    const data = (await resp.json()) as {
      installSecret: string;
      licenseName?: string;
      licenseExpires?: string;
      channel?: string;
    };
    if (!data.installSecret) throw new Error("Release server returned no installSecret");

    const next = await setChannelConfig({
      installSecret:  data.installSecret,
      enrolled:       true,
      licenseName:    data.licenseName ?? "",
      licenseExpires: data.licenseExpires ?? "",
      enrolledAt:     new Date().toISOString(),
      lastError:      "",
    });
    return next;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Drop the secret + enrollment markers so the install behaves as unenrolled.
 * Called by the operator on the helpdesk side, e.g. before re-enrolling with
 * a different license. The release server keeps its allowlist row until the
 * operator there explicitly revokes it.
 */
export async function clearEnrollment(): Promise<UpdateChannelSettings> {
  return setChannelConfig({
    installSecret: "", enrolled: false, licenseName: "", licenseExpires: "", enrolledAt: "",
  });
}

// ── Signed fetch ─────────────────────────────────────────────────────────────

/**
 * Compute the canonical signing string and its HMAC-SHA256 hex digest.
 * Exposed for the release-server side to verify the same way.
 */
export function buildSignature(
  secret: string,
  method: string,
  pathname: string,
  timestampMs: number,
  nonce: string,
  bodyHash: string,
): string {
  const canonical = `${method.toUpperCase()}\n${pathname}\n${timestampMs}\n${nonce}\n${bodyHash}`;
  return crypto.createHmac("sha256", secret).update(canonical).digest("hex");
}

interface SignedFetchOpts {
  method?: "GET" | "POST";
  path:    string;            // e.g. "/releases/index.json"
  body?:   unknown;
  /** ms — defaults to 15 s. Release-server calls should be quick. */
  timeoutMs?: number;
}

interface SignedFetchResult<T> {
  ok:        boolean;
  status:    number;
  data:      T | null;
  errorText: string | null;
}

/**
 * Perform an HMAC-signed request to the configured release server. Returns a
 * structured result so callers can map failures to user-readable messages
 * without exception-handling boilerplate.
 *
 * Throws only if the channel is unconfigured (no baseUrl or no secret) — that
 * is a developer error, not an HTTP failure.
 */
export async function signedFetch<T>(opts: SignedFetchOpts): Promise<SignedFetchResult<T>> {
  const cfg = await getChannelConfig();
  if (!cfg.baseUrl)        throw new Error("Update channel baseUrl not configured");
  if (!cfg.installSecret)  throw new Error("Update channel install secret not provisioned");

  const method      = opts.method ?? "GET";
  const bodyText    = opts.body ? JSON.stringify(opts.body) : "";
  const bodyHash    = crypto.createHash("sha256").update(bodyText).digest("hex");
  const timestampMs = Date.now();
  const nonce       = crypto.randomBytes(16).toString("hex");
  const sig         = buildSignature(
    cfg.installSecret, method, opts.path, timestampMs, nonce, bodyHash,
  );

  const url = new URL(opts.path, cfg.baseUrl).toString();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15_000);

  try {
    const headers: Record<string, string> = {
      "X-Zentra-Install-Id": cfg.installId,
      "X-Zentra-Timestamp":  String(timestampMs),
      "X-Zentra-Nonce":      nonce,
      "X-Zentra-Signature":  sig,
      "Accept":              "application/json",
      "User-Agent":          "Zentra-Helpdesk-Updater/1.0",
    };
    if (bodyText) headers["Content-Type"] = "application/json";

    const resp = await fetch(url, {
      method,
      headers,
      body:   bodyText || undefined,
      signal: ctrl.signal,
    });

    if (!resp.ok) {
      const errorText = await resp.text().catch(() => "(unreadable body)");
      return { ok: false, status: resp.status, data: null, errorText };
    }

    const data = (await resp.json()) as T;
    return { ok: true, status: resp.status, data, errorText: null };
  } catch (err) {
    Sentry.captureException(err, { tags: { context: "update-channel" } });
    return {
      ok: false,
      status: 0,
      data: null,
      errorText: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Same authentication + replay protection as `signedFetch`, but for endpoints
 * that return binary data (the source tarball). The release server applies
 * HMAC verification uniformly to every path under `/releases/*`, so the
 * tarball download must be signed too — without this, the daemon answers
 * 401 and the orchestrator's fetch step fails.
 *
 * `expectedMaxBytes` caps the download so a buggy or malicious server can't
 * exhaust the helpdesk's disk by streaming forever; default 500 MB.
 */
export async function signedFetchBinary(opts: {
  path:               string;
  timeoutMs?:         number;
  expectedMaxBytes?:  number;
}): Promise<{ ok: boolean; status: number; body: Buffer | null; errorText: string | null }> {
  const cfg = await getChannelConfig();
  if (!cfg.baseUrl)       throw new Error("Update channel baseUrl not configured");
  if (!cfg.installSecret) throw new Error("Update channel install secret not provisioned");

  const bodyHash    = crypto.createHash("sha256").update("").digest("hex");
  const timestampMs = Date.now();
  const nonce       = crypto.randomBytes(16).toString("hex");
  const sig         = buildSignature(cfg.installSecret, "GET", opts.path, timestampMs, nonce, bodyHash);

  const url   = new URL(opts.path, cfg.baseUrl).toString();
  const ctrl  = new AbortController();
  // Tarballs can be large; allow a longer default than JSON calls.
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 5 * 60_000);

  try {
    const resp = await fetch(url, {
      method:  "GET",
      headers: {
        "X-Zentra-Install-Id": cfg.installId,
        "X-Zentra-Timestamp":  String(timestampMs),
        "X-Zentra-Nonce":      nonce,
        "X-Zentra-Signature":  sig,
        "Accept":              "application/octet-stream, application/gzip, */*",
        "User-Agent":          "Zentra-Helpdesk-Updater/1.0",
      },
      signal: ctrl.signal,
    });

    if (!resp.ok) {
      const errorText = await resp.text().catch(() => "(unreadable body)");
      return { ok: false, status: resp.status, body: null, errorText };
    }

    const arrayBuf = await resp.arrayBuffer();
    const body     = Buffer.from(arrayBuf);
    const limit    = opts.expectedMaxBytes ?? 500 * 1024 * 1024;
    if (body.byteLength > limit) {
      return { ok: false, status: resp.status, body: null,
        errorText: `Artifact body too large (${body.byteLength} > ${limit} bytes)` };
    }
    return { ok: true, status: resp.status, body, errorText: null };
  } catch (err) {
    Sentry.captureException(err, { tags: { context: "update-channel-binary" } });
    return { ok: false, status: 0, body: null,
      errorText: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

// ── Release-index helpers ────────────────────────────────────────────────────

/**
 * Shape the release-server returns at `/releases/index.json` per channel.
 * Multiple versions per channel; client picks the highest applicable one.
 */
interface ReleaseIndex {
  channel:  string;
  releases: ReleaseManifest[];
}

/** Fetch the release index and return the validated newest manifest, or null. */
export async function fetchLatestManifest(): Promise<ReleaseManifest | null> {
  const cfg = await getChannelConfig();
  const result = await signedFetch<ReleaseIndex>({
    method: "GET",
    path:   `/releases/index.json?channel=${encodeURIComponent(cfg.channel)}`,
  });
  if (!result.ok || !result.data) {
    await setChannelConfig({
      lastCheckedAt: new Date().toISOString(),
      lastError:     result.errorText ?? `HTTP ${result.status}`,
    });
    return null;
  }
  // Validate every entry; drop malformed ones rather than fail the whole check.
  const releases = result.data.releases
    .map(r => releaseManifestSchema.safeParse(r))
    .filter(p => p.success)
    .map(p => p.data);

  if (releases.length === 0) {
    await setChannelConfig({
      lastCheckedAt: new Date().toISOString(),
      lastError:     "Release index returned no valid manifests",
    });
    return null;
  }

  // Sort descending by semver — newest wins.
  releases.sort((a, b) => -compareSemver(a.version, b.version));
  await setChannelConfig({ lastCheckedAt: new Date().toISOString(), lastError: "" });
  return releases[0] ?? null;
}

function compareSemver(a: string, b: string): number {
  const parse = (s: string) => s.split("-")[0]!.split(".").map(n => Number(n) || 0);
  const [aMaj = 0, aMin = 0, aPatch = 0] = parse(a);
  const [bMaj = 0, bMin = 0, bPatch = 0] = parse(b);
  return aMaj - bMaj || aMin - bMin || aPatch - bPatch;
}
