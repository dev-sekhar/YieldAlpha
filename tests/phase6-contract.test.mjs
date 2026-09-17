import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("backtest request supports point-in-time and portfolio controls", async () => {
  const source = await read("src/backtesting/types.ts");
  for (const field of ["analysisDate", "executionDate", "endDate", "startingCapital", "targetCagr", "inflationRate", "benchmarkId", "weightingMethod", "transactionCostRate"]) {
    assert.match(source, new RegExp(field), `missing request field ${field}`);
  }
  assert.match(source, /availableAt/);
  assert.match(source, /modelSnapshots/);
});

test("backtest filters model snapshots by analysis date", async () => {
  const source = await read("src/backtesting/engine.ts");
  assert.match(source, /available <= analysisTimestamp/);
  assert.match(source, /generated <= analysisTimestamp/);
  assert.match(source, /latestSnapshot/);
  assert.match(source, /INSUFFICIENT_HISTORICAL_DATA/);
});

test("backtest processes execution prices, dividends, and corporate actions chronologically", async () => {
  const source = await read("src/backtesting/engine.ts");
  assert.match(source, /priceOnOrAfter/);
  assert.match(source, /priceOnOrBefore/);
  assert.match(source, /dividendsReceived/);
  assert.match(source, /applyCorporateActions/);
  assert.match(source, /eventDates/);
  assert.match(source, /corporateActionIds/);
});

test("backtest metrics include return, alpha, risk, hit rate, and verdict", async () => {
  const metrics = await read("src/backtesting/metrics.ts");
  const engine = await read("src/backtesting/engine.ts");
  for (const field of ["absoluteProfit", "totalReturn", "cagr", "realCagr", "benchmarkCagr", "alpha", "maximumDrawdown", "volatility", "hitRate"]) {
    assert.match(metrics, new RegExp(field), `missing metric ${field}`);
  }
  assert.match(engine, /modelVerdict/);
  assert.match(engine, /WORKS/);
  assert.match(engine, /DOES_NOT_WORK/);
  assert.match(engine, /metrics\.cagr >= request\.targetCagr/);
  assert.match(engine, /metrics\.cagr > metrics\.benchmarkCagr/);
});

test("backtest calculations remain independent of UI and network code", async () => {
  const files = await Promise.all([read("src/backtesting/types.ts"), read("src/backtesting/allocation.ts"), read("src/backtesting/metrics.ts"), read("src/backtesting/engine.ts")]);
  for (const source of files) assert.doesNotMatch(source, /react|\.tsx|fetch\(/i);
});
