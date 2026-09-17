import type { FreshnessState, SourceRecord } from "../storage/types.js";
import type { NormalizedRecord, ProviderEnvelope, QuoteSnapshot } from "./contracts.js";

export class MarketDataValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(field ? `${field}: ${message}` : message);
    this.name = "MarketDataValidationError";
  }
}

export interface FreshnessPolicy {
  thresholdMs: number;
  now?: string;
}

export function assessFreshness(retrievedAt: string, policy: FreshnessPolicy, fromCache = false): FreshnessState {
  const retrieved = Date.parse(retrievedAt);
  const now = Date.parse(policy.now ?? new Date().toISOString());
  if (!Number.isFinite(retrieved) || !Number.isFinite(now)) return "NOT_VERIFIED";
  if (fromCache) return now - retrieved <= policy.thresholdMs ? "CACHED" : "STALE";
  return now - retrieved <= policy.thresholdMs ? "LIVE" : "STALE";
}

export function finiteNumber(value: unknown, field: string, options: { min?: number; max?: number } = {}): number {
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(result)) throw new MarketDataValidationError("must be a finite number", field);
  if (options.min !== undefined && result < options.min) throw new MarketDataValidationError(`must be >= ${options.min}`, field);
  if (options.max !== undefined && result > options.max) throw new MarketDataValidationError(`must be <= ${options.max}`, field);
  return result;
}

export function isoDate(value: unknown, field: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new MarketDataValidationError("must be a valid ISO date or timestamp", field);
  return value;
}

export function normalizeQuote(envelope: ProviderEnvelope<QuoteSnapshot>, policy: FreshnessPolicy, fromCache = false): NormalizedRecord<QuoteSnapshot> {
  const quote = envelope.data;
  const currentPrice = finiteNumber(quote.currentPrice, "currentPrice", { min: Number.MIN_VALUE });
  const week52Low = finiteNumber(quote.week52Low, "week52Low", { min: 0 });
  const week52High = finiteNumber(quote.week52High, "week52High", { min: week52Low });
  if (currentPrice < week52Low || currentPrice > week52High) throw new MarketDataValidationError("must be between 52-week low and high", "currentPrice");
  const warnings: string[] = [];
  if (week52High === week52Low) warnings.push("52-week range has no spread");
  return { data: { ...quote, currentPrice, week52Low, week52High, observedAt: isoDate(quote.observedAt, "observedAt") }, providerId: envelope.providerId, ...(envelope.sourceUrl ? { sourceUrl: envelope.sourceUrl } : {}), retrievedAt: isoDate(envelope.retrievedAt, "retrievedAt"), ...(envelope.sourceDate ? { sourceDate: isoDate(envelope.sourceDate, "sourceDate") } : {}), raw: envelope.raw, freshnessState: assessFreshness(envelope.retrievedAt, policy, fromCache), warnings };
}

export function validatePriceBar(value: { close: unknown; tradingDate: unknown; high?: unknown; low?: unknown }): string[] {
  const warnings: string[] = [];
  finiteNumber(value.close, "close", { min: Number.MIN_VALUE });
  isoDate(value.tradingDate, "tradingDate");
  if (value.high !== undefined) finiteNumber(value.high, "high", { min: 0 });
  if (value.low !== undefined) finiteNumber(value.low, "low", { min: 0 });
  if (value.high !== undefined && value.low !== undefined && Number(value.low) > Number(value.high)) throw new MarketDataValidationError("must not exceed high", "low");
  return warnings;
}

export function validateDividendAmount(value: unknown): number {
  return finiteNumber(value, "amountPerShare", { min: 0 });
}

export function createSourceRecord<T>(record: NormalizedRecord<T>, subjectType: string, subjectId: string, id: string, now = new Date().toISOString()): SourceRecord {
  const validationStatus = record.freshnessState === "CONFLICTING" ? "conflicting" : record.freshnessState === "STALE" ? "stale" : record.freshnessState === "UNAVAILABLE" ? "unavailable" : record.freshnessState === "NOT_VERIFIED" ? "not-verified" : "valid";
  return { id, kind: "source-record", createdAt: now, updatedAt: now, provider: record.providerId, ...(record.sourceUrl ? { sourceUrl: record.sourceUrl } : {}), retrievalTimestamp: record.retrievedAt, ...(record.sourceDate ? { sourceDate: record.sourceDate } : {}), rawValue: record.raw, normalizedValue: record.data, confidence: record.freshnessState === "LIVE" ? "high" : "medium", validationStatus, verificationStatus: validationStatus, freshnessState: record.freshnessState, subjectType, subjectId };
}
