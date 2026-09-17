import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("Phase 13 has a CSP, privacy controls, and explicit offline freshness messaging", async () => {
  const html = await read("index.html");
  const app = await read("app.js");
  const dashboard = await read("dashboard.js");
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /id="privacy"/);
  for (const id of ["backup-export-button", "backup-restore-input", "workspace-reset-button", "privacy-action-status", "offline-banner", "data-freshness-health", "provider-check-health", "recommendation-check-health"]) assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);
  for (const item of ["bindPrivacyControls", "navigator.onLine", "offline-banner", "stale or unavailable"]) assert.match(app, new RegExp(item), `missing ${item}`);
  for (const item of ["deriveFreshness", "STALE", "CONFLICTING", "Last successful data refresh", "recommendation-check-health"]) assert.match(dashboard, new RegExp(item), `missing ${item}`);
});

test("Phase 13 service worker implements versioned shell caching and stale-while-revalidate", async () => {
  const source = await read("sw.js");
  assert.match(source, /yieldalpha-shell-v3/);
  assert.match(source, /APP_SHELL/);
  assert.match(source, /skipWaiting/);
  assert.match(source, /clients\.claim/);
  assert.match(source, /event\.waitUntil/);
  assert.match(source, /cache\.put\(event\.request/);
  assert.match(source, /caches\.match\("\.\/index\.html"\)/);
});

test("Phase 13 privacy controller supports local backup, restore, reset, and secret exclusion", async () => {
  const source = await read("privacy.js");
  for (const operation of ["createLocalBackup", "restoreLocalBackup", "resetLocalWorkspace", "backup-exported", "backup-restored", "workspace-reset"]) assert.match(source, new RegExp(operation), `missing ${operation}`);
  assert.match(source, /delete copy\.apiKey/);
  assert.match(source, /window\.confirm/);
  assert.match(source, /yieldalpha-workspace/);
});

test("Phase 13 retains installable mobile metadata and documents local-only operation", async () => {
  const manifest = JSON.parse(await read("manifest.webmanifest"));
  const docs = await read("docs/PHASE_13_PWA_PRIVACY.md");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.id, "./");
  assert.deepEqual(manifest.categories, ["finance", "productivity"]);
  assert.match(docs, /stale-while-revalidate/);
  assert.match(docs, /provider API keys/);
  assert.match(docs, /local-only/);
});
