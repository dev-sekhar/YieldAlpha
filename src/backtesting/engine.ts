import { applyCorporateActions, type Holding } from "../corporate-actions/engine.js";
import { evaluateModel } from "../model/engine.js";
import type { ModelConfig, ModelRecommendation } from "../model/types.js";
import { calculateAllocations } from "./allocation.js";
import { annualizedCagr, calculateMetrics } from "./metrics.js";
import type { BacktestDataset, BacktestPositionResult, BacktestRequest, BacktestResult, BacktestSelection, HistoricalSecurityData } from "./types.js";

export class BacktestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BacktestError";
  }
}

function parseDate(value: string, name: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new BacktestError(`${name} must be a valid date`);
  return timestamp;
}

function validateRequest(request: BacktestRequest): void {
  const analysis = parseDate(request.analysisDate, "analysisDate");
  const execution = parseDate(request.executionDate, "executionDate");
  const end = parseDate(request.endDate, "endDate");
  if (execution < analysis) throw new BacktestError("executionDate cannot precede analysisDate");
  if (end <= execution) throw new BacktestError("endDate must be after executionDate");
  if (!Number.isFinite(request.startingCapital) || request.startingCapital <= 0) throw new BacktestError("startingCapital must be positive");
  if (!Number.isFinite(request.targetCagr) || request.targetCagr < 0) throw new BacktestError("targetCagr must be non-negative");
  if (!Number.isFinite(request.inflationRate) || request.inflationRate <= -1) throw new BacktestError("inflationRate must be greater than -100%");
  if (!Number.isFinite(request.transactionCostRate) || request.transactionCostRate < 0) throw new BacktestError("transactionCostRate must be non-negative");
}

function latestSnapshot(security: HistoricalSecurityData, analysisTimestamp: number): { input: HistoricalSecurityData["modelSnapshots"][number]["input"]; availableAt: string } | undefined {
  return security.modelSnapshots.filter((snapshot) => {
    const available = Date.parse(snapshot.availableAt);
    const generated = snapshot.input.generatedAt ? Date.parse(snapshot.input.generatedAt) : available;
    return Number.isFinite(available) && available <= analysisTimestamp && Number.isFinite(generated) && generated <= analysisTimestamp;
  }).sort((left, right) => left.availableAt.localeCompare(right.availableAt)).at(-1);
}

function priceOnOrAfter(security: HistoricalSecurityData, date: string): { price: number; date: string } | undefined {
  const timestamp = parseDate(date, "date");
  const prices = security.prices.filter((price) => Date.parse(price.tradingDate) >= timestamp).sort((left, right) => left.tradingDate.localeCompare(right.tradingDate));
  const price = prices[0];
  if (!price) return undefined;
  return { price: price.close, date: price.tradingDate };
}

function priceOnOrBefore(security: HistoricalSecurityData, date: string, notBefore?: string): { price: number; date: string } | undefined {
  const timestamp = parseDate(date, "date");
  const lowerBound = notBefore === undefined ? Number.NEGATIVE_INFINITY : parseDate(notBefore, "notBefore");
  const prices = security.prices.filter((price) => Date.parse(price.tradingDate) <= timestamp && Date.parse(price.tradingDate) >= lowerBound).sort((left, right) => left.tradingDate.localeCompare(right.tradingDate));
  const price = prices.at(-1);
  if (!price) return undefined;
  return { price: price.close, date: price.tradingDate };
}

function eventDate(value: string, fallbackYear?: number): string {
  return value || `${fallbackYear ?? 1900}-12-31`;
}

function simulatePosition(security: HistoricalSecurityData, dataset: BacktestDataset, allocation: number, request: BacktestRequest): BacktestPositionResult {
  const warnings: string[] = [];
  const execution = priceOnOrAfter(security, request.executionDate);
  if (!execution) return { securityId: security.securityId, companyId: security.companyId, sectorId: security.sectorId, selection: "selected", reason: "No execution price is available on or after the execution date", allocation, investedCapital: 0, shares: 0, cashResidual: allocation * request.startingCapital, dividendsReceived: 0, corporateActionIds: [], terminalMarketValue: 0, finalValue: allocation * request.startingCapital, warnings: ["MISSING_EXECUTION_PRICE"] };
  const grossCapital = allocation * request.startingCapital;
  const shares = Math.floor(grossCapital / (execution.price * (1 + request.transactionCostRate)));
  const investedCapital = shares * execution.price;
  const cashResidual = grossCapital - investedCapital - investedCapital * request.transactionCostRate;
  const initial: Holding = { securityId: security.securityId, shares, averageCost: execution.price, cash: 0, status: "active", rightsEntitlements: 0 };
  let holdings: Holding[] = [initial];
  let dividendsReceived = 0;
  const appliedCorporateActionIds: string[] = [];
  const endTimestamp = parseDate(request.endDate, "endDate");
  const executionTimestamp = parseDate(execution.date, "executionDate");
  const eventDates = new Set<string>();
  for (const item of dataset.securities) {
    for (const dividend of item.dividends) {
      const date = eventDate(dividend.paymentDate ?? dividend.declaredDate ?? "", dividend.financialYear);
      const timestamp = Date.parse(date);
      if (timestamp > executionTimestamp && timestamp <= endTimestamp) eventDates.add(date);
    }
    for (const action of item.corporateActions) {
      const timestamp = Date.parse(action.effectiveDate);
      if (timestamp > executionTimestamp && timestamp <= endTimestamp) eventDates.add(action.effectiveDate);
    }
  }
  for (const date of [...eventDates].sort()) {
    const timestamp = Date.parse(date);
    for (const item of dataset.securities) {
      const dividend = item.dividends.filter((candidate) => Date.parse(eventDate(candidate.paymentDate ?? candidate.declaredDate ?? "", candidate.financialYear)) === timestamp);
      for (const candidate of dividend) {
        const holding = holdings.find((entry) => entry.securityId === item.securityId && entry.status === "active");
        if (holding && holding.shares > 0) {
          const received = holding.shares * candidate.amountPerShare;
          holding.cash += received;
          dividendsReceived += received;
        }
      }
    }
    for (const item of dataset.securities) {
      for (const action of item.corporateActions.filter((candidate) => candidate.effectiveDate === date)) {
        if (!holdings.some((holding) => holding.securityId === action.securityId && holding.status === "active")) continue;
        const transformed = applyCorporateActions(holdings, [action], { asOf: date, subscribeRights: false, preserveRightsCash: false });
        holdings = transformed.holdings;
        warnings.push(...transformed.warnings);
        appliedCorporateActionIds.push(action.id);
      }
    }
  }
  let terminalMarketValue = 0;
  let terminalPrice: number | undefined;
  for (const holding of holdings) {
    if (holding.status !== "active" || holding.shares <= 0) { terminalMarketValue += holding.shares * 0; continue; }
    const terminal = dataset.securities.find((item) => item.securityId === holding.securityId);
    const price = terminal ? priceOnOrBefore(terminal, request.endDate, execution.date) : undefined;
    if (!price) { warnings.push(`MISSING_TERMINAL_PRICE:${holding.securityId}`); continue; }
    terminalMarketValue += holding.shares * price.price;
    if (holding.securityId === security.securityId) terminalPrice = price.price;
    if (price.price <= 0) warnings.push(`INVALID_TERMINAL_PRICE:${holding.securityId}`);
  }
  // Dividends and cash consideration are already held as cash on the
  // transformed holdings. Add them once, at the portfolio cash valuation.
  const finalValue = cashResidual + terminalMarketValue + holdings.reduce((sum, holding) => sum + holding.cash, 0);
  const totalReturn = investedCapital > 0 ? finalValue / investedCapital - 1 : undefined;
  const cagr = investedCapital > 0 && finalValue >= 0 ? annualizedCagr(investedCapital, finalValue, execution.date, request.endDate) : undefined;
  return { securityId: security.securityId, companyId: security.companyId, sectorId: security.sectorId, selection: "selected", reason: "Selected by the point-in-time model signal", allocation, investedCapital, shares, executionPrice: execution.price, cashResidual, dividendsReceived, corporateActionIds: appliedCorporateActionIds, ...(terminalPrice !== undefined ? { terminalPrice } : {}), terminalMarketValue, finalValue, ...(totalReturn !== undefined ? { totalReturn } : {}), ...(cagr !== undefined ? { cagr, realCagr: (cagr + 1) / (1 + request.inflationRate) - 1 } : {}), warnings };
}

function buildDailyValues(selected: HistoricalSecurityData[], positions: BacktestPositionResult[], request: BacktestRequest): { values: { date: string; value: number }[]; warnings: string[] } {
  const dates = new Set<string>();
  const warnings: string[] = [];
  for (const security of selected) for (const price of security.prices) if (Date.parse(price.tradingDate) >= Date.parse(request.executionDate) && Date.parse(price.tradingDate) <= Date.parse(request.endDate)) dates.add(price.tradingDate);
  const sortedDates = [...dates].sort();
  const values = sortedDates.map((date) => {
    let value = positions.filter((position) => position.selection === "selected").reduce((sum, position) => {
      const security = selected.find((item) => item.securityId === position.securityId);
      const price = security ? priceOnOrBefore(security, date) : undefined;
      if (!price) return sum;
      const source = security?.prices.find((candidate) => candidate.tradingDate === price.date);
      if (source?.adjustedClose === undefined) warnings.push(`UNADJUSTED_DAILY_PRICE:${position.securityId}`);
      return sum + position.shares * (source?.adjustedClose ?? price.price);
    }, 0);
    value += positions.filter((position) => position.selection === "selected").reduce((sum, position) => sum + position.cashResidual, 0);
    return { date, value };
  });
  return { values, warnings: [...new Set(warnings)] };
}

export function runBacktest(request: BacktestRequest, dataset: BacktestDataset, modelConfig: ModelConfig): BacktestResult {
  validateRequest(request);
  const analysisTimestamp = parseDate(request.analysisDate, "analysisDate");
  const benchmark = dataset.benchmarks.find((candidate) => candidate.benchmarkId === request.benchmarkId);
  if (!benchmark) throw new BacktestError(`Benchmark ${request.benchmarkId} is not present in the historical dataset`);
  const selections: BacktestSelection[] = [];
  const selectedData: HistoricalSecurityData[] = [];
  const warnings: string[] = [];
  const limitations: string[] = [];
  for (const security of dataset.securities) {
    const snapshot = latestSnapshot(security, analysisTimestamp);
    if (!snapshot) {
      selections.push({ securityId: security.securityId, companyId: security.companyId, sectorId: security.sectorId, selection: "rejected", reason: "No model input snapshot was available by the analysis date", reasonCodes: ["INSUFFICIENT_HISTORICAL_DATA"] });
      limitations.push(`No point-in-time model snapshot for ${security.securityId}`);
      continue;
    }
    const input = { ...snapshot.input, generatedAt: snapshot.input.generatedAt ?? snapshot.availableAt };
    try {
      const recommendation = evaluateModel(input, { ...modelConfig, requiredCagr: request.targetCagr, inflationRate: request.inflationRate }, input.generatedAt);
      const selected = recommendation.decision.classification === "BUY";
      const entry: BacktestSelection = { securityId: security.securityId, companyId: security.companyId, sectorId: security.sectorId, selection: selected ? "selected" : "rejected", reason: recommendation.decision.explanation, reasonCodes: [...recommendation.decision.reasonCodes], recommendation, ...(security.riskWeight !== undefined ? { riskWeight: security.riskWeight } : {}) };
      selections.push(entry);
      if (selected) selectedData.push(security);
    } catch (error) {
      selections.push({ securityId: security.securityId, companyId: security.companyId, sectorId: security.sectorId, selection: "rejected", reason: error instanceof Error ? error.message : "Model evaluation failed", reasonCodes: ["MODEL_EVALUATION_FAILED"] });
      limitations.push(`Model evaluation failed for ${security.securityId}`);
    }
  }
  const allocations = calculateAllocations(selectedData, request);
  const positions: BacktestPositionResult[] = selections.map((selection) => {
    const security = dataset.securities.find((candidate) => candidate.securityId === selection.securityId);
    if (!security || selection.selection !== "selected") return { securityId: selection.securityId, companyId: selection.companyId, sectorId: selection.sectorId, selection: "rejected", reason: selection.reason, allocation: 0, investedCapital: 0, shares: 0, cashResidual: 0, dividendsReceived: 0, corporateActionIds: [], terminalMarketValue: 0, finalValue: 0, warnings: [] };
    return simulatePosition(security, dataset, allocations.get(security.securityId) ?? 0, request);
  });
  const finalValue = positions.filter((position) => position.selection === "selected").reduce((sum, position) => sum + position.finalValue, 0);
  const benchmarkStart = benchmark.prices.filter((price) => Date.parse(price.tradingDate) >= parseDate(request.executionDate, "executionDate")).sort((left, right) => left.tradingDate.localeCompare(right.tradingDate))[0];
  const benchmarkEnd = benchmark.prices.filter((price) => Date.parse(price.tradingDate) <= parseDate(request.endDate, "endDate")).sort((left, right) => left.tradingDate.localeCompare(right.tradingDate)).at(-1);
  if (!benchmarkStart || !benchmarkEnd || benchmarkStart.close <= 0 || benchmarkEnd.close <= 0) throw new BacktestError("Benchmark data does not cover the requested execution and end dates");
  const benchmarkFinalValue = request.startingCapital * benchmarkEnd.close / benchmarkStart.close;
  const benchmarkComparisons = dataset.benchmarks.flatMap((candidate) => {
    const start = candidate.prices.filter((price) => Date.parse(price.tradingDate) >= parseDate(request.executionDate, "executionDate")).sort((left, right) => left.tradingDate.localeCompare(right.tradingDate))[0];
    const end = candidate.prices.filter((price) => Date.parse(price.tradingDate) <= parseDate(request.endDate, "endDate")).sort((left, right) => left.tradingDate.localeCompare(right.tradingDate)).at(-1);
    if (!start || !end || start.close <= 0 || end.close <= 0) return [];
    const final = request.startingCapital * end.close / start.close;
    return [{ benchmarkId: candidate.benchmarkId, ...(candidate.code ? { code: candidate.code } : {}), startDate: start.tradingDate, endDate: end.tradingDate, startValue: start.close, endValue: end.close, finalValue: final, cagr: annualizedCagr(request.startingCapital, final, start.tradingDate, end.tradingDate) }];
  });
  for (const code of ["NIFTY50_TRI", "SENSEX_TRI"] as const) {
    if (!benchmarkComparisons.some((comparison) => comparison.code === code)) limitations.push(`${code} does not cover the requested backtest window`);
  }
  const daily = buildDailyValues(selectedData, positions, request);
  warnings.push(...daily.warnings, ...positions.flatMap((position) => position.warnings));
  if (selectedData.length === 0) limitations.push("No BUY signals were available at the historical analysis date");
  const metrics = calculateMetrics({ startingCapital: request.startingCapital, finalValue, benchmarkFinalValue, executionDate: request.executionDate, endDate: request.endDate, targetCagr: request.targetCagr, inflationRate: request.inflationRate, positions, dailyValues: daily.values });
  const beatBenchmark = request.requireBenchmarkOutperformance === false || metrics.cagr > metrics.benchmarkCagr;
  const works = metrics.cagr >= request.targetCagr && beatBenchmark;
  const verdictExplanation = `Portfolio CAGR ${ (metrics.cagr * 100).toFixed(2) }% vs target ${(request.targetCagr * 100).toFixed(2)}%; benchmark CAGR ${(metrics.benchmarkCagr * 100).toFixed(2)}%.`;
  return { request, modelConfig: { ...modelConfig, requiredCagr: request.targetCagr, inflationRate: request.inflationRate }, selections, positions, metrics, benchmarkComparisons, modelVerdict: works ? "WORKS" : "DOES_NOT_WORK", verdictExplanation, warnings: [...new Set(warnings)], limitations: [...new Set(limitations)] };
}
