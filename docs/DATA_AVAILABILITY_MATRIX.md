# YieldAlpha data availability matrix

Updated: 2026-08-29

This matrix reports both local implementation and actual runtime retrieval. “Implemented” means the extractor, validation, fallback handling, normalization, raw capture, and error recording exist. It does not mean a public website was reachable from this runtime.

## Data-point matrix

| Data point | Sources / fallback order | Extractor | Actual local test | Current result |
|---|---|---:|---|---|
| Current price and 52-week range | NSE → Moneycontrol → ET Markets → Upstox → Dhan → ICICI Direct | Yes | BEL live fetch and 18-source diagnostics | Not retrieved: runtime DNS failed for public hosts |
| Dividend history | NSE → BSE → company IR → Moneycontrol → Goodreturns → Investing.com | Yes | HTML fixtures pass; BEL live fetch attempted | Parser works; live retrieval unavailable in this runtime |
| Corporate actions | NSE public route; dividend fallbacks; source-attributed records | Yes | NSE route exercised until DNS failure | No live event retrieved |
| Exchange and listing date | NSE → BSE → company IR | Yes | Listing fixture passes | Live retrieval not available in this runtime |
| Historical OHLCV | EquityPandit → StockPriceArchive | Yes | BEL-style OHLC fixture passes, including 30-Aug-2021 date handling | Live retrieval not available in this runtime |
| Revenue, PAT, EPS | Company filings → secondary public financial page | Yes | Financial statement fixture passes | Live retrieval not available in this runtime |
| Equity, debt, cash, EBIT | Company filings → secondary public financial page | Yes | Financial statement fixture passes | Live retrieval not available in this runtime |
| Free cash flow | Calculated locally: operating cash flow − absolute capex | Yes | Normalization code and fixture inputs pass | Live retrieval depends on statement sources |
| ROE | Calculated locally: PAT ÷ equity | Yes | Normalization path implemented | Live retrieval depends on statement sources |
| ROCE | Calculated locally: EBIT ÷ (equity + debt − cash) | Yes | Normalization path implemented | Live retrieval depends on statement sources |
| Debt/equity | Calculated locally: debt ÷ equity | Yes | Normalization path implemented | Live retrieval depends on statement sources |
| Earnings growth | Calculated locally from consecutive sourced PAT periods | Yes | Normalization path implemented | Live retrieval depends on statement sources |
| P/E valuation | Configured public valuation page | Yes | Valuation fixture passes | Live retrieval not available in this runtime |
| Nifty 50 TRI | Nifty Indices configured public history page | Yes | Benchmark fixture and normalization path pass | Live retrieval not available in this runtime |
| Sensex TRI | BSE configured public history page | Yes | Benchmark normalization path implemented | Live retrieval not available in this runtime |
| Raw response and source provenance | Every successful configured page and NSE response | Yes | SQLite/source-record persistence path passes | Failed attempts are retained; no successful payload in this runtime |
| Stale cached fallback | Existing local snapshot when all live sources fail | Yes | Empty-write protection exercised | Existing usable snapshot is preserved |

## Actual test evidence

| Test | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm test` | Passed |
| `npm run test:python` | Passed: public extractor fixtures |
| `npm run release:check` | Passed: all existing release gates plus Python extractor fixtures |
| `python3 -m py_compile yieldalpha_fresh_data_fetch_scaffold.py yieldalpha_public_extractors.py diagnose_data_sources.py` | Passed |
| `npm run diagnose:data -- --timeout 1` | Exit 1: 18 sources tested, 18 DNS failures, 0 reachable, 0 records |
| `npm run data:fetch -- --symbols BEL --timeout 1` | Fallback chain attempted 21 public routes; no live records because public DNS resolution failed; errors are retained |
| `getent hosts www.nseindia.com` | Failed: no address returned |
| Python `socket.getaddrinfo("www.nseindia.com", 443)` | Failed: temporary failure in name resolution |
| `curl -I https://www.nseindia.com/` | Failed: could not resolve host |
| `nslookup www.nseindia.com` | Not run: command is not installed in this runtime |

## Configuration status

The source-specific extractors use editable URL templates because public HTML paths and page identifiers vary by company and can change. The fetcher automatically uses the bundled `data/public-source-config.example.json`; copy it to `data/public-source-config.json` to edit URLs or enable company-specific pages, then run:

```bash
npm run data:fetch -- --symbols BEL POWERGRID SUNPHARMA LT BRITANNIA --timeout 8
```

The command tries each source in order, records each failure with `PARSER_BROKEN` when applicable, writes successful HTML into SQLite/source records, and normalizes only values actually found. It never substitutes zero for unavailable data.

## Interpretation

The application now supports the full requested no-API-key extractor architecture locally. Live acceptance still requires running the diagnostics and fetcher from the user’s device/network, because this runtime cannot resolve any tested public host. Until at least two independent quote sources and the required historical, statement, valuation, and TRI records are retrieved, the model correctly remains `INSUFFICIENT_DATA`.
