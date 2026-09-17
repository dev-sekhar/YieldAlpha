import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("model calculations contain the required return path", async () => {
  const source = await read("src/model/calculations.ts");
  for (const item of ["expectedEps", "expectedRevenue", "expectedProfit", "expectedDividends", "terminalPrice", "totalShareholderValue", "nominalCagr", "realCagr"]) {
    assert.match(source, new RegExp(item), `missing calculation ${item}`);
  }
  assert.match(source, /\(\(1 \+ nominalCagr\) \/ \(1 \+ inflationRate\)\) - 1/);
  assert.match(source, /downside/);
  assert.match(source, /upside/);
});

test("model classification is explainable and includes all decision states", async () => {
  const source = await read("src/model/classifier.ts");
  for (const state of ["INSUFFICIENT_DATA", "AVOID", "WATCH", "BUY"]) {
    assert.match(source, new RegExp(`\"${state}\"`), `missing state ${state}`);
  }
  for (const reason of ["DIVIDEND_CRITERION_FAILED", "EXCESSIVE_LEVERAGE", "GOVERNANCE_ISSUE", "RETURN_BELOW_HURDLE", "VALUATION_MARGIN_PASSED"]) {
    assert.match(source, new RegExp(reason), `missing reason ${reason}`);
  }
  assert.match(source, /reasonCodes/);
  assert.match(source, /explanation/);
  assert.match(source, /confidence/);
});

test("model results preserve versions, inputs, sources, and snapshots", async () => {
  const types = await read("src/model/types.ts");
  const storage = await read("src/storage/types.ts");
  assert.match(types, /modelVersionId/);
  assert.match(types, /settingsId/);
  assert.match(types, /dataSnapshotId/);
  assert.match(types, /sourceRecordIds/);
  assert.match(types, /inputSnapshot/);
  assert.match(storage, /inputSnapshot\?: Record<string, unknown>/);
});

test("model engine does not depend on UI or provider implementations", async () => {
  const files = await Promise.all([read("src/model/engine.ts"), read("src/model/calculations.ts"), read("src/model/classifier.ts")]);
  for (const source of files) assert.doesNotMatch(source, /react|\.tsx|fetch\(/i);
});
