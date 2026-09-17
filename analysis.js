import { loadDashboard } from "./dashboard.js";
import { notifyUnreadAlerts } from "./notifications.js";
import { loadPublicSnapshot } from "./public-data.js";

const PROVIDER_ID = "configured-json";
let repositoryPromise;
let domain;

const $ = (selector) => document.querySelector(selector);

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = String(value);
}

function setStatus(message, tone = "") {
  const element = $("#analysis-status");
  if (!element) return;
  element.textContent = message;
  element.className = `analysis-status ${tone}`.trim();
}

function percent(value) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
}

function latestProviderSettings(settings) {
  return [...settings].filter((item) => item.providerId === PROVIDER_ID).sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
}

async function getDomain() {
  if (!repositoryPromise) repositoryPromise = import("./lib/index.js").then(async (module) => ({ ...module, repository: await module.createWorkspaceRepository() }));
  return repositoryPromise;
}

async function loadSavedProvider() {
  const current = latestProviderSettings(await (await getDomain()).repository.getAll("providerSettings"));
  if (!current) return;
  $("#provider-endpoint").value = current.endpoint ?? "";
  $("#provider-api-key").value = current.apiKey ?? "";
  setText("#analysis-provider-status", current.endpoint ? "Provider saved locally" : "Provider not configured");
}

function providerInput(form) {
  const endpoint = form.endpoint.value.trim();
  const apiKey = form.apiKey.value.trim();
  const input = {
    providerId: PROVIDER_ID,
    displayName: "Configured JSON provider",
    enabled: true,
    priority: 0,
    endpoint,
    cacheTtlMs: 0,
    freshnessThresholdMs: 24 * 60 * 60 * 1000,
    supportsBrowserRequests: true,
    capabilities: ["quote", "prices", "dividends", "financials", "valuations", "benchmarks", "corporate-actions"]
  };
  return apiKey ? { ...input, apiKey } : input;
}

function clearCounts() {
  for (const name of ["universe", "buy", "watch", "avoid", "insufficient"]) setText(`#analysis-count-${name}`, "0");
}

function renderResults(result) {
  const container = $("#analysis-results");
  if (!container) return;
  const companies = new Map(result.snapshot.data.companies.map((company) => [company.id, company]));
  const rows = result.signals.map((signal) => {
    const company = companies.get(signal.companyId);
    const row = document.createElement("article");
    row.className = "analysis-result-card";
    const heading = document.createElement("div");
    heading.className = "analysis-result-heading";
    const name = document.createElement("strong");
    name.textContent = company?.displayName ?? signal.companyId;
    const classification = document.createElement("span");
    classification.className = `signal-badge signal-${signal.classification.toLowerCase().replaceAll("_", "-")}`;
    classification.textContent = signal.classification;
    heading.append(name, classification);
    const details = document.createElement("p");
    details.textContent = `${signal.explanation} Confidence: ${signal.confidence}. Expected nominal CAGR: ${percent(signal.expectedNominalCagr)}.`;
    const provenance = document.createElement("small");
    provenance.textContent = `${signal.sourceRecordIds?.length ?? 0} source records · model run ${result.modelRun.id}`;
    row.append(heading, details, provenance);
    return row;
  });
  container.replaceChildren(...rows);
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "panel-note";
    empty.textContent = "No securities were returned by the provider universe.";
    container.append(empty);
  }
}

function renderRun(result) {
  const counts = result.counts;
  setText("#analysis-count-universe", result.snapshot.universeSecurityIds.length);
  setText("#analysis-count-buy", counts.BUY);
  setText("#analysis-count-watch", counts.WATCH);
  setText("#analysis-count-avoid", counts.AVOID);
  setText("#analysis-count-insufficient", counts.INSUFFICIENT_DATA);
  setText("#analysis-provider-status", "Refresh completed");
  renderResults(result);
}

async function runAnalysis(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $("#analysis-run-button");
  button.disabled = true;
  clearCounts();
  try {
    const input = providerInput(form);
    const targetCagr = Number(form.requiredCagr.value) / 100;
    const inflationRate = Number(form.inflationRate.value) / 100;
    const horizonYears = Number(form.horizonYears.value);
    if (![targetCagr, inflationRate, horizonYears].every(Number.isFinite) || horizonYears < 1) throw new Error("Analysis settings are invalid.");
    const loaded = await getDomain();
    if (!input.endpoint) {
      setStatus("Loading the local Python public-source snapshot…");
      await loadPublicSnapshot();
    } else {
      if (!/^https:\/\//i.test(input.endpoint)) throw new Error("Provider endpoint must use HTTPS.");
      setStatus("Saving settings and refreshing provider data…");
      await loaded.saveProviderSettings(loaded.repository, input, `provider-${PROVIDER_ID}`);
      const provider = loaded.createConfiguredBrowserProvider(input);
      const refresh = await loaded.refreshAnalysisData({ repository: loaded.repository, provider, providerSettings: input });
      setStatus(`Refresh ${refresh.status}: ${refresh.acceptedCount} observations accepted; ${refresh.rejectedCount} rejected. Running deterministic analysis…`);
    }
    const result = await loaded.runLocalAnalysis({ repository: loaded.repository, requiredCagr: targetCagr, inflationRate, horizonYears });
    renderRun(result);
    setStatus(`Analysis completed. ${result.signals.length} securities evaluated; ${result.counts.INSUFFICIENT_DATA} need more trusted data.`, result.counts.INSUFFICIENT_DATA ? "warning" : "success");
    loadDashboard();
    notifyUnreadAlerts();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis could not be completed.";
    setStatus(message, "error");
    setText("#analysis-provider-status", "Provider error");
  } finally {
    button.disabled = false;
  }
}

export function bindAnalysisControls() {
  const form = $("#analysis-form");
  if (!form) return;
  form.addEventListener("submit", runAnalysis);
  getDomain().then(loadSavedProvider).catch(() => setStatus("Local workspace storage is unavailable.", "error"));
}
