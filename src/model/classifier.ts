import type { ModelCalculation, ModelConfig, ModelDecision, ModelInput } from "./types.js";

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function classifyModel(input: ModelInput, config: ModelConfig, calculation: ModelCalculation): ModelDecision {
  const insufficient = [
    ...input.dataQuality.missingFields.map((field) => `MISSING_${field.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`),
    ...input.dataQuality.conflictingFields.map((field) => `CONFLICTING_${field.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`),
    ...input.dataQuality.unverifiedFields.map((field) => `UNVERIFIED_${field.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`),
    ...input.dataQuality.staleFields.map((field) => `STALE_${field.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`)
  ];
  if (insufficient.length > 0) return { classification: "INSUFFICIENT_DATA", reasonCodes: unique(insufficient), explanation: `INSUFFICIENT DATA: required model inputs are unavailable or not trustworthy (${unique(insufficient).join(", ")}).`, confidence: "unknown" };
  const unknownQuality = [
    input.quality.balanceSheet === "unknown" ? "BALANCE_SHEET" : "",
    input.quality.fundamentals === "unknown" ? "FUNDAMENTALS" : "",
    input.quality.sectorOutlook === "unknown" ? "SECTOR_OUTLOOK" : "",
    input.quality.governance === "unknown" ? "GOVERNANCE" : ""
  ].filter(Boolean).map((field) => `UNKNOWN_${field}`);
  if (unknownQuality.length > 0) return { classification: "INSUFFICIENT_DATA", reasonCodes: unknownQuality, explanation: `INSUFFICIENT DATA: quality inputs are not verified (${unknownQuality.join(", ")}).`, confidence: "unknown" };

  const avoid: string[] = [];
  if (!input.dividendAnalysis.eligibility.passes) avoid.push("DIVIDEND_CRITERION_FAILED");
  if (input.quality.governance === "issue") avoid.push("GOVERNANCE_ISSUE");
  if (input.quality.balanceSheet === "excessive-leverage") avoid.push("EXCESSIVE_LEVERAGE");
  if (input.quality.balanceSheet === "weak") avoid.push("UNACCEPTABLE_BALANCE_SHEET");
  if (input.quality.fundamentals === "weak") avoid.push("WEAK_FUNDAMENTALS");
  if (input.quality.structurallyDeteriorated) avoid.push("STRUCTURAL_DETERIORATION");
  if (config.maximumDebtToEquity !== undefined && input.quality.debtToEquity !== undefined && input.quality.debtToEquity > config.maximumDebtToEquity) avoid.push("DEBT_TO_EQUITY_ABOVE_LIMIT");
  if (calculation.base.nominalCagr < config.requiredCagr - config.materiallyBelowHurdleBy) avoid.push("RETURN_MATERIALLY_BELOW_HURDLE");
  if (avoid.length > 0) return { classification: "AVOID", reasonCodes: unique(avoid), explanation: `AVOID: ${unique(avoid).join(", ")}. The base-case expected total-return CAGR is ${percent(calculation.base.nominalCagr)} against the configured ${percent(config.requiredCagr)} hurdle.`, confidence: "high" };

  const watch: string[] = [];
  if (calculation.base.nominalCagr < config.requiredCagr) watch.push("RETURN_BELOW_HURDLE");
  if (input.quality.sectorOutlook === "neutral" || input.quality.sectorOutlook === "unsupported") watch.push("SECTOR_OUTLOOK_NOT_SUPPORTIVE");
  if (input.valuation.marginOfSafety < config.valuationMarginOfSafety) watch.push("INSUFFICIENT_MARGIN_OF_SAFETY");
  if (config.minimumRoce !== undefined && (input.quality.roce === undefined || input.quality.roce < config.minimumRoce)) watch.push("ROCE_BELOW_LIMIT");
  if (config.minimumEarningsGrowth !== undefined && (input.quality.earningsGrowthRate === undefined || input.quality.earningsGrowthRate < config.minimumEarningsGrowth)) watch.push("EARNINGS_GROWTH_BELOW_LIMIT");
  if (calculation.downside.nominalCagr < 0) watch.push("DOWNSIDE_SCENARIO_NEGATIVE");
  if (watch.length > 0) return { classification: "WATCH", reasonCodes: unique(watch), explanation: `WATCH: the dividend and basic quality requirements pass, but ${unique(watch).join(", ")}. Base-case expected total-return CAGR is ${percent(calculation.base.nominalCagr)} versus the ${percent(config.requiredCagr)} hurdle.`, confidence: "medium" };

  return { classification: "BUY", reasonCodes: ["DIVIDEND_CRITERION_PASSED", "QUALITY_PASSED", "SECTOR_SUPPORTIVE", "VALUATION_MARGIN_PASSED", "RETURN_HURDLE_PASSED"], explanation: `BUY: dividend continuity, quality, supportive sector conditions, valuation margin of safety, and the expected base-case total-return CAGR of ${percent(calculation.base.nominalCagr)} satisfy the configured ${percent(config.requiredCagr)} hurdle.`, confidence: "high" };
}
