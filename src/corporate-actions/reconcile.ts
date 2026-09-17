import type { CorporateAction } from "../storage/types.js";

export interface ReconciliationResult {
  passes: boolean;
  warnings: string[];
  errors: string[];
}

export function reconcilePriceRange(currentPrice: number, week52Low: number, week52High: number): ReconciliationResult {
  const errors: string[] = [];
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) errors.push("current price must be positive");
  if (!Number.isFinite(week52Low) || week52Low < 0) errors.push("52-week low must be non-negative");
  if (!Number.isFinite(week52High) || week52High < week52Low) errors.push("52-week high must be >= 52-week low");
  if (errors.length === 0 && (currentPrice < week52Low || currentPrice > week52High)) errors.push("current price must be within the 52-week range");
  return { passes: errors.length === 0, warnings: [], errors };
}

export function reconcileSplitPrice(beforePrice: number, afterPrice: number, action: CorporateAction, tolerance = 0.02): ReconciliationResult {
  const numerator = Number(action.details.newShares ?? action.details.new_shares ?? action.details.ratioNumerator);
  const denominator = Number(action.details.oldShares ?? action.details.old_shares ?? action.details.ratioDenominator);
  const errors: string[] = [];
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || numerator <= 0 || denominator <= 0) errors.push("split ratio must contain positive newShares and oldShares");
  if (!Number.isFinite(beforePrice) || beforePrice <= 0 || !Number.isFinite(afterPrice) || afterPrice <= 0) errors.push("prices must be positive");
  if (errors.length === 0) {
    const expected = beforePrice * denominator / numerator;
    const difference = Math.abs(afterPrice - expected) / expected;
    if (difference > tolerance) errors.push(`adjusted price differs from expected split price by ${(difference * 100).toFixed(2)}%`);
  }
  return { passes: errors.length === 0, warnings: [], errors };
}

export function reconcileHoldingShares(beforeShares: number, afterShares: number, action: CorporateAction, tolerance = 1e-8): ReconciliationResult {
  const numerator = Number(action.details.newShares ?? action.details.new_shares ?? action.details.ratioNumerator);
  const denominator = Number(action.details.oldShares ?? action.details.old_shares ?? action.details.ratioDenominator);
  const errors: string[] = [];
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || numerator <= 0 || denominator <= 0) errors.push("action ratio must contain positive newShares and oldShares");
  if (!Number.isFinite(beforeShares) || beforeShares < 0 || !Number.isFinite(afterShares) || afterShares < 0) errors.push("share counts must be non-negative");
  if (errors.length === 0 && Math.abs(afterShares - beforeShares * numerator / denominator) > tolerance) errors.push("share count does not reconcile with action ratio");
  return { passes: errors.length === 0, warnings: [], errors };
}
