ALTER TABLE "audit_event" ALTER COLUMN "ticketId" DROP NOT NULL;
CREATE INDEX IF NOT EXISTS "audit_event_created_at_idx" ON "audit_event"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "audit_event_action_created_at_idx" ON "audit_event"("action", "createdAt" DESC);
