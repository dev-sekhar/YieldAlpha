import type { Portfolio, PortfolioPosition, Watchlist } from "../storage/types.js";

export type PortfolioWeightingMethod = Portfolio["weightingMethod"];

export interface PortfolioCandidate {
  securityId: string;
  companyId: string;
  sectorId: string;
  currentPrice: number;
  expectedCagr?: number;
  expectedRealCagr?: number;
  dividendYield?: number;
  currentMultiple?: number;
  riskWeight?: number;
}

export interface PortfolioAllocationRequest {
  capital: number;
  weightingMethod: PortfolioWeightingMethod;
  candidates: PortfolioCandidate[];
  customWeights?: Record<string, number>;
  sectorCap?: number;
  horizonYears?: number;
  inflationRate?: number;
}

export interface PortfolioAllocationLine extends PortfolioCandidate {
  targetWeight: number;
  grossAllocation: number;
  shares: number;
  investedCapital: number;
  cashResidual: number;
}

export interface PortfolioPlan {
  weightingMethod: PortfolioWeightingMethod;
  capital: number;
  lines: PortfolioAllocationLine[];
  cashResidual: number;
  expectedCagr?: number;
  expectedRealCagr?: number;
  weightedDividendYield?: number;
  expectedFiveYearValue?: number;
  inflationAdjustedExpectedValue?: number;
  sectorExposure: Record<string, number>;
  valuationExposure?: number;
  riskConcentration: number;
  warnings: string[];
}

export interface PortfolioHoldingInput {
  position: PortfolioPosition;
  sectorId?: string;
  currentPrice?: number;
  expectedCagr?: number;
  expectedRealCagr?: number;
  dividendYield?: number;
  currentMultiple?: number;
}

export interface PortfolioAnalytics {
  portfolioId: string;
  positionCount: number;
  investedCapital: number;
  currentValue?: number;
  cashResidual?: number;
  expectedCagr?: number;
  expectedRealCagr?: number;
  weightedDividendYield?: number;
  expectedFiveYearValue?: number;
  inflationAdjustedExpectedValue?: number;
  sectorExposure: Record<string, number>;
  valuationExposure?: number;
  riskConcentration: number;
  unrealizedReturn?: number;
  realizedReturn?: number;
  realizedProceeds: number;
  realizedCostBasis: number;
  realizedDividends: number;
  warnings: string[];
}

export interface PortfolioMutationResult {
  portfolio: Portfolio;
  positions: PortfolioPosition[];
  plan: PortfolioPlan;
}

export interface WatchlistMutationResult {
  watchlist: Watchlist;
  previousSecurityIds: string[];
}
