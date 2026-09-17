import type { ModelSignal, SignalClassification } from "../storage/types.js";

export interface RecommendationStateSnapshot extends Record<string, unknown> {
  companyId: string;
  companyName?: string;
  classification: SignalClassification;
  confidence: ModelSignal["confidence"];
  reasonCodes: string[];
  expectedNominalCagr?: number;
  expectedRealCagr?: number;
  dividendEligible?: boolean;
  dividendYield?: number;
  dividendGrowth?: number;
  dividendGrowthTrend?: string;
  valuationMarginOfSafety?: number;
  currentMultiple?: number;
  earningsGrowthRate?: number;
  revenueGrowthRate?: number;
  profitGrowthRate?: number;
  debtToEquity?: number;
  roce?: number;
  sectorOutlook?: string;
  dataConfidence: ModelSignal["confidence"];
  staleFields: string[];
  conflictingFields: string[];
  unverifiedFields: string[];
  scenarioDownsideCagr?: number;
  scenarioBaseCagr?: number;
  scenarioUpsideCagr?: number;
  explanation: string;
  sourceRecordIds: string[];
}

export interface RecommendationChange {
  field: string;
  previous: unknown;
  next: unknown;
  material: boolean;
}

export interface RecommendationComparison {
  companyId: string;
  previous?: RecommendationStateSnapshot;
  next: RecommendationStateSnapshot;
  changes: RecommendationChange[];
  priority: "critical" | "high" | "medium" | "informational";
  eventType: "RECOMMENDATION_INITIALIZED" | "RECOMMENDATION_CHANGED";
}
