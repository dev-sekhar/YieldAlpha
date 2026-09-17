import type { Alert, AuditEvent, ModelSignal, WorkspaceRepository } from "../storage/index.js";
import type { RecommendationChange, RecommendationComparison, RecommendationStateSnapshot } from "./types.js";
import { hashState } from "../audit/hash.js";
import { createAuditEvent } from "../audit/service.js";

const APPLICATION_VERSION = "0.1.0";
const PRIORITY_RANK = { informational: 0, medium: 1, high: 2, critical: 3 } as const;
const TRACKED_FIELDS: Array<{ name: keyof RecommendationStateSnapshot; threshold?: number }> = [
  { name: "classification" }, { name: "expectedNominalCagr", threshold: 0.02 }, { name: "expectedRealCagr", threshold: 0.02 },
  { name: "dividendEligible" }, { name: "dividendYield", threshold: 0.01 }, { name: "dividendGrowth", threshold: 0.02 },
  { name: "dividendGrowthTrend" }, { name: "valuationMarginOfSafety", threshold: 0.05 }, { name: "currentMultiple", threshold: 0.5 },
  { name: "earningsGrowthRate", threshold: 0.05 }, { name: "revenueGrowthRate", threshold: 0.05 }, { name: "profitGrowthRate", threshold: 0.05 },
  { name: "debtToEquity", threshold: 0.1 }, { name: "roce", threshold: 0.05 }, { name: "sectorOutlook" }, { name: "dataConfidence" },
  { name: "reasonCodes" }, { name: "staleFields" }, { name: "conflictingFields" }, { name: "unverifiedFields" },
  { name: "scenarioDownsideCagr", threshold: 0.02 }, { name: "scenarioBaseCagr", threshold: 0.02 }, { name: "scenarioUpsideCagr", threshold: 0.02 }
];

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as UnknownRecord : {};
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as UnknownRecord)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function stateFromSignal(signal: ModelSignal): RecommendationStateSnapshot {
  const input = record(signal.inputSnapshot);
  const quality = record(input.quality);
  const valuation = record(input.valuation);
  const dataQuality = record(input.dataQuality);
  const dividend = record(input.dividendAnalysis);
  const eligibility = record(dividend.eligibility);
  const metrics = record(dividend.metrics);
  const calculation = record(signal.scenarioSnapshot);
  const downside = record(calculation.downside);
  const base = record(calculation.base);
  const upside = record(calculation.upside);
  const sourceRecordIds = [...new Set([...(signal.sourceRecordIds ?? []), ...strings(dataQuality.sourceRecordIds)])];
  const companyName = string(input.companyName);
  const expectedNominalCagr = number(signal.expectedNominalCagr);
  const expectedRealCagr = number(signal.expectedRealCagr);
  const dividendYield = number(metrics.currentDividendYield);
  const dividendGrowth = number(metrics.dividendCagr);
  const valuationMarginOfSafety = number(valuation.marginOfSafety);
  const currentMultiple = number(valuation.currentMultiple);
  const earningsGrowthRate = number(quality.earningsGrowthRate);
  const revenueGrowthRate = number(input.expectedRevenueGrowthRate);
  const profitGrowthRate = number(input.expectedProfitGrowthRate);
  const debtToEquity = number(quality.debtToEquity);
  const roce = number(quality.roce);
  const sectorOutlook = string(quality.sectorOutlook);
  const dividendGrowthTrend = string(metrics.growthTrend);
  const scenarioDownsideCagr = number(downside.nominalCagr);
  const scenarioBaseCagr = number(base.nominalCagr);
  const scenarioUpsideCagr = number(upside.nominalCagr);
  return {
    companyId: signal.companyId,
    ...(companyName !== undefined ? { companyName } : {}),
    classification: signal.classification,
    confidence: signal.confidence,
    dataConfidence: signal.confidence,
    reasonCodes: [...signal.reasonCodes],
    ...(expectedNominalCagr !== undefined ? { expectedNominalCagr } : {}),
    ...(expectedRealCagr !== undefined ? { expectedRealCagr } : {}),
    ...(typeof eligibility.passes === "boolean" ? { dividendEligible: eligibility.passes } : {}),
    ...(dividendYield !== undefined ? { dividendYield } : {}), ...(dividendGrowth !== undefined ? { dividendGrowth } : {}),
    ...(dividendGrowthTrend !== undefined ? { dividendGrowthTrend } : {}), ...(valuationMarginOfSafety !== undefined ? { valuationMarginOfSafety } : {}),
    ...(currentMultiple !== undefined ? { currentMultiple } : {}), ...(earningsGrowthRate !== undefined ? { earningsGrowthRate } : {}),
    ...(revenueGrowthRate !== undefined ? { revenueGrowthRate } : {}), ...(profitGrowthRate !== undefined ? { profitGrowthRate } : {}),
    ...(debtToEquity !== undefined ? { debtToEquity } : {}), ...(roce !== undefined ? { roce } : {}),
    ...(sectorOutlook !== undefined ? { sectorOutlook } : {}),
    staleFields: strings(dataQuality.staleFields), conflictingFields: strings(dataQuality.conflictingFields), unverifiedFields: strings(dataQuality.unverifiedFields),
    ...(scenarioDownsideCagr !== undefined ? { scenarioDownsideCagr } : {}), ...(scenarioBaseCagr !== undefined ? { scenarioBaseCagr } : {}),
    ...(scenarioUpsideCagr !== undefined ? { scenarioUpsideCagr } : {}),
    explanation: signal.explanation,
    sourceRecordIds
  };
}

function changed(previous: unknown, next: unknown, threshold?: number): boolean {
  if (previous === undefined && next === undefined) return false;
  if (typeof previous === "number" && typeof next === "number" && threshold !== undefined) return Math.abs(next - previous) >= threshold;
  return stableStringify(previous) !== stableStringify(next);
}

function allChanges(previous: RecommendationStateSnapshot | undefined, next: RecommendationStateSnapshot): RecommendationChange[] {
  if (!previous) return [{ field: "classification", previous: "UNOBSERVED", next: next.classification, material: false }];
  return TRACKED_FIELDS.flatMap(({ name, threshold }) => {
    const oldValue = previous[name];
    const newValue = next[name];
    if (!changed(oldValue, newValue, threshold)) return [];
    const exactChange = changed(oldValue, newValue);
    return [{ field: String(name), previous: oldValue, next: newValue, material: exactChange && (threshold === undefined || (typeof oldValue === "number" && typeof newValue === "number" && Math.abs(newValue - oldValue) >= threshold)) }];
  });
}

function classificationPriority(previous: string | undefined, next: string): RecommendationComparison["priority"] | undefined {
  if (!previous || previous === "UNOBSERVED" || previous === next) return undefined;
  if (previous === "BUY" && next === "AVOID") return "critical";
  if (previous === "BUY" && next === "WATCH") return "high";
  if (next === "INSUFFICIENT_DATA") return "high";
  if (previous === "WATCH" && next === "BUY") return "medium";
  return "medium";
}

function maxPriority(left: RecommendationComparison["priority"], right: RecommendationComparison["priority"]): RecommendationComparison["priority"] {
  return PRIORITY_RANK[left] >= PRIORITY_RANK[right] ? left : right;
}

function priorityFor(previous: RecommendationStateSnapshot | undefined, next: RecommendationStateSnapshot, changes: RecommendationChange[]): RecommendationComparison["priority"] {
  let priority: RecommendationComparison["priority"] = previous ? "informational" : "informational";
  const classification = classificationPriority(previous?.classification, next.classification);
  if (classification) priority = maxPriority(priority, classification);
  for (const change of changes) {
    if (!change.material) continue;
    if (change.field === "dividendEligible" && change.next === false) priority = maxPriority(priority, "critical");
    else if (change.field === "conflictingFields" && strings(change.next).length > 0) priority = maxPriority(priority, "critical");
    else if (change.field === "debtToEquity" && typeof change.previous === "number" && typeof change.next === "number" && change.next > change.previous) priority = maxPriority(priority, "high");
    else if (["expectedNominalCagr", "expectedRealCagr", "scenarioBaseCagr"].includes(change.field) && typeof change.previous === "number" && typeof change.next === "number" && change.next < change.previous) priority = maxPriority(priority, "high");
    else priority = maxPriority(priority, "medium");
  }
  return priority;
}

function latestByCompany(signals: ModelSignal[]): Map<string, ModelSignal> {
  const latest = new Map<string, ModelSignal>();
  for (const signal of signals) {
    const current = latest.get(signal.companyId);
    if (!current || signal.updatedAt >= current.updatedAt) latest.set(signal.companyId, signal);
  }
  return latest;
}

export function compareRecommendations(previousSignals: ModelSignal[], nextSignals: ModelSignal[]): RecommendationComparison[] {
  const previous = latestByCompany(previousSignals);
  return [...latestByCompany(nextSignals).values()].map((signal) => {
    const previousSignal = previous.get(signal.companyId);
    const previousState = previousSignal ? stateFromSignal(previousSignal) : undefined;
    const next = stateFromSignal(signal);
    const changes = allChanges(previousState, next);
    return { companyId: signal.companyId, ...(previousState ? { previous: previousState } : {}), next, changes, priority: priorityFor(previousState, next, changes), eventType: previousState ? "RECOMMENDATION_CHANGED" : "RECOMMENDATION_INITIALIZED" };
  });
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function alertForComparison(comparison: RecommendationComparison, signal: ModelSignal, now: string, applicationVersion: string, refreshRunId?: string): Alert {
  const companyName = comparison.next.companyName ?? comparison.companyId;
  const fieldNames = comparison.changes.map((change) => change.field).join(", ");
  const title = comparison.eventType === "RECOMMENDATION_INITIALIZED" ? `Recommendation observed: ${companyName}` : `Recommendation changed: ${companyName}`;
  const message = comparison.eventType === "RECOMMENDATION_INITIALIZED" ? `${companyName} was observed as ${comparison.next.classification}.` : `${companyName} changed in ${fieldNames || "tracked model state"}.`;
  const alertId = makeId("alert");
  const previousState = comparison.previous ?? { companyId: comparison.companyId, classification: "UNOBSERVED" };
  const sourceRecordIds = [...new Set([...(comparison.next.sourceRecordIds ?? []), ...(comparison.previous?.sourceRecordIds ?? [])])];
  return {
    id: alertId, kind: "alert", createdAt: now, updatedAt: now, priority: comparison.priority, eventType: comparison.eventType,
    title, message, entityType: "company", entityId: comparison.companyId, status: "unread",
    previousState, newState: comparison.next, changes: comparison.changes, why: comparison.next.explanation,
    ...(sourceRecordIds.length ? { sourceRecordIds } : {}), ...(signal.modelRunId ? { modelRunId: signal.modelRunId } : {}),
    ...(signal.settingsId ? { settingsId: signal.settingsId } : {}), detailRoute: `./index.html#signals`,
    dedupeKey: `${comparison.eventType}:${comparison.companyId}:${hashState(comparison.next)}`
  };
}

function auditForAlert(alert: Alert, signal: ModelSignal | undefined, now: string, applicationVersion: string, correlationId: string): AuditEvent {
  return createAuditEvent({
    now, eventType: "recommendation-monitor", action: `${alert.eventType}:${alert.priority}`, actorType: "model-run", entityType: alert.entityType, entityId: alert.entityId,
    previousState: alert.previousState ?? {}, newState: alert.newState ?? {}, reason: alert.why ?? alert.message,
    ...(signal?.modelVersionId ? { modelVersionId: signal.modelVersionId } : {}), ...(signal?.settingsId ? { settingsId: signal.settingsId } : {}),
    ...(alert.sourceRecordIds ? { sourceRecordIds: alert.sourceRecordIds } : {}), correlationId, applicationVersion
  });
}

export interface MonitorRecommendationsOptions {
  repository: WorkspaceRepository;
  nextSignals: ModelSignal[];
  persistSignals?: boolean;
  previousSignals?: ModelSignal[];
  refreshRunId?: string;
  refreshCompleted?: boolean;
  now?: () => string;
  applicationVersion?: string;
}

export interface MonitorRecommendationsResult {
  comparisons: RecommendationComparison[];
  alerts: Alert[];
  auditEvents: AuditEvent[];
}

export async function monitorRecommendations(options: MonitorRecommendationsOptions): Promise<MonitorRecommendationsResult> {
  const now = options.now ?? (() => new Date().toISOString());
  const applicationVersion = options.applicationVersion ?? APPLICATION_VERSION;
  const incomingIds = new Set(options.nextSignals.map((signal) => signal.id));
  const incomingRunIds = new Set(options.nextSignals.map((signal) => signal.modelRunId));
  const persistedSignals = options.previousSignals ?? await options.repository.getAll("modelSignals");
  const previousSignals = options.previousSignals ? persistedSignals : persistedSignals.filter((signal) => !incomingIds.has(signal.id) && !incomingRunIds.has(signal.modelRunId));
  const comparisons = compareRecommendations(previousSignals, options.nextSignals);
  const existingAlerts = await options.repository.getAll("alerts");
  const existingKeys = new Set(existingAlerts.map((alert) => alert.dedupeKey).filter((key): key is string => typeof key === "string"));
  const alerts: Alert[] = [];
  const auditEvents: AuditEvent[] = [];
  for (const comparison of comparisons) {
    const candidate = options.nextSignals.find((item) => item.companyId === comparison.companyId);
    if (!candidate) continue;
    const alert = alertForComparison(comparison, candidate, now(), applicationVersion, options.refreshRunId);
    if (existingKeys.has(alert.dedupeKey ?? "")) continue;
    existingKeys.add(alert.dedupeKey ?? "");
    alerts.push(alert);
    auditEvents.push(auditForAlert(alert, candidate, now(), applicationVersion, options.refreshRunId ?? candidate.modelRunId ?? alert.id));
  }
  if (options.refreshCompleted && options.refreshRunId) {
    const dedupeKey = `REFRESH_COMPLETED:${options.refreshRunId}`;
    if (!existingKeys.has(dedupeKey)) {
      const first = options.nextSignals[0];
      const alert: Alert = {
        id: makeId("alert"), kind: "alert", createdAt: now(), updatedAt: now(), priority: "informational", eventType: "REFRESH_COMPLETED",
        title: "Research refresh completed", message: `${options.nextSignals.length} recommendation${options.nextSignals.length === 1 ? "" : "s"} checked; ${comparisons.length} change${comparisons.length === 1 ? "" : "s"} observed.`,
        entityType: "refresh-run", entityId: options.refreshRunId, status: "unread", previousState: { refreshRunId: options.refreshRunId, status: "running" },
        newState: { refreshRunId: options.refreshRunId, status: "completed", recommendationCount: options.nextSignals.length, changeCount: comparisons.length },
        why: "The configured refresh operation completed and its resulting recommendation state was recorded.",
        ...(first?.modelRunId ? { modelRunId: first.modelRunId } : {}), ...(first?.settingsId ? { settingsId: first.settingsId } : {}),
        detailRoute: "./index.html#integrity", dedupeKey
      };
      alerts.push(alert);
      auditEvents.push(auditForAlert(alert, first, now(), applicationVersion, options.refreshRunId));
    }
  }
  await options.repository.putBatch([
    ...(options.persistSignals ? options.nextSignals.map((signal) => ({ store: "modelSignals" as const, value: signal })) : []),
    ...alerts.map((alert) => ({ store: "alerts" as const, value: alert })),
    ...auditEvents.map((event) => ({ store: "auditEvents" as const, value: event }))
  ]);
  return { comparisons, alerts, auditEvents };
}

export async function persistSignalsAndMonitor(
  repository: WorkspaceRepository,
  nextSignals: ModelSignal[],
  options: Omit<MonitorRecommendationsOptions, "repository" | "nextSignals"> = {}
): Promise<MonitorRecommendationsResult> {
  return monitorRecommendations({ ...options, repository, nextSignals, persistSignals: true });
}
