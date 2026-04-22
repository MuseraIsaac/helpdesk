/**
 * Trash (Recycle Bin) API
 *
 * Provides a unified view of all soft-deleted ITSM records across entity types.
 * All mutations require admin or supervisor role.
 *
 * GET    /api/trash            — list items in trash (filterable by type, paginated)
 * GET    /api/trash/summary    — counts per entity type + expiry info
 * POST   /api/trash/restore    — restore one or many items by { items: [{type,id}] }
 * DELETE /api/trash            — permanent-delete selected items or empty entire trash
 *
 * Entity types: ticket | incident | request | problem | change | asset | kb_article
 */

import { Router } from "express";
import { z }      from "zod/v4";
import { requireAuth }  from "../middleware/require-auth";
import { requireAdmin } from "../middleware/require-admin";
import { validate }     from "../lib/validate";
import { getSection }   from "../lib/settings";
import prisma           from "../db";

const router = Router();

// ── Entity type registry ──────────────────────────────────────────────────────

export type TrashEntityType =
  | "ticket" | "incident" | "request" | "problem"
  | "change" | "asset"    | "kb_article";

const ENTITY_TYPES: TrashEntityType[] = [
  "ticket", "incident", "request", "problem", "change", "asset", "kb_article",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function expiresAt(deletedAt: Date, retentionDays: number): Date {
  return new Date(deletedAt.getTime() + retentionDays * 86_400_000);
}

function daysLeft(deletedAt: Date, retentionDays: number): number {
  const exp = expiresAt(deletedAt, retentionDays);
  return Math.max(0, Math.ceil((exp.getTime() - Date.now()) / 86_400_000));
}

// ── Fetch one page of deleted items for a specific type ───────────────────────

async function fetchDeleted(
  type:   TrashEntityType,
  offset: number,
  limit:  number,
  retentionDays: number,
): Promise<TrashItem[]> {
  const where = { deletedAt: { not: null } } as const;

  switch (type) {
    case "ticket": {
      const rows = await prisma.ticket.findMany({
        where, take: limit, skip: offset,
        orderBy: { deletedAt: "desc" },
        select: {
          id: true, ticketNumber: true, subject: true,
          priority: true, status: true,
          deletedAt: true, deletedByName: true,
          assignedTo: { select: { name: true } },
        },
      });
      return rows.map((r) => ({
        type: "ticket" as const, id: r.id,
        entityNumber: r.ticketNumber,
        title: r.subject,
        meta: `${r.priority ?? "–"} · ${r.status.replace(/_/g, " ")}`,
        assignedTo: r.assignedTo?.name ?? null,
        deletedAt: r.deletedAt!.toISOString(),
        deletedByName: r.deletedByName ?? null,
        daysLeft: daysLeft(r.deletedAt!, retentionDays),
      }));
    }

    case "incident": {
      const rows = await prisma.incident.findMany({
        where, take: limit, skip: offset,
        orderBy: { deletedAt: "desc" },
        select: {
          id: true, incidentNumber: true, title: true,
          priority: true, status: true,
          deletedAt: true, deletedByName: true,
          assignedTo: { select: { name: true } },
        },
      });
      return rows.map((r) => ({
        type: "incident" as const, id: r.id,
        entityNumber: r.incidentNumber,
        title: r.title,
        meta: `P${r.priority.slice(1)} · ${r.status.replace(/_/g, " ")}`,
        assignedTo: r.assignedTo?.name ?? null,
        deletedAt: r.deletedAt!.toISOString(),
        deletedByName: r.deletedByName ?? null,
        daysLeft: daysLeft(r.deletedAt!, retentionDays),
      }));
    }

    case "request": {
      const rows = await prisma.serviceRequest.findMany({
        where, take: limit, skip: offset,
        orderBy: { deletedAt: "desc" },
        select: {
          id: true, requestNumber: true, title: true,
          priority: true, status: true,
          deletedAt: true, deletedByName: true,
          assignedTo: { select: { name: true } },
        },
      });
      return rows.map((r) => ({
        type: "request" as const, id: r.id,
        entityNumber: r.requestNumber,
        title: r.title,
        meta: `${r.priority ?? "–"} · ${r.status.replace(/_/g, " ")}`,
        assignedTo: r.assignedTo?.name ?? null,
        deletedAt: r.deletedAt!.toISOString(),
        deletedByName: r.deletedByName ?? null,
        daysLeft: daysLeft(r.deletedAt!, retentionDays),
      }));
    }

    case "problem": {
      const rows = await prisma.problem.findMany({
        where, take: limit, skip: offset,
        orderBy: { deletedAt: "desc" },
        select: {
          id: true, problemNumber: true, title: true,
          priority: true, status: true,
          deletedAt: true, deletedByName: true,
          assignedTo: { select: { name: true } },
        },
      });
      return rows.map((r) => ({
        type: "problem" as const, id: r.id,
        entityNumber: r.problemNumber,
        title: r.title,
        meta: `${r.priority} · ${r.status.replace(/_/g, " ")}`,
        assignedTo: r.assignedTo?.name ?? null,
        deletedAt: r.deletedAt!.toISOString(),
        deletedByName: r.deletedByName ?? null,
        daysLeft: daysLeft(r.deletedAt!, retentionDays),
      }));
    }

    case "change": {
      const rows = await prisma.change.findMany({
        where, take: limit, skip: offset,
        orderBy: { deletedAt: "desc" },
        select: {
          id: true, changeNumber: true, title: true,
          changeType: true, state: true,
          deletedAt: true, deletedByName: true,
          assignedTo: { select: { name: true } },
        },
      });
      return rows.map((r) => ({
        type: "change" as const, id: r.id,
        entityNumber: r.changeNumber,
        title: r.title,
        meta: `${r.changeType} · ${r.state.replace(/_/g, " ")}`,
        assignedTo: r.assignedTo?.name ?? null,
        deletedAt: r.deletedAt!.toISOString(),
        deletedByName: r.deletedByName ?? null,
        daysLeft: daysLeft(r.deletedAt!, retentionDays),
      }));
    }

    case "asset": {
      const rows = await prisma.asset.findMany({
        where, take: limit, skip: offset,
        orderBy: { deletedAt: "desc" },
        select: {
          id: true, assetNumber: true, name: true,
          type: true, status: true,
          deletedAt: true, deletedByName: true,
          assignedTo: { select: { name: true } },
        },
      });
      return rows.map((r) => ({
        type: "asset" as const, id: r.id,
        entityNumber: r.assetNumber,
        title: r.name,
        meta: `${r.type.replace(/_/g, " ")} · ${r.status.replace(/_/g, " ")}`,
        assignedTo: r.assignedTo?.name ?? null,
        deletedAt: r.deletedAt!.toISOString(),
        deletedByName: r.deletedByName ?? null,
        daysLeft: daysLeft(r.deletedAt!, retentionDays),
      }));
    }

    case "kb_article": {
      const rows = await prisma.kbArticle.findMany({
        where, take: limit, skip: offset,
        orderBy: { deletedAt: "desc" },
        select: {
          id: true, title: true, slug: true,
          status: true, visibility: true,
          deletedAt: true, deletedByName: true,
          author: { select: { name: true } },
        },
      });
      return rows.map((r) => ({
        type: "kb_article" as const, id: r.id,
        entityNumber: r.slug,
        title: r.title,
        meta: `${r.status} · ${r.visibility}`,
        assignedTo: r.author?.name ?? null,
        deletedAt: r.deletedAt!.toISOString(),
        deletedByName: r.deletedByName ?? null,
        daysLeft: daysLeft(r.deletedAt!, retentionDays),
      }));
    }
  }
}

interface TrashItem {
  type:          TrashEntityType;
  id:            number;
  entityNumber:  string;
  title:         string;
  meta:          string;
  assignedTo:    string | null;
  deletedAt:     string;
  deletedByName: string | null;
  daysLeft:      number;
}

// ── Validation schemas ────────────────────────────────────────────────────────

const entityTypeSchema = z.enum([
  "ticket","incident","request","problem","change","asset","kb_article",
]);

const listQuerySchema = z.object({
  type:   entityTypeSchema.optional(),
  limit:  z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const itemRefSchema = z.object({
  type: entityTypeSchema,
  id:   z.number().int().positive(),
});

const restoreSchema  = z.object({ items: z.array(itemRefSchema).min(1).max(100) });
const permanentSchema = z.object({
  items:    z.array(itemRefSchema).optional(),
  emptyAll: z.boolean().optional(),
});

// ── GET /api/trash ────────────────────────────────────────────────────────────

router.get("/", requireAuth, requireAdmin, async (req, res) => {
  const query = validate(listQuerySchema, req.query, res);
  if (!query) return;

  const settings      = await getSection("trash");
  const retentionDays = settings.retentionDays;
  const typesToFetch  = query.type ? [query.type] : ENTITY_TYPES;

  const allItems: TrashItem[] = [];
  await Promise.all(
    typesToFetch.map(async (t) => {
      const items = await fetchDeleted(t, query.offset, query.limit, retentionDays);
      allItems.push(...items);
    }),
  );

  // Sort by deletedAt desc, then paginate
  allItems.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
  const page = allItems.slice(0, query.limit);

  res.json({ items: page, retentionDays, total: allItems.length });
});

// ── GET /api/trash/summary ────────────────────────────────────────────────────

router.get("/summary", requireAuth, requireAdmin, async (req, res) => {
  const settings      = await getSection("trash");
  const retentionDays = settings.retentionDays;
  const where         = { deletedAt: { not: null } };

  const [
    tickets, incidents, requests, problems, changes, assets, kbArticles,
  ] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.incident.count({ where }),
    prisma.serviceRequest.count({ where }),
    prisma.problem.count({ where }),
    prisma.change.count({ where }),
    prisma.asset.count({ where }),
    prisma.kbArticle.count({ where }),
  ]);

  const counts = { tickets, incidents, requests, problems, changes, assets, kbArticles };
  const total  = Object.values(counts).reduce((s, v) => s + v, 0);

  res.json({ counts, total, retentionDays, enabled: settings.enabled });
});

// ── POST /api/trash/restore ───────────────────────────────────────────────────

router.post("/restore", requireAuth, requireAdmin, async (req, res) => {
  const data = validate(restoreSchema, req.body, res);
  if (!data) return;

  const clear = { deletedAt: null, deletedById: null, deletedByName: null };
  let restored = 0;

  for (const { type, id } of data.items) {
    switch (type) {
      case "ticket":      await prisma.ticket.update({ where: { id }, data: clear }); break;
      case "incident":    await prisma.incident.update({ where: { id }, data: clear }); break;
      case "request":     await prisma.serviceRequest.update({ where: { id }, data: clear }); break;
      case "problem":     await prisma.problem.update({ where: { id }, data: clear }); break;
      case "change":      await prisma.change.update({ where: { id }, data: clear }); break;
      case "asset":       await prisma.asset.update({ where: { id }, data: clear }); break;
      case "kb_article":  await prisma.kbArticle.update({ where: { id }, data: clear }); break;
    }
    restored++;
  }

  res.json({ restored });
});

// ── DELETE /api/trash ─────────────────────────────────────────────────────────
// { items: [{type,id}] }            — permanently delete specific items
// { emptyAll: true }                — permanently delete everything in trash

router.delete("/", requireAuth, requireAdmin, async (req, res) => {
  const data = validate(permanentSchema, req.body, res);
  if (!data) return;

  let deleted = 0;

  if (data.emptyAll) {
    const where = { where: { deletedAt: { not: null } } };
    // Delete in FK-safe order (child records first where needed)
    const [t, i, req_, p, c, a, kb] = await Promise.all([
      prisma.ticket.deleteMany(where),
      prisma.incident.deleteMany(where),
      prisma.serviceRequest.deleteMany(where),
      prisma.problem.deleteMany(where),
      prisma.change.deleteMany(where),
      prisma.asset.deleteMany(where),
      prisma.kbArticle.deleteMany(where),
    ]);
    deleted = t.count + i.count + req_.count + p.count + c.count + a.count + kb.count;
  } else if (data.items?.length) {
    for (const { type, id } of data.items) {
      switch (type) {
        case "ticket":      await prisma.ticket.delete({ where: { id } }); break;
        case "incident":    await prisma.incident.delete({ where: { id } }); break;
        case "request":     await prisma.serviceRequest.delete({ where: { id } }); break;
        case "problem":     await prisma.problem.delete({ where: { id } }); break;
        case "change":      await prisma.change.delete({ where: { id } }); break;
        case "asset":       await prisma.asset.delete({ where: { id } }); break;
        case "kb_article":  await prisma.kbArticle.delete({ where: { id } }); break;
      }
      deleted++;
    }
  }

  res.json({ deleted });
});

export default router;
