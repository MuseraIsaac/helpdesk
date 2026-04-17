-- CreateEnum
CREATE TYPE "KbReviewStatus" AS ENUM ('draft', 'in_review', 'approved', 'archived');

-- CreateEnum
CREATE TYPE "KbVisibility" AS ENUM ('public', 'internal');

-- AlterTable: add new columns to kb_article
ALTER TABLE "kb_article"
  ADD COLUMN "reviewStatus"    "KbReviewStatus" NOT NULL DEFAULT 'draft',
  ADD COLUMN "visibility"      "KbVisibility"   NOT NULL DEFAULT 'public',
  ADD COLUMN "ownerId"         TEXT,
  ADD COLUMN "reviewedById"    TEXT,
  ADD COLUMN "publishedAt"     TIMESTAMP(3),
  ADD COLUMN "reviewedAt"      TIMESTAMP(3),
  ADD COLUMN "helpfulCount"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "notHelpfulCount" INTEGER NOT NULL DEFAULT 0;

-- Drop old single authorId FK and recreate with named relation
-- (authorId already exists, just add FK for owner and reviewer)
ALTER TABLE "kb_article"
  ADD CONSTRAINT "kb_article_ownerId_fkey"      FOREIGN KEY ("ownerId")      REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "kb_article_reviewedById_fkey"  FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "kb_article_reviewStatus_idx" ON "kb_article"("reviewStatus");

-- CreateTable: kb_article_version
CREATE TABLE "kb_article_version" (
  "id"            SERIAL NOT NULL,
  "articleId"     INTEGER NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "title"         TEXT NOT NULL,
  "body"          TEXT NOT NULL,
  "changeNote"    TEXT,
  "createdById"   TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "kb_article_version_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex
CREATE UNIQUE INDEX "kb_article_version_articleId_versionNumber_key"
  ON "kb_article_version"("articleId", "versionNumber");

CREATE INDEX "kb_article_version_articleId_idx" ON "kb_article_version"("articleId");

-- AddForeignKeys for kb_article_version
ALTER TABLE "kb_article_version"
  ADD CONSTRAINT "kb_article_version_articleId_fkey"   FOREIGN KEY ("articleId")   REFERENCES "kb_article"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "kb_article_version_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: kb_article_feedback
CREATE TABLE "kb_article_feedback" (
  "id"          SERIAL NOT NULL,
  "articleId"   INTEGER NOT NULL,
  "helpful"     BOOLEAN NOT NULL,
  "comment"     TEXT,
  "sessionId"   TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "kb_article_feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "kb_article_feedback_articleId_idx" ON "kb_article_feedback"("articleId");

-- AddForeignKey for kb_article_feedback
ALTER TABLE "kb_article_feedback"
  ADD CONSTRAINT "kb_article_feedback_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "kb_article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
