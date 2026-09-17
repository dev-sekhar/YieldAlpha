const DATABASE_NAME = "yieldalpha-workspace";
const DATABASE_VERSION = 3;
const STORE_NAMES = [
  "companies", "modelSignals", "portfolios", "portfolioPositions", "securities", "priceHistory", "dividends",
  "sourceRecords", "alerts", "auditEvents", "refreshRuns", "backtests", "reports", "modelRuns"
];

const $ = (selector) => document.querySelector(selector);
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const timestamp = (item) => Date.parse(item?.updatedAt ?? item?.createdAt ?? item?.completedAt ?? item?.startedAt ?? "") || 0;

function formatMoney(value) {
  if (!finite(value)) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value) {
  if (!finite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(value) {
  if (!value) return "Unknown time";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown time" : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = String(value);
}

function setStatus(selector, value, tone = "") {
  const element = $(selector);
  if (!element) return;
  element.textContent = value;
  element.classList.toggle("status-good", tone === "good");
  element.classList.toggle("status-warn", tone === "warn");
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
  });
}

async function openExistingWorkspace() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { resolve(null); return; }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      // Keep the dashboard compatible with browsers that do not implement
      // indexedDB.databases(). The domain layer adds indexes when available.
      for (const storeName of ["companies", "modelSettings", "modelVersions", "exchanges", "sectors", "industries", "securities", "listings", "priceHistory", "dividends", "financialStatements", "financialMetrics", "valuationSnapshots", "benchmarks", "benchmarkPrices", "corporateActions", "sourceRecords", "analysisSnapshots", "modelRuns", "modelSignals", "backtests", "backtestPositions", "portfolios", "portfolioPositions", "watchlists", "alerts", "reports", "auditEvents", "importManifests", "exportManifests", "migrationRecords", "providerSettings", "dataSources", "refreshRuns"]) {
        if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open workspace"));
  });
}

function deriveFreshness(data) {
  const sources = data.sourceRecords ?? [];
  if (!sources.length) return { label: "No source data", tone: "warn", latest: undefined };
  const states = new Set(sources.map((source) => source.freshnessState));
  const latest = sources.map((source) => source.retrievalTimestamp).filter(Boolean).sort().at(-1);
  if (states.has("CONFLICTING") || states.has("UNAVAILABLE")) return { label: "Review source issues", tone: "warn", latest };
  if (states.has("STALE")) return { label: "Stale", tone: "warn", latest };
  if (states.has("CACHED") || states.has("IMPORTED") || states.has("NOT_VERIFIED")) return { label: "Cached/imported", tone: "warn", latest };
  return { label: "Live", tone: "good", latest };
}

async function readWorkspace() {
  const db = await openExistingWorkspace();
  if (!db) return { hasDatabase: false, data: {} };
  try {
    const data = {};
    for (const store of STORE_NAMES) {
      if (!db.objectStoreNames.contains(store)) continue;
      data[store] = await requestResult(db.transaction(store, "readonly").objectStore(store).getAll());
    }
    return { hasDatabase: true, data };
  } finally {
    db.close();
  }
}

function latestSignals(signals) {
  const byCompany = new Map();
  for (const signal of signals) {
    const current = byCompany.get(signal.companyId);
    if (!current || timestamp(signal) >= timestamp(current)) byCompany.set(signal.companyId, signal);
  }
  return [...byCompany.values()];
}

function average(values) {
  const usable = values.filter(finite);
  return usable.length ? usable.reduce((total, value) => total + value, 0) / usable.length : undefined;
}

function derivePortfolio(data) {
  const portfolio = [...(data.portfolios ?? [])].filter((item) => !item.isArchived).sort((a, b) => timestamp(b) - timestamp(a))[0];
  if (!portfolio) return { value: undefined, note: "No local portfolio loaded", dividendYield: undefined };
  const positions = (data.portfolioPositions ?? []).filter((item) => item.portfolioId === portfolio.id);
  const prices = new Map();
  for (const price of data.priceHistory ?? []) {
    const current = prices.get(price.securityId);
    if (!current || String(price.tradingDate) > String(current.tradingDate)) prices.set(price.securityId, price);
  }
  let value = 0;
  let dividendIncome = 0;
  let valuedPositions = 0;
  for (const position of positions) {
    const price = prices.get(position.securityId);
    if (price && finite(price.adjustedClose ?? price.close)) {
      value += position.shares * (price.adjustedClose ?? price.close);
      valuedPositions += 1;
    }
    const dividends = (data.dividends ?? []).filter((item) => item.securityId === position.securityId);
    const latestYear = Math.max(...dividends.map((item) => item.financialYear), -Infinity);
    if (Number.isFinite(latestYear)) dividendIncome += position.shares * dividends.filter((item) => item.financialYear === latestYear).reduce((sum, item) => sum + item.amountPerShare, 0);
  }
  const complete = positions.length > 0 && valuedPositions === positions.length;
  return {
    value: complete ? value : undefined,
    note: complete ? `${portfolio.name} · ${positions.length} position${positions.length === 1 ? "" : "s"}` : `${portfolio.name} · market prices incomplete`,
    dividendYield: complete && value > 0 && dividendIncome >= 0 ? dividendIncome / value : undefined
  };
}

function derivePortfolioDashboard(data, signals) {
  const portfolio = [...(data.portfolios ?? [])].filter((item) => !item.isArchived).sort((a, b) => timestamp(b) - timestamp(a))[0];
  if (!portfolio) return { name: "No portfolio selected", method: "Awaiting setup", positionCount: 0, watchlistCount: (data.watchlists ?? []).length };
  const positions = (data.portfolioPositions ?? []).filter((item) => item.portfolioId === portfolio.id);
  const securities = new Map((data.securities ?? []).map((security) => [security.id, security.companyId]));
  const signalByCompany = new Map(signals.map((signal) => [signal.companyId, signal]));
  const prices = new Map();
  for (const price of data.priceHistory ?? []) {
    const current = prices.get(price.securityId);
    if (!current || String(price.tradingDate) > String(current.tradingDate)) prices.set(price.securityId, price);
  }
  const values = positions.map((position) => ({ position, price: prices.get(position.securityId) }));
  const complete = positions.length > 0 && values.every((item) => item.price && finite(item.price.adjustedClose ?? item.price.close));
  const currentValue = complete ? values.reduce((sum, item) => sum + item.position.shares * (item.price.adjustedClose ?? item.price.close), 0) : undefined;
  const costBasis = positions.reduce((sum, position) => sum + position.shares * position.averageCost, 0);
  const weightedSignal = (field) => {
    const usable = values.map(({ position, price }) => {
      const companyId = securities.get(position.securityId);
      const signal = companyId ? signalByCompany.get(companyId) : undefined;
      const value = signal?.[field];
      const marketValue = price && finite(price.adjustedClose ?? price.close) ? position.shares * (price.adjustedClose ?? price.close) : position.shares * position.averageCost;
      return finite(value) && marketValue > 0 ? { value, marketValue } : undefined;
    }).filter(Boolean);
    const total = usable.reduce((sum, item) => sum + item.marketValue, 0);
    return total > 0 && usable.length ? usable.reduce((sum, item) => sum + item.value * item.marketValue, 0) / total : undefined;
  };
  const expectedCagr = weightedSignal("expectedNominalCagr");
  const expectedComplete = values.length > 0 && values.every(({ position }) => {
    const companyId = securities.get(position.securityId);
    const signal = companyId ? signalByCompany.get(companyId) : undefined;
    return finite(signal?.expectedNominalCagr);
  });
  const settings = [...(data.modelSettings ?? [])].sort((a, b) => timestamp(b) - timestamp(a))[0];
  const horizon = settings?.horizonYears ?? 5;
  const inflation = settings?.inflationRate ?? 0;
  const expectedFiveYearValue = expectedCagr === undefined || !expectedComplete || currentValue === undefined ? undefined : currentValue * (1 + expectedCagr) ** horizon;
  const realValue = expectedFiveYearValue === undefined ? undefined : expectedFiveYearValue / (1 + inflation) ** horizon;
  const positionWeights = values.map(({ position, price }) => {
    const value = price && finite(price.adjustedClose ?? price.close) ? position.shares * (price.adjustedClose ?? price.close) : position.shares * position.averageCost;
    return currentValue && currentValue > 0 ? value / currentValue : 0;
  });
  const risk = positionWeights.reduce((sum, weight) => sum + weight ** 2, 0);
  const realizedProceeds = positions.reduce((sum, position) => sum + (position.realizedProceeds ?? 0), 0);
  const realizedCostBasis = positions.reduce((sum, position) => sum + (position.realizedCostBasis ?? 0), 0);
  const realizedDividends = positions.reduce((sum, position) => sum + (position.realizedDividends ?? 0), 0);
  const realizedReturn = realizedCostBasis > 0 ? (realizedProceeds + realizedDividends - realizedCostBasis) / realizedCostBasis : undefined;
  return { name: portfolio.name, method: portfolio.weightingMethod, positionCount: positions.length, expectedFiveYearValue, realValue, realizedReturn, risk, watchlistCount: (data.watchlists ?? []).length, note: complete ? `${positions.length} priced position${positions.length === 1 ? "" : "s"} · local values` : `${positions.length} position${positions.length === 1 ? "" : "s"} · current prices incomplete` };
}

function deriveBenchmarkRelativeReturn(data, benchmarkCode) {
  const reports = [...(data.reports ?? [])].filter((item) => item.status === "current").sort((a, b) => timestamp(b) - timestamp(a));
  for (const report of reports) {
    const content = report.content ?? {};
    const metrics = content.metrics ?? {};
    const reportBenchmark = content.benchmarkCode ?? metrics.benchmarkCode;
    if (reportBenchmark !== benchmarkCode) continue;
    if (finite(content.relativeReturn)) return content.relativeReturn;
    if (finite(content.alpha)) return content.alpha;
    if (finite(metrics.relativeReturn)) return metrics.relativeReturn;
    if (finite(metrics.alpha)) return metrics.alpha;
  }
  return undefined;
}

function renderAlerts(alerts) {
  const active = alerts.filter((alert) => alert.status !== "archived").sort((a, b) => timestamp(b) - timestamp(a));
  const empty = $("#alerts-empty");
  const feed = $("#alerts");
  if (!empty || !feed) return;
  empty.hidden = active.length > 0;
  feed.hidden = active.length === 0;
  feed.replaceChildren();
  for (const alert of active.slice(0, 5)) {
    const item = document.createElement("article");
    item.className = "alert-item";
    const heading = document.createElement("div");
    heading.className = "alert-item-heading";
    const title = document.createElement("strong");
    title.textContent = alert.title;
    const priority = document.createElement("span");
    priority.className = `alert-priority priority-${alert.priority}`;
    priority.textContent = alert.priority;
    heading.append(title, priority);
    const message = document.createElement("p");
    message.textContent = alert.message;
    const meta = document.createElement("small");
    meta.textContent = `${alert.status} · ${alert.entityType} · ${formatDate(alert.createdAt)}`;
    item.append(heading, message, meta);
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "View change details";
    details.append(summary);
    const changeList = document.createElement("ul");
    changeList.className = "alert-detail-list";
    const changes = Array.isArray(alert.changes) ? alert.changes : [];
    if (!changes.length) changes.push({ field: "state", previous: alert.previousState, next: alert.newState });
    for (const change of changes) {
      const row = document.createElement("li");
      const field = document.createElement("strong");
      field.textContent = change.field ?? "tracked state";
      const value = document.createElement("span");
      value.textContent = `${displayAlertValue(change.previous)} → ${displayAlertValue(change.next)}`;
      row.append(field, value);
      changeList.append(row);
    }
    details.append(changeList);
    const why = document.createElement("p");
    why.className = "alert-why";
    why.textContent = `Why: ${alert.why ?? alert.message}`;
    details.append(why);
    const provenance = document.createElement("small");
    const sourceText = Array.isArray(alert.sourceRecordIds) && alert.sourceRecordIds.length ? `sources ${alert.sourceRecordIds.length}` : "sources not attached";
    provenance.textContent = `${sourceText}${alert.modelRunId ? ` · model run ${alert.modelRunId}` : ""}${alert.settingsId ? ` · settings ${alert.settingsId}` : ""}`;
    details.append(provenance);
    if (alert.detailRoute) {
      const link = document.createElement("a");
      link.href = alert.detailRoute;
      link.textContent = "Open detailed analysis ↗";
      details.append(link);
    }
    item.append(details);
    feed.append(item);
  }
}

function displayAlertValue(value) {
  if (value === undefined || value === null) return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "none";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") : "—";
  return String(value);
}

function renderActivity(data) {
  const activity = $("#activity");
  if (!activity) return;
  const items = [
    ...(data.auditEvents ?? []).map((item) => ({ date: item.createdAt, label: `${item.action} · ${item.entityType}` })),
    ...(data.refreshRuns ?? []).map((item) => ({ date: item.completedAt ?? item.startedAt, label: `Data refresh · ${item.status}` })),
    ...(data.reports ?? []).map((item) => ({ date: item.createdAt, label: `Report · ${item.title}` }))
  ].sort((a, b) => Date.parse(b.date ?? "") - Date.parse(a.date ?? ""));
  activity.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("li");
    empty.textContent = "No local activity recorded.";
    activity.append(empty);
    return;
  }
  for (const item of items.slice(0, 5)) {
    const row = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = item.label;
    const date = document.createElement("time");
    date.dateTime = item.date ?? "";
    date.textContent = formatDate(item.date);
    row.append(label, date);
    activity.append(row);
  }
}

function renderCharts(data) {
  const completedBacktests = (data.backtests ?? []).filter((item) => item.status === "completed");
  setText("#performance-status", completedBacktests.length ? `${completedBacktests.length} saved` : "Not available");
  const performance = $("#performance-chart");
  if (performance) {
    performance.replaceChildren();
    const marker = document.createElement("span");
    marker.textContent = completedBacktests.length ? "↗" : "—";
    const summary = document.createElement("p");
    summary.textContent = completedBacktests.length ? "Saved backtest history is ready to compare." : "Load a portfolio and benchmark history to compare results.";
    performance.append(marker, summary);
  }
  const chartStatus = completedBacktests.length ? "Available from saved backtests" : "Awaiting local history";
  document.querySelectorAll("[data-chart-status]").forEach((element) => { element.textContent = chartStatus; });
}

export async function loadDashboard() {
  try {
    const workspace = await readWorkspace();
    const data = workspace.data;
    const signals = latestSignals(data.modelSignals ?? []);
    const counts = { BUY: 0, WATCH: 0, AVOID: 0, INSUFFICIENT_DATA: 0 };
    for (const signal of signals) if (counts[signal.classification] !== undefined) counts[signal.classification] += 1;
    const portfolio = derivePortfolio(data);
    const portfolioDashboard = derivePortfolioDashboard(data, signals);
    const buySignals = signals.filter((signal) => signal.classification === "BUY");
    const alerts = data.alerts ?? [];
    const unreadCritical = alerts.filter((alert) => alert.status === "unread" && alert.priority === "critical").length;
    const latestRefresh = [...(data.refreshRuns ?? [])].filter((run) => run.status === "completed" || run.status === "partial").sort((a, b) => timestamp(b) - timestamp(a))[0];
    const sourceCount = (data.sourceRecords ?? []).length;
    const auditCount = (data.auditEvents ?? []).length;
    const freshness = deriveFreshness(data);
    const latestSignal = [...signals].sort((left, right) => timestamp(right) - timestamp(left))[0];

    setText("#metric-portfolio-value", formatMoney(portfolio.value));
    setText("#metric-portfolio-note", portfolio.note);
    setText("#metric-expected-cagr", formatPercent(average(buySignals.map((signal) => signal.expectedNominalCagr))));
    setText("#metric-cagr-note", buySignals.length ? `${buySignals.length} BUY signal${buySignals.length === 1 ? "" : "s"}` : "Model not run");
    setText("#metric-real-cagr", formatPercent(average(buySignals.map((signal) => signal.expectedRealCagr))));
    setText("#metric-dividend-yield", formatPercent(portfolio.dividendYield));
    setText("#metric-dividend-note", portfolio.dividendYield === undefined ? "Awaiting priced holdings" : "Latest recorded dividend run-rate");
    setText("#metric-relative-return", formatPercent(deriveBenchmarkRelativeReturn(data, "NIFTY50_TRI")));
    setText("#metric-sensex-relative-return", formatPercent(deriveBenchmarkRelativeReturn(data, "SENSEX_TRI")));
    setText("#metric-alerts", String(alerts.filter((alert) => alert.status !== "archived").length));
    setText("#metric-alert-note", unreadCritical ? `${unreadCritical} unread critical` : "No unread critical alerts");
    setText("#signal-buy", counts.BUY);
    setText("#signal-watch", counts.WATCH);
    setText("#signal-avoid", counts.AVOID);
    setText("#signal-insufficient", counts.INSUFFICIENT_DATA);
    setText("#signal-note", signals.length ? `${signals.length} latest company signal${signals.length === 1 ? "" : "s"} from local model runs.` : "No live or imported research data is loaded.");
    setText("#portfolio-name", portfolioDashboard.name);
    setText("#portfolio-method", portfolioDashboard.method);
    setText("#portfolio-positions", portfolioDashboard.positionCount);
    setText("#portfolio-five-year-value", formatMoney(portfolioDashboard.expectedFiveYearValue));
    setText("#portfolio-real-value", formatMoney(portfolioDashboard.realValue));
    setText("#portfolio-realised-return", formatPercent(portfolioDashboard.realizedReturn));
    setText("#portfolio-risk", finite(portfolioDashboard.risk) ? portfolioDashboard.risk.toFixed(3) : "—");
    setText("#portfolio-watchlists", portfolioDashboard.watchlistCount);
    setText("#portfolio-note", portfolioDashboard.note ?? "Create a local portfolio and save an allocation plan to see holdings, expectations, and risk.");
    setText("#last-updated", latestRefresh ? `Last successful data refresh: ${formatDate(latestRefresh.completedAt ?? latestRefresh.startedAt)} · ${freshness.label}` : `Last successful data refresh: Not run yet · ${freshness.label}`);
    setStatus("#storage-health", workspace.hasDatabase ? "IndexedDB ready" : "Not initialized", workspace.hasDatabase ? "good" : "warn");
    setStatus("#audit-health", auditCount ? `${auditCount} event${auditCount === 1 ? "" : "s"}` : "No events yet", auditCount ? "good" : "warn");
    setStatus("#market-data-health", sourceCount ? `${sourceCount} source record${sourceCount === 1 ? "" : "s"}` : "Not connected", sourceCount ? "good" : "warn");
    setStatus("#data-freshness-health", freshness.label, freshness.tone);
    setStatus("#provider-check-health", latestRefresh ? `${latestRefresh.status} · ${formatDate(latestRefresh.completedAt ?? latestRefresh.startedAt)}` : "Not checked", latestRefresh?.status === "completed" ? "good" : "warn");
    setStatus("#recommendation-check-health", latestSignal ? formatDate(latestSignal.updatedAt ?? latestSignal.createdAt) : "Not checked", latestSignal ? "good" : "warn");
    setStatus("#health-status", workspace.hasDatabase && (sourceCount || signals.length || auditCount) ? "Monitoring" : "Ready", workspace.hasDatabase ? "good" : "warn");
    renderAlerts(alerts);
    renderActivity(data);
    renderCharts(data);
  } catch (error) {
    setStatus("#health-status", "Read-only error", "warn");
    setStatus("#storage-health", "Unavailable", "warn");
    setText("#signal-note", "Local workspace data could not be read. No financial values were inferred.");
    console.warn("YieldAlpha dashboard could not load local workspace", error);
  }
}
