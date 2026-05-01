-- Soft-delete columns for software_license and saas_subscription so they
-- participate in the global trash / recycle-bin workflow.

ALTER TABLE "software_license"
  ADD COLUMN "deleted_at"      TIMESTAMP(3),
  ADD COLUMN "deleted_by_id"   TEXT,
  ADD COLUMN "deleted_by_name" VARCHAR(200);

CREATE INDEX "software_license_deleted_at_idx" ON "software_license"("deleted_at");

ALTER TABLE "saas_subscription"
  ADD COLUMN "deleted_at"      TIMESTAMP(3),
  ADD COLUMN "deleted_by_id"   TEXT,
  ADD COLUMN "deleted_by_name" VARCHAR(200);

CREATE INDEX "saas_subscription_deleted_at_idx" ON "saas_subscription"("deleted_at");
