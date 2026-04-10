-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "TicketSeverity" AS ENUM ('sev4', 'sev3', 'sev2', 'sev1');

-- CreateEnum
CREATE TYPE "TicketImpact" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "TicketUrgency" AS ENUM ('low', 'medium', 'high');

-- AlterTable
ALTER TABLE "ticket" ADD COLUMN     "impact" "TicketImpact",
ADD COLUMN     "priority" "TicketPriority",
ADD COLUMN     "severity" "TicketSeverity",
ADD COLUMN     "urgency" "TicketUrgency";
