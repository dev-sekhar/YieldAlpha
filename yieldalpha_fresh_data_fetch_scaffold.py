"""
YieldAlpha fresh-data provider scaffold.

IMPORTANT:
- This is a NEW reference implementation. It was NOT the code used to populate the
  original research/dashboard data.
- The original analysis gathered data via web research from NSE/Nifty Indices,
  company IR pages, Moneycontrol, Economic Times, Upstox, Dhan, ICICI Direct,
  EquityPandit, StockPriceArchive, Goodreturns, Investing.com, Reuters, etc.
- No API key was used in that research workflow.
- For a distributed production app, confirm provider terms/licensing before automated
  ingestion or redistribution.

This scaffold shows the architecture you should use in YieldAlpha.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Any, Iterable, Protocol
import json
import argparse
import re
import hashlib
import sqlite3
from pathlib import Path
import requests
from yieldalpha_public_extractors import ParserBrokenError, ParsedObservation, create_extractor


@dataclass(frozen=True)
class SourceObservation:
    metric: str
    symbol: str
    value: Any
    unit: str | None
    provider: str
    source_tier: int
    source_url: str
    observed_at: str | None
    retrieved_at: str
    raw_value: Any
    stale: bool = False
    confidence: str = "UNVERIFIED"
    source_publication_date: str | None = None
    adjustment: str | None = None
    verification_status: str = "not-verified"


class Provider(Protocol):
    name: str
    def fetch(self, symbol: str) -> list[SourceObservation]: ...


class HttpClient:
    def __init__(self, timeout: float = 8.0):
        self.session = requests.Session()
        self.timeout = timeout
        self.nse_session_attempted = False
        self.nse_session_error: str | None = None
        self.session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (compatible; YieldAlpha/1.0; "
                "+https://example.invalid/yieldalpha)"
            ),
            "Accept-Language": "en-IN,en;q=0.9",
        })

    def get_json(self, url: str, **kwargs) -> Any:
        r = self.session.get(url, timeout=self.timeout, **kwargs)
        r.raise_for_status()
        return r.json()

    def get_text(self, url: str, **kwargs) -> str:
        r = self.session.get(url, timeout=self.timeout, **kwargs)
        r.raise_for_status()
        return r.text


class NSECorporateActionsProvider:
    """
    Provider adapter for NSE corporate-action data.

    The exact machine endpoint may change and may be subject to access/licensing
    requirements. Keep endpoint configuration external rather than embedding it in
    investment logic.
    """
    name = "NSE India"

    def __init__(self, client: HttpClient, endpoint: str):
        self.client = client
        self.endpoint = endpoint

    def fetch(self, symbol: str) -> list[SourceObservation]:
        payload, _ = get_nse_json(self.client, self.endpoint, symbol)
        retrieved = datetime.now(timezone.utc).isoformat()
        out: list[SourceObservation] = []

        # Keep parser isolated because source schemas can change.
        for item in payload.get("data", []):
            purpose = str(item.get("purpose", ""))
            if "dividend" not in purpose.lower():
                continue

            amount = parse_dividend_amount(purpose)
            if amount is None:
                continue

            out.append(SourceObservation(
                metric="dividend_per_share",
                symbol=symbol,
                value=amount,
                unit="INR/share",
                provider=self.name,
                source_tier=1,
                source_url=self.endpoint,
                observed_at=item.get("exDate") or item.get("recordDate"),
                retrieved_at=retrieved,
                raw_value=item,
                confidence="HIGH",
                source_publication_date=item.get("announcementDate") or item.get("broadcastDate"),
                verification_status="source-validated",
            ))
        return out


NSE_HOME = "https://www.nseindia.com/"
NSE_QUOTE_ENDPOINT = "https://www.nseindia.com/api/quote-equity"
NSE_CORPORATE_ACTIONS_ENDPOINT = "https://www.nseindia.com/api/corporate-actions"

# Identity-only default universe transcribed from the workbook's Current Screen
# tab. No prices, dividends, or recommendations are embedded here.
DEFAULT_SYMBOLS = [
    "BEL", "BEML", "BHARATFORG", "SOLARINDS", "ASTRAMICRO", "KEC", "KEI", "KPIL", "POWERGRID", "NTPC",
    "HONAUT", "CENTUM", "DIXON", "POLYCAB", "DATAPATTNS", "LT", "CUMMINSIND", "THERMAX", "ABB", "SIEMENS",
    "TCOM", "RAILTEL", "ROUTE", "GTPL", "BHARTIHEXA", "BAJFINANCE", "BAJAJFINSV", "SHRIRAMFIN", "CHOLAFIN", "BAJAJHLDNG",
    "SUNPHARMA", "LUPIN", "DRREDDY", "CIPLA", "TORNTPHARM", "MOTHERSON", "BOSCHLTD", "SCHAEFFLER", "ENDURANCE", "EXIDEIND",
    "ULTRACEMCO", "JKCEMENT", "AMBUJACEM", "SHREECEM", "ACC", "TITAN", "ASIANPAINT", "BRITANNIA", "MARICO", "DABUR",
]


def iso_date(value: Any) -> str | None:
    if not value:
        return None
    text = str(value).strip()
    for fmt in ("%d-%b-%Y", "%d-%B-%Y", "%d/%b/%Y", "%d/%B/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            pass
    return text if re.match(r"^\d{4}-\d{2}-\d{2}", text) else None


def number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        parsed = float(str(value).replace(",", "").replace("₹", "").strip())
        return parsed if parsed == parsed else None
    except (TypeError, ValueError):
        return None


def stable_id(prefix: str, *parts: Any) -> str:
    material = "|".join(str(part or "").strip().lower() for part in parts)
    digest = hashlib.sha256(material.encode("utf-8")).hexdigest()[:24]
    return f"{prefix}-{digest}"


def load_public_source_config(path: str) -> dict[str, list[dict[str, Any]]]:
    config_path = Path(path)
    if not config_path.exists():
        bundled = Path("data/public-source-config.example.json")
        if path == "data/public-source-config.json" and bundled.exists():
            config_path = bundled
        else:
            return {}
    try:
        payload = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Public source configuration is invalid: {exc}") from exc
    if not isinstance(payload, dict):
        raise ValueError("Public source configuration must be an object")
    result: dict[str, list[dict[str, Any]]] = {}
    for category, values in payload.items():
        if not isinstance(values, list):
            raise ValueError(f"Public source configuration category {category!r} must be an array")
        result[category] = [item for item in values if isinstance(item, dict)]
    return result


def request_error_status(error: BaseException) -> str:
    if isinstance(error, ParserBrokenError):
        return "PARSER_BROKEN"
    text = str(error).lower()
    if isinstance(error, requests.exceptions.Timeout) or "timed out" in text or "timeout" in text:
        return "NETWORK_TIMEOUT"
    if isinstance(error, requests.exceptions.ConnectionError) or any(token in text for token in ("could not resolve", "temporary failure in name resolution", "name or service not known", "gaierror")):
        return "DNS_FAILED" if any(token in text for token in ("resolve", "name or service", "gaierror")) else "NETWORK_BLOCKED"
    response = getattr(error, "response", None)
    if response is not None and getattr(response, "status_code", None):
        return f"HTTP_{response.status_code}"
    return "FETCH_FAILED"


def configured_page_observations(client: HttpClient, configs: list[dict[str, Any]], symbol: str, category: str, **url_values: str) -> tuple[list[SourceObservation], list[dict[str, str]]]:
    observations: list[SourceObservation] = []
    errors: list[dict[str, str]] = []
    for config in configs:
        if config.get("enabled") is False:
            continue
        source = str(config.get("source") or config.get("name") or "Configured public source")
        requested_benchmark = url_values.get("benchmarkCode")
        configured_benchmarks = config.get("benchmarkCodes")
        configured_benchmark = config.get("benchmarkCode")
        if requested_benchmark and configured_benchmark and str(configured_benchmark) != requested_benchmark:
            continue
        if requested_benchmark and isinstance(configured_benchmarks, list) and requested_benchmark not in {str(item) for item in configured_benchmarks}:
            continue
        try:
            extractor = create_extractor(config)
            source_url = extractor.url(symbol, **url_values)
            html = client.get_text(source_url, headers={"Accept": "text/html, application/xhtml+xml"})
            parsed = extractor.parse(html)
            retrieved = datetime.now(timezone.utc).isoformat()
            for item in parsed:
                observations.append(SourceObservation(metric=item.metric, symbol=symbol, value=item.value, unit=item.unit, provider=source, source_tier=getattr(extractor, "source_tier", int(config.get("sourceTier", 4))), source_url=source_url, observed_at=iso_date(item.observed_at) if item.observed_at else datetime.now(timezone.utc).date().isoformat(), retrieved_at=retrieved, raw_value=html, confidence="MEDIUM", adjustment=item.adjustment, verification_status="source-validated"))
            if observations:
                return observations, errors
            raise ParserBrokenError(f"{source}: parser returned no observations")
        except Exception as exc:
            errors.append({"symbol": symbol, "source": source, "error": f"{request_error_status(exc)}: {exc}"})
    return observations, errors


def nse_headers() -> dict[str, str]:
    return {"Referer": NSE_HOME, "Accept": "application/json, text/plain, */*"}


def get_nse_json(client: HttpClient, endpoint: str, symbol: str) -> tuple[Any, str]:
    # NSE's public site uses a session and referer checks. This is a public web
    # source adapter, not a licensed API client; keep it replaceable because the
    # site's machine-facing routes may change.
    if not client.nse_session_attempted:
        client.nse_session_attempted = True
        try:
            response = client.session.get(NSE_HOME, timeout=client.timeout, headers=nse_headers())
            response.raise_for_status()
        except requests.RequestException as exc:
            client.nse_session_error = f"NSE session unavailable: {exc}"
    if client.nse_session_error:
        raise RuntimeError(client.nse_session_error)
    payload = client.get_json(endpoint, params={"symbol": symbol}, headers=nse_headers())
    return payload, endpoint


def quote_observations(client: HttpClient, symbol: str, endpoint: str = NSE_QUOTE_ENDPOINT) -> tuple[list[SourceObservation], dict[str, Any]]:
    payload, source_url = get_nse_json(client, endpoint, symbol)
    root = payload if isinstance(payload, dict) else {}
    info = root.get("info") if isinstance(root.get("info"), dict) else {}
    price = root.get("priceInfo") if isinstance(root.get("priceInfo"), dict) else {}
    observed = iso_date(price.get("lastUpdateTime")) or datetime.now(timezone.utc).date().isoformat()
    retrieved = datetime.now(timezone.utc).isoformat()
    observations: list[SourceObservation] = []
    values = {
        "current_price": (price.get("lastPrice"), "INR/share"),
        "week52_low": ((price.get("week52Low") or {}).get("min") if isinstance(price.get("week52Low"), dict) else None, "INR/share"),
        "week52_high": ((price.get("week52High") or {}).get("max") if isinstance(price.get("week52High"), dict) else None, "INR/share"),
    }
    for metric, (raw, unit) in values.items():
        parsed = number(raw)
        if parsed is None:
            continue
        observations.append(SourceObservation(metric=metric, symbol=symbol, value=parsed, unit=unit, provider="NSE India", source_tier=1, source_url=source_url, observed_at=observed, retrieved_at=retrieved, raw_value=payload, confidence="HIGH", source_publication_date=observed, verification_status="source-validated"))
    identity = {"symbol": str(info.get("symbol") or symbol), "company_name": str(info.get("companyName") or symbol), "observed_at": observed}
    return observations, identity


def observation_record(observation: SourceObservation, source_id: str, subject_id: str, subject_type: str = "security") -> dict[str, Any]:
    record = {
        "id": source_id, "kind": "source-record", "createdAt": observation.retrieved_at, "updatedAt": observation.retrieved_at,
        "provider": observation.provider, "sourceUrl": observation.source_url, "retrievalTimestamp": observation.retrieved_at,
        "sourceDate": observation.source_publication_date or observation.observed_at, "rawValue": observation.raw_value, "normalizedValue": {"metric": observation.metric, "symbol": observation.symbol, "value": observation.value, "unit": observation.unit, "observedAt": observation.observed_at},
        "sourceTier": observation.source_tier, "confidence": observation.confidence.lower(), "validationStatus": "valid" if observation.verification_status == "source-validated" else "not-verified", "verificationStatus": observation.verification_status, "freshnessState": "STALE" if observation.stale else "LIVE", "subjectType": subject_type, "subjectId": subject_id
    }
    if observation.adjustment is not None: record["adjustment"] = observation.adjustment
    return record


def append_configured_source_records(result: dict[str, Any], observations: list[SourceObservation], subject_id: str, subject_type: str = "security") -> dict[str, dict[str, SourceObservation]]:
    grouped: dict[str, dict[str, SourceObservation]] = {}
    for observation in observations:
        source_id = stable_id("source-python", observation.symbol, observation.provider, observation.metric, observation.observed_at, observation.retrieved_at)
        result["records"]["sourceRecords"].append(observation_record(observation, source_id, subject_id, subject_type))
        grouped.setdefault(observation.metric, {})[observation.observed_at or ""] = observation
    return grouped


def configured_records(source_configs: dict[str, list[dict[str, Any]]], *names: str) -> list[dict[str, Any]]:
    for name in names:
        if source_configs.get(name):
            return source_configs[name]
    return []


def source_record_id(observation: SourceObservation) -> str:
    return stable_id("source-python", observation.symbol, observation.provider, observation.metric, observation.observed_at, observation.retrieved_at)


def parser_error(source: str, error: BaseException) -> str:
    prefix = "PARSER_BROKEN: " if isinstance(error, ParserBrokenError) else ""
    return f"{prefix}{error}"


def append_source_observation(result: dict[str, Any], observation: SourceObservation, subject_id: str, subject_type: str = "security") -> str:
    source_id = source_record_id(observation)
    result["records"]["sourceRecords"].append(observation_record(observation, source_id, subject_id, subject_type))
    return source_id


def append_identity(result: dict[str, Any], symbol: str, identity: dict[str, Any], generated: str) -> tuple[str, str]:
    company_id = make_entity_id("company", symbol)
    security_id = make_entity_id("security", symbol)
    if not any(item.get("id") == "exchange-nse" for item in result["records"]["exchanges"]):
        result["records"]["exchanges"].append({"id": "exchange-nse", "kind": "exchange", "createdAt": generated, "updatedAt": generated, "code": "NSE", "name": "National Stock Exchange of India", "country": "IN"})
    if not any(item.get("id") == company_id for item in result["records"]["companies"]):
        result["records"]["companies"].append({"id": company_id, "kind": "company", "createdAt": generated, "updatedAt": generated, "legalName": identity.get("company_name") or symbol, "displayName": identity.get("company_name") or symbol, "country": "IN", "industryId": "industry-unclassified", "isDemo": False})
    if not any(item.get("id") == security_id for item in result["records"]["securities"]):
        result["records"]["securities"].append({"id": security_id, "kind": "security", "createdAt": generated, "updatedAt": generated, "companyId": company_id, "exchangeId": "exchange-nse", "symbol": symbol, "securityType": "equity", "currency": "INR"})
    return company_id, security_id


def observations_by_date(observations: list[SourceObservation]) -> dict[str, dict[str, SourceObservation]]:
    grouped: dict[str, dict[str, SourceObservation]] = {}
    for observation in observations:
        if observation.observed_at:
            grouped.setdefault(observation.observed_at, {})[observation.metric] = observation
    return grouped


def add_configured_quote_price(result: dict[str, Any], observations: list[SourceObservation], security_id: str, generated: str) -> None:
    for observation in observations:
        source_id = append_source_observation(result, observation, security_id)
        if observation.metric == "current_price":
            result["records"]["priceHistory"].append({"id": stable_id("price-python", security_id, observation.observed_at), "kind": "price-history", "createdAt": generated, "updatedAt": generated, "securityId": security_id, "tradingDate": observation.observed_at, "close": observation.value, "adjustedClose": observation.value, "sourceRecordId": source_id})


def add_dividends(result: dict[str, Any], observations: list[SourceObservation], security_id: str, generated: str) -> None:
    for observation in observations:
        source_id = append_source_observation(result, observation, security_id)
        if observation.metric != "dividend_per_share" or not observation.observed_at:
            continue
        year = int(observation.observed_at[:4])
        result["records"]["dividends"].append({"id": stable_id("dividend-python", security_id, year, observation.value, observation.observed_at), "kind": "dividend", "createdAt": generated, "updatedAt": generated, "securityId": security_id, "financialYear": year, "amountPerShare": observation.value, "dividendType": "regular", "declaredDate": observation.observed_at, "sourceRecordId": source_id})


def add_historical_prices(result: dict[str, Any], observations: list[SourceObservation], security_id: str, generated: str) -> None:
    grouped = observations_by_date(observations)
    source_ids: dict[tuple[str, str], str] = {}
    for observation in observations:
        source_ids[(observation.observed_at or "", observation.metric)] = append_source_observation(result, observation, security_id)
    for trading_date, values in grouped.items():
        close = values.get("price_close")
        if close is None:
            continue
        record: dict[str, Any] = {"id": stable_id("price-python", security_id, trading_date), "kind": "price-history", "createdAt": generated, "updatedAt": generated, "securityId": security_id, "tradingDate": trading_date, "close": close.value, "adjustedClose": close.value, "sourceRecordId": source_ids[(trading_date, "price_close")]}
        for field, metric in (("open", "price_open"), ("high", "price_high"), ("low", "price_low"), ("volume", "price_volume")):
            if metric in values:
                record[field] = values[metric].value
        result["records"]["priceHistory"].append(record)


def add_fundamentals(result: dict[str, Any], observations: list[SourceObservation], company_id: str, generated: str) -> None:
    for observation in observations:
        append_source_observation(result, observation, company_id, "company")
    grouped = observations_by_date(observations)
    for period_end, values in sorted(grouped.items()):
        source_ids = [source_record_id(value) for value in values.values()]
        statement: dict[str, Any] = {"id": stable_id("statement-python", company_id, period_end), "kind": "financial-statement", "createdAt": generated, "updatedAt": generated, "companyId": company_id, "periodEnd": period_end, "periodType": "annual", "sourceRecordId": source_ids[0]}
        field_metrics = {"revenue": "revenue", "netProfit": "net_profit", "eps": "eps"}
        for field, metric in field_metrics.items():
            if metric in values:
                statement[field] = values[metric].value
        if "operating_cash_flow" in values and "capital_expenditure" in values:
            statement["freeCashFlow"] = values["operating_cash_flow"].value - abs(values["capital_expenditure"].value)
        result["records"]["financialStatements"].append(statement)
        net_profit = values.get("net_profit")
        equity = values.get("equity")
        debt = values.get("total_debt")
        cash = values.get("cash")
        ebit = values.get("ebit")
        metrics: list[tuple[str, float, str]] = []
        if net_profit and equity and equity.value != 0:
            metrics.append(("roe", net_profit.value / equity.value, source_record_id(net_profit)))
        if debt and equity and equity.value != 0:
            metrics.append(("debt-to-equity", debt.value / equity.value, source_record_id(debt)))
        if ebit and equity and debt:
            invested_capital = equity.value + debt.value - (cash.value if cash else 0)
            if invested_capital > 0:
                metrics.append(("roce", ebit.value / invested_capital, source_record_id(ebit)))
        for metric, value, source_id in metrics:
            result["records"]["financialMetrics"].append({"id": stable_id("metric-python", company_id, metric, period_end), "kind": "financial-metric", "createdAt": generated, "updatedAt": generated, "companyId": company_id, "metric": metric, "periodEnd": period_end, "value": value, "sourceRecordId": source_id})
    periods = sorted(grouped)
    for previous_date, current_date in zip(periods, periods[1:]):
        previous = grouped[previous_date].get("net_profit")
        current = grouped[current_date].get("net_profit")
        if previous and current and previous.value != 0:
            result["records"]["financialMetrics"].append({"id": stable_id("metric-python", company_id, "earnings-growth", current_date), "kind": "financial-metric", "createdAt": generated, "updatedAt": generated, "companyId": company_id, "metric": "earnings-growth", "periodEnd": current_date, "value": current.value / previous.value - 1, "sourceRecordId": source_record_id(current)})


def add_valuations(result: dict[str, Any], observations: list[SourceObservation], security_id: str, generated: str) -> None:
    for observation in observations:
        source_id = append_source_observation(result, observation, security_id)
        if observation.metric == "pe" and observation.observed_at:
            result["records"]["valuationSnapshots"].append({"id": stable_id("valuation-python", security_id, observation.observed_at), "kind": "valuation-snapshot", "createdAt": generated, "updatedAt": generated, "securityId": security_id, "observedAt": observation.observed_at, "pe": observation.value, "sourceRecordId": source_id})


def add_listings(result: dict[str, Any], observations: list[SourceObservation], security_id: str, generated: str) -> None:
    for observation in observations:
        source_id = append_source_observation(result, observation, security_id)
        if observation.metric == "listing_date" and isinstance(observation.value, str):
            listing_date = iso_date(observation.value)
            if listing_date:
                result["records"]["listings"].append({"id": stable_id("listing-python", security_id, listing_date), "kind": "listing", "createdAt": generated, "updatedAt": generated, "securityId": security_id, "exchangeId": "exchange-nse", "listedFrom": listing_date, "sourceRecordId": source_id})


def add_corporate_actions(result: dict[str, Any], observations: list[SourceObservation], security_id: str, generated: str) -> None:
    for observation in observations:
        source_id = append_source_observation(result, observation, security_id)
        if observation.metric == "corporate_action" and observation.observed_at and isinstance(observation.value, str):
            allowed = {"split", "bonus", "rights", "merger", "demerger", "spin-off", "delisting", "acquisition", "name-change", "ticker-change"}
            if observation.value in allowed:
                result["records"]["corporateActions"].append({"id": stable_id("corporate-action-python", security_id, observation.value, observation.observed_at), "kind": "corporate-action", "createdAt": generated, "updatedAt": generated, "securityId": security_id, "actionType": observation.value, "effectiveDate": observation.observed_at, "details": {"raw": observation.raw_value}, "sourceRecordId": source_id})


def add_benchmarks(result: dict[str, Any], observations: list[SourceObservation], benchmark_id: str, generated: str) -> None:
    for observation in observations:
        source_id = append_source_observation(result, observation, benchmark_id, "benchmark")
        if observation.metric == "price_close" and observation.observed_at:
            result["records"]["benchmarkPrices"].append({"id": stable_id("benchmark-price-python", benchmark_id, observation.observed_at), "kind": "benchmark-price", "createdAt": generated, "updatedAt": generated, "benchmarkId": benchmark_id, "tradingDate": observation.observed_at, "close": observation.value, "sourceRecordId": source_id})


def make_entity_id(prefix: str, symbol: str) -> str:
    return f"{prefix}-{symbol.upper()}"


def persist_sqlite_snapshot(snapshot: dict[str, Any], sqlite_output: str) -> None:
    path = Path(sqlite_output)
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as connection:
        connection.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS snapshots (snapshot_id TEXT PRIMARY KEY, generated_at TEXT NOT NULL, provider TEXT NOT NULL, summary_json TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS raw_responses (response_id TEXT PRIMARY KEY, provider TEXT NOT NULL, source_url TEXT NOT NULL, retrieved_at TEXT NOT NULL, payload_json TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS source_records (source_record_id TEXT PRIMARY KEY, provider TEXT NOT NULL, source_url TEXT, source_date TEXT, retrieved_at TEXT NOT NULL, freshness_state TEXT NOT NULL, confidence TEXT NOT NULL, validation_status TEXT NOT NULL, record_json TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS normalized_records (record_id TEXT PRIMARY KEY, store_name TEXT NOT NULL, source_record_id TEXT, observed_at TEXT, record_json TEXT NOT NULL, updated_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS fetch_errors (snapshot_id TEXT NOT NULL, symbol TEXT, source TEXT NOT NULL, error TEXT NOT NULL);
        """)
        generated = str(snapshot["generatedAt"])
        snapshot_id = stable_id("snapshot", snapshot["provider"], generated)
        records = snapshot["records"]
        summary = {"sourceRecords": len(records.get("sourceRecords", [])), "priceRecords": len(records.get("priceHistory", [])), "dividendRecords": len(records.get("dividends", [])), "errorCount": len(snapshot.get("errors", []))}
        connection.execute("INSERT OR REPLACE INTO snapshots(snapshot_id, generated_at, provider, summary_json) VALUES (?, ?, ?, ?)", (snapshot_id, generated, snapshot["provider"], json.dumps(summary, ensure_ascii=False)))
        for source in records.get("sourceRecords", []):
            response_id = stable_id("raw", source.get("provider"), source.get("sourceUrl"), source.get("retrievalTimestamp"), source.get("id"))
            connection.execute("INSERT OR IGNORE INTO raw_responses(response_id, provider, source_url, retrieved_at, payload_json) VALUES (?, ?, ?, ?, ?)", (response_id, source.get("provider", "unknown"), source.get("sourceUrl", ""), source.get("retrievalTimestamp", generated), json.dumps(source.get("rawValue"), ensure_ascii=False, default=str)))
            connection.execute("INSERT OR REPLACE INTO source_records(source_record_id, provider, source_url, source_date, retrieved_at, freshness_state, confidence, validation_status, record_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", (source["id"], source.get("provider", "unknown"), source.get("sourceUrl"), source.get("sourceDate"), source.get("retrievalTimestamp", generated), source.get("freshnessState", "NOT_VERIFIED"), source.get("confidence", "unknown"), source.get("validationStatus", "not-verified"), json.dumps(source, ensure_ascii=False, default=str)))
        for store_name, values in records.items():
            if store_name == "sourceRecords":
                continue
            for record in values:
                connection.execute("INSERT OR REPLACE INTO normalized_records(record_id, store_name, source_record_id, observed_at, record_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)", (record["id"], store_name, record.get("sourceRecordId"), record.get("tradingDate") or record.get("observedAt") or record.get("declaredDate"), json.dumps(record, ensure_ascii=False, default=str), record.get("updatedAt", generated)))
        connection.execute("DELETE FROM fetch_errors WHERE snapshot_id = ?", (snapshot_id,))
        for error in snapshot.get("errors", []):
            connection.execute("INSERT INTO fetch_errors(snapshot_id, symbol, source, error) VALUES (?, ?, ?, ?)", (snapshot_id, error.get("symbol"), error.get("source", "unknown"), error.get("error", "unknown error")))


def fetch_public_snapshot(symbols: list[str], output: str, quote_endpoint: str = NSE_QUOTE_ENDPOINT, corporate_actions_endpoint: str = NSE_CORPORATE_ACTIONS_ENDPOINT, timeout: float = 8.0, sqlite_output: str = "data/yieldalpha.sqlite3", source_config_path: str = "data/public-source-config.json") -> dict[str, Any]:
    client = HttpClient(timeout=timeout)
    source_configs = load_public_source_config(source_config_path)
    generated = datetime.now(timezone.utc).isoformat()
    result: dict[str, Any] = {
        "format": "yieldalpha-public-data-snapshot", "formatVersion": 1, "generatedAt": generated,
        "provider": "Public web sources (no API)", "records": {"exchanges": [], "sectors": [], "industries": [], "companies": [], "securities": [], "listings": [], "priceHistory": [], "dividends": [], "financialStatements": [], "financialMetrics": [], "valuationSnapshots": [], "benchmarks": [], "benchmarkPrices": [], "corporateActions": [], "sourceRecords": []}, "errors": []
    }
    total = len(symbols)
    for index, raw_symbol in enumerate(symbols, start=1):
        symbol = raw_symbol.strip().upper()
        if not symbol:
            continue
        print(f"Fetching {symbol} ({index}/{total})...", flush=True)
        quote: list[SourceObservation] = []
        identity = {"symbol": symbol, "company_name": symbol, "observed_at": datetime.now(timezone.utc).date().isoformat()}
        try:
            quote, identity = quote_observations(client, symbol, quote_endpoint)
        except KeyboardInterrupt:
            result["errors"].append({"symbol": symbol, "source": "NSE quote", "error": "Interrupted by user; partial snapshot saved"})
            break
        except Exception as exc:
            result["errors"].append({"symbol": symbol, "source": "NSE quote", "error": f"{request_error_status(exc)}: {exc}"})
            fallback, fallback_errors = configured_page_observations(client, source_configs.get("quotes", []), symbol, "quotes")
            result["errors"].extend(fallback_errors)
            if fallback:
                quote = fallback
                identity = {"symbol": symbol, "company_name": symbol, "observed_at": datetime.now(timezone.utc).date().isoformat()}
        if quote:
            _, security_id = append_identity(result, symbol, identity, generated)
            add_configured_quote_price(result, quote, security_id, generated)
        else:
            security_id = make_entity_id("security", symbol)
            company_id = make_entity_id("company", symbol)
        actions: list[SourceObservation] = []
        if not client.nse_session_error:
            try:
                actions = NSECorporateActionsProvider(client, corporate_actions_endpoint).fetch(symbol)
                if actions:
                    _, security_id = append_identity(result, symbol, identity, generated)
                    add_dividends(result, actions, security_id, generated)
            except KeyboardInterrupt:
                result["errors"].append({"symbol": symbol, "source": "NSE corporate actions", "error": "Interrupted by user; partial snapshot saved"})
                break
            except Exception as exc:
                result["errors"].append({"symbol": symbol, "source": "NSE corporate actions", "error": f"{request_error_status(exc)}: {exc}"})
        if not actions:
            fallback, fallback_errors = configured_page_observations(client, source_configs.get("dividends", []), symbol, "dividends")
            result["errors"].extend(fallback_errors)
            if fallback:
                _, security_id = append_identity(result, symbol, identity, generated)
                add_dividends(result, fallback, security_id, generated)

        historical_configs = configured_records(source_configs, "historical_prices", "historicalPrices", "prices")
        if historical_configs:
            historical, historical_errors = configured_page_observations(client, historical_configs, symbol, "historical_prices", fromDate="2016-01-01", toDate=datetime.now(timezone.utc).date().isoformat())
            result["errors"].extend(historical_errors)
            if historical:
                company_id, security_id = append_identity(result, symbol, identity, generated)
                add_historical_prices(result, historical, security_id, generated)

        fundamentals_configs = configured_records(source_configs, "fundamentals", "financials", "filings")
        if fundamentals_configs:
            fundamentals, fundamentals_errors = configured_page_observations(client, fundamentals_configs, symbol, "fundamentals")
            result["errors"].extend(fundamentals_errors)
            if fundamentals:
                company_id, _ = append_identity(result, symbol, identity, generated)
                add_fundamentals(result, fundamentals, company_id, generated)

        listing_configs = configured_records(source_configs, "listings", "listing")
        if listing_configs:
            listings, listing_errors = configured_page_observations(client, listing_configs, symbol, "listings")
            result["errors"].extend(listing_errors)
            if listings:
                _, security_id = append_identity(result, symbol, identity, generated)
                add_listings(result, listings, security_id, generated)

        corporate_action_configs = configured_records(source_configs, "corporate_actions", "corporateActions", "actions")
        if corporate_action_configs:
            corporate_action_observations_result, corporate_action_errors = configured_page_observations(client, corporate_action_configs, symbol, "corporate_actions")
            result["errors"].extend(corporate_action_errors)
            if corporate_action_observations_result:
                _, security_id = append_identity(result, symbol, identity, generated)
                add_corporate_actions(result, corporate_action_observations_result, security_id, generated)

        valuation_configs = configured_records(source_configs, "valuations", "valuation")
        if valuation_configs:
            valuations, valuation_errors = configured_page_observations(client, valuation_configs, symbol, "valuations")
            result["errors"].extend(valuation_errors)
            if valuations:
                _, security_id = append_identity(result, symbol, identity, generated)
                add_valuations(result, valuations, security_id, generated)

    benchmark_configs = configured_records(source_configs, "benchmarks", "benchmark_prices", "benchmarkPrices")
    for benchmark_code, benchmark_name in (("NIFTY50_TRI", "Nifty 50 TRI"), ("SENSEX_TRI", "Sensex TRI")):
        if not benchmark_configs:
            break
        benchmark_id = make_entity_id("benchmark", benchmark_code)
        benchmark_observations_result, benchmark_errors = configured_page_observations(client, benchmark_configs, benchmark_code, "benchmarks", benchmarkCode=benchmark_code, benchmarkId=benchmark_id, fromDate="2016-01-01", toDate=datetime.now(timezone.utc).date().isoformat())
        result["errors"].extend(benchmark_errors)
        if benchmark_observations_result:
            result["records"]["benchmarks"].append({"id": benchmark_id, "kind": "benchmark", "createdAt": generated, "updatedAt": generated, "code": benchmark_code, "name": benchmark_name, "currency": "INR"})
            add_benchmarks(result, benchmark_observations_result, benchmark_id, generated)
    path = Path(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    existing_source_records = 0
    if path.exists():
        try:
            existing = json.loads(path.read_text(encoding="utf-8"))
            existing_source_records = len(existing.get("records", {}).get("sourceRecords", []))
        except (OSError, json.JSONDecodeError, AttributeError, TypeError):
            existing_source_records = 0

    # Never replace a usable snapshot with an empty one when the public source is
    # offline, blocked, or temporarily unavailable.
    if not result["records"]["sourceRecords"] and existing_source_records:
        result["writeSkipped"] = True
        result["writeReason"] = "No observations fetched; preserved existing snapshot"
    else:
        path.write_text(json.dumps(result, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    persist_sqlite_snapshot(result, sqlite_output)
    return result


def parse_dividend_amount(text: str) -> float | None:
    """
    Parses common wording such as:
      'Dividend - Rs 5 Per Share'
      'Interim Dividend - Rs 3.50 Per Share'
    """
    import re
    patterns = [
        r"(?:Rs\.?|INR|₹)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:Per Share|/share)?",
        r"Dividend[^0-9]*([0-9]+(?:\.[0-9]+)?)",
    ]
    for pat in patterns:
        m = re.search(pat, text, flags=re.I)
        if m:
            return float(m.group(1))
    return None


def annual_dividend_summary(events: Iterable[SourceObservation]) -> dict[int, float]:
    totals: dict[int, float] = {}
    for e in events:
        if e.metric != "dividend_per_share" or not e.observed_at:
            continue
        # Adjust parser if source date format is not ISO.
        year = int(str(e.observed_at)[:4])
        totals[year] = totals.get(year, 0.0) + float(e.value)
    return dict(sorted(totals.items()))


def dividend_eligible(
    annual: dict[int, float],
    listing_year: int,
    current_year: int,
    start_year: int = 2016,
) -> tuple[bool, int | None, str]:
    """
    Current partial year is intentionally excluded.
    For post-2016 listings, eligibility starts from the first full eligible year.
    """
    first_year = max(start_year, listing_year)
    years = range(first_year, current_year)  # exclude current partial year
    for y in years:
        if annual.get(y, 0.0) <= 0:
            return False, y, f"No qualifying dividend found for {y}"
    return True, None, f"Dividend paid in every eligible year from {first_year} to {current_year-1}"


def range_position(current: float, low52: float, high52: float) -> tuple[float, str]:
    if high52 <= low52:
        raise ValueError("52-week high must exceed 52-week low")
    pct = (current - low52) / (high52 - low52)
    return pct, "Closer to Low" if pct < 0.5 else "Closer to High"


def dividend_yield(ttm_dividend: float, current_price: float) -> float:
    if current_price <= 0:
        raise ValueError("Current price must be positive")
    return ttm_dividend / current_price


def expected_cagr(
    current_price: float,
    terminal_price: float,
    cumulative_dividends: float,
    years: float = 5.0,
) -> float:
    if current_price <= 0 or years <= 0:
        raise ValueError("Invalid current_price or years")
    terminal_value = terminal_price + cumulative_dividends
    return (terminal_value / current_price) ** (1 / years) - 1


def real_cagr(nominal_cagr: float, inflation: float) -> float:
    return (1 + nominal_cagr) / (1 + inflation) - 1


def save_raw_snapshot(path: str, provider: str, payload: Any, source_url: str) -> None:
    """
    Example immutable raw capture. In production use object storage + DB metadata,
    checksums, immutable snapshot IDs, provider version, HTTP metadata, etc.
    """
    record = {
        "provider": provider,
        "source_url": source_url,
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "payload": payload,
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(record, f, ensure_ascii=False, indent=2, default=str)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch public NSE observations into a local YieldAlpha snapshot.")
    parser.add_argument("--symbols", nargs="+", default=DEFAULT_SYMBOLS, help="NSE symbols to fetch; defaults to the workbook Current Screen universe")
    parser.add_argument("--output", default="data/public-data.json", help="Output snapshot path")
    parser.add_argument("--quote-endpoint", default=NSE_QUOTE_ENDPOINT, help="Replaceable public quote route")
    parser.add_argument("--corporate-actions-endpoint", default=NSE_CORPORATE_ACTIONS_ENDPOINT, help="Replaceable public corporate-action route")
    parser.add_argument("--timeout", type=float, default=8.0, help="HTTP timeout in seconds per request (default: 8)")
    parser.add_argument("--sqlite-output", default="data/yieldalpha.sqlite3", help="SQLite provenance/normalized-data path")
    parser.add_argument("--source-config", default="data/public-source-config.json", help="Optional JSON configuration containing public-page fallback URL templates")
    args = parser.parse_args()
    snapshot = fetch_public_snapshot(args.symbols, args.output, args.quote_endpoint, args.corporate_actions_endpoint, args.timeout, args.sqlite_output, args.source_config)
    print(json.dumps({"output": args.output, "sourceRecords": len(snapshot["records"]["sourceRecords"]), "priceRecords": len(snapshot["records"]["priceHistory"]), "dividendRecords": len(snapshot["records"]["dividends"]), "writeSkipped": snapshot.get("writeSkipped", False), "errors": snapshot["errors"]}, indent=2))
    if not snapshot["records"]["sourceRecords"]:
        raise SystemExit("No public observations were fetched; see errors above.")
