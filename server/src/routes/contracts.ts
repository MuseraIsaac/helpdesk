import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import {
  createContractSchema,
  updateContractSchema,
  listContractsQuerySchema,
} from "core/schemas/contracts.ts";
import prisma from "../db";
import type { ContractType, ContractStatus, Prisma } from "../generated/prisma/client";

const router = Router();
router.use(requireAuth);

// ── Contract number generation ────────────────────────────────────────────────

async function generateContractNumber(): Promise<string> {
  const [row] = await prisma.$queryRaw<[{ last_value: number }]>`
    INSERT INTO ticket_counter (series, period_key, last_value)
    VALUES ('contract', '', 1)
    ON CONFLICT (series, period_key)
    DO UPDATE SET last_value = ticket_counter.last_value + 1
    RETURNING last_value
  `;
  return `CON-${String(row.last_value).padStart(5, "0")}`;
}

// ── Days until expiry helper ──────────────────────────────────────────────────

function daysUntilExpiry(endDate: Date | null): number | null {
  if (!endDate) return null;
  return Math.ceil((endDate.getTime() - Date.now()) / 86_400_000);
}

// ── SELECT projection ─────────────────────────────────────────────────────────

const CONTRACT_SUMMARY_SELECT = {
  id: true, contractNumber: true, title: true, type: true, status: true,
  vendor: true, startDate: true, endDate: true, renewalDate: true, autoRenews: true,
  value: true, currency: true,
  supportLevel: true, slaResponseHours: true,
  isActive: true, createdAt: true,
  _count: { select: { assetLinks: true } },
} as const;

const CONTRACT_DETAIL_SELECT = {
  ...CONTRACT_SUMMARY_SELECT,
  vendorContact: true, vendorEmail: true, vendorPhone: true,
  description: true, notes: true, updatedAt: true,
  assetLinks: {
    select: {
      linkedAt: true,
      asset: {
        select: {
          id: true, assetNumber: true, name: true, type: true, status: true,
        },
      },
    },
  },
} as const;

function normaliseSummary(raw: Prisma.ContractGetPayload<{ select: typeof CONTRACT_SUMMARY_SELECT }>) {
  const { _count, ...rest } = raw;
  return {
    ...rest,
    daysUntilExpiry: daysUntilExpiry(raw.endDate),
    _counts: { assets: _count.assetLinks },
  };
}

function normaliseDetail(raw: Prisma.ContractGetPayload<{ select: typeof CONTRACT_DETAIL_SELECT }>) {
  const { _count, assetLinks, ...rest } = raw;
  return {
    ...rest,
    daysUntilExpiry: daysUntilExpiry(raw.endDate),
    _counts: { assets: _count.assetLinks },
    assets: assetLinks.map(l => ({
      ...l.asset,
      linkedAt: l.linkedAt,
    })),
  };
}

// ── GET /api/contracts ────────────────────────────────────────────────────────

router.get("/", requirePermission("assets.view"), async (req, res) => {
  const q = validate(listContractsQuerySchema, req.query, res);
  if (!q) return;

  const where: Prisma.ContractWhereInput = { isActive: true };
  if (q.status) where.status = q.status as ContractStatus;
  if (q.type)   where.type   = q.type   as ContractType;
  if (q.vendor) where.vendor = { contains: q.vendor, mode: "insensitive" };

  if (q.expiringDays) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + q.expiringDays);
    where.endDate = { lte: threshold, gte: new Date() };
  }

  if (q.search) {
    where.OR = [
      { title:          { contains: q.search, mode: "insensitive" } },
      { contractNumber: { contains: q.search, mode: "insensitive" } },
      { vendor:         { contains: q.search, mode: "insensitive" } },
    ];
  }

  const [total, items] = await prisma.$transaction([
    prisma.contract.count({ where }),
    prisma.contract.findMany({
      where,
      orderBy: [{ endDate: "asc" }, { title: "asc" }],
      skip:    (q.page - 1) * q.pageSize,
      take:    q.pageSize,
      select:  CONTRACT_SUMMARY_SELECT,
    }),
  ]);

  res.json({
    items:  items.map(normaliseSummary),
    meta:   { total, page: q.page, pageSize: q.pageSize, pages: Math.ceil(total / q.pageSize) },
  });
});

// ── POST /api/contracts ───────────────────────────────────────────────────────

router.post("/", requirePermission("assets.manage_inventory"), async (req, res) => {
  const data = validate(createContractSchema, req.body, res);
  if (!data) return;

  const contractNumber = await generateContractNumber();

  const contract = await prisma.contract.create({
    data: {
      contractNumber,
      title:            data.title,
      type:             data.type             as ContractType,
      status:           data.status           as ContractStatus,
      vendor:           data.vendor           ?? null,
      vendorContact:    data.vendorContact    ?? null,
      vendorEmail:      data.vendorEmail      ?? null,
      vendorPhone:      data.vendorPhone      ?? null,
      startDate:        data.startDate        ? new Date(data.startDate)   : null,
      endDate:          data.endDate          ? new Date(data.endDate)     : null,
      renewalDate:      data.renewalDate      ? new Date(data.renewalDate) : null,
      autoRenews:       data.autoRenews,
      value:            data.value            ?? null,
      currency:         data.currency,
      supportLevel:     data.supportLevel     ?? null,
      slaResponseHours: data.slaResponseHours ?? null,
      description:      data.description      ?? null,
      notes:            data.notes            ?? null,
      createdById:      req.user.id,
    },
    select: CONTRACT_DETAIL_SELECT,
  });

  res.status(201).json({ contract: normaliseDetail(contract) });
});

// ── GET /api/contracts/:id ────────────────────────────────────────────────────

router.get("/:id", requirePermission("assets.view"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const contract = await prisma.contract.findUnique({ where: { id }, select: CONTRACT_DETAIL_SELECT });
  if (!contract) { res.status(404).json({ error: "Contract not found" }); return; }

  res.json({ contract: normaliseDetail(contract) });
});

// ── PUT /api/contracts/:id ────────────────────────────────────────────────────

router.put("/:id", requirePermission("assets.manage_inventory"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const data = validate(updateContractSchema, req.body, res);
  if (!data) return;

  const existing = await prisma.contract.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Contract not found" }); return; }

  const contract = await prisma.contract.update({
    where: { id },
    data: {
      ...(data.title            !== undefined && { title:            data.title }),
      ...(data.type             !== undefined && { type:             data.type as ContractType }),
      ...(data.status           !== undefined && { status:           data.status as ContractStatus }),
      ...(data.vendor           !== undefined && { vendor:           data.vendor }),
      ...(data.vendorContact    !== undefined && { vendorContact:    data.vendorContact }),
      ...(data.vendorEmail      !== undefined && { vendorEmail:      data.vendorEmail }),
      ...(data.vendorPhone      !== undefined && { vendorPhone:      data.vendorPhone }),
      ...(data.startDate        !== undefined && { startDate:        data.startDate ? new Date(data.startDate) : null }),
      ...(data.endDate          !== undefined && { endDate:          data.endDate   ? new Date(data.endDate)   : null }),
      ...(data.renewalDate      !== undefined && { renewalDate:      data.renewalDate ? new Date(data.renewalDate) : null }),
      ...(data.autoRenews       !== undefined && { autoRenews:       data.autoRenews }),
      ...(data.value            !== undefined && { value:            data.value }),
      ...(data.currency         !== undefined && { currency:         data.currency }),
      ...(data.supportLevel     !== undefined && { supportLevel:     data.supportLevel }),
      ...(data.slaResponseHours !== undefined && { slaResponseHours: data.slaResponseHours }),
      ...(data.description      !== undefined && { description:      data.description }),
      ...(data.notes            !== undefined && { notes:            data.notes }),
      ...(data.isActive         !== undefined && { isActive:         data.isActive }),
    },
    select: CONTRACT_DETAIL_SELECT,
  });

  res.json({ contract: normaliseDetail(contract) });
});

// ── DELETE /api/contracts/:id (soft deactivate) ───────────────────────────────

router.delete("/:id", requirePermission("assets.manage_inventory"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  await prisma.contract.update({ where: { id }, data: { isActive: false } });
  res.json({ ok: true });
});

// ── POST /api/contracts/:id/link-asset ────────────────────────────────────────

router.post("/:id/link-asset", requirePermission("assets.update"), async (req, res) => {
  const contractId = parseId(req.params.id);
  const assetId    = parseId(req.body?.assetId);
  if (!contractId || !assetId) { res.status(400).json({ error: "Invalid IDs" }); return; }

  const [contract, asset] = await Promise.all([
    prisma.contract.findUnique({ where: { id: contractId } }),
    prisma.asset.findUnique({ where: { id: assetId } }),
  ]);
  if (!contract) { res.status(404).json({ error: "Contract not found" }); return; }
  if (!asset)    { res.status(404).json({ error: "Asset not found" }); return; }

  await prisma.assetContractLink.upsert({
    where:  { assetId_contractId: { assetId, contractId } },
    create: { assetId, contractId },
    update: {},
  });

  res.json({ ok: true });
});

// ── DELETE /api/contracts/:id/link-asset/:assetId ─────────────────────────────

router.delete("/:id/link-asset/:assetId", requirePermission("assets.update"), async (req, res) => {
  const contractId = parseId(req.params.id);
  const assetId    = parseId(req.params.assetId);
  if (!contractId || !assetId) { res.status(400).json({ error: "Invalid IDs" }); return; }

  await prisma.assetContractLink.deleteMany({ where: { assetId, contractId } });
  res.status(204).end();
});

export default router;
