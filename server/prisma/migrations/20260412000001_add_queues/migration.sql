-- CreateTable: Team
CREATE TABLE "team" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "team_name_key" UNIQUE ("name")
);

-- CreateTable: TeamMember
CREATE TABLE "team_member" (
    "teamId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "team_member_pkey" PRIMARY KEY ("teamId","userId"),
    CONSTRAINT "team_member_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "team_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable: add teamId to ticket
ALTER TABLE "ticket" ADD COLUMN "teamId" INTEGER;
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
