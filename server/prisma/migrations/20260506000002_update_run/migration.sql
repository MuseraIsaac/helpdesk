-- update_run: persisted state machine for an in-flight (or completed) update.
-- Each apply attempt creates one row; orchestrator transitions update `state`
-- and append-only progress events go into update_run_event.

CREATE TABLE "update_run" (
  "id"              SERIAL       PRIMARY KEY,
  "fromVersion"     VARCHAR(40)  NOT NULL,
  "toVersion"       VARCHAR(40)  NOT NULL,
  "manifest"        JSONB        NOT NULL,
  "state"           VARCHAR(40)  NOT NULL DEFAULT 'queued',
  "currentStep"     VARCHAR(60),
  "errorMessage"    TEXT,
  "errorStep"       VARCHAR(60),
  "backupPath"      TEXT,
  "triggeredById"   TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt"       TIMESTAMP(3),
  "finishedAt"      TIMESTAMP(3),
  "rolledBackAt"    TIMESTAMP(3),
  "rollbackOfId"    INTEGER REFERENCES "update_run"("id") ON DELETE SET NULL
);

CREATE INDEX "update_run_state_idx"     ON "update_run" ("state");
CREATE INDEX "update_run_createdAt_idx" ON "update_run" ("createdAt");

CREATE TABLE "update_run_event" (
  "id"        SERIAL       PRIMARY KEY,
  "runId"     INTEGER      NOT NULL REFERENCES "update_run"("id") ON DELETE CASCADE,
  "level"     VARCHAR(10)  NOT NULL,           -- info | warn | error
  "step"      VARCHAR(60),
  "message"   TEXT         NOT NULL,
  "data"      JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "update_run_event_runId_idx" ON "update_run_event" ("runId", "createdAt");
