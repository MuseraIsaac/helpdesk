-- CreateEnum
CREATE TYPE "KbArticleStatus" AS ENUM ('draft', 'published');

-- CreateTable
CREATE TABLE "kb_category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kb_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_article" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "KbArticleStatus" NOT NULL DEFAULT 'draft',
    "categoryId" INTEGER,
    "authorId" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kb_article_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kb_category_slug_key" ON "kb_category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "kb_article_slug_key" ON "kb_article"("slug");

-- CreateIndex
CREATE INDEX "kb_article_status_idx" ON "kb_article"("status");

-- CreateIndex
CREATE INDEX "kb_article_categoryId_idx" ON "kb_article"("categoryId");

-- AddForeignKey
ALTER TABLE "kb_article" ADD CONSTRAINT "kb_article_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "kb_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_article" ADD CONSTRAINT "kb_article_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
