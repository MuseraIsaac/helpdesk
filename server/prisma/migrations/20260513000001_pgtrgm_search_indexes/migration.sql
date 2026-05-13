-- Postgres trigram (pg_trgm) extension + GIN indexes for substring search.
--
-- Why:
--   The ticket / asset list endpoints search via `column ILIKE '%term%'`
--   (Prisma's `{ contains: q, mode: "insensitive" }`). On unindexed text
--   columns this is a full sequential scan — fine on 100 rows, brutal on
--   100 000. pg_trgm's GIN-on-trigrams index lets Postgres serve those
--   ILIKE queries with a real index, often 10-100x faster at scale.
--
-- Notes:
--   - Indexes use IF NOT EXISTS so re-running is safe.
--   - `gin_trgm_ops` is the operator class that makes the GIN index
--     work for LIKE/ILIKE/~~* operators.
--   - Table names follow Prisma's @@map() values (snake_case, lowercase).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Ticket text fields (table: ticket) ───────────────────────────────────────
-- Used by GET /api/tickets, /api/tickets/search.
CREATE INDEX IF NOT EXISTS idx_ticket_subject_trgm
  ON "ticket" USING gin (subject gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_ticket_sender_name_trgm
  ON "ticket" USING gin ("senderName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_ticket_sender_email_trgm
  ON "ticket" USING gin ("senderEmail" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_ticket_number_trgm
  ON "ticket" USING gin (ticket_number gin_trgm_ops);

-- ── Asset text fields (table: asset) ─────────────────────────────────────────
-- Used by GET /api/assets (7-field OR ILIKE search).
CREATE INDEX IF NOT EXISTS idx_asset_name_trgm
  ON "asset" USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_asset_number_trgm
  ON "asset" USING gin (asset_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_asset_manufacturer_trgm
  ON "asset" USING gin (manufacturer gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_asset_model_trgm
  ON "asset" USING gin (model gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_asset_serial_trgm
  ON "asset" USING gin (serial_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_asset_tag_trgm
  ON "asset" USING gin (asset_tag gin_trgm_ops);

-- ── Customer / Organization name search ──────────────────────────────────────
-- Used by /api/customers + /api/organizations search params.
CREATE INDEX IF NOT EXISTS idx_customer_name_trgm
  ON "customer" USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customer_email_trgm
  ON "customer" USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_organization_name_trgm
  ON "organization" USING gin (name gin_trgm_ops);
