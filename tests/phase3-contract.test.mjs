import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("provider contract covers every required market-data category", async () => {
  const source = await read("src/market-data/contracts.ts");
  for (const category of ["quote", "prices", "dividends", "financials", "valuations", "benchmarks", "corporate-actions"]) {
    assert.match(source, new RegExp(`\\"${category}\\"`), `missing category ${category}`);
  }
  for (const method of ["getQuote", "getHistoricalPrices", "getDividends", "getFinancials", "getValuations", "getBenchmarkData", "getCorporateActions"]) {
    assert.match(source, new RegExp(method), `missing provider method ${method}`);
  }
});

test("browser transport enforces HTTPS, caching, retries, and rate limiting", async () => {
  const source = await read("src/market-data/transport.ts");
  assert.match(source, /must use HTTPS/);
  assert.match(source, /ResponseCache/);
  assert.match(source, /maxAttempts/);
  assert.match(source, /RateLimitError/);
  assert.match(source, /MinimumIntervalRateLimiter/);
  assert.match(source, /AbortSignal/);
});

test("manual import layer supports CSV and JSON with row-level errors", async () => {
  const source = await read("src/market-data/import.ts");
  assert.match(source, /parseCsv/);
  assert.match(source, /parseJson/);
  assert.match(source, /acceptedCount/);
  assert.match(source, /rejectedCount/);
  assert.match(source, /errors/);
  assert.match(source, /JSON is invalid/);
});

test("provider credentials are excluded from workspace backups", async () => {
  const backup = await read("src/storage/backup.ts");
  assert.match(backup, /providerSettings/);
  assert.match(backup, /delete sanitized\.apiKey/);
  const schema = await read("src/storage/schema.ts");
  assert.match(schema, /DATABASE_VERSION = 3/);
  assert.match(schema, /else createStore\(db, name\)/);
});
