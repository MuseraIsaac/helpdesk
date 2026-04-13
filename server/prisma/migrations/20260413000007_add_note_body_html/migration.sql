-- Add bodyHtml column to note table
-- Stores the HTML version of the note body for rich text rendering.
-- Nullable so that existing plain-text notes are not affected.
ALTER TABLE "note" ADD COLUMN "bodyHtml" TEXT;
