/**
 * Unified global search — GET /api/search
 *
 * Runs parallel, type-filtered queries across all major ITSM entities and
 * returns grouped results. All queries use Prisma's `contains` with
 * `mode: "insensitive"` (case-insensitive LIKE) — no external search
 * infrastructure required.
 *
 * ── Query parameters ───────────────────────────────────────────────────────
 *   q       Required. Search term (min 2 chars).
 *   types   Comma-separated subset of entity types to search.
 *           Default: all types (tickets,incidents,problems,requests,cmdb,kb)
 *   limit   Max results per type. Default: 5, max: 10.
 *
 * ── Result shape ───────────────────────────────────────────────────────────
 *   {
 *     query: string,
 *     results: {
 *       tickets:   SearchHit[],
 *       incidents: SearchHit[],
 *       problems:  SearchHit[],
 *       requests:  SearchHit[],
 *       cmdb:      SearchHit[],
 *       kb:        SearchHit[],
 *     },
 *     totals: { tickets: number, … }
 *   }
 *
 *   SearchHit: { id, title, number?, status?, href, meta? }
 *
 * ── Upgrading to full-text search ─────────────────────────────────────────
 *   When substring matching becomes too slow (typically > 500k rows), move
 *   to PostgreSQL full-text search:
 *     1. Add a `tsvector` generated column to each table and index it.
 *     2. Replace `contains` with a raw `prisma.$queryRaw` using `to_tsquery`.
 *     3. Alternatively, use a dedicated search service (Meilisearch, Typesense,
 *        OpenSearch) and fan out the query there instead of here.
 *   The response shape and the client component do not need to change.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { searchQuerySchema, type SearchType } from "core/schemas/search.ts";
import prisma from "../db";

const router = Router();

router.use(requireAuth);

// ── Per-type query runners ─────────────────────────────────────────────────────

type Hit = {
  id: number | string;
  title: string;
  number?: string;
  status?: string;
  href: string;
  meta?: string; // secondary context shown in the result row
};

async function searchTickets(q: string, limit: number): Promise<Hit[]> {
  const rows = await prisma.ticket.findMany({
    where: {
      status: { in: ["open", "resolved", "closed"] },
      OR: [
        { ticketNumber: { contains: q, mode: "insensitive" } },
        { subject:      { contains: q, mode: "insensitive" } },
        { senderName:   { contains: q, mode: "insensitive" } },
        { senderEmail:  { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, ticketNumber: true, subject: true, status: true, senderName: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id:     r.id,
    title:  r.subject,
    number: r.ticketNumber ?? undefined,
    status: r.status,
    href:   `/tickets/${r.id}`,
    meta:   r.senderName ?? undefined,
  }));
}

async function searchIncidents(q: string, limit: number): Promise<Hit[]> {
  const rows = await prisma.incident.findMany({
    where: {
      OR: [
        { incidentNumber:  { contains: q, mode: "insensitive" } },
        { title:           { contains: q, mode: "insensitive" } },
        { affectedSystem:  { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, incidentNumber: true, title: true, status: true, affectedSystem: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id:     r.id,
    title:  r.title,
    number: r.incidentNumber,
    status: r.status,
    href:   `/incidents/${r.id}`,
    meta:   r.affectedSystem ?? undefined,
  }));
}

async function searchProblems(q: string, limit: number): Promise<Hit[]> {
  const rows = await prisma.problem.findMany({
    where: {
      OR: [
        { problemNumber:   { contains: q, mode: "insensitive" } },
        { title:           { contains: q, mode: "insensitive" } },
        { affectedService: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, problemNumber: true, title: true, status: true, affectedService: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id:     r.id,
    title:  r.title,
    number: r.problemNumber,
    status: r.status,
    href:   `/problems/${r.id}`,
    meta:   r.affectedService ?? undefined,
  }));
}

async function searchRequests(q: string, limit: number): Promise<Hit[]> {
  const rows = await prisma.serviceRequest.findMany({
    where: {
      OR: [
        { requestNumber:  { contains: q, mode: "insensitive" } },
        { title:          { contains: q, mode: "insensitive" } },
        { requesterName:  { contains: q, mode: "insensitive" } },
        { requesterEmail: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, requestNumber: true, title: true, status: true, requesterName: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id:     r.id,
    title:  r.title,
    number: r.requestNumber,
    status: r.status,
    href:   `/requests/${r.id}`,
    meta:   r.requesterName ?? undefined,
  }));
}

async function searchCmdb(q: string, limit: number): Promise<Hit[]> {
  const rows = await prisma.configItem.findMany({
    where: {
      OR: [
        { ciNumber:    { contains: q, mode: "insensitive" } },
        { name:        { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, ciNumber: true, name: true, status: true, type: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id:     r.id,
    title:  r.name,
    number: r.ciNumber,
    status: r.status,
    href:   `/cmdb/${r.id}`,
    meta:   r.type ?? undefined,
  }));
}

async function searchKb(q: string, limit: number): Promise<Hit[]> {
  const rows = await prisma.kbArticle.findMany({
    where: {
      status: "published",
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { body:  { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, slug: true, title: true, status: true, reviewStatus: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id:     r.id,
    title:  r.title,
    status: r.reviewStatus,
    href:   `/help/articles/${r.slug}`,
  }));
}

// ── Runner map ─────────────────────────────────────────────────────────────────

const RUNNERS: Record<SearchType, (q: string, limit: number) => Promise<Hit[]>> = {
  tickets:   searchTickets,
  incidents: searchIncidents,
  problems:  searchProblems,
  requests:  searchRequests,
  cmdb:      searchCmdb,
  kb:        searchKb,
};

// ── Route ──────────────────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  const parsed = searchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });
    return;
  }

  const { q, types, limit } = parsed.data;

  // Run all requested type queries in parallel
  const settled = await Promise.allSettled(
    types.map(async (type) => {
      const hits = await RUNNERS[type](q, limit);
      return { type, hits };
    })
  );

  const results: Record<string, Hit[]> = {};
  const totals:  Record<string, number> = {};

  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      const { type, hits } = outcome.value;
      results[type] = hits;
      totals[type]  = hits.length;
    } else {
      // Partial failure — surface error in dev, return empty list in prod
      console.error("[search] query failed:", outcome.reason);
    }
  }

  res.json({ query: q, results, totals });
});

export default router;
