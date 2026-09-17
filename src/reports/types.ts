import type { BacktestResult } from "../backtesting/types.js";
import type { DividendAnalysis } from "../dividends/engine.js";
import type { ModelRecommendation } from "../model/types.js";
import type { PortfolioAnalytics, PortfolioPlan } from "../portfolio/types.js";
import type { AuditEvent, CorporateAction, ModelSettings, ModelSignal, ModelVersion, Portfolio, PortfolioPosition, Report, Security, SourceRecord, WorkspaceRepository } from "../storage/index.js";

export interface ReportSourceEvidence {
  id: string;
  provider: string;
  sourceUrl?: string;
  retrievalTimestamp: string;
  sourceDate?: string;
  freshnessState: SourceRecord["freshnessState"];
  confidence: SourceRecord["confidence"];
  validationStatus: SourceRecord["validationStatus"];
  sourceTier?: number;
  verificationStatus?: string;
  adjustment?: string;
}

export interface ReportStockReference {
  securityId?: string;
  companyId?: string;
  symbol?: string;
  name?: string;
  reason: string;
  reasonCodes: string[];
}

export interface ReportCorporateAction {
  id: string;
  securityId: string;
  actionType: CorporateAction["actionType"];
  effectiveDate: string;
  details: Record<string, unknown>;
  sourceRecordId: string;
}

export interface ReportEvidence {
  reportVersion: number;
  generatedAt: string;
  modelVersionId?: string;
  modelVersion?: Pick<ModelVersion, "id" | "name" | "description" | "status">;
  settingsId?: string;
  settingsVersion?: number;
  dataSnapshotId?: string;
  sources: ReportSourceEvidence[];
  selectedStocks: ReportStockReference[];
  rejectedStocks: ReportStockReference[];
  recommendationReasons: Array<{ entityId: string; classification?: string; reason: string; reasonCodes: string[] }>;
  portfolioCalculations?: Record<string, unknown>;
  benchmarkComparison?: Record<string, unknown>;
  limitations: string[];
  corporateActions: ReportCorporateAction[];
  auditEventIds: string[];
}

export interface StockAnalysisReportContent extends ReportEvidence {
  reportKind: "stock-analysis";
  subject: { companyId: string; companyName?: string; securityId?: string; symbol?: string };
  recommendation: { classification: string; confidence: string; explanation: string; reasonCodes: string[] };
  inputSnapshot?: Record<string, unknown>;
  calculation?: Record<string, unknown>;
}

export interface PortfolioReportContent extends ReportEvidence {
  reportKind: "portfolio";
  portfolio: Portfolio;
  positions: PortfolioPosition[];
  plan?: PortfolioPlan;
  analytics?: PortfolioAnalytics;
}

export interface BacktestReportContent extends ReportEvidence {
  reportKind: "backtest";
  result: BacktestResult;
}

export interface DividendReportContent extends ReportEvidence {
  reportKind: "dividend";
  subject: { securityId: string; symbol?: string; companyId?: string; companyName?: string };
  analysis: DividendAnalysis;
  dividendRecordIds: string[];
}

export interface ModelValidationReportContent extends ReportEvidence {
  reportKind: "model-validation";
  validation: Record<string, unknown>;
}

export type AnyReportContent = StockAnalysisReportContent | PortfolioReportContent | BacktestReportContent | DividendReportContent | ModelValidationReportContent;

export interface ReportBuildContext {
  repository: WorkspaceRepository;
  now?: string;
  title?: string;
  modelVersionId?: string;
  settingsId?: string;
  dataSnapshotId?: string;
  sourceRecordIds?: string[];
  relatedEntityIds?: string[];
  corporateActionSecurityIds?: string[];
  auditEventIds?: string[];
  limitations?: string[];
  benchmarkComparison?: Record<string, unknown>;
}

export interface StockAnalysisReportInput extends ReportBuildContext {
  signal: ModelSignal;
  recommendation?: ModelRecommendation;
}

export interface PortfolioReportInput extends ReportBuildContext {
  portfolio: Portfolio;
  plan?: PortfolioPlan;
  analytics?: PortfolioAnalytics;
  positions?: PortfolioPosition[];
}

export interface BacktestReportInput extends ReportBuildContext {
  result: BacktestResult;
  backtestId?: string;
}

export interface DividendReportInput extends ReportBuildContext {
  securityId: string;
  analysis: DividendAnalysis;
  dividendIds?: string[];
}

export interface ModelValidationReportInput extends ReportBuildContext {
  validation: Record<string, unknown>;
  selectedStocks?: ReportStockReference[];
  rejectedStocks?: ReportStockReference[];
  recommendationReasons?: Array<{ entityId: string; classification?: string; reason: string; reasonCodes: string[] }>;
}

export interface ReportBuildResult {
  report: Report;
  content: AnyReportContent;
  sourceRecords: SourceRecord[];
  auditEvents: AuditEvent[];
  modelSettings?: ModelSettings;
  modelVersion?: ModelVersion;
  security?: Security;
}
