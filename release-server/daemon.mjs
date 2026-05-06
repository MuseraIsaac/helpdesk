/**
 * Zentra release server — verify-and-serve daemon.
 *
 * Runs behind nginx (listens on 127.0.0.1:8721 by default) and answers the
 * three endpoints the helpdesk update flow uses:
 *
 *   GET /releases/index.json?channel=<channel>    → JSON
 *   GET /releases/<version>/artifact.json         → JSON { url, sha256 }
 *   GET /releases/<version>/source.tar.gz         → tarball
 *
 * Every request is HMAC-verified against the install's allowlisted secret
 * before any file is served. Unauthorised callers get HTTP 401 with no
 * detail leaked beyond a generic message.
 *
 * No external Node deps — uses only built-ins so the daemon installs cleanly
 * on a fresh box without `npm install`.
 */
import http   from "node:http";
import https from "node:https"; void https;
import fs    from "node:fs";
import path  from "node:path";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";

const HOME      = process.env.RELEASE_HOME || "/srv/zentra-releases";
const PORT      = Number(process.env.PORT) || 8721;
const TS_WINDOW = 5 * 60 * 1000;            // ±5 min replay window
const NONCE_DIR = path.join(HOME, "nonces");

// Rate-limit table for /enroll attempts — protects against brute-forcing
// license keys. Key = client IP; value = [count, windowStart].
const enrollAttempts = new Map();
const ENROLL_LIMIT  = 10;           // attempts per window
const ENROLL_WINDOW = 60 * 60_000;  // 1 hour

// ── allowlist + license caches ──────────────────────────────────────────────
const allowlistPath = path.join(HOME, "allowlist.json");
const licensesPath  = path.join(HOME, "licenses.json");

function loadJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch { return null; }
}
// Atomic JSON write. Ownership is whatever the daemon's process user is —
// the systemd unit runs as zentra-release, so writes are auto-owned correctly.
// No explicit chown needed (and we couldn't do it from a non-root process anyway).
function writeJsonAtomic(p, data) {
  const tmp = `${p}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, p);
}

let allowlist = {};
let allowlistMtime = 0;
function reloadAllowlist() {
  try {
    const stat = fs.statSync(allowlistPath);
    if (stat.mtimeMs === allowlistMtime) return;
    allowlist = loadJsonSafe(allowlistPath) ?? {};
    allowlistMtime = stat.mtimeMs;
  } catch (e) {
    console.error("[allowlist] reload failed:", e.message);
  }
}

let licenses = {};
let licensesMtime = 0;
function reloadLicenses() {
  try {
    if (!fs.existsSync(licensesPath)) {
      writeJsonAtomic(licensesPath, {});
    }
    const stat = fs.statSync(licensesPath);
    if (stat.mtimeMs === licensesMtime) return;
    licenses      = loadJsonSafe(licensesPath) ?? {};
    licensesMtime = stat.mtimeMs;
  } catch (e) {
    console.error("[licenses] reload failed:", e.message);
  }
}
reloadAllowlist();
reloadLicenses();
fs.watchFile(allowlistPath, { interval: 5_000 }, reloadAllowlist);
fs.watchFile(licensesPath,  { interval: 5_000 }, reloadLicenses);

function persistAllowlist(next) {
  allowlist = next;
  writeJsonAtomic(allowlistPath, next);
  allowlistMtime = fs.statSync(allowlistPath).mtimeMs;
}
function persistLicenses(next) {
  licenses = next;
  writeJsonAtomic(licensesPath, next);
  licensesMtime = fs.statSync(licensesPath).mtimeMs;
}

// ── HMAC verification ───────────────────────────────────────────────────────
function verifyRequest(req, bodyHash) {
  const installId = req.headers["x-zentra-install-id"];
  const ts        = Number(req.headers["x-zentra-timestamp"]);
  const nonce     = req.headers["x-zentra-nonce"];
  const sig       = req.headers["x-zentra-signature"];

  if (!installId || !ts || !nonce || !sig) return { ok: false, reason: "missing-headers" };
  if (!Number.isFinite(ts))                 return { ok: false, reason: "bad-timestamp" };
  if (Math.abs(Date.now() - ts) > TS_WINDOW) return { ok: false, reason: "timestamp-window" };

  const entry = allowlist[installId];
  if (!entry || !entry.secret) return { ok: false, reason: "unknown-install" };
  if (entry.revoked)            return { ok: false, reason: "revoked" };

  // Replay defence — single-use nonce, file-based for simplicity. The TS
  // window keeps the nonce dir bounded; a cron prunes stale ones.
  const nonceFile = path.join(NONCE_DIR, `${installId}-${nonce}`);
  try {
    fs.mkdirSync(NONCE_DIR, { recursive: true });
    fs.writeFileSync(nonceFile, String(ts), { flag: "wx" }); // wx = fail if exists
  } catch (err) {
    if (err.code === "EEXIST") return { ok: false, reason: "nonce-replay" };
    throw err;
  }

  const url       = new URL(req.url, "http://x");
  const canonical = `${req.method.toUpperCase()}\n${url.pathname}${url.search}\n${ts}\n${nonce}\n${bodyHash}`;
  const expected  = crypto.createHmac("sha256", entry.secret).update(canonical).digest("hex");
  // Constant-time compare
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) {
    return { ok: false, reason: "bad-signature" };
  }
  return { ok: true, installId, name: entry.name ?? null };
}

// ── handlers ────────────────────────────────────────────────────────────────
function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type":   typeof body === "string" ? "text/plain" : "application/json",
    "Cache-Control":  "no-store",
    ...headers,
  });
  res.end(payload);
}

async function handleIndex(req, res, parsed, identity) {
  const channel = parsed.searchParams.get("channel") || "stable";
  const file = path.join(HOME, "manifests", `${channel}.json`);
  if (!fs.existsSync(file)) return send(res, 404, { error: "channel-not-found" });
  const body = fs.readFileSync(file, "utf8");
  console.log(`[serve] index ${channel} → ${identity.installId}`);
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(body);
}

async function handleArtifactJson(req, res, parsed, identity, version) {
  const file = path.join(HOME, "artifacts", version, "artifact.json");
  if (!fs.existsSync(file)) return send(res, 404, { error: "version-not-found" });
  const body = JSON.parse(fs.readFileSync(file, "utf8"));
  // The url returned to the client is the tarball endpoint on this same server,
  // not a presigned S3 URL — so it stays HMAC-gated end-to-end.
  console.log(`[serve] artifact.json ${version} → ${identity.installId}`);
  send(res, 200, body);
}

// ── Enrollment ──────────────────────────────────────────────────────────────
//
// Public endpoint — no HMAC required (the install hasn't been issued a secret
// yet). Authenticates the *customer* via a license key issued offline by the
// operator.

function rateLimitEnroll(ip) {
  const now = Date.now();
  const entry = enrollAttempts.get(ip);
  if (!entry || now - entry[1] > ENROLL_WINDOW) {
    enrollAttempts.set(ip, [1, now]);
    return true;
  }
  entry[0]++;
  return entry[0] <= ENROLL_LIMIT;
}

const LICENSE_RE = /^ZNTR-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

async function handleEnroll(req, res, body) {
  const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0] || req.socket.remoteAddress || "unknown").trim();
  if (!rateLimitEnroll(ip)) {
    console.warn(`[enroll] rate-limited ${ip}`);
    return send(res, 429, { error: "too-many-attempts" });
  }

  let payload;
  try { payload = JSON.parse(body.toString("utf8") || "{}"); }
  catch { return send(res, 400, { error: "bad-json" }); }

  const { licenseKey, installId, channel = "stable", hostname = "" } = payload;
  if (!licenseKey || !LICENSE_RE.test(licenseKey)) return send(res, 400, { error: "bad-license-format" });
  if (!installId || typeof installId !== "string" || installId.length > 64) return send(res, 400, { error: "bad-install-id" });

  // Load fresh licenses (catches operator-side issuance without a daemon restart).
  reloadLicenses();
  const lic = licenses[licenseKey];
  if (!lic)               { console.warn(`[enroll] unknown license from ${ip}`);  return send(res, 401, { error: "license-invalid" }); }
  if (lic.revoked)        { console.warn(`[enroll] revoked license ${licenseKey}`); return send(res, 403, { error: "license-revoked" }); }
  if (lic.expires && new Date(lic.expires).getTime() < Date.now()) {
    return send(res, 403, { error: "license-expired" });
  }

  // Seat enforcement: count distinct active enrollments.
  reloadAllowlist();
  const existing = Object.entries(allowlist).filter(([id, row]) => row.licenseKey === licenseKey && !row.revoked);
  const alreadyEnrolled = existing.find(([id]) => id === installId);
  if (!alreadyEnrolled && lic.seats && existing.length >= lic.seats) {
    console.warn(`[enroll] seat limit reached for ${licenseKey} (${existing.length}/${lic.seats})`);
    return send(res, 403, { error: "seat-limit-reached", seats: lic.seats });
  }

  // Mint a fresh secret for this install (replaces any prior secret for the
  // same installId, so re-enrollment is graceful).
  const secret = crypto.randomBytes(32).toString("hex");
  const next = {
    ...allowlist,
    [installId]: {
      secret,
      name:         `${lic.customer ?? "Unnamed"} — ${hostname || "install"}`,
      licenseKey,
      channel,
      hostname,
      enrolledAt:   new Date().toISOString(),
      revoked:      false,
    },
  };
  persistAllowlist(next);

  // Update the license's enrollment counter (informational).
  const updatedLic = {
    ...lic,
    enrollments: [
      ...(lic.enrollments ?? []).filter(e => e.installId !== installId),
      { installId, hostname, enrolledAt: new Date().toISOString() },
    ],
  };
  persistLicenses({ ...licenses, [licenseKey]: updatedLic });

  console.log(`[enroll] OK installId=${installId} customer="${lic.customer ?? "?"}"`);
  send(res, 200, {
    installSecret:  secret,
    licenseName:    lic.customer ?? "",
    licenseExpires: lic.expires ?? "",
    channel:        lic.channel ?? channel,
  });
}

async function handleArtifactTarball(req, res, version) {
  const file = path.join(HOME, "artifacts", version, "source.tar.gz");
  if (!fs.existsSync(file)) return send(res, 404, "not-found");
  const stat = fs.statSync(file);
  res.writeHead(200, {
    "Content-Type":   "application/gzip",
    "Content-Length": stat.size,
    "Cache-Control":  "no-store",
  });
  await pipeline(fs.createReadStream(file), res);
}

// ── server loop ─────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // Read body for hash (we only ever expect GET, so usually empty).
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body     = Buffer.concat(chunks);
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");

  const parsed = new URL(req.url, "http://x");
  const p      = parsed.pathname;

  // Enrollment is the one endpoint that doesn't require HMAC — it's how a
  // freshly-installed helpdesk obtains its secret in the first place. The
  // license key the customer supplies is the credential. Rate-limiting +
  // license-allowlist guard against brute-force.
  if (req.method === "POST" && p === "/enroll") {
    return handleEnroll(req, res, body);
  }

  const identity = verifyRequest(req, bodyHash);
  if (!identity.ok) {
    console.warn(`[reject] ${req.method} ${req.url} :: ${identity.reason}`);
    return send(res, 401, { error: "unauthorized" });
  }

  try {
    if (req.method !== "GET") return send(res, 405, { error: "method-not-allowed" });

    if (p === "/releases/index.json") return handleIndex(req, res, parsed, identity);

    let m = p.match(/^\/releases\/([^/]+)\/artifact\.json$/);
    if (m) return handleArtifactJson(req, res, parsed, identity, m[1]);

    m = p.match(/^\/releases\/([^/]+)\/source\.tar\.gz$/);
    if (m) return handleArtifactTarball(req, res, m[1]);

    return send(res, 404, { error: "not-found" });
  } catch (err) {
    console.error("[error]", err);
    return send(res, 500, { error: "internal" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[zentra-release] listening on 127.0.0.1:${PORT}`);
  console.log(`[zentra-release] release home: ${HOME}`);
});

// Periodic nonce cleanup — drops files older than the timestamp window.
setInterval(() => {
  try {
    const cutoff = Date.now() - TS_WINDOW * 2;
    for (const f of fs.readdirSync(NONCE_DIR)) {
      const fp = path.join(NONCE_DIR, f);
      if (fs.statSync(fp).mtimeMs < cutoff) fs.unlinkSync(fp);
    }
  } catch { /* swallow */ }
}, 60_000);
