import { loadDashboard } from "./dashboard.js";

let domainPromise;
let lastBacktest;

const $ = (selector) => document.querySelector(selector);

function getDomain() {
  if (!domainPromise) domainPromise = import("./lib/index.js").then(async (module) => ({ ...module, repository: await module.createWorkspaceRepository() }));
  return domainPromise;
}

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = String(value);
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(date);
}

function formatPercent(value) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "—";
}

function formatMoney(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value)
    : "—";
}

function timestamp(item) {
  return Date.parse(item?.updatedAt ?? item?.createdAt ?? item?.generatedAt ?? "") || 0;
}

function setDefaults() {
  const today = new Date();
  const iso = (date) => date.toISOString().slice(0, 10);
  const yearAgo = new Date(today);
  yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
  const monthAgo = new Date(today);
  monthAgo.setUTCMonth(monthAgo.getUTCMonth() - 1);
  const form = $("#backtest-form");
  if (!form) return;
  if (!form.analysisDate.value) form.analysisDate.value = iso(yearAgo);
  if (!form.executionDate.value) form.executionDate.value = iso(monthAgo);
  if (!form.endDate.value) form.endDate.value = iso(today);
}

async function workspaceData(repository) {
  const names = ["companies", "industries", "securities", "listings", "priceHistory", "dividends", "corporateActions", "modelSignals", "benchmarks", "benchmarkPrices", "modelRuns", "modelSettings"];
  const values = await Promise.all(names.map((name) => repository.getAll(name)));
  return Object.fromEntries(names.map((name, index) => [name, values[index]]));
}

function buildBacktestDataset(data) {
  const industries = new Map(data.industries.map((item) => [item.id, item]));
  const companies = new Map(data.companies.map((item) => [item.id, item]));
  const signalsBySecurity = new Map();
  for (const signal of data.modelSignals) {
    const input = signal.inputSnapshot;
    if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.securityId !== "string") continue;
    const snapshots = signalsBySecurity.get(input.securityId) ?? [];
    snapshots.push({ availableAt: signal.createdAt, input });
    signalsBySecurity.set(input.securityId, snapshots);
  }
  const securities = data.securities.map((security) => {
    const company = companies.get(security.companyId);
    const industry = company ? industries.get(company.industryId) : undefined;
    return {
      securityId: security.id,
      companyId: security.companyId,
      sectorId: industry?.sectorId ?? "unknown-sector",
      modelSnapshots: signalsBySecurity.get(security.id) ?? [],
      prices: data.priceHistory.filter((item) => item.securityId === security.id),
      dividends: data.dividends.filter((item) => item.securityId === security.id),
      corporateActions: data.corporateActions.filter((item) => item.securityId === security.id),
      ...(data.listings.filter((item) => item.securityId === security.id).sort((a, b) => a.listedFrom.localeCompare(b.listedFrom))[0]?.listedFrom
        ? { listedFrom: data.listings.filter((item) => item.securityId === security.id).sort((a, b) => a.listedFrom.localeCompare(b.listedFrom))[0].listedFrom }
        : {})
    };
  });
  const benchmarks = data.benchmarks.map((benchmark) => ({ benchmarkId: benchmark.id, code: benchmark.code, prices: data.benchmarkPrices.filter((item) => item.benchmarkId === benchmark.id) }));
  return { securities, benchmarks, universeMode: "current-survivor" };
}

function renderBenchmarkOptions(benchmarks) {
  const select = $("#backtest-benchmark");
  if (!select) return;
  select.replaceChildren();
  if (!benchmarks.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No local benchmark history loaded";
    select.append(option);
    return;
  }
  for (const benchmark of benchmarks) {
    const option = document.createElement("option");
    option.value = benchmark.id;
    option.textContent = `${benchmark.name} (${benchmark.code})`;
    select.append(option);
  }
}

function renderBacktestHistory(backtests) {
  const container = $("#backtest-history");
  if (!container) return;
  container.replaceChildren();
  const sorted = [...backtests].sort((a, b) => timestamp(b) - timestamp(a));
  if (!sorted.length) {
    const empty = document.createElement("p");
    empty.className = "panel-note";
    empty.textContent = "Saved backtests will appear here.";
    container.append(empty);
    return;
  }
  for (const backtest of sorted.slice(0, 10)) {
    const card = document.createElement("article");
    card.className = "analysis-result-card";
    const heading = document.createElement("div");
    heading.className = "analysis-result-heading";
    const title = document.createElement("strong");
    title.textContent = `${backtest.benchmarkCode} · ${formatDate(backtest.analysisDate)}`;
    const status = document.createElement("span");
    status.className = "signal-badge signal-watch";
    status.textContent = backtest.status;
    heading.append(title, status);
    const details = document.createElement("p");
    details.textContent = `${formatDate(backtest.executionDate)} to ${formatDate(backtest.endDate)} · ${formatMoney(backtest.startingCapital)} · ${backtest.weightingMethod} · CAGR ${formatPercent(backtest.cagr)} · Final ${formatMoney(backtest.finalValue)}`;
    const meta = document.createElement("small");
    meta.textContent = `Saved ${formatDate(backtest.createdAt)} · ${backtest.id}`;
    card.append(heading, details, meta);
    container.append(card);
  }
}

async function loadResearchControls() {
  const { repository } = await getDomain();
  const data = await workspaceData(repository);
  renderBenchmarkOptions(data.benchmarks);
  renderBacktestHistory(await repository.getAll("backtests"));
  setText("#backtest-status", data.benchmarks.length ? "Historical benchmark available" : "Awaiting historical data");
  renderReports(await repository.getAll("reports"));
}

async function runBacktest(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  setText("#backtest-result", "Building a point-in-time dataset…");
  try {
    const domain = await getDomain();
    const data = await workspaceData(domain.repository);
    const benchmark = data.benchmarks.find((item) => item.id === form.benchmarkId.value);
    if (!benchmark) throw new Error("Select a benchmark with locally loaded historical prices.");
    const settings = [...data.modelSettings].sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
    if (!settings) throw new Error("Run the model once to create versioned settings before backtesting.");
    const dataset = buildBacktestDataset(data);
    const result = domain.runBacktest({
      analysisDate: form.analysisDate.value,
      executionDate: form.executionDate.value,
      endDate: form.endDate.value,
      startingCapital: Number(form.startingCapital.value),
      targetCagr: settings.requiredCagr,
      inflationRate: settings.inflationRate,
      benchmarkId: benchmark.id,
      weightingMethod: "equal",
      transactionCostRate: 0.001,
      requireBenchmarkOutperformance: true
    }, dataset, domain.settingsToModelConfig(settings));
    const modelRun = [...data.modelRuns].sort((a, b) => timestamp(b) - timestamp(a))[0];
    const backtest = await domain.persistBacktestResult(domain.repository, result, modelRun?.id ?? "manual-backtest", benchmark.code);
    lastBacktest = { result, backtest, data, modelRun };
    const report = await domain.buildBacktestReport({ repository: domain.repository, result, backtestId: backtest.id, modelVersionId: modelRun?.modelVersionId, settingsId: modelRun?.settingsId, dataSnapshotId: modelRun?.dataSnapshotId });
    setText("#backtest-status", result.modelVerdict === "WORKS" ? "Model met the configured hurdle" : "Model did not meet the configured hurdle");
    setText("#backtest-result", `${result.verdictExplanation} Final value ${formatMoney(result.metrics.finalValue)}. ${result.limitations.length} limitation${result.limitations.length === 1 ? "" : "s"}. Report v${report.report.version} saved.`);
    await loadResearchControls();
    loadDashboard();
  } catch (error) {
    setText("#backtest-result", error instanceof Error ? error.message : "Backtest could not be completed.");
    setText("#backtest-status", "Backtest unavailable");
  } finally {
    button.disabled = false;
  }
}

function reportButton(label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary-button";
  button.textContent = label;
  button.addEventListener("click", action);
  return button;
}

function renderReports(reports) {
  const container = $("#reports-list");
  if (!container) return;
  container.replaceChildren();
  const sorted = [...reports].sort((a, b) => timestamp(b) - timestamp(a));
  setText("#reports-status", sorted.length ? `${sorted.length} saved report${sorted.length === 1 ? "" : "s"}` : "No reports yet");
  if (!sorted.length) {
    const empty = document.createElement("p");
    empty.className = "panel-note";
    empty.textContent = "Saved reports will appear here.";
    container.append(empty);
    return;
  }
  for (const report of sorted.slice(0, 20)) {
    const card = document.createElement("article");
    card.className = "analysis-result-card";
    const heading = document.createElement("div");
    heading.className = "analysis-result-heading";
    const title = document.createElement("strong");
    title.textContent = report.title;
    const version = document.createElement("span");
    version.className = "signal-badge signal-watch";
    version.textContent = `v${report.version}`;
    heading.append(title, version);
    const meta = document.createElement("small");
    meta.textContent = `${report.reportType} · ${formatDate(report.generatedAt ?? report.createdAt)} · ${report.status}`;
    const actions = document.createElement("div");
    actions.className = "hero-actions";
    actions.append(
      reportButton("Download JSON", async () => exportReport(report, "json")),
      reportButton("Download CSV", async () => exportReport(report, "csv")),
      reportButton("Print / PDF", async () => printReport(report))
    );
    card.append(heading, meta, actions);
    container.append(card);
  }
}

async function exportReport(report, format) {
  try {
    const { repository, downloadReport, recordReportExport } = await getDomain();
    downloadReport(report, format);
    await recordReportExport(repository, report, format, `yieldalpha-${report.reportType}-v${report.version}.${format}`);
    setText("#reports-status", `Exported ${format.toUpperCase()} report`);
  } catch (error) {
    setText("#reports-status", error instanceof Error ? error.message : "Report export failed");
  }
}

async function printReport(report) {
  try {
    const { repository, openReportPrintView, recordReportExport } = await getDomain();
    const printWindow = openReportPrintView(report);
    if (!printWindow) throw new Error("Printing was blocked by the browser.");
    await recordReportExport(repository, report, "pdf", `yieldalpha-${report.reportType}-v${report.version}.pdf`);
    setText("#reports-status", "Print view opened");
  } catch (error) {
    setText("#reports-status", error instanceof Error ? error.message : "Report print failed");
  }
}

async function generateLatestReport() {
  const button = $("#generate-latest-report-button");
  button.disabled = true;
  try {
    const domain = await getDomain();
    const data = await workspaceData(domain.repository);
    const signal = [...data.modelSignals].sort((a, b) => timestamp(b) - timestamp(a))[0];
    if (!signal) throw new Error("Run an analysis first so a signal can be documented.");
    const modelRun = data.modelRuns.find((item) => item.id === signal.modelRunId);
    await domain.buildStockAnalysisReport({ repository: domain.repository, signal, modelVersionId: signal.modelVersionId ?? modelRun?.modelVersionId, settingsId: signal.settingsId ?? modelRun?.settingsId, dataSnapshotId: signal.dataSnapshotId ?? modelRun?.dataSnapshotId });
    await loadResearchControls();
    setText("#reports-status", "Latest signal report saved with source and audit evidence");
  } catch (error) {
    setText("#reports-status", error instanceof Error ? error.message : "Report could not be generated");
  } finally {
    button.disabled = false;
  }
}

export function bindResearchWorkflowControls() {
  const backtestForm = $("#backtest-form");
  if (backtestForm) backtestForm.addEventListener("submit", runBacktest);
  const reportButtonElement = $("#generate-latest-report-button");
  if (reportButtonElement) reportButtonElement.addEventListener("click", generateLatestReport);
  const refreshButton = $("#reports-refresh-button");
  if (refreshButton) refreshButton.addEventListener("click", () => loadResearchControls().catch((error) => setText("#reports-status", error instanceof Error ? error.message : "Reports could not be loaded")));
  setDefaults();
  loadResearchControls().catch((error) => setText("#backtest-status", error instanceof Error ? error.message : "Research workflows unavailable"));
}
