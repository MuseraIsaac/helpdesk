-- Add per-item visibility control (internal | portal | both)
ALTER TABLE "catalog_item"
  ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'both';

CREATE INDEX "catalog_item_visibility_idx" ON "catalog_item" ("visibility");
