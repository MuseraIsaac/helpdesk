-- Add source column to ticket
-- Tracks how the ticket was created: "email", "portal", "agent", or null for legacy rows.
ALTER TABLE "ticket" ADD COLUMN "source" TEXT;

-- CreateTable: saved_ticket_view
-- Stores named, savable ticket list view configurations per user.
-- config is JSONB — shape validated by SavedViewConfig in core/schemas/ticket-view.ts.
-- isDefault tracks the user's active column layout (one per user at a time, enforced in app layer).

CREATE TABLE "saved_ticket_view" (
    "id"         SERIAL NOT NULL,
    "user_id"    TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "emoji"      TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_shared"  BOOLEAN NOT NULL DEFAULT false,
    "config"     JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_ticket_view_pkey" PRIMARY KEY ("id")
);

-- FK: user_id → user(id), cascade on delete so views are cleaned up with user
ALTER TABLE "saved_ticket_view"
    ADD CONSTRAINT "saved_ticket_view_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Index for efficient per-user lookups
CREATE INDEX "saved_ticket_view_user_id_idx" ON "saved_ticket_view"("user_id");

-- Index for fetching all shared views
CREATE INDEX "saved_ticket_view_is_shared_idx" ON "saved_ticket_view"("is_shared");
