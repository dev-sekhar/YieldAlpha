import type { CorporateAction, Dividend, FinancialStatement, FinancialMetric, PriceHistory, ValuationSnapshot, BenchmarkPrice, FreshnessState } from "../storage/types.js";

export const DATA_CATEGORIES = ["quote", "prices", "dividends", "financials", "valuations", "benchmarks", "corporate-actions"] as const;
export type DataCategory = (typeof DATA_CATEGORIES)[number];

export interface ProviderCapabilities {
  categories: readonly DataCategory[];
  browserRequests: boolean;
  corsRequired: boolean;
  supportsHistoricalAsOf: boolean;
}

export interface ProviderRequestContext {
  signal?: AbortSignal;
  asOf?: string;
  forceRefresh?: boolean;
}

export interface ProviderEnvelope<T> {
  providerId: string;
  sourceUrl?: string;
  retrievedAt: string;
  sourceDate?: string;
  raw: unknown;
  data: T;
  fromCache?: boolean;
}

export interface QuoteSnapshot {
  securityId: string;
  symbol: string;
  currentPrice: number;
  week52High: number;
  week52Low: number;
  observedAt: string;
  currency: "INR";
}

export interface ProviderPrice extends Omit<PriceHistory, "id" | "createdAt" | "updatedAt" | "sourceRecordId"> {
  securityId: string;
}

export interface ProviderDividend extends Omit<Dividend, "id" | "createdAt" | "updatedAt" | "sourceRecordId"> {}
export interface ProviderFinancialStatement extends Omit<FinancialStatement, "id" | "createdAt" | "updatedAt" | "sourceRecordId"> {}
export interface ProviderFinancialMetric extends Omit<FinancialMetric, "id" | "createdAt" | "updatedAt" | "sourceRecordId"> {}
export interface ProviderValuation extends Omit<ValuationSnapshot, "id" | "createdAt" | "updatedAt" | "sourceRecordId"> {}
export interface ProviderBenchmarkPrice extends Omit<BenchmarkPrice, "id" | "createdAt" | "updatedAt" | "sourceRecordId"> {}
export interface ProviderCorporateAction extends Omit<CorporateAction, "id" | "createdAt" | "updatedAt" | "sourceRecordId"> {}

export interface ProviderUniverseSecurity {
  providerSecurityId: string;
  providerCompanyId?: string;
  symbol: string;
  companyName: string;
  isin?: string;
  exchangeCode: string;
  exchangeName?: string;
  listedFrom: string;
  sectorName?: string;
  industryName?: string;
  sectorOutlook?: "supportive" | "neutral" | "unsupported" | "unknown";
  governanceStatus?: "clear" | "issue" | "unknown";
  structurallyDeteriorated?: boolean;
}

export interface CompanyMasterProvider {
  getUniverse(context?: ProviderRequestContext): Promise<ProviderEnvelope<ProviderUniverseSecurity[]>>;
}

export interface MarketDataProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;
  getQuote(securityId: string, context?: ProviderRequestContext): Promise<ProviderEnvelope<QuoteSnapshot>>;
  getHistoricalPrices(securityId: string, from: string, to: string, context?: ProviderRequestContext): Promise<ProviderEnvelope<ProviderPrice[]>>;
  getDividends(securityId: string, context?: ProviderRequestContext): Promise<ProviderEnvelope<ProviderDividend[]>>;
  getFinancials(companyId: string, context?: ProviderRequestContext): Promise<ProviderEnvelope<{ statements: ProviderFinancialStatement[]; metrics: ProviderFinancialMetric[] }>>;
  getValuations(securityId: string, context?: ProviderRequestContext): Promise<ProviderEnvelope<ProviderValuation[]>>;
  getBenchmarkData(benchmarkId: string, from: string, to: string, context?: ProviderRequestContext): Promise<ProviderEnvelope<ProviderBenchmarkPrice[]>>;
  getCorporateActions(securityId: string, context?: ProviderRequestContext): Promise<ProviderEnvelope<ProviderCorporateAction[]>>;
}

export interface NormalizedRecord<T> {
  data: T;
  providerId: string;
  sourceUrl?: string;
  retrievedAt: string;
  sourceDate?: string;
  raw: unknown;
  freshnessState: FreshnessState;
  warnings: string[];
}

export interface ProviderSettingsInput {
  providerId: string;
  displayName: string;
  enabled: boolean;
  priority: number;
  endpoint?: string;
  apiKey?: string;
  cacheTtlMs: number;
  freshnessThresholdMs: number;
  supportsBrowserRequests: boolean;
  capabilities: DataCategory[];
}
