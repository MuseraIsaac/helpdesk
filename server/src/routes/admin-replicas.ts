/**
 * Admin Replica Scaling — `/api/admin/replicas`
 *
 * Lets an admin scale the systemd template `${SERVICE_PREFIX}@<port>.service`
 * between 1 and `MAX_REPLICAS` instances live from the Settings → Infrastructure
 * UI. Mirrors the privileged-helper pattern used by the update orchestrator's
 * finalize step (see `scripts/zentra-finalize-update.sh`):
 *
 *   • A non-root server process runs an allow-listed sudo command
 *   • The helper validates its single arg, then enables/disables units
 *   • The route handler streams structured NDJSON output from the helper
 *
 * Pre-flight checks (helper installed + sudo NOPASSWD configured) match the
 * orchestrator's `runFinalize` so the UI can degrade gracefully on hosts
 * that haven't installed the helper yet — operators get copy-paste shell
 * commands instead of a silent 500.
 *
 * Endpoints:
 *   GET  /api/admin/replicas        → current discovered state + caps
 *   POST /api/admin/replicas        → { target: 1..MAX } applies live
 */

import { Router, type Response } from "express";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import http from "node:http";
import { z } from "zod/v4";
import { requireAuth } from "../middleware/require-auth";
import { requireAdmin } from "../middleware/require-admin";
import { validate } from "../lib/validate";

const router = Router();
const execAsync = promisify(execFile);

// ── Configuration ────────────────────────────────────────────────────────────
//
// MAX_REPLICAS is the absolute UI cap; the DB connection budget analysis
// (~45 connections per replica vs Postgres `max_connections = 200`) puts the
// safe ceiling at 4. Operators with larger DBs can raise this via env, but
// keep the default conservative so the default deploy never starves the DB.

const SERVICE_PREFIX = process.env.UPDATE_SERVICE_PREFIX || process.env.SERVICE_PREFIX || "zentra-api";
const APP_BASE_PORT  = Number(process.env.APP_BASE_PORT || 3000);
const MAX_REPLICAS   = clampInt(Number(process.env.MAX_REPLICAS || 4), 1, 16);
const HELPER_PATH    = process.env.REPLICAS_HELPER || "/usr/local/sbin/zentra-set-replicas";

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(Number.isFinite(n) ? n : lo)));
}

// ── Pre-flight: is the privileged helper usable? ────────────────────────────

interface HelperStatus {
  helperPath:   string;
  helperExists: boolean;
  sudoNoPass:   boolean;
  /** Operator-facing reason when the helper can't be used. */
  reason:       string | null;
}

async function helperStatus(): Promise<HelperStatus> {
  const appDir = process.env.UPDATE_APP_DIR || "/opt/zentra/app";
  // Single recovery command surfaced to the operator in both failure modes.
  // It's idempotent — safe to re-run if pieces are already in place.
  const fix = `sudo bash ${appDir}/scripts/enable-update-orchestrator.sh`;

  const helperExists = await fs.access(HELPER_PATH).then(() => true).catch(() => false);
  if (!helperExists) {
    return {
      helperPath:   HELPER_PATH,
      helperExists: false,
      sudoNoPass:   false,
      reason: `Privileged helper not installed at ${HELPER_PATH}. Run on the host:\n  ${fix}`,
    };
  }
  // `sudo -n -l <cmd>` returns 0 iff the calling user can run that exact
  // command without a password. We don't care about output, only exit code.
  const sudoNoPass = await execAsync("sudo", ["-n", "-l", HELPER_PATH])
    .then(() => true)
    .catch(() => false);
  return {
    helperPath:   HELPER_PATH,
    helperExists: true,
    sudoNoPass,
    reason: sudoNoPass ? null
      : `Helper is installed at ${HELPER_PATH} but the sudo NOPASSWD entry ` +
        `at /etc/sudoers.d/zentra-set-replicas is missing or incorrect. Run on the host:\n  ${fix}`,
  };
}

// ── State discovery ──────────────────────────────────────────────────────────

interface ReplicaNode {
  port:    number;
  enabled: boolean;
  active:  boolean;
  healthy: boolean;
  /** Whichever replica served THIS request — surfaced in the UI as "you are here". */
  self:    boolean;
}

interface ReplicaState {
  basePort: number;
  max:      number;
  current:  number;
  replicas: ReplicaNode[];
  helper:   HelperStatus;
}

/**
 * Discover the state of each candidate replica port [base..base+max-1].
 *
 * We deliberately do NOT rely on `systemctl list-unit-files` here:
 * template instances (zentra-api@3000.service, @3001.service, …) have no
 * unit file on disk — only an enable-symlink under
 * /etc/systemd/system/multi-user.target.wants/ — and many systemd versions
 * omit those from `list-unit-files` output. The original implementation hit
 * exactly this bug: a 2-replica install reported as 1.
 *
 * Instead, for each candidate port we run two cheap probes in parallel:
 *   • `systemctl is-enabled zentra-api@<port>.service` — authoritative for
 *     the "enabled" state (returns "enabled" / "disabled" / "static" / etc;
 *     exits non-zero for missing/disabled, which we treat as not-enabled).
 *   • HTTP GET 127.0.0.1:<port>/api/health — authoritative for "healthy".
 *
 * On a non-systemd host (dev laptop, Docker without systemd), both calls
 * fail cleanly and we fall back to "1 self replica" so the UI still renders.
 */
async function discoverReplicas(thisPort: number): Promise<ReplicaState> {
  const helper = await helperStatus();

  // Probe every slot, not just the ones systemctl thinks exist. Cheap —
  // each is-enabled call returns in ~5 ms and we run them concurrently.
  const candidatePorts: number[] = Array.from(
    { length: MAX_REPLICAS },
    (_, i) => APP_BASE_PORT + i,
  );

  const probes = await Promise.all(
    candidatePorts.map(async (port): Promise<ReplicaNode> => {
      const [enabled, healthy] = await Promise.all([
        isUnitEnabled(`${SERVICE_PREFIX}@${port}.service`),
        probePort(port, 1_000),
      ]);
      return {
        port,
        enabled,
        active:  enabled && healthy,
        healthy,
        self:    port === thisPort,
      };
    }),
  );

  const enabledCount = probes.filter((p) => p.enabled).length;
  const healthyCount = probes.filter((p) => p.healthy).length;

  // "Current" replica count, in preference order:
  //   1. systemctl-enabled count        (canonical source of truth)
  //   2. health-probe responders        (fallback for non-systemd hosts)
  //   3. 1                              (we exist, therefore something runs)
  const current = enabledCount > 0
    ? enabledCount
    : Math.max(1, healthyCount);

  // The UI renders MAX_REPLICAS slots; nodes for ports that are neither
  // enabled nor healthy nor self are omitted, and the client renders those
  // slots as "Disabled". This keeps the payload honest — we don't claim a
  // replica exists when nothing's listening AND systemctl says it's off.
  const replicas = probes
    .filter((p) => p.enabled || p.healthy || p.self)
    .sort((a, b) => a.port - b.port);

  return {
    basePort: APP_BASE_PORT,
    max:      MAX_REPLICAS,
    current,
    replicas,
    helper,
  };
}

/**
 * Authoritative check for "is this systemd unit enabled?".
 *
 * `systemctl is-enabled` returns:
 *   • exit 0 + "enabled" / "enabled-runtime"   → enabled
 *   • exit non-zero + "disabled"/"masked"/"static"/missing → not enabled
 *
 * We resolve to a plain boolean and swallow the non-zero exit so missing
 * units (slot 4 on a 2-replica install, for example) just read as false.
 */
async function isUnitEnabled(unit: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync("systemctl", ["is-enabled", unit]);
    const status = stdout.trim();
    return status === "enabled" || status === "enabled-runtime";
  } catch {
    return false;
  }
}

function probePort(port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/api/health", timeout: timeoutMs }, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 400);
    });
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.on("error",   ()  => resolve(false));
  });
}

// ── GET: current state ───────────────────────────────────────────────────────

router.get("/", requireAuth, requireAdmin, async (req, res) => {
  // The port this replica is bound to — used to tag "self" in the response.
  const thisPort = Number(process.env.PORT || APP_BASE_PORT);
  const state = await discoverReplicas(thisPort);
  res.json(state);
});

// ── POST: apply target count ─────────────────────────────────────────────────

const applySchema = z.object({
  target: z.number().int().min(1).max(MAX_REPLICAS),
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const body = validate(applySchema, req.body, res);
  if (!body) return;

  const status = await helperStatus();
  if (!status.helperExists || !status.sudoNoPass) {
    res.status(503).json({
      error:  "Replica scaling helper is not available on this host.",
      reason: status.reason,
      remediation:
        `On the host, run as root:\n` +
        `  sudo bash ${process.env.UPDATE_APP_DIR ?? "/opt/zentra/app"}/scripts/enable-update-orchestrator.sh`,
    });
    return;
  }

  // Stream NDJSON events back to the browser so the UI can show a live
  // progress log instead of a spinner. Chunked, no Content-Length.
  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering, if present
  res.flushHeaders();

  await runHelperStreaming(String(body.target), res);

  // Append a final summary line with the new discovered state so the client
  // doesn't need a second round-trip to refresh the UI.
  try {
    const thisPort = Number(process.env.PORT || APP_BASE_PORT);
    const state = await discoverReplicas(thisPort);
    res.write(JSON.stringify({ event: "state", ...state }) + "\n");
  } catch (err) {
    res.write(JSON.stringify({
      event:   "state_error",
      message: err instanceof Error ? err.message : String(err),
    }) + "\n");
  }
  res.end();
});

/**
 * Spawn the helper and stream its NDJSON output line-by-line to the response.
 * Each newline-terminated chunk is forwarded as-is; non-JSON lines (stderr
 * leakage from systemctl, etc.) are wrapped in a `log` event so the UI can
 * still display them.
 */
function runHelperStreaming(target: string, res: Response): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn("sudo", ["-n", HELPER_PATH, target], {
      env: {
        ...process.env,
        SERVICE_PREFIX,
        APP_BASE_PORT: String(APP_BASE_PORT),
        MAX_REPLICAS:  String(MAX_REPLICAS),
      },
    });

    const forwardLines = (buf: { current: string }, source: "stdout" | "stderr") =>
      (chunk: Buffer) => {
        buf.current += chunk.toString("utf8");
        const lines = buf.current.split("\n");
        buf.current = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          // Pass through valid JSON from the helper; wrap anything else.
          if (line.startsWith("{") && line.endsWith("}")) {
            res.write(line + "\n");
          } else {
            res.write(JSON.stringify({ event: "log", source, line }) + "\n");
          }
        }
      };

    const outBuf = { current: "" };
    const errBuf = { current: "" };
    child.stdout.on("data", forwardLines(outBuf, "stdout"));
    child.stderr.on("data", forwardLines(errBuf, "stderr"));

    child.on("error", (err) => {
      res.write(JSON.stringify({
        event:   "error",
        message: `Failed to spawn helper: ${err.message}`,
      }) + "\n");
      resolve();
    });

    child.on("close", (code, signal) => {
      // Flush any straggler bytes.
      if (outBuf.current.trim()) res.write(JSON.stringify({ event: "log", source: "stdout", line: outBuf.current.trim() }) + "\n");
      if (errBuf.current.trim()) res.write(JSON.stringify({ event: "log", source: "stderr", line: errBuf.current.trim() }) + "\n");

      if (code !== 0) {
        res.write(JSON.stringify({
          event:   "error",
          message: `Helper exited with code=${code} signal=${signal ?? "none"}`,
        }) + "\n");
      }
      resolve();
    });
  });
}

export default router;
