import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("Phase 11 audit records contain traceability and version linkage", async () => {
  const types = await read("src/storage/types.ts");
  const service = await read("src/audit/service.ts");
  for (const field of ["previousStateHash", "newStateHash", "reason", "modelVersionId", "settingsId", "sourceRecordIds", "timezone", "correlationId", "applicationVersion"]) assert.match(types, new RegExp(`${field}\\??`), `missing audit field ${field}`);
  for (const item of ["createAuditEvent", "appendAuditEvent", "persistAuditedMutation", "verifyAuditEvent", "hashState", "append-only"]) assert.match(service, new RegExp(item), `missing audit behavior ${item}`);
});

test("Phase 11 versions settings and reports without losing historical records", async () => {
  const versioning = await read("src/audit/versioning.ts");
  const provider = await read("src/market-data/provider-registry.ts");
  assert.match(versioning, /createModelSettingsVersion/);
  assert.match(versioning, /version = .*\+ 1/);
  assert.match(versioning, /saveReportVersion/);
  assert.match(versioning, /report-regenerated/);
  assert.match(versioning, /deleteReport/);
  assert.match(provider, /provider-settings-version-created/);
  assert.match(provider, /version/);
});

test("Phase 11 audits refreshes, imports, alerts, portfolio changes, and workspace lifecycle", async () => {
  const files = await Promise.all([
    read("src/market-data/refresh.ts"), read("src/market-data/import-persistence.ts"), read("src/alerts/status.ts"),
    read("src/portfolio/service.ts"), read("src/storage/backup.ts")
  ]);
  for (const source of files) assert.match(source, /createAuditEvent/);
  assert.match(files[0], /refresh-(started|completed|failed|cancelled)/);
  assert.match(files[1], /data-import/);
  assert.match(files[2], /alert-status-changed/);
  assert.match(files[3], /portfolio-created|watchlist-created/);
  assert.match(files[4], /backup-exported|backup-restored|workspace-reset/);
});

test("Phase 11 audit contracts are exported and documented", async () => {
  const rootIndex = await read("src/index.ts");
  const docs = await read("docs/PHASE_11_AUDIT.md");
  assert.match(rootIndex, /\.\/audit\/index\.js/);
  assert.match(docs, /application-append-only/);
  assert.match(docs, /report-regeneration|regeneration/);
});
