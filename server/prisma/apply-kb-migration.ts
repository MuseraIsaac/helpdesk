/**
 * One-time script to apply the knowledge base migration.
 * Run: bun prisma/apply-kb-migration.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Applying knowledge base migration…");

  await prisma.$executeRawUnsafe(`CREATE TYPE "KbArticleStatus" AS ENUM ('draft', 'published')`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE "kb_category" (
      "id" SERIAL NOT NULL,
      "name" TEXT NOT NULL,
      "slug" TEXT NOT NULL,
      "description" TEXT,
      "position" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "kb_category_pkey" PRIMARY KEY ("id")
    )
  `);

  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX "kb_category_slug_key" ON "kb_category"("slug")`);

  await prisma.$executeRawUnsafe(`
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
    )
  `);

  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX "kb_article_slug_key" ON "kb_article"("slug")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX "kb_article_status_idx" ON "kb_article"("status")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX "kb_article_categoryId_idx" ON "kb_article"("categoryId")`);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "kb_article"
      ADD CONSTRAINT "kb_article_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "kb_category"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "kb_article"
      ADD CONSTRAINT "kb_article_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "user"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
  `);

  console.log("Migration applied successfully.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
