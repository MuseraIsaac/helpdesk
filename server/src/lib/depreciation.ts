/**
 * Pure depreciation calculation — no database access.
 *
 * Supports:
 *   straight_line     — equal annual charges over the useful life
 *   declining_balance — double-declining balance (2× the SL rate per year)
 *
 * All monetary values are in the asset's native currency (passed as plain numbers).
 * Callers cast from Prisma Decimal before passing.
 */

export interface DepreciationResult {
  method:                  string;
  acquisitionCost:         number;
  salvageValue:            number;
  usefulLifeYears:         number;
  ageYears:                number;
  annualCharge:            number;
  accumulatedDepreciation: number;
  bookValue:               number;
  depreciationPct:         number;  // 0–100, proportion of depreciable amount gone
  fullyDepreciatedAt:      string;  // ISO-8601 date (purchaseDate + usefulLifeYears)
  isFullyDepreciated:      boolean;
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeDepreciation(
  method:          string | null | undefined,
  purchaseDate:    Date   | null,
  acquisitionCost: number | null,
  salvageInput:    number | null,
  usefulLifeYears: number | null,
): DepreciationResult | null {
  if (!method || method === "none") return null;
  if (!purchaseDate || !acquisitionCost || !usefulLifeYears) return null;
  if (acquisitionCost <= 0 || usefulLifeYears <= 0) return null;

  const salvage = Math.max(0, salvageInput ?? 0);

  // Clamp acquisition cost to be >= salvage
  const cost = Math.max(acquisitionCost, salvage);
  const depreciable = cost - salvage;

  const now = new Date();
  const ageYears = Math.max(0, (now.getTime() - purchaseDate.getTime()) / MS_PER_YEAR);

  const fullyDepreciatedAt = new Date(
    purchaseDate.getTime() + usefulLifeYears * MS_PER_YEAR
  ).toISOString().split("T")[0];

  let annualCharge: number;
  let bookValue: number;

  if (method === "straight_line") {
    annualCharge = depreciable > 0 ? depreciable / usefulLifeYears : 0;
    bookValue = Math.max(salvage, cost - annualCharge * ageYears);
  } else {
    // Double-declining balance
    const rate = Math.min(1, 2 / usefulLifeYears);
    // First-year charge for display purposes
    annualCharge = round2(cost * rate);
    bookValue = Math.max(salvage, cost * Math.pow(1 - rate, ageYears));
  }

  const accum = cost - bookValue;
  const pct   = depreciable > 0 ? Math.min(100, (accum / depreciable) * 100) : 0;

  return {
    method,
    acquisitionCost:         round2(cost),
    salvageValue:            round2(salvage),
    usefulLifeYears,
    ageYears:                Math.round(ageYears * 10) / 10,
    annualCharge:            round2(annualCharge),
    accumulatedDepreciation: round2(accum),
    bookValue:               round2(bookValue),
    depreciationPct:         Math.round(pct * 10) / 10,
    fullyDepreciatedAt: fullyDepreciatedAt as string,
    isFullyDepreciated:      bookValue <= salvage + 0.005,
  };
}
