import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const compiledRoot = process.env.YIELDALPHA_COMPILED_ROOT;
if (!compiledRoot) throw new Error("YIELDALPHA_COMPILED_ROOT is required; run through npm run test:unit");
const load = (file) => import(pathToFileURL(join(compiledRoot, file)).href);
const closeTo = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
const entity = (kind, id, extra = {}) => ({ id, kind, createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z", ...extra });

test("financial formulas preserve real return and dividend growth mathematics", async () => {
  const { realCagr, expectedDividends } = await load("model/calculations.js");
  closeTo(realCagr(0.12, 0.08), (1.12 / 1.08) - 1);
  const dividends = expectedDividends(10, 0.1, 3);
  assert.deepEqual(dividends.annual.map((value) => Number(value.toFixed(8))), [11, 12.1, 13.31]);
  closeTo(dividends.total, 36.41, 1e-8);
});

test("dividend continuity flags missing years while retaining metrics", async () => {
  const { analyzeDividends } = await load("dividends/engine.js");
  const dividends = [2018, 2019, 2021].map((year, index) => entity("dividend", `d-${year}`, { securityId: "s1", financialYear: year, amountPerShare: index + 1, dividendType: "regular", sourceRecordId: `source-${year}` }));
  const result = analyzeDividends({ listingDate: "2018-01-01", dividends, policy: { startingYear: 2018, minimumConsecutiveYears: 3, allowNewerListings: true, includeSpecialDividends: false, zeroValueDisqualifies: true }, asOfYear: 2021, currentPrice: 100 });
  assert.equal(result.eligibility.passes, false);
  assert.deepEqual(result.eligibility.missingYears, [2020]);
  assert.ok(result.metrics.dividendCagr > 0);
});

test("splits and demergers reconcile ownership and cost basis", async () => {
  const { applyCorporateActions } = await load("corporate-actions/engine.js");
  const split = entity("corporate-action", "split-1", { securityId: "s1", actionType: "split", effectiveDate: "2021-01-01", details: { newShares: 2, oldShares: 1 }, sourceRecordId: "source-1" });
  const splitResult = applyCorporateActions([{ securityId: "s1", shares: 10, averageCost: 100, cash: 0, status: "active", rightsEntitlements: 0 }], [split], { subscribeRights: false, preserveRightsCash: false });
  assert.equal(splitResult.holdings[0].shares, 20);
  assert.equal(splitResult.holdings[0].averageCost, 50);
  const demerger = entity("corporate-action", "demerger-1", { securityId: "s1", actionType: "demerger", effectiveDate: "2021-02-01", details: { childSecurityId: "child", childSharesPerParentShare: 0.5, childCostAllocation: 0.3 }, sourceRecordId: "source-2" });
  const demergerResult = applyCorporateActions([{ securityId: "s1", shares: 10, averageCost: 100, cash: 0, status: "active", rightsEntitlements: 0 }], [demerger], { subscribeRights: false, preserveRightsCash: false });
  assert.equal(demergerResult.holdings.find((holding) => holding.securityId === "child").shares, 5);
  assert.equal(demergerResult.holdings.find((holding) => holding.securityId === "s1").averageCost, 70);
});

test("portfolio weighting preserves whole shares, residual cash, and exposure totals", async () => {
  const { calculatePortfolioPlan } = await load("portfolio/allocation.js");
  const plan = calculatePortfolioPlan({ capital: 1000, weightingMethod: "equal", candidates: [
    { securityId: "s1", companyId: "c1", sectorId: "sector-a", currentPrice: 100, expectedCagr: 0.1, expectedRealCagr: 0.02, dividendYield: 0.03 },
    { securityId: "s2", companyId: "c2", sectorId: "sector-b", currentPrice: 200, expectedCagr: 0.2, expectedRealCagr: 0.1, dividendYield: 0.01 }
  ], horizonYears: 5, inflationRate: 0.08 });
  assert.equal(plan.lines[0].shares, 5);
  assert.equal(plan.lines[1].shares, 2);
  assert.equal(plan.cashResidual, 100);
  closeTo(Object.values(plan.sectorExposure).reduce((sum, value) => sum + value, 0), 1);
  closeTo(plan.expectedFiveYearValue, 500 * 1.1 ** 5 + 400 * 1.2 ** 5 + 100, 1e-8);
});

test("market freshness and conflict checks never hide stale or conflicting data", async () => {
  const { assessFreshness } = await load("market-data/normalize.js");
  const { findCorporateActionConflicts } = await load("corporate-actions/conflicts.js");
  assert.equal(assessFreshness("2020-01-01T00:00:00.000Z", { now: "2020-01-01T01:00:00.000Z", thresholdMs: 60_000 }), "STALE");
  assert.equal(assessFreshness("2020-01-01T00:00:00.000Z", { now: "2020-01-01T00:00:30.000Z", thresholdMs: 60_000 }, true), "CACHED");
  const actions = [
    entity("corporate-action", "a1", { securityId: "s1", actionType: "split", effectiveDate: "2020-01-01", details: { newShares: 2, oldShares: 1 }, sourceRecordId: "source-1" }),
    entity("corporate-action", "a2", { securityId: "s1", actionType: "split", effectiveDate: "2020-01-01", details: { newShares: 3, oldShares: 1 }, sourceRecordId: "source-2" })
  ];
  assert.equal(findCorporateActionConflicts(actions).length, 1);
});

test("audit hashes are deterministic and audit events remain verifiable", async () => {
  const { hashState } = await load("audit/hash.js");
  const { createAuditEvent, verifyAuditEvent } = await load("audit/service.js");
  assert.equal(hashState({ b: 2, a: 1 }), hashState({ a: 1, b: 2 }));
  const event = createAuditEvent({ now: "2026-08-28T00:00:00.000Z", eventType: "test", action: "verified", actorType: "system", entityType: "test", entityId: "test-1", previousState: { a: 1 }, newState: { a: 2 }, reason: "Unit test" });
  assert.equal(verifyAuditEvent(event), true);
});
