-- Editable role definitions
--
-- Replaces the static "Role" enum with a "role" table so admins can rename,
-- create, and re-permission roles at runtime. User.role becomes a string
-- column referencing role.key; built-in role keys are preserved so existing
-- string comparisons (req.user.role === "admin", etc.) continue to work.

-- ── 1. Create the role table ────────────────────────────────────────────────
CREATE TABLE "role" (
  "key"          VARCHAR(64) PRIMARY KEY,
  "name"         VARCHAR(128) NOT NULL,
  "description"  TEXT,
  "is_builtin"   BOOLEAN     NOT NULL DEFAULT FALSE,
  "is_system"    BOOLEAN     NOT NULL DEFAULT FALSE,
  "permissions"  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  "color"        VARCHAR(16),
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── 2. Seed built-in roles ──────────────────────────────────────────────────
-- Permission arrays are intentionally empty here; the server hydrates each
-- builtin's permissions from BUILTIN_ROLE_PERMISSIONS on boot if the column
-- is empty (so future additions to the canonical permission set propagate).
INSERT INTO "role" ("key", "name", "description", "is_builtin", "is_system", "color", "permissions") VALUES
  ('admin',      'Administrator', 'Full platform access. Cannot be deleted.',                                            TRUE, TRUE,  '#ef4444', '[]'::jsonb),
  ('supervisor', 'Supervisor',    'Team lead and ITSM process owner. Full ITSM module access plus CAB approval.',         TRUE, FALSE, '#8b5cf6', '[]'::jsonb),
  ('agent',      'Agent',         'Frontline ITSM operator. Works incidents, requests, problems and tasks.',              TRUE, FALSE, '#3b82f6', '[]'::jsonb),
  ('readonly',   'Read-only',     'Auditor / observer. Full read access across all modules; cannot create or edit.',     TRUE, FALSE, '#64748b', '[]'::jsonb),
  ('customer',   'Customer',      'Self-service portal user. Not exposed in the agent role editor.',                      TRUE, TRUE,  '#94a3b8', '[]'::jsonb);

-- ── 3. Drop dependent materialized views before altering user.role ──────────
-- The mv_agent_daily_stats view references user.role and prevents the type
-- change. It is recreated automatically by bootstrapMaterializedViews() on
-- the next server boot, so dropping it here is safe.
DROP MATERIALIZED VIEW IF EXISTS mv_agent_daily_stats;

-- ── 4. Convert user.role from enum → varchar ────────────────────────────────
ALTER TABLE "user" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "user" ALTER COLUMN "role" TYPE VARCHAR(64) USING "role"::TEXT;
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'agent';

-- ── 5. Add FK from user.role → role.key ─────────────────────────────────────
ALTER TABLE "user"
  ADD CONSTRAINT "user_role_fkey"
  FOREIGN KEY ("role") REFERENCES "role"("key")
  ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX "user_role_idx" ON "user"("role");

-- ── 6. Drop the old Role enum type ──────────────────────────────────────────
-- Safe because user.role no longer references it and no other table uses it.
DROP TYPE "Role";
