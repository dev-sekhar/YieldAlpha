import { BrowserFetchMarketDataProvider, type FetchProviderRoutes } from "./fetch-provider.js";
import type { ProviderBenchmarkPrice, ProviderCorporateAction, ProviderDividend, ProviderFinancialMetric, ProviderFinancialStatement, ProviderPrice, ProviderSettingsInput, ProviderUniverseSecurity, ProviderValuation, QuoteSnapshot } from "./contracts.js";

type RecordValue = Record<string, unknown>;

function record(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be a JSON object`);
  return value as RecordValue;
}

function payload(value: unknown): unknown {
  const object = value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : undefined;
  return object?.data ?? value;
}

function arrayPayload(value: unknown, label: string): unknown[] {
  const unwrapped = payload(value);
  if (Array.isArray(unwrapped)) return unwrapped;
  const object = record(unwrapped, label);
  for (const key of ["records", "items", "results", "data"]) if (Array.isArray(object[key])) return object[key] as unknown[];
  throw new Error(`${label} response must contain an array`);
}

function text(object: RecordValue, names: string[], label: string, required = true): string | undefined {
  const key = names.find((candidate) => object[candidate] !== undefined && object[candidate] !== null);
  const value = key === undefined ? undefined : String(object[key]).trim();
  if (required && !value) throw new Error(`${label} is missing from provider response`);
  return value || undefined;
}

function number(object: RecordValue, names: string[], label: string, required = true): number | undefined {
  const key = names.find((candidate) => object[candidate] !== undefined && object[candidate] !== null);
  const value = key === undefined ? undefined : Number(object[key]);
  if (required && (!Number.isFinite(value))) throw new Error(`${label} is missing or invalid in provider response`);
  return Number.isFinite(value) ? value : undefined;
}

function date(object: RecordValue, names: string[], label: string, required = true): string | undefined {
  const value = text(object, names, label, required);
  if (value !== undefined && Number.isNaN(Date.parse(value))) throw new Error(`${label} is not a valid date`);
  return value;
}

function boolean(object: RecordValue, names: string[], label: string, required = true): boolean | undefined {
  const key = names.find((candidate) => object[candidate] !== undefined && object[candidate] !== null);
  if (key === undefined) {
    if (required) throw new Error(`${label} is missing from provider response`);
    return undefined;
  }
  const value = object[key];
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new Error(`${label} is invalid in provider response`);
}

function routeUrl(endpoint: string, path: string, params: Record<string, string | undefined>): string {
  const base = endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
  const url = new URL(path.replace(/^\//, ""), base);
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, value);
  return url.toString();
}

function decodeUniverse(raw: unknown): ProviderUniverseSecurity[] {
  return arrayPayload(raw, "universe").map((item) => {
    const value = record(item, "universe security");
    const providerSecurityId = text(value, ["providerSecurityId", "provider_security_id", "securityId", "security_id", "id"], "providerSecurityId");
    const symbol = text(value, ["symbol", "ticker"], "symbol");
    const companyName = text(value, ["companyName", "company_name", "name"], "companyName");
    const exchangeCode = text(value, ["exchangeCode", "exchange_code", "exchange"], "exchangeCode");
    const listedFrom = date(value, ["listedFrom", "listed_from", "listingDate", "listing_date"], "listedFrom");
    if (!providerSecurityId || !symbol || !companyName || !exchangeCode || !listedFrom) throw new Error("Universe row is missing a required identity field");
    const result: ProviderUniverseSecurity = { providerSecurityId, symbol, companyName, exchangeCode, listedFrom };
    const optionalText: Array<[keyof ProviderUniverseSecurity, string[], string]> = [
      ["providerCompanyId", ["providerCompanyId", "provider_company_id", "companyId", "company_id"], "providerCompanyId"],
      ["isin", ["isin"], "isin"], ["exchangeName", ["exchangeName", "exchange_name"], "exchangeName"],
      ["sectorName", ["sectorName", "sector_name", "sector"], "sectorName"], ["industryName", ["industryName", "industry_name", "industry"], "industryName"],
      ["sectorOutlook", ["sectorOutlook", "sector_outlook"], "sectorOutlook"], ["governanceStatus", ["governanceStatus", "governance_status"], "governanceStatus"]
    ];
    for (const [key, names, label] of optionalText) {
      const valueText = text(value, names, label, false);
      if (valueText !== undefined) {
        if (key === "sectorOutlook" && !["supportive", "neutral", "unsupported", "unknown"].includes(valueText)) throw new Error("sectorOutlook is invalid");
        if (key === "governanceStatus" && !["clear", "issue", "unknown"].includes(valueText)) throw new Error("governanceStatus is invalid");
        result[key] = valueText as never;
      }
    }
    const structurallyDeteriorated = boolean(value, ["structurallyDeteriorated", "structurally_deteriorated"], "structurallyDeteriorated", false);
    if (structurallyDeteriorated !== undefined) result.structurallyDeteriorated = structurallyDeteriorated;
    return result;
  });
}

function routes(endpoint: string): FetchProviderRoutes {
  return {
    universe: { url: () => routeUrl(endpoint, "universe", {}), decode: decodeUniverse },
    quote: { url: ({ securityId, asOf }) => routeUrl(endpoint, "quote", { securityId, asOf }), decode: (raw) => { const value = record(payload(raw), "quote"); return { securityId: text(value, ["securityId", "security_id"], "securityId") ?? "", symbol: text(value, ["symbol", "ticker"], "symbol") ?? "", currentPrice: number(value, ["currentPrice", "current_price", "price"], "currentPrice") ?? 0, week52High: number(value, ["week52High", "week_52_high", "52WeekHigh"], "week52High") ?? 0, week52Low: number(value, ["week52Low", "week_52_low", "52WeekLow"], "week52Low") ?? 0, observedAt: date(value, ["observedAt", "observed_at", "timestamp"], "observedAt") ?? "", currency: "INR" }; } },
    prices: { url: ({ securityId, from, to }) => routeUrl(endpoint, "prices", { securityId, from, to }), decode: (raw) => arrayPayload(raw, "prices").map((item) => { const value = record(item, "price"); return { kind: "price-history", securityId: text(value, ["securityId", "security_id"], "securityId", false), tradingDate: date(value, ["tradingDate", "trading_date", "date"], "tradingDate") ?? "", close: number(value, ["close", "price"], "close") ?? 0, ...(number(value, ["open"], "open", false) !== undefined ? { open: number(value, ["open"], "open", false) } : {}), ...(number(value, ["high"], "high", false) !== undefined ? { high: number(value, ["high"], "high", false) } : {}), ...(number(value, ["low"], "low", false) !== undefined ? { low: number(value, ["low"], "low", false) } : {}), ...(number(value, ["adjustedClose", "adjusted_close"], "adjustedClose", false) !== undefined ? { adjustedClose: number(value, ["adjustedClose", "adjusted_close"], "adjustedClose", false) } : {}), ...(number(value, ["volume"], "volume", false) !== undefined ? { volume: number(value, ["volume"], "volume", false) } : {}) } as ProviderPrice; }) },
    dividends: { url: ({ securityId }) => routeUrl(endpoint, "dividends", { securityId }), decode: (raw) => arrayPayload(raw, "dividends").map((item) => { const value = record(item, "dividend"); const type = (text(value, ["dividendType", "dividend_type", "type"], "dividendType", false) ?? "regular").toLowerCase(); if (type !== "regular" && type !== "special") throw new Error("dividendType must be regular or special"); return { kind: "dividend", securityId: text(value, ["securityId", "security_id"], "securityId", false), financialYear: number(value, ["financialYear", "financial_year", "year"], "financialYear") ?? 0, amountPerShare: number(value, ["amountPerShare", "amount_per_share", "dividend"], "amountPerShare") ?? 0, dividendType: type, ...(date(value, ["paymentDate", "payment_date"], "paymentDate", false) ? { paymentDate: date(value, ["paymentDate", "payment_date"], "paymentDate", false) } : {}), ...(date(value, ["declaredDate", "declared_date", "announcementDate"], "declaredDate", false) ? { declaredDate: date(value, ["declaredDate", "declared_date", "announcementDate"], "declaredDate", false) } : {}) } as ProviderDividend; }) },
    financials: { url: ({ companyId }) => routeUrl(endpoint, "financials", { companyId }), decode: (raw) => { const value = record(payload(raw), "financials"); const statements = arrayPayload(value.statements ?? value.financialStatements, "financial statements").map((item) => { const row = record(item, "financial statement"); return { kind: "financial-statement", companyId: text(row, ["companyId", "company_id"], "companyId", false), periodEnd: date(row, ["periodEnd", "period_end"], "periodEnd") ?? "", periodType: ((text(row, ["periodType", "period_type"], "periodType", false) ?? "annual").toLowerCase() === "quarterly" ? "quarterly" : "annual"), ...(number(row, ["revenue"], "revenue", false) !== undefined ? { revenue: number(row, ["revenue"], "revenue", false) } : {}), ...(number(row, ["netProfit", "net_profit", "pat"], "netProfit", false) !== undefined ? { netProfit: number(row, ["netProfit", "net_profit", "pat"], "netProfit", false) } : {}), ...(number(row, ["eps"], "eps", false) !== undefined ? { eps: number(row, ["eps"], "eps", false) } : {}), ...(number(row, ["freeCashFlow", "free_cash_flow"], "freeCashFlow", false) !== undefined ? { freeCashFlow: number(row, ["freeCashFlow", "free_cash_flow"], "freeCashFlow", false) } : {}) } as ProviderFinancialStatement; }); const metrics = arrayPayload(value.metrics ?? value.financialMetrics, "financial metrics").map((item) => { const row = record(item, "financial metric"); const metric = text(row, ["metric", "name"], "metric") ?? ""; return { kind: "financial-metric", companyId: text(row, ["companyId", "company_id"], "companyId", false), metric: metric as ProviderFinancialMetric["metric"], periodEnd: date(row, ["periodEnd", "period_end"], "periodEnd") ?? "", value: number(row, ["value"], "value") ?? 0 } as ProviderFinancialMetric; }); return { statements, metrics }; } },
    valuations: { url: ({ securityId }) => routeUrl(endpoint, "valuations", { securityId }), decode: (raw) => arrayPayload(raw, "valuations").map((item) => { const value = record(item, "valuation"); return { kind: "valuation-snapshot", securityId: text(value, ["securityId", "security_id"], "securityId", false), observedAt: date(value, ["observedAt", "observed_at", "date"], "observedAt") ?? "", ...(number(value, ["pe", "p/e"], "pe", false) !== undefined ? { pe: number(value, ["pe", "p/e"], "pe", false) } : {}), ...(number(value, ["evToEbitda", "ev_to_ebitda"], "evToEbitda", false) !== undefined ? { evToEbitda: number(value, ["evToEbitda", "ev_to_ebitda"], "evToEbitda", false) } : {}), ...(number(value, ["marketCapitalization", "market_capitalization"], "marketCapitalization", false) !== undefined ? { marketCapitalization: number(value, ["marketCapitalization", "market_capitalization"], "marketCapitalization", false) } : {}), ...(number(value, ["historicalPercentile", "historical_percentile"], "historicalPercentile", false) !== undefined ? { historicalPercentile: number(value, ["historicalPercentile", "historical_percentile"], "historicalPercentile", false) } : {}) } as ProviderValuation; }) },
    benchmarks: { url: ({ benchmarkId, from, to }) => routeUrl(endpoint, "benchmarks", { benchmarkId, from, to }), decode: (raw) => arrayPayload(raw, "benchmarks").map((item) => { const value = record(item, "benchmark price"); return { kind: "benchmark-price", benchmarkId: text(value, ["benchmarkId", "benchmark_id"], "benchmarkId", false), tradingDate: date(value, ["tradingDate", "trading_date", "date"], "tradingDate") ?? "", close: number(value, ["close", "value"], "close") ?? 0 } as ProviderBenchmarkPrice; }) },
    corporateActions: { url: ({ securityId }) => routeUrl(endpoint, "corporate-actions", { securityId }), decode: (raw) => arrayPayload(raw, "corporate actions").map((item) => { const value = record(item, "corporate action"); return { kind: "corporate-action", securityId: text(value, ["securityId", "security_id"], "securityId", false), actionType: text(value, ["actionType", "action_type", "type"], "actionType") as ProviderCorporateAction["actionType"], effectiveDate: date(value, ["effectiveDate", "effective_date", "date"], "effectiveDate") ?? "", details: record(value.details ?? {}, "corporate action details") } as ProviderCorporateAction; }) }
  };
}

export function createConfiguredBrowserProvider(settings: ProviderSettingsInput): BrowserFetchMarketDataProvider {
  return new BrowserFetchMarketDataProvider(settings, routes(settings.endpoint ?? ""));
}
