import type {
  DataCategory, MarketDataProvider, ProviderBenchmarkPrice, ProviderCorporateAction, ProviderDividend,
  ProviderEnvelope, ProviderFinancialMetric, ProviderFinancialStatement, ProviderPrice, ProviderRequestContext,
  ProviderCapabilities, ProviderValuation, QuoteSnapshot
} from "./contracts.js";
import type { CompanyMasterProvider, ProviderUniverseSecurity } from "./contracts.js";
import { BrowserJsonTransport, buildApiKeyHeaders } from "./transport.js";
import type { ProviderSettingsInput } from "./contracts.js";

export interface ProviderRoute<TArgs, T> {
  url: (args: TArgs) => string;
  decode: (raw: unknown) => T;
  cacheKey?: (args: TArgs) => string;
}

export interface FetchProviderRoutes {
  universe?: ProviderRoute<Record<string, never>, ProviderUniverseSecurity[]>;
  quote: ProviderRoute<{ securityId: string; asOf?: string }, QuoteSnapshot>;
  prices: ProviderRoute<{ securityId: string; from: string; to: string }, ProviderPrice[]>;
  dividends: ProviderRoute<{ securityId: string }, ProviderDividend[]>;
  financials: ProviderRoute<{ companyId: string }, { statements: ProviderFinancialStatement[]; metrics: ProviderFinancialMetric[] }>;
  valuations: ProviderRoute<{ securityId: string }, ProviderValuation[]>;
  benchmarks: ProviderRoute<{ benchmarkId: string; from: string; to: string }, ProviderBenchmarkPrice[]>;
  corporateActions: ProviderRoute<{ securityId: string }, ProviderCorporateAction[]>;
}

/**
 * Generic browser adapter. Provider-specific URL and response parsing stay in
 * the supplied routes, so the core application never depends on one API shape.
 */
export class BrowserFetchMarketDataProvider implements MarketDataProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;

  constructor(
    private readonly settings: ProviderSettingsInput,
    private readonly routes: FetchProviderRoutes,
    private readonly transport: BrowserJsonTransport = new BrowserJsonTransport()
  ) {
    if (!settings.supportsBrowserRequests) throw new Error(`Provider ${settings.providerId} is not configured for browser requests`);
    if (!settings.endpoint || !/^https:\/\//i.test(settings.endpoint)) throw new Error("A browser provider requires an HTTPS endpoint");
    this.id = settings.providerId;
    this.displayName = settings.displayName;
    this.capabilities = { categories: settings.capabilities, browserRequests: true, corsRequired: true, supportsHistoricalAsOf: false };
  }

  private async request<TArgs, T>(route: ProviderRoute<TArgs, T>, args: TArgs, context?: ProviderRequestContext): Promise<ProviderEnvelope<T>> {
    const url = route.url(args);
    if (!/^https:\/\//i.test(url)) throw new Error("Provider route must produce an HTTPS URL");
    const response = await this.transport.requestJson<unknown>({
      url,
      init: { headers: { Accept: "application/json", ...buildApiKeyHeaders(this.settings) } },
      ...(route.cacheKey ? { cacheKey: route.cacheKey(args) } : {}),
      ...(this.settings.cacheTtlMs > 0 ? { cacheTtlMs: this.settings.cacheTtlMs } : {}),
      ...(context?.signal ? { signal: context.signal } : {})
    });
    return { providerId: this.id, sourceUrl: response.url, retrievedAt: response.retrievedAt, raw: response.data, data: route.decode(response.data), ...(response.fromCache ? { fromCache: true } : {}) };
  }

  getQuote(securityId: string, context?: ProviderRequestContext): Promise<ProviderEnvelope<QuoteSnapshot>> {
    return this.request(this.routes.quote, { securityId, ...(context?.asOf ? { asOf: context.asOf } : {}) }, context);
  }

  getHistoricalPrices(securityId: string, from: string, to: string, context?: ProviderRequestContext): Promise<ProviderEnvelope<ProviderPrice[]>> {
    return this.request(this.routes.prices, { securityId, from, to }, context);
  }

  getDividends(securityId: string, context?: ProviderRequestContext): Promise<ProviderEnvelope<ProviderDividend[]>> {
    return this.request(this.routes.dividends, { securityId }, context);
  }

  getFinancials(companyId: string, context?: ProviderRequestContext): Promise<ProviderEnvelope<{ statements: ProviderFinancialStatement[]; metrics: ProviderFinancialMetric[] }>> {
    return this.request(this.routes.financials, { companyId }, context);
  }

  getValuations(securityId: string, context?: ProviderRequestContext): Promise<ProviderEnvelope<ProviderValuation[]>> {
    return this.request(this.routes.valuations, { securityId }, context);
  }

  getBenchmarkData(benchmarkId: string, from: string, to: string, context?: ProviderRequestContext): Promise<ProviderEnvelope<ProviderBenchmarkPrice[]>> {
    return this.request(this.routes.benchmarks, { benchmarkId, from, to }, context);
  }

  getCorporateActions(securityId: string, context?: ProviderRequestContext): Promise<ProviderEnvelope<ProviderCorporateAction[]>> {
    return this.request(this.routes.corporateActions, { securityId }, context);
  }

  async getUniverse(context?: ProviderRequestContext): Promise<ProviderEnvelope<ProviderUniverseSecurity[]>> {
    if (!this.routes.universe) throw new Error("This provider has no company-master universe endpoint");
    return this.request(this.routes.universe, {}, context);
  }
}
