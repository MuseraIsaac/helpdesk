-- CreateEnum
CREATE TYPE "EscalationReason" AS ENUM ('first_response_sla_breach', 'resolution_sla_breach', 'urgent_priority', 'sev1_severity', 'manual');

-- AlterTable
ALTER TABLE "ticket" ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "escalationReason" "EscalationReason",
ADD COLUMN     "isEscalated" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "escalation_event" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "reason" "EscalationReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escalation_event_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "escalation_event" ADD CONSTRAINT "escalation_event_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
