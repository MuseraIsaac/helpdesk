-- Add email threading field to ticket (stores original inbound Message-ID)
ALTER TABLE "ticket" ADD COLUMN "emailMessageId" TEXT;

-- Add email threading field to reply (per-reply Message-ID, inbound or generated)
ALTER TABLE "reply" ADD COLUMN "emailMessageId" TEXT;

-- Attachment table
-- ticketId is always set (CASCADE ensures cleanup on ticket delete).
-- replyId is null for ticket-level attachments, set for reply-level ones.
-- uploadedById is null for inbound email attachments (no agent user).
CREATE TABLE "attachment" (
    "id"           SERIAL       NOT NULL,
    "filename"     TEXT         NOT NULL,
    "mimeType"     TEXT         NOT NULL,
    "size"         INTEGER      NOT NULL,
    "storageKey"   TEXT         NOT NULL,
    "ticketId"     INTEGER      NOT NULL,
    "replyId"      INTEGER,
    "uploadedById" TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachment_pkey"         PRIMARY KEY ("id"),
    CONSTRAINT "attachment_storageKey_key" UNIQUE ("storageKey"),

    CONSTRAINT "attachment_ticketId_fkey" FOREIGN KEY ("ticketId")
        REFERENCES "ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT "attachment_replyId_fkey"  FOREIGN KEY ("replyId")
        REFERENCES "reply"("id") ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT "attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById")
        REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "attachment_ticketId_idx" ON "attachment"("ticketId");
CREATE INDEX "attachment_replyId_idx"  ON "attachment"("replyId");
