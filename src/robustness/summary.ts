import type { BacktestResult } from "../backtesting/types.js";
import type { CohortCoverage, CohortResult, RobustnessSummary } from "./types.js";

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : sorted[middle];
}

function rate(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

export function coverageForCohort(dataset: { securities: Array<{ modelSnapshots: Array<{ availableAt: string }>; prices: Array<{ tradingDate: string }>; listedFrom?: string; listedTo?: string }>; universeMode?: CohortCoverage["datasetUniverseMode"] }, request: { analysisDate: string; executionDate: string; endDate: string }): CohortCoverage {
  const analysis = Date.parse(request.analysisDate);
  const execution = Date.parse(request.executionDate);
  const end = Date.parse(request.endDate);
  const withSnapshot = dataset.securities.filter((security) => security.modelSnapshots.some((snapshot) => Date.parse(snapshot.availableAt) <= analysis)).length;
  const withExecution = dataset.securities.filter((security) => security.prices.some((price) => Date.parse(price.tradingDate) >= execution && Date.parse(price.tradingDate) <= end)).length;
  const withTerminal = dataset.securities.filter((security) => security.prices.some((price) => Date.parse(price.tradingDate) >= execution && Date.parse(price.tradingDate) <= end && Date.parse(price.tradingDate) <= end)).length;
  const limitations: string[] = [];
  const universeMode = dataset.universeMode ?? "unspecified";
  if (universeMode !== "historical-reconstructed") limitations.push("Historical universe is not explicitly marked as reconstructed; survivorship bias may remain.");
  if (universeMode === "historical-reconstructed" && dataset.securities.some((security) => !security.listedFrom)) limitations.push("Some securities lack listing lifecycle dates; historical-universe membership may be incomplete.");
  if (withSnapshot < dataset.securities.length) limitations.push(`${dataset.securities.length - withSnapshot} candidates lack a point-in-time model snapshot.`);
  if (withExecution < dataset.securities.length) limitations.push(`${dataset.securities.length - withExecution} candidates lack an execution-period price.`);
  if (withTerminal < dataset.securities.length) limitations.push(`${dataset.securities.length - withTerminal} candidates lack an end-period price.`);
  return { datasetUniverseMode: universeMode, candidateCount: dataset.securities.length, candidatesWithPointInTimeSnapshot: withSnapshot, candidatesWithExecutionPrice: withExecution, candidatesWithTerminalPrice: withTerminal, incompleteCandidateCount: dataset.securities.length - Math.min(withSnapshot, withExecution, withTerminal), survivorshipWarning: universeMode !== "historical-reconstructed", limitations };
}

export function summarizeCohorts(results: CohortResult[]): RobustnessSummary {
  const completed = results.filter((cohort): cohort is CohortResult & { result: BacktestResult } => cohort.status === "completed" && cohort.result !== undefined);
  const cagr = completed.map((cohort) => cohort.result.metrics.cagr);
  const alpha = completed.map((cohort) => cohort.result.metrics.alpha);
  const medianCagr = median(cagr);
  const medianAlpha = median(alpha);
  const best = completed.reduce((current, candidate) => !current || candidate.result.metrics.cagr > current.result.metrics.cagr ? candidate : current, undefined as (CohortResult & { result: BacktestResult }) | undefined);
  const worst = completed.reduce((current, candidate) => !current || candidate.result.metrics.cagr < current.result.metrics.cagr ? candidate : current, undefined as (CohortResult & { result: BacktestResult }) | undefined);
  const limitations = [...new Set(results.flatMap((cohort) => cohort.coverage.limitations))];
  return {
    cohortCount: results.length, completedCohortCount: completed.length, failedCohortCount: results.filter((cohort) => cohort.status === "failed").length,
    ...(medianCagr !== undefined ? { medianPortfolioCagr: medianCagr } : {}), ...(medianAlpha !== undefined ? { medianAlpha } : {}),
    ...(worst ? { worstCohortId: worst.cohort.id, worstCohortCagr: worst.result.metrics.cagr } : {}), ...(best ? { bestCohortId: best.cohort.id, bestCohortCagr: best.result.metrics.cagr } : {}),
    percentageCohortsMeetingTarget: rate(completed.filter((cohort) => cohort.result.metrics.cagr >= cohort.cohort.request.targetCagr).length, completed.length),
    percentageCohortsBeatingNifty: rate(completed.filter((cohort) => cohort.benchmarkCode === "NIFTY50_TRI" && cohort.result.metrics.alpha > 0).length, completed.filter((cohort) => cohort.benchmarkCode === "NIFTY50_TRI").length),
    percentageCohortsBeatingSensex: rate(completed.filter((cohort) => cohort.benchmarkCode === "SENSEX_TRI" && cohort.result.metrics.alpha > 0).length, completed.filter((cohort) => cohort.benchmarkCode === "SENSEX_TRI").length),
    survivorshipWarning: results.some((cohort) => cohort.coverage.survivorshipWarning), limitations
  };
}
