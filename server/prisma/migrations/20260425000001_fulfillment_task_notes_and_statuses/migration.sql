-- Add new fulfillment task status enum values
ALTER TYPE "FulfillmentTaskStatus" ADD VALUE IF NOT EXISTS 'assigned';
ALTER TYPE "FulfillmentTaskStatus" ADD VALUE IF NOT EXISTS 'on_hold';
ALTER TYPE "FulfillmentTaskStatus" ADD VALUE IF NOT EXISTS 'waiting_on_user';
ALTER TYPE "FulfillmentTaskStatus" ADD VALUE IF NOT EXISTS 'waiting_on_vendor';
ALTER TYPE "FulfillmentTaskStatus" ADD VALUE IF NOT EXISTS 'skipped';

-- Create FulfillmentTaskNote table
CREATE TABLE "fulfillment_task_note" (
    "id" SERIAL NOT NULL,
    "task_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "author_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfillment_task_note_pkey" PRIMARY KEY ("id")
);

-- Add index
CREATE INDEX "fulfillment_task_note_task_id_idx" ON "fulfillment_task_note"("task_id");

-- Add foreign key to fulfillment_task (cascade delete)
ALTER TABLE "fulfillment_task_note" ADD CONSTRAINT "fulfillment_task_note_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "fulfillment_task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add foreign key to user (set null on delete)
ALTER TABLE "fulfillment_task_note" ADD CONSTRAINT "fulfillment_task_note_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
