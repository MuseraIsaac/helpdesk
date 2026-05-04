-- Per-template sharing scope: private (creator only) | team | everyone
ALTER TABLE "template"
  ADD COLUMN "visibility" VARCHAR(20) NOT NULL DEFAULT 'private',
  ADD COLUMN "team_id"    INTEGER;

ALTER TABLE "template"
  ADD CONSTRAINT "template_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "queue"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "template_visibility_idx"  ON "template" ("visibility");
CREATE INDEX "template_team_id_idx"     ON "template" ("team_id");
CREATE INDEX "template_created_by_idx"  ON "template" ("createdById");
