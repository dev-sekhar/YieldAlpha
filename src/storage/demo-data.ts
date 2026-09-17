import type {
  Company, Dividend, Exchange, Industry, ModelSettings, ModelVersion, Sector, Security, SourceRecord,
  WorkspaceData, WorkspaceProfile, Benchmark, BenchmarkPrice, PriceHistory, Listing
} from "./types.js";

const DEMO_TIMESTAMP = "2026-01-01T00:00:00.000Z";
const id = (name: string) => `demo-${name}`;

function base(kind: string, name: string) {
  return { id: id(name), kind, createdAt: DEMO_TIMESTAMP, updatedAt: DEMO_TIMESTAMP } as const;
}

export function createDemoWorkspace(): WorkspaceData {
  const profile: WorkspaceProfile = {
    ...base("workspace-profile", "profile"), kind: "workspace-profile", name: "YieldAlpha Demonstration", locale: "en-IN", currency: "INR", timezone: "Asia/Kolkata", isDemo: true
  };
  const settings: ModelSettings = {
    ...base("model-settings", "settings-v1"), kind: "model-settings", version: 1, requiredCagr: 0.12, inflationRate: 0.08, horizonYears: 5,
    dividendStartYear: 2016, minimumConsecutiveDividendYears: 5, allowNewerListings: true, includeSpecialDividends: false, zeroDividendDisqualifies: true
  };
  const modelVersion: ModelVersion = {
    ...base("model-version", "model-1-0"), kind: "model-version", name: "Model 1.0", description: "Demonstration model configuration; not investment advice.", status: "active", settingsId: settings.id
  };
  const exchange: Exchange = { ...base("exchange", "nse"), kind: "exchange", code: "NSE", name: "National Stock Exchange of India", country: "IN" };
  const sector: Sector = { ...base("sector", "capital-goods"), kind: "sector", name: "Capital Goods", description: "Demonstration sector classification.", isDemo: true };
  const industry: Industry = { ...base("industry", "industrial-engineering"), kind: "industry", name: "Industrial Engineering", sectorId: sector.id };
  const company: Company = {
    ...base("company", "demo-company"), kind: "company", legalName: "Demonstration Engineering Limited", displayName: "Demo Engineering", country: "IN", industryId: industry.id, isin: "IN0000000000", isDemo: true
  };
  const security: Security = { ...base("security", "demo-engineering-nse"), kind: "security", companyId: company.id, exchangeId: exchange.id, symbol: "DEMOENG", securityType: "equity", currency: "INR" };
  const listing: Listing = { ...base("listing", "demo-listing"), kind: "listing", securityId: security.id, exchangeId: exchange.id, listedFrom: "2014-01-01" };
  const source: SourceRecord = {
    ...base("source-record", "demo-source"), kind: "source-record", provider: "YieldAlpha demonstration fixture", sourceUrl: "https://example.invalid/yieldalpha-demo",
    retrievalTimestamp: DEMO_TIMESTAMP, sourceDate: "2025-12-31", rawValue: { demonstration: true }, normalizedValue: { demonstration: true }, confidence: "unknown", validationStatus: "not-verified", freshnessState: "IMPORTED", subjectType: "security", subjectId: security.id
  };
  const dividends: Dividend[] = [2016, 2017, 2018, 2019, 2020].map((year, index) => ({
    ...base("dividend", `demo-dividend-${year}`), kind: "dividend", securityId: security.id, financialYear: year, amountPerShare: 1 + index * 0.25, dividendType: "regular", sourceRecordId: source.id
  }));
  const price: PriceHistory = { ...base("price-history", "demo-price-2025-12-31"), kind: "price-history", securityId: security.id, tradingDate: "2025-12-31", close: 250, adjustedClose: 250, sourceRecordId: source.id };
  const benchmark: Benchmark = { ...base("benchmark", "nifty50-tri"), kind: "benchmark", code: "NIFTY50_TRI", name: "Nifty 50 TRI", currency: "INR" };
  const benchmarkPrice: BenchmarkPrice = { ...base("benchmark-price", "demo-nifty-price"), kind: "benchmark-price", benchmarkId: benchmark.id, tradingDate: "2025-12-31", close: 1000, sourceRecordId: source.id };

  return {
    workspaceProfiles: [profile], modelSettings: [settings], modelVersions: [modelVersion], exchanges: [exchange], sectors: [sector], industries: [industry],
    companies: [company], securities: [security], listings: [listing], priceHistory: [price], dividends, financialStatements: [], financialMetrics: [],
    valuationSnapshots: [], benchmarks: [benchmark], benchmarkPrices: [benchmarkPrice], corporateActions: [], sourceRecords: [source], analysisSnapshots: [], modelRuns: [], modelSignals: [],
    backtests: [], backtestPositions: [], portfolios: [], portfolioPositions: [], watchlists: [], alerts: [], reports: [], auditEvents: [], importManifests: [],
    exportManifests: [], migrationRecords: [], providerSettings: [], dataSources: [], refreshRuns: []
  };
}
