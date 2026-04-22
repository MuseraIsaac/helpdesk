-- Migration: add_demo_batch
-- Run with: bun prisma db push  OR  bun prisma migrate dev --name add_demo_batch
--
-- Adds the demo_batch table that tracks every demo-data generation run.
-- Safe to apply on a live database — no existing tables are modified.

CREATE TABLE IF NOT EXISTS demo_batch (
  id                SERIAL PRIMARY KEY,
  label             VARCHAR(200) NOT NULL,
  status            VARCHAR(20)  NOT NULL DEFAULT 'generating',
  generated_by_id   TEXT         NOT NULL,
  generated_by_name VARCHAR(200) NOT NULL DEFAULT '',
  error_message     TEXT,
  completed_at      TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ,
  record_ids        JSONB        NOT NULL DEFAULT '{}',
  record_counts     JSONB        NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS demo_batch_status_idx ON demo_batch (status);

COMMENT ON TABLE demo_batch IS
  'Tracks each demo-data generation run and the IDs of every record it created, enabling safe isolated deletion.';
