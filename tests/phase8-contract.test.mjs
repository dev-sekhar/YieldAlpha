import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("Phase 8 dashboard exposes research and integrity sections", async () => {
  const html = await read("index.html");
  for (const id of [
    "overview", "signals", "performance", "integrity", "metric-portfolio-value", "metric-expected-cagr",
    "metric-real-cagr", "metric-dividend-yield", "metric-relative-return", "metric-sensex-relative-return", "metric-alerts", "alerts", "activity"
  ]) assert.match(html, new RegExp(`id="${id}"`), `missing dashboard target ${id}`);
  assert.match(html, /Research workspace sections/);
  assert.match(html, /aria-label="Research analytics"/);
});

test("dashboard reads local records and renders honest derived state", async () => {
  const dashboard = await read("dashboard.js");
  assert.match(dashboard, /indexedDB\.databases/);
  assert.match(dashboard, /modelSignals/);
  assert.match(dashboard, /portfolioPositions/);
  assert.match(dashboard, /sourceRecords/);
  assert.match(dashboard, /auditEvents/);
  assert.match(dashboard, /refreshRuns/);
  assert.match(dashboard, /latestSignals/);
  assert.match(dashboard, /INSUFFICIENT_DATA/);
  assert.match(dashboard, /No financial values were inferred/);
  assert.match(dashboard, /textContent/);
  assert.match(dashboard, /renderAlerts/);
  assert.match(dashboard, /renderActivity/);
});

test("dashboard is connected to startup and refresh behavior", async () => {
  const app = await read("app.js");
  assert.match(app, /import \{ loadDashboard \} from "\.\/dashboard\.js"/);
  assert.match(app, /loadDashboard\(\);/);
});

test("dashboard styles preserve mobile navigation, alerts, and non-color signal cues", async () => {
  const css = await read("styles.css");
  assert.match(css, /\.section-nav/);
  assert.match(css, /\.alert-item/);
  assert.match(css, /\.activity-list/);
  assert.match(css, /\.signal\.insufficient/);
  assert.match(css, /overflow-x: auto/);
});
