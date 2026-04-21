/**
 * Asset Financial Alerts — expiring warranties, expiring contracts,
 * assets nearing end of useful life, and fully-depreciated fleet items.
 *
 * Mounted at GET /api/assets/financial/alerts
 */

import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { computeDepreciation } from "../lib/depreciation";
import prisma from "../db";

const router = Router();
router.use(requireAuth, requirePermission("assets.view"));

// ── Shared asset mini-projection ──────────────────────────────────────────────

const MINI_SELECT = {
  id: true, assetNumber: true, name: true, type: true, status: true,
  purchasePrice: true, currency: true,
} as const;

// ── GET /api/assets/financial/alerts ─────────────────────────────────────────

router.get("/alerts", async (_req, res) => {
  const now    = new Date();
  const d30    = new Date(now); d30.setDate(d30.getDate() + 30);
  const d90    = new Date(now); d90.setDate(d90.getDate() + 90);
  const d365   = new Date(now); d365.setDate(d365.getDate() + 365);

  const [
    warrantyExpiring30,
    warrantyExpiring90,
    contractsExpiring30Raw,
    contractsExpiring90Raw,
    deprecCandidates,
    endOfLifeRaw,
  ] = await Promise.all([
    // Warranties expiring within 30 days (excluding already expired)
    prisma.asset.findMany({
      where: { warrantyExpiry: { gte: now, lte: d30 } },
      select: { ...MINI_SELECT, warrantyExpiry: true },
      orderBy: { warrantyExpiry: "asc" },
      take: 25,
    }),

    // Warranties expiring within 90 days
    prisma.asset.findMany({
      where: { warrantyExpiry: { gte: d30, lte: d90 } },
      select: { ...MINI_SELECT, warrantyExpiry: true },
      orderBy: { warrantyExpiry: "asc" },
      take: 25,
    }),

    // Active contracts expiring within 30 days
    prisma.contract.findMany({
      where: { isActive: true, status: { in: ["active", "pending_renewal"] }, endDate: { gte: now, lte: d30 } },
      select: { id: true, contractNumber: true, title: true, type: true, vendor: true, endDate: true, currency: true, value: true, _count: { select: { assetLinks: true } } },
      orderBy: { endDate: "asc" },
      take: 25,
    }),

    // Active contracts expiring within 90 days
    prisma.contract.findMany({
      where: { isActive: true, status: { in: ["active", "pending_renewal"] }, endDate: { gte: d30, lte: d90 } },
      select: { id: true, contractNumber: true, title: true, type: true, vendor: true, endDate: true, currency: true, value: true, _count: { select: { assetLinks: true } } },
      orderBy: { endDate: "asc" },
      take: 25,
    }),

    // Assets eligible for depreciation calculation (need all fields)
    prisma.asset.findMany({
      where: {
        depreciationMethod: { not: "none" },
        purchaseDate:       { not: null },
        purchasePrice:      { not: null },
        usefulLifeYears:    { not: null },
      },
      select: {
        ...MINI_SELECT,
        depreciationMethod: true, purchaseDate: true,
        purchasePrice: true, salvageValue: true, usefulLifeYears: true,
      },
      take: 500, // reasonable cap for in-memory computation
    }),

    // Assets with endOfLifeAt set and approaching (within 1 year)
    prisma.asset.findMany({
      where: {
        endOfLifeAt: { gte: now, lte: d365 },
        status: { notIn: ["retired", "disposed"] },
      },
      select: { ...MINI_SELECT, endOfLifeAt: true },
      orderBy: { endOfLifeAt: "asc" },
      take: 25,
    }),
  ]);

  // Compute depreciation for each candidate
  const depreciationResults = deprecCandidates.map(a => {
    const dep = computeDepreciation(
      a.depreciationMethod,
      a.purchaseDate,
      a.purchasePrice ? Number(a.purchasePrice) : null,
      a.salvageValue  ? Number(a.salvageValue)  : null,
      a.usefulLifeYears,
    );
    return { asset: a, dep };
  }).filter(r => r.dep !== null) as Array<{
    asset: typeof deprecCandidates[0];
    dep:   NonNullable<ReturnType<typeof computeDepreciation>>;
  }>;

  const fullyDepreciated = depreciationResults
    .filter(r => r.dep.isFullyDepreciated)
    .slice(0, 25)
    .map(r => ({
      ...r.asset,
      purchasePrice:      r.asset.purchasePrice ? Number(r.asset.purchasePrice) : null,
      bookValue:          r.dep.bookValue,
      depreciationPct:    r.dep.depreciationPct,
      fullyDepreciatedAt: r.dep.fullyDepreciatedAt,
    }));

  const nearingEndOfLife = depreciationResults
    .filter(r => !r.dep.isFullyDepreciated && r.dep.depreciationPct >= 75)
    .sort((a, b) => b.dep.depreciationPct - a.dep.depreciationPct)
    .slice(0, 25)
    .map(r => ({
      ...r.asset,
      purchasePrice:   r.asset.purchasePrice ? Number(r.asset.purchasePrice) : null,
      bookValue:       r.dep.bookValue,
      depreciationPct: r.dep.depreciationPct,
      fullyDepreciatedAt: r.dep.fullyDepreciatedAt,
    }));

  // Fleet-level depreciation totals
  const totalAcquisitionCost = depreciationResults.reduce((s, r) => s + r.dep.acquisitionCost, 0);
  const totalBookValue       = depreciationResults.reduce((s, r) => s + r.dep.bookValue, 0);
  const totalAccumulated     = depreciationResults.reduce((s, r) => s + r.dep.accumulatedDepreciation, 0);

  res.json({
    summary: {
      warrantyExpiring30:   warrantyExpiring30.length,
      warrantyExpiring90:   warrantyExpiring90.length,
      contractsExpiring30:  contractsExpiring30Raw.length,
      contractsExpiring90:  contractsExpiring90Raw.length,
      fullyDepreciated:     fullyDepreciated.length,
      nearingEndOfLife:     nearingEndOfLife.length,
      endOfLifeSoon:        endOfLifeRaw.length,
      fleet: {
        totalAcquisitionCost: Math.round(totalAcquisitionCost * 100) / 100,
        totalBookValue:       Math.round(totalBookValue       * 100) / 100,
        totalAccumulated:     Math.round(totalAccumulated     * 100) / 100,
        assetCount:           depreciationResults.length,
      },
    },
    warrantyExpiring30,
    warrantyExpiring90,
    contractsExpiring30: contractsExpiring30Raw.map(c => ({ ...c, _counts: { assets: c._count.assetLinks } })),
    contractsExpiring90: contractsExpiring90Raw.map(c => ({ ...c, _counts: { assets: c._count.assetLinks } })),
    fullyDepreciated,
    nearingEndOfLife,
    endOfLifeSoon: endOfLifeRaw,
  });
});

export default router;
