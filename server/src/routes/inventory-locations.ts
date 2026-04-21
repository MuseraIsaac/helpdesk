import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import {
  createLocationSchema,
  updateLocationSchema,
} from "core/schemas/inventory.ts";
import prisma from "../db";
import type { InventoryLocationType } from "../generated/prisma/client";

const router = Router();
router.use(requireAuth);

// ── GET /api/inventory-locations ─────────────────────────────────────────────

router.get("/", requirePermission("assets.view"), async (req, res) => {
  const showInactive = req.query.showInactive === "true";

  const locations = await prisma.inventoryLocation.findMany({
    where:   showInactive ? {} : { isActive: true },
    orderBy: { name: "asc" },
  });

  // Attach asset counts per location in a single query
  const counts = await prisma.$queryRaw<
    Array<{ inventory_location_id: number; status: string; n: bigint }>
  >`
    SELECT inventory_location_id, status, COUNT(*) AS n
    FROM asset
    WHERE inventory_location_id IS NOT NULL
    GROUP BY inventory_location_id, status
  `;

  const countMap = new Map<number, Record<string, number>>();
  for (const row of counts) {
    const id = Number(row.inventory_location_id);
    if (!countMap.has(id)) countMap.set(id, {});
    countMap.get(id)![row.status] = Number(row.n);
  }

  const result = locations.map(loc => {
    const byStatus = countMap.get(loc.id) ?? {};
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    return {
      ...loc,
      _counts: {
        total,
        in_stock:          byStatus["in_stock"]          ?? 0,
        active:            (byStatus["deployed"] ?? 0) + (byStatus["in_use"] ?? 0),
        under_maintenance: (byStatus["under_maintenance"] ?? 0) + (byStatus["in_repair"] ?? 0),
      },
    };
  });

  res.json({ locations: result });
});

// ── POST /api/inventory-locations ─────────────────────────────────────────────

router.post("/", requirePermission("assets.manage_inventory"), async (req, res) => {
  const data = validate(createLocationSchema, req.body, res);
  if (!data) return;

  if (data.code) {
    const conflict = await prisma.inventoryLocation.findUnique({ where: { code: data.code } });
    if (conflict) { res.status(409).json({ error: "A location with this code already exists" }); return; }
  }

  const location = await prisma.inventoryLocation.create({
    data: {
      name:        data.name,
      code:        data.code ?? null,
      locationType: data.locationType as InventoryLocationType,
      description: data.description ?? null,
      site:        data.site     ?? null,
      building:    data.building ?? null,
      room:        data.room     ?? null,
    },
  });

  res.status(201).json({ location });
});

// ── PUT /api/inventory-locations/:id ──────────────────────────────────────────

router.put("/:id", requirePermission("assets.manage_inventory"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const data = validate(updateLocationSchema, req.body, res);
  if (!data) return;

  const existing = await prisma.inventoryLocation.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Location not found" }); return; }

  if (data.code && data.code !== existing.code) {
    const conflict = await prisma.inventoryLocation.findFirst({ where: { code: data.code, NOT: { id } } });
    if (conflict) { res.status(409).json({ error: "A location with this code already exists" }); return; }
  }

  const location = await prisma.inventoryLocation.update({
    where: { id },
    data: {
      ...(data.name        !== undefined && { name: data.name }),
      ...(data.code        !== undefined && { code: data.code }),
      ...(data.locationType !== undefined && { locationType: data.locationType as InventoryLocationType }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.site        !== undefined && { site: data.site }),
      ...(data.building    !== undefined && { building: data.building }),
      ...(data.room        !== undefined && { room: data.room }),
      ...(data.isActive    !== undefined && { isActive: data.isActive }),
    },
  });

  res.json({ location });
});

// ── DELETE /api/inventory-locations/:id (soft deactivate) ─────────────────────

router.delete("/:id", requirePermission("assets.manage_inventory"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const assetCount = await prisma.asset.count({ where: { inventoryLocationId: id } });
  if (assetCount > 0) {
    res.status(409).json({
      error: `Cannot deactivate — ${assetCount} asset(s) are currently at this location.`,
    });
    return;
  }

  await prisma.inventoryLocation.update({ where: { id }, data: { isActive: false } });
  res.json({ ok: true });
});

export default router;
