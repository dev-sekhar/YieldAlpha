import { createAuditEvent } from "../audit/service.js";
import { createModelSettingsVersion, createModelVersion } from "../audit/versioning.js";
import { analyzeDividends, type DividendAnalysis } from "../dividends/engine.js";
import { persistSignalsAndMonitor } from "../alerts/monitor.js";
import { evaluateModel } from "../model/engine.js";
import { modelSignalFromRecommendation, settingsToModelConfig, type ModelInput, type ModelRecommendation } from "../model/types.js";
import type { AnalysisSnapshot, Company, FinancialMetric, FinancialStatement, ModelRun, ModelSettings, ModelSignal, Portfolio, Security, SourceRecord, WorkspaceRepository } from "../storage/index.js";

function id(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function latest<T extends { periodEnd: string }>(records: T[]): T | undefined {
  return [...records].sort((left, right) => left.periodEnd.localeCompare(right.periodEnd)).at(-1);
}

function latestByDate<T extends { tradingDate: string }>(records: T[]): T | undefined {
  return [...records].sort((left, right) => left.tradingDate.localeCompare(right.tradingDate)).at(-1);
}

function latestMetric(records: FinancialMetric[], metric: FinancialMetric["metric"]): FinancialMetric | undefined {
  return latest(records.filter((record) => record.metric === metric));
}

export interface AnalysisRequest {
  repository: WorkspaceRepository;
  requiredCagr: number;
  inflationRate: number;
  horizonYears: number;
  dividendStartYear?: number;
  minimumConsecutiveDividendYears?: number;
  allowNewerListings?: boolean;
  includeSpecialDividends?: boolean;
  zeroDividendDisqualifies?: boolean;
  securityIds?: string[];
  sectorIds?: string[];
  now?: string;
}

export interface AnalysisRunResult {
  snapshot: AnalysisSnapshot;
  modelRun: ModelRun;
  settings: ModelSettings;
  signals: ModelSignal[];
  alerts: Awaited<ReturnType<typeof persistSignalsAndMonitor>>["alerts"];
  counts: Record<ModelSignal["classification"], number>;
}

function emptyDividendAnalysis(): DividendAnalysis {
  return {
    eligibility: { passes: false, eligibleYears: [], paidYears: [], missingYears: [], zeroValueYears: [], listingYear: 0, effectiveStartYear: 0, asOfYear: new Date().getUTCFullYear(), reasonCodes: ["MISSING_LISTING_OR_DIVIDEND_DATA"] },
    metrics: { payoutConsistency: 0, growthTrend: "insufficient-data" as const, specialDividendYears: [], annualHistory: [] }
  };
}

function inputSnapshotFor(signal: { companyId: string; securityId: string; modelVersionId: string; settingsId: string; dataSnapshotId: string; generatedAt: string; sourceRecordIds: string[]; missingFields: string[]; staleFields: string[]; conflictingFields: string[]; unverifiedFields: string[] }): Record<string, unknown> {
  return { companyId: signal.companyId, securityId: signal.securityId, modelVersionId: signal.modelVersionId, settingsId: signal.settingsId, dataSnapshotId: signal.dataSnapshotId, generatedAt: signal.generatedAt, dataQuality: { missingFields: signal.missingFields, staleFields: signal.staleFields, conflictingFields: signal.conflictingFields, unverifiedFields: signal.unverifiedFields, sourceRecordIds: signal.sourceRecordIds } };
}

function insufficientSignal(input: { security: Security; company: Company; modelRunId: string; modelVersionId: string; settingsId: string; dataSnapshotId: string; now: string; sourceRecordIds: string[]; missingFields: string[]; staleFields: string[]; conflictingFields: string[]; unverifiedFields: string[] }): ModelSignal {
  const reasonCodes = [...input.missingFields.map((field) => `MISSING_${field.toUpperCase().replaceAll(" ", "_")}`), ...input.staleFields.map((field) => `STALE_${field.toUpperCase().replaceAll(" ", "_")}`), ...input.conflictingFields.map((field) => `CONFLICTING_${field.toUpperCase().replaceAll(" ", "_")}`), ...input.unverifiedFields.map((field) => `UNVERIFIED_${field.toUpperCase().replaceAll(" ", "_")}`)];
  const explanation = `INSUFFICIENT DATA: ${reasonCodes.length ? reasonCodes.join(", ") : "required model inputs are not trustworthy"}.`;
  const inputSnapshot = inputSnapshotFor({ companyId: input.company.id, securityId: input.security.id, modelVersionId: input.modelVersionId, settingsId: input.settingsId, dataSnapshotId: input.dataSnapshotId, generatedAt: input.now, sourceRecordIds: input.sourceRecordIds, missingFields: input.missingFields, staleFields: input.staleFields, conflictingFields: input.conflictingFields, unverifiedFields: input.unverifiedFields });
  return { id: id("signal"), kind: "model-signal", createdAt: input.now, updatedAt: input.now, modelRunId: input.modelRunId, companyId: input.company.id, classification: "INSUFFICIENT_DATA", reasonCodes, explanation, confidence: "unknown", modelVersionId: input.modelVersionId, settingsId: input.settingsId, dataSnapshotId: input.dataSnapshotId, sourceRecordIds: input.sourceRecordIds, inputSnapshot };
}

async function settingAndModel(repository: WorkspaceRepository, request: AnalysisRequest, now: string): Promise<{ settings: ModelSettings; modelVersionId: string }> {
  const settings = await createModelSettingsVersion(repository, {
    requiredCagr: request.requiredCagr, inflationRate: request.inflationRate, horizonYears: request.horizonYears,
    dividendStartYear: request.dividendStartYear ?? 2016, minimumConsecutiveDividendYears: request.minimumConsecutiveDividendYears ?? 5,
    allowNewerListings: request.allowNewerListings ?? true, includeSpecialDividends: request.includeSpecialDividends ?? false, zeroDividendDisqualifies: request.zeroDividendDisqualifies ?? true
  }, "User ran analysis with the configured model settings", now);
  const model = await createModelVersion(repository, { name: `Local analysis ${now.slice(0, 10)}`, description: "Deterministic local analysis using the configured data snapshot.", settingsId: settings.id }, "Analysis run model version", now);
  return { settings, modelVersionId: model.id };
}

export async function runLocalAnalysis(request: AnalysisRequest): Promise<AnalysisRunResult> {
  const now = request.now ?? new Date().toISOString();
  const { settings, modelVersionId } = await settingAndModel(request.repository, request, now);
  const allSecurities = await request.repository.getAll("securities");
  const companies = new Map((await request.repository.getAll("companies")).map((company) => [company.id, company]));
  const industries = new Map((await request.repository.getAll("industries")).map((industry) => [industry.id, industry]));
  const selectedIds = request.securityIds ? new Set(request.securityIds) : undefined;
  const universe = allSecurities.filter((security) => !selectedIds || selectedIds.has(security.id)).filter((security) => {
    if (!request.sectorIds || request.sectorIds.length === 0) return true;
    const company = companies.get(security.companyId);
    const industry = company ? industries.get(company.industryId) : undefined;
    return Boolean(industry && request.sectorIds.includes(industry.sectorId));
  });
  const [prices, dividends, statements, metrics, valuations, sources, listings, actions, benchmarks] = await Promise.all([
    request.repository.getAll("priceHistory"), request.repository.getAll("dividends"), request.repository.getAll("financialStatements"), request.repository.getAll("financialMetrics"), request.repository.getAll("valuationSnapshots"), request.repository.getAll("sourceRecords"), request.repository.getAll("listings"), request.repository.getAll("corporateActions"), request.repository.getAll("benchmarkPrices")
  ]);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const snapshot: AnalysisSnapshot = {
    id: id("snapshot"), kind: "analysis-snapshot", createdAt: now, updatedAt: now, capturedAt: now, modelVersionId, settingsId: settings.id,
    universeSecurityIds: universe.map((security) => security.id), sourceRecordIds: [], data: {
      securities: universe, companies: universe.map((security) => companies.get(security.companyId)).filter(Boolean), prices: prices.filter((price) => universe.some((security) => security.id === price.securityId)),
      dividends: dividends.filter((dividend) => universe.some((security) => security.id === dividend.securityId)), statements, metrics, valuations, listings, actions, benchmarks
    }
  };
  const modelRun: ModelRun = { id: id("model-run"), kind: "model-run", createdAt: now, updatedAt: now, modelVersionId, settingsId: settings.id, dataSnapshotId: snapshot.id, runType: "screen", status: "failed", startedAt: now };
  const startAudit = createAuditEvent({ now, eventType: "analysis", action: "analysis-started", actorType: "model-run", entityType: "model-run", entityId: modelRun.id, previousState: {}, newState: { modelRun, snapshot }, reason: "User started a local fresh-data analysis", modelVersionId, settingsId: settings.id, correlationId: modelRun.id });
  await request.repository.putBatch([{ store: "analysisSnapshots", value: snapshot }, { store: "modelRuns", value: modelRun }, { store: "auditEvents", value: startAudit }]);
  const config = settingsToModelConfig(settings);
  const signals: ModelSignal[] = [];
  const allSourceIds: string[] = [];
  for (const security of universe) {
    const company = companies.get(security.companyId);
    if (!company) continue;
    const securityPrices = prices.filter((price) => price.securityId === security.id);
    const securityDividends = dividends.filter((dividend) => dividend.securityId === security.id);
    const securityStatements = statements.filter((statement) => statement.companyId === company.id);
    const securityMetrics = metrics.filter((metric) => metric.companyId === company.id);
    const securityValuations = valuations.filter((valuation) => valuation.securityId === security.id);
    const securityListings = listings.filter((listing) => listing.securityId === security.id).sort((left, right) => left.listedFrom.localeCompare(right.listedFrom));
    const latestPrice = latestByDate(securityPrices);
    const latestStatement = latest(securityStatements);
    const latestValuation = [...securityValuations].sort((left, right) => left.observedAt.localeCompare(right.observedAt)).at(-1);
    const earningsGrowth = latestMetric(securityMetrics, "earnings-growth");
    const roe = latestMetric(securityMetrics, "roe");
    const debtToEquity = latestMetric(securityMetrics, "debt-to-equity");
    const roce = latestMetric(securityMetrics, "roce");
    const listing = securityListings[0];
    const relatedSourceIds = [...new Set([...securityPrices, ...securityDividends, ...securityStatements, ...securityMetrics, ...securityValuations, ...actions.filter((item) => item.securityId === security.id)].map((record) => record.sourceRecordId))];
    const relatedSources = relatedSourceIds.map((sourceId) => sourceById.get(sourceId)).filter((source): source is SourceRecord => Boolean(source));
    const staleFields = relatedSources.filter((source) => source.freshnessState === "STALE").map((source) => source.subjectType);
    const conflictingFields = relatedSources.filter((source) => source.freshnessState === "CONFLICTING").map((source) => source.subjectType);
    const unverifiedFields = relatedSources.filter((source) => source.freshnessState === "NOT_VERIFIED").map((source) => source.subjectType);
    const missingFields: string[] = [];
    if (!latestPrice || latestPrice.close <= 0) missingFields.push("current price");
    if (!latestStatement?.eps || latestStatement.eps <= 0) missingFields.push("EPS");
    if (!latestStatement?.revenue || latestStatement.revenue <= 0) missingFields.push("revenue");
    if (!latestStatement?.netProfit || latestStatement.netProfit <= 0) missingFields.push("profit");
    if (latestStatement?.freeCashFlow === undefined || !Number.isFinite(latestStatement.freeCashFlow)) missingFields.push("free cash flow");
    if (!earningsGrowth) missingFields.push("earnings growth");
    if (!roe) missingFields.push("ROE");
    if (!roce) missingFields.push("ROCE");
    if (!debtToEquity) missingFields.push("debt to equity");
    if (!latestValuation?.pe || latestValuation.pe <= 0) missingFields.push("current valuation multiple");
    const listingDate = listing?.listedFrom;
    const dividendAnalysis = listingDate ? analyzeDividends({ listingDate, dividends: securityDividends, policy: { startingYear: settings.dividendStartYear, minimumConsecutiveYears: settings.minimumConsecutiveDividendYears, allowNewerListings: settings.allowNewerListings, includeSpecialDividends: settings.includeSpecialDividends, zeroValueDisqualifies: settings.zeroDividendDisqualifies }, asOfYear: new Date(now).getUTCFullYear(), ...(latestPrice?.close !== undefined ? { currentPrice: latestPrice.close } : {}) }) : emptyDividendAnalysis();
    if (!listingDate) missingFields.push("listing date");
    if (!dividendAnalysis.eligibility.passes) missingFields.push("dividend continuity");
    if (!company.sectorOutlook || company.sectorOutlook === "unknown") missingFields.push("sector outlook");
    if (!company.governanceStatus || company.governanceStatus === "unknown") missingFields.push("governance status");
    if (company.structurallyDeteriorated === undefined) missingFields.push("structural deterioration assessment");
    allSourceIds.push(...relatedSourceIds);
    if (missingFields.length || staleFields.length || conflictingFields.length || unverifiedFields.length) {
      signals.push(insufficientSignal({ security, company, modelRunId: modelRun.id, modelVersionId, settingsId: settings.id, dataSnapshotId: snapshot.id, now, sourceRecordIds: relatedSourceIds, missingFields, staleFields, conflictingFields, unverifiedFields }));
      continue;
    }
    const modelInput: ModelInput = {
      companyId: company.id, companyName: company.displayName, securityId: security.id, modelVersionId, settingsId: settings.id, dataSnapshotId: snapshot.id, currentPrice: latestPrice?.close ?? 0,
      currentEps: latestStatement?.eps ?? 0, currentRevenue: latestStatement?.revenue ?? 0, currentProfit: latestStatement?.netProfit ?? 0, currentAnnualDividendPerShare: dividendAnalysis.metrics.annualHistory.at(-1)?.includedAmount ?? 0,
      expectedEpsGrowthRate: earningsGrowth?.value ?? 0, expectedRevenueGrowthRate: earningsGrowth?.value ?? 0, expectedProfitGrowthRate: earningsGrowth?.value ?? 0, exitMultiple: latestValuation?.pe ?? 0, dividendGrowthRate: dividendAnalysis.metrics.dividendCagr ?? 0,
      quality: {
        balanceSheet: debtToEquity ? (debtToEquity.value < 0 ? "weak" : settings.maximumDebtToEquity !== undefined && debtToEquity.value > settings.maximumDebtToEquity ? "excessive-leverage" : "acceptable") : "unknown",
        fundamentals: latestStatement?.freeCashFlow !== undefined ? (latestStatement.freeCashFlow >= 0 ? "sound" : "weak") : "unknown",
        sectorOutlook: company.sectorOutlook ?? "unknown", governance: company.governanceStatus ?? "unknown", structurallyDeteriorated: company.structurallyDeteriorated === true,
        ...(roe ? { roe: roe.value } : {}), ...(debtToEquity ? { debtToEquity: debtToEquity.value } : {}), ...(roce ? { roce: roce.value } : {}), earningsGrowthRate: earningsGrowth?.value ?? 0,
        ...(latestStatement?.freeCashFlow !== undefined ? { freeCashFlow: latestStatement.freeCashFlow } : {})
      },
      valuation: { currentMultiple: latestValuation?.pe ?? 0, ...(latestValuation?.historicalPercentile !== undefined ? { historicalPercentile: latestValuation.historicalPercentile } : {}), marginOfSafety: latestValuation?.historicalPercentile !== undefined ? Math.max(0, 1 - latestValuation.historicalPercentile) : 0 }, dataQuality: { missingFields: [], staleFields: [], conflictingFields: [], unverifiedFields: [], sourceRecordIds: relatedSourceIds }, dividendAnalysis
    };
    let recommendation: ModelRecommendation;
    try { recommendation = evaluateModel(modelInput, config, now); } catch (error) { signals.push(insufficientSignal({ security, company, modelRunId: modelRun.id, modelVersionId, settingsId: settings.id, dataSnapshotId: snapshot.id, now, sourceRecordIds: relatedSourceIds, missingFields: [error instanceof Error ? error.message : "model input validation"], staleFields: [], conflictingFields: [], unverifiedFields: [] })); continue; }
    signals.push(modelSignalFromRecommendation(recommendation, recommendation.inputSnapshot, { modelRunId: modelRun.id, now }, id("signal")));
  }
  snapshot.sourceRecordIds = [...new Set(allSourceIds)];
  const monitored = await persistSignalsAndMonitor(request.repository, signals, { refreshCompleted: true, now: () => now });
  const counts = { BUY: 0, WATCH: 0, AVOID: 0, INSUFFICIENT_DATA: 0 };
  for (const signal of signals) counts[signal.classification] += 1;
  const completed: ModelRun = { ...modelRun, updatedAt: now, completedAt: now, status: "completed" };
  const completeAudit = createAuditEvent({ now, eventType: "analysis", action: "analysis-completed", actorType: "model-run", entityType: "model-run", entityId: modelRun.id, previousState: modelRun, newState: { ...completed, counts }, reason: "Local deterministic analysis completed", modelVersionId, settingsId: settings.id, sourceRecordIds: [...new Set(allSourceIds)], correlationId: modelRun.id });
  await request.repository.putBatch([{ store: "analysisSnapshots", value: snapshot }, { store: "modelRuns", value: completed }, { store: "auditEvents", value: completeAudit }]);
  return { snapshot, modelRun: completed, settings, signals, alerts: monitored.alerts, counts };
}
