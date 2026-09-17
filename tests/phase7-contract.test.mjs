import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("robustness supports standard and rolling cohorts", async () => {
  const source = await read("src/robustness/cohorts.ts");
  const types = await read("src/robustness/types.ts");
  assert.match(source, /standardCohorts/);
  assert.match(source, /rollingCohorts/);
  assert.match(source, /monthly/);
  assert.match(types, /quarterly/);
  assert.match(source, /2020-08-27/);
  assert.match(source, /2021-08-27/);
  assert.match(source, /addMonths/);
});

test("robustness summary includes cohort and outperformance statistics", async () => {
  const source = await read("src/robustness/summary.ts");
  for (const field of ["medianPortfolioCagr", "medianAlpha", "worstCohort", "bestCohort", "percentageCohortsMeetingTarget", "percentageCohortsBeatingNifty", "percentageCohortsBeatingSensex"]) {
    assert.match(source, new RegExp(field), `missing summary field ${field}`);
  }
  assert.match(source, /survivorshipWarning/);
  assert.match(source, /limitations/);
});

test("robustness runs required exclusion scenarios", async () => {
  const source = await read("src/robustness/engine.ts");
  for (const exclusion of ["best-stock", "top-three-stocks", "best-sector"]) assert.match(source, new RegExp(exclusion), `missing exclusion ${exclusion}`);
  assert.match(source, /bestExclusions/);
  assert.match(source, /excludedSecurityIds/);
  assert.match(source, /excludedSectorIds/);
});

test("robustness filters historical universe membership and reports coverage", async () => {
  const engine = await read("src/robustness/engine.ts");
  const summary = await read("src/robustness/summary.ts");
  const types = await read("src/robustness/types.ts");
  assert.match(engine, /listedFrom/);
  assert.match(engine, /listedTo/);
  assert.match(engine, /filterDataset/);
  assert.match(summary, /historical-reconstructed/);
  assert.match(types, /current-survivor/);
  assert.match(summary, /Historical universe is not explicitly marked as reconstructed/);
});

test("robustness exposes progress and cooperative cancellation for workers", async () => {
  const engine = await read("src/robustness/engine.ts");
  const worker = await read("src/robustness/worker.ts");
  assert.match(engine, /isCancelled/);
  assert.match(engine, /onProgress/);
  assert.match(worker, /progress/);
  assert.match(worker, /cancelRobustnessWorker/);
  assert.match(worker, /SharedArrayBuffer/);
  assert.match(worker, /Atomics\.load/);
  assert.match(worker, /createRobustnessCancellationToken/);
});
