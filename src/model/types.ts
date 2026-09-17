import type { DividendAnalysis } from "../dividends/engine.js";
import type { ModelSettings, ModelSignal, SignalClassification } from "../storage/types.js";

export interface ScenarioAssumptions {
  epsGrowthRate: number;
  revenueGrowthRate: number;
  profitGrowthRate: number;
  exitMultiple: number;
  dividendGrowthRate: number;
}

export interface QualityInputs {
  balanceSheet: "acceptable" | "weak" | "excessive-leverage" | "unknown";
  fundamentals: "sound" | "weak" | "unknown";
  sectorOutlook: "supportive" | "neutral" | "unsupported" | "unknown";
  governance: "clear" | "issue" | "unknown";
  structurallyDeteriorated: boolean;
  roe?: number;
  debtToEquity?: number;
  roce?: number;
  earningsGrowthRate?: number;
  freeCashFlow?: number;
}

export interface ValuationInputs {
  currentMultiple: number;
  historicalPercentile?: number;
  marginOfSafety: number;
}

export interface DataQualityInputs {
  missingFields: string[];
  staleFields: string[];
  conflictingFields: string[];
  unverifiedFields: string[];
  sourceRecordIds: string[];
}

export interface ModelInputSnapshot {
  companyId: string;
  companyName: string;
  securityId: string;
  modelVersionId: string;
  settingsId: string;
  dataSnapshotId: string;
  generatedAt: string;
  currentPrice: number;
  currentEps: number;
  currentRevenue: number;
  currentProfit: number;
  currentAnnualDividendPerShare: number;
  expectedEpsGrowthRate: number;
  expectedRevenueGrowthRate: number;
  expectedProfitGrowthRate: number;
  exitMultiple: number;
  dividendGrowthRate: number;
  quality: QualityInputs;
  valuation: ValuationInputs;
  dataQuality: DataQualityInputs;
  dividendAnalysis: DividendAnalysis;
}

export interface ModelInput extends Omit<ModelInputSnapshot, "generatedAt"> {
  generatedAt?: string;
}

export interface ScenarioResult extends ScenarioAssumptions {
  expectedEps: number;
  expectedRevenue: number;
  expectedProfit: number;
  expectedDividends: number;
  annualDividends: number[];
  terminalPrice: number;
  totalShareholderValue: number;
  nominalCagr: number;
  realCagr: number;
}

export interface ModelCalculation {
  horizonYears: number;
  inflationRate: number;
  downside: ScenarioResult;
  base: ScenarioResult;
  upside: ScenarioResult;
}

export interface ModelDecision {
  classification: SignalClassification;
  reasonCodes: string[];
  explanation: string;
  confidence: "high" | "medium" | "low" | "unknown";
}

export interface ModelRecommendation {
  decision: ModelDecision;
  calculation: ModelCalculation;
  inputSnapshot: ModelInputSnapshot;
  generatedAt: string;
}

export interface ModelRunContext {
  modelRunId: string;
  now?: string;
}

export function modelSignalFromRecommendation(recommendation: ModelRecommendation, input: ModelInputSnapshot, context: ModelRunContext, id: string): ModelSignal {
  const now = context.now ?? recommendation.generatedAt;
  return {
    id, kind: "model-signal", createdAt: now, updatedAt: now, modelRunId: context.modelRunId, companyId: input.companyId,
    classification: recommendation.decision.classification, reasonCodes: [...recommendation.decision.reasonCodes], explanation: recommendation.decision.explanation,
    confidence: recommendation.decision.confidence, expectedNominalCagr: recommendation.calculation.base.nominalCagr, expectedRealCagr: recommendation.calculation.base.realCagr,
    modelVersionId: input.modelVersionId, settingsId: input.settingsId, dataSnapshotId: input.dataSnapshotId,
    sourceRecordIds: [...input.dataQuality.sourceRecordIds], inputSnapshot: JSON.parse(JSON.stringify(input)) as Record<string, unknown>,
    scenarioSnapshot: JSON.parse(JSON.stringify(recommendation.calculation)) as Record<string, unknown>
  };
}

export function settingsToModelConfig(settings: ModelSettings): ModelConfig {
  return {
    requiredCagr: settings.requiredCagr, inflationRate: settings.inflationRate, horizonYears: settings.horizonYears,
    ...(settings.minimumRoce !== undefined ? { minimumRoce: settings.minimumRoce } : {}),
    ...(settings.maximumDebtToEquity !== undefined ? { maximumDebtToEquity: settings.maximumDebtToEquity } : {}),
    ...(settings.minimumEarningsGrowth !== undefined ? { minimumEarningsGrowth: settings.minimumEarningsGrowth } : {}),
    valuationMarginOfSafety: settings.valuationMarginOfSafety ?? 0.1, materiallyBelowHurdleBy: settings.materiallyBelowHurdleBy ?? 0.05,
    downsideEpsGrowthAdjustment: settings.downsideEpsGrowthAdjustment ?? 0.05, upsideEpsGrowthAdjustment: settings.upsideEpsGrowthAdjustment ?? 0.05,
    downsideExitMultipleFactor: settings.downsideExitMultipleFactor ?? 0.8, upsideExitMultipleFactor: settings.upsideExitMultipleFactor ?? 1.1
  };
}

export interface ModelConfig {
  requiredCagr: number;
  inflationRate: number;
  horizonYears: number;
  minimumRoce?: number;
  maximumDebtToEquity?: number;
  minimumEarningsGrowth?: number;
  valuationMarginOfSafety: number;
  materiallyBelowHurdleBy: number;
  downsideEpsGrowthAdjustment: number;
  upsideEpsGrowthAdjustment: number;
  downsideExitMultipleFactor: number;
  upsideExitMultipleFactor: number;
}
