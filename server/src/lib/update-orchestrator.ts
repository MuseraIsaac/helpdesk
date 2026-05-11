/**
 * Update orchestrator.
 *
 * Drives an UpdateRun row through the state machine documented on the model.
 * Each step is idempotent — if the worker process dies mid-run, the state
 * column lets us resume or fail cleanly on next boot.
 *
 * Steps (each writes the run state + an UpdateRunEvent before doing work):
 *   queued
 *     → preflight        (compatibility, disk space, SSL secret, channel)
 *     → backup           (pg_dump to a configurable path)
 *     → maintenance_on   (set advanced.maintenanceMode = true)
 *     → fetch            (download artifact tarball + signature)
 *     → verify           (hash + signature check)
 *     → extract          (untar the artifact into a versioned staging dir)
 *     → install_deps     (`bun install --frozen-lockfile` in the staged tree
 *                         so it can actually run — node_modules isn't shipped
 *                         in the artifact, just like install.sh's update.sh)
 *     → migrate          (prisma migrate deploy against the STAGED schema)
 *     → data_tasks       (post-migration scripts loaded from the STAGED tree)
 *     → build            (`bunx vite build` so the SPA assets in client/dist
 *                         match the new server. Without this the frontend
 *                         stays at the old version after the binary swap.)
 *     → restart_required (operator points their service supervisor at the
 *                         staging dir and restarts; we can't swap the binary
 *                         from inside the running process safely)
 *     → done             (after the next clean boot picks up the new binary)
 *
 * Path layout
 * ───────────
 *   $UPDATE_ARTIFACT_DIR/<version>.tar.gz   ← downloaded, sha-verified
 *   $UPDATE_STAGING_DIR/<version>/          ← extracted, ready to run from
 *   $UPDATE_BACKUP_DIR/pre-<v>-<ts>.dump    ← pg_dump output for rollback
 *
 * Apply triggers are routed via pg-boss so the run survives a server restart
 * and can be observed from any Express worker via the same DB row.
 */
import { execFile, spawn } from "child_process";
import path        from "path";
import fs          from "fs/promises";
import crypto      from "crypto";
import prisma      from "../db";
import { boss }    from "./queue";
import Sentry      from "./sentry";
import { setSection } from "./settings";
import { invalidateMaintenanceCache } from "../middleware/maintenance-mode";
import { signedFetch, signedFetchBinary } from "./update-channel";
import { loadBundledManifest } from "./release";
import {
  type ReleaseManifest,
  type UpdateRunState,
} from "core/schemas/updates.ts";

const FINALIZE_HELPER = process.env.UPDATE_FINALIZE_HELPER || "/usr/local/sbin/zentra-finalize-update";

const QUEUE_NAME = "apply-update";

// ── Event helpers ────────────────────────────────────────────────────────────

async function logEvent(
  runId: number,
  level: "info" | "warn" | "error",
  step: string,
  message: string,
  data?: Record<string, unknown>,
) {
  await prisma.updateRunEvent.create({
    data: { runId, level, step, message, ...(data ? { data: data as object } : {}) },
  });
}

async function transition(
  runId: number,
  state: UpdateRunState,
  currentStep: string | null,
  patch: Partial<{ startedAt: Date; finishedAt: Date; backupPath: string; errorMessage: string; errorStep: string }> = {},
) {
  await prisma.updateRun.update({
    where: { id: runId },
    data:  { state, currentStep, ...patch },
  });
}

// ── Preflight ────────────────────────────────────────────────────────────────

async function preflight(runId: number, manifest: ReleaseManifest): Promise<void> {
  await logEvent(runId, "info", "preflight", "Running pre-flight checks");

  const bundled = await loadBundledManifest();
  if (manifest.minFromVersion && compareSemver(bundled.version, manifest.minFromVersion) < 0) {
    throw new Error(
      `Cannot upgrade ${bundled.version} → ${manifest.version} directly. ` +
      `Install ${manifest.minFromVersion} first.`,
    );
  }

  // Verify another run isn't already in flight.
  const inFlight = await prisma.updateRun.count({
    where: {
      state: { notIn: ["done", "failed", "cancelled", "rolled_back"] },
      id:    { not: runId },
    },
  });
  if (inFlight > 0) throw new Error("Another update is already in progress");

  // Disk-space check (best-effort).
  try {
    const { stdout } = await execAsync("df", ["-Pk", process.cwd()]);
    const lines = stdout.split("\n").filter(Boolean);
    const free  = lines[1]?.split(/\s+/)[3];
    const freeMb = free ? Math.floor(Number(free) / 1024) : null;
    if (freeMb !== null) {
      await logEvent(runId, "info", "preflight", `Free disk space: ${freeMb} MB`);
      if (freeMb < 500) throw new Error(`Insufficient disk space (${freeMb} MB free, 500 MB required)`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Insufficient disk space")) throw err;
    // df not available (Windows dev) — not fatal.
    await logEvent(runId, "warn", "preflight", "Skipping disk-space check (df unavailable)");
  }
}

// ── Backup ───────────────────────────────────────────────────────────────────

async function backup(runId: number, version: string): Promise<string> {
  await logEvent(runId, "info", "backup", "Creating database backup");

  const dir = process.env.UPDATE_BACKUP_DIR || path.resolve(process.cwd(), "../backups/updates");
  await fs.mkdir(dir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename  = `pre-${version}-${timestamp}.dump`;
  const target    = path.join(dir, filename);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set — cannot back up");

  // Prisma's DATABASE_URL carries non-libpq query params (notably ?schema=public,
  // also ?connection_limit=, ?pgbouncer=, ?pool_timeout=). pg_dump rejects
  // those with "invalid URI query parameter". Build a libpq-clean URL by
  // dropping the query string entirely — the connection details we need are
  // all in the URL path / userinfo.
  const dumpUrl = pgLibpqUrl(dbUrl);

  // pg_dump in custom-format (-Fc) so pg_restore can replay it. If pg_dump
  // isn't on PATH (e.g. dev environments) we mark the backup as skipped but
  // still record the intended path so the operator knows where it should be.
  try {
    await execAsync("pg_dump", ["-Fc", "-f", target, dumpUrl]);
    await logEvent(runId, "info", "backup", `Backup written to ${target}`);
    return target;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logEvent(runId, "warn", "backup", `pg_dump unavailable — skipping backup: ${msg}`);
    return "";
  }
}

/**
 * Strip Prisma-only query parameters from a Postgres connection string so
 * libpq-based tools (pg_dump, pg_restore, psql) accept it. Preserves the
 * scheme / userinfo / host / port / database; drops the entire query string.
 */
function pgLibpqUrl(url: string): string {
  try {
    const u = new URL(url);
    u.search = "";
    return u.toString();
  } catch {
    // Fallback for legacy non-URL forms — strip anything after the first '?'.
    return url.split("?")[0] ?? url;
  }
}

// ── Maintenance toggles ──────────────────────────────────────────────────────

async function setMaintenance(runId: number, on: boolean) {
  await setSection("advanced", { maintenanceMode: on });
  invalidateMaintenanceCache();
  await logEvent(runId, "info", on ? "maintenance_on" : "maintenance_off", `Maintenance mode ${on ? "enabled" : "disabled"}`);
}

// ── Fetch + verify ───────────────────────────────────────────────────────────

interface ArtifactDescriptor {
  url:       string;
  sha256:    string;
  signature: string;  // hex-encoded HMAC of the sha256, signed by the release server with the install secret
}

async function fetchArtifact(runId: number, manifest: ReleaseManifest): Promise<{ artifactPath: string; sha256: string }> {
  await logEvent(runId, "info", "fetch", `Fetching artifact descriptor for ${manifest.version}`);

  // Step 1: ask the release server where the tarball lives + its digest.
  const desc = await signedFetch<ArtifactDescriptor>({
    method: "GET",
    path:   `/releases/${manifest.version}/artifact.json`,
  });
  if (!desc.ok || !desc.data) {
    throw new Error(`Could not retrieve artifact descriptor: ${desc.errorText ?? `HTTP ${desc.status}`}`);
  }

  const dir = process.env.UPDATE_ARTIFACT_DIR || path.resolve(process.cwd(), "../updates/artifacts");
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, `${manifest.version}.tar.gz`);

  // Step 2: download the tarball through the SAME signed channel as the
  // descriptor. The release-server daemon HMAC-protects every path under
  // /releases/*, including binary downloads — an unsigned fetch returns 401.
  // We use the predictable path here rather than trusting `desc.data.url`,
  // so the request is bound to *this install's* signing material.
  await logEvent(runId, "info", "fetch", `Downloading source.tar.gz (HMAC-signed)`);
  const tarballPath = `/releases/${manifest.version}/source.tar.gz`;
  const dl = await signedFetchBinary({ path: tarballPath });
  if (!dl.ok || !dl.body) {
    throw new Error(`Artifact download failed: ${dl.errorText ?? `HTTP ${dl.status}`} (path=${tarballPath})`);
  }
  await fs.writeFile(target, dl.body);

  // Step 3: hash + verify against the descriptor's sha256. The descriptor
  // is a separately-signed JSON document, so this protects against a
  // mid-transit substitution AND a release-server-side serving bug.
  const actual = crypto.createHash("sha256").update(dl.body).digest("hex");
  if (actual !== desc.data.sha256) {
    throw new Error(`Artifact checksum mismatch — expected ${desc.data.sha256}, got ${actual}`);
  }
  await logEvent(runId, "info", "verify",
    `Artifact verified (${dl.body.byteLength} bytes, sha256=${actual.slice(0, 12)}…)`);

  return { artifactPath: target, sha256: actual };
}

// ── Extract ──────────────────────────────────────────────────────────────────

/**
 * Untar the verified artifact into a versioned staging directory and return
 * its path. The staged tree is what `migrate` and `data_tasks` operate on —
 * NOT the running install's source — so the new release's migrations and
 * post-migration scripts are the ones that execute.
 *
 * Idempotent: if the staging dir already exists (a previous run died or was
 * retried), it's wiped and re-extracted. We don't trust partial extracts.
 */
async function extractArtifact(runId: number, artifactPath: string, manifest: ReleaseManifest): Promise<string> {
  const stagingRoot = process.env.UPDATE_STAGING_DIR
    || path.resolve(process.cwd(), "../updates/staging");
  await fs.mkdir(stagingRoot, { recursive: true });
  const target = path.join(stagingRoot, manifest.version);

  // Wipe any prior partial extract so retries are clean.
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });

  await logEvent(runId, "info", "extract", `Extracting artifact into ${target}`);
  await execAsync("tar", ["-xzf", artifactPath, "-C", target]);

  // Sanity check: the artifact must contain the prisma schema we're about to
  // migrate against. If it doesn't, the tarball is malformed and we abort.
  const schemaPath = path.join(target, "server", "prisma", "schema.prisma");
  try {
    await fs.access(schemaPath);
  } catch {
    throw new Error(`Extracted tree at ${target} is missing server/prisma/schema.prisma — refusing to migrate`);
  }
  await logEvent(runId, "info", "extract", `Staged tree ready at ${target}`);
  return target;
}

// ── Install dependencies ─────────────────────────────────────────────────────

/**
 * Run `bun install --frozen-lockfile` inside the staged tree so it has its own
 * node_modules. The artifact tarball deliberately excludes node_modules (per
 * release-server/publish.sh and sync-from-github.sh), so without this step
 * the staged tree wouldn't be runnable.
 *
 * Why we do it here instead of post-restart:
 *   • Failures are visible in the orchestrator log instead of a crashed
 *     replica nobody is watching.
 *   • The maintenance window absorbs the (potentially slow) network fetch
 *     instead of customer-facing downtime stretching into the restart.
 *
 * Skippable by setting UPDATE_SKIP_INSTALL_DEPS=true for installs that ship
 * pre-built artifacts (e.g. Docker images that bake node_modules in).
 */
async function installDeps(runId: number, stagingDir: string): Promise<void> {
  if (process.env.UPDATE_SKIP_INSTALL_DEPS === "true") {
    await logEvent(runId, "info", "install_deps", "Skipped (UPDATE_SKIP_INSTALL_DEPS=true)");
    return;
  }
  const bun = process.env.UPDATE_BUN_BIN || "bun";
  const env = buildBuildEnv(stagingDir);

  // Pre-create bun's cache dir so it doesn't try to mkdir under HOME.
  await fs.mkdir(env.HOME!, { recursive: true });
  await announceCacheStrategy(runId, "install_deps", env);

  await logEvent(runId, "info", "install_deps",
    `Running ${bun} install --frozen-lockfile (cache: ${env.BUN_INSTALL_CACHE_DIR})`);
  await streamExec(runId, "install_deps", bun, ["install", "--frozen-lockfile"], {
    cwd: stagingDir,
    env,
    timeoutMs: numEnv("UPDATE_INSTALL_TIMEOUT_MS", 15 * 60_000),
  });
}

// ── Build ────────────────────────────────────────────────────────────────────

/**
 * Run `bunx vite build` in the staged client tree so the SPA bundle the
 * customer's reverse proxy serves (`client/dist/`) matches the new server.
 *
 * Without this step, after the binary swap the customer would have new
 * server APIs but stale frontend code — usually visible as JSON parse errors
 * in the browser console because the old SPA expects the old payload shape.
 *
 * Skippable when the artifact already includes a built dist/ (some release
 * pipelines bake the build into the tarball — set UPDATE_SKIP_BUILD=true).
 */
async function buildClient(runId: number, stagingDir: string): Promise<void> {
  if (process.env.UPDATE_SKIP_BUILD === "true") {
    await logEvent(runId, "info", "build", "Skipped (UPDATE_SKIP_BUILD=true)");
    return;
  }
  const bun       = process.env.UPDATE_BUN_BIN || "bun";
  const clientDir = path.join(stagingDir, "client");
  // If the staged tree has no client/ directory, this is a server-only build —
  // skip without raising. (Operator-only releases sometimes ship just the API.)
  try {
    await fs.access(clientDir);
  } catch {
    await logEvent(runId, "info", "build", "No client/ directory in artifact — skipping build");
    return;
  }
  // If the artifact already ships a built dist/, skip rebuilding. This lets
  // CI bake the bundle once and removes vite from the customer's hot path
  // entirely — the single biggest source of "stuck at build" failures.
  const prebuiltIndex = path.join(clientDir, "dist", "index.html");
  try {
    await fs.access(prebuiltIndex);
    await logEvent(runId, "info", "build",
      `Pre-built client/dist found at ${prebuiltIndex} — skipping vite build`);
    return;
  } catch { /* no pre-built bundle; proceed to vite */ }

  // vite uses several ~/.cache scratch paths that aren't writable under our
  // hardened systemd unit. Same env redirection as installDeps.
  const env = buildBuildEnv(stagingDir);
  await fs.mkdir(env.HOME!, { recursive: true });
  await announceCacheStrategy(runId, "build", env);

  // Cap Node's heap. Vite 5/6 can spike to 1.5–2 GB on medium-large SPAs;
  // without a cap, V8 grows past the cgroup limit and the kernel OOM-killer
  // reaps bun mid-build (symptom: silent hang, then exit 137 / SIGKILL).
  const heapMb = numEnv("UPDATE_BUILD_NODE_MAX_MB", 2048);
  env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ""} --max-old-space-size=${heapMb}`.trim();

  await logEvent(runId, "info", "build", `Building SPA in ${clientDir} (heap=${heapMb}MB)`);
  try {
    await streamExec(runId, "build", bun, ["x", "vite", "build", "--logLevel", "warn"], {
      cwd: clientDir,
      env,
      timeoutMs: numEnv("UPDATE_BUILD_TIMEOUT_MS", 20 * 60_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Re-throw with operator guidance attached. The orchestrator's catch block
    // will surface this to the UI and the failed-step copy explains the
    // common remediations without requiring a doc lookup.
    throw new Error(
      `${msg}\n\nRemediation options:\n` +
      `  • If the build OOMed, raise UPDATE_BUILD_NODE_MAX_MB (currently ${heapMb}) ` +
      `in /opt/zentra/app/server/.env, or give the host more RAM.\n` +
      `  • If the build timed out, raise UPDATE_BUILD_TIMEOUT_MS.\n` +
      `  • To skip the on-box build entirely, ship client/dist in the release ` +
      `tarball or set UPDATE_SKIP_BUILD=true.`
    );
  }
}

// ── Finalize ─────────────────────────────────────────────────────────────────

/**
 * Detach and run the privileged finalize helper. We pre-flight that:
 *   1. The helper exists at $FINALIZE_HELPER (default /usr/local/sbin/...)
 *   2. We can sudo it without a password (via the sudoers drop-in)
 *
 * If both checks pass, we spawn it fully detached and return — the helper's
 * `systemctl restart` will SIGTERM us shortly after. The new replica boots
 * onto the new code, and `reconcileInFlightUpdates()` (in lib/release.ts)
 * marks this run `done` and clears maintenance mode.
 *
 * If either check fails, we fall back to the legacy `restart_required`
 * state with copy-paste instructions for the operator. The customer's UI
 * will display them; the run remains non-terminal until a manual restart
 * boots the new code, at which point boot reconciliation finishes the run.
 */
async function runFinalize(runId: number, stagingDir: string, manifest: ReleaseManifest) {
  const appDir        = process.env.UPDATE_APP_DIR        || "/opt/zentra/app";
  const servicePrefix = process.env.UPDATE_SERVICE_PREFIX || "zentra-api";

  // Helper must exist on disk.
  const helperOk = await fs.access(FINALIZE_HELPER).then(() => true).catch(() => false);

  // sudo -n -l checks "can I run this exact command without a password?"
  // Returns 0 if yes, non-zero otherwise. We keep stdout/stderr quiet so
  // the failure case stays clean in logs.
  let sudoOk = false;
  if (helperOk) {
    try {
      await execAsync("sudo", ["-n", "-l", FINALIZE_HELPER]);
      sudoOk = true;
    } catch { sudoOk = false; }
  }

  if (helperOk && sudoOk) {
    await logEvent(runId, "info", "finalize",
      `Auto-finalize: spawning ${FINALIZE_HELPER} ${stagingDir} (we will be restarted shortly)`);

    // Detach so the helper survives our SIGTERM. stdio: "ignore" drops file
    // descriptors so the parent can fully release; unref() lets the parent
    // exit (or be killed) without waiting on the child.
    const child = spawn("sudo", ["-n", FINALIZE_HELPER, stagingDir], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        APP_DIR:        appDir,
        SERVICE_PREFIX: servicePrefix,
      },
    });
    child.unref();

    // Give the helper a head start so its rsync isn't racing the systemctl
    // command's SIGTERM against our heartbeat. The actual restart happens
    // ~1-2s after rsync completes.
    await new Promise(r => setTimeout(r, 500));
    return;
  }

  // ── Fallback: legacy manual flow ──────────────────────────────────────────
  await transition(runId, "restart_required", "restart_required");
  const why = !helperOk
    ? `Privileged helper ${FINALIZE_HELPER} is not installed.`
    : `Privileged helper exists but sudo NOPASSWD is not configured.`;
  await logEvent(runId, "warn", "restart_required",
    [
      `Auto-finalize unavailable: ${why}`,
      ``,
      `To enable one-click updates, run on this host (once):`,
      `  sudo bash scripts/enable-update-orchestrator.sh --restart`,
      ``,
      `For now, finish this update manually:`,
      `  sudo rsync -a --delete --exclude=/server/.env --exclude=/uploads ${stagingDir}/ ${appDir}/`,
      `  sudo chown -R ${process.env.UPDATE_APP_USER || "zentra"}:${process.env.UPDATE_APP_USER || "zentra"} ${appDir}`,
      `  sudo systemctl restart '${servicePrefix}@*'`,
      ``,
      `On the next clean boot of ${manifest.version}, this update will be marked done.`,
    ].join("\n"),
    { stagingDir, appDir, servicePrefix, helperOk, sudoOk });
}

// ── Migrate + data tasks ─────────────────────────────────────────────────────

/**
 * Run `prisma migrate deploy` against the STAGED schema (not the currently
 * running install's). This is the fix that makes "Apply update" actually
 * apply the new release's migrations — running it from process.cwd() would
 * just re-deploy migrations already in production.
 *
 * We invoke prisma via the running install's `bunx` because (a) the staged
 * tree has no node_modules — we don't ship them in the artifact — and
 * (b) prisma's `migrate deploy` doesn't depend on schema-syntax features
 * specific to the new release: it just reads SQL from the migrations dir
 * adjacent to the schema file, applies them via the database connection
 * string, and stops. So an older prisma binary against newer migration
 * SQL works as long as no prisma-specific declarative features changed.
 */
async function runMigrations(runId: number, stagingDir: string) {
  const schemaPath = path.join(stagingDir, "server", "prisma", "schema.prisma");
  await logEvent(runId, "info", "migrate", `Running prisma migrate deploy --schema ${schemaPath}`);
  await streamExec(
    runId,
    "migrate",
    "bunx",
    ["prisma", "migrate", "deploy", "--schema", schemaPath],
    {
      cwd: path.resolve(process.cwd(), "server"),
      timeoutMs: numEnv("UPDATE_MIGRATE_TIMEOUT_MS", 10 * 60_000),
    },
  );
}

/**
 * Load each named data task FROM THE STAGED TREE and invoke its `run`
 * function. Tasks ship inside the new release (at `server/src/data-tasks/
 * <version>/<name>.ts`) so the upgrade flow is self-contained.
 *
 * Authoring contract for a data task
 * ──────────────────────────────────
 *   export async function run(ctx: {
 *     runId: number;
 *     manifest: ReleaseManifest;
 *     prisma: PrismaClient;
 *     log: (level: "info"|"warn"|"error", msg: string, data?: object) => Promise<void>;
 *   }): Promise<void>
 *
 * Tasks should:
 *   • use only the injected `prisma` client (NOT a relative `../db` import,
 *     which would fail to resolve from the staged tree)
 *   • be idempotent (safe to retry if the orchestrator dies mid-task)
 *   • throw on failure — the orchestrator catches and marks the run failed
 */
async function runDataTasks(runId: number, manifest: ReleaseManifest, stagingDir: string) {
  if (manifest.dataTasks.length === 0) {
    await logEvent(runId, "info", "data_tasks", "No data tasks for this release");
    return;
  }
  // Lazy import to avoid circulars at module load.
  const { pathToFileURL } = await import("node:url");

  for (const taskName of manifest.dataTasks) {
    const taskPath = path.join(stagingDir, "server", "src", "data-tasks", manifest.version, `${taskName}.ts`);
    await logEvent(runId, "info", "data_tasks", `Running ${taskName} from ${taskPath}`);
    try {
      await fs.access(taskPath);
    } catch {
      throw new Error(`Data task ${taskName} not found at ${taskPath}`);
    }
    let mod: { run?: (ctx: object) => Promise<void> };
    try {
      mod = await import(pathToFileURL(taskPath).href);
    } catch (err) {
      throw new Error(`Failed to load data task ${taskName}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (typeof mod.run !== "function") {
      throw new Error(`Data task ${taskName} has no exported run() function`);
    }
    try {
      await mod.run({
        runId,
        manifest,
        prisma,
        log: (level: "info"|"warn"|"error", msg: string, data?: Record<string, unknown>) =>
          logEvent(runId, level, "data_tasks", `[${taskName}] ${msg}`, data),
      });
      await logEvent(runId, "info", "data_tasks", `Completed: ${taskName}`);
    } catch (err) {
      throw new Error(`Data task ${taskName} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function enqueueApplyUpdate(runId: number) {
  await boss.send(QUEUE_NAME, { runId });
}

export async function registerApplyUpdateWorker() {
  await boss.createQueue(QUEUE_NAME);
  await boss.work(QUEUE_NAME, { batchSize: 1, includeMetadata: false }, async (jobs) => {
    for (const job of jobs) {
      const { runId } = job.data as { runId: number };
      try {
        await runOrchestrator(runId);
      } catch (err) {
        Sentry.captureException(err, { tags: { context: "update-orchestrator", runId: String(runId) } });
        // Best-effort: mark the run failed if we crashed before the orchestrator could.
        try {
          await prisma.updateRun.update({
            where: { id: runId },
            data: {
              state:        "failed",
              errorMessage: err instanceof Error ? err.message : String(err),
              errorStep:    "worker",
              finishedAt:   new Date(),
            },
          });
        } catch { /* swallow */ }
      }
    }
  });
}

/** Execute a run from start to finish. Caller must have already created the row. */
async function runOrchestrator(runId: number) {
  const run = await prisma.updateRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`UpdateRun ${runId} not found`);
  if (run.state !== "queued") {
    // Already started by another worker / previous boot. Don't double-run.
    await logEvent(runId, "warn", "worker", `Skipping run already in state ${run.state}`);
    return;
  }

  const manifest = run.manifest as ReleaseManifest;

  await transition(runId, "preflight", "preflight", { startedAt: new Date() });
  try {
    await preflight(runId, manifest);

    await transition(runId, "backup", "backup");
    const backupPath = await backup(runId, manifest.version);
    await prisma.updateRun.update({ where: { id: runId }, data: { backupPath } });

    await transition(runId, "maintenance_on", "maintenance_on");
    await setMaintenance(runId, true);

    await transition(runId, "fetch", "fetch");
    const { artifactPath } = await fetchArtifact(runId, manifest);
    await logEvent(runId, "info", "fetch", `Artifact ready at ${artifactPath}`);

    await transition(runId, "verify", "verify");
    // (verify already done as part of fetchArtifact; this is a placeholder
    // for future signature checks against a separate keypair).

    await transition(runId, "extract", "extract");
    const stagingDir = await extractArtifact(runId, artifactPath, manifest);

    await transition(runId, "install_deps", "install_deps");
    await installDeps(runId, stagingDir);

    await transition(runId, "migrate", "migrate");
    await runMigrations(runId, stagingDir);

    await transition(runId, "data_tasks", "data_tasks");
    await runDataTasks(runId, manifest, stagingDir);

    await transition(runId, "build", "build");
    await buildClient(runId, stagingDir);

    // Finalize: swap the staged tree into the live $APP_DIR and restart the
    // replicas. This is the step that takes the customer from "new code is
    // ready" to "new code is running" — without any SSH session.
    //
    // We can't do this from the unprivileged helpdesk process directly:
    // - rsyncing into $APP_DIR requires write access we don't have
    // - `systemctl restart` of a system unit needs root
    //
    // The privileged helper at $FINALIZE_HELPER (installed by install.sh /
    // enable-update-orchestrator.sh, with a sudoers NOPASSWD entry) does
    // both. We invoke it as a fully detached child so it survives our own
    // imminent SIGTERM when the restart kicks in.
    //
    // After the restart, the new replica's boot logic in lib/release.ts
    // will reconcile this update_run row to `done` and clear maintenance
    // mode automatically.
    await transition(runId, "finalize", "finalize");
    await runFinalize(runId, stagingDir, manifest);
    // We almost certainly never reach here — the helper restarts us mid-call.
    // If we do (e.g. helper isn't installed), runFinalize has transitioned
    // the run into `restart_required` with operator instructions.
    return;

    // Note: maintenance_off intentionally NOT toggled here — the operator
    // turns it off after restarting and verifying. That keeps the gate in
    // place during the brief window where the binary is being swapped.
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Re-read the row so we capture the ACTUAL step that failed, not the
    // initial 'queued' value `run` was loaded with at the top of this fn.
    const live = await prisma.updateRun.findUnique({
      where: { id: runId },
      select: { state: true, currentStep: true },
    });
    const failedStep = live?.currentStep ?? live?.state ?? "unknown";
    await logEvent(runId, "error", failedStep, msg);
    await transition(runId, "failed", failedStep, {
      errorMessage: msg,
      errorStep:    failedStep,
      finishedAt:   new Date(),
    });
    // Best-effort: drop maintenance mode on failure so the install stays usable
    // while the operator investigates. (If maintenance_on was the failing step
    // we already aren't in maintenance mode — toggle is idempotent.)
    try { await setMaintenance(runId, false); } catch { /* swallow */ }
    return;
  }

  await transition(runId, "done", null, { finishedAt: new Date() });
  await logEvent(runId, "info", "done", "Update flow finished");
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function compareSemver(a: string, b: string): number {
  const parse = (s: string) => s.split("-")[0]!.split(".").map(n => Number(n) || 0);
  const [aMaj = 0, aMin = 0, aPatch = 0] = parse(a);
  const [bMaj = 0, bMin = 0, bPatch = 0] = parse(b);
  return aMaj - bMaj || aMin - bMin || aPatch - bPatch;
}

function execAsync(
  cmd: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        maxBuffer: 10 * 1024 * 1024,
      },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve({ stdout, stderr });
      },
    );
  });
}

/**
 * Build the env block for bun/vite invocations during an update.
 *
 * The systemd unit hardens us with `ProtectSystem=strict` + `ProtectHome=true`,
 * which means bun's defaults (`$HOME/.bun/install/cache`, plus various
 * `~/.cache/...` scratch dirs vite uses) sit on a read-only mount and bun
 * dies with `unable to write files to tempdir: ReadOnlyFileSystem`.
 *
 * We redirect every writable path bun/vite touch into the staging dir,
 * which IS writable (it's in `ReadWritePaths`). The cache is therefore
 * fresh per-update — that's slower than persisting it, but reliable on
 * locked-down units. Operators can opt into a persistent cache by setting
 * `UPDATE_BUN_CACHE_DIR=/opt/zentra/.bun-cache` (in .env) and adding that
 * path to `ReadWritePaths` in the systemd unit.
 */
function buildBuildEnv(stagingDir: string): NodeJS.ProcessEnv {
  const cacheDir = process.env.UPDATE_BUN_CACHE_DIR || path.join(stagingDir, ".bun-cache");
  const tmpDir   = process.env.UPDATE_TMPDIR || "/tmp"; // PrivateTmp namespace; writable
  return {
    ...process.env,
    HOME:                  cacheDir,  // bun + vite both look at HOME for several scratch paths
    XDG_CACHE_HOME:        cacheDir,
    BUN_INSTALL_CACHE_DIR: cacheDir,  // bun's documented cache override
    TMPDIR:                tmpDir,
    TMP:                   tmpDir,
    TEMP:                  tmpDir,
  };
}

/** Parse an env var as a positive integer, falling back to `fallback`. */
function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Emit one event noting whether the bun/vite cache is persistent across
 * updates or thrown away with the staging dir. Operators chasing slow
 * builds need this visibility — a fresh cache adds ~30-60s per update
 * because esbuild/rollup native binaries get re-fetched.
 */
async function announceCacheStrategy(runId: number, step: string, env: NodeJS.ProcessEnv) {
  const persistent = !!process.env.UPDATE_BUN_CACHE_DIR;
  if (persistent) {
    await logEvent(runId, "info", step, `Using persistent bun cache at ${env.BUN_INSTALL_CACHE_DIR}`);
  } else {
    await logEvent(runId, "info", step,
      `Using throwaway bun cache at ${env.BUN_INSTALL_CACHE_DIR} ` +
      `(set UPDATE_BUN_CACHE_DIR + add it to systemd ReadWritePaths for faster updates)`);
  }
}

/**
 * Spawn a long-running child process with proper visibility:
 *   • streams stdout/stderr line-by-line, throttled to ≤1 event every 2s
 *     so we don't hammer the DB on chatty builds (vite emits ~1 line per chunk)
 *   • heartbeats every 15s with elapsed seconds, so the UI never looks dead
 *     even during phases where the child is silent (e.g. tarball download
 *     inside `bun install`, or vite's transform pass before output)
 *   • enforces `timeoutMs` (kills the process group with SIGTERM, then SIGKILL
 *     after a 5s grace) and surfaces a clear timeout error
 *   • classifies SIGKILL exits as "likely OOM" — the most common silent
 *     failure mode on memory-constrained hosts — with actionable remediation
 *   • retains a tail of the last 50 stdout + 50 stderr lines and includes
 *     them in the failure error message
 *
 * Drop-in replacement for execAsync() in cases where the child can run for
 * minutes and/or produce more than a few MB of output.
 */
function streamExec(
  runId: number,
  step: string,
  cmd: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: options.env,
      // Detached + own process group so SIGTERM/SIGKILL on timeout reaps any
      // grandchildren (vite spawns esbuild workers, bun spawns network procs).
      detached: process.platform !== "win32",
    });

    const stdoutTail: string[] = [];
    const stderrTail: string[] = [];
    const TAIL_MAX = 50;
    let pendingLines: string[] = [];
    let lastFlush = 0;
    let flushTimer: NodeJS.Timeout | null = null;
    const FLUSH_INTERVAL = 2_000;

    const flush = () => {
      if (pendingLines.length === 0) {
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
        return;
      }
      const chunk = pendingLines.join("\n");
      pendingLines = [];
      lastFlush = Date.now();
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      // Best-effort: don't reject the whole exec just because a log write
      // hit a transient DB blip; swallow per-line logging errors.
      logEvent(runId, "info", step, chunk).catch(() => {});
    };

    const onLine = (line: string, tail: string[]) => {
      if (!line) return;
      tail.push(line);
      while (tail.length > TAIL_MAX) tail.shift();
      pendingLines.push(line);
      const now = Date.now();
      if (now - lastFlush >= FLUSH_INTERVAL) {
        flush();
      } else if (!flushTimer) {
        flushTimer = setTimeout(flush, FLUSH_INTERVAL - (now - lastFlush));
      }
    };

    // Line-buffer each stream — children rarely flush on line boundaries so
    // we maintain a small carry-over buffer and split on '\n'.
    let outBuf = "";
    let errBuf = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      outBuf += chunk.toString("utf8");
      const lines = outBuf.split("\n");
      outBuf = lines.pop() ?? "";
      for (const line of lines) onLine(line, stdoutTail);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      errBuf += chunk.toString("utf8");
      const lines = errBuf.split("\n");
      errBuf = lines.pop() ?? "";
      for (const line of lines) onLine(line, stderrTail);
    });

    // Heartbeat: emit "still running, Ns elapsed" so the UI shows liveness
    // even during long silent phases. Suppressed when we just flushed output.
    const heartbeat = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      if (Date.now() - lastFlush > 10_000) {
        logEvent(runId, "info", step, `${cmd} still running (${elapsed}s elapsed)`).catch(() => {});
        lastFlush = Date.now();
      }
    }, 15_000);

    // Timeout: SIGTERM → 5s grace → SIGKILL the whole process group.
    let timedOut = false;
    const timeoutMs = options.timeoutMs ?? 0;
    const timeoutTimer = timeoutMs > 0 ? setTimeout(() => {
      timedOut = true;
      try {
        if (process.platform !== "win32" && child.pid) {
          process.kill(-child.pid, "SIGTERM");
          setTimeout(() => {
            try { if (child.pid) process.kill(-child.pid, "SIGKILL"); } catch { /* already dead */ }
          }, 5_000).unref();
        } else {
          child.kill("SIGTERM");
        }
      } catch { /* already dead */ }
    }, timeoutMs) : null;
    timeoutTimer?.unref();

    const cleanup = () => {
      clearInterval(heartbeat);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (flushTimer)   clearTimeout(flushTimer);
      // Flush any straggler bytes left in the line buffers.
      if (outBuf) { stdoutTail.push(outBuf); pendingLines.push(outBuf); outBuf = ""; }
      if (errBuf) { stderrTail.push(errBuf); pendingLines.push(errBuf); errBuf = ""; }
      flush();
    };

    child.on("error", (err) => {
      cleanup();
      reject(new Error(`Failed to spawn ${cmd}: ${err.message}`));
    });

    child.on("close", (code, signal) => {
      cleanup();
      const elapsed = Math.floor((Date.now() - start) / 1000);

      if (timedOut) {
        reject(new Error(
          `${cmd} ${args.join(" ")} timed out after ${elapsed}s ` +
          `(limit ${Math.floor(timeoutMs / 1000)}s). ` +
          `Last stderr:\n${stderrTail.slice(-10).join("\n") || "(empty)"}`
        ));
        return;
      }

      if (code === 0) {
        logEvent(runId, "info", step, `${cmd} completed in ${elapsed}s`).catch(() => {});
        resolve();
        return;
      }

      // SIGKILL / exit 137 on Linux almost always means the kernel
      // OOM-killer reaped the process. Surface that explicitly because the
      // child usually produces no error output before dying.
      const oomLikely = signal === "SIGKILL" || code === 137;
      const tail = stderrTail.slice(-20).join("\n") || stdoutTail.slice(-20).join("\n") || "(no output captured)";
      const hint = oomLikely
        ? ` — likely killed by the kernel OOM-killer (signal=${signal ?? "SIGKILL"}). ` +
          `Lower UPDATE_BUILD_NODE_MAX_MB or give the host more RAM.`
        : "";
      reject(new Error(
        `${cmd} exited with code=${code} signal=${signal ?? "none"} after ${elapsed}s${hint}\n` +
        `Last output:\n${tail}`
      ));
    });
  });
}
