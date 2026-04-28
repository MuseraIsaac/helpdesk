import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import {
  createAssetSchema,
  updateAssetSchema,
  listAssetsQuerySchema,
  assignAssetSchema,
  lifecycleTransitionSchema,
  addAssetRelationshipSchema,
  linkEntitySchema,
  bulkAssetActionSchema,
} from "core/schemas/assets.ts";
import {
  receiveAssetSchema,
  transferAssetSchema,
  issueAssetSchema,
  returnAssetSchema,
  sendRepairSchema,
  completeRepairSchema,
} from "core/schemas/inventory.ts";
import { ASSET_STATUSES } from "core/constants/assets.ts";
import { computeDepreciation } from "../lib/depreciation";
import { logAssetEvent } from "../lib/asset-events";
import { logSystemAudit } from "../lib/audit";
import {
  transitionAsset,
  LifecycleTransitionError,
  addRelationship,
  removeRelationship,
  linkAssetToIncident,    unlinkAssetFromIncident,
  linkAssetToRequest,     unlinkAssetFromRequest,
  linkAssetToProblem,     unlinkAssetFromProblem,
  linkAssetToChange,      unlinkAssetFromChange,
  linkAssetToService,     unlinkAssetFromService,
  linkAssetToTicket,      unlinkAssetFromTicket,
} from "../lib/assets";
import prisma from "../db";
import type { Prisma, AssetType, AssetStatus, AssetCondition, DepreciationMethod, AssetRelationshipType } from "../generated/prisma/client";

const router = Router();

// ── Asset number generation ───────────────────────────────────────────────────

async function generateAssetNumber(): Promise<string> {
  const [row] = await prisma.$queryRaw<[{ last_value: number }]>`
    INSERT INTO ticket_counter (series, period_key, last_value)
    VALUES ('asset', '', 1)
    ON CONFLICT (series, period_key)
    DO UPDATE SET last_value = ticket_counter.last_value + 1
    RETURNING last_value
  `;
  return `ASSET-${String(row.last_value).padStart(5, "0")}`;
}

// ── Projections ───────────────────────────────────────────────────────────────

const ASSET_SUMMARY_SELECT = {
  id:            true,
  assetNumber:   true,
  name:          true,
  type:          true,
  status:        true,
  condition:     true,
  manufacturer:  true,
  model:         true,
  serialNumber:  true,
  assetTag:      true,
  location:      true,
  warrantyExpiry: true,
  purchaseDate:   true,
  purchasePrice:  true,
  currency:       true,
  vendor:         true,
  contractReference: true,
  externalId:      true,
  discoverySource: true,
  managedBy:       true,
  assignedTo: { select: { id: true, name: true } },
  owner:      { select: { id: true, name: true } },
  team:       { select: { id: true, name: true, color: true } },
  ci:         { select: { id: true, ciNumber: true, name: true } },
  inventoryLocation: { select: { id: true, name: true, code: true, locationType: true } },
  createdAt:  true,
  updatedAt:  true,
  _count: {
    select: {
      relationshipsFrom: true,
      relationshipsTo:   true,
      incidentLinks:     true,
      requestLinks:      true,
      problemLinks:      true,
      changeLinks:       true,
      ticketLinks:       true,
    },
  },
} as const;

const ASSET_DETAIL_SELECT = {
  ...ASSET_SUMMARY_SELECT,
  site:               true,
  building:           true,
  room:               true,
  poNumber:           true,
  vendor:             true,
  invoiceNumber:      true,
  warrantyType:       true,
  receivedAt:         true,
  deployedAt:         true,
  endOfLifeAt:        true,
  retiredAt:          true,
  lastDiscoveredAt:   true,
  depreciationMethod: true,
  usefulLifeYears:    true,
  salvageValue:       true,
  notes:              true,
  contractReference:   true,
  complianceNotes:     true,
  disposalMethod:      true,
  disposalCertificate: true,
  // Relationships
  relationshipsFrom: {
    select: {
      id:      true,
      type:    true,
      toAsset: { select: ASSET_SUMMARY_SELECT },
    },
  },
  relationshipsTo: {
    select: {
      id:        true,
      type:      true,
      fromAsset: { select: ASSET_SUMMARY_SELECT },
    },
  },
  // ITIL links
  incidentLinks: {
    select: {
      linkedAt: true,
      incident: { select: { id: true, incidentNumber: true, title: true, status: true } },
    },
  },
  requestLinks: {
    select: {
      linkedAt: true,
      request: { select: { id: true, requestNumber: true, title: true, status: true } },
    },
  },
  problemLinks: {
    select: {
      linkedAt: true,
      problem: { select: { id: true, problemNumber: true, title: true, status: true } },
    },
  },
  changeLinks: {
    select: {
      linkedAt: true,
      change: { select: { id: true, changeNumber: true, title: true, state: true } },
    },
  },
  serviceLinks: {
    select: {
      linkedAt:    true,
      catalogItem: { select: { id: true, name: true, isActive: true } },
    },
  },
  ticketLinks: {
    select: {
      linkedAt: true,
      ticket: { select: { id: true, ticketNumber: true, subject: true, status: true } },
    },
  },
  // Movement history (recent 50)
  movements: {
    orderBy: { createdAt: "desc" as const },
    take: 50,
    select: {
      id: true, movementType: true,
      fromLocationId: true,
      fromLocation: { select: { id: true, name: true, code: true } },
      toLocationId: true,
      toLocation:   { select: { id: true, name: true, code: true } },
      fromLabel: true, toLabel: true,
      statusBefore: true, statusAfter: true,
      reference: true, notes: true,
      createdAt: true,
      performedBy: { select: { id: true, name: true } },
    },
  },
  // Assignment history
  assignments: {
    orderBy: { assignedAt: "desc" as const },
    select: {
      id: true, assignedAt: true, unassignedAt: true, note: true,
      user:       { select: { id: true, name: true } },
      assignedBy: { select: { id: true, name: true } },
    },
  },
  // Audit log
  events: {
    orderBy: { createdAt: "desc" as const },
    take: 60,
    select: {
      id: true, action: true, meta: true, createdAt: true,
      actor: { select: { id: true, name: true } },
    },
  },
  // Linked contracts
  assetContracts: {
    select: {
      linkedAt: true,
      contract: {
        select: {
          id: true, contractNumber: true, title: true, type: true, status: true,
          vendor: true, endDate: true, renewalDate: true,
          value: true, currency: true, supportLevel: true, slaResponseHours: true,
          autoRenews: true,
        },
      },
    },
  },
} as const;

// ── GET /api/assets/stats ────────────────────────────────────────────────────
// Must be registered BEFORE /:id to avoid Express matching "stats" as an ID.

router.get(
  "/stats",
  requireAuth,
  requirePermission("assets.view"),
  async (_req, res) => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 90);

    const [rawByStatus, warrantyExpiring, total] = await prisma.$transaction([
      prisma.$queryRaw<Array<{ status: string; n: bigint }>>`
        SELECT status, COUNT(*) AS n FROM asset GROUP BY status
      `,
      prisma.asset.count({
        where: { warrantyExpiry: { lte: soon, gte: new Date() } },
      }),
      prisma.asset.count(),
    ]);

    const statusMap: Record<string, number> = {};
    for (const row of rawByStatus) {
      statusMap[row.status] = Number(row.n);
    }

    const active       = (statusMap["deployed"] ?? 0) + (statusMap["in_use"] ?? 0);
    const inStock      = statusMap["in_stock"] ?? 0;
    const ordered      = statusMap["ordered"] ?? 0;
    const maintenance  = (statusMap["under_maintenance"] ?? 0) + (statusMap["in_repair"] ?? 0);
    const retired      = (statusMap["retired"] ?? 0) + (statusMap["disposed"] ?? 0);
    const lostStolen   = statusMap["lost_stolen"] ?? 0;

    res.json({
      total,
      active,
      inStock,
      ordered,
      maintenance,
      retired,
      lostStolen,
      warrantyExpiring,
      byStatus: statusMap,
    });
  }
);

// ── GET /api/assets/link-metrics ─────────────────────────────────────────────
// Fleet-wide cross-module impact metrics. Must be before /:id routes.

router.get(
  "/link-metrics",
  requireAuth,
  requirePermission("assets.view"),
  async (_req, res) => {
    const [
      incidentCount,
      requestCount,
      problemCount,
      changeCount,
      serviceCount,
      ticketCount,
      assetsWithLinks,
      openIncidentAssets,
      activeChangeAssets,
      openProblemAssets,
      pendingRequestAssets,
      openTicketAssets,
      topImpacted,
    ] = await Promise.all([
      prisma.assetIncidentLink.count(),
      prisma.assetRequestLink.count(),
      prisma.assetProblemLink.count(),
      prisma.assetChangeLink.count(),
      prisma.assetServiceLink.count(),
      prisma.assetTicketLink.count(),

      prisma.asset.count({
        where: {
          OR: [
            { incidentLinks: { some: {} } },
            { requestLinks:  { some: {} } },
            { problemLinks:  { some: {} } },
            { changeLinks:   { some: {} } },
            { serviceLinks:  { some: {} } },
            { ticketLinks:   { some: {} } },
          ],
        },
      }),

      // Assets with at least one non-resolved incident
      prisma.asset.count({
        where: {
          incidentLinks: {
            some: { incident: { status: { notIn: ["resolved", "closed"] } } },
          },
        },
      }),

      // Assets with at least one active (non-terminal) change
      prisma.asset.count({
        where: {
          changeLinks: {
            some: {
              change: { state: { notIn: ["closed", "cancelled", "failed"] } },
            },
          },
        },
      }),

      // Assets with an open problem
      prisma.asset.count({
        where: {
          problemLinks: {
            some: { problem: { status: { notIn: ["resolved", "closed"] } } },
          },
        },
      }),

      // Assets with a pending/in-progress service request
      prisma.asset.count({
        where: {
          requestLinks: {
            some: {
              request: { status: { notIn: ["fulfilled", "closed", "rejected", "cancelled"] } },
            },
          },
        },
      }),

      // Assets with an open ticket
      prisma.asset.count({
        where: {
          ticketLinks: {
            some: {
              ticket: { status: { notIn: ["resolved", "closed"] } },
            },
          },
        },
      }),

      // Top 10 most-linked assets
      prisma.asset.findMany({
        where: {
          OR: [
            { incidentLinks: { some: {} } },
            { requestLinks:  { some: {} } },
            { problemLinks:  { some: {} } },
            { changeLinks:   { some: {} } },
            { ticketLinks:   { some: {} } },
          ],
        },
        select: {
          id: true,
          assetNumber: true,
          name: true,
          type: true,
          status: true,
          _count: {
            select: {
              incidentLinks: true,
              requestLinks:  true,
              problemLinks:  true,
              changeLinks:   true,
              serviceLinks:  true,
              ticketLinks:   true,
            },
          },
        },
        take: 10,
      }),
    ]);

    const totalLinks = incidentCount + requestCount + problemCount + changeCount + serviceCount + ticketCount;

    res.json({
      totalLinks,
      byType: {
        incidents: incidentCount,
        requests:  requestCount,
        problems:  problemCount,
        changes:   changeCount,
        services:  serviceCount,
        tickets:   ticketCount,
      },
      assetsWithLinks,
      activeAlerts: {
        openIncidentAssets,
        activeChangeAssets,
        openProblemAssets,
        pendingRequestAssets,
        openTicketAssets,
      },
      topImpacted: topImpacted
        .map(a => ({
          id:          a.id,
          assetNumber: a.assetNumber,
          name:        a.name,
          type:        a.type,
          status:      a.status,
          totalLinks:  a._count.incidentLinks + a._count.requestLinks + a._count.problemLinks + a._count.changeLinks + a._count.serviceLinks + a._count.ticketLinks,
          counts: {
            incidents: a._count.incidentLinks,
            requests:  a._count.requestLinks,
            problems:  a._count.problemLinks,
            changes:   a._count.changeLinks,
            services:  a._count.serviceLinks,
            tickets:   a._count.ticketLinks,
          },
        }))
        .sort((a, b) => b.totalLinks - a.totalLinks),
    });
  }
);

// ── POST /api/assets/bulk ─────────────────────────────────────────────────────
// Must be registered BEFORE /:id routes.

router.post(
  "/bulk",
  requireAuth,
  requirePermission("assets.update"),
  async (req, res) => {
    const data = validate(bulkAssetActionSchema, req.body, res);
    if (!data) return;

    switch (data.action) {
      case "delete": {
        const active = await prisma.asset.count({
          where: { id: { in: data.ids }, status: { in: ["deployed", "in_use"] } },
        });
        if (active > 0) {
          res.status(409).json({
            error: `${active} selected asset(s) are active (deployed or in use). Retire or return them first.`,
          });
          return;
        }
        const { count } = await prisma.asset.updateMany({
          where: { id: { in: data.ids }, deletedAt: null },
          data:  { deletedAt: new Date(), deletedById: req.user.id, deletedByName: req.user.name },
        });
        res.json({ affected: count });
        break;
      }

      case "transition": {
        let affected = 0;
        let skipped  = 0;
        for (const id of data.ids) {
          try {
            await transitionAsset(id, data.status as AssetStatus, req.user.id, data.reason);
            affected++;
          } catch (err) {
            if (err instanceof LifecycleTransitionError) { skipped++; }
            else throw err;
          }
        }
        res.json({ affected, skipped });
        break;
      }

      case "assign": {
        const now = new Date();
        if (data.userId === null) {
          await prisma.$transaction([
            prisma.assetAssignment.updateMany({
              where: { assetId: { in: data.ids }, unassignedAt: null },
              data:  { unassignedAt: now },
            }),
            prisma.asset.updateMany({
              where: { id: { in: data.ids } },
              data:  { assignedToId: null, assignedAt: null },
            }),
          ]);
        } else {
          const user = await prisma.user.findFirst({
            where: { id: data.userId, deletedAt: null },
            select: { id: true, name: true },
          });
          if (!user) { res.status(400).json({ error: "User not found" }); return; }

          await prisma.$transaction([
            prisma.assetAssignment.updateMany({
              where: { assetId: { in: data.ids }, unassignedAt: null },
              data:  { unassignedAt: now },
            }),
            prisma.assetAssignment.createMany({
              data: data.ids.map(id => ({
                assetId:      id,
                userId:       data.userId!,
                note:         data.note ?? null,
                assignedById: req.user.id,
              })),
            }),
            prisma.asset.updateMany({
              where: { id: { in: data.ids } },
              data:  { assignedToId: data.userId, assignedAt: now },
            }),
          ]);
        }
        res.json({ affected: data.ids.length });
        break;
      }

      case "owner": {
        if (data.ownerId !== null) {
          const user = await prisma.user.findFirst({
            where: { id: data.ownerId, deletedAt: null },
            select: { id: true },
          });
          if (!user) { res.status(400).json({ error: "User not found" }); return; }
        }
        await prisma.asset.updateMany({
          where: { id: { in: data.ids } },
          data:  { ownerId: data.ownerId },
        });
        res.json({ affected: data.ids.length });
        break;
      }

      case "team": {
        if (data.teamId !== null) {
          const team = await prisma.team.findUnique({ where: { id: data.teamId }, select: { id: true } });
          if (!team) { res.status(400).json({ error: "Team not found" }); return; }
        }
        await prisma.asset.updateMany({
          where: { id: { in: data.ids } },
          data:  { teamId: data.teamId },
        });
        res.json({ affected: data.ids.length });
        break;
      }

      case "location": {
        await prisma.asset.updateMany({
          where: { id: { in: data.ids } },
          data:  { location: data.location },
        });
        res.json({ affected: data.ids.length });
        break;
      }
    }
  }
);

// ── GET /api/assets ───────────────────────────────────────────────────────────

router.get(
  "/",
  requireAuth,
  requirePermission("assets.view"),
  async (req, res) => {
    const q = validate(listAssetsQuerySchema, req.query, res);
    if (!q) return;

    const {
      type, status, statuses, condition, assignedToId, ownerId, teamId,
      inventoryLocationId,
      discoverySource, warrantyExpiringSoon, search, page, pageSize, sortBy, sortOrder,
    } = q;

    const where: Prisma.AssetWhereInput = { deletedAt: null };
    if (type) where.type = type as AssetType;
    if (statuses) {
      const list = statuses.split(",").map((s: string) => s.trim())
        .filter((s: string) => (ASSET_STATUSES as readonly string[]).includes(s)) as AssetStatus[];
      if (list.length === 1) where.status = list[0];
      else if (list.length > 1) where.status = { in: list };
    } else if (status) {
      where.status = status as AssetStatus;
    }
    if (condition)       where.condition       = condition as AssetCondition;
    if (assignedToId)       where.assignedToId       = assignedToId;
    if (ownerId)            where.ownerId            = ownerId;
    if (teamId)             where.teamId             = teamId;
    if (inventoryLocationId) where.inventoryLocationId = inventoryLocationId;
    if (discoverySource)    where.discoverySource    = discoverySource;

    if (warrantyExpiringSoon) {
      const threshold = new Date();
      threshold.setDate(threshold.getDate() + 90);
      where.warrantyExpiry = { lte: threshold, gte: new Date() };
    }

    if (search) {
      where.OR = [
        { name:         { contains: search, mode: "insensitive" } },
        { assetNumber:  { contains: search, mode: "insensitive" } },
        { manufacturer: { contains: search, mode: "insensitive" } },
        { model:        { contains: search, mode: "insensitive" } },
        { serialNumber: { contains: search, mode: "insensitive" } },
        { assetTag:     { contains: search, mode: "insensitive" } },
        { vendor:       { contains: search, mode: "insensitive" } },
        { externalId:   { contains: search, mode: "insensitive" } },
      ];
    }

    const orderBy: Prisma.AssetOrderByWithRelationInput =
      sortBy === "assetNumber"    ? { assetNumber:    sortOrder } :
      sortBy === "type"           ? { type:           sortOrder } :
      sortBy === "status"         ? { status:         sortOrder } :
      sortBy === "condition"      ? { condition:      sortOrder } :
      sortBy === "warrantyExpiry" ? { warrantyExpiry: sortOrder } :
      sortBy === "purchaseDate"   ? { purchaseDate:   sortOrder } :
      sortBy === "updatedAt"      ? { updatedAt:      sortOrder } :
      sortBy === "createdAt"      ? { createdAt:      sortOrder } :
                                    { name:           sortOrder };

    const [total, items] = await prisma.$transaction([
      prisma.asset.count({ where }),
      prisma.asset.findMany({
        where, orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: ASSET_SUMMARY_SELECT,
      }),
    ]);

    res.json({
      items: items.map(normaliseSummary),
      meta:  { total, page, pageSize, pages: Math.ceil(total / pageSize) },
    });
  }
);

// ── GET /api/assets/:id ───────────────────────────────────────────────────────

router.get(
  "/:id",
  requireAuth,
  requirePermission("assets.view"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const asset = await prisma.asset.findUnique({
      where: { id },
      select: ASSET_DETAIL_SELECT,
    });
    if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }

    res.json(normaliseDetail(asset));
  }
);

// ── POST /api/assets ──────────────────────────────────────────────────────────

router.post(
  "/",
  requireAuth,
  requirePermission("assets.create"),
  async (req, res) => {
    const data = validate(createAssetSchema, req.body, res);
    if (!data) return;

    if (!(await validateFKs(data, res))) return;

    if (data.assetTag) {
      const conflict = await prisma.asset.findUnique({ where: { assetTag: data.assetTag }, select: { id: true } });
      if (conflict) { res.status(409).json({ error: "An asset with this asset tag already exists" }); return; }
    }

    if (data.externalId && data.discoverySource) {
      const conflict = await prisma.asset.findFirst({
        where: { externalId: data.externalId, discoverySource: data.discoverySource },
        select: { id: true },
      });
      if (conflict) { res.status(409).json({ error: "An asset with this externalId / discoverySource pair already exists" }); return; }
    }

    const assetNumber = await generateAssetNumber();

    const asset = await prisma.asset.create({
      data: {
        assetNumber,
        name:               data.name,
        type:               data.type as AssetType,
        status:             data.status as AssetStatus,
        condition:          data.condition as AssetCondition,
        manufacturer:       data.manufacturer ?? null,
        model:              data.model ?? null,
        serialNumber:       data.serialNumber ?? null,
        assetTag:           data.assetTag ?? null,
        purchaseDate:       data.purchaseDate  ? new Date(data.purchaseDate)  : null,
        purchasePrice:      data.purchasePrice ?? null,
        currency:           data.currency,
        poNumber:           data.poNumber ?? null,
        vendor:             data.vendor ?? null,
        invoiceNumber:      data.invoiceNumber ?? null,
        warrantyExpiry:     data.warrantyExpiry ? new Date(data.warrantyExpiry) : null,
        warrantyType:       data.warrantyType ?? null,
        receivedAt:         data.receivedAt  ? new Date(data.receivedAt)  : null,
        deployedAt:         data.deployedAt  ? new Date(data.deployedAt)  : null,
        endOfLifeAt:        data.endOfLifeAt ? new Date(data.endOfLifeAt) : null,
        location:           data.location ?? null,
        site:               data.site ?? null,
        building:           data.building ?? null,
        room:               data.room ?? null,
        depreciationMethod: data.depreciationMethod as DepreciationMethod,
        usefulLifeYears:    data.usefulLifeYears ?? null,
        salvageValue:       data.salvageValue ?? null,
        notes:              data.notes ?? null,
        ownerId:            data.ownerId ?? null,
        teamId:             data.teamId ?? null,
        ciId:               data.ciId ?? null,
        externalId:          data.externalId ?? null,
        discoverySource:     data.discoverySource ?? null,
        managedBy:           data.managedBy ?? null,
        contractReference:   data.contractReference ?? null,
        complianceNotes:     data.complianceNotes ?? null,
        disposalMethod:      data.disposalMethod ?? null,
        disposalCertificate: data.disposalCertificate ?? null,
        createdById:         req.user.id,
      },
      select: ASSET_DETAIL_SELECT,
    });

    await logAssetEvent(asset.id, req.user.id, "asset.created", {
      name: data.name, type: data.type, status: data.status,
    });

    void logSystemAudit(req.user.id, "asset.created", {
      entityType: "asset", entityId: asset.id, entityNumber: asset.assetNumber,
      entityTitle: asset.name, assetTag: asset.assetTag ?? undefined, type: data.type, status: data.status,
    });

    res.status(201).json(normaliseDetail(asset));
  }
);

// ── PATCH /api/assets/:id ─────────────────────────────────────────────────────

router.patch(
  "/:id",
  requireAuth,
  requirePermission("assets.update"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const data = validate(updateAssetSchema, req.body, res);
    if (!data) return;

    const current = await prisma.asset.findUnique({
      where: { id },
      select: { id: true, status: true, assetTag: true },
    });
    if (!current) { res.status(404).json({ error: "Asset not found" }); return; }

    if (data.assetTag != null && data.assetTag !== current.assetTag) {
      const conflict = await prisma.asset.findFirst({ where: { assetTag: data.assetTag, NOT: { id } }, select: { id: true } });
      if (conflict) { res.status(409).json({ error: "An asset with this asset tag already exists" }); return; }
    }

    if (!(await validateFKs(data, res))) return;

    const updateData: Prisma.AssetUpdateInput = {};
    if (data.name         !== undefined) updateData.name         = data.name;
    if (data.type         !== undefined) updateData.type         = data.type as AssetType;
    if (data.condition    !== undefined) updateData.condition    = data.condition as AssetCondition;
    if (data.manufacturer !== undefined) updateData.manufacturer = data.manufacturer;
    if (data.model        !== undefined) updateData.model        = data.model;
    if (data.serialNumber !== undefined) updateData.serialNumber = data.serialNumber;
    if (data.assetTag     !== undefined) updateData.assetTag     = data.assetTag;
    if (data.purchaseDate  !== undefined) updateData.purchaseDate  = data.purchaseDate  ? new Date(data.purchaseDate)  : null;
    if (data.purchasePrice !== undefined) updateData.purchasePrice = data.purchasePrice;
    if (data.currency      !== undefined) updateData.currency      = data.currency;
    if (data.poNumber      !== undefined) updateData.poNumber      = data.poNumber;
    if (data.vendor        !== undefined) updateData.vendor        = data.vendor;
    if (data.invoiceNumber !== undefined) updateData.invoiceNumber = data.invoiceNumber;
    if (data.warrantyExpiry !== undefined) updateData.warrantyExpiry = data.warrantyExpiry ? new Date(data.warrantyExpiry) : null;
    if (data.warrantyType   !== undefined) updateData.warrantyType   = data.warrantyType;
    if (data.receivedAt  !== undefined) updateData.receivedAt  = data.receivedAt  ? new Date(data.receivedAt)  : null;
    if (data.deployedAt  !== undefined) updateData.deployedAt  = data.deployedAt  ? new Date(data.deployedAt)  : null;
    if (data.endOfLifeAt !== undefined) updateData.endOfLifeAt = data.endOfLifeAt ? new Date(data.endOfLifeAt) : null;
    if (data.retiredAt   !== undefined) updateData.retiredAt   = data.retiredAt   ? new Date(data.retiredAt)   : null;
    if (data.location  !== undefined) updateData.location  = data.location;
    if (data.site      !== undefined) updateData.site      = data.site;
    if (data.building  !== undefined) updateData.building  = data.building;
    if (data.room      !== undefined) updateData.room      = data.room;
    if (data.depreciationMethod !== undefined) updateData.depreciationMethod = data.depreciationMethod as DepreciationMethod;
    if (data.usefulLifeYears    !== undefined) updateData.usefulLifeYears    = data.usefulLifeYears;
    if (data.salvageValue       !== undefined) updateData.salvageValue       = data.salvageValue;
    if (data.notes        !== undefined) updateData.notes        = data.notes;
    if (data.ownerId      !== undefined) updateData.owner  = data.ownerId  ? { connect: { id: data.ownerId  } } : { disconnect: true };
    if (data.teamId       !== undefined) updateData.team   = data.teamId   ? { connect: { id: data.teamId   } } : { disconnect: true };
    if (data.ciId         !== undefined) updateData.ci     = data.ciId     ? { connect: { id: data.ciId     } } : { disconnect: true };
    if (data.externalId          !== undefined) updateData.externalId          = data.externalId;
    if (data.discoverySource     !== undefined) updateData.discoverySource     = data.discoverySource;
    if (data.managedBy           !== undefined) updateData.managedBy           = data.managedBy;
    if (data.contractReference   !== undefined) updateData.contractReference   = data.contractReference;
    if (data.complianceNotes     !== undefined) updateData.complianceNotes     = data.complianceNotes;
    if (data.disposalMethod      !== undefined) updateData.disposalMethod      = data.disposalMethod;
    if (data.disposalCertificate !== undefined) updateData.disposalCertificate = data.disposalCertificate;

    const asset = await prisma.asset.update({
      where: { id },
      data:  updateData,
      select: ASSET_DETAIL_SELECT,
    });

    await logAssetEvent(id, req.user.id, "asset.updated", { fields: Object.keys(data) });

    const aBase = { entityType: "asset", entityId: id, entityNumber: asset.assetNumber, entityTitle: asset.name, assetTag: asset.assetTag ?? undefined };
    void logSystemAudit(req.user.id, "asset.updated", { ...aBase, changes: Object.keys(data) });

    res.json(normaliseDetail(asset));
  }
);

// ── DELETE /api/assets/:id ────────────────────────────────────────────────────

router.delete(
  "/:id",
  requireAuth,
  requirePermission("assets.manage_inventory"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const asset = await prisma.asset.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }

    if (asset.status === "deployed" || asset.status === "in_use") {
      res.status(409).json({ error: "Cannot delete an active asset. Retire or return it first." });
      return;
    }

    await prisma.asset.update({
      where: { id },
      data:  { deletedAt: new Date(), deletedById: req.user.id, deletedByName: req.user.name },
    });
    res.status(204).end();
  }
);

// ── POST /api/assets/:id/clone ────────────────────────────────────────────────
// Creates a copy of the asset: new number, status → in_stock, no assignment,
// no discovery/external IDs, no events or relationships. Name gets " (copy)".

router.post(
  "/:id/clone",
  requireAuth,
  requirePermission("assets.create"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const src = await prisma.asset.findUnique({
      where: { id },
      select: {
        name: true, type: true, condition: true,
        manufacturer: true, model: true,
        serialNumber: true,   // intentionally cleared — clone is a different unit
        warrantyExpiry: true, warrantyType: true,
        purchaseDate: true, purchasePrice: true, currency: true,
        vendor: true, poNumber: true, invoiceNumber: true,
        location: true, site: true, building: true, room: true,
        depreciationMethod: true, usefulLifeYears: true, salvageValue: true,
        notes: true,
        contractReference: true, complianceNotes: true,
        ownerId: true, teamId: true, ciId: true,
      },
    });
    if (!src) { res.status(404).json({ error: "Asset not found" }); return; }

    const assetNumber = await generateAssetNumber();

    const clone = await prisma.asset.create({
      data: {
        assetNumber,
        name:               `${src.name} (copy)`,
        type:               src.type,
        status:             "in_stock",
        condition:          src.condition,
        manufacturer:       src.manufacturer,
        model:              src.model,
        warrantyExpiry:     src.warrantyExpiry,
        warrantyType:       src.warrantyType,
        purchaseDate:       src.purchaseDate,
        purchasePrice:      src.purchasePrice,
        currency:           src.currency,
        vendor:             src.vendor,
        poNumber:           src.poNumber,
        invoiceNumber:      src.invoiceNumber,
        location:           src.location,
        site:               src.site,
        building:           src.building,
        room:               src.room,
        depreciationMethod: src.depreciationMethod,
        usefulLifeYears:    src.usefulLifeYears,
        salvageValue:       src.salvageValue,
        notes:              src.notes,
        contractReference:  src.contractReference,
        complianceNotes:    src.complianceNotes,
        ownerId:            src.ownerId,
        teamId:             src.teamId,
        ciId:               src.ciId,
        createdById:        req.user.id,
      },
      select: { id: true, assetNumber: true },
    });

    await logAssetEvent(clone.id, req.user.id, "asset.cloned_from", { sourceAssetId: id });

    res.status(201).json({ id: clone.id, assetNumber: clone.assetNumber });
  }
);

// ── POST /api/assets/:id/lifecycle ────────────────────────────────────────────

router.post(
  "/:id/lifecycle",
  requireAuth,
  requirePermission("assets.manage_lifecycle"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const data = validate(lifecycleTransitionSchema, req.body, res);
    if (!data) return;

    const before = await prisma.asset.findUnique({ where: { id }, select: { status: true } });

    try {
      await transitionAsset(id, data.status as AssetStatus, req.user.id, data.reason);
    } catch (err) {
      if (err instanceof LifecycleTransitionError) {
        res.status(422).json({ error: err.message });
        return;
      }
      throw err;
    }

    const updated = await prisma.asset.findUniqueOrThrow({
      where: { id },
      select: ASSET_DETAIL_SELECT,
    });

    const lcBase = { entityType: "asset", entityId: id, entityNumber: updated.assetNumber, entityTitle: updated.name, assetTag: updated.assetTag ?? undefined };
    void logSystemAudit(req.user.id, "asset.status_changed", { ...lcBase, from: before?.status ?? null, to: data.status });
    if (data.status === "retired")  void logSystemAudit(req.user.id, "asset.retired",  lcBase);
    if (data.status === "disposed") void logSystemAudit(req.user.id, "asset.scrapped", lcBase);
    if (data.status === "deployed" || data.status === "in_use") void logSystemAudit(req.user.id, "asset.deployed", lcBase);

    res.json(normaliseDetail(updated));
  }
);

// ── POST /api/assets/:id/assign ───────────────────────────────────────────────

router.post(
  "/:id/assign",
  requireAuth,
  requirePermission("assets.manage_lifecycle"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const data = validate(assignAssetSchema, req.body, res);
    if (!data) return;

    const [asset, user] = await Promise.all([
      prisma.asset.findUnique({ where: { id }, select: { id: true, assignedToId: true } }),
      prisma.user.findFirst({ where: { id: data.userId, deletedAt: null }, select: { id: true, name: true } }),
    ]);
    if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
    if (!user)  { res.status(400).json({ error: "User not found" }); return; }

    await prisma.$transaction(async (tx) => {
      if (asset.assignedToId) {
        await tx.assetAssignment.updateMany({
          where: { assetId: id, unassignedAt: null },
          data:  { unassignedAt: new Date() },
        });
      }
      await tx.assetAssignment.create({
        data: { assetId: id, userId: data.userId, note: data.note ?? null, assignedById: req.user.id },
      });
      await tx.asset.update({
        where: { id },
        data:  { assignedToId: data.userId, assignedAt: new Date() },
      });
    });

    await logAssetEvent(id, req.user.id, "asset.assigned", {
      to: data.userId, name: user.name, note: data.note ?? null,
    });

    const updated = await prisma.asset.findUniqueOrThrow({ where: { id }, select: ASSET_DETAIL_SELECT });

    void logSystemAudit(req.user.id, "asset.assigned", {
      entityType: "asset", entityId: id, entityNumber: updated.assetNumber, entityTitle: updated.name,
      assetTag: updated.assetTag ?? undefined,
      from: asset.assignedToId ?? null,
      to: { id: user.id, name: user.name },
    });

    res.json(normaliseDetail(updated));
  }
);

// ── DELETE /api/assets/:id/assign ─────────────────────────────────────────────

router.delete(
  "/:id/assign",
  requireAuth,
  requirePermission("assets.manage_lifecycle"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const asset = await prisma.asset.findUnique({ where: { id }, select: { id: true, assignedToId: true } });
    if (!asset)              { res.status(404).json({ error: "Asset not found" }); return; }
    if (!asset.assignedToId) { res.status(400).json({ error: "Asset is not currently assigned" }); return; }

    await prisma.$transaction(async (tx) => {
      await tx.assetAssignment.updateMany({ where: { assetId: id, unassignedAt: null }, data: { unassignedAt: new Date() } });
      await tx.asset.update({ where: { id }, data: { assignedToId: null, assignedAt: null } });
    });

    await logAssetEvent(id, req.user.id, "asset.unassigned", { from: asset.assignedToId });
    const updated = await prisma.asset.findUniqueOrThrow({ where: { id }, select: ASSET_DETAIL_SELECT });

    void logSystemAudit(req.user.id, "asset.unassigned", {
      entityType: "asset", entityId: id, entityNumber: updated.assetNumber, entityTitle: updated.name,
      assetTag: updated.assetTag ?? undefined, from: asset.assignedToId,
    });

    res.json(normaliseDetail(updated));
  }
);

// ── CI link ───────────────────────────────────────────────────────────────────

router.put(
  "/:id/ci-link",
  requireAuth,
  requirePermission("assets.manage_relationships"),
  async (req, res) => {
    const id   = parseId(req.params.id);
    const ciId = parseId(req.body?.ciId);
    if (id === null || ciId === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [asset, ci] = await Promise.all([
      prisma.asset.findUnique({ where: { id }, select: { id: true } }),
      prisma.configItem.findUnique({ where: { id: ciId }, select: { id: true, name: true, ciNumber: true } }),
    ]);
    if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
    if (!ci)    { res.status(400).json({ error: "Configuration item not found" }); return; }

    await prisma.asset.update({ where: { id }, data: { ciId } });
    await logAssetEvent(id, req.user.id, "asset.ci_linked", { ciId, ciName: ci.name, ciNumber: ci.ciNumber });

    const updated = await prisma.asset.findUniqueOrThrow({ where: { id }, select: ASSET_DETAIL_SELECT });
    void logSystemAudit(req.user.id, "asset.linked_ci", {
      entityType: "asset", entityId: id, entityNumber: updated.assetNumber, entityTitle: updated.name,
      ciId, ciName: ci.name, ciNumber: ci.ciNumber,
    });
    res.json(normaliseDetail(updated));
  }
);

router.delete(
  "/:id/ci-link",
  requireAuth,
  requirePermission("assets.manage_relationships"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const asset = await prisma.asset.findUnique({ where: { id }, select: { id: true, ciId: true } });
    if (!asset)     { res.status(404).json({ error: "Asset not found" }); return; }
    if (!asset.ciId) { res.status(400).json({ error: "Asset is not linked to a CI" }); return; }

    await prisma.asset.update({ where: { id }, data: { ciId: null } });
    await logAssetEvent(id, req.user.id, "asset.ci_unlinked", { prevCiId: asset.ciId });
    const updated = await prisma.asset.findUniqueOrThrow({ where: { id }, select: ASSET_DETAIL_SELECT });
    res.json(normaliseDetail(updated));
  }
);

// ── Asset-to-asset relationships ──────────────────────────────────────────────

router.post(
  "/:id/relationships",
  requireAuth,
  requirePermission("assets.manage_relationships"),
  async (req, res) => {
    const fromAssetId = parseId(req.params.id);
    if (fromAssetId === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const data = validate(addAssetRelationshipSchema, req.body, res);
    if (!data) return;

    try {
      const rel = await addRelationship(fromAssetId, data.toAssetId, data.type as AssetRelationshipType, req.user.id);
      res.status(201).json(rel);
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) {
        res.status(404).json({ error: err.message }); return;
      }
      if (err instanceof Error && err.message.includes("itself")) {
        res.status(400).json({ error: err.message }); return;
      }
      throw err;
    }
  }
);

router.delete(
  "/:id/relationships/:relId",
  requireAuth,
  requirePermission("assets.manage_relationships"),
  async (req, res) => {
    const assetId = parseId(req.params.id);
    const relId   = parseId(req.params.relId);
    if (assetId === null || relId === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    try {
      await removeRelationship(relId, assetId, req.user.id);
      res.status(204).end();
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) {
        res.status(404).json({ error: err.message }); return;
      }
      throw err;
    }
  }
);

// ── Entity links (incidents / requests / problems / changes / services) ────────

function entityLinkRoutes(
  path: string,
  linkFn:   (assetId: number, entityId: number, actorId: string) => Promise<void>,
  unlinkFn: (assetId: number, entityId: number, actorId: string) => Promise<void>
) {
  router.post(
    `/:id/links/${path}/:entityId`,
    requireAuth,
    requirePermission("assets.manage_relationships"),
    async (req, res) => {
      const assetId   = parseId(req.params.id);
      const entityId  = parseId(req.params.entityId);
      if (assetId === null || entityId === null) { res.status(400).json({ error: "Invalid ID" }); return; }
      try {
        await linkFn(assetId, entityId, req.user.id);
      } catch (err) {
        const status = (err as any).status ?? 500;
        res.status(status).json({ error: (err as Error).message });
        return;
      }
      const updated = await prisma.asset.findUniqueOrThrow({ where: { id: assetId }, select: ASSET_DETAIL_SELECT });
      res.status(201).json(normaliseDetail(updated));
    }
  );

  router.delete(
    `/:id/links/${path}/:entityId`,
    requireAuth,
    requirePermission("assets.manage_relationships"),
    async (req, res) => {
      const assetId  = parseId(req.params.id);
      const entityId = parseId(req.params.entityId);
      if (assetId === null || entityId === null) { res.status(400).json({ error: "Invalid ID" }); return; }
      await unlinkFn(assetId, entityId, req.user.id);
      res.status(204).end();
    }
  );
}

entityLinkRoutes("incidents", linkAssetToIncident, unlinkAssetFromIncident);
entityLinkRoutes("requests",  linkAssetToRequest,  unlinkAssetFromRequest);
entityLinkRoutes("problems",  linkAssetToProblem,  unlinkAssetFromProblem);
entityLinkRoutes("changes",   linkAssetToChange,   unlinkAssetFromChange);
entityLinkRoutes("services",  linkAssetToService,  unlinkAssetFromService);
entityLinkRoutes("tickets",   linkAssetToTicket,   unlinkAssetFromTicket);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function validateFKs(
  data: { ownerId?: string | null; teamId?: number | null; ciId?: number | null },
  res: import("express").Response
): Promise<boolean> {
  if (data.ownerId) {
    const u = await prisma.user.findFirst({ where: { id: data.ownerId, deletedAt: null } });
    if (!u) { res.status(400).json({ error: "Owner not found" }); return false; }
  }
  if (data.teamId) {
    const t = await prisma.team.findUnique({ where: { id: data.teamId } });
    if (!t) { res.status(400).json({ error: "Team not found" }); return false; }
  }
  if (data.ciId) {
    const ci = await prisma.configItem.findUnique({ where: { id: data.ciId } });
    if (!ci) { res.status(400).json({ error: "Configuration item not found" }); return false; }
  }
  return true;
}

type RawSummary = Prisma.AssetGetPayload<{ select: typeof ASSET_SUMMARY_SELECT }>;
type RawDetail  = Prisma.AssetGetPayload<{ select: typeof ASSET_DETAIL_SELECT }>;

function normaliseSummary(raw: RawSummary) {
  const { _count, ...rest } = raw;
  return {
    ...rest,
    _counts: {
      relationships: _count.relationshipsFrom + _count.relationshipsTo,
      incidents:     _count.incidentLinks,
      requests:      _count.requestLinks,
      problems:      _count.problemLinks,
      changes:       _count.changeLinks,
      tickets:       _count.ticketLinks,
    },
  };
}

function daysUntil(d: Date | null): number | null {
  if (!d) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

function normaliseDetail(raw: RawDetail) {
  const { _count, relationshipsFrom, relationshipsTo, assignments, movements, assetContracts, ...rest } = raw;

  const relationships = [
    ...relationshipsFrom.map((r) => ({
      id: r.id, type: r.type, direction: "outbound" as const,
      asset: normaliseSummary(r.toAsset),
    })),
    ...relationshipsTo.map((r) => ({
      id: r.id, type: r.type, direction: "inbound" as const,
      asset: normaliseSummary(r.fromAsset),
    })),
  ];

  const depreciation = computeDepreciation(
    rest.depreciationMethod,
    rest.purchaseDate ?? null,
    rest.purchasePrice ? Number(rest.purchasePrice) : null,
    rest.salvageValue  ? Number(rest.salvageValue)  : null,
    rest.usefulLifeYears ?? null,
  );

  return {
    ...rest,
    depreciation,
    contracts: assetContracts.map(l => ({
      ...l.contract,
      daysUntilExpiry: daysUntil(l.contract.endDate),
      linkedAt: l.linkedAt,
    })),
    _counts: {
      relationships: _count.relationshipsFrom + _count.relationshipsTo,
      incidents:     _count.incidentLinks,
      requests:      _count.requestLinks,
      problems:      _count.problemLinks,
      changes:       _count.changeLinks,
      tickets:       _count.ticketLinks,
    },
    relationships,
    movements: movements.map((m) => ({
      id:           m.id,
      movementType: m.movementType,
      fromLocation: m.fromLocation,
      toLocation:   m.toLocation,
      fromLabel:    m.fromLabel,
      toLabel:      m.toLabel,
      statusBefore: m.statusBefore,
      statusAfter:  m.statusAfter,
      performedBy:  m.performedBy,
      reference:    m.reference,
      notes:        m.notes,
      createdAt:    m.createdAt,
    })),
    assignments: assignments.map((a) => ({
      id:           a.id,
      userId:       a.user.id,
      userName:     a.user.name,
      assignedAt:   a.assignedAt,
      unassignedAt: a.unassignedAt,
      note:         a.note,
      assignedBy:   a.assignedBy,
    })),
    incidents: raw.incidentLinks.map((l) => ({
      id:       l.incident.id,
      number:   l.incident.incidentNumber,
      title:    l.incident.title,
      status:   l.incident.status,
      linkedAt: l.linkedAt,
    })),
    requests: raw.requestLinks.map((l) => ({
      id:       l.request.id,
      number:   l.request.requestNumber,
      title:    l.request.title,
      status:   l.request.status,
      linkedAt: l.linkedAt,
    })),
    problems: raw.problemLinks.map((l) => ({
      id:       l.problem.id,
      number:   l.problem.problemNumber,
      title:    l.problem.title,
      status:   l.problem.status,
      linkedAt: l.linkedAt,
    })),
    changes: raw.changeLinks.map((l) => ({
      id:       l.change.id,
      number:   l.change.changeNumber,
      title:    l.change.title,
      status:   l.change.state,
      linkedAt: l.linkedAt,
    })),
    services: raw.serviceLinks.map((l) => ({
      id:       l.catalogItem.id,
      number:   String(l.catalogItem.id),
      title:    l.catalogItem.name,
      status:   l.catalogItem.isActive ? "active" : "inactive",
      linkedAt: l.linkedAt,
    })),
    tickets: raw.ticketLinks.map((l) => ({
      id:       l.ticket.id,
      number:   l.ticket.ticketNumber,
      title:    l.ticket.subject,
      status:   l.ticket.status,
      linkedAt: l.linkedAt,
    })),
  };
}

// ── Helper: record a movement + update asset location ─────────────────────────

async function recordMovement(
  assetId:     number,
  actorId:     string,
  type:        string,
  opts: {
    fromLocationId?: number | null;
    toLocationId?:   number | null;
    fromLabel?:      string | null;
    toLabel?:        string | null;
    statusBefore?:   string | null;
    statusAfter?:    string | null;
    reference?:      string | null;
    notes?:          string | null;
  }
) {
  await prisma.assetMovement.create({
    data: {
      assetId,
      movementType:  type as any,
      fromLocationId: opts.fromLocationId ?? null,
      toLocationId:   opts.toLocationId   ?? null,
      fromLabel:      opts.fromLabel      ?? null,
      toLabel:        opts.toLabel        ?? null,
      statusBefore:   opts.statusBefore   ?? null,
      statusAfter:    opts.statusAfter    ?? null,
      performedById:  actorId,
      reference:      opts.reference      ?? null,
      notes:          opts.notes          ?? null,
    },
  });
}

// ── POST /api/assets/:id/receive ──────────────────────────────────────────────

router.post(
  "/:id/receive",
  requireAuth,
  requirePermission("assets.manage_lifecycle"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

    const data = validate(receiveAssetSchema, req.body, res);
    if (!data) return;

    const loc = await prisma.inventoryLocation.findUnique({ where: { id: data.toLocationId } });
    if (!loc) { res.status(400).json({ error: "Destination location not found" }); return; }

    const asset = await prisma.asset.findUnique({
      where:  { id },
      select: { id: true, status: true, inventoryLocationId: true },
    });
    if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }

    const statusBefore = asset.status;
    let statusAfter = statusBefore;

    if (asset.status !== "in_stock") {
      try {
        await transitionAsset(id, "in_stock", req.user.id, "Received into stockroom");
        statusAfter = "in_stock";
      } catch (err) {
        if (err instanceof LifecycleTransitionError) {
          res.status(422).json({ error: err.message }); return;
        }
        throw err;
      }
    }

    await prisma.asset.update({ where: { id }, data: { inventoryLocationId: data.toLocationId } });
    await recordMovement(id, req.user.id, "received", {
      fromLocationId: null, fromLabel: data.fromLabel,
      toLocationId: data.toLocationId, toLabel: loc.name,
      statusBefore, statusAfter, reference: data.reference, notes: data.notes,
    });
    await logAssetEvent(id, req.user.id, "asset.received", {
      toLocation: loc.name, reference: data.reference ?? null,
    });

    res.json(normaliseDetail(await prisma.asset.findUniqueOrThrow({ where: { id }, select: ASSET_DETAIL_SELECT })));
  }
);

// ── POST /api/assets/:id/transfer ─────────────────────────────────────────────

router.post(
  "/:id/transfer",
  requireAuth,
  requirePermission("assets.manage_lifecycle"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

    const data = validate(transferAssetSchema, req.body, res);
    if (!data) return;

    const [asset, toLoc] = await Promise.all([
      prisma.asset.findUnique({ where: { id }, select: { id: true, status: true, inventoryLocationId: true } }),
      prisma.inventoryLocation.findUnique({ where: { id: data.toLocationId } }),
    ]);
    if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
    if (!toLoc) { res.status(400).json({ error: "Destination location not found" }); return; }

    const fromLoc = asset.inventoryLocationId
      ? await prisma.inventoryLocation.findUnique({ where: { id: asset.inventoryLocationId }, select: { id: true, name: true } })
      : null;

    await prisma.asset.update({ where: { id }, data: { inventoryLocationId: data.toLocationId } });
    await recordMovement(id, req.user.id, "transferred", {
      fromLocationId: asset.inventoryLocationId, fromLabel: fromLoc?.name ?? null,
      toLocationId:   data.toLocationId,          toLabel:   toLoc.name,
      statusBefore: asset.status, statusAfter: asset.status, notes: data.notes,
    });
    await logAssetEvent(id, req.user.id, "asset.transferred", {
      from: fromLoc?.name ?? "unknown", to: toLoc.name,
    });

    res.json(normaliseDetail(await prisma.asset.findUniqueOrThrow({ where: { id }, select: ASSET_DETAIL_SELECT })));
  }
);

// ── POST /api/assets/:id/issue ────────────────────────────────────────────────

router.post(
  "/:id/issue",
  requireAuth,
  requirePermission("assets.manage_lifecycle"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

    const data = validate(issueAssetSchema, req.body, res);
    if (!data) return;

    const [asset, user] = await Promise.all([
      prisma.asset.findUnique({ where: { id }, select: { id: true, status: true, inventoryLocationId: true, assignedToId: true } }),
      prisma.user.findFirst({ where: { id: data.userId, deletedAt: null }, select: { id: true, name: true } }),
    ]);
    if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
    if (!user)  { res.status(400).json({ error: "User not found" }); return; }

    const statusBefore = asset.status;
    const newStatus    = data.newStatus as AssetStatus;

    try {
      await transitionAsset(id, newStatus, req.user.id, `Issued to ${user.name}`);
    } catch (err) {
      if (err instanceof LifecycleTransitionError) {
        res.status(422).json({ error: err.message }); return;
      }
      throw err;
    }

    const now = new Date();
    await prisma.$transaction([
      ...(asset.assignedToId ? [
        prisma.assetAssignment.updateMany({ where: { assetId: id, unassignedAt: null }, data: { unassignedAt: now } }),
      ] : []),
      prisma.assetAssignment.create({
        data: { assetId: id, userId: data.userId, note: data.notes ?? null, assignedById: req.user.id },
      }),
      prisma.asset.update({ where: { id }, data: { assignedToId: data.userId, assignedAt: now, inventoryLocationId: null } }),
    ]);

    const fromLoc = asset.inventoryLocationId
      ? await prisma.inventoryLocation.findUnique({ where: { id: asset.inventoryLocationId }, select: { id: true, name: true } })
      : null;

    await recordMovement(id, req.user.id, "issued", {
      fromLocationId: asset.inventoryLocationId, fromLabel: fromLoc?.name ?? null,
      toLocationId: null, toLabel: user.name,
      statusBefore, statusAfter: newStatus, reference: data.reference, notes: data.notes,
    });
    await logAssetEvent(id, req.user.id, "asset.issued", { to: data.userId, name: user.name });

    res.json(normaliseDetail(await prisma.asset.findUniqueOrThrow({ where: { id }, select: ASSET_DETAIL_SELECT })));
  }
);

// ── POST /api/assets/:id/return ───────────────────────────────────────────────

router.post(
  "/:id/return",
  requireAuth,
  requirePermission("assets.manage_lifecycle"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

    const data = validate(returnAssetSchema, req.body, res);
    if (!data) return;

    const [asset, toLoc] = await Promise.all([
      prisma.asset.findUnique({ where: { id }, select: { id: true, status: true, assignedToId: true, inventoryLocationId: true } }),
      prisma.inventoryLocation.findUnique({ where: { id: data.toLocationId } }),
    ]);
    if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
    if (!toLoc) { res.status(400).json({ error: "Destination location not found" }); return; }

    const fromUser = asset.assignedToId
      ? await prisma.user.findUnique({ where: { id: asset.assignedToId }, select: { id: true, name: true } })
      : null;

    const statusBefore = asset.status;

    try {
      await transitionAsset(id, "in_stock", req.user.id, "Asset returned");
    } catch (err) {
      if (err instanceof LifecycleTransitionError) {
        res.status(422).json({ error: err.message }); return;
      }
      throw err;
    }

    const now = new Date();
    if (asset.assignedToId) {
      await prisma.assetAssignment.updateMany({ where: { assetId: id, unassignedAt: null }, data: { unassignedAt: now } });
    }
    await prisma.asset.update({ where: { id }, data: { assignedToId: null, assignedAt: null, inventoryLocationId: data.toLocationId } });

    await recordMovement(id, req.user.id, "returned", {
      fromLocationId: null, fromLabel: fromUser?.name ?? null,
      toLocationId:   data.toLocationId, toLabel: toLoc.name,
      statusBefore, statusAfter: "in_stock", notes: data.notes,
    });
    await logAssetEvent(id, req.user.id, "asset.returned", { from: fromUser?.name ?? null, toLocation: toLoc.name });

    res.json(normaliseDetail(await prisma.asset.findUniqueOrThrow({ where: { id }, select: ASSET_DETAIL_SELECT })));
  }
);

// ── POST /api/assets/:id/send-repair ─────────────────────────────────────────

router.post(
  "/:id/send-repair",
  requireAuth,
  requirePermission("assets.manage_lifecycle"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

    const data = validate(sendRepairSchema, req.body, res);
    if (!data) return;

    const asset = await prisma.asset.findUnique({
      where:  { id },
      select: { id: true, status: true, inventoryLocationId: true },
    });
    if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }

    const fromLoc = asset.inventoryLocationId
      ? await prisma.inventoryLocation.findUnique({ where: { id: asset.inventoryLocationId }, select: { id: true, name: true } })
      : null;

    const statusBefore = asset.status;

    try {
      await transitionAsset(id, "under_maintenance", req.user.id, "Sent for repair");
    } catch (err) {
      if (err instanceof LifecycleTransitionError) {
        res.status(422).json({ error: err.message }); return;
      }
      throw err;
    }

    await prisma.asset.update({ where: { id }, data: { inventoryLocationId: data.toLocationId ?? null } });

    const toLoc = data.toLocationId
      ? await prisma.inventoryLocation.findUnique({ where: { id: data.toLocationId }, select: { name: true } })
      : null;

    await recordMovement(id, req.user.id, "sent_to_repair", {
      fromLocationId: asset.inventoryLocationId, fromLabel: fromLoc?.name ?? null,
      toLocationId:   data.toLocationId ?? null, toLabel: toLoc?.name ?? data.toLabel,
      statusBefore, statusAfter: "under_maintenance", reference: data.reference, notes: data.notes,
    });
    await logAssetEvent(id, req.user.id, "asset.sent_to_repair", {
      to: toLoc?.name ?? data.toLabel ?? "external", reference: data.reference ?? null,
    });

    res.json(normaliseDetail(await prisma.asset.findUniqueOrThrow({ where: { id }, select: ASSET_DETAIL_SELECT })));
  }
);

// ── POST /api/assets/:id/complete-repair ─────────────────────────────────────

router.post(
  "/:id/complete-repair",
  requireAuth,
  requirePermission("assets.manage_lifecycle"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

    const data = validate(completeRepairSchema, req.body, res);
    if (!data) return;

    const [asset, toLoc] = await Promise.all([
      prisma.asset.findUnique({ where: { id }, select: { id: true, status: true, inventoryLocationId: true } }),
      prisma.inventoryLocation.findUnique({ where: { id: data.toLocationId } }),
    ]);
    if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
    if (!toLoc) { res.status(400).json({ error: "Destination location not found" }); return; }

    const statusBefore = asset.status;

    try {
      await transitionAsset(id, "in_stock", req.user.id, "Repair complete");
    } catch (err) {
      if (err instanceof LifecycleTransitionError) {
        res.status(422).json({ error: err.message }); return;
      }
      throw err;
    }

    await prisma.asset.update({ where: { id }, data: { inventoryLocationId: data.toLocationId } });

    await recordMovement(id, req.user.id, "repaired", {
      fromLocationId: asset.inventoryLocationId,
      toLocationId:   data.toLocationId, toLabel: toLoc.name,
      statusBefore, statusAfter: "in_stock", notes: data.notes,
    });
    await logAssetEvent(id, req.user.id, "asset.repair_complete", { toLocation: toLoc.name });

    res.json(normaliseDetail(await prisma.asset.findUniqueOrThrow({ where: { id }, select: ASSET_DETAIL_SELECT })));
  }
);

export default router;
