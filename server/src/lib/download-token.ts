/**
 * Short-lived signed download tokens for attachment access.
 *
 * Tokens allow secure, time-limited downloads without requiring a full auth
 * session. Useful for:
 *   - Email notification links pointing to attachments
 *   - Portal embeds where a pre-signed URL pattern is needed
 *   - Admin-generated share links with expiry
 *   - Future: CDN pre-signed URL pass-through when using S3/R2
 *
 * ── Token format ───────────────────────────────────────────────────────────
 *   base64url( JSON({ id, exp, uid? }) ) + "." + base64url( HMAC-SHA256 )
 *
 *   id  — attachment ID (integer)
 *   exp — Unix timestamp (seconds) after which the token is invalid
 *   uid — optional user ID binding (if set, token is only valid for that user)
 *
 * ── Signing key ────────────────────────────────────────────────────────────
 *   Derived from BETTER_AUTH_SECRET (already required at startup).
 *   Rotate BETTER_AUTH_SECRET to invalidate all outstanding tokens.
 *   For finer control, add a dedicated DOWNLOAD_TOKEN_SECRET env var.
 *
 * ── Usage in routes ────────────────────────────────────────────────────────
 *   // Generate (e.g. in a "get download link" endpoint):
 *   const token = createDownloadToken(attachment.id, { userId: req.user.id });
 *   res.json({ url: `/api/attachments/${attachment.id}/download?token=${token}` });
 *
 *   // Verify (in the download route, as an alternative to session auth):
 *   const payload = verifyDownloadToken(req.query.token, attachmentId);
 *   if (!payload) { res.status(401).json({ error: "Invalid or expired token" }); return; }
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const ALG = "sha256";

function getSigningKey(): string {
  const key = process.env.DOWNLOAD_TOKEN_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!key) throw new Error("No signing key available for download tokens");
  return key;
}

function b64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function fromB64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payload: string): string {
  return createHmac(ALG, getSigningKey()).update(payload).digest("base64url");
}

// ── Token payload ─────────────────────────────────────────────────────────────

export interface DownloadTokenPayload {
  /** Attachment ID the token grants access to. */
  id: number;
  /** Unix timestamp (seconds) at which the token expires. */
  exp: number;
  /** If present, the token is only valid for this user ID. */
  uid?: string;
}

export interface CreateTokenOptions {
  /** How long the token is valid for, in seconds. Default: 15 minutes. */
  ttlSeconds?: number;
  /** Bind the token to a specific user ID. */
  userId?: string;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a signed download token for an attachment.
 *
 * @param attachmentId  The attachment this token grants access to.
 * @param opts          Optional ttl and user binding.
 * @returns             URL-safe token string. Include as `?token=<value>`.
 */
export function createDownloadToken(
  attachmentId: number,
  opts: CreateTokenOptions = {}
): string {
  const ttl = opts.ttlSeconds ?? 15 * 60; // 15 minutes default
  const payload: DownloadTokenPayload = {
    id: attachmentId,
    exp: Math.floor(Date.now() / 1000) + ttl,
    ...(opts.userId ? { uid: opts.userId } : {}),
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  const signature = sign(payloadB64);
  return `${payloadB64}.${signature}`;
}

/**
 * Verify a download token.
 *
 * @param token         The token string from the query parameter.
 * @param attachmentId  The attachment ID being accessed (must match token's `id`).
 * @param userId        If provided, the token's `uid` must match this value.
 * @returns             The decoded payload if valid, or `null` if invalid/expired.
 */
export function verifyDownloadToken(
  token: string | undefined,
  attachmentId: number,
  userId?: string
): DownloadTokenPayload | null {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const payloadB64 = parts[0]!;
  const incomingSig = parts[1]!;

  // Constant-time signature comparison to prevent timing attacks
  const expectedSig = sign(payloadB64);
  try {
    const a = Buffer.from(incomingSig, "base64url");
    const b = Buffer.from(expectedSig, "base64url");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  let payload: DownloadTokenPayload;
  try {
    payload = JSON.parse(fromB64url(payloadB64)) as DownloadTokenPayload;
  } catch {
    return null;
  }

  // Check expiry
  if (Math.floor(Date.now() / 1000) > payload.exp) return null;

  // Check attachment ID binding
  if (payload.id !== attachmentId) return null;

  // Check user binding if present
  if (payload.uid && userId && payload.uid !== userId) return null;

  return payload;
}
