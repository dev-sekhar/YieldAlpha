import type { ModelCalculation, ModelConfig, ModelInput, ScenarioAssumptions, ScenarioResult } from "./types.js";

export class ModelCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelCalculationError";
  }
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new ModelCalculationError(`${name} must be positive`);
  return value;
}

function rate(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= -1) throw new ModelCalculationError(`${name} must be greater than -100%`);
  return value;
}

function nonNegativeRate(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new ModelCalculationError(`${name} must be non-negative`);
  return value;
}

export function realCagr(nominalCagr: number, inflationRate: number): number {
  rate(nominalCagr, "nominalCagr");
  rate(inflationRate, "inflationRate");
  return ((1 + nominalCagr) / (1 + inflationRate)) - 1;
}

export function expectedDividends(currentAnnualDividendPerShare: number, dividendGrowthRate: number, horizonYears: number): { annual: number[]; total: number } {
  if (!Number.isFinite(currentAnnualDividendPerShare) || currentAnnualDividendPerShare < 0) throw new ModelCalculationError("currentAnnualDividendPerShare must be non-negative");
  rate(dividendGrowthRate, "dividendGrowthRate");
  const annual = Array.from({ length: horizonYears }, (_, index) => currentAnnualDividendPerShare * ((1 + dividendGrowthRate) ** (index + 1)));
  return { annual, total: annual.reduce((sum, value) => sum + value, 0) };
}

export function calculateScenario(input: ModelInput, config: ModelConfig, assumptions: ScenarioAssumptions): ScenarioResult {
  positive(input.currentPrice, "currentPrice");
  positive(input.currentEps, "currentEps");
  positive(input.currentRevenue, "currentRevenue");
  positive(input.currentProfit, "currentProfit");
  positive(assumptions.exitMultiple, "exitMultiple");
  rate(assumptions.epsGrowthRate, "epsGrowthRate");
  rate(assumptions.revenueGrowthRate, "revenueGrowthRate");
  rate(assumptions.profitGrowthRate, "profitGrowthRate");
  const eps = input.currentEps * ((1 + assumptions.epsGrowthRate) ** config.horizonYears);
  const revenue = input.currentRevenue * ((1 + assumptions.revenueGrowthRate) ** config.horizonYears);
  const profit = input.currentProfit * ((1 + assumptions.profitGrowthRate) ** config.horizonYears);
  const dividends = expectedDividends(input.currentAnnualDividendPerShare, assumptions.dividendGrowthRate, config.horizonYears);
  const terminalPrice = eps * assumptions.exitMultiple;
  const totalShareholderValue = terminalPrice + dividends.total;
  const nominalCagr = (totalShareholderValue / input.currentPrice) ** (1 / config.horizonYears) - 1;
  return { ...assumptions, expectedEps: eps, expectedRevenue: revenue, expectedProfit: profit, expectedDividends: dividends.total, annualDividends: dividends.annual, terminalPrice, totalShareholderValue, nominalCagr, realCagr: realCagr(nominalCagr, config.inflationRate) };
}

export function calculateModel(input: ModelInput, config: ModelConfig): ModelCalculation {
  if (!Number.isInteger(config.horizonYears) || config.horizonYears < 1) throw new ModelCalculationError("horizonYears must be a positive integer");
  rate(config.inflationRate, "inflationRate");
  nonNegativeRate(config.requiredCagr, "requiredCagr");
  const base: ScenarioAssumptions = { epsGrowthRate: input.expectedEpsGrowthRate, revenueGrowthRate: input.expectedRevenueGrowthRate, profitGrowthRate: input.expectedProfitGrowthRate, exitMultiple: input.exitMultiple, dividendGrowthRate: input.dividendGrowthRate };
  const downside: ScenarioAssumptions = { ...base, epsGrowthRate: base.epsGrowthRate - config.downsideEpsGrowthAdjustment, revenueGrowthRate: base.revenueGrowthRate - config.downsideEpsGrowthAdjustment, profitGrowthRate: base.profitGrowthRate - config.downsideEpsGrowthAdjustment, exitMultiple: base.exitMultiple * config.downsideExitMultipleFactor, dividendGrowthRate: base.dividendGrowthRate - config.downsideEpsGrowthAdjustment };
  const upside: ScenarioAssumptions = { ...base, epsGrowthRate: base.epsGrowthRate + config.upsideEpsGrowthAdjustment, revenueGrowthRate: base.revenueGrowthRate + config.upsideEpsGrowthAdjustment, profitGrowthRate: base.profitGrowthRate + config.upsideEpsGrowthAdjustment, exitMultiple: base.exitMultiple * config.upsideExitMultipleFactor, dividendGrowthRate: base.dividendGrowthRate + config.upsideEpsGrowthAdjustment };
  return { horizonYears: config.horizonYears, inflationRate: config.inflationRate, downside: calculateScenario(input, config, downside), base: calculateScenario(input, config, base), upside: calculateScenario(input, config, upside) };
}
