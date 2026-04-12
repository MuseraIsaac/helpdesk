-- ── 1. ticket_counter: atomic sequence table ──────────────────────────────────
-- Composite PK (series, period_key) lets each series share the table and
-- supports yearly/monthly resets without any schema changes.
CREATE TABLE ticket_counter (
  series     TEXT    NOT NULL,
  period_key TEXT    NOT NULL DEFAULT '',
  last_value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (series, period_key)
);

-- ── 2. Add ticket_number column (nullable for the backfill step) ───────────────
ALTER TABLE ticket ADD COLUMN ticket_number TEXT;

-- ── 3. Backfill all existing tickets with generic numbers ─────────────────────
-- Format: TKT + zero-padded ID (6 digits, matching the generic series default).
-- All pre-existing tickets receive a generic number regardless of their
-- ticketType — this is the safest backfill strategy: no type-specific counters
-- need to be seeded for types already in use, and the numbers are visually
-- distinct from future series-specific ones.
UPDATE ticket
SET ticket_number = 'TKT' || lpad(id::text, 6, '0');

-- ── 4. Seed the generic counter so future tickets continue from MAX(id) ────────
-- Only inserted when existing tickets exist; fresh installs get no seed row
-- and will use the startAt value from settings (default 1000).
DO $$
DECLARE
  max_id INTEGER;
BEGIN
  SELECT MAX(id) INTO max_id FROM ticket;
  IF max_id IS NOT NULL THEN
    INSERT INTO ticket_counter (series, period_key, last_value)
    VALUES ('generic', '', max_id);
  END IF;
END $$;

-- ── 5. Apply NOT NULL + UNIQUE constraints ────────────────────────────────────
ALTER TABLE ticket ALTER COLUMN ticket_number SET NOT NULL;
ALTER TABLE ticket ADD CONSTRAINT ticket_ticket_number_key UNIQUE (ticket_number);

-- ── 6. Index for fast search / lookup by ticket number ────────────────────────
CREATE INDEX idx_ticket_ticket_number ON ticket (ticket_number);
