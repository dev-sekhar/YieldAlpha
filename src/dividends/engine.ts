import type { Dividend } from "../storage/types.js";

export interface DividendPolicy {
  startingYear: number;
  minimumConsecutiveYears: number;
  allowNewerListings: boolean;
  includeSpecialDividends: boolean;
  zeroValueDisqualifies: boolean;
}

export interface AnnualDividend {
  year: number;
  regularAmount: number;
  specialAmount: number;
  includedAmount: number;
  hasSpecialDividend: boolean;
  sourceIds: string[];
}

export type DividendGrowthTrend = "rising" | "stable" | "declining" | "mixed" | "insufficient-data";

export interface DividendEligibilityResult {
  passes: boolean;
  eligibleYears: number[];
  paidYears: number[];
  missingYears: number[];
  zeroValueYears: number[];
  listingYear: number;
  effectiveStartYear: number;
  asOfYear: number;
  reasonCodes: string[];
}

export interface DividendMetrics {
  currentDividendYield?: number;
  dividendCagr?: number;
  payoutConsistency: number;
  growthTrend: DividendGrowthTrend;
  specialDividendYears: number[];
  annualHistory: AnnualDividend[];
}

export interface DividendAnalysis {
  eligibility: DividendEligibilityResult;
  metrics: DividendMetrics;
}

export class DividendDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DividendDataError";
  }
}

function assertYear(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 1900 || value > 2200) throw new DividendDataError(`${field} must be a valid year`);
}

function annualize(dividends: Dividend[], policy: DividendPolicy): AnnualDividend[] {
  const byYear = new Map<number, AnnualDividend>();
  for (const dividend of dividends) {
    assertYear(dividend.financialYear, "financialYear");
    if (!Number.isFinite(dividend.amountPerShare) || dividend.amountPerShare < 0) throw new DividendDataError(`Dividend ${dividend.id} has an invalid amount`);
    const current = byYear.get(dividend.financialYear) ?? { year: dividend.financialYear, regularAmount: 0, specialAmount: 0, includedAmount: 0, hasSpecialDividend: false, sourceIds: [] };
    if (dividend.dividendType === "special") {
      current.specialAmount += dividend.amountPerShare;
      current.hasSpecialDividend = true;
    } else {
      current.regularAmount += dividend.amountPerShare;
    }
    current.includedAmount = current.regularAmount + (policy.includeSpecialDividends ? current.specialAmount : 0);
    current.sourceIds.push(dividend.sourceRecordId);
    byYear.set(dividend.financialYear, current);
  }
  return [...byYear.values()].sort((left, right) => left.year - right.year);
}

export function analyzeDividends(input: {
  listingDate: string;
  dividends: Dividend[];
  policy: DividendPolicy;
  asOfYear: number;
  currentPrice?: number;
}): DividendAnalysis {
  const listingDate = Date.parse(input.listingDate);
  if (!Number.isFinite(listingDate)) throw new DividendDataError("listingDate must be a valid date");
  assertYear(input.policy.startingYear, "startingYear");
  assertYear(input.asOfYear, "asOfYear");
  if (!Number.isInteger(input.policy.minimumConsecutiveYears) || input.policy.minimumConsecutiveYears < 1) throw new DividendDataError("minimumConsecutiveYears must be positive");
  if (input.asOfYear < input.policy.startingYear) throw new DividendDataError("asOfYear cannot precede startingYear");
  if (input.currentPrice !== undefined && (!Number.isFinite(input.currentPrice) || input.currentPrice <= 0)) throw new DividendDataError("currentPrice must be positive");

  const listingYear = new Date(listingDate).getUTCFullYear();
  const effectiveStartYear = Math.max(input.policy.startingYear, listingYear);
  const annualHistory = annualize(input.dividends, input.policy);
  const byYear = new Map(annualHistory.map((entry) => [entry.year, entry]));
  // The current calendar year is incomplete until its dividend period has
  // closed. Exclude it from the continuity gate so a company is not rejected
  // merely because its current-year dividend has not yet been declared.
  const lastCompletedYear = input.asOfYear - 1;
  const eligibleYears = effectiveStartYear <= lastCompletedYear ? Array.from({ length: lastCompletedYear - effectiveStartYear + 1 }, (_, offset) => effectiveStartYear + offset) : [];
  const completedHistory = annualHistory.filter((entry) => entry.year <= lastCompletedYear);
  const missingYears: number[] = [];
  const zeroValueYears: number[] = [];
  const paidYears: number[] = [];
  for (const year of eligibleYears) {
    const annual = byYear.get(year);
    if (!annual) { missingYears.push(year); continue; }
    if (annual.includedAmount === 0) {
      zeroValueYears.push(year);
      if (input.policy.zeroValueDisqualifies) continue;
    }
    paidYears.push(year);
  }
  const reasonCodes: string[] = [];
  if (!input.policy.allowNewerListings && listingYear > input.policy.startingYear) reasonCodes.push("NEWER_LISTING_NOT_ALLOWED");
  if (eligibleYears.length < input.policy.minimumConsecutiveYears) reasonCodes.push("INSUFFICIENT_DIVIDEND_HISTORY");
  if (missingYears.length > 0) reasonCodes.push("MISSED_ELIGIBLE_DIVIDEND_YEAR");
  if (input.policy.zeroValueDisqualifies && zeroValueYears.length > 0) reasonCodes.push("ZERO_VALUE_DIVIDEND_YEAR");
  const passes = reasonCodes.length === 0;

  const nonZeroHistory = completedHistory.filter((entry) => entry.includedAmount > 0);
  const first = nonZeroHistory[0];
  const last = nonZeroHistory[nonZeroHistory.length - 1];
  const dividendCagr = first && last && last.year > first.year ? (last.includedAmount / first.includedAmount) ** (1 / (last.year - first.year)) - 1 : undefined;
  let growthTrend: DividendGrowthTrend = "insufficient-data";
  if (nonZeroHistory.length >= 2) {
    const changes = nonZeroHistory.slice(1).map((entry, index) => Math.sign(entry.includedAmount - (nonZeroHistory[index]?.includedAmount ?? entry.includedAmount)));
    growthTrend = changes.every((change) => change > 0) ? "rising" : changes.every((change) => change < 0) ? "declining" : changes.every((change) => change === 0) ? "stable" : "mixed";
  }
  const latest = completedHistory[completedHistory.length - 1];
  return {
    eligibility: { passes, eligibleYears, paidYears, missingYears, zeroValueYears, listingYear, effectiveStartYear, asOfYear: input.asOfYear, reasonCodes },
    metrics: {
      ...(input.currentPrice !== undefined && latest ? { currentDividendYield: latest.includedAmount / input.currentPrice } : {}),
      ...(dividendCagr !== undefined ? { dividendCagr } : {}),
      payoutConsistency: eligibleYears.length === 0 ? 0 : paidYears.length / eligibleYears.length,
      growthTrend,
      specialDividendYears: completedHistory.filter((entry) => entry.hasSpecialDividend).map((entry) => entry.year),
      annualHistory
    }
  };
}
