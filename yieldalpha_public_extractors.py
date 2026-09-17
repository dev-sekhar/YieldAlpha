"""Public web-page extractors used by the local YieldAlpha fetcher.

The sites in this module expose changing public HTML pages rather than one
stable, licensed API. URL templates are therefore configuration, while parsing
is isolated per source. Parsers return observations only when a value is
actually present and raise ParserBrokenError instead of returning zero.
"""

from __future__ import annotations

from dataclasses import dataclass
from html.parser import HTMLParser
import json
import re
from typing import Any, Iterable


class ParserBrokenError(RuntimeError):
    """The source responded but its expected public-page shape changed."""


@dataclass(frozen=True)
class ParsedObservation:
    metric: str
    value: Any
    unit: str | None = None
    observed_at: str | None = None
    raw_value: Any = None
    adjustment: str | None = None


def parse_number(value: Any) -> float | None:
    if value is None:
        return None
    match = re.search(r"[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?", str(value).replace("₹", ""))
    if not match:
        return None
    try:
        return float(match.group(0).replace(",", ""))
    except ValueError:
        return None


def parse_year(value: Any) -> int | None:
    match = re.search(r"\b(19\d{2}|20\d{2})\b", str(value))
    return int(match.group(1)) if match else None


class PageTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.table_rows: list[list[str]] = []
        self._row: list[str] | None = None
        self._cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "tr":
            self._row = []
        elif tag in {"td", "th"} and self._row is not None:
            self._cell = []

    def handle_endtag(self, tag: str) -> None:
        if tag in {"td", "th"} and self._row is not None and self._cell is not None:
            self._row.append(" ".join(self._cell).strip())
            self._cell = None
        elif tag == "tr" and self._row is not None:
            if self._row:
                self.table_rows.append(self._row)
            self._row = None

    def handle_data(self, data: str) -> None:
        text = " ".join(data.split())
        if not text:
            return
        self.parts.append(text)
        if self._cell is not None:
            self._cell.append(text)

    @property
    def text(self) -> str:
        return " ".join(self.parts)


def page_text(html: str) -> tuple[str, list[list[str]]]:
    parser = PageTextParser()
    parser.feed(html)
    return parser.text, parser.table_rows


def json_scripts(html: str) -> Iterable[dict[str, Any]]:
    for raw in re.findall(r"<script[^>]+type=[\"']application/ld\+json[\"'][^>]*>(.*?)</script>", html, flags=re.I | re.S):
        try:
            value = json.loads(raw.strip())
        except json.JSONDecodeError:
            continue
        values = value if isinstance(value, list) else [value]
        for item in values:
            if isinstance(item, dict):
                yield item


def labeled_number(text: str, labels: Iterable[str]) -> float | None:
    label_pattern = "|".join(re.escape(label) for label in labels)
    match = re.search(rf"(?:{label_pattern})\s*[:\-]?\s*(?:₹|Rs\.?|INR)?\s*([-+]?\d[\d,]*(?:\.\d+)?)", text, flags=re.I)
    return parse_number(match.group(1)) if match else None


def quote_observations(html: str, source: str, patterns: dict[str, list[str]]) -> list[ParsedObservation]:
    text, _ = page_text(html)
    values: dict[str, float | None] = {metric: labeled_number(text, labels) for metric, labels in patterns.items()}
    for item in json_scripts(html):
        offer = item.get("offers") if isinstance(item.get("offers"), dict) else {}
        values["current_price"] = values["current_price"] or parse_number(offer.get("price")) or parse_number(item.get("price"))
    observations = [ParsedObservation(metric=metric, value=value, unit="INR/share") for metric, value in values.items() if value is not None]
    current = next((item.value for item in observations if item.metric == "current_price"), None)
    low = next((item.value for item in observations if item.metric == "week52_low"), None)
    high = next((item.value for item in observations if item.metric == "week52_high"), None)
    if current is None:
        raise ParserBrokenError(f"{source}: current price selector was not found")
    if low is not None and high is not None and (low < 0 or high <= low or current < low or current > high):
        raise ParserBrokenError(f"{source}: 52-week range is missing, inverted, or excludes current price")
    return observations


def dividend_observations(html: str, source: str) -> list[ParsedObservation]:
    text, rows = page_text(html)
    observations: list[ParsedObservation] = []
    for row in rows:
        row_text = " ".join(row)
        year = parse_year(row_text)
        amount = labeled_number(row_text, ("dividend", "dividend per share", "amount"))
        if year is not None and amount is not None and 1900 <= year <= 2200:
            observations.append(ParsedObservation(metric="dividend_per_share", value=amount, unit="INR/share", observed_at=f"{year}-12-31", raw_value=row))
    if not observations:
        for match in re.finditer(r"(?:dividend[^\d]{0,30})(\d{4})[^₹RsINR\d]{0,20}(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d+)?)", text, flags=re.I):
            observations.append(ParsedObservation(metric="dividend_per_share", value=float(match.group(2).replace(",", "")), unit="INR/share", observed_at=f"{match.group(1)}-12-31", raw_value=match.group(0)))
    if not observations:
        raise ParserBrokenError(f"{source}: dividend history rows were not found")
    return observations


def date_in_text(value: Any) -> str | None:
    match = re.search(r"\b\d{1,2}[-/]\w{3,9}[-/]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b", str(value), flags=re.I)
    return match.group(0) if match else None


def listing_observations(html: str, source: str) -> list[ParsedObservation]:
    text, rows = page_text(html)
    candidates: list[str] = ["listing date", "listed on", "date listed", "listing since"]
    for row in rows:
        row_text = " ".join(row)
        if any(label in row_text.lower() for label in candidates):
            listed = date_in_text(row_text)
            if listed:
                return [ParsedObservation(metric="listing_date", value=listed, unit="date", observed_at=listed, raw_value=row)]
    match = re.search(r"(?:listing date|listed on|date listed|listing since)\s*[:\-]?\s*(\d{1,2}[-/]\w{3,9}[-/]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})", text, flags=re.I)
    if match:
        return [ParsedObservation(metric="listing_date", value=match.group(1), unit="date", observed_at=match.group(1), raw_value=match.group(0))]
    raise ParserBrokenError(f"{source}: listing date was not found")


def corporate_action_observations(html: str, source: str) -> list[ParsedObservation]:
    _, rows = page_text(html)
    action_terms = ("split", "bonus", "rights", "merger", "demerger", "spin-off", "spinoff", "delisting", "acquisition", "name change", "ticker change")
    observations: list[ParsedObservation] = []
    for row in rows:
        row_text = " ".join(row)
        lowered = row_text.lower()
        action_type = next((term for term in action_terms if term in lowered), None)
        effective_date = date_in_text(row_text)
        if action_type and effective_date:
            normalized_type = {"spinoff": "spin-off", "name change": "name-change", "ticker change": "ticker-change"}.get(action_type, action_type)
            observations.append(ParsedObservation(metric="corporate_action", value=normalized_type, unit="action-type", observed_at=effective_date, raw_value=row))
    if not observations:
        raise ParserBrokenError(f"{source}: corporate-action rows were not found")
    return observations


def historical_price_observations(html: str, source: str) -> list[ParsedObservation]:
    _, rows = page_text(html)
    observations: list[ParsedObservation] = []
    for row in rows:
        if len(row) < 5:
            continue
        date_index = next((index for index, cell in enumerate(row) if re.search(r"\b\d{1,2}[-/]\w{3,9}[-/]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b", cell, flags=re.I)), None)
        if date_index is None:
            continue
        date_match = re.search(r"\b\d{1,2}[-/]\w{3,9}[-/]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b", row[date_index], flags=re.I)
        if not date_match:
            continue
        # Do not parse the date cell as an OHLC value: a date contains a year,
        # which otherwise shifts the five market columns and creates plausible
        # but incorrect prices.
        numbers = [parse_number(cell) for index, cell in enumerate(row) if index != date_index]
        usable = [value for value in numbers if value is not None]
        if len(usable) < 4:
            continue
        for metric, value in zip(("open", "high", "low", "close", "volume"), usable[:5]):
            observations.append(ParsedObservation(metric=f"price_{metric}", value=value, unit="shares" if metric == "volume" else "INR/share", observed_at=date_match.group(0), raw_value=row))
    if not observations:
        raise ParserBrokenError(f"{source}: historical OHLC table was not found")
    return observations


def fundamental_observations(html: str, source: str) -> list[ParsedObservation]:
    text, rows = page_text(html)
    labels = {
        "revenue": ("revenue", "total revenue", "sales"), "net_profit": ("net profit", "profit after tax", "pat"),
        "eps": ("eps", "earnings per share"), "equity": ("shareholders equity", "total equity"),
        "total_debt": ("total debt", "borrowings"), "cash": ("cash and equivalents", "cash & equivalents", "cash"),
        "operating_cash_flow": ("operating cash flow", "cash from operations"), "capital_expenditure": ("capital expenditure", "capital expenditures", "capex"),
        "ebit": ("ebit", "operating profit", "operating income")
    }
    observations: list[ParsedObservation] = []
    for row in rows:
        row_text = " ".join(row)
        period = next((parse_year(cell) for cell in row), None)
        if period is None:
            continue
        for metric, names in labels.items():
            value = labeled_number(row_text, names)
            if value is not None:
                observations.append(ParsedObservation(metric=metric, value=value, unit="INR", observed_at=f"{period}-12-31", raw_value=row))
    if not observations:
        for metric, names in labels.items():
            value = labeled_number(text, names)
            if value is not None:
                observations.append(ParsedObservation(metric=metric, value=value, unit="INR", raw_value=names))
    if not observations:
        raise ParserBrokenError(f"{source}: financial statement fields were not found")
    return observations


def valuation_observations(html: str, source: str) -> list[ParsedObservation]:
    text, _ = page_text(html)
    pe = labeled_number(text, ("p/e", "pe ratio", "price earnings", "price-to-earnings"))
    if pe is None or pe <= 0:
        raise ParserBrokenError(f"{source}: positive P/E value was not found")
    return [ParsedObservation(metric="pe", value=pe, unit="multiple", raw_value="public-page-labeled-value")]


def benchmark_observations(html: str, source: str) -> list[ParsedObservation]:
    return historical_price_observations(html, source)


class SourceExtractor:
    name = "Public source"
    source_tier = 4

    def __init__(self, url_template: str):
        self.url_template = url_template

    def url(self, symbol: str, **kwargs: str) -> str:
        values = {"symbol": symbol, **kwargs}
        try:
            return self.url_template.format(**values)
        except KeyError as error:
            raise ValueError(f"{self.name}: URL template is missing {{{error.args[0]}}}") from error


class MoneycontrolQuoteExtractor(SourceExtractor):
    name = "Moneycontrol"
    source_tier = 3

    def parse(self, html: str) -> list[ParsedObservation]:
        return quote_observations(html, self.name, {"current_price": ("current price", "last price", "price"), "week52_low": ("52 week low", "52-week low", "52w low"), "week52_high": ("52 week high", "52-week high", "52w high")})


class EconomicTimesQuoteExtractor(MoneycontrolQuoteExtractor):
    name = "Economic Times Markets"


class UpstoxQuoteExtractor(MoneycontrolQuoteExtractor):
    name = "Upstox"


class DhanQuoteExtractor(MoneycontrolQuoteExtractor):
    name = "Dhan"


class ICICIDirectQuoteExtractor(MoneycontrolQuoteExtractor):
    name = "ICICI Direct"


class NSEDividendExtractor(SourceExtractor):
    name = "NSE India"
    source_tier = 1

    def parse(self, html: str) -> list[ParsedObservation]:
        return dividend_observations(html, self.name)


class BSEDividendExtractor(NSEDividendExtractor):
    name = "BSE India"


class CompanyIRDividendExtractor(NSEDividendExtractor):
    name = "Company investor relations"


class MoneycontrolDividendExtractor(NSEDividendExtractor):
    name = "Moneycontrol"
    source_tier = 3


class GoodreturnsDividendExtractor(NSEDividendExtractor):
    name = "Goodreturns"


class InvestingDividendExtractor(NSEDividendExtractor):
    name = "Investing.com India"


class NSECorporateActionPageExtractor(SourceExtractor):
    name = "NSE India"
    source_tier = 1

    def parse(self, html: str) -> list[ParsedObservation]:
        return corporate_action_observations(html, self.name)


class BSECorporateActionPageExtractor(NSECorporateActionPageExtractor):
    name = "BSE India"


class CompanyIRCorporateActionExtractor(NSECorporateActionPageExtractor):
    name = "Company investor relations"


class EquityPanditHistoricalExtractor(SourceExtractor):
    name = "EquityPandit"

    def parse(self, html: str) -> list[ParsedObservation]:
        return historical_price_observations(html, self.name)


class StockPriceArchiveHistoricalExtractor(EquityPanditHistoricalExtractor):
    name = "StockPriceArchive"


class CompanyFilingFundamentalsExtractor(SourceExtractor):
    name = "Company filings"
    source_tier = 1

    def parse(self, html: str) -> list[ParsedObservation]:
        return fundamental_observations(html, self.name)


class SecondaryFundamentalsExtractor(CompanyFilingFundamentalsExtractor):
    name = "Public financial page"
    source_tier = 3


class PublicValuationExtractor(SourceExtractor):
    name = "Public valuation page"

    def parse(self, html: str) -> list[ParsedObservation]:
        return valuation_observations(html, self.name)


class NiftyIndicesBenchmarkExtractor(SourceExtractor):
    name = "Nifty Indices"
    source_tier = 1

    def parse(self, html: str) -> list[ParsedObservation]:
        return benchmark_observations(html, self.name)


class BSEBenchmarkExtractor(NiftyIndicesBenchmarkExtractor):
    name = "BSE India"


class NSEListingExtractor(SourceExtractor):
    name = "NSE India"
    source_tier = 1

    def parse(self, html: str) -> list[ParsedObservation]:
        return listing_observations(html, self.name)


class BSEListingExtractor(NSEListingExtractor):
    name = "BSE India"


class CompanyIRListingExtractor(NSEListingExtractor):
    name = "Company investor relations"


EXTRACTOR_CLASSES = {
    "MoneycontrolQuoteExtractor": MoneycontrolQuoteExtractor,
    "EconomicTimesQuoteExtractor": EconomicTimesQuoteExtractor,
    "UpstoxQuoteExtractor": UpstoxQuoteExtractor,
    "DhanQuoteExtractor": DhanQuoteExtractor,
    "ICICIDirectQuoteExtractor": ICICIDirectQuoteExtractor,
    "NSEDividendExtractor": NSEDividendExtractor,
    "BSEDividendExtractor": BSEDividendExtractor,
    "CompanyIRDividendExtractor": CompanyIRDividendExtractor,
    "MoneycontrolDividendExtractor": MoneycontrolDividendExtractor,
    "GoodreturnsDividendExtractor": GoodreturnsDividendExtractor,
    "InvestingDividendExtractor": InvestingDividendExtractor,
    "NSECorporateActionPageExtractor": NSECorporateActionPageExtractor,
    "BSECorporateActionPageExtractor": BSECorporateActionPageExtractor,
    "CompanyIRCorporateActionExtractor": CompanyIRCorporateActionExtractor,
    "EquityPanditHistoricalExtractor": EquityPanditHistoricalExtractor,
    "StockPriceArchiveHistoricalExtractor": StockPriceArchiveHistoricalExtractor,
    "CompanyFilingFundamentalsExtractor": CompanyFilingFundamentalsExtractor,
    "SecondaryFundamentalsExtractor": SecondaryFundamentalsExtractor,
    "PublicValuationExtractor": PublicValuationExtractor,
    "NiftyIndicesBenchmarkExtractor": NiftyIndicesBenchmarkExtractor,
    "BSEBenchmarkExtractor": BSEBenchmarkExtractor,
    "NSEListingExtractor": NSEListingExtractor,
    "BSEListingExtractor": BSEListingExtractor,
    "CompanyIRListingExtractor": CompanyIRListingExtractor,
}


def create_extractor(config: dict[str, Any]) -> SourceExtractor:
    class_name = str(config.get("extractor", ""))
    url_template = str(config.get("urlTemplate", "")).strip()
    if class_name not in EXTRACTOR_CLASSES:
        raise ValueError(f"Unknown public extractor: {class_name}")
    if not url_template:
        raise ValueError(f"{class_name} requires a configured urlTemplate")
    return EXTRACTOR_CLASSES[class_name](url_template)
