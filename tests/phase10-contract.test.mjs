import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("Phase 10 exposes local allocation methods and portfolio analytics", async () => {
  const allocation = await read("src/portfolio/allocation.ts");
  const analytics = await read("src/portfolio/analytics.ts");
  const types = await read("src/portfolio/types.ts");
  for (const method of ["equal", "custom", "risk-weighted", "sector-capped"]) assert.match(allocation, new RegExp(method), `missing weighting method ${method}`);
  for (const field of ["shares", "cashResidual", "expectedCagr", "weightedDividendYield", "sectorExposure", "valuationExposure", "riskConcentration", "expectedFiveYearValue", "inflationAdjustedExpectedValue", "realizedReturn"]) {
    assert.match(types + analytics + allocation, new RegExp(field), `missing portfolio field ${field}`);
  }
  assert.match(allocation, /calculatePortfolioPlan/);
  assert.match(analytics, /calculatePortfolioAnalytics/);
});

test("Phase 10 provides audited local portfolio and watchlist mutations", async () => {
  const service = await read("src/portfolio/service.ts");
  const audit = await read("src/audit/service.ts");
  const storage = await read("src/storage/indexeddb.ts");
  for (const operation of ["createPortfolio", "savePortfolioPlan", "createWatchlist", "replaceWatchlist", "addToWatchlist", "removeFromWatchlist"]) assert.match(service, new RegExp(operation), `missing ${operation}`);
  assert.match(service, /auditEvent/);
  assert.match(service, /createAuditEvent/);
  assert.match(audit, /hashState/);
  assert.match(service, /mutateBatch/);
  assert.match(storage, /operation: "delete"/);
});

test("Phase 10 includes portfolio workspace and device notification preferences", async () => {
  const html = await read("index.html");
  const dashboard = await read("dashboard.js");
  const notifications = await read("notifications.js");
  assert.match(html, /id="portfolio"/);
  for (const id of ["portfolio-five-year-value", "portfolio-real-value", "portfolio-realised-return", "portfolio-risk", "portfolio-watchlists"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(dashboard, /derivePortfolioDashboard/);
  assert.match(notifications, /readNotificationPreferences/);
  assert.match(notifications, /saveNotificationPreferences/);
  assert.match(html, /notification-vibrate/);
});
