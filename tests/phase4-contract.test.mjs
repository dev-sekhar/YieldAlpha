import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("dividend engine exposes configurable continuity and analytics", async () => {
  const source = await read("src/dividends/engine.ts");
  for (const field of ["startingYear", "minimumConsecutiveYears", "allowNewerListings", "includeSpecialDividends", "zeroValueDisqualifies"]) {
    assert.match(source, new RegExp(field), `missing policy field ${field}`);
  }
  for (const output of ["missingYears", "zeroValueYears", "currentDividendYield", "dividendCagr", "payoutConsistency", "growthTrend", "specialDividendYears"]) {
    assert.match(source, new RegExp(output), `missing dividend output ${output}`);
  }
  assert.match(source, /MISSED_ELIGIBLE_DIVIDEND_YEAR/);
  assert.match(source, /NEWER_LISTING_NOT_ALLOWED/);
});

test("corporate-action engine covers ownership-changing actions", async () => {
  const source = await read("src/corporate-actions/engine.ts");
  for (const action of ["split", "bonus", "rights", "merger", "demerger", "spin-off", "ticker-change", "name-change", "delisting", "acquisition"]) {
    assert.match(source, new RegExp(`\\"${action}\\"`), `missing action ${action}`);
  }
  assert.match(source, /childSharesPerParentShare/);
  assert.match(source, /rightsEntitlements/);
  assert.match(source, /subscribeRights/);
  assert.match(source, /cash-settled/);
});

test("corporate-action conflicts and reconciliation are explicit", async () => {
  const conflicts = await read("src/corporate-actions/conflicts.ts");
  const reconcile = await read("src/corporate-actions/reconcile.ts");
  assert.match(conflicts, /findCorporateActionConflicts/);
  assert.match(conflicts, /actionIds/);
  assert.match(reconcile, /reconcilePriceRange/);
  assert.match(reconcile, /reconcileSplitPrice/);
  assert.match(reconcile, /reconcileHoldingShares/);
  assert.match(reconcile, /tolerance/);
});

test("Phase 4 remains independent from UI and provider modules", async () => {
  const dividends = await read("src/dividends/engine.ts");
  const actions = await read("src/corporate-actions/engine.ts");
  assert.doesNotMatch(dividends, /react|\.tsx|fetch\(/i);
  assert.doesNotMatch(actions, /react|\.tsx|fetch\(/i);
});
