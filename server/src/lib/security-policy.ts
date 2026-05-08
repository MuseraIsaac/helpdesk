/**
 * security-policy.ts — runtime enforcement for Settings → Security.
 *
 * Centralises the "is this request allowed?" checks driven by the Security
 * settings section: password complexity, failed-login lockout, IP allowlist.
 *
 * All readers go through `getPolicy()`, which caches the security section in
 * memory for SETTINGS_TTL_MS. Admin changes propagate within seconds without
 * hammering the DB on every login attempt.
 */
import type { RequestHandler } from "express";
import { getSection } from "./settings";

// ── Cached policy ────────────────────────────────────────────────────────────

const SETTINGS_TTL_MS = 5_000;

interface CachedPolicy {
  fetchedAt: number;
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireNumber: boolean;
  passwordRequireSymbol: boolean;
  failedLoginLockoutEnabled: boolean;
  failedLoginMaxAttempts: number;
  lockoutDurationMinutes: number;
  ipAllowlistEnabled: boolean;
  ipAllowlist: string;
}

let cached: CachedPolicy | null = null;

async function getPolicy(): Promise<CachedPolicy> {
  const now = Date.now();
  if (cached && now - cached.fetchedAt < SETTINGS_TTL_MS) return cached;
  const s = await getSection("security");
  cached = {
    fetchedAt: now,
    passwordMinLength:           s.passwordMinLength           ?? 8,
    passwordRequireUppercase:    s.passwordRequireUppercase    ?? false,
    passwordRequireNumber:       s.passwordRequireNumber       ?? true,
    passwordRequireSymbol:       s.passwordRequireSymbol       ?? false,
    failedLoginLockoutEnabled:   s.failedLoginLockoutEnabled   ?? true,
    failedLoginMaxAttempts:      s.failedLoginMaxAttempts      ?? 5,
    lockoutDurationMinutes:      s.lockoutDurationMinutes      ?? 30,
    ipAllowlistEnabled:          s.ipAllowlistEnabled          ?? false,
    ipAllowlist:                 s.ipAllowlist                 ?? "",
  };
  return cached;
}

/** Force the next read to hit the DB — call after admins save the security section. */
export function invalidateSecurityPolicyCache(): void {
  cached = null;
}

// ── Password validation ──────────────────────────────────────────────────────

/**
 * Validates a plaintext password against the configured policy.
 * Returns a single human-readable error message, or `null` if the password
 * passes every active rule.
 */
export async function validatePasswordPolicy(password: string): Promise<string | null> {
  const policy = await getPolicy();
  if (typeof password !== "string") return "Password is required";
  if (password.length < policy.passwordMinLength) {
    return `Password must be at least ${policy.passwordMinLength} characters`;
  }
  if (policy.passwordRequireUppercase && !/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter";
  }
  if (policy.passwordRequireNumber && !/\d/.test(password)) {
    return "Password must contain at least one number";
  }
  // "Symbol" = anything that isn't a letter or a digit. Whitespace and
  // underscore count too — same as the OWASP recommendation.
  if (policy.passwordRequireSymbol && !/[^A-Za-z0-9]/.test(password)) {
    return "Password must contain at least one symbol";
  }
  return null;
}

// ── Failed-login lockout tracker ─────────────────────────────────────────────
//
// In-memory store keyed by lowercased email. Sufficient for single-instance
// deployments — multi-instance setups should swap this for a Redis-backed
// implementation. We deliberately don't reach into the database to track
// failures so a hostile client can't burn write IO.

interface AttemptRecord {
  count: number;
  windowStartedAt: number;   // when the current run of failures began
  lockedUntil: number | null;
}

const attempts = new Map<string, AttemptRecord>();
/** Time to look back for prior failures before resetting the counter. */
const ATTEMPT_WINDOW_MS = 60 * 60 * 1000;

function getAttemptKey(email: string | null | undefined): string | null {
  if (!email || typeof email !== "string") return null;
  return email.trim().toLowerCase() || null;
}

/** True if this email is currently locked. Resolves remaining lock duration in ms. */
export async function getLockoutState(email: string): Promise<{ locked: boolean; remainingMs: number; maxAttempts: number }> {
  const policy = await getPolicy();
  const key = getAttemptKey(email);
  if (!key || !policy.failedLoginLockoutEnabled) {
    return { locked: false, remainingMs: 0, maxAttempts: policy.failedLoginMaxAttempts };
  }
  const rec = attempts.get(key);
  if (!rec || !rec.lockedUntil) {
    return { locked: false, remainingMs: 0, maxAttempts: policy.failedLoginMaxAttempts };
  }
  const now = Date.now();
  if (rec.lockedUntil > now) {
    return { locked: true, remainingMs: rec.lockedUntil - now, maxAttempts: policy.failedLoginMaxAttempts };
  }
  // Lock expired — clear it lazily.
  attempts.delete(key);
  return { locked: false, remainingMs: 0, maxAttempts: policy.failedLoginMaxAttempts };
}

/** Record a failed sign-in. Locks the account if the threshold is reached. */
export async function recordFailedLogin(email: string): Promise<void> {
  const policy = await getPolicy();
  if (!policy.failedLoginLockoutEnabled) return;
  const key = getAttemptKey(email);
  if (!key) return;

  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.windowStartedAt > ATTEMPT_WINDOW_MS) {
    attempts.set(key, { count: 1, windowStartedAt: now, lockedUntil: null });
    return;
  }
  rec.count += 1;
  if (rec.count >= policy.failedLoginMaxAttempts) {
    rec.lockedUntil = now + policy.lockoutDurationMinutes * 60_000;
  }
}

/** Clear all tracked failures for this account — call after a successful login. */
export function recordSuccessfulLogin(email: string): void {
  const key = getAttemptKey(email);
  if (key) attempts.delete(key);
}

// ── IP allowlist ─────────────────────────────────────────────────────────────

/**
 * Parse an IPv4 dotted-quad to a 32-bit integer. Returns null on invalid input.
 * IPv6 is matched by exact-string equality only — full v6 CIDR support would
 * need a real library. Most office allowlists are v4 in practice.
 */
function parseIPv4(ip: string): number | null {
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  const parts = [m[1]!, m[2]!, m[3]!, m[4]!].map(Number);
  if (parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

interface ParsedRule {
  /** IPv4 base address as uint32, or null for v6 / invalid rules. */
  v4Base: number | null;
  /** Number of leading mask bits, 0–32 for v4. */
  v4Bits: number;
  /** Original text for IPv6 / literal-match fallback. */
  raw: string;
}

function parseRule(rule: string): ParsedRule | null {
  const trimmed = rule.trim();
  if (!trimmed) return null;
  // IPv4 CIDR or single host
  const cidrMatch = trimmed.match(/^([\d.]+)(?:\/(\d+))?$/);
  if (cidrMatch) {
    const base = parseIPv4(cidrMatch[1]!);
    if (base == null) return { v4Base: null, v4Bits: 0, raw: trimmed };
    const bits = cidrMatch[2] != null ? Math.min(32, Math.max(0, parseInt(cidrMatch[2]!, 10))) : 32;
    return { v4Base: base, v4Bits: bits, raw: trimmed };
  }
  return { v4Base: null, v4Bits: 0, raw: trimmed };
}

function ipMatches(rule: ParsedRule, ip: string): boolean {
  // Strip "::ffff:" IPv4-mapped prefix that Node emits behind some proxies.
  const cleaned = ip.replace(/^::ffff:/, "");
  if (rule.v4Base != null) {
    const ipNum = parseIPv4(cleaned);
    if (ipNum == null) return false;
    if (rule.v4Bits === 0) return true;
    const mask = rule.v4Bits === 32 ? 0xffffffff : (~((1 << (32 - rule.v4Bits)) - 1)) >>> 0;
    return (ipNum & mask) === (rule.v4Base & mask);
  }
  // IPv6 / fallback: exact-string match.
  return cleaned === rule.raw;
}

/**
 * Returns true when `clientIp` matches any of the configured rules. When the
 * allowlist is empty we treat that as "deny everyone" — the admin must add at
 * least one entry before flipping the switch on, and the UI nudges them to.
 */
export async function isIpAllowed(clientIp: string | undefined): Promise<{ enabled: boolean; allowed: boolean }> {
  const policy = await getPolicy();
  if (!policy.ipAllowlistEnabled) return { enabled: false, allowed: true };
  if (!clientIp) return { enabled: true, allowed: false };
  const rules = policy.ipAllowlist
    .split(/[\n,]/)
    .map(parseRule)
    .filter((r): r is ParsedRule => r != null);
  if (rules.length === 0) return { enabled: true, allowed: false };
  return { enabled: true, allowed: rules.some((r) => ipMatches(r, clientIp)) };
}

// ── Express middlewares ──────────────────────────────────────────────────────

/**
 * Mount before `/api/auth/*` to enforce the IP allowlist on agent sign-ins.
 * Customer portal traffic should not pass through this — the route guard
 * filters by path inside the handler.
 */
export const enforceIpAllowlist: RequestHandler = async (req, res, next) => {
  // Skip all non-sign-in auth flows so password-reset emails still work for
  // users on networks outside the office.
  if (!req.path.startsWith("/sign-in")) return next();
  const { enabled, allowed } = await isIpAllowed(req.ip);
  if (enabled && !allowed) {
    res.status(403).json({ error: "Sign-in is not allowed from this network." });
    return;
  }
  next();
};

/**
 * Mount before `/api/auth/reset-password`. Buffers the body, validates the
 * supplied newPassword against the policy, and re-streams for Better Auth.
 * Same body-buffering pattern as the lockout guard.
 */
export const enforcePasswordPolicyOnReset: RequestHandler = (req, res, next) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", async () => {
    const raw = Buffer.concat(chunks);
    let newPassword: string | null = null;
    try {
      const parsed = JSON.parse(raw.toString("utf8")) as { newPassword?: unknown };
      if (typeof parsed?.newPassword === "string") newPassword = parsed.newPassword;
    } catch { /* malformed — let Better Auth handle */ }

    if (newPassword) {
      const policyError = await validatePasswordPolicy(newPassword);
      if (policyError) {
        res.status(400).json({ error: policyError });
        return;
      }
    }

    const { Readable } = await import("stream");
    const replay = Readable.from(raw);
    type StreamMethods = Pick<typeof replay, "on" | "once" | "pipe" | "removeListener" | "addListener" | "read">;
    const proxyMethods: (keyof StreamMethods)[] = ["on", "once", "pipe", "removeListener", "addListener", "read"];
    for (const m of proxyMethods) {
      (req as unknown as Record<string, unknown>)[m] = replay[m].bind(replay) as never;
    }
    (req as unknown as Record<symbol, unknown>)[Symbol.asyncIterator] =
      replay[Symbol.asyncIterator].bind(replay);

    next();
  });
};

/**
 * Mount before `/api/auth/sign-in/email`. Rejects locked accounts up-front and
 * tracks the success/failure of the underlying Better Auth response so the
 * counter advances correctly.
 *
 * Body access: this middleware runs AFTER the global `express.json()` parser
 * (mounted in index.ts), so `req.body` is already an object. We read the
 * email from there directly — no stream-replay tricks. Earlier versions of
 * this middleware tried to re-buffer the raw stream and replay it, which
 * mostly worked on Node but fails on Bun: Bun's stricter Web-Streams
 * implementation rejects the second consumer of the constructed
 * `ReadableStream` with `ReadableStream has already been used`, surfacing
 * as a generic 500 on every sign-in. Reading `req.body` is non-destructive
 * — Better Auth's `toNodeHandler` adapter detects an already-parsed body
 * and constructs its Web Request from `req.body` rather than streaming
 * from the IncomingMessage.
 */
export const enforceLoginLockout: RequestHandler = async (req, res, next) => {
  const parsed = req.body as { email?: unknown } | undefined;
  const email  = typeof parsed?.email === "string" ? parsed.email : null;

  if (email) {
    const state = await getLockoutState(email);
    if (state.locked) {
      const minutes = Math.ceil(state.remainingMs / 60_000);
      res.status(429).json({
        error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        lockedForMinutes: minutes,
      });
      return;
    }
    res.on("finish", () => {
      // Better Auth returns 200 on success, 401/400 on bad creds.
      if (res.statusCode >= 200 && res.statusCode < 300) {
        recordSuccessfulLogin(email);
      } else if (res.statusCode === 401 || res.statusCode === 400) {
        void recordFailedLogin(email);
      }
    });
  }
  next();
};
