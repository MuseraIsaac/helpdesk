-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('incident', 'service_request', 'problem', 'change_request');

-- AlterTable: add ticketType (nullable, default null — all existing tickets remain untyped)
ALTER TABLE "ticket" ADD COLUMN "ticketType" "TicketType";

-- AlterTable: add affectedSystem (nullable string — used primarily for incidents)
ALTER TABLE "ticket" ADD COLUMN "affectedSystem" TEXT;

-- Index on ticketType for efficient type-based filtering
CREATE INDEX "ticket_ticketType_idx" ON "ticket"("ticketType");
