# Data integration

YieldAlpha now follows the refresh-to-analysis workflow described in the root `DATA_INT.md`:

1. Configure an HTTPS provider in the Analysis Workspace.
2. Refresh the provider's company/security universe when the local master is empty.
3. Retrieve quote, historical prices, dividends, financials, valuations, corporate actions, and benchmark data.
4. Preserve each provider response as a source record and persist normalized observations locally.
5. Create an immutable analysis snapshot and versioned model settings.
6. Run the deterministic model and persist BUY/WATCH/AVOID/INSUFFICIENT_DATA signals, alerts, and audit events.

## Browser/device adaptation

The product is intentionally local-first for smartphone and tablet use. It does not add PostgreSQL or a required hosted application server. The configured adapter calls a provider over HTTPS from the browser, so the provider must explicitly support CORS. API keys entered in the Analysis Workspace are stored in this browser and sent with those requests; use a server-side gateway for production secret handling and licensing controls.

This is a deployment constraint, not a claim that browser calls satisfy the server-side provider requirement in `DATA_INT.md`. A future gateway can implement the same `MarketDataProvider` contract without changing the model or storage layers.

## Provider contract

The generic adapter expects these JSON endpoints below the configured base URL:

- `GET /universe`
- `GET /quote?securityId=...`
- `GET /prices?securityId=...&from=...&to=...`
- `GET /dividends?securityId=...`
- `GET /financials?companyId=...`
- `GET /valuations?securityId=...`
- `GET /benchmarks?benchmarkId=...&from=...&to=...`
- `GET /corporate-actions?securityId=...`

Responses may be a direct array or an object containing `data`, `records`, `items`, or `results`. The adapter accepts camelCase and snake_case field names, validates required dates and numbers, and retains the original response in `SourceRecord.rawValue`.

Universe rows may also provide `sectorOutlook` (`supportive`, `neutral`, `unsupported`, or `unknown`) and `governanceStatus` (`clear`, `issue`, or `unknown`). If those quality inputs are absent or unverified, the model intentionally returns `INSUFFICIENT_DATA` instead of inventing a recommendation.

No live market prices or dividend history are bundled with the application. Analysis can use either a configured browser provider or the local public-source snapshot described below.

## Local public-source fetch

### Current compliance boundary

This local fetcher is a public-source integration boundary for the complete `ABOUT.md` data families. It preserves the existing NSE route and supports configurable source-specific extractors and ordered fallbacks for quotes, dividends, historical OHLCV, fundamentals, valuations, and benchmark history. Live completeness still depends on the user’s network and confirmed public page URL templates; the model keeps returning `INSUFFICIENT_DATA` until all required source-attributed inputs are present.

The supplied `yieldalpha_fresh_data_fetch_scaffold.py` is executable as a local, no-API-key fetcher for public web-source observations. Install its only Python dependency and run it before starting the app:

```bash
python3 -m pip install -r requirements.txt
python3 yieldalpha_fresh_data_fetch_scaffold.py --output data/public-data.json
npm start
```

The fetcher also writes `data/yieldalpha.sqlite3`, containing raw responses, source records, normalized records, fetch errors, and snapshot summaries. The browser continues to use its existing IndexedDB workspace so current PWA backups and local data remain compatible; the SQLite file is the native companion's durable ingestion store and is projected into the browser snapshot.

The no-argument command uses the identity-only symbol list from the workbook's `Current Screen` tab. You can override it with `--symbols SBIN BEL SUNPHARMA` or reduce request wait time with `--timeout 5`. Open the app, select **Analysis**, and leave the endpoint blank; **REFRESH & RUN ANALYSIS** loads the generated snapshot automatically. The PWA stores the generated observations locally, records a public-source audit event, and refreshes the dashboard. The fetcher now fails fast on unavailable sources and will not replace an existing usable snapshot with an empty result. It supports configured quote, corporate-action/dividend, historical-price, fundamental, valuation, listing, and benchmark extractors; missing observations remain `INSUFFICIENT_DATA` rather than being invented.

The Python process must be run separately because a browser PWA cannot launch Python. On Android, this can run through a local Python environment such as Termux; iOS/iPadOS does not provide a generally reliable background Python companion, so a local snapshot transfer or lightweight hosted fetch service would be needed there.

### Public page extractors and fallbacks

The source-specific parser classes are in `yieldalpha_public_extractors.py`. They use editable URL templates because public page paths and company identifiers vary. The fetcher automatically uses the bundled `data/public-source-config.example.json`; copy it to `data/public-source-config.json` when you want to edit the URLs or enable company-specific pages. The order in each category is the fallback order:

- quotes: NSE, Moneycontrol, Economic Times Markets, Upstox, Dhan, ICICI Direct;
- dividends: NSE, BSE, company investor relations, Moneycontrol, Goodreturns, Investing.com;
- corporate actions: NSE, BSE, and company investor relations;
- historical prices: EquityPandit, StockPriceArchive;
- fundamentals: company filings, then a secondary public financial page;
- listings: NSE, BSE, and company investor relations;
- valuations: configured public valuation page;
- benchmarks: Nifty Indices for NIFTY50_TRI and BSE for SENSEX_TRI.

Each successful page is captured as raw HTML in the local SQLite companion and as a source record in the projected snapshot. Parser changes are explicit `PARSER_BROKEN` errors; DNS/network failures remain network errors. Values are never defaulted to zero. `npm run test:python` runs offline HTML fixtures for every parser family.

When the PWA returns online or comes back to the foreground, it checks for a newly generated local snapshot (throttled to once per minute). Loading that snapshot updates the local workspace and lets the existing model-run alert monitor report recommendation changes after the user runs analysis again. The PWA does not silently invent or recalculate recommendations from incomplete snapshot data.

## Source configuration

The Data Sources workspace is initialized from the workbook's `Data Sources` tab on first open. Users can edit each source's name, tier, URL/identifier, primary use, production role, notes, and tracking state, or add a new source. Every edit is versioned and written to the local audit history. These catalog records do not make a website an approved API and do not cause HTML scraping.
