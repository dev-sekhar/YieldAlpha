const DATABASE_NAME = "yieldalpha-workspace";
const DATABASE_VERSION = 3;
const APPLICATION_VERSION = "0.1.0";
const STORE_NAMES = [
  "workspaceProfiles", "modelSettings", "modelVersions", "exchanges", "sectors", "industries", "companies", "securities", "listings",
  "priceHistory", "dividends", "financialStatements", "financialMetrics", "valuationSnapshots", "benchmarks", "benchmarkPrices",
  "corporateActions", "sourceRecords", "analysisSnapshots", "modelRuns", "modelSignals", "backtests", "backtestPositions", "portfolios", "portfolioPositions",
  "watchlists", "alerts", "reports", "auditEvents", "importManifests", "exportManifests", "migrationRecords", "providerSettings", "dataSources", "refreshRuns"
];

function id(prefix) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function hashState(value) {
  let hash = 0x811c9dc5;
  for (const character of stable(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function auditEvent(action, entityId, previousState, newState, reason, now = new Date().toISOString()) {
  return {
    id: id("audit"), kind: "audit-event", createdAt: now, updatedAt: now, eventType: "workspace-privacy", action,
    actorType: "user", entityType: "workspace", entityId, previousStateHash: hashState(previousState), newStateHash: hashState(newState),
    reason, correlationId: id("correlation"), applicationVersion: APPLICATION_VERSION, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  };
}

function openWorkspace() {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable in this browser"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      for (const storeName of STORE_NAMES) if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open local workspace"));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Local workspace transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Local workspace transaction aborted"));
  });
}

function readStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(`Unable to read ${storeName}`));
  });
}

function sanitizedRecords(storeName, records) {
  if (storeName !== "providerSettings") return records;
  return records.map((record) => {
    const copy = { ...record };
    delete copy.apiKey;
    return copy;
  });
}

async function readData(db) {
  const data = {};
  for (const storeName of STORE_NAMES) data[storeName] = sanitizedRecords(storeName, await readStore(db, storeName));
  return data;
}

async function recordAudit(db, event) {
  const transaction = db.transaction("auditEvents", "readwrite");
  transaction.objectStore("auditEvents").put(event);
  await transactionDone(transaction);
}

export async function createLocalBackup() {
  const db = await openWorkspace();
  try {
    const now = new Date().toISOString();
    await recordAudit(db, auditEvent("backup-exported", "workspace", {}, { schemaVersion: DATABASE_VERSION }, "User exported a full local workspace backup", now));
    return JSON.stringify({ format: "yieldalpha-workspace", formatVersion: 1, exportedAt: now, applicationVersion: APPLICATION_VERSION, schemaVersion: DATABASE_VERSION, data: await readData(db) }, null, 2);
  } finally {
    db.close();
  }
}

function parseBackup(serialized) {
  const backup = JSON.parse(serialized);
  if (!backup || backup.format !== "yieldalpha-workspace" || backup.formatVersion !== 1 || !backup.data || typeof backup.data !== "object") throw new Error("This is not a valid YieldAlpha workspace backup");
  for (const storeName of STORE_NAMES) if (backup.data[storeName] !== undefined && !Array.isArray(backup.data[storeName])) throw new Error(`Backup store ${storeName} is invalid`);
  return backup;
}

export async function restoreLocalBackup(serialized) {
  const backup = parseBackup(serialized);
  const db = await openWorkspace();
  try {
    const now = new Date().toISOString();
    const transaction = db.transaction(STORE_NAMES, "readwrite");
    for (const storeName of STORE_NAMES) {
      const store = transaction.objectStore(storeName);
      store.clear();
      for (const record of backup.data[storeName] ?? []) {
        const copy = { ...record };
        if (storeName === "providerSettings") delete copy.apiKey;
        if (typeof copy.id !== "string" || typeof copy.kind !== "string") throw new Error(`Backup contains an invalid ${storeName} record`);
        store.put(copy);
      }
    }
    transaction.objectStore("auditEvents").put(auditEvent("backup-restored", "workspace", {}, { exportedAt: backup.exportedAt, schemaVersion: backup.schemaVersion }, "User restored a local workspace backup", now));
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function resetLocalWorkspace() {
  const db = await openWorkspace();
  try {
    const now = new Date().toISOString();
    const transaction = db.transaction(STORE_NAMES, "readwrite");
    for (const storeName of STORE_NAMES) transaction.objectStore(storeName).clear();
    transaction.objectStore("auditEvents").put(auditEvent("workspace-reset", "workspace", { reset: false }, { reset: true }, "User reset the local workspace", now));
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

function download(content, fileName) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function status(message) {
  const element = document.querySelector("#privacy-action-status");
  if (element) element.textContent = message;
}

export function bindPrivacyControls() {
  const exportButton = document.querySelector("#backup-export-button");
  const restoreInput = document.querySelector("#backup-restore-input");
  const resetButton = document.querySelector("#workspace-reset-button");
  exportButton?.addEventListener("click", async () => {
    try {
      const serialized = await createLocalBackup();
      download(serialized, `yieldalpha-backup-${new Date().toISOString().slice(0, 10)}.json`);
      status("Backup exported. Provider API keys were excluded.");
    } catch (error) {
      status(`Backup failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  });
  restoreInput?.addEventListener("change", async () => {
    const file = restoreInput.files?.[0];
    if (!file) return;
    if (!window.confirm("Restore this backup and replace all local workspace data? Export the current workspace first if you need it.")) {
      restoreInput.value = "";
      return;
    }
    try {
      await restoreLocalBackup(await file.text());
      status("Backup restored. Reloading the local workspace…");
      window.setTimeout(() => window.location.reload(), 250);
    } catch (error) {
      status(`Restore failed: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      restoreInput.value = "";
    }
  });
  resetButton?.addEventListener("click", async () => {
    if (!window.confirm("Reset this device’s YieldAlpha workspace? This removes portfolios, reports, alerts, settings, and audit history. Export a backup first if you may need the data.")) return;
    try {
      await resetLocalWorkspace();
      status("Local workspace reset. Reloading…");
      window.setTimeout(() => window.location.reload(), 250);
    } catch (error) {
      status(`Reset failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  });
}
