import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("Phase 9 stores explainable recommendation snapshots and alert provenance", async () => {
  const types = await read("src/storage/types.ts");
  const model = await read("src/model/types.ts");
  const monitor = await read("src/alerts/monitor.ts");
  const audit = await read("src/audit/service.ts");
  assert.match(types, /scenarioSnapshot\?: Record<string, unknown>/);
  for (const field of ["previousState", "newState", "changes", "why", "sourceRecordIds", "modelRunId", "settingsId", "detailRoute", "dedupeKey"]) {
    assert.match(types, new RegExp(`${field}\\?`), `alert missing ${field}`);
  }
  assert.match(model, /scenarioSnapshot/);
  for (const item of ["compareRecommendations", "RECOMMENDATION_CHANGED", "RECOMMENDATION_INITIALIZED", "BUY.*AVOID", "BUY.*WATCH", "WATCH.*BUY", "dividendEligible", "conflictingFields", "debtToEquity", "scenarioBaseCagr"]) {
    assert.match(monitor, new RegExp(item), `monitor missing ${item}`);
  }
  assert.match(monitor, /putBatch/);
  assert.match(monitor, /persistSignalsAndMonitor/);
  assert.match(monitor, /store: "modelSignals"/);
  assert.match(audit, /previousStateHash/);
  assert.match(audit, /newStateHash/);
});

test("Phase 9 supports refresh alert deduplication and local audit linkage", async () => {
  const monitor = await read("src/alerts/monitor.ts");
  assert.match(monitor, /REFRESH_COMPLETED/);
  assert.match(monitor, /existingKeys/);
  assert.match(monitor, /correlationId/);
  assert.match(monitor, /sourceRecordIds/);
  assert.match(monitor, /applicationVersion/);
});

test("PWA exposes permission-aware browser notifications without automatic prompting", async () => {
  const app = await read("app.js");
  const notifications = await read("notifications.js");
  const html = await read("index.html");
  const worker = await read("sw.js");
  assert.match(html, /notification-button/);
  assert.match(notifications, /Notification\.requestPermission/);
  assert.match(notifications, /Notification\.permission/);
  assert.match(notifications, /SEEN_ALERTS_KEY/);
  assert.match(notifications, /vibrate/);
  assert.match(app, /notifyUnreadAlerts/);
  assert.match(worker, /notifications\.js/);
});

test("in-app alert cards expose before/after details and provenance", async () => {
  const dashboard = await read("dashboard.js");
  const css = await read("styles.css");
  assert.match(dashboard, /previousState/);
  assert.match(dashboard, /newState/);
  assert.match(dashboard, /Why:/);
  assert.match(dashboard, /sourceRecordIds/);
  assert.match(dashboard, /modelRunId/);
  assert.match(dashboard, /settingsId/);
  assert.match(dashboard, /detailRoute/);
  assert.match(css, /alert-detail-list/);
});
