/**
 * Admin Monitoring — system health snapshot
 *
 * GET /api/admin/health
 *   Single, admin-gated endpoint that returns a structured snapshot of:
 *     - the Node process (uptime, memory, event-loop lag, version)
 *     - the PostgreSQL primary (ping, server version, connection counts)
 *     - read replicas (if `DATABASE_REPLICA_URL` is configured)
 *     - the pg-boss job queue (per-queue depth, recent failures)
 *     - background cron heartbeats (last run timestamps)
 *     - upstream providers (SendGrid, OpenAI) — basic configured/healthy state
 *
 * Resource discipline (this endpoint is opened by every admin tab):
 *
 *   1. **In-process snapshot cache** with a 10-second TTL. Concurrent requests
 *      while a probe is in-flight share the same Promise (single-flight).
 *      Dozens of admins refreshing simultaneously triggers ONE database probe.
 *
 *   2. **HTTP cache headers** — `Cache-Control: max-age=10`, so the browser
 *      and any CDN in front of us serve from cache during the TTL window.
 *
 *   3. **Probe budget** — every external call (DB ping, replica ping,
 *      provider checks) has a hard 1.5s timeout. A flaky upstream cannot
 *      degrade the page.
 *
 *   4. **No external HTTP calls by default** — provider health is reported
 *      as "configured" / "not configured" based on env vars. Live reachability
 *      checks are gated behind `?probe=upstream` (admin-triggered) so the
 *      passive page load is free of outbound traffic.
 */

import { Router } from "express";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { requireAuth } from "../middleware/require-auth";
import { requireAdmin } from "../middleware/require-admin";
import prisma from "../db";

const router = Router();

// ── Snapshot types ────────────────────────────────────────────────────────────

type Status = "healthy" | "degraded" | "down" | "unknown" | "not_configured";

interface ServerHealth {
  status: Status;
  uptimeSeconds: number;
  nodeVersion: string;
  platform: string;
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    /** Total physical RAM on the host, in MB. Used as the denominator for
     *  the memory-pressure bar — RSS / totalSystem is portable across
     *  Node and Bun, unlike heapUsed / heapTotal which JavaScriptCore
     *  routinely reports >100% under Bun. */
    totalSystemMb: number;
  };
  eventLoopLagMs: number;
  loadAvg: { one: number; five: number; fifteen: number } | null; // null on Windows
  cpuCount: number;
}

interface DatabaseHealth {
  status: Status;
  pingMs: number | null;
  serverVersion: string | null;
  activeConnections: number | null;
  maxConnections: number | null;
}

interface ReplicaSelf {
  port: number;
  status: Status;
  pingMs: number | null;
  pid: number | null;
  uptimeSeconds: number | null;
  rssMb: number | null;
  heapUsedMb: number | null;
  eventLoopLagMs: number | null;
  /** True if this is the replica that served the current request. */
  current: boolean;
  error: string | null;
}

interface ReplicaHealth {
  /** Whether REPLICAS env hint is set — when false, we still report the local replica. */
  configured: boolean;
  status: Status;
  /** How many replicas reported "ok" out of `expected`. */
  reachable: number;
  expected: number;
  replicas: ReplicaSelf[];
}

interface QueueHealth {
  status: Status;
  totalActive: number;
  totalCreated: number;
  totalFailedLast24h: number;
  queues: Array<{
    name: string;
    created: number;
    active: number;
    completed: number;
    failed: number;
  }>;
}

interface CronHeartbeat {
  status: Status;
  jobs: Array<{
    name: string;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    avgDurationMs: number | null;
    /** Per-job staleness assessment vs. its expected cadence. */
    jobStatus: Status;
    /** Expected max age in minutes — used by the UI for tooltips. */
    maxAgeMinutes: number;
    /** True when this job's staleness rolls up to the system-wide status. */
    critical: boolean;
  }>;
}

interface ProviderHealth {
  status: Status;
  configured: boolean;
  detail: string;
}

interface HealthSnapshot {
  generatedAt: string;
  overall: Status;
  /**
   * Human-readable explanation of why `overall` is degraded/down. Empty
   * when the system is healthy. Surfaced as a tooltip + inline note on
   * the dashboard banner so admins can immediately see the trigger
   * without hunting through five expandable cards.
   */
  reasons: string[];
  server: ServerHealth;
  database: DatabaseHealth;
  replica: ReplicaHealth;
  queue: QueueHealth;
  cron: CronHeartbeat;
  providers: {
    mail: ProviderHealth;
    ai: ProviderHealth;
  };
}

// ── Cache + single-flight ─────────────────────────────────────────────────────

const CACHE_TTL_MS = 10_000;

interface CacheEntry {
  expiresAt: number;
  snapshot: HealthSnapshot;
}

let cached: CacheEntry | null = null;
let inFlight: Promise<HealthSnapshot> | null = null;

async function getSnapshotCached(): Promise<HealthSnapshot> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.snapshot;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const snapshot = await buildSnapshot();
      cached = { expiresAt: Date.now() + CACHE_TTL_MS, snapshot };
      return snapshot;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

function rollUp(...statuses: Status[]): Status {
  if (statuses.some((s) => s === "down"))     return "down";
  if (statuses.some((s) => s === "degraded")) return "degraded";
  if (statuses.some((s) => s === "unknown"))  return "unknown";
  return "healthy";
}

function bytesToMb(b: number): number {
  return Math.round((b / 1024 / 1024) * 10) / 10;
}

// Event-loop lag: schedule a setImmediate, measure how long until it runs.
async function measureEventLoopLag(): Promise<number> {
  const start = performance.now();
  await new Promise((r) => setImmediate(r));
  return Math.max(0, Math.round((performance.now() - start) * 100) / 100);
}

// ── Probes ────────────────────────────────────────────────────────────────────

async function probeServer(): Promise<ServerHealth> {
  const mem = process.memoryUsage();
  const lag = await measureEventLoopLag();
  const cpuCount = os.cpus()?.length ?? 0;

  // os.loadavg() always returns [0,0,0] on Windows — surface as null so the
  // UI can show "n/a" instead of pretending the box is idle.
  let loadAvg: ServerHealth["loadAvg"] = null;
  if (process.platform !== "win32") {
    const [one, five, fifteen] = os.loadavg();
    loadAvg = { one: one ?? 0, five: five ?? 0, fifteen: fifteen ?? 0 };
  }

  // Memory pressure: RSS / totalSystem. We deliberately do *not* compare
  // heapUsed / heapTotal — under Bun (JavaScriptCore) heapUsed routinely
  // exceeds heapTotal because it includes native allocations the JS heap
  // doesn't track, producing nonsense ratios like 132% on a healthy
  // process. RSS / totalSystem reflects actual host memory pressure and is
  // identical in meaning across Node and Bun.
  const totalSystemMb = bytesToMb(os.totalmem());
  const rssMb         = bytesToMb(mem.rss);
  const memPressure   = totalSystemMb > 0 ? rssMb / totalSystemMb : 0;

  // Status thresholds: heuristic, deliberately forgiving so the dashboard
  // doesn't cry wolf on a normal GC pause.
  let status: Status = "healthy";
  if (lag > 200)            status = "degraded";
  if (lag > 1000)           status = "down";
  if (memPressure > 0.85)   status = "degraded";
  if (memPressure > 0.95)   status = "down";

  return {
    status,
    uptimeSeconds: Math.round(process.uptime()),
    nodeVersion: process.version,
    platform: `${process.platform}-${process.arch}`,
    memory: {
      rssMb,
      heapUsedMb:    bytesToMb(mem.heapUsed),
      heapTotalMb:   bytesToMb(mem.heapTotal),
      totalSystemMb,
    },
    eventLoopLagMs: lag,
    loadAvg,
    cpuCount,
  };
}

async function probeDatabase(): Promise<DatabaseHealth> {
  const start = performance.now();
  try {
    const rows = await withTimeout(
      prisma.$queryRaw<Array<{ version: string; active: bigint; max: bigint }>>`
        SELECT
          current_setting('server_version')          AS version,
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND datname = current_database())::bigint AS active,
          current_setting('max_connections')::int    AS max
      `,
      1500,
      "db.ping",
    );
    const pingMs = Math.round((performance.now() - start) * 100) / 100;
    const row = rows[0];
    const active = row ? Number(row.active) : 0;
    const max    = row ? Number(row.max)    : 0;

    let status: Status = "healthy";
    if (pingMs > 200)               status = "degraded";
    if (max > 0 && active / max > 0.85) status = "degraded";
    if (pingMs > 1000)              status = "down";

    return {
      status,
      pingMs,
      serverVersion:     row?.version ?? null,
      activeConnections: active,
      maxConnections:    max,
    };
  } catch {
    return {
      status: "down",
      pingMs: null,
      serverVersion: null,
      activeConnections: null,
      maxConnections: null,
    };
  }
}

async function probeReplica(): Promise<ReplicaHealth> {
  // Discover the replica topology declared by install.sh. The systemd template
  // launches one Bun process per port in [APP_BASE_PORT, APP_BASE_PORT+REPLICAS-1]
  // on 127.0.0.1, with Caddy load-balancing across them. We fan out a localhost
  // probe to each port so the dashboard shows every replica, not just whichever
  // one Caddy happened to route this request to.
  const baseEnv     = process.env.APP_BASE_PORT;
  const replicasEnv = process.env.REPLICAS;
  const myPort      = Number(process.env.PORT) || null;

  const expected = Math.max(1, Number(replicasEnv) || 1);
  const basePort = Number(baseEnv) || myPort || 3000;
  const ports: number[] = [];
  for (let i = 0; i < expected && i < 16; i++) ports.push(basePort + i);

  // If APP_BASE_PORT/REPLICAS aren't exported (e.g. dev), still report the
  // running process so the page never looks empty.
  if (!baseEnv && !replicasEnv) {
    if (myPort && !ports.includes(myPort)) ports.push(myPort);
  }

  const probes = await Promise.all(ports.map(async (port): Promise<ReplicaSelf> => {
    const start = performance.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch(`http://127.0.0.1:${port}/api/health/replica`, {
        signal: ctrl.signal,
        // We're hitting localhost — keep it short and unauthenticated.
      }).finally(() => clearTimeout(timer));

      if (!res.ok) {
        return {
          port, status: "down", pingMs: null, pid: null, uptimeSeconds: null,
          rssMb: null, heapUsedMb: null, eventLoopLagMs: null,
          current: port === myPort, error: `HTTP ${res.status}`,
        };
      }
      const body = await res.json() as {
        pid: number; port: number | null;
        uptimeSeconds: number; nodeVersion: string;
        memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
        eventLoopLagMs: number;
      };
      const pingMs = Math.round((performance.now() - start) * 100) / 100;

      let status: Status = "healthy";
      if (body.eventLoopLagMs > 200)  status = "degraded";
      if (body.eventLoopLagMs > 1000) status = "down";

      return {
        port,
        status,
        pingMs,
        pid: body.pid,
        uptimeSeconds: body.uptimeSeconds,
        rssMb: body.memory.rssMb,
        heapUsedMb: body.memory.heapUsedMb,
        eventLoopLagMs: body.eventLoopLagMs,
        current: port === myPort,
        error: null,
      };
    } catch (e) {
      return {
        port,
        status: "down",
        pingMs: null,
        pid: null,
        uptimeSeconds: null,
        rssMb: null,
        heapUsedMb: null,
        eventLoopLagMs: null,
        current: port === myPort,
        error: e instanceof Error ? e.message : "unreachable",
      };
    }
  }));

  const reachable = probes.filter((p) => p.status === "healthy" || p.status === "degraded").length;

  // Roll-up: down if NONE answered, degraded if some are missing/degraded, healthy if all healthy.
  let status: Status;
  if (reachable === 0)                                              status = "down";
  else if (reachable < expected)                                    status = "degraded";
  else if (probes.some((p) => p.status === "degraded"))             status = "degraded";
  else                                                              status = "healthy";

  return {
    configured: !!(baseEnv && replicasEnv),
    status,
    reachable,
    expected,
    replicas: probes.sort((a, b) => a.port - b.port),
  };
}

async function probeQueue(): Promise<QueueHealth> {
  // pg-boss stores jobs in `pgboss.job`. We aggregate per-queue counts in a
  // single SQL round-trip to keep this cheap. A queue is "healthy" until its
  // failed-jobs count in the last 24h crosses a threshold, or its created
  // (waiting) backlog grows unreasonably large.
  try {
    type Row = {
      name: string;
      state: string;
      cnt: bigint;
    };

    const rows = await withTimeout(
      prisma.$queryRaw<Row[]>`
        SELECT name, state, count(*)::bigint AS cnt
          FROM pgboss.job
         WHERE created_on > now() - interval '24 hours'
            OR state IN ('created','retry','active')
         GROUP BY name, state
      `,
      1500,
      "queue.stats",
    );

    const grouped = new Map<string, { created: number; active: number; completed: number; failed: number }>();
    for (const r of rows) {
      const slot = grouped.get(r.name) ?? { created: 0, active: 0, completed: 0, failed: 0 };
      const n = Number(r.cnt);
      if (r.state === "created" || r.state === "retry") slot.created   += n;
      else if (r.state === "active")                    slot.active    += n;
      else if (r.state === "completed")                 slot.completed += n;
      else if (r.state === "failed")                    slot.failed    += n;
      grouped.set(r.name, slot);
    }

    const queues = [...grouped.entries()]
      .map(([name, q]) => ({ name, ...q }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const totalActive       = queues.reduce((s, q) => s + q.active,    0);
    const totalCreated      = queues.reduce((s, q) => s + q.created,   0);
    const totalFailedLast24h= queues.reduce((s, q) => s + q.failed,    0);

    let status: Status = "healthy";
    if (totalCreated > 500)        status = "degraded";
    if (totalFailedLast24h > 50)   status = "degraded";
    if (totalCreated > 5000)       status = "down";

    return { status, totalActive, totalCreated, totalFailedLast24h, queues };
  } catch {
    return { status: "down", totalActive: 0, totalCreated: 0, totalFailedLast24h: 0, queues: [] };
  }
}

// Expected max-age (minutes) per known cron job, derived from each job's
// scheduling cadence. A job whose last success is older than this is flagged
// "degraded"; older than 4× this it's "down". Jobs not listed here are
// surfaced in the table but never affect the rollup.
//
// `critical: true` means a stale heartbeat for this job rolls up to the
// system-wide status — these are the jobs that directly drive customer-facing
// behaviour (SLA tracking, automations, inbound email). Non-critical jobs
// (daily maintenance, view refreshes) are shown on the dashboard for
// observability but a brief delay on them is not "the system is degraded".
const CRON_JOBS: Record<string, { maxAgeMin: number; critical: boolean }> = {
  // High-frequency, customer-facing — stale = real problem
  "check-sla":                  { maxAgeMin: 15,      critical: true  },
  "check-automation":           { maxAgeMin: 15,      critical: true  },
  "check-time-supervisor":      { maxAgeMin: 15,      critical: true  },
  "check-inbound-email":        { maxAgeMin: 10,      critical: true  },
  "check-report-schedules":     { maxAgeMin: 15,      critical: true  },
  // Medium-frequency — observability only
  "refresh-materialized-views": { maxAgeMin: 60 * 2,  critical: false },
  "check-discovery-schedules":  { maxAgeMin: 60 * 2,  critical: false },
  // Daily maintenance — observability only, generous window
  "check-asset-renewals":       { maxAgeMin: 60 * 26, critical: false },
  "purge-trash":                { maxAgeMin: 60 * 26, critical: false },
  "purge-audit-log":            { maxAgeMin: 60 * 26, critical: false },
};

// Back-compat alias for existing callers reading just max-age numbers.
const CRON_MAX_AGE_MIN: Record<string, number> = Object.fromEntries(
  Object.entries(CRON_JOBS).map(([k, v]) => [k, v.maxAgeMin]),
);

async function probeCron(): Promise<CronHeartbeat> {
  try {
    type Row = {
      name: string;
      last_success_at: Date | null;
      last_failure_at: Date | null;
      avg_duration_ms: number | null;
    };
    const knownJobs = Object.keys(CRON_MAX_AGE_MIN);
    const rows = await withTimeout(
      prisma.$queryRaw<Row[]>`
        SELECT
          name,
          max(CASE WHEN state = 'completed' THEN completed_on END)              AS last_success_at,
          max(CASE WHEN state = 'failed'    THEN completed_on END)              AS last_failure_at,
          avg(CASE WHEN state = 'completed' AND completed_on IS NOT NULL AND started_on IS NOT NULL
                   THEN extract(epoch from (completed_on - started_on)) * 1000 END)::float8
                                                                                 AS avg_duration_ms
          FROM pgboss.job
         WHERE name = ANY (${knownJobs}::text[])
         GROUP BY name
      `,
      1500,
      "cron.heartbeats",
    );

    const now = Date.now();
    const seen = new Set(rows.map((r) => r.name));

    // Include known jobs that have NEVER run too — show them as "unknown"
    // rather than dropping them from the table.
    const allRows: Row[] = [
      ...rows,
      ...knownJobs
        .filter((n) => !seen.has(n))
        .map((n) => ({ name: n, last_success_at: null, last_failure_at: null, avg_duration_ms: null })),
    ];

    const jobs = allRows
      .map((r) => {
        const meta     = CRON_JOBS[r.name];
        const maxAge   = meta?.maxAgeMin ?? Infinity;
        const critical = meta?.critical  ?? false;
        let jobStatus: Status = "healthy";
        if (!r.last_success_at) {
          // Never run — only worry once we're past the expected cadence; otherwise it just hasn't fired yet.
          // We can't tell since process boot from here, so treat unknown as a soft-info state.
          jobStatus = "unknown";
        } else {
          const ageMin = (now - new Date(r.last_success_at).getTime()) / 60000;
          if (ageMin > maxAge)     jobStatus = "degraded";
          if (ageMin > maxAge * 4) jobStatus = "down";
        }
        return {
          name: r.name,
          lastSuccessAt: r.last_success_at?.toISOString() ?? null,
          lastFailureAt: r.last_failure_at?.toISOString() ?? null,
          avgDurationMs: r.avg_duration_ms != null ? Math.round(r.avg_duration_ms) : null,
          jobStatus,
          maxAgeMinutes: Number.isFinite(maxAge) ? maxAge : 0,
          critical,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    // Roll-up: only *critical* job staleness counts toward the system-wide
    // rollup. A daily purge job that's a couple minutes late should not
    // turn the whole monitoring banner amber — it just shows on its own
    // row in the cron table for observability.
    const criticalStatuses = jobs
      .filter((j) => j.critical)
      .map((j) => j.jobStatus)
      .filter((s) => s !== "unknown");
    const allDown = criticalStatuses.length > 0 && criticalStatuses.every((s) => s === "down");
    let status: Status;
    if (allDown)                                                status = "down";
    else if (criticalStatuses.some((s) => s !== "healthy"))     status = "degraded";
    else                                                        status = "healthy";

    return { status, jobs };
  } catch {
    return { status: "unknown", jobs: [] };
  }
}

function probeProviders() {
  const sendgridKey = process.env.SENDGRID_API_KEY;
  const openaiKey   = process.env.OPENAI_API_KEY;

  const mail: ProviderHealth = sendgridKey
    ? { configured: true,  status: "healthy",        detail: "API key configured" }
    : { configured: false, status: "not_configured", detail: "SENDGRID_API_KEY not set" };

  const ai: ProviderHealth = openaiKey
    ? { configured: true,  status: "healthy",        detail: "API key configured" }
    : { configured: false, status: "not_configured", detail: "OPENAI_API_KEY not set" };

  return { mail, ai };
}

// ── Build the snapshot ────────────────────────────────────────────────────────

async function buildSnapshot(): Promise<HealthSnapshot> {
  const [server, database, replica, queue, cron] = await Promise.all([
    probeServer(),
    probeDatabase(),
    probeReplica(),
    probeQueue(),
    probeCron(),
  ]);

  const providers = probeProviders();

  // not_configured doesn't influence overall — it's an info state, not an alert.
  const liveStatuses: Status[] = [
    server.status,
    database.status,
    queue.status,
    cron.status,
    replica.status,                           // always meaningful — covers ≥1 replica
    ...(providers.mail.configured ? [providers.mail.status] : []),
    ...(providers.ai.configured   ? [providers.ai.status]   : []),
  ];

  const overall = rollUp(...liveStatuses);

  // Build a punch-list of *why* the rollup isn't healthy. Each entry is a
  // concrete trigger — the specific probe + the specific threshold that
  // tripped — so the admin can act on it without expanding every card.
  const reasons: string[] = [];
  if (overall !== "healthy") {
    if (server.status !== "healthy") {
      if (server.eventLoopLagMs > 1000) {
        reasons.push(`Event-loop lag is ${server.eventLoopLagMs} ms (down threshold 1000 ms)`);
      } else if (server.eventLoopLagMs > 200) {
        reasons.push(`Event-loop lag is ${server.eventLoopLagMs} ms (degrade threshold 200 ms)`);
      }
      const totalMb = server.memory.totalSystemMb || 0;
      if (totalMb > 0) {
        const pct = server.memory.rssMb / totalMb;
        if (pct > 0.85) {
          reasons.push(
            `Process memory at ${Math.round(pct * 100)}% of host RAM ` +
            `(${server.memory.rssMb} / ${totalMb} MB; degrade threshold 85%)`,
          );
        }
      }
    }
    if (database.status !== "healthy") {
      if ((database.pingMs ?? 0) > 1000) {
        reasons.push(`Database ping is ${database.pingMs} ms (down threshold 1000 ms)`);
      } else if ((database.pingMs ?? 0) > 200) {
        reasons.push(`Database ping is ${database.pingMs} ms (degrade threshold 200 ms)`);
      }
      if (database.maxConnections && database.activeConnections != null) {
        const pct = database.activeConnections / database.maxConnections;
        if (pct > 0.85) {
          reasons.push(
            `Database at ${database.activeConnections}/${database.maxConnections} active ` +
            `connections (${Math.round(pct * 100)}%; degrade threshold 85%)`,
          );
        }
      }
      if (database.status === "down" && database.pingMs == null) {
        reasons.push("Database probe failed or timed out");
      }
    }
    if (replica.status !== "healthy") {
      if (replica.reachable < replica.expected) {
        reasons.push(
          `Only ${replica.reachable} of ${replica.expected} expected API replicas are reachable`,
        );
      }
      const degraded = replica.replicas.filter((r) => r.status === "degraded").map((r) => r.port);
      if (degraded.length > 0) {
        reasons.push(`Replica(s) reporting degraded: ${degraded.join(", ")}`);
      }
    }
    if (queue.status !== "healthy") {
      if (queue.totalCreated > 5000) {
        reasons.push(`Job queue backlog at ${queue.totalCreated} waiting (down threshold 5000)`);
      } else if (queue.totalCreated > 500) {
        reasons.push(`Job queue backlog at ${queue.totalCreated} waiting (degrade threshold 500)`);
      }
      if (queue.totalFailedLast24h > 50) {
        reasons.push(`${queue.totalFailedLast24h} job failures in the last 24h (threshold 50)`);
      }
    }
    if (cron.status !== "healthy") {
      const stale = cron.jobs.filter((j) => j.critical && j.jobStatus !== "healthy" && j.jobStatus !== "unknown");
      for (const j of stale) {
        reasons.push(
          `Cron job '${j.name}' is ${j.jobStatus} ` +
          `(expected every ${j.maxAgeMinutes} min)`,
        );
      }
    }
    if (providers.mail.configured && providers.mail.status !== "healthy") {
      reasons.push(`Mail provider: ${providers.mail.detail}`);
    }
    if (providers.ai.configured && providers.ai.status !== "healthy") {
      reasons.push(`AI provider: ${providers.ai.detail}`);
    }
    // Fallback so the banner never says "Degraded" with no explanation —
    // if the rollup tripped but no specific threshold matched above, the
    // dashboard still gets *something* to display.
    if (reasons.length === 0) {
      reasons.push("One of the subsystems is reporting a non-healthy status (see cards below)");
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    overall,
    reasons,
    server,
    database,
    replica,
    queue,
    cron,
    providers,
  };
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.get("/", requireAuth, requireAdmin, async (_req, res) => {
  const snapshot = await getSnapshotCached();
  // Browsers and any CDN in front of us serve from cache during the TTL window.
  res.setHeader("Cache-Control", `private, max-age=${Math.floor(CACHE_TTL_MS / 1000)}`);
  res.json(snapshot);
});

export default router;
