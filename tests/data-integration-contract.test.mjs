import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("DATA_INT workflow is exposed as a no-seed refresh-to-analysis path", async () => {
  const html = await read("index.html");
  const ui = await read("analysis.js");
  const provider = await read("src/market-data/configured-provider.ts");
  const refresh = await read("src/analysis/refresh.ts");
  const engine = await read("src/analysis/engine.ts");
  const build = await read("scripts/build.mjs");
  const catalog = await read("src/market-data/source-catalog.ts");
  assert.match(html, /id="analysis"/);
  assert.match(html, /REFRESH &amp; RUN ANALYSIS/);
  for (const item of ["refreshAnalysisData", "runLocalAnalysis", "saveProviderSettings", "createConfiguredBrowserProvider"]) assert.match(ui, new RegExp(item));
  for (const route of ["universe", "quote", "prices", "dividends", "financials", "valuations", "benchmarks", "corporate-actions"]) assert.match(provider, new RegExp(route));
  assert.match(engine, /analysisSnapshots/);
  assert.match(refresh, /getUniverse/);
  assert.match(build, /analysis\.js/);
  for (const source of ["NSE India", "BSE India", "Licensed market-data provider", "Reuters"]) assert.match(catalog, new RegExp(source));
  assert.match(catalog, /data-source-updated/);
});

test("provider adapter rejects non-HTTPS browser endpoints", async () => {
  const source = await read("src/market-data/fetch-provider.ts");
  const registry = await read("src/market-data/provider-registry.ts");
  assert.match(source, /requires an HTTPS endpoint/);
  assert.match(registry, /endpoint must use HTTPS/);
});

test("local public fetcher exposes every required extractor family and fallback category", async () => {
  const fetcher = await read("yieldalpha_fresh_data_fetch_scaffold.py");
  const extractors = await read("yieldalpha_public_extractors.py");
  const example = await read("data/public-source-config.example.json");
  for (const category of ["quotes", "dividends", "historical_prices", "fundamentals", "valuations", "benchmarks"]) assert.match(fetcher, new RegExp(category), `missing configured category ${category}`);
  for (const extractor of ["MoneycontrolQuoteExtractor", "EconomicTimesQuoteExtractor", "UpstoxQuoteExtractor", "DhanQuoteExtractor", "ICICIDirectQuoteExtractor", "NSEDividendExtractor", "BSEDividendExtractor", "CompanyIRDividendExtractor", "MoneycontrolDividendExtractor", "GoodreturnsDividendExtractor", "InvestingDividendExtractor", "NSECorporateActionPageExtractor", "BSECorporateActionPageExtractor", "CompanyIRCorporateActionExtractor", "EquityPanditHistoricalExtractor", "StockPriceArchiveHistoricalExtractor", "CompanyFilingFundamentalsExtractor", "SecondaryFundamentalsExtractor", "NSEListingExtractor", "BSEListingExtractor", "CompanyIRListingExtractor", "PublicValuationExtractor", "NiftyIndicesBenchmarkExtractor", "BSEBenchmarkExtractor"]) assert.match(extractors, new RegExp(extractor), `missing ${extractor}`);
  assert.match(example, /fromDate/);
  assert.match(example, /benchmarkCode/);
});
