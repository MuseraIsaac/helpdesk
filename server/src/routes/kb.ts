import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requireAdmin } from "../middleware/require-admin";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import { uniqueSlug } from "../lib/slugify";
import {
  createKbCategorySchema,
  updateKbCategorySchema,
  createKbArticleSchema,
  updateKbArticleSchema,
  kbArticleSearchSchema,
} from "core/schemas/kb.ts";
import prisma from "../db";

const router = Router();

// ── Public routes (no auth required) ────────────────────────────────────────

// GET /api/kb/public/categories
router.get("/public/categories", async (_req, res) => {
  const categories = await prisma.kbCategory.findMany({
    orderBy: { position: "asc" },
    include: {
      _count: { select: { articles: { where: { status: "published" } } } },
    },
  });
  res.json({ categories });
});

// GET /api/kb/public/articles — list published articles, optional search + category filter
router.get("/public/articles", async (req, res) => {
  const parsed = kbArticleSearchSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }
  const { q, categoryId } = parsed.data;

  const articles = await prisma.kbArticle.findMany({
    where: {
      status: "published",
      ...(categoryId ? { categoryId } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { body: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { viewCount: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      categoryId: true,
      category: { select: { id: true, name: true, slug: true } },
      viewCount: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  res.json({ articles });
});

// GET /api/kb/public/articles/:slug — article detail, increments viewCount
router.get("/public/articles/:slug", async (req, res) => {
  const article = await prisma.kbArticle.findFirst({
    where: { slug: req.params.slug, status: "published" },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      author: { select: { id: true, name: true } },
    },
  });
  if (!article) {
    res.status(404).json({ error: "Article not found" });
    return;
  }

  // Increment view count in background
  prisma.kbArticle.update({
    where: { id: article.id },
    data: { viewCount: { increment: 1 } },
  }).catch(() => {});

  res.json({ article });
});

// ── Authenticated routes (agents + admins) ───────────────────────────────────

router.use(requireAuth);

// GET /api/kb/articles — all articles (including drafts) for agent/admin view
router.get("/articles", async (req, res) => {
  const parsed = kbArticleSearchSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }
  const { q, categoryId, status } = parsed.data;

  const articles = await prisma.kbArticle.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { body: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      author: { select: { id: true, name: true } },
    },
  });
  res.json({ articles });
});

// GET /api/kb/articles/:id — single article by numeric ID (agents can see drafts)
router.get("/articles/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid article ID" });
    return;
  }
  const article = await prisma.kbArticle.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      author: { select: { id: true, name: true } },
    },
  });
  if (!article) {
    res.status(404).json({ error: "Article not found" });
    return;
  }
  res.json({ article });
});

// ── Admin-only routes ─────────────────────────────────────────────────────────

router.use(requireAdmin);

// ── Categories ────────────────────────────────────────────────────────────────

// GET /api/kb/categories
router.get("/categories", async (_req, res) => {
  const categories = await prisma.kbCategory.findMany({
    orderBy: { position: "asc" },
    include: { _count: { select: { articles: true } } },
  });
  res.json({ categories });
});

// POST /api/kb/categories
router.post("/categories", async (req, res) => {
  const data = validate(createKbCategorySchema, req.body, res);
  if (!data) return;

  const slug = await uniqueSlug(data.name, (s) =>
    prisma.kbCategory.findUnique({ where: { slug: s } }).then(Boolean)
  );

  const category = await prisma.kbCategory.create({
    data: { ...data, slug, position: data.position ?? 0 },
  });
  res.status(201).json({ category });
});

// PATCH /api/kb/categories/:id
router.patch("/categories/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid category ID" });
    return;
  }
  const data = validate(updateKbCategorySchema, req.body, res);
  if (!data) return;

  const existing = await prisma.kbCategory.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  let slug = existing.slug;
  if (data.name && data.name !== existing.name) {
    slug = await uniqueSlug(data.name, (s) =>
      prisma.kbCategory
        .findFirst({ where: { slug: s, NOT: { id } } })
        .then(Boolean)
    );
  }

  const category = await prisma.kbCategory.update({
    where: { id },
    data: { ...data, slug },
  });
  res.json({ category });
});

// DELETE /api/kb/categories/:id
router.delete("/categories/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid category ID" });
    return;
  }
  const existing = await prisma.kbCategory.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  // Unlink articles before deleting
  await prisma.kbArticle.updateMany({
    where: { categoryId: id },
    data: { categoryId: null },
  });
  await prisma.kbCategory.delete({ where: { id } });
  res.status(204).send();
});

// ── Articles ──────────────────────────────────────────────────────────────────

// POST /api/kb/articles
router.post("/articles", async (req, res) => {
  const data = validate(createKbArticleSchema, req.body, res);
  if (!data) return;

  const slug = await uniqueSlug(data.title, (s) =>
    prisma.kbArticle.findUnique({ where: { slug: s } }).then(Boolean)
  );

  const article = await prisma.kbArticle.create({
    data: {
      title: data.title,
      slug,
      body: data.body,
      status: data.status ?? "draft",
      categoryId: data.categoryId ?? null,
      authorId: req.user.id,
    },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      author: { select: { id: true, name: true } },
    },
  });
  res.status(201).json({ article });
});

// PATCH /api/kb/articles/:id
router.patch("/articles/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid article ID" });
    return;
  }
  const data = validate(updateKbArticleSchema, req.body, res);
  if (!data) return;

  const existing = await prisma.kbArticle.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Article not found" });
    return;
  }

  let slug = existing.slug;
  if (data.title && data.title !== existing.title) {
    slug = await uniqueSlug(data.title, (s) =>
      prisma.kbArticle
        .findFirst({ where: { slug: s, NOT: { id } } })
        .then(Boolean)
    );
  }

  const article = await prisma.kbArticle.update({
    where: { id },
    data: { ...data, slug },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      author: { select: { id: true, name: true } },
    },
  });
  res.json({ article });
});

// DELETE /api/kb/articles/:id
router.delete("/articles/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid article ID" });
    return;
  }
  const existing = await prisma.kbArticle.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Article not found" });
    return;
  }
  await prisma.kbArticle.delete({ where: { id } });
  res.status(204).send();
});

export default router;
