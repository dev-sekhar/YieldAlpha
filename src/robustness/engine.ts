import { runBacktest } from "../backtesting/engine.js";
import type { BacktestDataset, HistoricalSecurityData } from "../backtesting/types.js";
import type { ModelConfig } from "../model/types.js";
import { coverageForCohort, summarizeCohorts } from "./summary.js";
import type { CohortResult, ExclusionResult, ExclusionType, RobustnessProgress, RobustnessRequest, RobustnessResult } from "./types.js";

export class RobustnessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RobustnessError";
  }
}

function isHistoricalMember(security: HistoricalSecurityData, analysisDate: string): boolean {
  const analysis = Date.parse(analysisDate);
  const listedFrom = security.listedFrom ? Date.parse(security.listedFrom) : Number.NEGATIVE_INFINITY;
  const listedTo = security.listedTo ? Date.parse(security.listedTo) : Number.POSITIVE_INFINITY;
  return (!Number.isFinite(listedFrom) || listedFrom <= analysis) && (!Number.isFinite(listedTo) || listedTo >= analysis);
}

function filterDataset(dataset: BacktestDataset, analysisDate: string, excluded: Set<string>): BacktestDataset {
  return { ...dataset, securities: dataset.securities.filter((security) => !excluded.has(security.securityId) && isHistoricalMember(security, analysisDate)) };
}

function bestExclusions(result: CohortResult): { type: ExclusionType; securities: string[]; sectors: string[] }[] {
  if (!result.result) return [];
  const positions = result.result.positions.filter((position) => position.selection === "selected" && position.cagr !== undefined).sort((left, right) => (right.cagr ?? -1) - (left.cagr ?? -1));
  const best = positions[0];
  const topThree = positions.slice(0, 3);
  const sectorReturns = new Map<string, number[]>();
  for (const position of positions) sectorReturns.set(position.sectorId, [...(sectorReturns.get(position.sectorId) ?? []), position.cagr ?? -1]);
  const bestSector = [...sectorReturns.entries()].sort((left, right) => (right[1].reduce((sum, value) => sum + value, 0) / right[1].length) - (left[1].reduce((sum, value) => sum + value, 0) / left[1].length))[0];
  return [
    ...(best ? [{ type: "best-stock" as const, securities: [best.securityId], sectors: [] }] : []),
    ...(topThree.length > 0 ? [{ type: "top-three-stocks" as const, securities: topThree.map((position) => position.securityId), sectors: [] }] : []),
    ...(bestSector ? [{ type: "best-sector" as const, securities: [], sectors: [bestSector[0]] }] : [])
  ];
}

export function runRobustness(request: RobustnessRequest, options: { isCancelled?: () => boolean; onProgress?: (progress: RobustnessProgress) => void } = {}): RobustnessResult {
  if (request.cohorts.length === 0) throw new RobustnessError("At least one robustness cohort is required");
  const cohortResults: CohortResult[] = [];
  const exclusions: ExclusionResult[] = [];
  const total = request.cohorts.length;
  for (let index = 0; index < request.cohorts.length; index += 1) {
    if (options.isCancelled?.()) {
      cohortResults.push(...request.cohorts.slice(index).map((cohort): CohortResult => ({ cohort, status: "cancelled", coverage: coverageForCohort(request.dataset, cohort.request) })));
      break;
    }
    const cohort = request.cohorts[index];
    if (!cohort) continue;
    const cohortDataset = filterDataset(request.dataset, cohort.request.analysisDate, new Set());
    const coverage = coverageForCohort(cohortDataset, cohort.request);
    try {
      const result = runBacktest(cohort.request, cohortDataset, request.modelConfig);
      const benchmarkCode = cohortDataset.benchmarks.find((candidate) => candidate.benchmarkId === cohort.request.benchmarkId)?.code;
      cohortResults.push({ cohort, status: "completed", result, coverage, ...(benchmarkCode ? { benchmarkCode } : {}) });
      for (const exclusion of bestExclusions({ cohort, status: "completed", result, coverage })) {
        if (!request.exclusions?.includes(exclusion.type)) continue;
        if (options.isCancelled?.()) break;
        const excluded = new Set(exclusion.securities);
        const excludedSectorIds = new Set(exclusion.sectors);
        const excludedDataset = { ...cohortDataset, securities: cohortDataset.securities.filter((security) => !excluded.has(security.securityId) && !excludedSectorIds.has(security.sectorId)) };
        try { exclusions.push({ type: exclusion.type, sourceCohortId: cohort.id, excludedSecurityIds: exclusion.securities, excludedSectorIds: exclusion.sectors, status: "completed", result: runBacktest(cohort.request, excludedDataset, request.modelConfig) }); }
        catch (error) { exclusions.push({ type: exclusion.type, sourceCohortId: cohort.id, excludedSecurityIds: exclusion.securities, excludedSectorIds: exclusion.sectors, status: "failed", error: error instanceof Error ? error.message : "Exclusion run failed" }); }
      }
    } catch (error) {
      cohortResults.push({ cohort, status: "failed", coverage, error: error instanceof Error ? error.message : "Cohort run failed" });
    }
    options.onProgress?.({ completed: index + 1, total, label: cohort.label });
  }
  return { request, cohorts: cohortResults, exclusions, summary: summarizeCohorts(cohortResults) };
}
