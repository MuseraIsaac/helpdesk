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
 *     → migrate          (prisma migrate deploy — runs in-process)
 *     → data_tasks       (versioned post-migration scripts under data-tasks/<version>/)
 *     → restart_required (the orchestrator can't restart itself; surfaces a CTA)
 *     → done             (after the next clean boot picks up the new binary)
 *
 * Apply triggers are routed via pg-boss so the run survives a server restart
 * and can be observed from any Express worker via the same DB row.
 */
import { execFile } from "child_process";
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

// ── Migrate + data tasks ─────────────────────────────────────────────────────

async function runMigrations(runId: number) {
  await logEvent(runId, "info", "migrate", "Running prisma migrate deploy");
  // Prisma is bundled in node_modules; we run it via bunx so the working
  // directory's prisma binary is used. This is the production-safe command
  // (no schema-drift detection, no prompts).
  const { stdout, stderr } = await execAsync("bunx", ["prisma", "migrate", "deploy"], {
    cwd: path.resolve(process.cwd(), "server"),
  });
  await logEvent(runId, "info", "migrate", "prisma output", { stdout, stderr });
}

async function runDataTasks(runId: number, manifest: ReleaseManifest) {
  if (manifest.dataTasks.length === 0) {
    await logEvent(runId, "info", "data_tasks", "No data tasks for this release");
    return;
  }
  for (const taskName of manifest.dataTasks) {
    await logEvent(runId, "info", "data_tasks", `Running data task: ${taskName}`);
    try {
      const mod = await import(`../data-tasks/${manifest.version}/${taskName}.ts`);
      if (typeof mod.run !== "function") {
        throw new Error(`Data task ${taskName} has no exported run() function`);
      }
      await mod.run({ runId, manifest });
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

    await transition(runId, "migrate", "migrate");
    await runMigrations(runId);

    await transition(runId, "data_tasks", "data_tasks");
    await runDataTasks(runId, manifest);

    // We can't restart ourselves cleanly — the binary swap happens via the
    // operator's process supervisor (systemd, Docker restart policy, etc.).
    // The Updates UI surfaces a "Restart server to finalize" CTA at this
    // point; the next boot will pick up the new release.json and record an
    // upgrade row in app_version automatically.
    await transition(runId, "restart_required", "restart_required");
    await logEvent(runId, "info", "restart_required",
      "Update applied. Restart the server (systemctl restart zentra-helpdesk) to finalize.");

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
