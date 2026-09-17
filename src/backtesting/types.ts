import type { BenchmarkPrice, CorporateAction, Dividend, PriceHistory } from "../storage/types.js";
import type { ModelConfig, ModelInput, ModelRecommendation } from "../model/types.js";

export type BacktestWeightingMethod = "equal" | "custom" | "risk-weighted" | "sector-capped";

export interface BacktestRequest {
  analysisDate: string;
  executionDate: string;
  endDate: string;
  startingCapital: number;
  targetCagr: number;
  inflationRate: number;
  benchmarkId: string;
  weightingMethod: BacktestWeightingMethod;
  transactionCostRate: number;
  customWeights?: Record<string, number>;
  sectorCap?: number;
  requireBenchmarkOutperformance?: boolean;
}

export interface HistoricalModelSnapshot {
  availableAt: string;
  input: ModelInput;
}

export interface HistoricalSecurityData {
  securityId: string;
  companyId: string;
  sectorId: string;
  modelSnapshots: HistoricalModelSnapshot[];
  prices: PriceHistory[];
  dividends: Dividend[];
  corporateActions: CorporateAction[];
  /** Relative risk estimate used by risk-weighted allocation. Higher means riskier. */
  riskWeight?: number;
  listedFrom?: string;
  listedTo?: string;
}

export interface HistoricalBenchmarkData {
  benchmarkId: string;
  code?: "NIFTY50_TRI" | "SENSEX_TRI";
  prices: BenchmarkPrice[];
}

export interface BacktestDataset {
  securities: HistoricalSecurityData[];
  benchmarks: HistoricalBenchmarkData[];
  universeMode?: "historical-reconstructed" | "current-survivor" | "mixed" | "unspecified";
}

export interface BacktestSelection {
  securityId: string;
  companyId: string;
  sectorId: string;
  selection: "selected" | "rejected";
  reason: string;
  reasonCodes: string[];
  recommendation?: ModelRecommendation;
  allocation?: number;
  riskWeight?: number;
}

export interface BacktestPositionResult {
  securityId: string;
  companyId: string;
  sectorId: string;
  selection: "selected" | "rejected";
  reason: string;
  allocation: number;
  investedCapital: number;
  shares: number;
  executionPrice?: number;
  cashResidual: number;
  dividendsReceived: number;
  corporateActionIds: string[];
  terminalPrice?: number;
  terminalMarketValue: number;
  finalValue: number;
  totalReturn?: number;
  cagr?: number;
  realCagr?: number;
  warnings: string[];
}

export interface DailyPortfolioValue {
  date: string;
  value: number;
}

export interface BacktestMetrics {
  startingCapital: number;
  finalValue: number;
  absoluteProfit: number;
  totalReturn: number;
  cagr: number;
  realCagr: number;
  benchmarkFinalValue: number;
  benchmarkCagr: number;
  alpha: number;
  maximumDrawdown: number;
  volatility: number;
  hitRate: number;
  stocksExceedingTarget: number;
  selectedStockCount: number;
  dailyValues: DailyPortfolioValue[];
}

export interface BacktestBenchmarkComparison {
  benchmarkId: string;
  code?: "NIFTY50_TRI" | "SENSEX_TRI";
  startDate: string;
  endDate: string;
  startValue: number;
  endValue: number;
  finalValue: number;
  cagr: number;
}

export interface BacktestResult {
  request: BacktestRequest;
  modelConfig: ModelConfig;
  selections: BacktestSelection[];
  positions: BacktestPositionResult[];
  metrics: BacktestMetrics;
  benchmarkComparisons?: BacktestBenchmarkComparison[];
  modelVerdict: "WORKS" | "DOES_NOT_WORK";
  verdictExplanation: string;
  warnings: string[];
  limitations: string[];
}
