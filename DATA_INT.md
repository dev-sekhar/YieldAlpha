# YIELDALPHA — PRODUCTION FRESH-DATA, ANALYSIS & DATA-SOURCE IMPLEMENTATION SPECIFICATION

## Objective

The existing YieldAlpha application already contains the investment-model engine but currently lacks a production-grade data-ingestion and analysis workflow.

The application must **not** be completed by adding seed data, bundled CSV files, hardcoded prices, hardcoded dividend histories, or precomputed recommendations.

YieldAlpha must retrieve **fresh external data**, preserve the original source records, normalize and reconcile those observations, create immutable analysis snapshots, execute deterministic financial calculations, and produce auditable BUY / WATCH / AVOID results.

The objective is to reproduce the **investment methodology**, not the hardcoded values previously produced during research.

---

# 1. REQUIRED END-TO-END USER FLOW

Add an **Analysis Workspace** accessible from the primary application navigation.

Normal workflow:

1. Refresh Data
2. Validate Data
3. Build Eligible Universe
4. Run Analysis
5. Review BUY / WATCH / AVOID results
6. Inspect calculations and sources
7. Save model run
8. Add securities to watchlists or portfolios
9. Generate reports
10. Monitor subsequent changes

Provide a prominent action:

**REFRESH & RUN ANALYSIS**

The user must not need to upload a CSV during normal operation.

The complete workflow must execute server-side.

---

# 2. HIGH-LEVEL DATA ARCHITECTURE

Implement:

External Sources

↓

Provider Adapters

↓

Raw Immutable Data Store

↓

Normalization

↓

Cross-Source Reconciliation

↓

Validation & Data Quality

↓

Immutable Analysis Snapshot

↓

Deterministic Investment Model

↓

BUY / WATCH / AVOID

↓

Portfolio / Watchlist / Alerts / Reports / Backtesting

Never implement:

Browser → scrape webpage → calculate recommendation.

Provider access must be server-side.

---

# 3. PROVIDER ABSTRACTION

Business logic must never depend directly on one website.

Create interfaces such as:

* MarketDataProvider
* CorporateActionsProvider
* FinancialsProvider
* FilingsProvider
* BenchmarkProvider
* CompanyMasterProvider
* SectorDataProvider
* NewsContextProvider

Each observation must carry provenance including:

* value
* provider
* source tier
* source URL or document identifier
* source publication date
* observedAt
* retrievedAt
* unit
* raw value
* normalized value
* adjustments
* confidence
* verification status
* stale flag
* raw payload reference

Provider implementations must be replaceable without changing model logic.

---

# 4. ACTUAL DATA SOURCES USED DURING MODEL RESEARCH

The investment methodology and historical backtests that led to YieldAlpha were researched using multiple public sources.

These sources are documented for provenance.

They are **not all automatically suitable for automated production ingestion or redistribution**.

The production system must distinguish:

## Tier 1 — Authoritative

* NSE India
* BSE India
* company regulatory filings
* company investor-relations disclosures
* Government of India / regulators

## Tier 2 — Licensed structured market-data provider

A configured provider/API with appropriate commercial and redistribution rights.

## Tier 3 — Reputable secondary market sources

* Moneycontrol
* Economic Times Markets
* Upstox
* Dhan
* ICICI Direct

## Tier 4 — Historical / research verification sources

* EquityPandit
* StockPriceArchive
* Goodreturns
* Investing.com India
* IPO Central

Tier 4 must never automatically override Tier 1.

---

# 5. NSE INDIA

Official site:

https://www.nseindia.com/

Used during research and intended for production where permitted for:

* listed-security information
* company announcements
* corporate actions
* dividend announcements
* ex-dates
* record dates
* stock splits
* bonus issues
* filings
* historical corporate information
* Nifty 50
* Nifty 50 TRI
* benchmark methodology

Corporate actions:

https://www.nseindia.com/companies-listing/corporate-filings-actions

Total Return Index information:

https://www.nseindia.com/static/products-services/indices-total-returns-index

Nifty Indices:

https://www.niftyindices.com/

Production priority:

**TIER 1 — AUTHORITATIVE**

Do not treat NSE webpages as an undocumented permanent API.

Implement NSE access behind a replaceable provider adapter.

---

# 6. BSE INDIA

Official site:

https://www.bseindia.com/

Used/intended for:

* company announcements
* corporate actions
* BSE security identifiers
* listing information
* company filings
* Sensex
* Sensex TRI
* cross-verification

Production priority:

**TIER 1 — AUTHORITATIVE**

Important:

BSE offers commercial real-time, EOD and historical market-data products.

Do not assume that information visible in a browser can legally be redistributed by YieldAlpha.

Data licensing must be verified before commercial/public distribution.

---

# 7. COMPANY INVESTOR-RELATIONS SOURCES

Company filings and IR websites are primary sources for company-specific information.

Use for:

* annual reports
* quarterly results
* investor presentations
* dividend declarations
* earnings releases
* capital-allocation policies
* corporate actions
* mergers
* demergers
* bonus issues
* restructuring

Examples used during original research include:

### ABB India

https://new.abb.com/indian-subcontinent/investors/share-information/dividend-information

### Lupin

https://www.lupin.com/investors/dividend

### Sun Pharmaceutical Industries

https://sunpharma.com/investors-dividend-history/

### Siemens India

https://www.siemens.com/in/en/company/investor-relations.html

Siemens demerger disclosure used in backtesting:

https://press.siemens.com/in/en/pressrelease/siemens-limited-board-approves-demerger-energy-business-separate-listed-legal-entity

### Motherson

https://www.motherson.com/

### Motherson Sumi Wiring India

https://www.mswil.motherson.com/

Production priority:

**TIER 1**

Where an official company filing conflicts with a secondary financial website, the official filing should ordinarily take precedence.

---

# 8. MONEYCONTROL

https://www.moneycontrol.com/

Used extensively during research for:

* current prices
* previous closes
* 52-week highs/lows
* dividend histories
* corporate actions
* company financial information

Example dividend pages used:

BEL:

https://www.moneycontrol.com/company-facts/bharatelectronics/dividends/BE03/

KEC International:

https://www.moneycontrol.com/company-facts/kecinternational/dividends/KEC04/

L&T:

https://www.moneycontrol.com/company-facts/larsentoubro/dividends/LT/

NTPC:

https://www.moneycontrol.com/company-facts/ntpc/dividends/NTP/

Power Grid:

https://www.moneycontrol.com/company-facts/powergridcorporationindia/dividends/PGC/

Sun Pharma:

https://www.moneycontrol.com/company-facts/sunpharmaceuticalindustries/dividends/SPI/

Production classification:

**TIER 3 — SECONDARY / VERIFICATION**

Do not architect the application around scraping Moneycontrol HTML.

---

# 9. ECONOMIC TIMES MARKETS

https://economictimes.indiatimes.com/markets

Used during research for:

* market prices
* historical prices
* 52-week ranges
* company information
* market cross-checks

Examples included:

* JK Cement
* BEML
* KEC International
* Lupin

Production classification:

**TIER 3**

Do not assume ET's underlying exchange-data rights transfer to YieldAlpha.

---

# 10. UPSTOX

https://upstox.com/

Used for:

* current-price verification
* timestamped market quotes
* 52-week ranges
* dividend information

Examples included:

* Torrent Pharmaceuticals
* Endurance Technologies
* Bharti Hexacom
* Bharat Forge

Production approach:

Use an officially supported API if appropriate permissions and data rights are available.

Do not scrape public webpages when an approved API exists.

---

# 11. DHAN

https://dhan.co/

Used for price and historical-market verification.

Example:

* Kalpataru Projects International

Production approach:

Prefer officially supported API access.

---

# 12. ICICI DIRECT

https://www.icicidirect.com/

Used as a secondary price-verification source.

Example:

* GTPL Hathway

Production classification:

Secondary unless an appropriate supported data/API agreement exists.

---

# 13. EQUITYPANDIT

https://www.equitypandit.com/

Used in the historical backtest for exact or near-exact historical OHLC reconstruction.

Example:

https://www.equitypandit.com/historical-data/tatacomm

Historical execution prices were reconstructed for companies including:

* Tata Communications
* Endurance Technologies
* Exide Industries
* Marico
* Cipla
* Siemens

Production classification:

**HISTORICAL VERIFICATION**

Prefer a licensed/exchange historical-data source in production.

---

# 14. STOCKPRICEARCHIVE

https://stockpricearchive.com/

Example:

https://stockpricearchive.com/yearly-data/BEL/2020/

Used during earlier historical reconstruction for:

* BEL
* BEML
* Bharat Forge
* Solar Industries
* Astra Microwave
* KEI Industries
* Power Grid
* NTPC
* Dixon
* Polycab
* L&T
* Cummins
* Thermax
* ABB
* Siemens
* Tata Communications

Production classification:

**BACKTEST CROSS-CHECK ONLY**

unless reliability and redistribution rights are independently established.

---

# 15. GOODRETURNS

https://www.goodreturns.in/

Used to cross-check:

* historical dividend amounts
* dividend dates
* dividend-per-share values

Examples included:

* KEC International
* Endurance Technologies
* Honeywell Automation

Production classification:

**SECONDARY VERIFICATION**

---

# 16. INVESTING.COM INDIA

https://in.investing.com/

Used during research for:

* dividend histories
* dividend yields
* historical market information

Examples included:

* Solar Industries
* Power Grid
* Honeywell Automation

Production classification:

Secondary unless an appropriately licensed API/data arrangement is available.

---

# 17. IPO CENTRAL

https://ipocentral.in/

Used to verify historical listing information.

Example:

* Endurance Technologies listing date

Production:

Use only as a secondary source.

Prefer NSE/BSE security-master information.

---

# 18. REUTERS

https://www.reuters.com/

Used for:

* market context
* geopolitical developments
* Indian-market developments
* economic developments
* sector developments

Reuters is a news/research source rather than the system of record for quantitative company data.

Do not scrape or redistribute Reuters content without appropriate rights.

---

# 19. GOVERNMENT / REGULATORY SOURCES

Sector analysis should prefer authoritative information from:

* Government of India
* RBI
* SEBI
* Ministry of Defence
* Ministry of Power
* Ministry of Electronics & IT
* Department of Telecommunications
* Press Information Bureau
* relevant sector regulators
* NSE/BSE filings

Relevant metrics include:

* defence production
* defence exports
* power capacity
* transmission investment
* electronics manufacturing
* PLI investments
* telecom infrastructure
* pharmaceutical manufacturing
* public capital expenditure

Every sector-level conclusion must retain a source and observation date.

---

# 20. FIELD-SPECIFIC SOURCE PRIORITY

Do not use one generic source ranking.

## Current price

1. licensed exchange/market feed
2. licensed broker/market-data API
3. secondary market provider

## Historical OHLC

1. licensed exchange historical data
2. licensed historical-data provider
3. verified secondary history

## Dividend

1. NSE/BSE corporate action
2. company filing
3. company IR page
4. secondary dividend database

## Listing date

1. NSE/BSE security master
2. company filing
3. secondary IPO source

## Financial statements

1. NSE/BSE filing / XBRL
2. company regulatory filing
3. company annual/quarterly report
4. secondary database

## Corporate actions

1. NSE/BSE
2. company regulatory disclosure

## Nifty 50 TRI

NSE / Nifty Indices

## Sensex TRI

BSE

---

# 21. COMPANY / SECURITY MASTER

Create a canonical security master.

Minimum fields:

* companyId
* companyName
* NSE symbol
* BSE code
* ISIN
* listing date
* sector
* industry
* market capitalization
* exchange status
* active/inactive
* former names
* ticker history

Use **ISIN** as the strongest identity where possible.

Do not rely on company name alone.

---

# 22. DIVIDEND INGESTION

For each company retrieve dividend events from 2016 onward.

If listing occurred after 2016, retrieve from listing onward.

Required fields:

* security
* dividend type
* dividend/share
* announcement date
* ex-date
* record date
* payment date if available
* face value
* special-dividend flag
* source

Normalize descriptions such as:

Dividend - Rs 5 Per Share

Interim Dividend - Rs 3.50 Per Share

Final Dividend - Rs 10 Per Share

into structured data.

---

# 23. DIVIDEND EVENT AND ANNUAL SUMMARY

Store every raw dividend event separately.

Then calculate annual totals.

Example:

2024 Interim:
₹3

2024 Final:
₹5

AnnualDividendSummary 2024:
₹8/share

Never discard the original events.

---

# 24. MANDATORY DIVIDEND ELIGIBILITY RULE

The dividend criterion is mandatory.

If:

listingDate <= 2016

the security must have a qualifying dividend in every eligible completed year from 2016 onward.

If:

listingDate > 2016

the security must have a qualifying dividend in every eligible completed year since listing.

Do not automatically fail the partial IPO year when there was no reasonable dividend opportunity.

Store:

* dividendEligible
* consecutiveDividendYears
* failedYear
* failureReason

Example:

PASS

Dividend paid in every eligible year from 2016 through 2025.

FAIL

No qualifying dividend found for 2020.

A dividend-rule failure prevents a normal BUY classification.

---

# 25. CURRENT-YEAR HANDLING

The current year is incomplete.

Do not fail a company solely because the current calendar/financial year has not completed.

Display:

2026 YTD

rather than pretending the current-year value is final.

---

# 26. DIVIDEND METRICS

Calculate:

* annual dividends
* trailing-12-month dividend
* current dividend yield
* normalized dividend yield
* 5-year dividend CAGR
* 10-year dividend CAGR where available
* consecutive dividend years
* payout consistency

Formula:

Dividend Yield =
TTM Dividend / Current Price × 100

Identify special dividends.

Do not treat a one-off special dividend as recurring income.

---

# 27. PRICE DATA

Required quote fields:

* current price
* previous close
* open
* day high
* day low
* 52-week high
* 52-week low
* exchange
* observed timestamp

Historical prices:

* date
* open
* high
* low
* close
* adjusted close where applicable
* volume
* source

Never label delayed market data as live.

---

# 28. 52-WEEK POSITION

Calculate:

RangePosition =
(CurrentPrice - Low52) /
(High52 - Low52)

Main screen:

If RangePosition < 0.50:

**Closer to Low**

Otherwise:

**Closer to High**

Detailed page should show exact percentile.

Being closer to the 52-week low must **not** automatically imply undervaluation.

---

# 29. FUNDAMENTAL DATA

Retrieve/store at minimum:

* revenue
* EBITDA
* EBIT
* PAT
* EPS
* operating cash flow
* free cash flow
* total assets
* shareholder equity
* total debt
* cash
* ROE
* ROCE
* debt/equity
* interest coverage
* book value
* shares outstanding

Store annual and quarterly observations.

Every observation must have:

* periodStart
* periodEnd
* filingDate
* availabilityDate
* source

---

# 30. POINT-IN-TIME DATA REQUIREMENT

This is mandatory for backtesting.

A financial result can only be used in a historical model run after that information was actually available.

Example:

FY2021 result published 25-May-2021

→ usable in a 27-Aug-2021 model run.

Result published 15-Nov-2021

→ NOT usable on 27-Aug-2021.

Historical queries must enforce:

knownFrom <= analysisDate

Never backtest from today's final database state.

---

# 31. RAW IMMUTABLE INGESTION

Preserve raw external responses.

Suggested entities:

* DataFetchRun
* RawMarketPayload
* RawFinancialPayload
* RawCorporateActionPayload
* RawFilingPayload
* SourceRecord

Record:

* provider
* endpoint
* parameters
* HTTP status
* retrieval timestamp
* checksum
* raw payload reference

Normalization happens separately.

---

# 32. NORMALIZATION PIPELINE

Example:

Raw NSE Corporate Action

↓

CorporateAction

↓

DividendEvent

↓

AnnualDividendSummary

↓

Dividend Eligibility

Never parse raw provider payloads directly inside React components or investment calculations.

---

# 33. MULTI-SOURCE RECONCILIATION

Where multiple observations exist, compare them.

Example:

Provider A:
₹410.10

Provider B:
₹410.25

Difference within tolerance:

Accept.

If:

Provider A:
₹410

Provider B:
₹445

Flag:

**DATA CONFLICT**

Do not silently proceed.

Configurable suggested tolerances:

Active market price:
0.5%

Delayed price:
1%

Dividend:
₹0.01

Financial statement rounding:
0.5%

---

# 34. SOURCE-CONFLICT EXAMPLE

If:

NSE dividend = ₹5.50

Moneycontrol = ₹5.50

Goodreturns = ₹5.50

Normalized value:

₹5.50

Confidence:

HIGH

If:

NSE = ₹5.50

Moneycontrol = ₹5.50

Goodreturns = ₹4.00

Normalized value:

₹5.50

Confidence:

HIGH

Reason:

Two higher-quality sources agree.

Still retain the conflicting ₹4.00 observation for auditing.

---

# 35. DATA QUALITY SCORE

Every security gets:

* HIGH
* MEDIUM
* LOW
* BLOCKED

Consider:

* provider freshness
* source tier
* source agreement
* missing observations
* fundamental-data completeness
* corporate-action uncertainty
* historical coverage

Do not generate BUY when critical input quality is BLOCKED.

---

# 36. MODEL DEFAULT SETTINGS

Default configuration:

Target nominal CAGR:
**12%**

Inflation:
**8%**

Investment horizon:
**5 years**

Dividend criterion:
**Mandatory**

Dividend-history start:
**2016**

Settings must be configurable by authorized users.

Every model run stores the exact settings used.

---

# 37. REAL RETURN

Calculate:

Real CAGR =
((1 + Nominal CAGR) / (1 + Inflation)) - 1

At:

Nominal CAGR = 12%

Inflation = 8%

Real CAGR ≈ 3.70%.

---

# 38. EXPECTED-RETURN ENGINE

All quantitative calculations must be deterministic code.

AI must never invent CAGR, EPS forecasts, terminal prices, or valuation multiples.

Build at least:

* Bear scenario
* Base scenario
* Bull scenario

Inputs may include:

* historical revenue CAGR
* expected revenue growth
* EPS growth
* margin assumptions
* ROE/ROCE
* leverage
* free cash flow
* valuation history
* current valuation
* terminal valuation multiple
* expected dividend contribution

Calculate:

ExpectedTerminalPrice

ExpectedDividends

ExpectedTotalShareholderValue

ExpectedCAGR

ExpectedRealCAGR

Formula:

ExpectedCAGR =
((ExpectedTerminalPrice + ExpectedCumulativeDividends) / CurrentPrice)^(1 / HorizonYears) - 1

Every calculation must be reproducible.

---

# 39. SIGNAL RULES

## BUY

Require:

* mandatory dividend rule passes
* data quality is acceptable
* business fundamentals are acceptable
* financial risk is acceptable
* base-case expected CAGR >= configured hurdle
* no critical governance/data issue

## WATCH

Use when:

* dividend rule passes
* company quality is acceptable
* but valuation or forecast uncertainty prevents BUY

## AVOID

Use when:

* mandatory dividend rule fails
* severe financial deterioration exists
* critical governance risk exists
* base expected return is materially insufficient

## INSUFFICIENT DATA

Use when the required data cannot support an honest classification.

Never fabricate a signal.

---

# 40. INDUSTRY UNIVERSE

Do not restrict YieldAlpha to the original 50-company research list.

Discover and analyze eligible Indian-listed companies.

Initial sectors:

* Defence & Aerospace
* Power / T&D / Electrical Equipment
* Electronics / EMS
* Capital Goods
* Telecom / Digital Infrastructure
* Banks / Financial Services
* Pharma / Healthcare
* Auto Components / Engineering
* Cement / Building Materials
* Consumer / Premiumisation

The previous 50-company list may be retained as a watchlist but must never become the data source.

---

# 41. ANALYSIS WORKSPACE

Create:

`/analysis`

## Data Status

Show:

Market Prices:
Fresh / Stale

Corporate Actions:
Fresh / Stale

Financial Statements:
Fresh / Stale

Benchmark Data:
Fresh / Stale

Last refresh:
timestamp

## Refresh Controls

* Refresh All
* Refresh Prices
* Refresh Dividends
* Refresh Fundamentals
* Refresh Benchmarks

## Universe

Show:

* securities discovered
* dividend qualified
* failed dividend criterion
* blocked by data quality
* eligible for analysis

## Model Settings

* target CAGR
* inflation
* horizon
* sector filter
* market-cap filter

Primary button:

**RUN ANALYSIS**

---

# 42. RESULTS TABLE

Default columns:

* Industry
* Company
* Current Price
* Dividend History
* Dividend Yield
* 52W Position
* Expected 5Y CAGR
* Expected Real CAGR
* Signal
* Confidence
* Data Quality
* Last Updated

Allow:

* sorting
* filtering
* search
* CSV export
* report generation

---

# 43. EXPLAINABILITY

Every BUY/WATCH/AVOID must be explainable.

Example:

BUY

Current Price:
₹1,000

Base-case terminal price:
₹1,800

Expected cumulative dividends:
₹70

Expected total value:
₹1,870

Expected 5Y CAGR:
13.3%

Inflation-adjusted CAGR:
4.9%

Drivers:

EPS CAGR:
12.5%

Dividend contribution:
1.1%

Valuation contribution:
-0.3%

Confidence:
HIGH

Each input must link to its source observation.

---

# 44. IMMUTABLE ANALYSIS SNAPSHOTS

Every analysis must use a frozen data snapshot.

Example:

Snapshot:

2026-08-28T15:35:00+05:30

contains:

* prices
* dividends
* corporate actions
* financial metrics
* benchmark observations
* model inputs

Model Run #123 references Snapshot #456.

Tomorrow's refresh creates Snapshot #457.

Opening Model Run #123 later must still use Snapshot #456.

Never recalculate historical reports using today's values.

---

# 45. MODEL RUN

Store:

* modelRunId
* modelVersion
* snapshotId
* start timestamp
* completion timestamp
* hurdle CAGR
* inflation
* horizon
* universe count
* eligible count
* BUY count
* WATCH count
* AVOID count
* insufficient-data count

Every security-level recommendation must reference that ModelRun.

---

# 46. BACKTEST ENGINE

Build a true point-in-time historical backtesting system.

Inputs:

* analysis date
* execution date
* ending date
* starting capital
* target CAGR
* inflation
* benchmark
* weighting method
* transaction-cost assumptions

Example validated research case:

Analysis information cutoff:
27-Aug-2021

Execution:
30-Aug-2021

End:
28-Aug-2026

Starting capital:
₹10,00,000

Target:
12%

Inflation:
8%

Weighting:
Equal weight among clear BUY signals.

Historical analysis must only use observations whose:

knownFrom <= analysisDate.

---

# 47. BACKTEST CORPORATE ACTIONS

Explicitly process:

* stock splits
* bonus shares
* rights
* mergers
* demergers
* spin-offs
* ticker changes
* company-name changes
* delistings

Do not rely exclusively on adjusted-close prices.

Example:

If one Siemens share produces one Siemens Energy India share after a demerger, the terminal portfolio must include both holdings.

Likewise, Motherson restructuring must generate the appropriate resulting securities.

---

# 48. DIVIDENDS IN BACKTESTING

Track:

* record date
* ex-date
* holding eligibility
* dividend/share
* shares held
* cash dividend received

Support:

1. accumulated cash dividends

and optionally:

2. dividend reinvestment.

The method selected must be explicit.

---

# 49. BENCHMARKS

Fetch/store daily:

* Nifty 50
* Nifty 50 TRI
* Sensex
* Sensex TRI

Backtests should compare against **TRI**, not only price indices.

Formula:

Benchmark CAGR =
(EndTRI / StartTRI)^(365.25 / DaysHeld) - 1

Use exact endpoint levels whenever available.

Do not substitute nearby published 5-year figures when the precise historical index level can be retrieved.

---

# 50. PORTFOLIO BACKTEST OUTPUT

For every position show:

* security
* selection reason
* allocated capital
* execution price
* shares acquired
* dividends received
* corporate-action adjustments
* ending holdings
* terminal value
* total return
* CAGR
* real CAGR
* benchmark alpha
* maximum drawdown where available

Portfolio level:

* initial capital
* final value
* absolute profit
* total return
* CAGR
* real CAGR
* Nifty TRI CAGR
* Sensex TRI CAGR
* alpha
* hit rate
* best contributors
* worst contributors

---

# 51. MODEL VERDICT

Every completed validation backtest must display one unambiguous statement:

**MODEL VERDICT: WORKS**

or

**MODEL VERDICT: DOES NOT WORK**

Default WORKS rule:

Portfolio CAGR >= configured target CAGR

AND

Portfolio CAGR > selected benchmark TRI CAGR.

Do not soften an unsuccessful result through qualitative wording.

---

# 52. ROBUSTNESS TESTING

One successful backtest is insufficient.

Support rolling/staggered tests such as:

* Aug-2020 → Aug-2025
* Aug-2021 → Aug-2026
* Jan-2020 → Jan-2025
* Jan-2021 → Jan-2026

Where adequate historical data exists, also support rolling monthly or quarterly five-year windows.

Calculate:

* median CAGR
* median benchmark alpha
* worst cohort
* best cohort
* percentage beating hurdle
* percentage beating Nifty TRI
* percentage beating Sensex TRI

Also calculate:

Portfolio excluding best stock

Portfolio excluding top 3 stocks

Portfolio excluding strongest sector.

This detects dependence on outliers.

---

# 53. SURVIVORSHIP-BIAS CONTROL

Historical analysis must not simply use companies that survive today.

Reconstruct the eligible security universe as of the historical analysis date wherever data permits.

Account for:

* delisted companies
* merged companies
* renamed companies
* bankrupt companies
* securities listed later

Flag incomplete historical-universe coverage.

Never silently imply a survivorship-biased test is unbiased.

---

# 54. PROVIDER FAILURE HANDLING

On provider failure:

1. retry with exponential backoff;
2. use configured fallback provider;
3. if all providers fail, retain last known value;
4. clearly mark it STALE.

Never replace missing data with zero.

Never fabricate numbers.

---

# 55. CACHING

Suggested defaults:

Market prices during trading hours:
1–5 minutes depending on provider limits.

Corporate actions:
12–24 hours.

Financial statements:
until a newer filing is detected.

Historical prices:
persistent cache unless corrected.

Security master:
daily/weekly refresh depending on source.

---

# 56. SCHEDULED REFRESH

Timezone:

**Asia/Kolkata**

Suggested jobs:

Market prices:
periodically during trading hours.

Official/end-of-day snapshot:
after market close.

Corporate actions:
daily.

Company filings:
daily.

Financial results:
daily.

Benchmarks:
after market close.

Security master:
scheduled periodic synchronization.

---

# 57. SOURCE DISPLAY IN USER INTERFACE

Every important numerical value must be auditable.

Example:

Dividend Yield

1.28%

Expand:

TTM Dividend:
₹5.50

Current Price:
₹429.70

Calculated Yield:
1.28%

Dividend Source:
NSE Corporate Actions

Price Source:
Configured Market Provider

Dividend retrieved:
28-Aug-2026 18:02 IST

Price observed:
28-Aug-2026 15:30 IST

Confidence:
HIGH

Similarly, Expected 5Y CAGR must expose:

* current price source
* EPS source
* assumptions
* terminal multiple
* dividend assumption
* calculation
* model version
* snapshot ID

---

# 58. SOURCE HEALTH DASHBOARD

Create:

`/admin/data-sources`

Display for each provider:

* provider
* data category
* status
* last successful fetch
* last failure
* response latency
* records retrieved
* conflict count
* stale observations
* rate-limit status

Example:

NSE Corporate Actions
HEALTHY

Last sync:
28-Aug-2026 22:45 IST

Market Price Provider
HEALTHY

BSE
DEGRADED

Financial Filing Parser
HEALTHY

---

# 59. DATA LICENSING REGISTRY

Because YieldAlpha is intended for distribution, maintain provider-rights metadata.

For each provider:

* providerName
* termsUrl
* commercialUseAllowed
* redistributionAllowed
* attributionRequired
* rateLimit
* licence notes
* approvedForProduction

Do not make a source production-active merely because it can technically be scraped.

This is especially important for:

* real-time exchange data
* historical exchange data
* broker APIs
* commercial finance portals
* news services

---

# 60. PWA REQUIREMENTS

The application must remain an installable production PWA.

Implement:

* web app manifest
* service worker
* installability
* responsive navigation
* offline application shell
* cached watchlists/portfolio
* stale-data awareness
* background sync where supported

Offline data must display:

Last Updated:
date/time

STALE

where appropriate.

Never display cached values as live.

---

# 61. USER PORTFOLIO SIMULATOR

Allow:

₹10 lakh

₹25 lakh

₹50 lakh

or custom capital.

Allocation modes:

* equal weight
* user defined
* risk weighted
* sector capped

Display:

* shares purchased
* residual cash
* expected CAGR
* real CAGR
* weighted dividend yield
* sector exposure
* concentration
* expected five-year value

---

# 62. WATCHLIST MONITORING

Monitor:

* current price
* expected CAGR
* dividend declaration
* dividend cut
* valuation
* earnings changes
* debt deterioration
* corporate actions
* signal changes

Example:

KEC International:

WATCH → BUY

Reason:

Price declined sufficiently that base expected CAGR increased from 9.6% to 13.1% while earnings assumptions remained substantially unchanged.

Store both old and new signal.

---

# 63. AI POLICY

AI may assist with:

* filing summarization
* explaining recommendations
* extracting qualitative risks
* natural-language queries
* report narrative

AI must **not** calculate:

* CAGR
* financial ratios
* portfolio allocation
* dividend eligibility
* corporate-action adjustments
* benchmark alpha
* expected terminal prices

All numerical investment logic must be deterministic and tested.

AI-generated factual claims must link to source information.

---

# 64. TESTING REQUIREMENTS

Implement:

* unit tests
* integration tests
* provider-contract tests
* normalization tests
* reconciliation tests
* financial-calculation tests
* corporate-action tests
* backtesting tests
* API tests
* UI tests
* end-to-end tests

Critical formulas must have explicit deterministic tests.

Test at minimum:

* dividend eligibility
* CAGR
* real CAGR
* 52-week positioning
* dividend yield
* bonus adjustment
* split adjustment
* demerger
* portfolio weighting
* dividend receipt
* Nifty TRI comparison
* alpha
* snapshot immutability
* look-ahead prevention

---

# 65. FIRST ACCEPTANCE TEST — FRESH ANALYSIS

Demonstrate this from fresh retrieved data:

1. Open Analysis Workspace.
2. Click Refresh All.
3. App discovers/configures Indian securities.
4. Prices populate.
5. Corporate actions populate.
6. Dividend histories populate.
7. Dividend-qualified companies are identified.
8. Dividend yield is calculated.
9. 52-week position is calculated.
10. Fundamentals populate.
11. Data quality appears.
12. Click Run Analysis.
13. Model generates deterministic BUY/WATCH/AVOID.
14. Every recommendation exposes calculations and sources.
15. Model run references an immutable snapshot.
16. Refresh data again.
17. Run again.
18. Show what changed.

No seed financial data may be required.

---

# 66. SECOND ACCEPTANCE TEST — HISTORICAL BACKTEST

Reconstruct:

Analysis cutoff:
27-Aug-2021

Execution:
30-Aug-2021

Evaluation:
28-Aug-2026

Starting capital:
₹10,00,000

Target:
12% CAGR

Inflation:
8%

Dividend criterion:
Mandatory

Portfolio:
Equal-weight clear BUY signals.

The engine must use only point-in-time information known on or before the analysis date.

It must correctly handle:

* dividends
* bonuses
* splits
* Siemens Energy demerger
* relevant Motherson restructuring
* benchmark TRI

Generate a full backtest report.

The output must include the single statement:

MODEL VERDICT: WORKS

or

MODEL VERDICT: DOES NOT WORK

based solely on calculated results.

Do not hardcode the previous research result.

---

# 67. DO NOT DO THESE

Do not:

* hardcode the previous 50-stock dataset
* use a bundled CSV as production truth
* ship sample JSON as live data
* invent missing values
* silently replace missing data with zero
* scrape one finance website as the entire backend
* use today's fundamentals in historical backtests
* construct historical universes exclusively from today's survivors
* ignore corporate actions
* let AI invent numerical inputs
* display stale values as live
* overwrite old model runs with refreshed data
* claim a provider is authoritative when it is secondary
* violate provider redistribution/licensing conditions

---

# 68. IMPLEMENTATION ORDER

Implement in this order:

1. Company/security master
2. Provider interfaces
3. NSE corporate-action connector
4. Market-price connector
5. Fundamental/filing connector
6. Benchmark connector
7. Raw ingestion storage
8. Normalization layer
9. Source reconciliation
10. Data-quality engine
11. Dividend eligibility engine
12. Immutable snapshot system
13. Analysis Workspace
14. Run Analysis workflow
15. Signal explanations
16. Scheduled refresh
17. Corporate-action engine
18. Historical backtesting
19. Portfolio simulator
20. Watchlist monitoring
21. Reporting
22. Source-health administration
23. Licensing administration

Do **not** start by redesigning dashboard cosmetics.

The missing production capability is DATA → ANALYSIS, not visual styling.

---

# 69. COMPLETION CRITERIA

Do not declare the implementation complete until:

* fresh data can be fetched without seed values;
* source provenance is stored;
* data can be reconciled;
* stale/conflicting values are visible;
* dividend eligibility works;
* fundamentals are available;
* 52-week position works;
* current expected-return calculations work;
* BUY/WATCH/AVOID works;
* every signal is explainable;
* point-in-time snapshots work;
* historical backtesting prevents look-ahead;
* corporate actions are processed correctly;
* Nifty 50 TRI comparison works;
* Sensex TRI comparison works;
* reports can be generated;
* refresh and rerun works;
* tests pass.

The completed YieldAlpha system must be **auditable, reproducible, source-aware, fresh-data-driven and independent of hardcoded research results**.
