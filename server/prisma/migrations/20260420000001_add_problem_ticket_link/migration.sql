-- CreateTable
CREATE TABLE "problem_ticket_link" (
    "id" SERIAL NOT NULL,
    "problem_id" INTEGER NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linked_by_id" TEXT,

    CONSTRAINT "problem_ticket_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "problem_ticket_link_problem_id_ticket_id_key" ON "problem_ticket_link"("problem_id", "ticket_id");

-- CreateIndex
CREATE INDEX "problem_ticket_link_problem_id_idx" ON "problem_ticket_link"("problem_id");

-- CreateIndex
CREATE INDEX "problem_ticket_link_ticket_id_idx" ON "problem_ticket_link"("ticket_id");

-- AddForeignKey
ALTER TABLE "problem_ticket_link" ADD CONSTRAINT "problem_ticket_link_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_ticket_link" ADD CONSTRAINT "problem_ticket_link_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_ticket_link" ADD CONSTRAINT "problem_ticket_link_linked_by_id_fkey" FOREIGN KEY ("linked_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
