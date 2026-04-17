-- CreateEnum
CREATE TYPE "VirusScanStatus" AS ENUM ('pending', 'clean', 'infected', 'skipped');

-- AlterTable: add storage metadata and virus-scan columns to attachment
ALTER TABLE "attachment"
  ADD COLUMN "storageProvider" TEXT        NOT NULL DEFAULT 'local',
  ADD COLUMN "checksum"        TEXT,
  ADD COLUMN "virusScanStatus" "VirusScanStatus" NOT NULL DEFAULT 'skipped';

-- Backfill: all pre-existing rows were stored locally without a scan
-- storageProvider already defaults to 'local' via the ADD COLUMN DEFAULT
-- virusScanStatus already defaults to 'skipped' via the ADD COLUMN DEFAULT

-- CreateIndex
CREATE INDEX "attachment_virusScanStatus_idx" ON "attachment"("virusScanStatus");
