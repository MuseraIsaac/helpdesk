-- Migration: add asset_ticket_link table
-- Apply with:  psql $DATABASE_URL -f add_asset_ticket_link.sql
-- Or run:      cd server && bun run prisma db push   (once DB credentials are correct)

CREATE TABLE IF NOT EXISTS "public"."asset_ticket_link" (
  "asset_id"  INTEGER  NOT NULL,
  "ticket_id" INTEGER  NOT NULL,
  "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "asset_ticket_link_pkey" PRIMARY KEY ("asset_id", "ticket_id")
);

CREATE INDEX IF NOT EXISTS "asset_ticket_link_ticket_id_idx"
  ON "public"."asset_ticket_link" ("ticket_id");

ALTER TABLE "public"."asset_ticket_link"
  ADD CONSTRAINT "asset_ticket_link_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "public"."asset" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."asset_ticket_link"
  ADD CONSTRAINT "asset_ticket_link_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
