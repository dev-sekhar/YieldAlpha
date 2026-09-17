import type { PortfolioAllocationLine, PortfolioAllocationRequest, PortfolioCandidate, PortfolioPlan } from "./types.js";

function validateCandidate(candidate: PortfolioCandidate): void {
  if (!candidate.securityId || !candidate.companyId || !candidate.sectorId) throw new Error("Portfolio candidates require security, company, and sector IDs");
  if (!Number.isFinite(candidate.currentPrice) || candidate.currentPrice <= 0) throw new Error(`Current price for ${candidate.securityId} must be positive`);
  if (candidate.riskWeight !== undefined && (!Number.isFinite(candidate.riskWeight) || candidate.riskWeight <= 0)) throw new Error(`Risk weight for ${candidate.securityId} must be positive`);
}

function normalize(weights: Map<string, number>): Map<string, number> {
  const total = [...weights.values()].reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || total <= 0) throw new Error("Portfolio weights must contain a positive total");
  return new Map([...weights.entries()].map(([id, value]) => [id, value / total]));
}

function equalWeights(candidates: PortfolioCandidate[]): Map<string, number> {
  return new Map(candidates.map((candidate) => [candidate.securityId, 1 / candidates.length]));
}

function customWeights(candidates: PortfolioCandidate[], supplied: Record<string, number> | undefined): Map<string, number> {
  if (!supplied) throw new Error("Custom weighting requires customWeights");
  const weights = new Map<string, number>();
  for (const candidate of candidates) {
    const value = supplied[candidate.securityId] ?? 0;
    if (!Number.isFinite(value) || value < 0) throw new Error(`Custom weight for ${candidate.securityId} must be non-negative`);
    weights.set(candidate.securityId, value);
  }
  return normalize(weights);
}

function riskWeights(candidates: PortfolioCandidate[]): Map<string, number> {
  return normalize(new Map(candidates.map((candidate) => [candidate.securityId, 1 / (candidate.riskWeight ?? 1)])));
}

function sectorCappedWeights(candidates: PortfolioCandidate[], sectorCap: number): Map<string, number> {
  if (!Number.isFinite(sectorCap) || sectorCap <= 0 || sectorCap > 1) throw new Error("sectorCap must be greater than 0 and no greater than 1");
  const weights = equalWeights(candidates);
  const sectors = new Map<string, string[]>();
  for (const candidate of candidates) sectors.set(candidate.sectorId, [...(sectors.get(candidate.sectorId) ?? []), candidate.securityId]);
  const sectorTotal = (sector: string) => (sectors.get(sector) ?? []).reduce((sum, id) => sum + (weights.get(id) ?? 0), 0);
  let excess = 0;
  for (const sector of sectors.keys()) {
    const total = sectorTotal(sector);
    if (total > sectorCap) {
      const scale = sectorCap / total;
      for (const id of sectors.get(sector) ?? []) weights.set(id, (weights.get(id) ?? 0) * scale);
      excess += total - sectorCap;
    }
  }
  let remaining = excess;
  for (let pass = 0; pass < sectors.size && remaining > 1e-10; pass += 1) {
    const eligible = [...sectors.keys()].filter((sector) => sectorTotal(sector) < sectorCap - 1e-10);
    const capacity = eligible.reduce((sum, sector) => sum + Math.max(0, sectorCap - sectorTotal(sector)), 0);
    if (capacity <= 1e-10) break;
    const distributed = Math.min(remaining, capacity);
    for (const sector of eligible) {
      const addition = distributed * ((sectorCap - sectorTotal(sector)) / capacity);
      const ids = sectors.get(sector) ?? [];
      const current = ids.reduce((sum, id) => sum + (weights.get(id) ?? 0), 0);
      for (const id of ids) weights.set(id, (weights.get(id) ?? 0) + (current > 0 ? addition * ((weights.get(id) ?? 0) / current) : addition / ids.length));
    }
    remaining -= distributed;
  }
  return weights;
}

function weightedValue(lines: PortfolioAllocationLine[], selector: (candidate: PortfolioCandidate) => number | undefined): number | undefined {
  const usable = lines.filter((line) => selector(line) !== undefined);
  return usable.length ? usable.reduce((sum, line) => sum + line.targetWeight * (selector(line) ?? 0), 0) / usable.reduce((sum, line) => sum + line.targetWeight, 0) : undefined;
}

export function calculatePortfolioPlan(request: PortfolioAllocationRequest): PortfolioPlan {
  if (!Number.isFinite(request.capital) || request.capital <= 0) throw new Error("Portfolio capital must be positive");
  if (request.candidates.length === 0) throw new Error("At least one portfolio candidate is required");
  if (!["equal", "custom", "risk-weighted", "sector-capped"].includes(request.weightingMethod)) throw new Error(`Unsupported portfolio weighting method ${request.weightingMethod}`);
  const ids = new Set<string>();
  for (const candidate of request.candidates) { validateCandidate(candidate); if (ids.has(candidate.securityId)) throw new Error(`Duplicate portfolio candidate ${candidate.securityId}`); ids.add(candidate.securityId); }
  const weights = request.weightingMethod === "equal" ? equalWeights(request.candidates) : request.weightingMethod === "custom" ? customWeights(request.candidates, request.customWeights) : request.weightingMethod === "risk-weighted" ? riskWeights(request.candidates) : sectorCappedWeights(request.candidates, request.sectorCap ?? 0.3);
  const lines: PortfolioAllocationLine[] = request.candidates.map((candidate) => {
    const targetWeight = weights.get(candidate.securityId) ?? 0;
    const grossAllocation = request.capital * targetWeight;
    const shares = Math.floor(grossAllocation / candidate.currentPrice);
    const investedCapital = shares * candidate.currentPrice;
    return { ...candidate, targetWeight, grossAllocation, shares, investedCapital, cashResidual: grossAllocation - investedCapital };
  });
  const investedCapital = lines.reduce((sum, line) => sum + line.investedCapital, 0);
  const cashResidual = request.capital - investedCapital;
  const horizonYears = request.horizonYears ?? 5;
  const inflationRate = request.inflationRate ?? 0;
  const expectedCagr = weightedValue(lines, (candidate) => candidate.expectedCagr);
  const expectedRealCagr = weightedValue(lines, (candidate) => candidate.expectedRealCagr);
  const weightedDividendYield = weightedValue(lines, (candidate) => candidate.dividendYield);
  const valuationExposure = weightedValue(lines, (candidate) => candidate.currentMultiple);
  const sectorExposure: Record<string, number> = {};
  for (const line of lines) sectorExposure[line.sectorId] = (sectorExposure[line.sectorId] ?? 0) + line.targetWeight;
  const riskConcentration = lines.reduce((sum, line) => sum + line.targetWeight ** 2, 0);
  const completeExpectedCagr = lines.every((line) => line.investedCapital === 0 || line.expectedCagr !== undefined);
  const expectedFiveYearValue = expectedCagr === undefined || !completeExpectedCagr ? undefined : cashResidual + lines.reduce((sum, line) => sum + line.investedCapital * (1 + (line.expectedCagr ?? 0)) ** horizonYears, 0);
  const inflationAdjustedExpectedValue = expectedFiveYearValue === undefined ? undefined : expectedFiveYearValue / (1 + inflationRate) ** horizonYears;
  const warnings = [
    ...(cashResidual > request.capital * 0.02 ? ["CASH_RESIDUAL_EXCEEDS_2_PERCENT"] : []),
    ...(!completeExpectedCagr ? ["EXPECTED_RETURN_INCOMPLETE"] : []),
    ...(Object.values(sectorExposure).some((weight) => weight > (request.sectorCap ?? 1) + 1e-10) ? ["SECTOR_CAP_NOT_MET"] : [])
  ];
  return { weightingMethod: request.weightingMethod, capital: request.capital, lines, cashResidual, ...(expectedCagr !== undefined ? { expectedCagr } : {}), ...(expectedRealCagr !== undefined ? { expectedRealCagr } : {}), ...(weightedDividendYield !== undefined ? { weightedDividendYield } : {}), ...(expectedFiveYearValue !== undefined ? { expectedFiveYearValue } : {}), ...(inflationAdjustedExpectedValue !== undefined ? { inflationAdjustedExpectedValue } : {}), sectorExposure, ...(valuationExposure !== undefined ? { valuationExposure } : {}), riskConcentration, warnings };
}
