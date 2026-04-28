/**
 * Ensure the target Postgres database exists.
 *
 * Reads DATABASE_URL from server/.env (loaded by `bun --env-file`), connects to
 * the `postgres` admin database on the same host/port/user, and runs
 * `CREATE DATABASE <target>` if missing. Idempotent.
 */
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const parsed = new URL(url);
const targetDb = parsed.pathname.replace(/^\//, "").split("?")[0];
if (!targetDb) {
  console.error("Could not parse database name from DATABASE_URL");
  process.exit(1);
}

// Build an admin URL — try `postgres` then fall back to `template1` (HBA rules
// sometimes restrict the `postgres` admin DB but allow `template1`).
const adminUrl = new URL(url);
adminUrl.pathname = "/template1";
adminUrl.search   = ""; // strip ?schema=public etc.

console.log(`[ensure-db] Target database: "${targetDb}" on ${parsed.host}`);

const client = new Client({ connectionString: adminUrl.toString() });

// Set RECREATE=1 to drop the existing database first.
const recreate = process.env.RECREATE === "1";

try {
  await client.connect();
  const r = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [targetDb]);
  const exists = r.rowCount && r.rowCount > 0;
  const safeName = targetDb.replace(/"/g, '""');

  if (exists && recreate) {
    // Terminate any existing connections so the DROP can succeed
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [targetDb],
    );
    await client.query(`DROP DATABASE "${safeName}"`);
    console.log(`[ensure-db] Dropped existing "${targetDb}".`);
  }

  if (!exists || recreate) {
    await client.query(`CREATE DATABASE "${safeName}"`);
    console.log(`[ensure-db] Created database "${targetDb}".`);
  } else {
    console.log(`[ensure-db] "${targetDb}" already exists. Nothing to do.`);
  }
} catch (err) {
  console.error("[ensure-db] Failed:", err instanceof Error ? err.message : err);
  process.exit(2);
} finally {
  await client.end();
}
