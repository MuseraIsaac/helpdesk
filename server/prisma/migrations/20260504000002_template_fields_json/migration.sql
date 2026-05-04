-- Snapshot of the source ticket's structured fields (category, priority,
-- severity, impact, urgency, ticket type, custom fields, etc.) at the
-- moment of saving. Replayed onto the new ticket form when applied.
ALTER TABLE "template" ADD COLUMN "fields" JSONB NOT NULL DEFAULT '{}';
