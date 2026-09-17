import { realCagr } from "../model/calculations.js";
import type { BacktestMetrics, BacktestPositionResult, DailyPortfolioValue } from "./types.js";

export class BacktestMetricsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BacktestMetricsError";
  }
}

export function annualizedCagr(startValue: number, endValue: number, startDate: string, endDate: string): number {
  if (!Number.isFinite(startValue) || startValue <= 0 || !Number.isFinite(endValue) || endValue < 0) throw new BacktestMetricsError("CAGR values must be finite and non-negative");
  const start = Date.parse(startDate);
  const end = Date.parse(endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new BacktestMetricsError("endDate must be after startDate");
  const years = (end - start) / (365.25 * 24 * 60 * 60 * 1_000);
  return endValue === 0 ? -1 : (endValue / startValue) ** (1 / years) - 1;
}

export function maximumDrawdown(values: DailyPortfolioValue[]): number {
  let peak = 0;
  let maximum = 0;
  for (const point of values) {
    peak = Math.max(peak, point.value);
    if (peak > 0) maximum = Math.max(maximum, (peak - point.value) / peak);
  }
  return maximum;
}

export function annualizedVolatility(values: DailyPortfolioValue[]): number {
  if (values.length < 2) return 0;
  const returns = values.slice(1).map((point, index) => {
    const previous = values[index]?.value ?? 0;
    return previous > 0 ? point.value / previous - 1 : 0;
  });
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / returns.length;
  return Math.sqrt(variance * 252);
}

export function calculateMetrics(input: {
  startingCapital: number;
  finalValue: number;
  benchmarkFinalValue: number;
  executionDate: string;
  endDate: string;
  targetCagr: number;
  inflationRate: number;
  positions: BacktestPositionResult[];
  dailyValues: DailyPortfolioValue[];
}): BacktestMetrics {
  const cagr = annualizedCagr(input.startingCapital, input.finalValue, input.executionDate, input.endDate);
  const benchmarkCagr = annualizedCagr(input.startingCapital, input.benchmarkFinalValue, input.executionDate, input.endDate);
  const selected = input.positions.filter((position) => position.selection === "selected");
  const completed = selected.filter((position) => position.cagr !== undefined);
  const winners = completed.filter((position) => (position.cagr ?? -1) >= input.targetCagr).length;
  return {
    startingCapital: input.startingCapital, finalValue: input.finalValue, absoluteProfit: input.finalValue - input.startingCapital,
    totalReturn: input.finalValue / input.startingCapital - 1, cagr, realCagr: cagr === -1 ? -1 : realCagr(cagr, input.inflationRate),
    benchmarkFinalValue: input.benchmarkFinalValue, benchmarkCagr, alpha: cagr - benchmarkCagr, maximumDrawdown: maximumDrawdown(input.dailyValues), volatility: annualizedVolatility(input.dailyValues),
    hitRate: completed.length === 0 ? 0 : winners / completed.length, stocksExceedingTarget: winners, selectedStockCount: selected.length, dailyValues: input.dailyValues
  };
}
