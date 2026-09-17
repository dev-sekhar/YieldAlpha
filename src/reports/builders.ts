import { saveReportVersion } from "../audit/versioning.js";
import type { BacktestSelection } from "../backtesting/types.js";
import type { ModelRecommendation } from "../model/types.js";
import type { PortfolioAllocationLine } from "../portfolio/types.js";
import type { AuditEvent, Company, CorporateAction, ModelSettings, ModelSignal, ModelVersion, PortfolioPosition, Report, Security, SourceRecord, WorkspaceRepository } from "../storage/index.js";
import type {
  AnyReportContent, BacktestReportContent, BacktestReportInput, DividendReportContent, DividendReportInput, ModelValidationReportContent,
  ModelValidationReportInput, PortfolioReportContent, PortfolioReportInput, ReportBuildContext, ReportBuildResult, ReportCorporateAction,
  ReportEvidence, ReportStockReference, StockAnalysisReportContent, StockAnalysisReportInput
} from "./types.js";

const asRecord = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const asString = (value: unknown): string | undefined => typeof value === "string" && value.length > 0 ? value : undefined;
const unique = (values: string[]): string[] => [...new Set(values.filter((value) => value.length > 0))];
const optional = <T>(key: string, value: T | undefined): Record<string, T> => value === undefined ? {} : { [key]: value };

async function nextReportVersion(repository: WorkspaceRepository, reportType: Report["reportType"], title: string): Promise<number> {
  const reports = await repository.getAll("reports");
  return Math.max(0, ...reports.filter((report) => report.reportType === reportType && report.title === title).map((report) => report.version)) + 1;
}

async function buildEvidence(context: ReportBuildContext, input: {
  reportType: Report["reportType"];
  title: string;
  selectedStocks?: ReportStockReference[];
  rejectedStocks?: ReportStockReference[];
  recommendationReasons?: ReportEvidence["recommendationReasons"];
  limitations?: string[];
  sourceRecordIds?: string[];
  relatedEntityIds?: string[];
  corporateActionSecurityIds?: string[];
}): Promise<{ evidence: ReportEvidence; sourceRecords: SourceRecord[]; auditEvents: AuditEvent[]; settings?: ModelSettings; model?: ModelVersion; corporateActions: CorporateAction[] }> {
  const now = context.now ?? new Date().toISOString();
  const relatedEntityIds = unique([...(context.relatedEntityIds ?? []), ...(input.relatedEntityIds ?? [])]);
  const securityIds = new Set(unique([...(context.corporateActionSecurityIds ?? []), ...(input.corporateActionSecurityIds ?? [])]));
  const sourceIds = unique([...(context.sourceRecordIds ?? []), ...(input.sourceRecordIds ?? [])]);
  const allSources = await context.repository.getAll("sourceRecords");
  const sourceRecords = allSources.filter((source) => sourceIds.includes(source.id) || (sourceIds.length === 0 && relatedEntityIds.includes(source.subjectId)));
  const completeSourceIds = unique([...sourceIds, ...sourceRecords.map((source) => source.id)]);
  const corporateActions = (await context.repository.getAll("corporateActions")).filter((action) => securityIds.has(action.securityId) || completeSourceIds.includes(action.sourceRecordId));
  const actionSourceIds = unique(corporateActions.map((action) => action.sourceRecordId));
  const allSourcesWithActions = sourceRecords.length === 0 && actionSourceIds.length === 0 ? sourceRecords : allSources.filter((source) => completeSourceIds.includes(source.id) || actionSourceIds.includes(source.id));
  const allAudits = await context.repository.getAll("auditEvents");
  const requestedAuditIds = new Set(context.auditEventIds ?? []);
  const auditEvents = allAudits.filter((event) => requestedAuditIds.has(event.id) || relatedEntityIds.includes(event.entityId) || event.sourceRecordIds?.some((id) => completeSourceIds.includes(id)) || (context.modelVersionId !== undefined && event.modelVersionId === context.modelVersionId) || (context.settingsId !== undefined && event.settingsId === context.settingsId));
  const auditEventIds = unique([...auditEvents.map((event) => event.id), ...(context.auditEventIds ?? [])]);
  const settings = context.settingsId ? await context.repository.get("modelSettings", context.settingsId) : undefined;
  const model = context.modelVersionId ? await context.repository.get("modelVersions", context.modelVersionId) : undefined;
  const sourceEvidence = allSourcesWithActions.map((source) => ({
    id: source.id, provider: source.provider, ...optional("sourceUrl", source.sourceUrl), retrievalTimestamp: source.retrievalTimestamp,
    ...optional("sourceDate", source.sourceDate), ...optional("sourceTier", source.sourceTier), ...optional("verificationStatus", source.verificationStatus), ...optional("adjustment", source.adjustment), freshnessState: source.freshnessState, confidence: source.confidence, validationStatus: source.validationStatus
  }));
  const mappedActions: ReportCorporateAction[] = corporateActions.map((action) => ({ id: action.id, securityId: action.securityId, actionType: action.actionType, effectiveDate: action.effectiveDate, details: action.details, sourceRecordId: action.sourceRecordId }));
  const modelVersionId = context.modelVersionId ?? model?.id;
  const settingsId = context.settingsId ?? settings?.id;
  const evidence: ReportEvidence = {
    reportVersion: await nextReportVersion(context.repository, input.reportType, input.title), generatedAt: now,
    ...optional("modelVersionId", modelVersionId), ...(model ? { modelVersion: { id: model.id, name: model.name, description: model.description, status: model.status } } : {}),
    ...optional("settingsId", settingsId), ...(settings ? { settingsVersion: settings.version } : {}), ...optional("dataSnapshotId", context.dataSnapshotId),
    sources: sourceEvidence, selectedStocks: input.selectedStocks ?? [], rejectedStocks: input.rejectedStocks ?? [], recommendationReasons: input.recommendationReasons ?? [],
    ...(context.benchmarkComparison ? { benchmarkComparison: context.benchmarkComparison } : {}), limitations: unique([...(context.limitations ?? []), ...(input.limitations ?? [])]), corporateActions: mappedActions, auditEventIds
  };
  return { evidence, sourceRecords: allSourcesWithActions, auditEvents, ...(settings ? { settings } : {}), ...(model ? { model } : {}), corporateActions };
}

function reportTitle(context: ReportBuildContext, fallback: string): string {
  return context.title?.trim() || fallback;
}

function saveContent(content: AnyReportContent): Record<string, unknown> {
  return content as unknown as Record<string, unknown>;
}

async function finalize(context: ReportBuildContext, reportType: Report["reportType"], title: string, content: AnyReportContent, evidence: ReportEvidence, sourceRecords: SourceRecord[], auditEvents: AuditEvent[], reason: string): Promise<ReportBuildResult> {
  const report = await saveReportVersion(context.repository, {
    reportType, title, ...optional("modelVersionId", evidence.modelVersionId), ...optional("settingsId", evidence.settingsId), ...optional("dataSnapshotId", evidence.dataSnapshotId),
    sourceRecordIds: unique(sourceRecords.map((source) => source.id)), auditEventIds: evidence.auditEventIds, content: saveContent(content), reason
  }, context.now);
  const reportAudits = (await context.repository.getAll("auditEvents")).filter((event) => event.entityId === report.id);
  const modelSettings = evidence.settingsId ? await context.repository.get("modelSettings", evidence.settingsId) : undefined;
  const modelVersion = evidence.modelVersionId ? await context.repository.get("modelVersions", evidence.modelVersionId) : undefined;
  return { report, content, sourceRecords, auditEvents: [...auditEvents, ...reportAudits], ...(modelSettings ? { modelSettings } : {}), ...(modelVersion ? { modelVersion } : {}) };
}

function selectionReference(selection: BacktestSelection, names?: { symbol?: string; name?: string }): ReportStockReference {
  return { securityId: selection.securityId, companyId: selection.companyId, ...optional("symbol", names?.symbol), ...optional("name", names?.name), reason: selection.reason, reasonCodes: [...selection.reasonCodes] };
}

async function subjectNames(repository: WorkspaceRepository, securityId?: string, companyId?: string): Promise<{ security?: Security; company?: Company }> {
  const security = securityId ? await repository.get("securities", securityId) : undefined;
  const resolvedCompanyId = companyId ?? security?.companyId;
  const company = resolvedCompanyId ? await repository.get("companies", resolvedCompanyId) : undefined;
  return { ...(security ? { security } : {}), ...(company ? { company } : {}) };
}

export async function buildStockAnalysisReport(input: StockAnalysisReportInput): Promise<ReportBuildResult> {
  const signal = input.signal;
  const snapshot = asRecord(signal.inputSnapshot);
  const securityId = asString(snapshot?.securityId);
  const names = await subjectNames(input.repository, securityId, signal.companyId);
  const title = reportTitle(input, `Stock analysis — ${names.security?.symbol ?? names.company?.displayName ?? signal.companyId}`);
  const sourceRecordIds = unique([...(signal.sourceRecordIds ?? []), ...((asRecord(snapshot?.dataQuality)?.sourceRecordIds as string[] | undefined) ?? [])]);
  const modelVersionId = input.modelVersionId ?? signal.modelVersionId;
  const settingsId = input.settingsId ?? signal.settingsId;
  const context: ReportBuildContext = { ...input, ...optional("modelVersionId", modelVersionId), ...optional("settingsId", settingsId), ...optional("dataSnapshotId", input.dataSnapshotId ?? signal.dataSnapshotId), sourceRecordIds, relatedEntityIds: unique([signal.id, signal.companyId, signal.modelRunId, ...(securityId ? [securityId] : [])]), corporateActionSecurityIds: securityId ? [securityId] : [] };
  const recommendation = input.recommendation;
  const reason = recommendation?.decision.explanation ?? signal.explanation;
  const reference: ReportStockReference = { ...optional("securityId", securityId), companyId: signal.companyId, ...optional("symbol", names.security?.symbol), ...optional("name", names.company?.displayName), reason, reasonCodes: [...signal.reasonCodes] };
  const evidenceResult = await buildEvidence(context, { reportType: "stock", title, selectedStocks: signal.classification === "BUY" || signal.classification === "WATCH" ? [reference] : [], rejectedStocks: signal.classification === "AVOID" || signal.classification === "INSUFFICIENT_DATA" ? [reference] : [], recommendationReasons: [{ entityId: signal.companyId, classification: signal.classification, reason, reasonCodes: [...signal.reasonCodes] }], relatedEntityIds: [signal.companyId], corporateActionSecurityIds: securityId ? [securityId] : [] });
  const content: StockAnalysisReportContent = {
    ...evidenceResult.evidence, reportKind: "stock-analysis", subject: { companyId: signal.companyId, ...optional("companyName", names.company?.displayName), ...optional("securityId", securityId), ...optional("symbol", names.security?.symbol) },
    recommendation: { classification: signal.classification, confidence: signal.confidence, explanation: reason, reasonCodes: [...signal.reasonCodes] },
    ...(snapshot ? { inputSnapshot: snapshot } : {}), ...(recommendation ? { calculation: recommendation.calculation as unknown as Record<string, unknown> } : signal.scenarioSnapshot ? { calculation: signal.scenarioSnapshot } : {})
  };
  return finalize(context, "stock", title, content, evidenceResult.evidence, evidenceResult.sourceRecords, evidenceResult.auditEvents, "Generated a reproducible stock analysis report");
}

function positionReference(position: PortfolioPosition, names: { security?: Security; company?: Company }): ReportStockReference {
  return { securityId: position.securityId, ...optional("companyId", names.company?.id), ...optional("symbol", names.security?.symbol), ...optional("name", names.company?.displayName), reason: "Included in the local portfolio", reasonCodes: ["PORTFOLIO_POSITION"] };
}

async function lineReference(repository: WorkspaceRepository, line: PortfolioAllocationLine): Promise<ReportStockReference> {
  const names = await subjectNames(repository, line.securityId, line.companyId);
  return { securityId: line.securityId, companyId: line.companyId, ...optional("symbol", names.security?.symbol), ...optional("name", names.company?.displayName), reason: "Selected for portfolio allocation", reasonCodes: ["PORTFOLIO_ALLOCATION"] };
}

export async function buildPortfolioReport(input: PortfolioReportInput): Promise<ReportBuildResult> {
  const positions = input.positions ?? (await input.repository.getAll("portfolioPositions")).filter((position) => position.portfolioId === input.portfolio.id);
  const lines = input.plan?.lines ?? [];
  const lineRefs = await Promise.all(lines.map((line) => lineReference(input.repository, line)));
  const positionRefs = await Promise.all(positions.filter((position) => !lines.some((line) => line.securityId === position.securityId)).map(async (position) => positionReference(position, await subjectNames(input.repository, position.securityId))));
  const selectedStocks = [...lineRefs, ...positionRefs];
  const securityIds = positions.map((position) => position.securityId).concat(lines.map((line) => line.securityId));
  const title = reportTitle(input, `Portfolio report — ${input.portfolio.name}`);
  const context = { ...input, relatedEntityIds: unique([input.portfolio.id, ...securityIds]), corporateActionSecurityIds: unique(securityIds) };
  const evidenceResult = await buildEvidence(context, { reportType: "portfolio", title, selectedStocks, recommendationReasons: selectedStocks.map((stock) => ({ entityId: stock.securityId ?? stock.companyId ?? stock.name ?? "portfolio", reason: stock.reason, reasonCodes: stock.reasonCodes })), corporateActionSecurityIds: unique(securityIds) });
  const content: PortfolioReportContent = { ...evidenceResult.evidence, reportKind: "portfolio", portfolio: input.portfolio, positions, ...(input.plan ? { plan: input.plan } : {}), ...(input.analytics ? { analytics: input.analytics } : {}), ...(input.plan || input.analytics ? { portfolioCalculations: { ...(input.plan ? { plan: input.plan } : {}), ...(input.analytics ? { analytics: input.analytics } : {}) } } : {}) };
  return finalize(context, "portfolio", title, content, evidenceResult.evidence, evidenceResult.sourceRecords, evidenceResult.auditEvents, "Generated a reproducible portfolio report");
}

export async function buildBacktestReport(input: BacktestReportInput): Promise<ReportBuildResult> {
  const result = input.result;
  const title = reportTitle(input, `Backtest report — ${result.request.analysisDate}`);
  const selected = result.selections.filter((selection) => selection.selection === "selected");
  const rejected = result.selections.filter((selection) => selection.selection === "rejected");
  const securityIds = result.selections.map((selection) => selection.securityId);
  const modelVersionId = input.modelVersionId;
  const context = { ...input, relatedEntityIds: unique([...(input.relatedEntityIds ?? []), ...(input.backtestId ? [input.backtestId] : []), ...securityIds]), corporateActionSecurityIds: unique(securityIds) };
  const names = await Promise.all(result.selections.map(async (selection) => ({ selection, names: await subjectNames(input.repository, selection.securityId, selection.companyId) })));
  const selectedStocks = selected.map((selection) => { const entry = names.find((item) => item.selection.securityId === selection.securityId); return selectionReference(selection, { ...(entry?.names.security?.symbol ? { symbol: entry.names.security.symbol } : {}), ...(entry?.names.company?.displayName ? { name: entry.names.company.displayName } : {}) }); });
  const rejectedStocks = rejected.map((selection) => { const entry = names.find((item) => item.selection.securityId === selection.securityId); return selectionReference(selection, { ...(entry?.names.security?.symbol ? { symbol: entry.names.security.symbol } : {}), ...(entry?.names.company?.displayName ? { name: entry.names.company.displayName } : {}) }); });
  const evidenceResult = await buildEvidence({ ...context, ...optional("modelVersionId", modelVersionId) }, { reportType: "backtest", title, selectedStocks, rejectedStocks, recommendationReasons: result.selections.map((selection) => ({ entityId: selection.securityId, reason: selection.reason, reasonCodes: [...selection.reasonCodes] })), limitations: [...result.limitations, ...result.warnings], corporateActionSecurityIds: unique(securityIds) });
  const content: BacktestReportContent = { ...evidenceResult.evidence, reportKind: "backtest", result, benchmarkComparison: { benchmarkFinalValue: result.metrics.benchmarkFinalValue, benchmarkCagr: result.metrics.benchmarkCagr, alpha: result.metrics.alpha, comparisons: result.benchmarkComparisons ?? [] } };
  return finalize(context, "backtest", title, content, evidenceResult.evidence, evidenceResult.sourceRecords, evidenceResult.auditEvents, "Generated a reproducible point-in-time backtest report");
}

export async function buildDividendReport(input: DividendReportInput): Promise<ReportBuildResult> {
  const names = await subjectNames(input.repository, input.securityId);
  const dividends = await input.repository.getAll("dividends");
  const records = input.dividendIds ? dividends.filter((dividend) => input.dividendIds?.includes(dividend.id)) : dividends.filter((dividend) => dividend.securityId === input.securityId);
  const sourceRecordIds = unique([...records.map((record) => record.sourceRecordId), ...(input.sourceRecordIds ?? [])]);
  const title = reportTitle(input, `Dividend report — ${names.security?.symbol ?? input.securityId}`);
  const reference: ReportStockReference = { securityId: input.securityId, ...optional("companyId", names.company?.id), ...optional("symbol", names.security?.symbol), ...optional("name", names.company?.displayName), reason: input.analysis.eligibility.passes ? "Passed configured dividend continuity rules" : "Did not pass configured dividend continuity rules", reasonCodes: [...input.analysis.eligibility.reasonCodes] };
  const context = { ...input, sourceRecordIds, relatedEntityIds: unique([input.securityId, ...(names.company ? [names.company.id] : [])]), corporateActionSecurityIds: [input.securityId] };
  const evidenceResult = await buildEvidence(context, { reportType: "dividend", title, selectedStocks: input.analysis.eligibility.passes ? [reference] : [], rejectedStocks: input.analysis.eligibility.passes ? [] : [reference], recommendationReasons: [{ entityId: input.securityId, reason: reference.reason, reasonCodes: reference.reasonCodes }], corporateActionSecurityIds: [input.securityId] });
  const content: DividendReportContent = { ...evidenceResult.evidence, reportKind: "dividend", subject: { securityId: input.securityId, ...optional("symbol", names.security?.symbol), ...optional("companyId", names.company?.id), ...optional("companyName", names.company?.displayName) }, analysis: input.analysis, dividendRecordIds: records.map((record) => record.id) };
  return finalize(context, "dividend", title, content, evidenceResult.evidence, evidenceResult.sourceRecords, evidenceResult.auditEvents, "Generated a reproducible dividend report");
}

export async function buildModelValidationReport(input: ModelValidationReportInput): Promise<ReportBuildResult> {
  const title = reportTitle(input, "Model validation report");
  const context = { ...input, relatedEntityIds: unique(input.relatedEntityIds ?? []) };
  const evidenceResult = await buildEvidence(context, { reportType: "model-validation", title, ...optional("selectedStocks", input.selectedStocks), ...optional("rejectedStocks", input.rejectedStocks), ...optional("recommendationReasons", input.recommendationReasons), limitations: ["Validation conclusions depend on the locally available dataset and selected test window."], ...optional("corporateActionSecurityIds", input.corporateActionSecurityIds) });
  const content: ModelValidationReportContent = { ...evidenceResult.evidence, reportKind: "model-validation", validation: input.validation };
  return finalize(context, "model-validation", title, content, evidenceResult.evidence, evidenceResult.sourceRecords, evidenceResult.auditEvents, "Generated a reproducible model validation report");
}
