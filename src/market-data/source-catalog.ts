import { createAuditEvent } from "../audit/service.js";
import type { DataSourceConfig, WorkspaceRepository } from "../storage/index.js";

type CatalogRow = Omit<DataSourceConfig, "id" | "kind" | "createdAt" | "updatedAt" | "version">;

// Source metadata transcribed from the workbook's "Data Sources" tab. These
// rows are configuration/provenance only; they contain no market observations.
const CATALOG: Array<CatalogRow & { id: string }> = [
  { id: "source-nse-india", name: "NSE India", tier: "Tier 1", primaryUse: "Security master; corporate actions; dividends; filings; Nifty/TRI", productionRole: "Authoritative / preferred", url: "https://www.nseindia.com/", researchUsed: true, notes: "Use provider adapter; verify redistribution/licensing.", enabled: true },
  { id: "source-bse-india", name: "BSE India", tier: "Tier 1", primaryUse: "Security master; corporate actions; filings; Sensex/TRI", productionRole: "Authoritative / preferred", url: "https://www.bseindia.com/", researchUsed: true, notes: "Commercial market-data licensing may apply.", enabled: true },
  { id: "source-company-ir-filings", name: "Company IR / filings", tier: "Tier 1", primaryUse: "Annual/quarterly results; dividends; corporate actions", productionRole: "Authoritative company source", url: "Company-specific investor-relations URLs", researchUsed: true, notes: "Preferred when company-specific disclosure is definitive.", enabled: true },
  { id: "source-government-regulators", name: "Government / regulators", tier: "Tier 1", primaryUse: "Sector/macro data", productionRole: "Authoritative context", url: "https://www.pib.gov.in/", researchUsed: true, notes: "RBI/SEBI/ministries as applicable.", enabled: true },
  { id: "source-licensed-provider", name: "Licensed market-data provider", tier: "Tier 2", primaryUse: "Fresh quotes; OHLC; historical data", productionRole: "Preferred structured market feed", url: "Configured in deployment", researchUsed: false, notes: "Must have suitable commercial/redistribution rights.", enabled: true },
  { id: "source-moneycontrol", name: "Moneycontrol", tier: "Tier 3", primaryUse: "Prices; 52W range; dividends; company facts", productionRole: "Secondary verification", url: "https://www.moneycontrol.com/", researchUsed: true, notes: "Do not make HTML scraping the core architecture.", enabled: true },
  { id: "source-economic-times", name: "Economic Times Markets", tier: "Tier 3", primaryUse: "Quotes; historical prices; 52W range", productionRole: "Secondary verification", url: "https://economictimes.indiatimes.com/markets", researchUsed: true, notes: "Underlying data rights do not automatically transfer.", enabled: true },
  { id: "source-upstox", name: "Upstox", tier: "Tier 3", primaryUse: "Quote/52W verification", productionRole: "Secondary / potential API", url: "https://upstox.com/", researchUsed: true, notes: "Prefer official API.", enabled: true },
  { id: "source-dhan", name: "Dhan", tier: "Tier 3", primaryUse: "Quote verification", productionRole: "Secondary / potential API", url: "https://dhan.co/", researchUsed: true, notes: "Prefer official API.", enabled: true },
  { id: "source-icici-direct", name: "ICICI Direct", tier: "Tier 3", primaryUse: "Quote verification", productionRole: "Secondary", url: "https://www.icicidirect.com/", researchUsed: true, notes: "Use only with suitable terms/API.", enabled: true },
  { id: "source-equitypandit", name: "EquityPandit", tier: "Tier 4", primaryUse: "Historical OHLC reconstruction", productionRole: "Backtest verification", url: "https://www.equitypandit.com/", researchUsed: true, notes: "Used for 2021 historical execution-price checks.", enabled: true },
  { id: "source-stockpricearchive", name: "StockPriceArchive", tier: "Tier 4", primaryUse: "Historical price reconstruction", productionRole: "Backtest cross-check", url: "https://stockpricearchive.com/", researchUsed: true, notes: "Used in earlier 2020 reconstruction.", enabled: true },
  { id: "source-goodreturns", name: "Goodreturns", tier: "Tier 4", primaryUse: "Dividend cross-checks", productionRole: "Secondary verification", url: "https://www.goodreturns.in/", researchUsed: true, notes: "Used for dividend verification.", enabled: true },
  { id: "source-investing-india", name: "Investing.com India", tier: "Tier 4", primaryUse: "Dividend/yield/history cross-check", productionRole: "Secondary verification", url: "https://in.investing.com/", researchUsed: true, notes: "Licensing/API required for production use.", enabled: true },
  { id: "source-ipo-central", name: "IPO Central", tier: "Tier 4", primaryUse: "Listing-date cross-check", productionRole: "Secondary verification", url: "https://ipocentral.in/", researchUsed: true, notes: "Prefer exchange security master.", enabled: true },
  { id: "source-reuters", name: "Reuters", tier: "Context", primaryUse: "News/geopolitical/market context", productionRole: "Research context only", url: "https://www.reuters.com/", researchUsed: true, notes: "Do not redistribute without rights.", enabled: true }
];

function nowIso(): string { return new Date().toISOString(); }

export async function initializeDataSources(repository: WorkspaceRepository, now = nowIso()): Promise<DataSourceConfig[]> {
  const existing = await repository.getAll("dataSources");
  if (existing.length) return existing;
  const records = CATALOG.map((row) => ({ ...row, kind: "data-source-config" as const, createdAt: now, updatedAt: now, version: 1 }));
  const audit = createAuditEvent({ now, eventType: "data-sources", action: "data-source-catalog-initialized", actorType: "system", entityType: "data-source-catalog", entityId: "default-catalog", previousState: {}, newState: { sourceIds: records.map((record) => record.id) }, reason: "Initialized source metadata from the workbook Data Sources tab", correlationId: "default-data-source-catalog" });
  await repository.putBatch([...records.map((value) => ({ store: "dataSources" as const, value })), { store: "auditEvents" as const, value: audit }]);
  return records;
}

export async function saveDataSourceConfig(repository: WorkspaceRepository, input: DataSourceConfig, now = nowIso()): Promise<DataSourceConfig> {
  const previous = (await repository.getAll("dataSources")).find((record) => record.id === input.id);
  const record: DataSourceConfig = { ...input, updatedAt: now, version: (previous?.version ?? input.version ?? 0) + 1 };
  const audit = createAuditEvent({ now, eventType: "data-sources", action: previous ? "data-source-updated" : "data-source-created", actorType: "user", entityType: "data-source-config", entityId: record.id, previousState: previous ?? {}, newState: record, reason: previous ? "User edited a configured data source" : "User added a data source", correlationId: record.id });
  await repository.putBatch([{ store: "dataSources", value: record }, { store: "auditEvents", value: audit }]);
  return record;
}

export function defaultDataSources(): Array<CatalogRow & { id: string }> {
  return CATALOG.map((row) => ({ ...row }));
}
