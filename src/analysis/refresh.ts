import { RefreshCoordinator, type RefreshResult } from "../market-data/refresh.js";
import { assessFreshness, createSourceRecord, validatePriceBar } from "../market-data/normalize.js";
import { findCorporateActionConflicts } from "../corporate-actions/conflicts.js";
import type { CompanyMasterProvider, MarketDataProvider, NormalizedRecord, ProviderSettingsInput } from "../market-data/contracts.js";
import type { Company, EntityMap, Exchange, Industry, Security, Sector, StoreName, WorkspaceRepository } from "../storage/index.js";

const ALL_CATEGORIES = ["quote", "prices", "dividends", "financials", "valuations", "benchmarks", "corporate-actions"] as const;
const FROM_DATE = "2016-01-01";

function id(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function stableId(prefix: string, ...parts: unknown[]): string {
  const material = parts.map((part) => String(part ?? "").trim().toLowerCase()).join("|");
  let hash = 2166136261;
  for (const character of material) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function nowIso(): string { return new Date().toISOString(); }

function normalized<T>(envelope: { providerId: string; sourceUrl?: string; retrievedAt: string; sourceDate?: string; raw: unknown; data: T; fromCache?: boolean }, settings: ProviderSettingsInput, now: string): NormalizedRecord<T> {
  return {
    data: envelope.data, providerId: envelope.providerId, ...(envelope.sourceUrl ? { sourceUrl: envelope.sourceUrl } : {}), retrievedAt: envelope.retrievedAt,
    ...(envelope.sourceDate ? { sourceDate: envelope.sourceDate } : {}), raw: envelope.raw,
    freshnessState: assessFreshness(envelope.retrievedAt, { thresholdMs: settings.freshnessThresholdMs, now }, envelope.fromCache ?? false), warnings: []
  };
}

function recordFor<T>(envelope: Parameters<typeof normalized<T>>[0], settings: ProviderSettingsInput, subjectType: string, subjectId: string, now: string, label: string): ReturnType<typeof createSourceRecord<T>> {
  return createSourceRecord(normalized(envelope, settings, now), subjectType, subjectId, id(`source-${label}`), now);
}

function push(writes: Array<{ store: StoreName; value: EntityMap[StoreName] }>, store: StoreName, value: EntityMap[StoreName]): void {
  writes.push({ store, value });
}

function materiallyDiffers(left: number, right: number, tolerance = 0.02): boolean {
  const scale = Math.max(Math.abs(left), Math.abs(right), 1);
  return Math.abs(left - right) / scale > tolerance;
}

function reconcileNumericObservations(
  existing: Array<{ key: string; value: number; sourceRecordId: string }>,
  incoming: Array<{ key: string; value: number; sourceRecordId: string }>,
  sourceById: Map<string, EntityMap["sourceRecords"]>,
  writes: Array<{ store: StoreName; value: EntityMap[StoreName] }>
): number {
  const existingByKey = new Map<string, Array<{ value: number; sourceRecordId: string }>>();
  for (const item of existing) existingByKey.set(item.key, [...(existingByKey.get(item.key) ?? []), item]);
  const conflicting = new Set<string>();
  const crossVerified = new Set<string>();
  for (const item of incoming) {
    for (const previous of existingByKey.get(item.key) ?? []) {
      const currentSource = sourceById.get(item.sourceRecordId);
      const previousSource = sourceById.get(previous.sourceRecordId);
      if (!currentSource || !previousSource || currentSource.provider === previousSource.provider || item.sourceRecordId === previous.sourceRecordId) continue;
      if (materiallyDiffers(item.value, previous.value)) {
        conflicting.add(item.sourceRecordId);
        conflicting.add(previous.sourceRecordId);
      } else {
        crossVerified.add(item.sourceRecordId);
        crossVerified.add(previous.sourceRecordId);
      }
    }
  }
  for (const write of writes) {
    if (write.store !== "sourceRecords") continue;
    const source = write.value as EntityMap["sourceRecords"];
    if (conflicting.has(source.id)) {
      source.freshnessState = "CONFLICTING";
      source.validationStatus = "conflicting";
      source.verificationStatus = "conflicting";
    } else if (crossVerified.has(source.id)) {
      source.verificationStatus = "cross-verified";
    }
  }
  const incomingSourceIds = new Set(writes.filter((write) => write.store === "sourceRecords").map((write) => write.value.id));
  for (const sourceId of [...conflicting, ...crossVerified]) {
    if (incomingSourceIds.has(sourceId)) continue;
    const source = sourceById.get(sourceId);
    if (!source) continue;
    const updated = conflicting.has(sourceId)
      ? { ...source, freshnessState: "CONFLICTING" as const, validationStatus: "conflicting" as const, verificationStatus: "conflicting" }
      : { ...source, verificationStatus: "cross-verified" };
    writes.push({ store: "sourceRecords", value: updated });
  }
  return conflicting.size;
}

export interface RefreshAnalysisDataInput {
  repository: WorkspaceRepository;
  provider: MarketDataProvider;
  providerSettings: ProviderSettingsInput;
  categories?: Array<(typeof ALL_CATEGORIES)[number]>;
  from?: string;
  to?: string;
  signal?: AbortSignal;
  now?: () => string;
}

export async function refreshAnalysisData(input: RefreshAnalysisDataInput): Promise<ReturnType<RefreshCoordinator["run"]>> {
  const categories = input.categories ?? [...ALL_CATEGORIES];
  const clock = input.now ?? nowIso;
  const coordinator = new RefreshCoordinator(input.repository, clock);
  return coordinator.run({ providerId: input.provider.id, requestedCategories: categories, execute: (signal) => persistProviderData(input, categories, signal) }, input.signal);
}

function providerContext(signal?: AbortSignal): { signal?: AbortSignal; forceRefresh: true } {
  return signal ? { signal, forceRefresh: true } : { forceRefresh: true };
}

async function persistProviderData(input: RefreshAnalysisDataInput, categories: Array<(typeof ALL_CATEGORIES)[number]>, signal?: AbortSignal): Promise<RefreshResult> {
  const now = (input.now ?? nowIso)();
  const from = input.from ?? FROM_DATE;
  const to = input.to ?? now;
  const securities = await input.repository.getAll("securities");
  const companies = new Map((await input.repository.getAll("companies")).map((company) => [company.id, company]));
  const benchmarks = await input.repository.getAll("benchmarks");
  const writes: Array<{ store: StoreName; value: EntityMap[StoreName] }> = [];
  let acceptedCount = 0;
  let rejectedCount = 0;
  let warningCount = 0;
  const supports = (category: (typeof ALL_CATEGORIES)[number]) => input.provider.capabilities.categories.includes(category);
  const attempt = async (operation: () => Promise<void>): Promise<void> => {
    try { await operation(); } catch { rejectedCount += 1; warningCount += 1; }
  };
  const sourceAndPersist = <T>(envelope: Parameters<typeof normalized<T>>[0], subjectType: string, subjectId: string, category: string, operation: (sourceId: string) => void): void => {
    const source = recordFor(envelope, input.providerSettings, subjectType, subjectId, now, category);
    push(writes, "sourceRecords", source);
    operation(source.id);
    acceptedCount += 1;
    if (source.freshnessState !== "LIVE") warningCount += 1;
  };
  let activeSecurities = securities;
  if (activeSecurities.length === 0 && typeof (input.provider as unknown as Partial<CompanyMasterProvider>).getUniverse === "function") {
    await attempt(async () => {
      const envelope = await (input.provider as unknown as CompanyMasterProvider).getUniverse(providerContext(signal));
      const exchanges = new Map<string, Exchange>();
      const sectors = new Map<string, Sector>();
      const industries = new Map<string, Industry>();
      const discoveredCompanies = new Map<string, Company>();
      const discoveredSecurities = new Map<string, Security>();
      const discoveredListings: Array<{ store: "listings"; value: EntityMap["listings"] }> = [];
      for (const item of envelope.data) {
        const exchangeId = `exchange-${item.exchangeCode.toLowerCase()}`;
        const sectorId = `sector-${(item.sectorName ?? "Unclassified").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        const industryId = `industry-${(item.industryName ?? "Unclassified").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        // Keep provider identifiers as the local canonical IDs so subsequent
        // endpoint requests use the same identifiers returned by /universe.
        const companyId = item.providerCompanyId ?? item.isin ?? item.providerSecurityId;
        const securityId = item.providerSecurityId;
        exchanges.set(exchangeId, { id: exchangeId, kind: "exchange", createdAt: now, updatedAt: now, code: item.exchangeCode, name: item.exchangeName ?? item.exchangeCode, country: "IN" });
        sectors.set(sectorId, { id: sectorId, kind: "sector", createdAt: now, updatedAt: now, name: item.sectorName ?? "Unclassified", isDemo: false });
        industries.set(industryId, { id: industryId, kind: "industry", createdAt: now, updatedAt: now, name: item.industryName ?? "Unclassified", sectorId });
        const company: Company = { id: companyId, kind: "company", createdAt: now, updatedAt: now, legalName: item.companyName, displayName: item.companyName, country: "IN", industryId, isDemo: false, ...(item.isin ? { isin: item.isin } : {}), ...(item.sectorOutlook ? { sectorOutlook: item.sectorOutlook } : {}), ...(item.governanceStatus ? { governanceStatus: item.governanceStatus } : {}), ...(item.structurallyDeteriorated !== undefined ? { structurallyDeteriorated: item.structurallyDeteriorated } : {}) };
        const security: Security = { id: securityId, kind: "security", createdAt: now, updatedAt: now, companyId, exchangeId, symbol: item.symbol, securityType: "equity", currency: "INR" };
        discoveredCompanies.set(companyId, company);
        companies.set(companyId, company);
        discoveredSecurities.set(securityId, security);
        discoveredListings.push({ store: "listings", value: { id: `listing-${securityId}-${item.exchangeCode}`, kind: "listing", createdAt: now, updatedAt: now, securityId, exchangeId, listedFrom: item.listedFrom } });
      }
      const source = recordFor(envelope, input.providerSettings, "universe", "company-master", now, "universe");
      push(writes, "sourceRecords", source);
      for (const value of exchanges.values()) push(writes, "exchanges", value);
      for (const value of sectors.values()) push(writes, "sectors", value);
      for (const value of industries.values()) push(writes, "industries", value);
      for (const value of discoveredCompanies.values()) push(writes, "companies", value);
      for (const value of discoveredSecurities.values()) push(writes, "securities", value);
      writes.push(...discoveredListings);
      activeSecurities = [...discoveredSecurities.values()];
      acceptedCount += envelope.data.length + 1;
      if (source.freshnessState !== "LIVE") warningCount += 1;
    });
  }
  for (const security of activeSecurities) {
    if (signal?.aborted) throw signal.reason ?? new Error("Refresh cancelled");
    const company = companies.get(security.companyId);
    if (supports("quote") && categories.includes("quote")) await attempt(async () => {
      const envelope = await input.provider.getQuote(security.id, providerContext(signal));
      sourceAndPersist(envelope, "security", security.id, "quote", (sourceId) => push(writes, "priceHistory", { id: stableId("price", security.id, new Date(envelope.data.observedAt).toISOString().slice(0, 10)), kind: "price-history", createdAt: now, updatedAt: now, securityId: security.id, tradingDate: new Date(envelope.data.observedAt).toISOString(), close: envelope.data.currentPrice, adjustedClose: envelope.data.currentPrice, sourceRecordId: sourceId }));
    });
    if (supports("prices") && categories.includes("prices")) await attempt(async () => {
      const envelope = await input.provider.getHistoricalPrices(security.id, from, to, providerContext(signal));
      sourceAndPersist(envelope, "security", security.id, "prices", (sourceId) => envelope.data.forEach((price) => { validatePriceBar(price); const securityId = price.securityId || security.id; push(writes, "priceHistory", { id: stableId("price", securityId, price.tradingDate.slice(0, 10)), kind: "price-history", createdAt: now, updatedAt: now, securityId, tradingDate: price.tradingDate, ...(price.open !== undefined ? { open: price.open } : {}), ...(price.high !== undefined ? { high: price.high } : {}), ...(price.low !== undefined ? { low: price.low } : {}), close: price.close, ...(price.adjustedClose !== undefined ? { adjustedClose: price.adjustedClose } : {}), ...(price.volume !== undefined ? { volume: price.volume } : {}), sourceRecordId: sourceId }); }));
    });
    if (supports("dividends") && categories.includes("dividends")) await attempt(async () => {
      const envelope = await input.provider.getDividends(security.id, providerContext(signal));
      sourceAndPersist(envelope, "security", security.id, "dividend", (sourceId) => envelope.data.forEach((dividend) => { const securityId = dividend.securityId || security.id; push(writes, "dividends", { id: stableId("dividend", securityId, dividend.financialYear, dividend.amountPerShare, dividend.dividendType, dividend.paymentDate, dividend.declaredDate), kind: "dividend", createdAt: now, updatedAt: now, securityId, financialYear: dividend.financialYear, amountPerShare: dividend.amountPerShare, dividendType: dividend.dividendType, ...(dividend.paymentDate ? { paymentDate: dividend.paymentDate } : {}), ...(dividend.declaredDate ? { declaredDate: dividend.declaredDate } : {}), sourceRecordId: sourceId }); }));
    });
    if (company && supports("financials") && categories.includes("financials")) await attempt(async () => {
      const envelope = await input.provider.getFinancials(company.id, providerContext(signal));
      sourceAndPersist(envelope, "company", company.id, "financials", (sourceId) => {
        envelope.data.statements.forEach((statement) => { const companyId = statement.companyId || company.id; push(writes, "financialStatements", { id: stableId("statement", companyId, statement.periodEnd, statement.periodType), kind: "financial-statement", createdAt: now, updatedAt: now, companyId, periodEnd: statement.periodEnd, periodType: statement.periodType, ...(statement.revenue !== undefined ? { revenue: statement.revenue } : {}), ...(statement.netProfit !== undefined ? { netProfit: statement.netProfit } : {}), ...(statement.eps !== undefined ? { eps: statement.eps } : {}), ...(statement.freeCashFlow !== undefined ? { freeCashFlow: statement.freeCashFlow } : {}), sourceRecordId: sourceId }); });
        envelope.data.metrics.forEach((metric) => { const companyId = metric.companyId || company.id; push(writes, "financialMetrics", { id: stableId("metric", companyId, metric.metric, metric.periodEnd), kind: "financial-metric", createdAt: now, updatedAt: now, companyId, metric: metric.metric, periodEnd: metric.periodEnd, value: metric.value, sourceRecordId: sourceId }); });
      });
    });
    if (supports("valuations") && categories.includes("valuations")) await attempt(async () => {
      const envelope = await input.provider.getValuations(security.id, providerContext(signal));
      sourceAndPersist(envelope, "security", security.id, "valuation", (sourceId) => envelope.data.forEach((valuation) => { const securityId = valuation.securityId || security.id; push(writes, "valuationSnapshots", { id: stableId("valuation", securityId, valuation.observedAt), kind: "valuation-snapshot", createdAt: now, updatedAt: now, securityId, observedAt: valuation.observedAt, ...(valuation.pe !== undefined ? { pe: valuation.pe } : {}), ...(valuation.evToEbitda !== undefined ? { evToEbitda: valuation.evToEbitda } : {}), ...(valuation.marketCapitalization !== undefined ? { marketCapitalization: valuation.marketCapitalization } : {}), ...(valuation.historicalPercentile !== undefined ? { historicalPercentile: valuation.historicalPercentile } : {}), sourceRecordId: sourceId }); }));
    });
    if (supports("corporate-actions") && categories.includes("corporate-actions")) await attempt(async () => {
      const envelope = await input.provider.getCorporateActions(security.id, providerContext(signal));
      sourceAndPersist(envelope, "security", security.id, "corporate-action", (sourceId) => envelope.data.forEach((action) => { const securityId = action.securityId || security.id; push(writes, "corporateActions", { id: stableId("corporate-action", securityId, action.actionType, action.effectiveDate, JSON.stringify(action.details)), kind: "corporate-action", createdAt: now, updatedAt: now, securityId, actionType: action.actionType, effectiveDate: action.effectiveDate, details: action.details, sourceRecordId: sourceId }); }));
    });
  }
  if (supports("benchmarks") && categories.includes("benchmarks")) for (const benchmark of benchmarks) await attempt(async () => {
    const envelope = await input.provider.getBenchmarkData(benchmark.id, from, to, providerContext(signal));
    sourceAndPersist(envelope, "benchmark", benchmark.id, "benchmark", (sourceId) => envelope.data.forEach((price) => { const benchmarkId = price.benchmarkId || benchmark.id; push(writes, "benchmarkPrices", { id: stableId("benchmark-price", benchmarkId, price.tradingDate), kind: "benchmark-price", createdAt: now, updatedAt: now, benchmarkId, tradingDate: price.tradingDate, close: price.close, sourceRecordId: sourceId }); }));
  });
  const existingActions = await input.repository.getAll("corporateActions");
  const [existingPrices, existingMetrics, existingValuations, existingSources] = await Promise.all([
    input.repository.getAll("priceHistory"), input.repository.getAll("financialMetrics"), input.repository.getAll("valuationSnapshots"), input.repository.getAll("sourceRecords")
  ]);
  const sourceById = new Map([...existingSources, ...writes.filter((write) => write.store === "sourceRecords").map((write) => write.value as EntityMap["sourceRecords"])].map((source) => [source.id, source]));
  const incomingPrices = writes.filter((write): write is { store: "priceHistory"; value: EntityMap["priceHistory"] } => write.store === "priceHistory").map((write) => ({ key: `${write.value.securityId}|${write.value.tradingDate.slice(0, 10)}`, value: write.value.close, sourceRecordId: write.value.sourceRecordId }));
  const incomingMetrics = writes.filter((write): write is { store: "financialMetrics"; value: EntityMap["financialMetrics"] } => write.store === "financialMetrics").map((write) => ({ key: `${write.value.companyId}|${write.value.metric}|${write.value.periodEnd.slice(0, 10)}`, value: write.value.value, sourceRecordId: write.value.sourceRecordId }));
  const incomingValuations = writes.filter((write) => write.store === "valuationSnapshots").map((write) => write.value as EntityMap["valuationSnapshots"]).filter((value) => value.pe !== undefined).map((value) => ({ key: `${value.securityId}|${value.observedAt.slice(0, 10)}`, value: value.pe as number, sourceRecordId: value.sourceRecordId }));
  const reconciliationConflicts = reconcileNumericObservations(
    existingPrices.map((record) => ({ key: `${record.securityId}|${record.tradingDate.slice(0, 10)}`, value: record.close, sourceRecordId: record.sourceRecordId })), incomingPrices, sourceById, writes
  ) + reconcileNumericObservations(
    existingMetrics.map((record) => ({ key: `${record.companyId}|${record.metric}|${record.periodEnd.slice(0, 10)}`, value: record.value, sourceRecordId: record.sourceRecordId })), incomingMetrics, sourceById, writes
  ) + reconcileNumericObservations(
    existingValuations.filter((record) => record.pe !== undefined).map((record) => ({ key: `${record.securityId}|${record.observedAt.slice(0, 10)}`, value: record.pe as number, sourceRecordId: record.sourceRecordId })), incomingValuations, sourceById, writes
  );
  const incomingActions = writes.filter((write): write is { store: "corporateActions"; value: EntityMap["corporateActions"] } => write.store === "corporateActions").map((write) => write.value);
  const conflicts = findCorporateActionConflicts([...existingActions, ...incomingActions]);
  if (conflicts.length > 0) {
    const conflictedActionIds = new Set(conflicts.flatMap((conflict) => conflict.actionIds));
    const conflictedSourceIds = new Set([...existingActions, ...incomingActions].filter((action) => conflictedActionIds.has(action.id)).map((action) => action.sourceRecordId));
    for (const write of writes) {
      if (write.store !== "sourceRecords" || !conflictedSourceIds.has(write.value.id)) continue;
      const source = write.value as EntityMap["sourceRecords"];
      source.freshnessState = "CONFLICTING";
      source.validationStatus = "conflicting";
      source.verificationStatus = "conflicting";
    }
    warningCount += conflicts.length;
  }
  warningCount += reconciliationConflicts;
  await input.repository.putBatch(writes);
  return { acceptedCount, rejectedCount, warningCount };
}
