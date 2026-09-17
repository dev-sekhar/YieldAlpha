import unittest

from yieldalpha_public_extractors import (
    ParserBrokenError,
    CompanyFilingFundamentalsExtractor,
    EquityPanditHistoricalExtractor,
    MoneycontrolQuoteExtractor,
    MoneycontrolDividendExtractor,
    NSECorporateActionPageExtractor,
    NSEListingExtractor,
    NiftyIndicesBenchmarkExtractor,
    PublicValuationExtractor,
)
from yieldalpha_fresh_data_fetch_scaffold import load_public_source_config


QUOTE = """
<html><body>
  <div>Current Price: ₹100.25</div>
  <div>52 Week Low: ₹80.00</div>
  <div>52 Week High: ₹120.00</div>
</body></html>
"""

DIVIDENDS = """
<table><tr><th>Year</th><th>Amount</th></tr>
<tr><td>2022</td><td>Dividend per share: Rs 3.50</td></tr>
<tr><td>2023</td><td>Amount: Rs 4.00</td></tr></table>
"""

HISTORY = """
<table><tr><th>Date</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume</th></tr>
<tr><td>30-Aug-2021</td><td>100.00</td><td>105.00</td><td>98.00</td><td>103.00</td><td>120000</td></tr></table>
"""

FUNDAMENTALS = """
<table>
<tr><td>FY 2022</td><td>Revenue: 1000</td></tr>
<tr><td>FY 2022</td><td>Net Profit: 100</td></tr>
<tr><td>FY 2022</td><td>EPS: 10</td></tr>
<tr><td>FY 2022</td><td>Equity: 500</td></tr>
<tr><td>FY 2022</td><td>Total Debt: 200</td></tr>
<tr><td>FY 2022</td><td>Cash: 50</td></tr>
<tr><td>FY 2022</td><td>Operating Cash Flow: 130</td></tr>
<tr><td>FY 2022</td><td>Capital Expenditure: 30</td></tr>
<tr><td>FY 2022</td><td>EBIT: 150</td></tr>
</table>
"""


class PublicExtractorFixtureTests(unittest.TestCase):
    def test_quote_parser_returns_price_and_range(self):
        values = {item.metric: item.value for item in MoneycontrolQuoteExtractor("https://example.test/{symbol}").parse(QUOTE)}
        self.assertEqual(values, {"current_price": 100.25, "week52_low": 80.0, "week52_high": 120.0})

    def test_dividend_parser_returns_each_year(self):
        values = MoneycontrolDividendExtractor("https://example.test/{symbol}").parse(DIVIDENDS)
        self.assertEqual([(item.observed_at, item.value) for item in values], [("2022-12-31", 3.5), ("2023-12-31", 4.0)])

    def test_historical_parser_does_not_treat_date_as_price(self):
        values = EquityPanditHistoricalExtractor("https://example.test/{symbol}").parse(HISTORY)
        self.assertEqual([(item.metric, item.value) for item in values], [("price_open", 100.0), ("price_high", 105.0), ("price_low", 98.0), ("price_close", 103.0), ("price_volume", 120000.0)])

    def test_fundamentals_parser_reads_statement_fields(self):
        values = {item.metric: item.value for item in CompanyFilingFundamentalsExtractor("https://example.test/{symbol}").parse(FUNDAMENTALS)}
        self.assertEqual(values["revenue"], 1000.0)
        self.assertEqual(values["net_profit"], 100.0)
        self.assertEqual(values["operating_cash_flow"], 130.0)
        self.assertEqual(values["capital_expenditure"], 30.0)

    def test_valuation_and_benchmark_parsers(self):
        valuation = PublicValuationExtractor("https://example.test/{symbol}").parse("<p>P/E: 12.5</p>")
        benchmark = NiftyIndicesBenchmarkExtractor("https://example.test/{symbol}").parse(HISTORY)
        self.assertEqual(valuation[0].value, 12.5)
        self.assertEqual(len(benchmark), 5)

    def test_listing_and_corporate_action_parsers(self):
        listing = NSEListingExtractor("https://example.test/{symbol}").parse("<p>Listing Date: 15-Mar-2010</p>")
        action = NSECorporateActionPageExtractor("https://example.test/{symbol}").parse("<table><tr><td>30-Aug-2021</td><td>Bonus issue</td></tr></table>")
        self.assertEqual(listing[0].value, "15-Mar-2010")
        self.assertEqual(action[0].value, "bonus")

    def test_parser_broken_is_explicit(self):
        with self.assertRaises(ParserBrokenError):
            MoneycontrolQuoteExtractor("https://example.test/{symbol}").parse("<p>Unavailable</p>")

    def test_bundled_configuration_enables_fallback_families(self):
        config = load_public_source_config("data/public-source-config.json")
        for category in ("quotes", "dividends", "historical_prices", "fundamentals", "listings", "corporate_actions", "valuations", "benchmarks"):
            self.assertTrue(config.get(category), category)


if __name__ == "__main__":
    unittest.main()
