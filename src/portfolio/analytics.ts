import type { PortfolioAnalytics, PortfolioHoldingInput } from "./types.js";

export function calculatePortfolioAnalytics(input: {
  portfolioId: string;
  holdings: PortfolioHoldingInput[];
  horizonYears?: number;
  inflationRate?: number;
}): PortfolioAnalytics {
  const horizonYears = input.horizonYears ?? 5;
  const inflationRate = input.inflationRate ?? 0;
  const investedCapital = input.holdings.reduce((sum, holding) => sum + holding.position.shares * holding.position.averageCost, 0);
  const valued = input.holdings.filter((holding) => holding.currentPrice !== undefined && Number.isFinite(holding.currentPrice));
  const currentValue = valued.length === input.holdings.length ? valued.reduce((sum, holding) => sum + holding.position.shares * (holding.currentPrice ?? 0), 0) : undefined;
  const realizedProceeds = input.holdings.reduce((sum, holding) => sum + (holding.position.realizedProceeds ?? 0), 0);
  const realizedCostBasis = input.holdings.reduce((sum, holding) => sum + (holding.position.realizedCostBasis ?? 0), 0);
  const realizedDividends = input.holdings.reduce((sum, holding) => sum + (holding.position.realizedDividends ?? 0), 0);
  const weighted = (selector: (holding: PortfolioHoldingInput) => number | undefined): number | undefined => {
    const usable = input.holdings.filter((holding) => selector(holding) !== undefined && holding.position.shares * holding.position.averageCost > 0);
    const total = usable.reduce((sum, holding) => sum + holding.position.shares * holding.position.averageCost, 0);
    return total > 0 && usable.length ? usable.reduce((sum, holding) => sum + (holding.position.shares * holding.position.averageCost) * (selector(holding) ?? 0), 0) / total : undefined;
  };
  const expectedCagr = weighted((holding) => holding.expectedCagr);
  const expectedRealCagr = weighted((holding) => holding.expectedRealCagr);
  const weightedDividendYield = weighted((holding) => holding.dividendYield);
  const valuationExposure = weighted((holding) => holding.currentMultiple);
  const sectorExposure: Record<string, number> = {};
  const exposureBase = currentValue ?? investedCapital;
  for (const holding of input.holdings) {
    if (!holding.sectorId || exposureBase <= 0) continue;
    sectorExposure[holding.sectorId] = (sectorExposure[holding.sectorId] ?? 0) + (holding.position.shares * (holding.currentPrice ?? holding.position.averageCost)) / exposureBase;
  }
  const positionWeights = input.holdings.map((holding) => exposureBase > 0 ? (holding.position.shares * (holding.currentPrice ?? holding.position.averageCost)) / exposureBase : 0);
  const riskConcentration = positionWeights.reduce((sum, weight) => sum + weight ** 2, 0);
  const expectedFiveYearValue = expectedCagr === undefined || investedCapital <= 0 ? undefined : (currentValue ?? investedCapital) * (1 + expectedCagr) ** horizonYears;
  const inflationAdjustedExpectedValue = expectedFiveYearValue === undefined ? undefined : expectedFiveYearValue / (1 + inflationRate) ** horizonYears;
  const unrealizedReturn = currentValue === undefined || investedCapital <= 0 ? undefined : (currentValue + realizedDividends - investedCapital) / investedCapital;
  const realizedReturn = realizedCostBasis > 0 ? (realizedProceeds + realizedDividends - realizedCostBasis) / realizedCostBasis : undefined;
  return {
    portfolioId: input.portfolioId, positionCount: input.holdings.length, investedCapital, ...(currentValue !== undefined ? { currentValue } : {}),
    ...(expectedCagr !== undefined ? { expectedCagr } : {}),
    ...(expectedRealCagr !== undefined ? { expectedRealCagr } : {}), ...(weightedDividendYield !== undefined ? { weightedDividendYield } : {}),
    ...(expectedFiveYearValue !== undefined ? { expectedFiveYearValue } : {}), ...(inflationAdjustedExpectedValue !== undefined ? { inflationAdjustedExpectedValue } : {}),
    sectorExposure, ...(valuationExposure !== undefined ? { valuationExposure } : {}), riskConcentration,
    ...(unrealizedReturn !== undefined ? { unrealizedReturn } : {}), ...(realizedReturn !== undefined ? { realizedReturn } : {}),
    realizedProceeds, realizedCostBasis, realizedDividends,
    warnings: [...(currentValue === undefined && input.holdings.length ? ["CURRENT_PRICES_INCOMPLETE"] : []), ...(realizedCostBasis === 0 ? ["REALIZED_TRANSACTIONS_NOT_RECORDED"] : [])]
  };
}
