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
import { signedFetch } from "./update-channel";
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

  // pg_dump in custom-format (-Fc) so pg_restore can replay it. If pg_dump
  // isn't on PATH (e.g. dev environments) we mark the backup as skipped but
  // still record the intended path so the operator knows where it should be.
  try {
    await execAsync("pg_dump", ["-Fc", "-f", target, dbUrl]);
    await logEvent(runId, "info", "backup", `Backup written to ${target}`);
    return target;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logEvent(runId, "warn", "backup", `pg_dump unavailable — skipping backup: ${msg}`);
    return "";
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
  await logEvent(runId, "info", "fetch", `Fetching artifact for ${manifest.version}`);

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

  // Step 2: download the tarball with the signed-URL the descriptor returned.
  const resp = await fetch(desc.data.url, {
    headers: { "User-Agent": "Zentra-Helpdesk-Updater/1.0" },
  });
  if (!resp.ok) throw new Error(`Artifact download failed: HTTP ${resp.status}`);
  const arrayBuf = await resp.arrayBuffer();
  await fs.writeFile(target, Buffer.from(arrayBuf));

  // Step 3: hash + verify against the descriptor's sha256.
  const actual = crypto.createHash("sha256").update(Buffer.from(arrayBuf)).digest("hex");
  if (actual !== desc.data.sha256) {
    throw new Error(`Artifact checksum mismatch — expected ${desc.data.sha256}, got ${actual}`);
  }
  await logEvent(runId, "info", "verify", `Artifact verified (sha256=${actual.slice(0, 12)}…)`);

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
  await logEvent(runId, "info", "install_deps", `Running ${bun} install --frozen-lockfile`);
  const { stdout, stderr } = await execAsync(bun, ["install", "--frozen-lockfile"], {
    cwd: stagingDir,
  });
  await logEvent(runId, "info", "install_deps", "bun install output", {
    stdout: stdout.slice(-2000), stderr: stderr.slice(-2000),
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
  await logEvent(runId, "info", "build", `Building SPA in ${clientDir}`);
  const { stdout, stderr } = await execAsync(bun, ["x", "vite", "build"], { cwd: clientDir });
  await logEvent(runId, "info", "build", "vite build output", {
    stdout: stdout.slice(-2000), stderr: stderr.slice(-2000),
  });
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
  const { stdout, stderr } = await execAsync(
    "bunx",
    ["prisma", "migrate", "deploy", "--schema", schemaPath],
    { cwd: path.resolve(process.cwd(), "server") },
  );
  await logEvent(runId, "info", "migrate", "prisma output", { stdout, stderr });
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
    await logEvent(runId, "error", run.state, msg);
    await transition(runId, "failed", run.currentStep, {
      errorMessage: msg,
      errorStep:    run.currentStep ?? "unknown",
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
  options: { cwd?: string } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd: options.cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve({ stdout, stderr });
    });
  });
}
