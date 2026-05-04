/**
 * Trash (Recycle Bin) API
 *
 * Provides a view of soft-deleted ITSM records.
 *
 * Visibility model:
 *   - admins and supervisors  see and manage everything in trash
 *   - all other authenticated users see and manage only items they themselves
 *     deleted (matched by `deletedById`)
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
import { requireAuth } from "../middleware/require-auth";
import { Role }        from "core/constants/role.ts";
import { validate }    from "../lib/validate";
import { getSection }  from "../lib/settings";
import prisma          from "../db";

const router = Router();

/**
 * Returns a Prisma `where` filter that scopes deleted records to the current
 * user when they aren't an admin/supervisor. Privileged roles see all trash;
 * everyone else sees only what they themselves deleted.
 */
function scopedWhere(user: { id: string; role: string }) {
  const isPrivileged = user.role === Role.admin || user.role === Role.supervisor;
  if (isPrivileged) return { deletedAt: { not: null } } as const;
  return { deletedAt: { not: null }, deletedById: user.id } as const;
}

function isPrivileged(user: { role: string }) {
  return user.role === Role.admin || user.role === Role.supervisor;
}

// ── Entity type registry ──────────────────────────────────────────────────────

export type TrashEntityType =
  | "ticket" | "incident" | "request" | "problem"
  | "change" | "asset"    | "kb_article"
  | "saas_subscription" | "software_license";

const ENTITY_TYPES: TrashEntityType[] = [
  "ticket", "incident", "request", "problem", "change", "asset", "kb_article",
  "saas_subscription", "software_license",
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
  where:  { deletedAt: { not: null }; deletedById?: string },
): Promise<TrashItem[]> {

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

    case "saas_subscription": {
      const rows = await prisma.saaSSubscription.findMany({
        where, take: limit, skip: offset,
        orderBy: { deletedAt: "desc" },
        select: {
          id: true, subscriptionNumber: true, appName: true,
          vendor: true, status: true, billingCycle: true,
          deletedAt: true, deletedByName: true,
          owner: { select: { name: true } },
        },
      });
      return rows.map((r) => ({
        type: "saas_subscription" as const, id: r.id,
        entityNumber: r.subscriptionNumber,
        title: r.appName,
        meta: `${r.vendor ?? "—"} · ${r.status.replace(/_/g, " ")} · ${r.billingCycle.replace(/_/g, " ")}`,
        assignedTo: r.owner?.name ?? null,
        deletedAt: r.deletedAt!.toISOString(),
        deletedByName: r.deletedByName ?? null,
        daysLeft: daysLeft(r.deletedAt!, retentionDays),
      }));
    }

    case "software_license": {
      const rows = await prisma.softwareLicense.findMany({
        where, take: limit, skip: offset,
        orderBy: { deletedAt: "desc" },
        select: {
          id: true, licenseNumber: true, productName: true,
          vendor: true, licenseType: true, status: true,
          deletedAt: true, deletedByName: true,
          owner: { select: { name: true } },
        },
      });
      return rows.map((r) => ({
        type: "software_license" as const, id: r.id,
        entityNumber: r.licenseNumber,
        title: r.productName,
        meta: `${r.vendor ?? "—"} · ${r.licenseType.replace(/_/g, " ")} · ${r.status.replace(/_/g, " ")}`,
        assignedTo: r.owner?.name ?? null,
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
  "saas_subscription","software_license",
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

router.get("/", requireAuth, async (req, res) => {
  const query = validate(listQuerySchema, req.query, res);
  if (!query) return;

  const settings      = await getSection("trash");
  const retentionDays = settings.retentionDays;
  const typesToFetch  = query.type ? [query.type] : ENTITY_TYPES;
  const where         = scopedWhere(req.user);

  const allItems: TrashItem[] = [];
  await Promise.all(
    typesToFetch.map(async (t) => {
      const items = await fetchDeleted(t, query.offset, query.limit, retentionDays, where);
      allItems.push(...items);
    }),
  );

  // Sort by deletedAt desc, then paginate
  allItems.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
  const page = allItems.slice(0, query.limit);

  res.json({
    items:        page,
    retentionDays,
    total:        allItems.length,
    scope:        isPrivileged(req.user) ? "all" : "own",
  });
});

// ── GET /api/trash/summary ────────────────────────────────────────────────────

router.get("/summary", requireAuth, async (req, res) => {
  const settings      = await getSection("trash");
  const retentionDays = settings.retentionDays;
  const where         = scopedWhere(req.user);

  const [
    tickets, incidents, requests, problems, changes, assets, kbArticles,
    saasSubscriptions, softwareLicenses,
  ] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.incident.count({ where }),
    prisma.serviceRequest.count({ where }),
    prisma.problem.count({ where }),
    prisma.change.count({ where }),
    prisma.asset.count({ where }),
    prisma.kbArticle.count({ where }),
    prisma.saaSSubscription.count({ where }),
    prisma.softwareLicense.count({ where }),
  ]);

  const counts = {
    tickets, incidents, requests, problems, changes, assets, kbArticles,
    saasSubscriptions, softwareLicenses,
  };
  const total  = Object.values(counts).reduce((s, v) => s + v, 0);

  res.json({
    counts, total, retentionDays,
    enabled: settings.enabled,
    scope:   isPrivileged(req.user) ? "all" : "own",
  });
});

// ── POST /api/trash/restore ───────────────────────────────────────────────────

router.post("/restore", requireAuth, async (req, res) => {
  const data = validate(restoreSchema, req.body, res);
  if (!data) return;

  const clear = { deletedAt: null, deletedById: null, deletedByName: null };
  // Non-privileged users can only act on items they themselves deleted.
  const ownerFilter = isPrivileged(req.user) ? {} : { deletedById: req.user.id };
  let restored = 0;

  for (const { type, id } of data.items) {
    const where = { id, ...ownerFilter };
    let count = 0;
    switch (type) {
      case "ticket":            count = (await prisma.ticket.updateMany({ where, data: clear })).count; break;
      case "incident":          count = (await prisma.incident.updateMany({ where, data: clear })).count; break;
      case "request":           count = (await prisma.serviceRequest.updateMany({ where, data: clear })).count; break;
      case "problem":           count = (await prisma.problem.updateMany({ where, data: clear })).count; break;
      case "change":            count = (await prisma.change.updateMany({ where, data: clear })).count; break;
      case "asset":             count = (await prisma.asset.updateMany({ where, data: clear })).count; break;
      case "kb_article":        count = (await prisma.kbArticle.updateMany({ where, data: clear })).count; break;
      case "saas_subscription": count = (await prisma.saaSSubscription.updateMany({ where, data: clear })).count; break;
      case "software_license":  count = (await prisma.softwareLicense.updateMany({ where, data: clear })).count; break;
    }
    restored += count;
  }

  res.json({ restored });
});

// ── DELETE /api/trash ─────────────────────────────────────────────────────────
// { items: [{type,id}] }            — permanently delete specific items
// { emptyAll: true }                — permanently delete everything in trash

router.delete("/", requireAuth, async (req, res) => {
  const data = validate(permanentSchema, req.body, res);
  if (!data) return;

  // Scope every destructive query to either all-trash (privileged) or just the
  // current user's own trash (everyone else).
  const baseScope = scopedWhere(req.user);
  const ownerFilter = isPrivileged(req.user) ? {} : { deletedById: req.user.id };

  let deleted = 0;

  if (data.emptyAll) {
    const where = { where: baseScope };
    // Delete in FK-safe order (child records first where needed)
    const [t, i, req_, p, c, a, kb, sa, sl] = await Promise.all([
      prisma.ticket.deleteMany(where),
      prisma.incident.deleteMany(where),
      prisma.serviceRequest.deleteMany(where),
      prisma.problem.deleteMany(where),
      prisma.change.deleteMany(where),
      prisma.asset.deleteMany(where),
      prisma.kbArticle.deleteMany(where),
      prisma.saaSSubscription.deleteMany(where),
      prisma.softwareLicense.deleteMany(where),
    ]);
    deleted = t.count + i.count + req_.count + p.count + c.count + a.count + kb.count + sa.count + sl.count;
  } else if (data.items?.length) {
    for (const { type, id } of data.items) {
      const where = { id, ...ownerFilter };
      let count = 0;
      switch (type) {
        case "ticket":            count = (await prisma.ticket.deleteMany({ where })).count; break;
        case "incident":          count = (await prisma.incident.deleteMany({ where })).count; break;
        case "request":           count = (await prisma.serviceRequest.deleteMany({ where })).count; break;
        case "problem":           count = (await prisma.problem.deleteMany({ where })).count; break;
        case "change":            count = (await prisma.change.deleteMany({ where })).count; break;
        case "asset":             count = (await prisma.asset.deleteMany({ where })).count; break;
        case "kb_article":        count = (await prisma.kbArticle.deleteMany({ where })).count; break;
        case "saas_subscription": count = (await prisma.saaSSubscription.deleteMany({ where })).count; break;
        case "software_license":  count = (await prisma.softwareLicense.deleteMany({ where })).count; break;
      }
      deleted += count;
    }
  }

  res.json({ deleted });
});

export default router;
