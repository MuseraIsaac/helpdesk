import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import {
  createSaaSSubscriptionSchema,
  updateSaaSSubscriptionSchema,
  listSaaSSubscriptionsQuerySchema,
  assignSaaSUserSchema,
} from "core/schemas/software.ts";
import prisma from "../db";
import type { Prisma, SaaSSubscriptionStatus, SaaSCategory, SaaSBillingCycle } from "../generated/prisma/client";

const router = Router();
router.use(requireAuth);

// ── Date conversion helper ────────────────────────────────────────────────────

function toDate(v: string | null | undefined): Date | null | undefined {
  if (v === null) return null;
  if (!v)         return undefined;
  return new Date(v);
}

// ── Subscription number generation ───────────────────────────────────────────

async function generateSubscriptionNumber(): Promise<string> {
  const [row] = await prisma.$queryRaw<[{ last_value: number }]>`
    INSERT INTO ticket_counter (series, period_key, last_value)
    VALUES ('saas_subscription', '', 1)
    ON CONFLICT (series, period_key)
    DO UPDATE SET last_value = ticket_counter.last_value + 1
    RETURNING last_value
  `;
  return `SAAS-${String(row.last_value).padStart(5, "0")}`;
}

// ── Days until date helper ────────────────────────────────────────────────────

function daysUntil(date: Date | null): number | null {
  if (!date) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

// ── SELECT projections ────────────────────────────────────────────────────────

const SAAS_SUMMARY_SELECT = {
  id: true, subscriptionNumber: true, appName: true, vendor: true,
  category: true, customCategoryId: true,
  customCategory: { select: { id: true, name: true, color: true } },
  status: true, plan: true, billingCycle: true, url: true,
  totalSeats: true, monthlyAmount: true, annualAmount: true, currency: true,
  renewalDate: true, autoRenews: true,
  externalId: true, discoverySource: true,
  owner: { select: { id: true, name: true } },
  createdAt: true, updatedAt: true,
  _count: { select: { userAssignments: { where: { unassignedAt: null } } } },
} as const;

const SAAS_DETAIL_SELECT = {
  ...SAAS_SUMMARY_SELECT,
  adminEmail: true, startDate: true, trialEndDate: true,
  cancellationDate: true, spendCategory: true,
  complianceNotes: true, notes: true, lastSyncAt: true,
  userAssignments: {
    where: { unassignedAt: null },
    orderBy: { assignedAt: "desc" as const },
    select: {
      id: true, role: true, assignedAt: true, lastActiveAt: true,
      unassignedAt: true, note: true,
      user:       { select: { id: true, name: true, email: true } },
      assignedBy: { select: { id: true, name: true } },
    },
  },
} as const;

function normaliseSummary(
  raw: Prisma.SaaSSubscriptionGetPayload<{ select: typeof SAAS_SUMMARY_SELECT }>,
) {
  const { _count, ...rest } = raw;
  return {
    ...rest,
    consumedSeats:    _count.userAssignments,
    daysUntilRenewal: daysUntil(raw.renewalDate),
    monthlyAmount:    rest.monthlyAmount?.toString() ?? null,
    annualAmount:     rest.annualAmount?.toString()  ?? null,
  };
}

// ── GET /api/saas-subscriptions/stats ────────────────────────────────────────

router.get("/stats", requirePermission("software.view"), async (req, res) => {
  const now   = new Date();
  const in30  = new Date(now.getTime() + 30 * 86_400_000);

  const [total, active, expiring30, cancelled] = await Promise.all([
    prisma.saaSSubscription.count({ where: { deletedAt: null } }),
    prisma.saaSSubscription.count({ where: { status: "active", deletedAt: null } }),
    prisma.saaSSubscription.count({ where: { status: "active", renewalDate: { lte: in30, gte: now }, deletedAt: null } }),
    prisma.saaSSubscription.count({ where: { status: "cancelled", deletedAt: null } }),
  ]);

  // Aggregate monthly spend across active subscriptions
  const spendResult = await prisma.saaSSubscription.aggregate({
    where: { status: "active", deletedAt: null },
    _sum: { monthlyAmount: true, annualAmount: true },
  });

  res.json({
    total,
    active,
    expiring30,
    cancelled,
    totalMonthlySpend: spendResult._sum.monthlyAmount?.toString() ?? "0",
    totalAnnualSpend:  spendResult._sum.annualAmount?.toString()  ?? "0",
  });
});

// ── GET /api/saas-subscriptions ───────────────────────────────────────────────

router.get("/", requirePermission("software.view"), async (req, res) => {
  const query = validate(listSaaSSubscriptionsQuerySchema, req.query, res);
  if (!query) return;

  const { status, category, billingCycle, search, renewingDays, overAllocated, ownerId, page, pageSize } = query;
  const now = new Date();

  const where: Prisma.SaaSSubscriptionWhereInput = { deletedAt: null };

  if (status)       where.status       = status       as SaaSSubscriptionStatus;
  if (category)     where.category     = category     as SaaSCategory;
  if (billingCycle) where.billingCycle = billingCycle as SaaSBillingCycle;
  if (ownerId)      where.ownerId      = ownerId;

  if (search) {
    where.OR = [
      { appName:            { contains: search, mode: "insensitive" } },
      { vendor:             { contains: search, mode: "insensitive" } },
      { subscriptionNumber: { contains: search, mode: "insensitive" } },
      { plan:               { contains: search, mode: "insensitive" } },
    ];
  }

  if (renewingDays) {
    const deadline = new Date(now.getTime() + renewingDays * 86_400_000);
    where.renewalDate = { lte: deadline, gte: now };
    where.status      = "active";
  }

  const skip = (page - 1) * pageSize;
  const [subscriptions, total] = await Promise.all([
    prisma.saaSSubscription.findMany({
      where,
      select: SAAS_SUMMARY_SELECT,
      orderBy: [{ status: "asc" }, { appName: "asc" }],
      skip,
      take: pageSize,
    }),
    prisma.saaSSubscription.count({ where }),
  ]);

  let items = subscriptions.map(normaliseSummary);

  if (overAllocated) {
    items = items.filter(s => s.totalSeats !== null && s.consumedSeats > s.totalSeats);
  }

  res.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
});

// ── POST /api/saas-subscriptions ─────────────────────────────────────────────

router.post("/", requirePermission("software.create"), async (req, res) => {
  const data = validate(createSaaSSubscriptionSchema, req.body, res);
  if (!data) return;

  const subscriptionNumber = await generateSubscriptionNumber();
  const subscription = await prisma.saaSSubscription.create({
    data: {
      subscriptionNumber,
      appName:         data.appName,
      vendor:          data.vendor         ?? null,
      category:        data.category,
      ...(data.customCategoryId != null && { customCategoryId: data.customCategoryId }),
      status:          data.status,
      plan:            data.plan           ?? null,
      billingCycle:    data.billingCycle,
      url:             data.url            ?? null,
      adminEmail:      data.adminEmail     ?? null,
      totalSeats:      data.totalSeats     ?? null,
      monthlyAmount:   data.monthlyAmount  ?? null,
      annualAmount:    data.annualAmount   ?? null,
      currency:        data.currency,
      spendCategory:   data.spendCategory  ?? null,
      startDate:       toDate(data.startDate),
      trialEndDate:    toDate(data.trialEndDate),
      renewalDate:     toDate(data.renewalDate),
      cancellationDate: toDate(data.cancellationDate),
      autoRenews:      data.autoRenews,
      complianceNotes: data.complianceNotes ?? null,
      notes:           data.notes           ?? null,
      externalId:      data.externalId      ?? null,
      discoverySource: data.discoverySource ?? null,
      ownerId:         data.ownerId         ?? null,
      teamId:          data.teamId          ?? null,
      createdById:     req.user.id,
    },
    select: SAAS_SUMMARY_SELECT,
  });

  res.status(201).json(normaliseSummary(subscription));
});

// ── GET /api/saas-subscriptions/:id ──────────────────────────────────────────

router.get("/:id", requirePermission("software.view"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const sub = await prisma.saaSSubscription.findFirst({
    where: { id, deletedAt: null },
    select: SAAS_DETAIL_SELECT,
  });

  if (!sub) return res.status(404).json({ error: "SaaS subscription not found" });

  const { _count, ...rest } = sub;
  res.json({
    ...rest,
    consumedSeats:    _count.userAssignments,
    daysUntilRenewal: daysUntil(sub.renewalDate),
    monthlyAmount:    rest.monthlyAmount?.toString() ?? null,
    annualAmount:     rest.annualAmount?.toString()  ?? null,
  });
});

// ── PATCH /api/saas-subscriptions/:id ────────────────────────────────────────

router.patch("/:id", requirePermission("software.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const data = validate(updateSaaSSubscriptionSchema, req.body, res);
  if (!data) return;

  const sub = await prisma.saaSSubscription.update({
    where: { id },
    data: {
      ...(data.appName         !== undefined && { appName:         data.appName }),
      ...(data.vendor          !== undefined && { vendor:          data.vendor }),
      ...(data.category        !== undefined && { category:        data.category }),
      ...("customCategoryId" in data && { customCategoryId: data.customCategoryId ?? null }),
      ...(data.status          !== undefined && { status:          data.status }),
      ...(data.plan            !== undefined && { plan:            data.plan }),
      ...(data.billingCycle    !== undefined && { billingCycle:    data.billingCycle }),
      ...(data.url             !== undefined && { url:             data.url }),
      ...(data.adminEmail      !== undefined && { adminEmail:      data.adminEmail }),
      ...(data.totalSeats      !== undefined && { totalSeats:      data.totalSeats }),
      ...(data.monthlyAmount   !== undefined && { monthlyAmount:   data.monthlyAmount }),
      ...(data.annualAmount    !== undefined && { annualAmount:    data.annualAmount }),
      ...(data.currency        !== undefined && { currency:        data.currency }),
      ...(data.spendCategory   !== undefined && { spendCategory:   data.spendCategory }),
      ...(data.startDate       !== undefined && { startDate:       toDate(data.startDate) }),
      ...(data.trialEndDate    !== undefined && { trialEndDate:    toDate(data.trialEndDate) }),
      ...(data.renewalDate     !== undefined && { renewalDate:     toDate(data.renewalDate) }),
      ...(data.cancellationDate !== undefined && { cancellationDate: toDate(data.cancellationDate) }),
      ...(data.autoRenews      !== undefined && { autoRenews:      data.autoRenews }),
      ...(data.complianceNotes !== undefined && { complianceNotes: data.complianceNotes }),
      ...(data.notes           !== undefined && { notes:           data.notes }),
      ...(data.externalId      !== undefined && { externalId:      data.externalId }),
      ...(data.discoverySource !== undefined && { discoverySource: data.discoverySource }),
      ...(data.ownerId         !== undefined && { ownerId:         data.ownerId }),
      ...(data.teamId          !== undefined && { teamId:          data.teamId }),
    },
    select: SAAS_SUMMARY_SELECT,
  });

  res.json(normaliseSummary(sub));
});

// ── DELETE /api/saas-subscriptions/:id ───────────────────────────────────────

router.delete("/:id", requirePermission("software.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { count } = await prisma.saaSSubscription.updateMany({
    where: { id, deletedAt: null },
    data:  { deletedAt: new Date(), deletedById: req.user.id, deletedByName: req.user.name },
  });
  if (count === 0) { res.status(404).json({ error: "SaaS subscription not found" }); return; }
  res.status(204).end();
});

// ── POST /api/saas-subscriptions/bulk-delete ─────────────────────────────────

router.post("/bulk-delete", requirePermission("software.manage"), async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
  if (!ids || ids.length === 0 || !ids.every((n: unknown) => Number.isInteger(n) && (n as number) > 0)) {
    res.status(400).json({ error: "ids must be a non-empty array of positive integers" });
    return;
  }
  const result = await prisma.saaSSubscription.updateMany({
    where: { id: { in: ids }, deletedAt: null },
    data:  { deletedAt: new Date(), deletedById: req.user.id, deletedByName: req.user.name },
  });
  res.json({ deleted: result.count });
});

// ── GET /api/saas-subscriptions/:id/users ────────────────────────────────────

router.get("/:id/users", requirePermission("software.view"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const showAll = req.query.showAll === "true";

  const assignments = await prisma.saaSUserAssignment.findMany({
    where: { subscriptionId: id, ...(showAll ? {} : { unassignedAt: null }) },
    orderBy: { assignedAt: "desc" },
    select: {
      id: true, role: true, assignedAt: true, lastActiveAt: true,
      unassignedAt: true, note: true,
      user:       { select: { id: true, name: true, email: true } },
      assignedBy: { select: { id: true, name: true } },
    },
  });

  res.json(assignments);
});

// ── POST /api/saas-subscriptions/:id/users ───────────────────────────────────

router.post("/:id/users", requirePermission("software.create"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const data = validate(assignSaaSUserSchema, req.body, res);
  if (!data) return;

  const sub = await prisma.saaSSubscription.findUnique({
    where: { id },
    select: { totalSeats: true, _count: { select: { userAssignments: { where: { unassignedAt: null } } } } },
  });

  if (!sub) return res.status(404).json({ error: "SaaS subscription not found" });

  if (sub.totalSeats !== null && sub._count.userAssignments >= sub.totalSeats) {
    return res.status(422).json({ error: "Seat limit reached. Remove a user first or increase the seat count." });
  }

  const existing = await prisma.saaSUserAssignment.findFirst({
    where: { subscriptionId: id, userId: data.userId, unassignedAt: null },
  });
  if (existing) return res.status(422).json({ error: "User is already provisioned on this subscription." });

  const assignment = await prisma.saaSUserAssignment.create({
    data: {
      subscriptionId: id,
      userId:         data.userId,
      role:           data.role ?? undefined,
      note:           data.note ?? undefined,
      assignedById:   req.user.id,
    },
    select: {
      id: true, role: true, assignedAt: true, lastActiveAt: true,
      unassignedAt: true, note: true,
      user:       { select: { id: true, name: true, email: true } },
      assignedBy: { select: { id: true, name: true } },
    },
  });

  res.status(201).json(assignment);
});

// ── DELETE /api/saas-subscriptions/:id/users/:userId ─────────────────────────

router.delete("/:id/users/:assignmentId", requirePermission("software.create"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }
  const assignmentId = parseId(req.params.assignmentId);
  if (!assignmentId) { res.status(400).json({ error: "Invalid assignment ID" }); return; }

  const existing = await prisma.saaSUserAssignment.findFirst({
    where: { id: assignmentId, subscriptionId: id, unassignedAt: null },
  });

  if (!existing) return res.status(404).json({ error: "Active user assignment not found" });

  await prisma.saaSUserAssignment.update({
    where: { id: assignmentId },
    data:  { unassignedAt: new Date() },
  });

  res.status(204).end();
});

export default router;
