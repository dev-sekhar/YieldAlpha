import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("Phase 14 defines release commands for quality, security, accessibility, PWA, and build gates", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  for (const script of ["lint", "security:check", "typecheck", "test", "test:python", "test:unit", "test:integration", "test:e2e", "accessibility:check", "performance:check", "pwa:check", "build", "release:check"]) assert.ok(packageJson.scripts[script], `missing npm script ${script}`);
  const release = await read("scripts/release-check.mjs");
  for (const command of ["lint", "security:check", "typecheck", "test:unit", "test:integration", "test:e2e", "accessibility:check", "performance:check", "pwa:check", "build"]) assert.match(release, new RegExp(`\\"${command}\\"`), `release gate omits ${command}`);
});

test("Phase 14 checks financial correctness and mobile-safe rendering", async () => {
  const unit = await read("tests/unit/financial-domain.test.mjs");
  const performance = await read("scripts/performance-check.mjs");
  for (const item of ["realCagr", "expectedDividends", "analyzeDividends", "applyCorporateActions", "calculatePortfolioPlan", "assessFreshness", "findCorporateActionConflicts", "hashState"]) assert.match(unit, new RegExp(item), `missing unit coverage for ${item}`);
  assert.match(performance, /Dashboard feed rendering is not bounded/);
  assert.match(performance, /overflow-x/);
});

test("Phase 14 includes static security and accessibility gates with a clean build target", async () => {
  const security = await read("scripts/security-check.mjs");
  const accessibility = await read("scripts/accessibility-check.mjs");
  const build = await read("scripts/build.mjs");
  const docs = await read("docs/PHASE_14_RELEASE.md");
  assert.match(security, /Content-Security|default-src/);
  assert.match(security, /eval/);
  assert.match(accessibility, /aria-live/);
  assert.match(accessibility, /button/);
  assert.match(build, /dist/);
  assert.match(docs, /smartphone/);
  assert.match(docs, /real-browser device matrix/);
});
