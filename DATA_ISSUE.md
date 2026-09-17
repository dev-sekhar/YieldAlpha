The current YieldAlpha implementation is not data-complete. Do not continue working on UI, reports, alerts, or backtesting until the live data-ingestion layer is functional.

The docs/DATA\_AVAILABILITY\_MATRIX shows that the only real live fetch currently attempted is NSE quote/corporate-actions retrieval, and that request failed before retrieval because [www.nseindia.com](http://www.nseindia.com) could not be resolved. Historical prices, company fundamentals, valuation, listing data, Nifty TRI and Sensex TRI do not yet have working live extractors.

The application requirement is:

* no paid market-data provider;
* no API key;
* no YieldAlpha backend;
* data must be retrieved directly by the installed application/local companion from publicly accessible websites over the internet;
* the app must use multiple sources and fallbacks rather than depending entirely on NSE.

Refactor the ingestion layer accordingly.

## 1\. Diagnose the NSE failure first

From the same runtime where the fetcher runs, execute and record:

nslookup [www.nseindia.com](http://www.nseindia.com)
getent hosts [www.nseindia.com](http://www.nseindia.com)
python DNS resolution using socket.getaddrinfo()
curl/requests connectivity test to:
https://www.nseindia.com/

Determine whether the failure is:

DNS resolution,
network sandbox restriction,
proxy configuration,
TLS,
IPv6,
anti-bot response,
or NSE application blocking.

Do not classify a DNS/network failure as a parser failure.

Return explicit status codes such as:

DNS\_FAILED
NETWORK\_BLOCKED
HTTP\_403
HTTP\_429
PARSER\_BROKEN
OK

## 2\. Implement source fallback chains

Do not use NSE as the only live source.

### Current price / 52-week range

Implement independent extractors for multiple public sources already used during the original research, such as:

* Moneycontrol
* Economic Times Markets
* Upstox public stock pages
* Dhan public stock pages
* ICICI Direct public stock pages

The fallback logic must be:

Source A
→ if DNS/network/parser/blocked failure
Source B
→ Source C
→ Source D
→ last locally cached value marked STALE

At least two independent public sources must work for one test stock before declaring quote ingestion complete.

## 3\. Dividend history

Implement dedicated dividend/corporate-action extractors separately from quotes.

Preferred hierarchy:

* NSE corporate actions
* BSE corporate actions
* company investor-relations dividend page
* Moneycontrol dividend-history page
* Goodreturns / Investing.com as verification fallback

Test at minimum:

BEL
Power Grid
Sun Pharma
L\&T
Britannia

For each company return:

year
dividend\_per\_share
dividend\_type
ex\_date
record\_date
source\_url
retrieved\_at
confidence

Then aggregate annual dividend totals.

The only eligibility rule remains:

a company must have paid a dividend in every eligible year from 2016 onwards.

Do not add any other eligibility rule.

## 4\. Historical prices

Implement a real historical-price extractor.

Do not leave this as only a provider interface.

Use public historical sources that were used in the original research, for example:

* EquityPandit
* StockPriceArchive
* any other permitted public historical source that returns actual OHLC records

Return:

date
open
high
low
close
volume
source

Validate by retrieving at least one historical price for:

BEL on 30-Aug-2021
Tata Communications on 30-Aug-2021
Exide on 30-Aug-2021

## 5\. Fundamentals

The current matrix shows no live extractor for:

revenue
EPS
profit
free cash flow
ROE
ROCE
debt/equity
earnings growth
valuation / P-E

Implement these before allowing the full investment model to run.

Preferred source hierarchy:

1. company annual/quarterly filings;
2. NSE/BSE company filings;
3. structured company investor-relations documents/pages;
4. secondary public financial sites as fallback.

At minimum retrieve:

revenue
PAT
EPS
equity
total debt
cash
operating cash flow

Then calculate deterministic metrics locally where possible:

ROE
debt/equity
earnings growth
free cash flow

Do not blindly trust a website's precomputed ratios if they can be calculated from sourced statements.

Every observation must contain:

period\_end
published\_at / known\_from
source
retrieved\_at

Point-in-time backtesting must use:

known\_from <= analysis\_date.

## 6\. Benchmark ingestion

Implement actual historical retrieval for:

Nifty 50 TRI
Sensex TRI

Do not merely create database tables/contracts.

The backtest cannot be considered complete until exact historical benchmark levels can be retrieved for the chosen start/end dates.

## 7\. Source-independent normalized schema

Every extractor must normalize into the same local records.

Example quote record:

{
symbol,
currentPrice,
low52,
high52,
observedAt,
retrievedAt,
source,
sourceUrl,
status
}

Example financial record:

{
symbol,
metric,
periodEnd,
publishedAt,
value,
unit,
source,
sourceUrl,
retrievedAt
}

## 8\. Raw-response capture

Store every successful source response before parsing.

Also store failed attempts with:

URL
timestamp
status
HTTP code
DNS/network error
parser version

This is essential for debugging broken public sources.

## 9\. Parser contract tests

Create fixture-based tests for every website extractor.

Store a representative page response locally as a test fixture.

Tests must detect when:

a required selector disappears,
JSON structure changes,
price cannot be extracted,
52-week values are inverted,
dividend value is missing.

Do not return zero on parser failures.

Return PARSER\_BROKEN.

## 10\. Live acceptance test

The ingestion phase is complete only when all of the following succeed from a real internet-connected device/runtime:

For BEL:

company/security identity: PASS
current price: PASS
52-week high/low: PASS
dividend history: PASS
historical price: PASS
fundamentals: PASS
valuation: PASS

For benchmarks:

Nifty 50 TRI history: PASS
Sensex TRI history: PASS

Then repeat current-price retrieval using a second company and a second source.

Finally run the deterministic model.

Do not mark the application complete because unit tests pass while live data is missing.

The acceptance criterion is actual retrieved external data.

## 11\. Runtime/environment requirement

If Codex CLI itself runs inside a network-restricted sandbox where public DNS or internet access is unavailable, do not treat that as an application defect.

Instead:

* retain fixture/unit tests in Codex;
* build a local diagnostic command;
* instruct the user to run it on the actual laptop/device outside the restricted Codex environment;
* consume the resulting diagnostic JSON.

Create:

npm run diagnose:data

or

python diagnose\_data\_sources.py

which tests every configured source from the actual installed environment and writes:

data\_source\_diagnostics.json

with:

source
DNS status
HTTP status
parser status
records retrieved
error
latency

This diagnostic must make it immediately obvious whether failure comes from the source, parser, or Codex/runtime network sandbox.

