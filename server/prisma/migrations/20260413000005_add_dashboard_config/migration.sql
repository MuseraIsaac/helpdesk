-- CreateTable: dashboard_config
-- Stores named, savable dashboard configurations per user (or shared across org).
-- config is JSONB — shape is validated by DashboardConfigData in core/schemas/dashboard.ts.
-- UserPreference.default_dashboard (already exists) is reused to point at the active config id.

CREATE TABLE "dashboard_config" (
    "id"         SERIAL NOT NULL,
    "user_id"    TEXT,
    "name"       TEXT NOT NULL,
    "is_shared"  BOOLEAN NOT NULL DEFAULT false,
    "config"     JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_config_pkey" PRIMARY KEY ("id")
);

-- FK: user_id → user(id), cascade on delete so dashboards are cleaned up with user
ALTER TABLE "dashboard_config"
    ADD CONSTRAINT "dashboard_config_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Index for efficient per-user lookups
CREATE INDEX "dashboard_config_user_id_idx" ON "dashboard_config"("user_id");

-- Index for fetching all shared dashboards
CREATE INDEX "dashboard_config_is_shared_idx" ON "dashboard_config"("is_shared");
