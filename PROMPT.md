# MASTER BUILD PROMPT — PRODUCTION-GRADE INDIAN EQUITY ANALYSIS PWA

Build a production-grade, professional, distributable Progressive Web App for Indian equity research and portfolio screening.

The app is based on a validated historical screening framework that combines sector strength, mandatory dividend continuity, valuation, financial quality, market-price position, and a minimum expected 5-year return hurdle.

This must be built as a real production application, not a prototype, mock-up, toy app, or static dashboard.

---

# 1. PRODUCT PURPOSE

Create a PWA that helps users:

* identify fundamentally strong Indian listed companies;
* screen companies by sector and dividend history;
* analyse whether a stock has a reasonable probability of delivering at least a specified annualised return over five years;
* compare potential investments with Nifty 50 TRI and Sensex TRI;
* backtest the model using historical dates without look-ahead bias;
* maintain watchlists;
* track model-generated BUY / WATCH / AVOID signals;
* monitor changes in valuation;
* analyse portfolio-level expected and realised returns;
* measure inflation-adjusted wealth creation.

The application is for research and analytical purposes.

It must clearly state that model outputs are probabilistic estimates and not guaranteed future returns.

---

# 2. CORE INVESTMENT MODEL

Implement the following model as configurable business logic.

## Mandatory dividend rule

A stock is eligible only if:

* it has paid a dividend in every eligible year from 2016 onward; OR
* if it listed after 2016, it has paid a dividend in every eligible year since listing.

A missed eligible dividend year causes the stock to fail this criterion.

Allow administrators to configure:

* starting dividend-history year;
* minimum consecutive dividend years;
* whether newer listings are allowed;
* whether special dividends count;
* whether zero-value or skipped dividends disqualify a company.

Store annual dividend-per-share history.

Display dividend history as comma-separated yearly values, for example:

2016: 2.5, 2017: 3.0, 2018: 3.5 ...

Also calculate:

* current dividend yield;
* dividend CAGR;
* payout consistency;
* dividend growth trend;
* special-dividend flags.

---

# 3. EXPECTED RETURN MODEL

Default hurdle:

* minimum expected nominal CAGR: 12%;
* inflation assumption: 8%;
* investment horizon: 5 years.

Calculate:

Real CAGR = ((1 + nominal CAGR) / (1 + inflation)) - 1

For the default assumptions:

12% nominal CAGR corresponds to approximately 3.70% real CAGR.

For every stock estimate:

* expected 5-year EPS;
* expected revenue;
* expected profit growth;
* assumed exit valuation multiple;
* expected dividends over holding period;
* estimated 5-year terminal price;
* estimated total shareholder value;
* expected nominal CAGR;
* expected real CAGR;
* downside scenario;
* base scenario;
* upside scenario.

Do not produce an opaque score only.

Show the calculation that generated the expected return.

---

# 4. SIGNAL CLASSIFICATION

Every eligible company can receive:

## BUY

Use when:

* mandatory dividend criterion passes;
* balance sheet is acceptable;
* business fundamentals are sound;
* sector outlook is supportive;
* valuation offers sufficient margin of safety;
* expected 5-year total-return CAGR is at least the configured hurdle.

## WATCH

Use when:

* company quality is acceptable;
* dividend requirement passes;
* but valuation, earnings uncertainty, leverage, or other factors make the return hurdle insufficiently attractive.

## AVOID

Use when:

* dividend rule fails;
* financial quality is unacceptable;
* excessive leverage exists;
* governance issues exist;
* expected return is materially below target;
* thesis has structurally deteriorated.

Every signal must include a machine-readable reason code and a human-readable explanation.

Never display BUY without explaining why.

---

# 5. SECTOR MODEL

Support configurable industry groups.

Initial groups:

* Defence & Aerospace
* Power Transmission / Distribution / Electrical Equipment
* Electronics / EMS
* Capital Goods
* Telecom / Digital Infrastructure
* Banks / Financial Services
* Pharmaceuticals / Healthcare
* Auto Components / Engineering
* Cement / Building Materials
* Consumer / Premiumisation

For every sector calculate:

* current sector attractiveness;
* earnings growth;
* valuation relative to history;
* domestic-demand dependence;
* export exposure;
* geopolitical sensitivity;
* government-capex dependence;
* commodity sensitivity;
* interest-rate sensitivity;
* major structural drivers;
* key risks.

Do not hardcode sector conclusions.

The system must re-evaluate them from available data.

---

# 6. MARKET POSITION

For each stock maintain:

* current price;
* 52-week high;
* 52-week low.

Calculate:

52W Position =
(Current Price - 52W Low) /
(52W High - 52W Low)

In the main screening table simplify this into:

* Closer to Low
* Closer to High

Allow detailed screens to display the exact percentile.

A stock being closer to its 52-week low must NOT automatically be treated as undervalued.

---

# 7. HISTORICAL BACKTEST ENGINE

This is a critical feature.

Build a proper point-in-time backtesting engine.

The engine must prevent look-ahead bias.

Users should be able to enter:

* analysis date;
* execution date;
* end date;
* starting capital;
* target CAGR;
* inflation assumption;
* benchmark;
* portfolio weighting method;
* transaction-cost assumptions.

Example:

Analysis date:
27-Aug-2021

Execution:
30-Aug-2021

End date:
28-Aug-2026

Starting portfolio:
₹10,00,000

Target:
12% CAGR

Inflation:
8%

Portfolio:
equal weight among all clear BUY signals.

The engine must reconstruct:

* dividend history known on the analysis date;
* financial statements available on the analysis date;
* valuation available at that time;
* price;
* 52-week range;
* analyst/model inputs available at that time;
* corporate actions.

It MUST NOT use future data when generating historical BUY/WATCH/AVOID signals.

---

# 8. BACKTEST OUTPUT

Provide:

* stocks selected;
* stocks rejected;
* reason for selection;
* capital allocated;
* number of shares;
* execution price;
* dividends received;
* splits;
* bonuses;
* demergers;
* spin-offs;
* terminal price;
* terminal market value;
* total return;
* CAGR;
* real CAGR;
* benchmark CAGR;
* alpha;
* maximum drawdown;
* volatility;
* hit rate.

At portfolio level show:

Starting capital

Final value

Absolute profit

Total return

CAGR

Inflation-adjusted CAGR

Nifty 50 TRI result

Sensex TRI result

Alpha vs Nifty

Alpha vs Sensex

Percentage of stocks exceeding target CAGR

Top contributors

Worst contributors

---

# 9. MODEL VERDICT

Every completed backtest must display one prominent statement:

MODEL VERDICT: WORKS

or

MODEL VERDICT: DOES NOT WORK

Default definition of WORKS:

* portfolio CAGR >= configured target CAGR; AND
* portfolio total-return CAGR > selected benchmark TRI CAGR.

Allow this rule to be configured.

Immediately below the verdict display supporting numbers.

Never hide underperformance behind qualitative language.

---

# 10. ROBUSTNESS TESTING

Do not consider one successful backtest sufficient.

Build automated robustness tests.

Run the same strategy across multiple start dates.

Examples:

Aug-2020 → Aug-2025

Aug-2021 → Aug-2026

Jan-2020 → Dec-2024

Jan-2021 → Dec-2025

Also support rolling monthly or quarterly five-year windows when data permits.

Calculate:

* median portfolio CAGR;
* median alpha;
* worst cohort;
* best cohort;
* percentage of cohorts beating target;
* percentage beating Nifty TRI;
* percentage beating Sensex TRI.

Also run:

Portfolio excluding best stock

Portfolio excluding top 3 stocks

Portfolio excluding best sector

This detects whether results are dependent on a few outliers.

---

# 11. SURVIVORSHIP-BIAS CONTROL

Do not construct historical universes only from companies that exist today.

Historical screens must attempt to reconstruct the eligible listed universe as of the historical date.

Flag unavailable or incomplete historical information.

Never silently substitute present-day data.

---

# 12. CORPORATE ACTION ENGINE

Correctly process:

* stock splits;
* bonus shares;
* rights issues;
* mergers;
* demergers;
* spin-offs;
* ticker changes;
* company-name changes;
* delistings;
* acquisitions.

Example:

If a company demerges and shareholders receive shares in another listed entity, the backtest must include the value of both holdings.

Do not calculate return by simply comparing the old ticker's historical price with today's price.

---

# 13. DATA PROVENANCE

Every financial metric must carry provenance.

Store:

* provider;
* source URL/API;
* retrieval timestamp;
* source date;
* raw value;
* normalized value;
* adjustment performed;
* confidence level.

The UI must expose a Sources panel.

Example:

Current Price:
₹X

Source:
NSE / provider

Observed:
28-Aug-2026 15:30 IST

Dividend FY2025:
₹X

Source:
Company corporate-action disclosure

Never fabricate missing values.

Use:

Unavailable

Not verified

Source stale

when necessary.

---

# 14. DATA ARCHITECTURE

Create normalized entities such as:

Company

Security

Exchange

Sector

Industry

Listing

PriceHistory

Dividend

CorporateAction

FinancialStatement

FinancialMetric

ValuationSnapshot

SectorSnapshot

ModelRun

ModelSignal

ModelAssumption

Backtest

BacktestPosition

Portfolio

PortfolioPosition

Benchmark

BenchmarkPrice

Watchlist

Alert

SourceRecord

AuditLog

User

---

# 15. MARKET DATA LAYER

Build a provider abstraction.

Example:

MarketDataProvider

methods:

getQuote()

getHistoricalPrices()

get52WeekRange()

getCorporateActions()

getDividends()

getFinancials()

getBenchmarkData()

Implement adapters rather than coupling the application to one website.

Support provider priority and fallback.

Example:

Primary:
Exchange/provider A

Secondary:
Provider B

Tertiary:
Provider C

Every provider must support rate limits, caching, retries and failure handling.

---

# 16. DATA VALIDATION

Implement automatic sanity checks.

Examples:

Current price > 0

52W low <= current price <= 52W high

Dividend cannot be negative

Split-adjusted values should reconcile

A 500% one-day price move should trigger investigation

Yield must reconcile approximately with annual dividend/current price

A source timestamp older than the configured threshold must be flagged stale.

Never silently accept inconsistent data.

---

# 17. PORTFOLIO SIMULATOR

Users should be able to enter:

₹10 lakh

₹25 lakh

₹50 lakh

or custom capital.

Allocation options:

* equal weighted;
* user-defined;
* risk-weighted;
* sector capped.

Show:

shares purchased

cash residual

portfolio expected CAGR

weighted dividend yield

sector exposure

valuation exposure

risk concentration

expected five-year value

real expected value.

---

# 18. WATCHLIST AND MONITORING

Allow users to watch companies.

Monitor:

* price;
* valuation;
* expected CAGR;
* dividend declaration;
* dividend cut;
* earnings changes;
* debt deterioration;
* sector changes;
* corporate actions.

Example alert:

KEC International moved from WATCH → BUY

Reason:

Expected 5Y CAGR increased from 9.6% to 13.1% following price decline while earnings assumptions remained unchanged.

Store the previous and new signal.

---

# 19. DASHBOARD

Create a high-quality institutional-style dashboard.

Top cards:

Portfolio Value

Expected 5Y CAGR

Real CAGR

Dividend Yield

Nifty Relative Return

Number of BUY candidates

Number of WATCH candidates

Alerts

Charts:

portfolio value

benchmark comparison

sector allocation

expected return distribution

dividend growth

valuation history

model-signal history.

---

# 20. STOCK DETAIL PAGE

Each stock should have:

Company overview

Current signal

Expected CAGR

Scenario analysis

Dividend history

Dividend yield

Dividend CAGR

52-week position

Revenue history

EPS history

ROE

ROCE

Debt

Free cash flow

Valuation

Historical P/E

Sector comparison

Investment thesis

Risks

Corporate actions

Model history

Backtest history

Sources.

---

# 21. SCREENING TABLE

Support sorting/filtering by:

Industry

Signal

Expected CAGR

Real CAGR

Dividend yield

Dividend CAGR

P/E

EV/EBITDA

ROE

ROCE

Debt/equity

52W position

Market capitalization

Historical valuation percentile.

Default columns:

Industry

Company

Current Price

Dividend History

Dividend Yield

52W Position

Expected 5Y CAGR

Expected Real CAGR

Signal

Confidence

Last Updated.

Allow CSV export.

---

# 22. PROFESSIONAL UI / UX

The product should look like a premium institutional investment-research platform.

Do NOT make it look like:

* a crypto trading app;
* a gaming interface;
* a generic Bootstrap admin template.

Design principles:

* restrained colour palette;
* excellent typography;
* large readable financial numbers;
* subtle cards;
* responsive tables;
* generous spacing;
* high-density information without clutter;
* consistent chart styling;
* accessible contrast;
* desktop-first research interface;
* excellent tablet/mobile adaptation.

Support:

light theme

dark theme

system theme.

Use consistent Indian-number formatting:

₹1,25,000

₹10.5 lakh

₹2.4 crore

where appropriate.

---

# 23. PWA REQUIREMENTS

The application must be a proper installable PWA.

Implement:

* web app manifest;
* install prompt;
* service worker;
* offline shell;
* cached portfolio/watchlist;
* stale-while-revalidate where appropriate;
* background synchronization where supported;
* responsive navigation;
* home-screen icons;
* splash configuration.

Offline mode should clearly show:

Last updated:
28-Aug-2026 15:30 IST

Do not display stale data as live.

---

# 24. DISTRIBUTION

The PWA must be deployable as a normal web application and installable from supported browsers.

Design architecture so it can later be wrapped using Capacitor if native Android/iOS store distribution is required.

Avoid browser APIs that make mobile wrapping difficult.

---

# 25. SECURITY

Treat financial/watchlist data as sensitive user information.

Implement:

* secure authentication;
* HTTPS only;
* secure cookies;
* CSRF protection;
* CSP;
* XSS protection;
* input validation;
* parameterized queries;
* rate limiting;
* session revocation;
* encrypted secrets;
* role-based permissions;
* audit logs.

Never expose API keys to the browser.

Validate all server-side authorization.

---

# 26. AUTHENTICATION

Support:

Google sign-in

Email login if configured.

Roles:

User

Analyst

Administrator.

Administrators can configure:

model assumptions

providers

sector taxonomy

hurdle rate

inflation assumption

data freshness thresholds.

---

# 27. OBSERVABILITY

Implement:

structured logs

error tracking

performance monitoring

data-provider health

job health

failed-data-refresh alerts

model-run logs

audit trail.

Every model execution should store:

model version

input snapshot

assumptions

output

timestamp.

This allows historical reproducibility.

---

# 28. MODEL VERSIONING

Never overwrite historical investment logic.

Create versions such as:

Model 1.0

Model 1.1

Model 2.0

Store which version generated every signal and backtest.

Users should be able to compare:

Model 1 vs Model 2.

---

# 29. TESTING

Implement:

unit tests

integration tests

API tests

data normalization tests

financial-calculation tests

corporate-action tests

backtest tests

UI tests

end-to-end tests.

Create deterministic test fixtures.

Critical formulas must have explicit tests.

Test:

12% CAGR calculation

inflation conversion

dividend reinvestment

split adjustments

demerger handling

portfolio weighting

benchmark alpha.

---

# 30. CI/CD

Set up:

linting

type checking

unit tests

integration tests

production build

security scanning

database migration verification

deployment.

PRs should fail if tests fail.

Use separate:

development

staging

production

environments.

---

# 31. PERFORMANCE

Targets:

Lighthouse PWA >= 95 where practical

LCP < 2.5 seconds

CLS < 0.1

responsive interaction

server-side caching

database indexing

pagination for large screens

virtualized long tables where appropriate.

Do not fetch thousands of quotes directly from the client.

---

# 32. ACCESSIBILITY

Target WCAG 2.2 AA.

Support:

keyboard navigation

screen readers

semantic HTML

focus indicators

accessible charts

text equivalents

colour-independent signal indication.

BUY / WATCH / AVOID must never depend on colour alone.

---

# 33. DISCLAIMER

Display an appropriate disclaimer such as:

“This application provides quantitative research and historical analysis. Model outputs, expected returns and BUY/WATCH/AVOID classifications are estimates based on assumptions and historical data. They do not guarantee future performance and should not be considered personalized investment advice.”

Do not imply guaranteed returns.

---

# 34. REPORTING

Users should be able to generate:

Stock Analysis Report

Portfolio Report

Backtest Report

Dividend Report

Model Validation Report.

Backtest report must contain:

MODEL VERDICT: WORKS

or

MODEL VERDICT: DOES NOT WORK

followed by:

model version

date range

starting capital

ending capital

CAGR

real CAGR

Nifty TRI CAGR

Sensex TRI CAGR

alpha

hit rate

drawdown

selected stocks

failed stocks

corporate actions

sources

limitations.

Support:

PDF

CSV

print-friendly view.

---

# 35. TECHNICAL ARCHITECTURE

Use a modern strongly typed architecture.

Recommended structure:

Frontend:
modern React-based framework with TypeScript.

Backend:
server-side TypeScript or another production-grade typed backend.

Database:
PostgreSQL.

ORM:
mature type-safe ORM.

Caching:
Redis-compatible cache where appropriate.

Jobs:
durable scheduled-job system.

Charts:
high-quality financial charting library.

Validation:
shared runtime schemas.

API:
versioned typed APIs.

Use current stable production versions rather than hardcoding obsolete package versions.

---

# 36. PROJECT STRUCTURE

Use modular domains:

/auth

/companies

/market-data

/dividends

/financials

/valuations

/sectors

/model

/backtesting

/portfolios

/watchlists

/alerts

/reports

/admin

/audit

/sources.

Investment calculations must not live inside UI components.

---

# 37. DATABASE MIGRATIONS AND SEEDING

Provide:

database schema

migrations

seed scripts

sample Indian-stock dataset

sample dividend history

sample price history

sample backtest.

Seed a demonstration backtest:

Capital:
₹10,00,000

Decision cutoff:
27-Aug-2021

Execution:
30-Aug-2021

End:
28-Aug-2026

Hurdle:
12%

Inflation:
8%.

Clearly label seed data as demonstration data unless fully sourced.

---

# 38. DOCUMENTATION

Generate:

README

architecture overview

database ER diagram

deployment guide

environment variable reference

market-data provider guide

backtest methodology

corporate-action methodology

security documentation

operational runbook

testing guide.

---

# 39. DEVELOPMENT APPROACH

Do not attempt to generate the entire application as one unstructured code dump.

Work in phases.

Phase 1:
Architecture and requirements validation.

Phase 2:
Database and data model.

Phase 3:
Market-data abstraction.

Phase 4:
Dividend and corporate-action engine.

Phase 5:
Investment model.

Phase 6:
Backtesting engine.

Phase 7:
Portfolio/watchlist.

Phase 8:
Professional UI.

Phase 9:
PWA functionality.

Phase 10:
Testing/security.

Phase 11:
Deployment.

At the beginning of every phase:

state the goal;

list files being created;

identify dependencies;

identify risks.

At the end:

run tests;

report failures;

do not declare success if tests fail.

---

# 40. CODE QUALITY RULES

No placeholder functions.

No fake APIs.

No hardcoded financial results.

No `TODO` in critical functionality.

No silently swallowed errors.

No calculations duplicated across components.

No business logic in UI components.

No unvalidated external data.

No secrets in source control.

No dependency on scraping HTML from one provider without an abstraction layer.

Use comments to explain financial/business logic, not obvious syntax.

---

# 41. FAILURE HANDLING

If market data is unavailable:

show last known value;

show timestamp;

show stale indicator.

If dividend data conflicts:

show conflict;

retain both source records;

do not silently choose one unless a provider-priority rule resolves it.

If expected-return calculation lacks sufficient data:

show:

INSUFFICIENT DATA

rather than generating a BUY/WATCH result.

---

# 42. ADMIN MODEL CONFIGURATION

Allow model parameters to be changed without code deployment.

Examples:

Required CAGR = 12%

Inflation = 8%

Horizon = 5 years

Minimum ROCE

Maximum debt/equity

Minimum earnings growth

Minimum dividend history

Maximum sector concentration

Valuation margin of safety.

Record parameter changes in the audit log.

Model signals generated before the change must retain their original assumptions.

---

# 43. EXPLAINABILITY

For each BUY show something similar to:

BUY

Expected five-year CAGR:
14.7%

Drivers:

EPS CAGR:
13.2%

Dividend contribution:
0.8%

Valuation change:
+0.7%

Expected terminal value:
₹X

Current price:
₹Y

Downside scenario:
8.1%

Base:
14.7%

Upside:
20.4%

This calculation must be reproducible.

---

# 44. CONFIDENCE SCORE

Create confidence from data quality rather than arbitrary AI opinion.

Possible inputs:

financial-history completeness;

source agreement;

forecast dispersion;

valuation uncertainty;

corporate-action complexity;

earnings stability.

Display:

High

Medium

Low

and explain why.

---

# 45. AI USE

AI may be used for:

summarising company filings;

explaining model results;

extracting structured risks;

natural-language portfolio queries;

generating human-readable reports.

AI must NOT silently alter financial calculations.

All quantitative calculations must be deterministic code.

AI-generated claims must link back to source information.

---

# 46. NATURAL-LANGUAGE QUERIES

Support questions such as:

“Show dividend-qualified power companies with expected CAGR above 12%.”

“Which BUY stocks are currently closer to their 52-week low?”

“Why is KEC WATCH rather than BUY?”

“Show companies whose dividend CAGR is above 8%.”

“Backtest the model from August 2020 for five years.”

“What would ₹25 lakh have become?”

“Which stocks contributed most to alpha?”

Translate natural-language requests into deterministic queries rather than allowing an LLM to invent financial data.

---

# 47. INITIAL ACCEPTANCE TEST

The product is not complete until it can:

1. import or retrieve an Indian-stock universe;

2. identify dividend-qualified companies;

3. calculate 52-week positioning;

4. calculate dividend yield/history;

5. run deterministic expected-return scenarios;

6. generate BUY/WATCH/AVOID;

7. build a ₹10 lakh equal-weight portfolio;

8. execute a historical point-in-time backtest;

9. correctly process dividends and corporate actions;

10. compare the result against Nifty 50 TRI and Sensex TRI;

11. calculate nominal CAGR;

12. calculate real CAGR;

13. calculate alpha;

14. generate a PDF report;

15. export CSV;

16. display:

MODEL VERDICT: WORKS

or

MODEL VERDICT: DOES NOT WORK;

17. install successfully as a PWA;

18. pass security, unit, integration and E2E tests;

19. deploy successfully to production;

20. reproduce a historical backtest from stored inputs.

---

# 48. OUTPUT EXPECTED FROM YOU

Before writing application code, provide:

1. proposed architecture;

2. technology stack and rationale;

3. complete feature map;

4. database schema;

5. model calculation specification;

6. point-in-time/backtest architecture;

7. market-data-provider abstraction;

8. security architecture;

9. PWA architecture;

10. deployment architecture;

11. project folder structure;

12. milestone plan;

13. major technical risks;

14. assumptions requiring confirmation.

Then begin implementation phase by phase.

Do not skip architecture and immediately generate UI code.

The finished result must be maintainable, auditable, extensible, testable and suitable for distribution to real users.
