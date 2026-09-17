import type { BacktestDataset, BacktestRequest, BacktestResult } from "../backtesting/types.js";
import type { ModelConfig } from "../model/types.js";

export type RollingFrequency = "monthly" | "quarterly";
export type ExclusionType = "best-stock" | "top-three-stocks" | "best-sector";

export interface RobustnessCohort {
  id: string;
  label: string;
  request: BacktestRequest;
}

export interface RobustnessRequest {
  cohorts: RobustnessCohort[];
  dataset: BacktestDataset;
  modelConfig: ModelConfig;
  exclusions?: ExclusionType[];
}

export interface CohortCoverage {
  datasetUniverseMode: "historical-reconstructed" | "current-survivor" | "mixed" | "unspecified";
  candidateCount: number;
  candidatesWithPointInTimeSnapshot: number;
  candidatesWithExecutionPrice: number;
  candidatesWithTerminalPrice: number;
  incompleteCandidateCount: number;
  survivorshipWarning: boolean;
  limitations: string[];
}

export interface CohortResult {
  cohort: RobustnessCohort;
  status: "completed" | "failed" | "cancelled";
  result?: BacktestResult;
  benchmarkCode?: "NIFTY50_TRI" | "SENSEX_TRI";
  coverage: CohortCoverage;
  error?: string;
}

export interface ExclusionResult {
  type: ExclusionType;
  sourceCohortId: string;
  excludedSecurityIds: string[];
  excludedSectorIds: string[];
  status: "completed" | "failed";
  result?: BacktestResult;
  error?: string;
}

export interface RobustnessSummary {
  cohortCount: number;
  completedCohortCount: number;
  failedCohortCount: number;
  medianPortfolioCagr?: number;
  medianAlpha?: number;
  worstCohortId?: string;
  worstCohortCagr?: number;
  bestCohortId?: string;
  bestCohortCagr?: number;
  percentageCohortsMeetingTarget: number;
  percentageCohortsBeatingNifty: number;
  percentageCohortsBeatingSensex: number;
  survivorshipWarning: boolean;
  limitations: string[];
}

export interface RobustnessResult {
  request: RobustnessRequest;
  cohorts: CohortResult[];
  exclusions: ExclusionResult[];
  summary: RobustnessSummary;
}

export interface RobustnessProgress {
  completed: number;
  total: number;
  label: string;
}
