"""Diagnose public-source reachability from the runtime that runs YieldAlpha.

This command intentionally tests source reachability and records diagnostics. It
does not turn a successful homepage request into market data and never invents
records when a source is unavailable.
"""

from __future__ import annotations

from datetime import datetime, timezone
import argparse
import json
import platform
import socket
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests


SOURCES = [
    {"source": "NSE India", "url": "https://www.nseindia.com/", "extractor": "quote and corporate-actions"},
    {"source": "NSE India quote (BEL)", "url": "https://www.nseindia.com/api/quote-equity?symbol=BEL", "extractor": "quote"},
    {"source": "NSE India corporate actions (BEL)", "url": "https://www.nseindia.com/api/corporate-actions?symbol=BEL", "extractor": "corporate-actions"},
    {"source": "BSE India", "url": "https://www.bseindia.com/", "extractor": "BSEDividendExtractor / BSECorporateActionPageExtractor / BSEListingExtractor"},
    {"source": "Company investor-relations / filings", "url": "https://www.nseindia.com/companies-listing/corporate-filings-financial-results", "extractor": "CompanyFilingFundamentalsExtractor / CompanyIRDividendExtractor"},
    {"source": "Government / regulators", "url": "https://www.pib.gov.in/", "extractor": None},
    {"source": "Moneycontrol", "url": "https://www.moneycontrol.com/", "extractor": "MoneycontrolQuoteExtractor / MoneycontrolDividendExtractor / SecondaryFundamentalsExtractor / PublicValuationExtractor"},
    {"source": "Economic Times Markets", "url": "https://economictimes.indiatimes.com/markets", "extractor": "EconomicTimesQuoteExtractor"},
    {"source": "Upstox", "url": "https://upstox.com/", "extractor": "UpstoxQuoteExtractor"},
    {"source": "Dhan", "url": "https://dhan.co/", "extractor": "DhanQuoteExtractor"},
    {"source": "ICICI Direct", "url": "https://www.icicidirect.com/", "extractor": "ICICIDirectQuoteExtractor"},
    {"source": "Goodreturns", "url": "https://www.goodreturns.in/", "extractor": "GoodreturnsDividendExtractor"},
    {"source": "Investing.com India", "url": "https://in.investing.com/", "extractor": "InvestingDividendExtractor"},
    {"source": "EquityPandit", "url": "https://www.equitypandit.com/", "extractor": "EquityPanditHistoricalExtractor"},
    {"source": "StockPriceArchive", "url": "https://stockpricearchive.com/", "extractor": "StockPriceArchiveHistoricalExtractor"},
    {"source": "IPO Central", "url": "https://ipocentral.in/", "extractor": None},
    {"source": "Reuters", "url": "https://www.reuters.com/", "extractor": None},
    {"source": "Nifty Indices", "url": "https://www.niftyindices.com/reports", "extractor": "NiftyIndicesBenchmarkExtractor"},
]


def error_kind(error: BaseException) -> str:
    text = str(error).lower()
    if isinstance(error, requests.exceptions.Timeout):
        return "NETWORK_TIMEOUT"
    if isinstance(error, requests.exceptions.ConnectionError) and any(token in text for token in ("resolve", "name or service", "temporary failure", "gaierror")):
        return "DNS_FAILED"
    if isinstance(error, requests.exceptions.ConnectionError):
        return "NETWORK_BLOCKED"
    return "NETWORK_BLOCKED"


def dns_status(hostname: str) -> tuple[str, str | None]:
    try:
        addresses = socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)
        if not addresses:
            return "DNS_FAILED", "No addresses returned"
        return "OK", None
    except socket.gaierror as error:
        return "DNS_FAILED", str(error)
    except OSError as error:
        return "NETWORK_BLOCKED", str(error)


def diagnose_source(session: requests.Session, item: dict[str, Any], timeout: float) -> dict[str, Any]:
    url = str(item["url"])
    hostname = urlparse(url).hostname or ""
    started = time.perf_counter()
    dns, dns_error = dns_status(hostname)
    result: dict[str, Any] = {
        "source": item["source"], "url": url, "hostname": hostname, "dnsStatus": dns,
        "httpStatus": None, "parserStatus": "NOT_RUN", "recordsRetrieved": 0,
        "error": dns_error, "latencyMs": None
    }
    if dns != "OK":
        result["status"] = dns
        result["latencyMs"] = round((time.perf_counter() - started) * 1000, 2)
        return result
    try:
        response = session.get(url, timeout=timeout, allow_redirects=True)
        result["httpStatus"] = response.status_code
        result["latencyMs"] = round((time.perf_counter() - started) * 1000, 2)
        if response.status_code == 403:
            result["status"] = "HTTP_403"
            result["error"] = "Source denied the diagnostic request"
        elif response.status_code == 429:
            result["status"] = "HTTP_429"
            result["error"] = "Source rate-limited the diagnostic request"
        elif not response.ok:
            result["status"] = f"HTTP_{response.status_code}"
            result["error"] = f"HTTP response was {response.status_code}"
        else:
            result["status"] = "OK"
            result["parserStatus"] = "EXTRACTOR_CONFIGURED" if item.get("extractor") else "NOT_IMPLEMENTED"
            if item.get("extractor"):
                result["parserStatus"] = "NOT_TESTED"
                result["error"] = "Reachable endpoint; data parser was not run by this reachability diagnostic"
    except requests.RequestException as error:
        result["status"] = error_kind(error)
        result["error"] = str(error)
        result["latencyMs"] = round((time.perf_counter() - started) * 1000, 2)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Diagnose YieldAlpha public-source DNS, HTTP, and parser readiness.")
    parser.add_argument("--output", default="data_source_diagnostics.json", help="Diagnostic JSON output path")
    parser.add_argument("--timeout", type=float, default=8.0, help="Timeout per source request in seconds")
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    session = requests.Session()
    session.headers.update({"User-Agent": "YieldAlpha/1.0 public-source diagnostics", "Accept-Language": "en-IN,en;q=0.9"})
    results = [diagnose_source(session, item, args.timeout) for item in SOURCES]
    output = {
        "format": "yieldalpha-data-source-diagnostics", "formatVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "runtime": {"python": platform.python_version(), "platform": platform.platform()},
        "sources": results,
        "summary": {
            "ok": sum(result["status"] == "OK" for result in results),
            "dnsFailed": sum(result["status"] == "DNS_FAILED" for result in results),
            "networkFailed": sum(result["status"] in {"NETWORK_BLOCKED", "NETWORK_TIMEOUT"} for result in results),
            "httpFailed": sum(str(result["status"]).startswith("HTTP_") for result in results),
            "recordsRetrieved": sum(int(result["recordsRetrieved"]) for result in results),
        },
    }
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(path), "summary": output["summary"]}, indent=2))
    return 0 if output["summary"]["ok"] > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
