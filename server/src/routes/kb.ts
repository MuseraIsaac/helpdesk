import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import { uniqueSlug } from "../lib/slugify";
import {
  createKbCategorySchema,
  updateKbCategorySchema,
  createKbArticleSchema,
  updateKbArticleSchema,
  kbArticleSearchSchema,
  submitArticleFeedbackSchema,
  kbWorkflowActionSchema,
} from "core/schemas/kb.ts";
import prisma from "../db";

const router = Router();

// ── Keyword helpers ───────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "not", "in", "on", "at", "to", "for",
  "of", "is", "it", "be", "are", "was", "have", "has", "do", "does", "did",
  "with", "my", "i", "we", "you", "your", "our", "can", "how", "get", "got",
  "this", "that", "what", "when", "why", "where", "will", "would", "could",
  "should", "please", "help", "need", "want", "there", "from",
]);

function extractKeywords(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    ),
  ].slice(0, 8);
}

/** Return a short excerpt from body that contains the first matched keyword. */
function buildExcerpt(body: string, keywords: string[]): string {
  const stripped = body.replace(/[#*`_\[\]]/g, "").replace(/\s+/g, " ").trim();
  const lower = stripped.toLowerCase();
  for (const kw of keywords) {
    const idx = lower.indexOf(kw);
    if (idx !== -1) {
      const start = Math.max(0, idx - 40);
      const end = Math.min(stripped.length, idx + 120);
      const excerpt = (start > 0 ? "…" : "") + stripped.slice(start, end) + (end < stripped.length ? "…" : "");
      return excerpt;
    }
  }
  return stripped.slice(0, 150) + (stripped.length > 150 ? "…" : "");
}

/** Save a version snapshot of an article. Called before updating published articles. */
async function saveVersion(
  articleId: number,
  title: string,
  body: string,
  createdById: string,
  changeNote?: string
): Promise<void> {
  const lastVersion = await prisma.kbArticleVersion.findFirst({
    where: { articleId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  const versionNumber = (lastVersion?.versionNumber ?? 0) + 1;
  await prisma.kbArticleVersion.create({
    data: { articleId, versionNumber, title, body, createdById, changeNote: changeNote ?? null },
  });
}

// ── Shared article include ────────────────────────────────────────────────────

const articleInclude = {
  category: { select: { id: true, name: true, slug: true } },
  author:   { select: { id: true, name: true } },
  owner:    { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
} as const;

// ── Public routes (no auth required) ─────────────────────────────────────────

// GET /api/kb/public/categories
router.get("/public/categories", async (_req, res) => {
  const categories = await prisma.kbCategory.findMany({
    orderBy: { position: "asc" },
    include: {
      _count: { select: { articles: { where: { status: "published", visibility: "public" } } } },
    },
  });
  res.json({ categories });
});

// GET /api/kb/public/articles — list published public articles, optional search + category filter
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
      visibility: "public",
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
      visibility: true,
      categoryId: true,
      category: { select: { id: true, name: true, slug: true } },
      viewCount: true,
      helpfulCount: true,
      notHelpfulCount: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  res.json({ articles });
});

// GET /api/kb/public/articles/:slug — article detail, increments viewCount
router.get("/public/articles/:slug", async (req, res) => {
  const article = await prisma.kbArticle.findFirst({
    where: { slug: req.params.slug, status: "published", visibility: "public" },
    include: {
      ...articleInclude,
      _count: { select: { feedback: true } },
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

// POST /api/kb/public/articles/:slug/feedback — helpful/not-helpful vote (public)
router.post("/public/articles/:slug/feedback", async (req, res) => {
  const article = await prisma.kbArticle.findFirst({
    where: { slug: req.params.slug, status: "published", visibility: "public" },
    select: { id: true, helpfulCount: true, notHelpfulCount: true },
  });
  if (!article) {
    res.status(404).json({ error: "Article not found" });
    return;
  }

  const data = validate(submitArticleFeedbackSchema, req.body, res);
  if (!data) return;

  // Record feedback row
  await prisma.kbArticleFeedback.create({
    data: {
      articleId: article.id,
      helpful:   data.helpful,
      comment:   data.comment ?? null,
      sessionId: data.sessionId ?? null,
    },
  });

  // Update denormalised counters
  await prisma.kbArticle.update({
    where: { id: article.id },
    data: data.helpful
      ? { helpfulCount: { increment: 1 } }
      : { notHelpfulCount: { increment: 1 } },
  });

  res.status(201).json({ ok: true });
});

// GET /api/kb/public/suggest?q=<text> — keyword-matched article suggestions
router.get("/public/suggest", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q || q.length < 3) {
    res.json({ articles: [] });
    return;
  }

  const keywords = extractKeywords(q);
  if (!keywords.length) {
    res.json({ articles: [] });
    return;
  }

  const candidates = await prisma.kbArticle.findMany({
    where: {
      status: "published",
      visibility: "public",
      OR: keywords.flatMap((kw) => [
        { title: { contains: kw, mode: "insensitive" } },
        { body: { contains: kw, mode: "insensitive" } },
      ]),
    },
    select: {
      id: true, title: true, slug: true, body: true,
      category: { select: { id: true, name: true, slug: true } },
    },
    take: 20,
  });

  const scored = candidates
    .map((a) => {
      const titleLower = a.title.toLowerCase();
      const bodyLower = a.body.toLowerCase();
      const score = keywords.reduce((n, kw) => {
        return n + (titleLower.includes(kw) ? 2 : 0) + (bodyLower.includes(kw) ? 1 : 0);
      }, 0);
      return { ...a, score };
    })
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ score: _score, body, ...rest }) => ({
      ...rest,
      excerpt: buildExcerpt(body, keywords),
    }));

  res.json({ articles: scored });
});

// ── Authenticated routes (agents + admins) ────────────────────────────────────

router.use(requireAuth);

// GET /api/kb/articles — all articles (including drafts, internal) for agent/admin view
router.get("/articles", async (req, res) => {
  const parsed = kbArticleSearchSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }
  const { q, categoryId, status, reviewStatus, visibility } = parsed.data;

  const articles = await prisma.kbArticle.findMany({
    where: {
      ...(status       ? { status }       : {}),
      ...(reviewStatus ? { reviewStatus } : {}),
      ...(visibility   ? { visibility }   : {}),
      ...(categoryId   ? { categoryId }   : {}),
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
      ...articleInclude,
      _count: { select: { feedback: true, versions: true } },
    },
  });
  res.json({ articles });
});

// GET /api/kb/articles/:id — single article by numeric ID (agents can see drafts/internal)
router.get("/articles/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid article ID" });
    return;
  }
  const article = await prisma.kbArticle.findUnique({
    where: { id },
    include: {
      ...articleInclude,
      _count: { select: { feedback: true, versions: true } },
    },
  });
  if (!article) {
    res.status(404).json({ error: "Article not found" });
    return;
  }
  res.json({ article });
});

// GET /api/kb/articles/:id/versions — version history
router.get("/articles/:id/versions", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid article ID" }); return; }

  const versions = await prisma.kbArticleVersion.findMany({
    where: { articleId: id },
    orderBy: { versionNumber: "desc" },
    include: { createdBy: { select: { id: true, name: true } } },
  });
  res.json({ versions });
});

// ── Admin + supervisor routes ─────────────────────────────────────────────────

router.use(requirePermission("kb.manage"));

// ── Categories ────────────────────────────────────────────────────────────────

router.get("/categories", async (_req, res) => {
  const categories = await prisma.kbCategory.findMany({
    orderBy: { position: "asc" },
    include: { _count: { select: { articles: true } } },
  });
  res.json({ categories });
});

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

router.patch("/categories/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid category ID" }); return; }
  const data = validate(updateKbCategorySchema, req.body, res);
  if (!data) return;

  const existing = await prisma.kbCategory.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Category not found" }); return; }

  let slug = existing.slug;
  if (data.name && data.name !== existing.name) {
    slug = await uniqueSlug(data.name, (s) =>
      prisma.kbCategory.findFirst({ where: { slug: s, NOT: { id } } }).then(Boolean)
    );
  }

  const category = await prisma.kbCategory.update({
    where: { id },
    data: { ...data, slug },
  });
  res.json({ category });
});

router.delete("/categories/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid category ID" }); return; }
  const existing = await prisma.kbCategory.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Category not found" }); return; }
  await prisma.kbArticle.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
  await prisma.kbCategory.delete({ where: { id } });
  res.status(204).send();
});

// ── Articles ──────────────────────────────────────────────────────────────────

router.post("/articles", async (req, res) => {
  const data = validate(createKbArticleSchema, req.body, res);
  if (!data) return;

  const slug = await uniqueSlug(data.title, (s) =>
    prisma.kbArticle.findUnique({ where: { slug: s } }).then(Boolean)
  );

  const publishedAt = data.status === "published" ? new Date() : null;

  const article = await prisma.kbArticle.create({
    data: {
      title:        data.title,
      slug,
      body:         data.body,
      status:       data.status ?? "draft",
      reviewStatus: data.reviewStatus ?? "draft",
      visibility:   data.visibility ?? "public",
      categoryId:   data.categoryId ?? null,
      ownerId:      data.ownerId ?? null,
      authorId:     req.user.id,
      publishedAt,
    },
    include: { ...articleInclude, _count: { select: { feedback: true, versions: true } } },
  });

  // Save initial version if publishing immediately
  if (data.status === "published") {
    saveVersion(article.id, article.title, article.body, req.user.id, "Initial publish").catch(() => {});
  }

  res.status(201).json({ article });
});

router.patch("/articles/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid article ID" }); return; }
  const data = validate(updateKbArticleSchema, req.body, res);
  if (!data) return;

  const existing = await prisma.kbArticle.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Article not found" }); return; }

  // Save version snapshot before overwriting a published article
  if (existing.status === "published" && (data.body || data.title)) {
    saveVersion(
      id,
      existing.title,
      existing.body,
      req.user.id,
      (req.body as { changeNote?: string }).changeNote
    ).catch(() => {});
  }

  let slug = existing.slug;
  if (data.title && data.title !== existing.title) {
    slug = await uniqueSlug(data.title, (s) =>
      prisma.kbArticle.findFirst({ where: { slug: s, NOT: { id } } }).then(Boolean)
    );
  }

  // Set publishedAt when transitioning to published for the first time
  const publishedAt =
    data.status === "published" && !existing.publishedAt ? new Date() : existing.publishedAt;

  const article = await prisma.kbArticle.update({
    where: { id },
    data: { ...data, slug, publishedAt },
    include: { ...articleInclude, _count: { select: { feedback: true, versions: true } } },
  });
  res.json({ article });
});

router.delete("/articles/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid article ID" }); return; }
  const existing = await prisma.kbArticle.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Article not found" }); return; }
  await prisma.kbArticle.delete({ where: { id } });
  res.status(204).send();
});

// ── Workflow transitions ───────────────────────────────────────────────────────

// POST /api/kb/articles/:id/submit-review — author submits for review
router.post("/articles/:id/submit-review", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid article ID" }); return; }
  const data = validate(kbWorkflowActionSchema, req.body, res);
  if (!data) return;

  const existing = await prisma.kbArticle.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Article not found" }); return; }
  if (existing.reviewStatus !== "draft") {
    res.status(400).json({ error: "Only draft articles can be submitted for review" });
    return;
  }

  const article = await prisma.kbArticle.update({
    where: { id },
    data: { reviewStatus: "in_review" },
    include: articleInclude,
  });
  res.json({ article });
});

// POST /api/kb/articles/:id/approve — reviewer approves
router.post("/articles/:id/approve", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid article ID" }); return; }
  const data = validate(kbWorkflowActionSchema, req.body, res);
  if (!data) return;

  const existing = await prisma.kbArticle.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Article not found" }); return; }
  if (existing.reviewStatus !== "in_review") {
    res.status(400).json({ error: "Article must be in review to approve" });
    return;
  }

  const article = await prisma.kbArticle.update({
    where: { id },
    data: {
      reviewStatus: "approved",
      reviewedById: req.user.id,
      reviewedAt:   new Date(),
    },
    include: articleInclude,
  });
  res.json({ article });
});

// POST /api/kb/articles/:id/publish — publish an approved (or any) article
router.post("/articles/:id/publish", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid article ID" }); return; }
  const data = validate(kbWorkflowActionSchema, req.body, res);
  if (!data) return;

  const existing = await prisma.kbArticle.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Article not found" }); return; }

  const wasPublished = existing.status === "published";
  if (wasPublished && (existing.body || existing.title)) {
    saveVersion(id, existing.title, existing.body, req.user.id, data.changeNote ?? "Published").catch(() => {});
  }

  const article = await prisma.kbArticle.update({
    where: { id },
    data: {
      status:      "published",
      reviewStatus: "approved",
      publishedAt:  existing.publishedAt ?? new Date(),
    },
    include: articleInclude,
  });

  if (!wasPublished) {
    saveVersion(article.id, article.title, article.body, req.user.id, data.changeNote ?? "Published").catch(() => {});
  }

  res.json({ article });
});

// POST /api/kb/articles/:id/unpublish — revert to draft
router.post("/articles/:id/unpublish", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid article ID" }); return; }

  const existing = await prisma.kbArticle.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Article not found" }); return; }

  const article = await prisma.kbArticle.update({
    where: { id },
    data: { status: "draft", reviewStatus: "draft" },
    include: articleInclude,
  });
  res.json({ article });
});

// POST /api/kb/articles/:id/archive — archive an article
router.post("/articles/:id/archive", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid article ID" }); return; }

  const existing = await prisma.kbArticle.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Article not found" }); return; }

  const article = await prisma.kbArticle.update({
    where: { id },
    data: { status: "draft", reviewStatus: "archived" },
    include: articleInclude,
  });
  res.json({ article });
});

export default router;
