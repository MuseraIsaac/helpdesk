import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import {
  createCatalogCategorySchema,
  updateCatalogCategorySchema,
  createCatalogItemSchema,
  updateCatalogItemSchema,
  submitCatalogRequestSchema,
  listCatalogItemsQuerySchema,
} from "core/schemas/catalog.ts";
import type { FormField } from "core/constants/catalog.ts";
import { generateTicketNumber } from "../lib/ticket-number";
import { computeRequestSlaDueAt } from "../lib/request-sla";
import { logRequestEvent } from "../lib/request-events";
import { createApproval } from "../lib/approval-engine";
import prisma from "../db";
import type { Prisma, TicketPriority } from "../generated/prisma/client";

const router = Router();

// ── Shared projections ────────────────────────────────────────────────────────

const CATEGORY_SELECT = {
  id:          true,
  name:        true,
  slug:        true,
  description: true,
  position:    true,
  isActive:    true,
} as const;

const ITEM_SUMMARY_SELECT = {
  id:               true,
  name:             true,
  shortDescription: true,
  icon:             true,
  isActive:         true,
  requiresApproval: true,
  category:         { select: CATEGORY_SELECT },
  fulfillmentTeam:  { select: { id: true, name: true, color: true } },
  position:         true,
  createdAt:        true,
  updatedAt:        true,
} as const;

const ITEM_DETAIL_SELECT = {
  ...ITEM_SUMMARY_SELECT,
  description:           true,
  requestorInstructions: true,
  formSchema:            true,
  approvalMode:          true,
  approverIds:           true,
} as const;

// ── Slug helper ───────────────────────────────────────────────────────────────

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

async function uniqueSlug(base: string, excludeId?: number): Promise<string> {
  let slug = base;
  let n    = 0;
  while (true) {
    const existing = await prisma.catalogCategory.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing || existing.id === excludeId) return slug;
    n++;
    slug = `${base}-${n}`;
  }
}

// ── Validate required form fields ──────────────────────────────────────────────

function validateFormData(
  formSchema: FormField[],
  formData: Record<string, unknown>
): string | null {
  for (const field of formSchema) {
    if (!field.required) continue;
    const val = formData[field.id];
    const empty =
      val === undefined ||
      val === null ||
      val === "" ||
      (Array.isArray(val) && val.length === 0);
    if (empty) return `Field "${field.label}" is required`;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public catalog endpoints (catalog.view)
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/catalog — all active items grouped by category */
router.get(
  "/",
  requireAuth,
  requirePermission("catalog.view"),
  async (req, res) => {
    const query = validate(listCatalogItemsQuerySchema, req.query, res);
    if (!query) return;

    const where: Prisma.CatalogItemWhereInput = {};
    if (query.isActive !== undefined) where.isActive = query.isActive;
    else where.isActive = true; // default to active only
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.search) {
      where.OR = [
        { name:             { contains: query.search, mode: "insensitive" } },
        { shortDescription: { contains: query.search, mode: "insensitive" } },
        { description:      { contains: query.search, mode: "insensitive" } },
      ];
    }

    const [categories, items] = await Promise.all([
      prisma.catalogCategory.findMany({
        where: { isActive: true },
        orderBy: [{ position: "asc" }, { name: "asc" }],
        select: CATEGORY_SELECT,
      }),
      prisma.catalogItem.findMany({
        where,
        orderBy: [{ position: "asc" }, { name: "asc" }],
        select: ITEM_SUMMARY_SELECT,
      }),
    ]);

    res.json({ categories, items });
  }
);

/** GET /api/catalog/items/:id — catalog item detail */
router.get(
  "/items/:id",
  requireAuth,
  requirePermission("catalog.view"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const item = await prisma.catalogItem.findUnique({
      where: { id },
      select: ITEM_DETAIL_SELECT,
    });
    if (!item) { res.status(404).json({ error: "Catalog item not found" }); return; }

    res.json(item);
  }
);

/** POST /api/catalog/items/:id/request — submit a service request */
router.post(
  "/items/:id/request",
  requireAuth,
  requirePermission("catalog.request"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const data = validate(submitCatalogRequestSchema, req.body, res);
    if (!data) return;

    const item = await prisma.catalogItem.findUnique({
      where: { id, isActive: true },
      select: ITEM_DETAIL_SELECT,
    });
    if (!item) { res.status(404).json({ error: "Catalog item not found or inactive" }); return; }

    // Validate required form fields server-side
    const formSchema = item.formSchema as unknown as FormField[];
    const fieldError = validateFormData(formSchema, data.formData);
    if (fieldError) { res.status(400).json({ error: fieldError }); return; }

    const now = new Date();
    const requestNumber = await generateTicketNumber("service_request", now);
    const slaDueAt = computeRequestSlaDueAt(data.priority, now);

    const requiresApproval = item.requiresApproval && item.approverIds.length > 0;
    const initialStatus        = requiresApproval ? "pending_approval" : "submitted";
    const initialApprovalStatus = requiresApproval ? "pending" : "not_required";

    const request = await prisma.serviceRequest.create({
      data: {
        requestNumber,
        title:           item.name,
        description:     data.description ?? item.shortDescription ?? null,
        priority:        data.priority as TicketPriority,
        status:          initialStatus,
        approvalStatus:  initialApprovalStatus,
        requesterId:     req.user.id,
        requesterName:   req.user.name,
        requesterEmail:  req.user.email,
        teamId:          item.fulfillmentTeam?.id ?? null,
        catalogItemId:   item.id,
        catalogItemName: item.name,
        formData:        data.formData as Prisma.InputJsonValue,
        slaDueAt,
        createdById: req.user.id,
      },
      select: { id: true, requestNumber: true, status: true, approvalStatus: true },
    });

    await logRequestEvent(request.id, req.user.id, "request.created", {
      via:           "catalog",
      catalogItemId: item.id,
      priority:      data.priority,
    });

    // Wire approval engine if required
    if (requiresApproval) {
      const { approvalRequest } = await createApproval(
        {
          subjectType:   "service_request",
          subjectId:     String(request.id),
          title:         `Approval for: ${item.name}`,
          approvalMode:  item.approvalMode as "all" | "any",
          requiredCount: 1,
          approverIds:   item.approverIds,
        },
        req.user.id
      );

      await prisma.serviceRequest.update({
        where: { id: request.id },
        data:  { approvalRequestId: approvalRequest.id },
      });

      await logRequestEvent(request.id, req.user.id, "request.approval_requested", {
        approvalRequestId: approvalRequest.id,
        approverCount: item.approverIds.length,
      });
    }

    res.status(201).json(request);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Admin catalog management (catalog.manage)
// ─────────────────────────────────────────────────────────────────────────────

// ── Categories ────────────────────────────────────────────────────────────────

router.get(
  "/admin/categories",
  requireAuth,
  requirePermission("catalog.manage"),
  async (_req, res) => {
    const categories = await prisma.catalogCategory.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { ...CATEGORY_SELECT, _count: { select: { items: true } } },
    });
    res.json({ categories });
  }
);

router.post(
  "/admin/categories",
  requireAuth,
  requirePermission("catalog.manage"),
  async (req, res) => {
    const data = validate(createCatalogCategorySchema, req.body, res);
    if (!data) return;

    const slug = await uniqueSlug(toSlug(data.name));

    const category = await prisma.catalogCategory.create({
      data: {
        name:        data.name,
        slug,
        description: data.description ?? null,
        position:    data.position,
        isActive:    data.isActive,
      },
      select: { ...CATEGORY_SELECT, _count: { select: { items: true } } },
    });

    res.status(201).json(category);
  }
);

router.patch(
  "/admin/categories/:id",
  requireAuth,
  requirePermission("catalog.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const data = validate(updateCatalogCategorySchema, req.body, res);
    if (!data) return;

    const current = await prisma.catalogCategory.findUnique({
      where: { id }, select: { id: true, slug: true, name: true },
    });
    if (!current) { res.status(404).json({ error: "Category not found" }); return; }

    const updateData: Prisma.CatalogCategoryUpdateInput = {};
    if (data.name !== undefined) {
      updateData.name = data.name;
      updateData.slug = await uniqueSlug(toSlug(data.name), id);
    }
    if (data.description !== undefined) updateData.description = data.description;
    if (data.position    !== undefined) updateData.position    = data.position;
    if (data.isActive    !== undefined) updateData.isActive    = data.isActive;

    const category = await prisma.catalogCategory.update({
      where: { id },
      data:  updateData,
      select: { ...CATEGORY_SELECT, _count: { select: { items: true } } },
    });

    res.json(category);
  }
);

router.delete(
  "/admin/categories/:id",
  requireAuth,
  requirePermission("catalog.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    // Null-out categoryId on items instead of cascading (preserve items)
    await prisma.catalogItem.updateMany({
      where: { categoryId: id },
      data:  { categoryId: null },
    });
    await prisma.catalogCategory.delete({ where: { id } });

    res.status(204).end();
  }
);

// ── Items ─────────────────────────────────────────────────────────────────────

router.get(
  "/admin/items",
  requireAuth,
  requirePermission("catalog.manage"),
  async (req, res) => {
    const query = validate(listCatalogItemsQuerySchema, req.query, res);
    if (!query) return;

    const where: Prisma.CatalogItemWhereInput = {};
    if (query.isActive   !== undefined) where.isActive   = query.isActive;
    if (query.categoryId !== undefined) where.categoryId = query.categoryId;
    if (query.search) {
      where.OR = [
        { name:             { contains: query.search, mode: "insensitive" } },
        { shortDescription: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const items = await prisma.catalogItem.findMany({
      where,
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { ...ITEM_DETAIL_SELECT, _count: { select: { requests: true } } },
    });

    res.json({ items });
  }
);

router.post(
  "/admin/items",
  requireAuth,
  requirePermission("catalog.manage"),
  async (req, res) => {
    const data = validate(createCatalogItemSchema, req.body, res);
    if (!data) return;

    if (data.categoryId) {
      const cat = await prisma.catalogCategory.findUnique({ where: { id: data.categoryId } });
      if (!cat) { res.status(400).json({ error: "Category not found" }); return; }
    }
    if (data.fulfillmentTeamId) {
      const team = await prisma.team.findUnique({ where: { id: data.fulfillmentTeamId } });
      if (!team) { res.status(400).json({ error: "Fulfillment team not found" }); return; }
    }
    if (data.requiresApproval && data.approverIds.length === 0) {
      res.status(400).json({ error: "At least one approver required when approval is enabled" });
      return;
    }

    const item = await prisma.catalogItem.create({
      data: {
        name:                  data.name,
        shortDescription:      data.shortDescription ?? null,
        description:           data.description ?? null,
        categoryId:            data.categoryId ?? null,
        isActive:              data.isActive,
        requestorInstructions: data.requestorInstructions ?? null,
        fulfillmentTeamId:     data.fulfillmentTeamId ?? null,
        requiresApproval:      data.requiresApproval,
        approvalMode:          data.approvalMode,
        approverIds:           data.approverIds,
        formSchema:            data.formSchema as Prisma.InputJsonValue,
        position:              data.position,
        icon:                  data.icon ?? null,
        createdById:           req.user.id,
      },
      select: { ...ITEM_DETAIL_SELECT, _count: { select: { requests: true } } },
    });

    res.status(201).json(item);
  }
);

router.patch(
  "/admin/items/:id",
  requireAuth,
  requirePermission("catalog.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const data = validate(updateCatalogItemSchema, req.body, res);
    if (!data) return;

    const current = await prisma.catalogItem.findUnique({
      where: { id }, select: { id: true, requiresApproval: true, approverIds: true },
    });
    if (!current) { res.status(404).json({ error: "Catalog item not found" }); return; }

    if (data.categoryId !== undefined && data.categoryId !== null) {
      const cat = await prisma.catalogCategory.findUnique({ where: { id: data.categoryId } });
      if (!cat) { res.status(400).json({ error: "Category not found" }); return; }
    }
    if (data.fulfillmentTeamId !== undefined && data.fulfillmentTeamId !== null) {
      const team = await prisma.team.findUnique({ where: { id: data.fulfillmentTeamId } });
      if (!team) { res.status(400).json({ error: "Fulfillment team not found" }); return; }
    }

    // Check approverIds consistency
    const newRequiresApproval = data.requiresApproval ?? current.requiresApproval;
    const newApproverIds      = data.approverIds ?? current.approverIds;
    if (newRequiresApproval && newApproverIds.length === 0) {
      res.status(400).json({ error: "At least one approver required when approval is enabled" });
      return;
    }

    const updateData: Prisma.CatalogItemUpdateInput = {};
    if (data.name                  !== undefined) updateData.name                  = data.name;
    if (data.shortDescription      !== undefined) updateData.shortDescription      = data.shortDescription;
    if (data.description           !== undefined) updateData.description           = data.description;
    if (data.categoryId            !== undefined) updateData.category              = data.categoryId ? { connect: { id: data.categoryId } } : { disconnect: true };
    if (data.isActive              !== undefined) updateData.isActive              = data.isActive;
    if (data.requestorInstructions !== undefined) updateData.requestorInstructions = data.requestorInstructions;
    if (data.fulfillmentTeamId     !== undefined) updateData.fulfillmentTeam       = data.fulfillmentTeamId ? { connect: { id: data.fulfillmentTeamId } } : { disconnect: true };
    if (data.requiresApproval      !== undefined) updateData.requiresApproval      = data.requiresApproval;
    if (data.approvalMode          !== undefined) updateData.approvalMode          = data.approvalMode;
    if (data.approverIds           !== undefined) updateData.approverIds           = data.approverIds;
    if (data.formSchema            !== undefined) updateData.formSchema            = data.formSchema as Prisma.InputJsonValue;
    if (data.position              !== undefined) updateData.position              = data.position;
    if (data.icon                  !== undefined) updateData.icon                  = data.icon;

    const item = await prisma.catalogItem.update({
      where: { id },
      data: updateData,
      select: { ...ITEM_DETAIL_SELECT, _count: { select: { requests: true } } },
    });

    res.json(item);
  }
);

router.delete(
  "/admin/items/:id",
  requireAuth,
  requirePermission("catalog.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const existing = await prisma.catalogItem.findUnique({
      where: { id }, select: { _count: { select: { requests: true } } },
    });
    if (!existing) { res.status(404).json({ error: "Catalog item not found" }); return; }

    if (existing._count.requests > 0) {
      // Soft-delete: deactivate instead of hard delete to preserve request history
      await prisma.catalogItem.update({
        where: { id }, data: { isActive: false },
      });
      res.json({ deactivated: true, reason: "Item has existing requests — deactivated instead of deleted" });
      return;
    }

    await prisma.catalogItem.delete({ where: { id } });
    res.status(204).end();
  }
);

export default router;
