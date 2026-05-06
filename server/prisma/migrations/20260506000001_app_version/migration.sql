-- AppVersion: append-only history of every release this install has booted.
-- See server/prisma/schema.prisma for full documentation.
CREATE TABLE "app_version" (
  "id"           SERIAL       PRIMARY KEY,
  "version"      VARCHAR(40)  NOT NULL,
  "kind"         VARCHAR(20)  NOT NULL,
  "fromVersion"  VARCHAR(40),
  "manifest"     JSONB        NOT NULL,
  "appliedById"  TEXT,
  "appliedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "app_version_appliedAt_idx" ON "app_version" ("appliedAt");
