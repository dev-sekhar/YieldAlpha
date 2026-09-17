import { STORE_NAMES, type StoreName } from "./types.js";

export const DATABASE_NAME = "yieldalpha-workspace";
export const DATABASE_VERSION = 3;

interface StoreDefinition {
  keyPath: "id";
  indexes: Record<string, string | string[]>;
}

export const STORE_DEFINITIONS: Record<StoreName, StoreDefinition> = {
  workspaceProfiles: { keyPath: "id", indexes: { kind: "kind", name: "name" } },
  modelSettings: { keyPath: "id", indexes: { kind: "kind", version: "version" } },
  modelVersions: { keyPath: "id", indexes: { kind: "kind", status: "status" } },
  exchanges: { keyPath: "id", indexes: { kind: "kind", code: "code" } },
  sectors: { keyPath: "id", indexes: { kind: "kind", name: "name" } },
  industries: { keyPath: "id", indexes: { kind: "kind", name: "name", sectorId: "sectorId" } },
  companies: { keyPath: "id", indexes: { kind: "kind", displayName: "displayName", industryId: "industryId" } },
  securities: { keyPath: "id", indexes: { kind: "kind", companyId: "companyId", symbol: "symbol", exchangeId: "exchangeId" } },
  listings: { keyPath: "id", indexes: { kind: "kind", securityId: "securityId", listedFrom: "listedFrom" } },
  priceHistory: { keyPath: "id", indexes: { kind: "kind", securityId: "securityId", tradingDate: "tradingDate", securityDate: ["securityId", "tradingDate"] } },
  dividends: { keyPath: "id", indexes: { kind: "kind", securityId: "securityId", financialYear: "financialYear", securityYear: ["securityId", "financialYear"] } },
  financialStatements: { keyPath: "id", indexes: { kind: "kind", companyId: "companyId", periodEnd: "periodEnd", companyPeriod: ["companyId", "periodEnd"] } },
  financialMetrics: { keyPath: "id", indexes: { kind: "kind", companyId: "companyId", metric: "metric", companyMetricPeriod: ["companyId", "metric", "periodEnd"] } },
  valuationSnapshots: { keyPath: "id", indexes: { kind: "kind", securityId: "securityId", observedAt: "observedAt", securityObserved: ["securityId", "observedAt"] } },
  benchmarks: { keyPath: "id", indexes: { kind: "kind", code: "code" } },
  benchmarkPrices: { keyPath: "id", indexes: { kind: "kind", benchmarkId: "benchmarkId", tradingDate: "tradingDate", benchmarkDate: ["benchmarkId", "tradingDate"] } },
  corporateActions: { keyPath: "id", indexes: { kind: "kind", securityId: "securityId", effectiveDate: "effectiveDate", securityEffective: ["securityId", "effectiveDate"] } },
  sourceRecords: { keyPath: "id", indexes: { kind: "kind", provider: "provider", subject: ["subjectType", "subjectId"], retrievalTimestamp: "retrievalTimestamp", freshnessState: "freshnessState" } },
  analysisSnapshots: { keyPath: "id", indexes: { kind: "kind", capturedAt: "capturedAt", modelVersionId: "modelVersionId", settingsId: "settingsId" } },
  modelRuns: { keyPath: "id", indexes: { kind: "kind", modelVersionId: "modelVersionId", runType: "runType", status: "status", startedAt: "startedAt" } },
  modelSignals: { keyPath: "id", indexes: { kind: "kind", modelRunId: "modelRunId", companyId: "companyId", classification: "classification" } },
  backtests: { keyPath: "id", indexes: { kind: "kind", modelRunId: "modelRunId", analysisDate: "analysisDate", status: "status" } },
  backtestPositions: { keyPath: "id", indexes: { kind: "kind", backtestId: "backtestId", securityId: "securityId", selection: "selection" } },
  portfolios: { keyPath: "id", indexes: { kind: "kind", name: "name", isArchived: "isArchived" } },
  portfolioPositions: { keyPath: "id", indexes: { kind: "kind", portfolioId: "portfolioId", securityId: "securityId", portfolioSecurity: ["portfolioId", "securityId"] } },
  watchlists: { keyPath: "id", indexes: { kind: "kind", name: "name" } },
  alerts: { keyPath: "id", indexes: { kind: "kind", status: "status", priority: "priority", entity: ["entityType", "entityId"], createdAt: "createdAt" } },
  reports: { keyPath: "id", indexes: { kind: "kind", reportType: "reportType", status: "status", createdAt: "createdAt" } },
  auditEvents: { keyPath: "id", indexes: { kind: "kind", eventType: "eventType", entity: ["entityType", "entityId"], correlationId: "correlationId", createdAt: "createdAt" } },
  importManifests: { keyPath: "id", indexes: { kind: "kind", importedAt: "importedAt", status: "status" } },
  exportManifests: { keyPath: "id", indexes: { kind: "kind", exportedAt: "exportedAt", exportType: "exportType" } },
  migrationRecords: { keyPath: "id", indexes: { kind: "kind", toVersion: "toVersion", appliedAt: "appliedAt" } },
  providerSettings: { keyPath: "id", indexes: { kind: "kind", providerId: "providerId", enabled: "enabled", priority: "priority" } },
  dataSources: { keyPath: "id", indexes: { kind: "kind", tier: "tier", enabled: "enabled", name: "name" } },
  refreshRuns: { keyPath: "id", indexes: { kind: "kind", providerId: "providerId", status: "status", startedAt: "startedAt" } }
};

function createStore(db: IDBDatabase, name: StoreName): IDBObjectStore {
  const definition = STORE_DEFINITIONS[name];
  const store = db.createObjectStore(name, { keyPath: definition.keyPath });
  for (const [indexName, keyPath] of Object.entries(definition.indexes)) {
    store.createIndex(indexName, keyPath, { unique: false });
  }
  return store;
}

function ensureIndexes(store: IDBObjectStore, name: StoreName): void {
  const definition = STORE_DEFINITIONS[name];
  for (const [indexName, keyPath] of Object.entries(definition.indexes)) {
    if (!store.indexNames.contains(indexName)) {
      store.createIndex(indexName, keyPath, { unique: false });
    }
  }
}

export function upgradeSchema(db: IDBDatabase, oldVersion: number, transaction: IDBTransaction): void {
  // Migrations are additive and preserve existing records. A fresh install
  // and an upgrade from v1 both pass through the same idempotent store setup.
  for (const name of STORE_NAMES) {
    if (db.objectStoreNames.contains(name)) ensureIndexes(transaction.objectStore(name), name);
    else createStore(db, name);
  }
}
