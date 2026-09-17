import { createAuditEvent } from "../audit/service.js";
import type { Backtest, BacktestPosition, WorkspaceRepository } from "../storage/index.js";
import type { BacktestResult } from "./types.js";

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function persistBacktestResult(
  repository: WorkspaceRepository,
  result: BacktestResult,
  modelRunId: string,
  benchmarkCode: Backtest["benchmarkCode"],
  now = new Date().toISOString()
): Promise<Backtest> {
  const backtest: Backtest = {
    id: makeId("backtest"), kind: "backtest", createdAt: now, updatedAt: now, modelRunId,
    analysisDate: result.request.analysisDate, executionDate: result.request.executionDate, endDate: result.request.endDate,
    startingCapital: result.request.startingCapital, targetCagr: result.request.targetCagr, inflationRate: result.request.inflationRate,
    benchmarkCode, weightingMethod: result.request.weightingMethod, transactionCostRate: result.request.transactionCostRate, finalValue: result.metrics.finalValue,
    totalReturn: result.metrics.totalReturn, cagr: result.metrics.cagr, realCagr: result.metrics.realCagr, benchmarkCagr: result.metrics.benchmarkCagr,
    alpha: result.metrics.alpha, modelVerdict: result.modelVerdict, warnings: [...result.warnings], limitations: [...result.limitations], status: "completed"
  };
  const positions: BacktestPosition[] = result.positions.map((position) => ({
    id: makeId("backtest-position"), kind: "backtest-position", createdAt: now, updatedAt: now, backtestId: backtest.id,
    securityId: position.securityId, selection: position.selection, reason: position.reason,
    ...(position.allocation !== undefined ? { allocation: position.allocation } : {}), ...(position.investedCapital !== undefined ? { investedCapital: position.investedCapital } : {}),
    ...(position.shares !== undefined ? { shares: position.shares } : {}),
    ...(position.executionPrice !== undefined ? { executionPrice: position.executionPrice } : {}), ...(position.cashResidual !== undefined ? { cashResidual: position.cashResidual } : {}),
    ...(position.dividendsReceived !== undefined ? { dividendsReceived: position.dividendsReceived } : {}), ...(position.corporateActionIds.length ? { corporateActionIds: [...position.corporateActionIds] } : {}),
    ...(position.terminalPrice !== undefined ? { terminalPrice: position.terminalPrice } : {}), ...(position.terminalMarketValue !== undefined ? { terminalMarketValue: position.terminalMarketValue } : {}),
    ...(position.finalValue !== undefined ? { finalValue: position.finalValue } : {}), ...(position.totalReturn !== undefined ? { totalReturn: position.totalReturn } : {}),
    ...(position.cagr !== undefined ? { cagr: position.cagr } : {}), ...(position.realCagr !== undefined ? { realCagr: position.realCagr } : {}), ...(position.warnings.length ? { warnings: [...position.warnings] } : {})
  }));
  const audit = createAuditEvent({
    now, eventType: "backtest", action: "backtest-completed", actorType: "user", entityType: "backtest", entityId: backtest.id,
    previousState: {}, newState: { backtest, metrics: result.metrics, limitations: result.limitations, warnings: result.warnings },
    reason: "Persisted a point-in-time backtest result", correlationId: backtest.id
  });
  await repository.putBatch([
    { store: "backtests", value: backtest },
    ...positions.map((value) => ({ store: "backtestPositions" as const, value })),
    { store: "auditEvents", value: audit }
  ]);
  return backtest;
}
