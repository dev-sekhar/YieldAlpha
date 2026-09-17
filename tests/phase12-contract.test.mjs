import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("Phase 12 defines all five reproducible report types and evidence fields", async () => {
  const types = await read("src/reports/types.ts");
  const builders = await read("src/reports/builders.ts");
  for (const reportType of ["stock", "portfolio", "backtest", "dividend", "model-validation"]) assert.match(types, new RegExp(`reportKind: "${reportType === "stock" ? "stock-analysis" : reportType}"`));
  for (const field of ["reportVersion", "generatedAt", "modelVersion", "settingsVersion", "dataSnapshotId", "sources", "selectedStocks", "rejectedStocks", "recommendationReasons", "portfolioCalculations", "benchmarkComparison", "limitations", "corporateActions", "auditEventIds"]) assert.match(types, new RegExp(field), `missing report evidence field ${field}`);
  for (const builder of ["buildStockAnalysisReport", "buildPortfolioReport", "buildBacktestReport", "buildDividendReport", "buildModelValidationReport"]) assert.match(builders, new RegExp(builder), `missing ${builder}`);
  assert.match(builders, /freshnessState/);
  assert.match(builders, /sourceRecordIds/);
  assert.match(builders, /previousReportId|saveReportVersion/);
});

test("Phase 12 versions reports and preserves report-generation audit references", async () => {
  const types = await read("src/storage/types.ts");
  const versioning = await read("src/audit/versioning.ts");
  assert.match(types, /previousReportId\?: string/);
  assert.match(types, /generatedAt\?: string/);
  assert.match(types, /auditEventIds\?: string\[\]/);
  assert.match(versioning, /generatedAt: now/);
  assert.match(versioning, /previousReportId: previous\.id/);
  assert.match(versioning, /report-regenerated/);
});

test("Phase 12 provides JSON, CSV, print/PDF-ready, and audited export paths", async () => {
  const exporter = await read("src/reports/export.ts");
  const backup = await read("src/storage/backup.ts");
  for (const item of ["serializeReport", "reportToCsv", "reportToPrintHtml", "exportReport", "openReportPrintView", "recordReportExport", "pdf"]) assert.match(exporter, new RegExp(item), `missing ${item}`);
  assert.match(exporter, /escapeHtml/);
  assert.match(exporter, /report-exported/);
  assert.match(backup, /createWorkspaceBackup/);
  assert.match(backup, /auditEvents/);
});

test("Phase 12 reports are exported through the package entry point and documented", async () => {
  const index = await read("src/index.ts");
  const reportsIndex = await read("src/reports/index.ts");
  const docs = await read("docs/PHASE_12_REPORTS.md");
  assert.match(index, /\.\/reports\/index\.js/);
  assert.match(reportsIndex, /builders\.js/);
  assert.match(reportsIndex, /export\.js/);
  assert.match(docs, /smartphones|tablets|PostgreSQL/);
  assert.match(docs, /superseded/);
});
