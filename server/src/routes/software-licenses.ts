import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import {
  createSoftwareLicenseSchema,
  updateSoftwareLicenseSchema,
  listSoftwareLicensesQuerySchema,
  assignLicenseSeatSchema,
} from "core/schemas/software.ts";
import prisma from "../db";
import type { Prisma, SoftwareLicenseType, SoftwareLicenseStatus, SoftwarePlatform } from "../generated/prisma/client";

const router = Router();
router.use(requireAuth);

// ── Date conversion helper ────────────────────────────────────────────────────

/** Convert a YYYY-MM-DD string to a Date, or return null/undefined passthrough. */
function toDate(v: string | null | undefined): Date | null | undefined {
  if (v === null)  return null;
  if (!v)          return undefined;
  return new Date(v);
}

// ── License number generation ─────────────────────────────────────────────────

async function generateLicenseNumber(): Promise<string> {
  const [row] = await prisma.$queryRaw<[{ last_value: number }]>`
    INSERT INTO ticket_counter (series, period_key, last_value)
    VALUES ('software_license', '', 1)
    ON CONFLICT (series, period_key)
    DO UPDATE SET last_value = ticket_counter.last_value + 1
    RETURNING last_value
  `;
  return `SWL-${String(row.last_value).padStart(5, "0")}`;
}

// ── Days until expiry helper ──────────────────────────────────────────────────

function daysUntil(date: Date | null): number | null {
  if (!date) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

// ── SELECT projections ────────────────────────────────────────────────────────

const LICENSE_SUMMARY_SELECT = {
  id: true, licenseNumber: true, productName: true, vendor: true,
  edition: true, version: true, platform: true, licenseType: true,
  customLicenseTypeId: true,
  customLicenseType: { select: { id: true, name: true, color: true } },
  status: true,
  totalSeats: true, expiryDate: true, renewalDate: true,
  annualCost: true, purchasePrice: true, currency: true, autoRenews: true,
  externalId: true, discoverySource: true,
  owner: { select: { id: true, name: true } },
  createdAt: true, updatedAt: true,
  _count: { select: { assignments: { where: { unassignedAt: null } } } },
} as const;

const LICENSE_DETAIL_SELECT = {
  ...LICENSE_SUMMARY_SELECT,
  licenseKey: true, licenseReference: true,
  purchaseDate: true, startDate: true, poNumber: true, invoiceNumber: true,
  vendorContact: true, vendorEmail: true,
  complianceNotes: true, notes: true, lastSyncAt: true,
  assignments: {
    where: { unassignedAt: null },
    orderBy: { assignedAt: "desc" as const },
    select: {
      id: true, assignedAt: true, unassignedAt: true, note: true,
      assignedToUser:  { select: { id: true, name: true, email: true } },
      assignedToAsset: { select: { id: true, assetNumber: true, name: true } },
      assignedBy:      { select: { id: true, name: true } },
    },
  },
} as const;

function normaliseSummary(
  raw: Prisma.SoftwareLicenseGetPayload<{ select: typeof LICENSE_SUMMARY_SELECT }>,
) {
  const { _count, ...rest } = raw;
  return {
    ...rest,
    consumedSeats:  _count.assignments,
    daysUntilExpiry: daysUntil(raw.expiryDate),
    purchasePrice: rest.purchasePrice?.toString() ?? null,
    annualCost:    rest.annualCost?.toString() ?? null,
  };
}

// ── GET /api/software-licenses/stats ─────────────────────────────────────────

router.get("/stats", requirePermission("software.view"), async (req, res) => {
  const now = new Date();
  const in30  = new Date(now.getTime() + 30  * 86_400_000);
  const in90  = new Date(now.getTime() + 90  * 86_400_000);

  const [total, active, expiring30, expiring90, expired] = await Promise.all([
    prisma.softwareLicense.count({ where: { deletedAt: null } }),
    prisma.softwareLicense.count({ where: { status: "active", deletedAt: null } }),
    prisma.softwareLicense.count({ where: { status: "active", expiryDate: { lte: in30, gte: now }, deletedAt: null } }),
    prisma.softwareLicense.count({ where: { status: "active", expiryDate: { lte: in90, gte: now }, deletedAt: null } }),
    prisma.softwareLicense.count({ where: { status: "expired", deletedAt: null } }),
  ]);

  res.json({ total, active, expiring30, expiring90, expired });
});

// ── GET /api/software-licenses ────────────────────────────────────────────────

router.get("/", requirePermission("software.view"), async (req, res) => {
  const query = validate(listSoftwareLicensesQuerySchema, req.query, res);
  if (!query) return;

  const { status, licenseType, platform, search, expiringDays, overAllocated, ownerId, page, pageSize } = query;
  const now = new Date();

  const where: Prisma.SoftwareLicenseWhereInput = { deletedAt: null };

  if (status)      where.status      = status as SoftwareLicenseStatus;
  if (licenseType) where.licenseType = licenseType as SoftwareLicenseType;
  if (platform)    where.platform    = platform as SoftwarePlatform;
  if (ownerId)     where.ownerId     = ownerId;

  if (search) {
    where.OR = [
      { productName: { contains: search, mode: "insensitive" } },
      { vendor:      { contains: search, mode: "insensitive" } },
      { licenseNumber: { contains: search, mode: "insensitive" } },
      { licenseReference: { contains: search, mode: "insensitive" } },
    ];
  }

  if (expiringDays) {
    const deadline = new Date(now.getTime() + expiringDays * 86_400_000);
    where.expiryDate = { lte: deadline, gte: now };
    where.status     = "active";
  }

  const skip = (page - 1) * pageSize;
  const [licenses, total] = await Promise.all([
    prisma.softwareLicense.findMany({
      where,
      select: LICENSE_SUMMARY_SELECT,
      orderBy: [{ status: "asc" }, { productName: "asc" }],
      skip,
      take: pageSize,
    }),
    prisma.softwareLicense.count({ where }),
  ]);

  let items = licenses.map(normaliseSummary);

  if (overAllocated) {
    items = items.filter(l => l.totalSeats !== null && l.consumedSeats > l.totalSeats);
  }

  res.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
});

// ── POST /api/software-licenses ───────────────────────────────────────────────

router.post("/", requirePermission("software.create"), async (req, res) => {
  const data = validate(createSoftwareLicenseSchema, req.body, res);
  if (!data) return;

  const licenseNumber = await generateLicenseNumber();
  const license = await prisma.softwareLicense.create({
    data: {
      licenseNumber,
      productName:      data.productName,
      vendor:           data.vendor           ?? null,
      edition:          data.edition          ?? null,
      version:          data.version          ?? null,
      platform:         data.platform,
      licenseType:      data.licenseType,
      ...(data.customLicenseTypeId != null && { customLicenseTypeId: data.customLicenseTypeId }),
      status:           data.status,
      licenseKey:       data.licenseKey       ?? null,
      licenseReference: data.licenseReference ?? null,
      totalSeats:       data.totalSeats       ?? null,
      purchasePrice:    data.purchasePrice    ?? null,
      annualCost:       data.annualCost       ?? null,
      currency:         data.currency,
      poNumber:         data.poNumber         ?? null,
      invoiceNumber:    data.invoiceNumber    ?? null,
      purchaseDate:     toDate(data.purchaseDate),
      startDate:        toDate(data.startDate),
      expiryDate:       toDate(data.expiryDate),
      renewalDate:      toDate(data.renewalDate),
      autoRenews:       data.autoRenews,
      vendorContact:    data.vendorContact    ?? null,
      vendorEmail:      data.vendorEmail      ?? null,
      complianceNotes:  data.complianceNotes  ?? null,
      notes:            data.notes            ?? null,
      externalId:       data.externalId       ?? null,
      discoverySource:  data.discoverySource  ?? null,
      ownerId:          data.ownerId          ?? null,
      teamId:           data.teamId           ?? null,
      createdById:      req.user.id,
    },
    select: LICENSE_SUMMARY_SELECT,
  });

  res.status(201).json(normaliseSummary(license));
});

// ── GET /api/software-licenses/:id ───────────────────────────────────────────

router.get("/:id", requirePermission("software.view"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const license = await prisma.softwareLicense.findFirst({
    where: { id, deletedAt: null },
    select: LICENSE_DETAIL_SELECT,
  });

  if (!license) return res.status(404).json({ error: "Software license not found" });

  const { _count, ...rest } = license;
  res.json({
    ...rest,
    consumedSeats:   _count.assignments,
    daysUntilExpiry: daysUntil(license.expiryDate),
    purchasePrice:   rest.purchasePrice?.toString() ?? null,
    annualCost:      rest.annualCost?.toString() ?? null,
  });
});

// ── PATCH /api/software-licenses/:id ─────────────────────────────────────────

router.patch("/:id", requirePermission("software.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const data = validate(updateSoftwareLicenseSchema, req.body, res);
  if (!data) return;

  const license = await prisma.softwareLicense.update({
    where: { id },
    data: {
      ...(data.productName      !== undefined && { productName:      data.productName }),
      ...(data.vendor           !== undefined && { vendor:           data.vendor }),
      ...(data.edition          !== undefined && { edition:          data.edition }),
      ...(data.version          !== undefined && { version:          data.version }),
      ...(data.platform         !== undefined && { platform:         data.platform }),
      ...(data.licenseType      !== undefined && { licenseType:      data.licenseType }),
      ...("customLicenseTypeId" in data && { customLicenseTypeId: data.customLicenseTypeId ?? null }),
      ...(data.status           !== undefined && { status:           data.status }),
      ...(data.licenseKey       !== undefined && { licenseKey:       data.licenseKey }),
      ...(data.licenseReference !== undefined && { licenseReference: data.licenseReference }),
      ...(data.totalSeats       !== undefined && { totalSeats:       data.totalSeats }),
      ...(data.purchasePrice    !== undefined && { purchasePrice:    data.purchasePrice }),
      ...(data.annualCost       !== undefined && { annualCost:       data.annualCost }),
      ...(data.currency         !== undefined && { currency:         data.currency }),
      ...(data.poNumber         !== undefined && { poNumber:         data.poNumber }),
      ...(data.invoiceNumber    !== undefined && { invoiceNumber:    data.invoiceNumber }),
      ...(data.purchaseDate     !== undefined && { purchaseDate:     toDate(data.purchaseDate) }),
      ...(data.startDate        !== undefined && { startDate:        toDate(data.startDate) }),
      ...(data.expiryDate       !== undefined && { expiryDate:       toDate(data.expiryDate) }),
      ...(data.renewalDate      !== undefined && { renewalDate:      toDate(data.renewalDate) }),
      ...(data.autoRenews       !== undefined && { autoRenews:       data.autoRenews }),
      ...(data.vendorContact    !== undefined && { vendorContact:    data.vendorContact }),
      ...(data.vendorEmail      !== undefined && { vendorEmail:      data.vendorEmail }),
      ...(data.complianceNotes  !== undefined && { complianceNotes:  data.complianceNotes }),
      ...(data.notes            !== undefined && { notes:            data.notes }),
      ...(data.externalId       !== undefined && { externalId:       data.externalId }),
      ...(data.discoverySource  !== undefined && { discoverySource:  data.discoverySource }),
      ...(data.ownerId          !== undefined && { ownerId:          data.ownerId }),
      ...(data.teamId           !== undefined && { teamId:           data.teamId }),
    },
    select: LICENSE_SUMMARY_SELECT,
  });

  res.json(normaliseSummary(license));
});

// ── DELETE /api/software-licenses/:id ────────────────────────────────────────

router.delete("/:id", requirePermission("software.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { count } = await prisma.softwareLicense.updateMany({
    where: { id, deletedAt: null },
    data:  { deletedAt: new Date(), deletedById: req.user.id, deletedByName: req.user.name },
  });
  if (count === 0) { res.status(404).json({ error: "Software license not found" }); return; }
  res.status(204).end();
});

// ── POST /api/software-licenses/bulk-delete ──────────────────────────────────

router.post("/bulk-delete", requirePermission("software.manage"), async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
  if (!ids || ids.length === 0 || !ids.every((n: unknown) => Number.isInteger(n) && (n as number) > 0)) {
    res.status(400).json({ error: "ids must be a non-empty array of positive integers" });
    return;
  }
  const result = await prisma.softwareLicense.updateMany({
    where: { id: { in: ids }, deletedAt: null },
    data:  { deletedAt: new Date(), deletedById: req.user.id, deletedByName: req.user.name },
  });
  res.json({ deleted: result.count });
});

// ── GET /api/software-licenses/:id/assignments ────────────────────────────────

router.get("/:id/assignments", requirePermission("software.view"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const showAll = req.query.showAll === "true";

  const assignments = await prisma.licenseAssignment.findMany({
    where: { licenseId: id, ...(showAll ? {} : { unassignedAt: null }) },
    orderBy: { assignedAt: "desc" },
    select: {
      id: true, assignedAt: true, unassignedAt: true, note: true,
      assignedToUser:  { select: { id: true, name: true, email: true } },
      assignedToAsset: { select: { id: true, assetNumber: true, name: true } },
      assignedBy:      { select: { id: true, name: true } },
    },
  });

  res.json(assignments);
});

// ── POST /api/software-licenses/:id/assignments ───────────────────────────────

router.post("/:id/assignments", requirePermission("software.create"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const data = validate(assignLicenseSeatSchema, req.body, res);
  if (!data) return;

  const license = await prisma.softwareLicense.findUnique({
    where: { id },
    select: { totalSeats: true, _count: { select: { assignments: { where: { unassignedAt: null } } } } },
  });

  if (!license) return res.status(404).json({ error: "Software license not found" });

  if (license.totalSeats !== null && license._count.assignments >= license.totalSeats) {
    return res.status(422).json({ error: "All seats are allocated. Revoke an existing seat first." });
  }

  if (data.assignedToUserId) {
    const existing = await prisma.licenseAssignment.findFirst({
      where: { licenseId: id, assignedToUserId: data.assignedToUserId, unassignedAt: null },
    });
    if (existing) return res.status(422).json({ error: "User already has an active seat on this license." });
  }

  const assignment = await prisma.licenseAssignment.create({
    data: {
      licenseId:         id,
      assignedToUserId:  data.assignedToUserId ?? undefined,
      assignedToAssetId: data.assignedToAssetId ?? undefined,
      note:              data.note ?? undefined,
      assignedById:      req.user.id,
    },
    select: {
      id: true, assignedAt: true, unassignedAt: true, note: true,
      assignedToUser:  { select: { id: true, name: true, email: true } },
      assignedToAsset: { select: { id: true, assetNumber: true, name: true } },
      assignedBy:      { select: { id: true, name: true } },
    },
  });

  res.status(201).json(assignment);
});

// ── DELETE /api/software-licenses/:id/assignments/:assignmentId ───────────────

router.delete("/:id/assignments/:assignmentId", requirePermission("software.create"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }
  const assignmentId = parseId(req.params.assignmentId);
  if (!assignmentId) { res.status(400).json({ error: "Invalid assignment ID" }); return; }

  const existing = await prisma.licenseAssignment.findFirst({
    where: { id: assignmentId, licenseId: id, unassignedAt: null },
  });

  if (!existing) return res.status(404).json({ error: "Active assignment not found" });

  await prisma.licenseAssignment.update({
    where: { id: assignmentId },
    data:  { unassignedAt: new Date() },
  });

  res.status(204).end();
});

export default router;
