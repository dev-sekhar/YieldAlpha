import type { DataCategory } from "./contracts.js";
import { finiteNumber, isoDate, MarketDataValidationError, validateDividendAmount, validatePriceBar } from "./normalize.js";

export type ImportKind = "prices" | "dividends" | "financials" | "metrics" | "valuations" | "benchmarks" | "corporate-actions";

export interface ImportOptions {
  kind: ImportKind;
  fileName?: string;
  providerId?: string;
  importedAt?: string;
}

export interface ImportError {
  row: number;
  message: string;
}

export interface ImportBatch<T = unknown> {
  kind: ImportKind;
  fileName?: string;
  providerId: string;
  importedAt: string;
  records: T[];
  errors: ImportError[];
  totalRows: number;
  acceptedCount: number;
  rejectedCount: number;
  status: "completed" | "partial" | "failed";
}

const IMPORT_KIND_TO_CATEGORY: Record<ImportKind, DataCategory> = {
  prices: "prices", dividends: "dividends", financials: "financials", metrics: "financials", valuations: "valuations", benchmarks: "benchmarks", "corporate-actions": "corporate-actions"
};

export function importCategory(kind: ImportKind): DataCategory {
  return IMPORT_KIND_TO_CATEGORY[kind];
}

function field(row: Record<string, unknown>, names: string[], required = true): string | undefined {
  const key = Object.keys(row).find((candidate) => names.includes(candidate.trim().toLowerCase()));
  const raw = key ? row[key] : undefined;
  const value = raw === undefined || raw === null ? undefined : String(raw).trim();
  if (required && !value) throw new MarketDataValidationError(`missing ${names[0]}`);
  return value || undefined;
}

function parseRecord(row: Record<string, unknown>, kind: ImportKind): Record<string, unknown> {
  if (kind === "prices") {
    const securityId = field(row, ["securityid", "security_id", "symbol"]);
    const tradingDate = isoDate(field(row, ["tradingdate", "trading_date", "date"]), "tradingDate");
    const close = finiteNumber(field(row, ["close", "adjustedclose", "adjusted_close"]), "close", { min: Number.MIN_VALUE });
    const high = field(row, ["high"]);
    const low = field(row, ["low"]);
    if (high && low) validatePriceBar({ close, tradingDate, high, low });
    return { securityId, tradingDate, close, ...(high ? { high: finiteNumber(high, "high", { min: 0 }) } : {}), ...(low ? { low: finiteNumber(low, "low", { min: 0 }) } : {}) };
  }
  if (kind === "dividends") {
    const securityId = field(row, ["securityid", "security_id", "symbol"]);
    const financialYear = finiteNumber(field(row, ["financialyear", "financial_year", "year"]), "financialYear", { min: 1900, max: 2200 });
    const amountPerShare = validateDividendAmount(field(row, ["amountpershare", "amount_per_share", "dividend"]));
    const dividendType = (field(row, ["dividendtype", "dividend_type"], false) ?? "regular").toLowerCase();
    if (dividendType !== "regular" && dividendType !== "special") throw new MarketDataValidationError("must be regular or special", "dividendType");
    return { securityId, financialYear, amountPerShare, dividendType };
  }
  if (kind === "financials") {
    const companyId = field(row, ["companyid", "company_id"]);
    const periodEnd = isoDate(field(row, ["periodend", "period_end", "date"]), "periodEnd");
    const periodType = (field(row, ["periodtype", "period_type"], false) ?? "annual").toLowerCase();
    if (periodType !== "annual" && periodType !== "quarterly") throw new MarketDataValidationError("must be annual or quarterly", "periodType");
    const optionalNumber = (names: string[], name: string) => { const value = field(row, names, false); return value === undefined ? undefined : finiteNumber(value, name); };
    return { companyId, periodEnd, periodType, ...(optionalNumber(["revenue"], "revenue") === undefined ? {} : { revenue: optionalNumber(["revenue"], "revenue") }), ...(optionalNumber(["netprofit", "net_profit"], "netProfit") === undefined ? {} : { netProfit: optionalNumber(["netprofit", "net_profit"], "netProfit") }), ...(optionalNumber(["eps"], "eps") === undefined ? {} : { eps: optionalNumber(["eps"], "eps") }), ...(optionalNumber(["freecashflow", "free_cash_flow"], "freeCashFlow") === undefined ? {} : { freeCashFlow: optionalNumber(["freecashflow", "free_cash_flow"], "freeCashFlow") }) };
  }
  if (kind === "metrics") {
    const companyId = field(row, ["companyid", "company_id"]);
    const periodEnd = isoDate(field(row, ["periodend", "period_end", "date"]), "periodEnd");
    const metric = field(row, ["metric"]);
    const allowed = ["roe", "roce", "debt-to-equity", "earnings-growth", "payout-ratio"];
    if (!allowed.includes(metric ?? "")) throw new MarketDataValidationError("unsupported metric", "metric");
    return { companyId, periodEnd, metric, value: finiteNumber(field(row, ["value"]), "value") };
  }
  if (kind === "valuations") {
    const securityId = field(row, ["securityid", "security_id", "symbol"]);
    const observedAt = isoDate(field(row, ["observedat", "observed_at", "date"]), "observedAt");
    const optionalNumber = (names: string[], name: string) => { const value = field(row, names, false); return value === undefined ? undefined : finiteNumber(value, name, { min: 0 }); };
    return { securityId, observedAt, ...(optionalNumber(["pe", "p/e"], "pe") === undefined ? {} : { pe: optionalNumber(["pe", "p/e"], "pe") }), ...(optionalNumber(["evtoebitda", "ev_to_ebitda"], "evToEbitda") === undefined ? {} : { evToEbitda: optionalNumber(["evtoebitda", "ev_to_ebitda"], "evToEbitda") }), ...(optionalNumber(["marketcapitalization", "market_capitalization"], "marketCapitalization") === undefined ? {} : { marketCapitalization: optionalNumber(["marketcapitalization", "market_capitalization"], "marketCapitalization") }), ...(optionalNumber(["historicalpercentile", "historical_percentile"], "historicalPercentile") === undefined ? {} : { historicalPercentile: optionalNumber(["historicalpercentile", "historical_percentile"], "historicalPercentile") }) };
  }
  if (kind === "benchmarks") {
    return { benchmarkId: field(row, ["benchmarkid", "benchmark_id"]), tradingDate: isoDate(field(row, ["tradingdate", "trading_date", "date"]), "tradingDate"), close: finiteNumber(field(row, ["close"]), "close", { min: Number.MIN_VALUE }) };
  }
  const securityId = field(row, ["securityid", "security_id", "symbol"]);
  return { securityId, actionType: field(row, ["actiontype", "action_type"]), effectiveDate: isoDate(field(row, ["effectivedate", "effective_date", "date"]), "effectiveDate"), details: parseDetails(field(row, ["details"], false)) };
}

function parseDetails(value?: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value)) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("details must be an object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new MarketDataValidationError("must be valid JSON object", "details");
  }
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) { cell += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (character === "," && !quoted) { cells.push(cell.trim()); cell = ""; continue; }
    cell += character;
  }
  if (quoted) throw new MarketDataValidationError("contains an unterminated quoted field");
  cells.push(cell.trim());
  return cells;
}

export function parseCsv(text: string, options: ImportOptions): ImportBatch<Record<string, unknown>> {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return { kind: options.kind, ...(options.fileName ? { fileName: options.fileName } : {}), providerId: options.providerId ?? "manual-import", importedAt: options.importedAt ?? new Date().toISOString(), records: [], errors: [{ row: 1, message: "CSV must contain a header and at least one data row" }], totalRows: 0, acceptedCount: 0, rejectedCount: 0, status: "failed" };
  let headers: string[];
  try {
    headers = splitCsvLine(lines[0] ?? "").map((header) => header.toLowerCase());
    if (headers.some((header) => header.length === 0)) throw new MarketDataValidationError("header contains an empty column name");
    if (new Set(headers).size !== headers.length) throw new MarketDataValidationError("header contains duplicate column names");
  } catch (error) {
    return { kind: options.kind, ...(options.fileName ? { fileName: options.fileName } : {}), providerId: options.providerId ?? "manual-import", importedAt: options.importedAt ?? new Date().toISOString(), records: [], errors: [{ row: 1, message: error instanceof Error ? error.message : "invalid CSV header" }], totalRows: 0, acceptedCount: 0, rejectedCount: 0, status: "failed" };
  }
  const records: Record<string, unknown>[] = [];
  const errors: ImportError[] = [];
  lines.slice(1).forEach((line, offset) => {
    try {
      const cells = splitCsvLine(line);
      if (cells.length !== headers.length) throw new MarketDataValidationError(`expected ${headers.length} columns, received ${cells.length}`);
      const row: Record<string, unknown> = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
      records.push(parseRecord(row, options.kind));
    } catch (error) {
      errors.push({ row: offset + 2, message: error instanceof Error ? error.message : "invalid row" });
    }
  });
  return { kind: options.kind, ...(options.fileName ? { fileName: options.fileName } : {}), providerId: options.providerId ?? "manual-import", importedAt: options.importedAt ?? new Date().toISOString(), records, errors, totalRows: lines.length - 1, acceptedCount: records.length, rejectedCount: errors.length, status: records.length === 0 ? "failed" : errors.length > 0 ? "partial" : "completed" };
}

export function parseJson(text: string, options: ImportOptions): ImportBatch<Record<string, unknown>> {
  let parsed: unknown;
  try { parsed = JSON.parse(text) as unknown; } catch { return { kind: options.kind, ...(options.fileName ? { fileName: options.fileName } : {}), providerId: options.providerId ?? "manual-import", importedAt: options.importedAt ?? new Date().toISOString(), records: [], errors: [{ row: 1, message: "JSON is invalid" }], totalRows: 0, acceptedCount: 0, rejectedCount: 0, status: "failed" }; }
  const values = Array.isArray(parsed) ? parsed : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { records?: unknown }).records) ? (parsed as { records: unknown[] }).records : undefined;
  if (!values) return { kind: options.kind, ...(options.fileName ? { fileName: options.fileName } : {}), providerId: options.providerId ?? "manual-import", importedAt: options.importedAt ?? new Date().toISOString(), records: [], errors: [{ row: 1, message: "JSON must be an array or an object with a records array" }], totalRows: 0, acceptedCount: 0, rejectedCount: 0, status: "failed" };
  const records: Record<string, unknown>[] = [];
  const errors: ImportError[] = [];
  values.forEach((value, index) => {
    try {
      if (typeof value !== "object" || value === null || Array.isArray(value)) throw new MarketDataValidationError("row must be an object");
      records.push(parseRecord(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key.toLowerCase(), entry])), options.kind));
    } catch (error) { errors.push({ row: index + 1, message: error instanceof Error ? error.message : "invalid row" }); }
  });
  return { kind: options.kind, ...(options.fileName ? { fileName: options.fileName } : {}), providerId: options.providerId ?? "manual-import", importedAt: options.importedAt ?? new Date().toISOString(), records, errors, totalRows: values.length, acceptedCount: records.length, rejectedCount: errors.length, status: records.length === 0 ? "failed" : errors.length > 0 ? "partial" : "completed" };
}
