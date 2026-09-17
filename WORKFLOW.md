USED = sources we actually used during the Excel analysis/backtest.
PROPOSED ADDITIONAL = sources we did not systematically use for the Excel analysis but should consider for a stronger production implementation.

Step 1 → Analyse the current environment

Assess global conditions, geopolitics, India's economic environment, policy, capex, inflation, interest rates, trade and structural developments.

USED: Reuters and public web/news research were used for geopolitical, market and economic context. We also used information encountered through company/market research.

PROPOSED ADDITIONAL: RBI, PIB, Ministry of Finance, Economic Survey, Ministry of Commerce and other Government of India publications.

Output: Current environment and structural themes.

Step 2 → Select attractive/resilient industries

Use Step 1 to determine which Indian industries appear structurally attractive or resilient under the prevailing environment.

USED: Reuters/public web research, Economic Times/market information, company/industry information and the broader web research conducted during our original industry-selection discussion.

PROPOSED ADDITIONAL: Ministry of Defence, Ministry of Power, MeitY, DoT, Ministry of Finance, PIB, RBI, sector regulators and industry-specific government publications.

These additional sources should make industry selection more systematic and evidence-driven.

Output: Selected industries with reasons, catalysts and risks.

Step 3 → Build the company universe

Identify Indian-listed companies operating in the industries selected in Step 2.

USED: Moneycontrol, Economic Times Markets and other public market/company pages encountered during the research.

PROPOSED ADDITIONAL: NSE security/listing information and BSE security/listing information as authoritative company-universe sources.

Output: Candidate companies grouped by selected industry.

Step 4 → Apply the ONLY eligibility criterion

A company is eligible when it has paid a dividend in each of the last 10 completed years, or, if it has been listed for less than 10 years, in every eligible year since its listing year.

This is the only eligibility gate.

USED: Primarily Moneycontrol dividend-history pages. Company investor-relations pages and Goodreturns/other public sources were used for some verification and special cases.

The Excel workbook itself contains Moneycontrol dividend URLs for most companies. For example, BEL uses Moneycontrol for its dividend history.

PROPOSED ADDITIONAL: NSE corporate actions, BSE corporate actions and systematic company-IR dividend retrieval.

Output: ELIGIBLE / NOT ELIGIBLE, dividend history and any failed year.

Step 5 → Fetch the minimum fresh company/market data

Retrieve only the information needed to perform the five-year assessment.

USED — current price / 52W information: Moneycontrol was the main source, with Economic Times Markets, Upstox, Dhan and ICICI Direct used when necessary.

For example, the Excel dashboard uses Dhan for Kalpataru Projects, while Power Grid and NTPC use Moneycontrol. Endurance uses Upstox.

USED — historical prices: EquityPandit and StockPriceArchive were used during historical reconstruction/backtesting.

USED — corporate actions: Company disclosures/IR pages and public market sources were used where corporate actions materially affected calculations.

PROPOSED ADDITIONAL: NSE/BSE public information as additional authoritative sources, plus more systematic company-IR extraction.

Output: Fresh, source-attributed company-data snapshot.

Step 6 → Perform the 5-Year Business & Earnings Assessment

Estimate how the company could reasonably develop over the next five years. This is not an eligibility test.

We need enough information to estimate future earnings—not a huge conventional fundamental-analysis checklist.

USED: Moneycontrol, Economic Times/company pages, company results/IR information and public web research.

PROPOSED ADDITIONAL: Systematic extraction from company annual reports, quarterly results, investor presentations and NSE/BSE regulatory filings.

This would improve the production model because the existing Excel process did not have a fully automated financial-statement ingestion pipeline.

Output: Bear / Base / Bull five-year business and earnings assumptions.

Step 7 → Determine reasonable five-year valuation

Estimate a reasonable future valuation for the company under Bear/Base/Bull scenarios.

USED: Current market prices, historical/company information from Moneycontrol, Economic Times and other public market pages, together with the business assessment.

PROPOSED ADDITIONAL: Systematically calculated historical valuation ranges from locally stored price + earnings data, peer valuation comparisons and company filing data.

This is preferable eventually because YieldAlpha could calculate much of the valuation history itself rather than depending on another site's displayed P/E.

Output: Bear / Base / Bull terminal valuation and terminal price.

Step 8 → Calculate expected five-year value and CAGR

Calculate:

Current Price → Estimated 5Y Price → Nominal CAGR → Real CAGR

Default:

Investment horizon = 5 years
Inflation = 8%

Dividend income can be shown as additional shareholder return rather than requiring a detailed five-year dividend forecast.

USED: Inputs produced by the preceding research steps.

PROPOSED ADDITIONAL: None required.

This should be 100% deterministic YieldAlpha calculation code.

Output: Bear / Base / Bull nominal and real CAGR.

Step 9 → Apply the 12% hurdle

Determine whether the Base case provides a credible path to:

≥12% CAGR over five years.

USED: Our own deterministic calculation.

PROPOSED ADDITIONAL: None.

No website should decide whether a stock passes the hurdle.

Output: Return hurdle PASS/FAIL.

Step 10 → Make the investment decision

Classify each eligible company:

BUY / WATCH / AVOID / INSUFFICIENT DATA

using Steps 1–9.

USED: The combined analysis and calculations above.

PROPOSED ADDITIONAL: None as a decision source.

External sources supply facts. YieldAlpha itself makes the investment classification.

Output: Recommendation + explanation + risks + assumptions.

Step 11 → Construct the portfolio

Allocate available capital across clear BUY candidates.

USED: Current prices and model results.

PROPOSED ADDITIONAL: None.

All allocation calculations should be performed locally.

Output: Capital allocation, shares, residual cash, industry concentration and expected five-year portfolio value.

Step 12 → Generate the normal analysis report

Produce:

Environment → Industries → Companies → Dividend Eligibility → 5Y Business/Earnings → Valuation → Bear/Base/Bull CAGR → 12% Test → BUY/WATCH/AVOID → Portfolio → Risks → Sources

USED: All source observations and model calculations generated in Steps 1–11.

PROPOSED ADDITIONAL: None specifically for report generation.

The report should not perform new research. It should report the frozen analysis snapshot.

Step 13 → Save and monitor

Store the analysis date, model version, data snapshot, sources, assumptions and decisions.

On subsequent analysis runs, identify changes such as:

WATCH → BUY
BUY → WATCH
Industry IN → WATCH

USED: Our Excel Weekly History/dashboard concept already performs a basic version of this.

PROPOSED ADDITIONAL: Automated change detection, locally stored snapshots and event-driven refresh.

Output: Historical decision trail and change alerts.

OPTIONAL MODEL VALIDATION

These are not required for every normal investment evaluation.

They are run when requested or when the model/methodology changes.

Step 14 — OPTIONAL → Historical backtest

Reconstruct the model at a historical point using only information that existed then.

USED: EquityPandit and StockPriceArchive for historical prices; Moneycontrol/Goodreturns/company disclosures for dividends and corporate actions; company disclosures where special treatment such as Siemens/Motherson was necessary.

PROPOSED ADDITIONAL: NSE/BSE historical corporate-action information, historical regulatory filings and a more systematic point-in-time filing archive.

Output: Historical simulated portfolio.

Step 15 — OPTIONAL → Compare against benchmarks

Compare historical portfolio performance against:

Nifty 50 TRI
Sensex TRI

USED: NSE/Nifty Indices information for Nifty TRI methodology/results and publicly available Sensex benchmark information during our reconstructed backtest.

PROPOSED ADDITIONAL: Exact historical Nifty 50 TRI levels directly from NSE/Nifty Indices and exact Sensex TRI levels directly from BSE for every start/end date.

This would improve on the approximate near-period benchmark figures used in parts of our original reconstruction.

Output: Portfolio CAGR, benchmark CAGR and alpha.

Step 16 — OPTIONAL → Determine model verdict

Calculate:

MODEL VERDICT: WORKS

or

MODEL VERDICT: DOES NOT WORK

USED: Our deterministic comparison of the reconstructed portfolio against the 12% hurdle and benchmark.

PROPOSED ADDITIONAL: None.

This is a YieldAlpha calculation, not externally sourced.
