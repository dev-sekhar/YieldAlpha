import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("Phase 2 declares all local workspace stores", async () => {
  const source = await read("src/storage/types.ts");
  for (const store of [
    "companies", "securities", "listings", "priceHistory", "dividends", "financialStatements",
    "financialMetrics", "valuationSnapshots", "corporateActions", "sourceRecords", "modelRuns",
    "modelSignals", "backtests", "portfolios", "portfolioPositions", "watchlists", "alerts", "reports",
    "auditEvents", "importManifests", "exportManifests", "migrationRecords"
  ]) {
    assert.match(source, new RegExp(`\\"${store}\\"`), `missing store ${store}`);
  }
});

test("backup contract is versioned and validates every store", async () => {
  const types = await read("src/storage/types.ts");
  const validation = await read("src/storage/validation.ts");
  assert.match(types, /format: \"yieldalpha-workspace\"/);
  assert.match(types, /formatVersion: 1/);
  assert.match(validation, /validateWorkspaceData/);
  assert.match(validation, /duplicate id/);
  assert.match(validation, /invalid JSON/);
  assert.match(validation, /MAX_BACKUP_BYTES/);
});

test("IndexedDB schema is versioned and uses id keys", async () => {
  const schema = await read("src/storage/schema.ts");
  const indexeddb = await read("src/storage/indexeddb.ts");
  assert.match(schema, /DATABASE_VERSION = 3/);
  assert.match(schema, /keyPath: \"id\"/);
  assert.match(indexeddb, /indexedDB\.open\(DATABASE_NAME, DATABASE_VERSION\)/);
  assert.match(indexeddb, /upgradeSchema/);
});

test("demo workspace is explicitly marked as demonstration data", async () => {
  const demo = await read("src/storage/demo-data.ts");
  assert.match(demo, /YieldAlpha Demonstration/);
  assert.match(demo, /isDemo: true/);
  assert.match(demo, /Demonstration model configuration/);
  assert.match(demo, /example\.invalid/);
});
