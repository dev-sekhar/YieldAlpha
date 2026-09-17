import { loadDashboard } from "./dashboard.js";
import { notifyUnreadAlerts } from "./notifications.js";

let repositoryPromise;
const $ = (selector) => document.querySelector(selector);
const ALLOWED_STORES = new Set(["exchanges", "sectors", "industries", "companies", "securities", "listings", "priceHistory", "dividends", "financialStatements", "financialMetrics", "valuationSnapshots", "benchmarks", "benchmarkPrices", "corporateActions", "sourceRecords"]);

async function getDomain() {
  if (!repositoryPromise) repositoryPromise = import("./lib/index.js").then(async (module) => ({ ...module, repository: await module.createWorkspaceRepository() }));
  return repositoryPromise;
}

async function localObservationCount(repository) {
  const stores = ["priceHistory", "dividends", "financialStatements", "financialMetrics", "valuationSnapshots", "benchmarkPrices", "corporateActions", "sourceRecords"];
  const values = await Promise.all(stores.map((store) => repository.getAll(store)));
  return values.reduce((total, records) => total + records.length, 0);
}

function setStatus(message, tone = "") {
  const element = $("#analysis-status");
  if (!element) return;
  element.textContent = message;
  element.className = `analysis-status ${tone}`.trim();
}

function validSnapshot(value) {
  return value && value.format === "yieldalpha-public-data-snapshot" && value.formatVersion === 1 && value.records && typeof value.records === "object";
}

export async function loadPublicSnapshot() {
  const button = $("#load-public-snapshot-button");
  if (button) button.disabled = true;
  const loaded = await getDomain();
  try {
    if (navigator.onLine === false) throw new Error("Device is offline.");
    setStatus("Loading the latest local Python snapshot…");
    const response = await fetch(`./data/public-data.json?loadedAt=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("No local Python snapshot found. Run the fetcher first.");
    const snapshot = await response.json();
    if (!validSnapshot(snapshot)) throw new Error("The local snapshot format is invalid.");
    const now = new Date().toISOString();
    const records = [];
    let count = 0;
    for (const [store, values] of Object.entries(snapshot.records)) {
      if (!ALLOWED_STORES.has(store)) continue;
      if (!Array.isArray(values)) continue;
      for (const value of values) { records.push({ store, value }); count += 1; }
    }
    if (count === 0 && Array.isArray(snapshot.errors) && snapshot.errors.length > 0) throw new Error("The latest public-source refresh returned no observations.");
    const correlationId = `public-snapshot-${snapshot.generatedAt}`;
    const audits = await loaded.repository.getAll("auditEvents");
    if (!audits.some((audit) => audit.correlationId === correlationId)) {
      const audit = loaded.createAuditEvent({ now, eventType: "public-data", action: "public-snapshot-loaded", actorType: "provider", entityType: "public-data-snapshot", entityId: correlationId, previousState: {}, newState: { generatedAt: snapshot.generatedAt, recordCount: count, errors: snapshot.errors ?? [] }, reason: "Loaded a locally generated snapshot fetched from public web sources", correlationId });
      records.push({ store: "auditEvents", value: audit });
    }
    await loaded.repository.putBatch(records);
    loadDashboard();
    notifyUnreadAlerts();
    const errors = Array.isArray(snapshot.errors) ? snapshot.errors.length : 0;
    setStatus(`Loaded ${count} local public-source records${errors ? ` with ${errors} fetch warning${errors === 1 ? "" : "s"}` : ""}.`, errors ? "warning" : "success");
    return { loadedCount: count, fromCache: false, errors };
  } catch (error) {
    const storedCount = await localObservationCount(loaded.repository).catch(() => 0);
    if (storedCount > 0) {
      setStatus(`Public snapshot unavailable; using ${storedCount} previously stored observations.`, "warning");
      loadDashboard();
      notifyUnreadAlerts();
      return { loadedCount: storedCount, fromCache: true, errors: [error instanceof Error ? error.message : "Snapshot unavailable"] };
    }
    setStatus(error instanceof Error ? error.message : "Local public snapshot could not be loaded.", "error");
    throw error;
  } finally {
    if (button) button.disabled = false;
  }
}

export function bindPublicDataControls() {
  const button = $("#load-public-snapshot-button");
  if (button) button.addEventListener("click", loadPublicSnapshot);
}
