import os
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import httpx
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.tables import MarketRefreshRun, MarketSnapshot
from app.schemas.market import (
    MarketHealthResponse,
    MarketHistoryPoint,
    MarketHistoryResponse,
    MarketMetricHistory,
    MarketRefreshRunSummary,
    MarketSnapshotResponse,
    MarketSourceDetail,
    SourceStatus,
)
from app.services.analysis.jet_decomposition import compute_jet_brent_decomposition
from app.services.bootstrap import utcnow
from app.services.market_quality import (
    isoformat_z,
    parse_iso_datetime,
    quality_from_detail,
    same_quality_class,
    select_fossil_jet_benchmark,
    should_persist_snapshot,
)

MARKET_SOURCE_URLS = {
    "brent_fred": "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU",
    "jet_fred": "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DJFUELUSGULF",
    "jet_ara_rotterdam": "https://www.investing.com/commodities/jet-fuel-cargoes-cif-nwe-futures",
    "brent_eia": "https://www.eia.gov/todayinenergy/prices.php",
    "cbam_price": "https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism/price-cbam-certificates_en",
    "ecb_eur_usd": "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
    "eu_ets_eex": "https://www.eex.com/en/market-data/environmental-markets/spot-market",
    "yahoo_chart": "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range={range}&interval=1d",
}

LITERS_PER_US_GALLON = 3.78541
LITERS_PER_BARREL = 158.987294928
JET_FUEL_REFERENCE_DENSITY_KG_PER_L = 0.8
LITERS_PER_METRIC_TON_JET = 1000.0 / JET_FUEL_REFERENCE_DENSITY_KG_PER_L
# EU jet proxy = Brent (USD/bbl -> USD/L) * premium factor.
# Premium approximates jet crack + ARA/Europe logistics basis in one stable multiplier.
EU_JET_PROXY_BRENT_PREMIUM_MULTIPLIER = 1.20
# Deterministic seed baselines refreshed from public spot references (2026-07-17):
# - Brent: Yahoo Finance BZ=F close (~87 USD/bbl)
# - EUR/USD: ECB eurofxref daily (1.1435)
# - EU ETS: public secondary-market quote (~80.4 EUR/t)
# Live adapters still prefer real-time sources; these values are fallbacks only.
DEFAULT_MARKET_SEED_AS_OF = "2026-07-17"
DEFAULT_BRENT_USD_PER_BBL = 87.01
DEFAULT_JET_USD_PER_L = 0.64  # Brent + ~$14/bbl crack, converted to USD/L
DEFAULT_EU_ETS_EUR_PER_T = 80.38
DEFAULT_EUR_USD = 1.1435
DEFAULT_CARBON_PROXY_USD_PER_T = round(DEFAULT_EU_ETS_EUR_PER_T * DEFAULT_EUR_USD, 2)
DEFAULT_JET_EU_PROXY_USD_PER_L = round(
    (DEFAULT_BRENT_USD_PER_BBL / LITERS_PER_BARREL) * EU_JET_PROXY_BRENT_PREMIUM_MULTIPLIER,
    3,
)

DEFAULT_MARKET_METRICS = (
    {
        "source_key": "brent_eia",
        "metric_key": "brent_usd_per_bbl",
        "value": DEFAULT_BRENT_USD_PER_BBL,
        "unit": "USD/bbl",
    },
    {
        "source_key": "jet_fred_proxy",
        "metric_key": "jet_usd_per_l",
        "value": DEFAULT_JET_USD_PER_L,
        "unit": "USD/L",
    },
    {
        "source_key": "cbam_proxy",
        "metric_key": "carbon_proxy_usd_per_t",
        "value": DEFAULT_CARBON_PROXY_USD_PER_T,
        "unit": "USD/tCO2",
    },
    {
        "source_key": "jet_ara_rotterdam_public",
        "metric_key": "jet_eu_proxy_usd_per_l",
        "value": DEFAULT_JET_EU_PROXY_USD_PER_L,
        "unit": "USD/L",
    },
    {
        "source_key": "rotterdam_jet_fuel",
        "metric_key": "rotterdam_jet_fuel_usd_per_l",
        "value": DEFAULT_JET_EU_PROXY_USD_PER_L,
        "unit": "USD/L",
    },
    {
        "source_key": "eu_ets_eex",
        "metric_key": "eu_ets_price_eur_per_t",
        "value": DEFAULT_EU_ETS_EUR_PER_T,
        "unit": "EUR/tCO2",
    },
    {
        "source_key": "germany_premium",
        "metric_key": "germany_premium_pct",
        "value": 2.5,
        "unit": "%",
    },
    {
        "source_key": "ecb_eur_usd",
        "metric_key": "usd_per_eur",
        "value": DEFAULT_EUR_USD,
        "unit": "USD/EUR",
    },
)

SOURCE_DETAIL_TO_METRIC_KEY = {
    "brent": "brent_usd_per_bbl",
    "jet": "jet_usd_per_l",
    "carbon": "carbon_proxy_usd_per_t",
    "jet_eu_proxy": "jet_eu_proxy_usd_per_l",
    "rotterdam_jet_fuel": "rotterdam_jet_fuel_usd_per_l",
    "eu_ets": "eu_ets_price_eur_per_t",
    "germany_premium": "germany_premium_pct",
    "ecb": "usd_per_eur",
}

MARKET_REFRESH_LOCK_KEY = 24041801
DEFAULT_MARKET_SOURCE_TIMEOUT_SECONDS = 12.0
MIN_MARKET_SOURCE_TIMEOUT_SECONDS = 0.1

SOURCE_CONTEXT: dict[str, dict[str, object]] = {
    "eia": {
        "region": "global",
        "market_scope": "physical_spot_benchmark",
        "lag_minutes": 1440,
        "confidence_score": 0.88,
        "note": "Daily benchmark page; parser depends on HTML shape.",
    },
    "fred": {
        "region": "us",
        "market_scope": "statistical_series",
        "lag_minutes": 1440,
        "confidence_score": 0.78,
        "note": "Reliable public time series with daily cadence and publication lag.",
    },
    "cbam+ecb": {
        "region": "eu",
        "market_scope": "regulatory_proxy",
        "lag_minutes": 10080,
        "confidence_score": 0.7,
        "note": "Policy proxy, not trade-matched EU ETS settlement.",
    },
    "ara-rotterdam-public": {
        "region": "eu",
        "market_scope": "ice_jet_cif_nwe_futures",
        "lag_minutes": 1440,
        "confidence_score": 0.76,
        "note": "Public ICE Jet CIF NWE futures HTML, converted from USD/metric ton to USD/L with 0.8 kg/L reference density.",
    },
    "brent-derived": {
        "region": "eu",
        "market_scope": "derived_proxy",
        "lag_minutes": 1440,
        "confidence_score": 0.65,
        "note": "Derived from Brent using a fixed EU premium multiplier; indicative only.",
    },
    "rotterdam-jet-direct": {
        "region": "eu",
        "market_scope": "ice_jet_cif_nwe_futures",
        "lag_minutes": 240,
        "confidence_score": 0.82,
        "note": "ICE Jet CIF NWE cargoes future (public HTML). Futures, not a German airport into-plane spot.",
    },
    "eex-eu-ets": {
        "region": "eu",
        "market_scope": "carbon_ets_settlement",
        "lag_minutes": 60,
        "confidence_score": 0.9,
        "note": "European Energy Exchange EU ETS spot price; highly liquid market.",
    },
    "germany-premium-db": {
        "region": "de",
        "market_scope": "regional_tax_premium",
        "lag_minutes": 1440,
        "confidence_score": 0.0,
        "note": "Deprecated tax-ratio model; not a German airport quote.",
    },
    "airport-differential-pending": {
        "region": "de",
        "market_scope": "airport_differential_missing",
        "lag_minutes": None,
        "confidence_score": 0.0,
        "note": "No sourced German airport into-plane differential. Commercial aviation fuel is generally energy-tax exempt under EnergiestG §27(2).",
    },
    "ecb": {
        "region": "eu",
        "market_scope": "fx_reference",
        "lag_minutes": 1440,
        "confidence_score": 0.9,
        "note": "ECB euro reference rate, daily, not a tradable quote.",
    },
    "eua+ecb": {
        "region": "eu",
        "market_scope": "carbon_ets_fx_converted",
        "lag_minutes": 1440,
        "confidence_score": 0.7,
        "note": "EUA (EUR/t) converted with ECB USD/EUR. Not a CBAM certificate price.",
    },
    "seed-baseline": {
        "region": "eu",
        "market_scope": "deterministic_fallback",
        "lag_minutes": None,
        "confidence_score": 0.25,
        "note": "Deterministic seeded baseline used when live and derived public sources are unavailable.",
    },
}

# Confidence band caps aligned with docs/DATA_CONTRACT_V1.md.
STALE_SOURCE_CONFIDENCE_CAP = 0.49  # weak fallback / stale source
DETERMINISTIC_FALLBACK_CONFIDENCE = 0.25  # deterministic fallback only
# Soft staleness threshold for snapshot read-model confidence capping (minutes).
STALE_SNAPSHOT_SOFT_MINUTES = 2 * 24 * 60


def _round(value: float, digits: int = 2) -> float:
    return round(float(value), digits)


def _ensure_utc_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _to_usd_per_l_from_usd_per_gal(value: float) -> float:
    return value / LITERS_PER_US_GALLON


def _to_usd_per_l_from_usd_per_bbl(value: float) -> float:
    return value / LITERS_PER_BARREL


def _to_usd_per_l_from_usd_per_metric_ton(value: float) -> float:
    return value / LITERS_PER_METRIC_TON_JET


def _derive_jet_eu_proxy_usd_per_l_from_brent(brent_usd_per_bbl: float) -> float:
    return _to_usd_per_l_from_usd_per_bbl(brent_usd_per_bbl) * EU_JET_PROXY_BRENT_PREMIUM_MULTIPLIER


def _coerce_positive_timeout(raw: str, *, scale: float = 1.0) -> float | None:
    try:
        value = float(raw) * scale
    except (TypeError, ValueError):
        return None
    if value < MIN_MARKET_SOURCE_TIMEOUT_SECONDS:
        return None
    return value


def _market_source_timeout_seconds(default: float = DEFAULT_MARKET_SOURCE_TIMEOUT_SECONDS) -> float:
    configured_seconds = os.getenv("JETSCOPE_MARKET_SOURCE_TIMEOUT_SECONDS")
    if configured_seconds:
        timeout = _coerce_positive_timeout(configured_seconds)
        if timeout is not None:
            return timeout

    legacy_milliseconds = os.getenv("SAFVSOIL_MARKET_REFRESH_TIMEOUT_MS")
    if legacy_milliseconds:
        timeout = _coerce_positive_timeout(legacy_milliseconds, scale=0.001)
        if timeout is not None:
            return timeout

    settings_timeout = _coerce_positive_timeout(str(settings.market_source_timeout_seconds))
    return settings_timeout if settings_timeout is not None else default


def _fetch_text(url: str, timeout_s: float | None = None) -> str:
    effective_timeout_s = timeout_s if timeout_s is not None else _market_source_timeout_seconds()
    response = httpx.get(
        url,
        timeout=effective_timeout_s,
        headers={"User-Agent": "JetScope API/0.1 (+fastapi vertical slice)"},
        follow_redirects=True,
    )
    response.raise_for_status()
    return response.text


def _fetch_json(url: str, timeout_s: float | None = None) -> dict:
    effective_timeout_s = timeout_s if timeout_s is not None else _market_source_timeout_seconds()
    response = httpx.get(
        url,
        timeout=effective_timeout_s,
        headers={"User-Agent": "JetScope API/0.1 (+market-history-backfill)"},
        follow_redirects=True,
    )
    response.raise_for_status()
    return response.json()


def _parse_fred_csv(csv: str) -> tuple[str, float]:
    lines = [line for line in csv.strip().splitlines() if line.strip()]
    rows: list[tuple[str, float]] = []
    for line in lines[1:]:
        parts = line.split(",")
        if len(parts) < 2:
            continue
        raw_value = parts[1].strip()
        if raw_value == "." or raw_value == "":
            continue
        try:
            rows.append((parts[0].strip(), float(raw_value)))
        except ValueError:
            continue
    if not rows:
        raise ValueError("No usable rows in FRED payload")
    return rows[-1]


def _parse_fred_csv_history(csv: str, *, cutoff: datetime) -> list[tuple[datetime, float]]:
    rows: list[tuple[datetime, float]] = []
    for line in csv.strip().splitlines()[1:]:
        parts = line.split(",")
        if len(parts) < 2:
            continue
        raw_value = parts[1].strip()
        if raw_value in {"", "."}:
            continue
        try:
            as_of = datetime.fromisoformat(parts[0].strip()).replace(tzinfo=timezone.utc)
            value = float(raw_value)
        except ValueError:
            continue
        if as_of >= cutoff:
            rows.append((as_of, value))
    return rows


def _fetch_fred_history(series_id: str, *, days: int) -> list[tuple[datetime, float]]:
    csv = _fetch_text(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}")
    cutoff = utcnow() - timedelta(days=days)
    return _parse_fred_csv_history(csv, cutoff=cutoff)


def _fetch_yahoo_chart_history(symbol: str, *, days: int) -> list[tuple[datetime, float]]:
    range_value = "1mo" if days <= 31 else "3mo"
    url = MARKET_SOURCE_URLS["yahoo_chart"].format(symbol=quote(symbol, safe=""), range=range_value)
    payload = _fetch_json(url)
    chart = payload.get("chart", {})
    error = chart.get("error")
    if error:
        raise ValueError(str(error.get("description") or error))
    result = (chart.get("result") or [None])[0]
    if not result:
        raise ValueError(f"Yahoo chart returned no result for {symbol}")

    timestamps = result.get("timestamp") or []
    closes = ((result.get("indicators") or {}).get("quote") or [{}])[0].get("close") or []
    cutoff = utcnow() - timedelta(days=days)
    rows: list[tuple[datetime, float]] = []
    for timestamp, close_value in zip(timestamps, closes, strict=False):
        if close_value is None:
            continue
        as_of = datetime.fromtimestamp(int(timestamp), tz=timezone.utc)
        if as_of < cutoff:
            continue
        try:
            value = float(close_value)
        except (TypeError, ValueError):
            continue
        rows.append((as_of, value))
    return rows


def _parse_eia_brent(html: str) -> float | None:
    quote = _parse_eia_brent_quote(html)
    return None if quote is None else quote[0]


def _parse_eia_header_dates(html: str) -> list[datetime]:
    import re

    dates: list[datetime] = []
    for match in re.finditer(r'<td class="d1">\s*([0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4})\s*<', html):
        raw = match.group(1)
        for fmt in ("%m/%d/%Y", "%m/%d/%y"):
            try:
                dates.append(datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc))
                break
            except ValueError:
                continue
        if dates:
            break
    return dates


def _parse_eia_brent_quote(html: str) -> tuple[float, datetime | None] | None:
    normalized = " ".join(html.split())
    marker = '<td class="s2">Brent</td>'
    marker_index = normalized.find(marker)
    if marker_index < 0:
        return None
    tail = normalized[marker_index : marker_index + 220]
    d1_marker = '<td class="d1">'
    start = tail.find(d1_marker)
    if start < 0:
        return None
    start += len(d1_marker)
    end = tail.find("<", start)
    if end < 0:
        return None
    try:
        value = float(tail[start:end])
    except ValueError:
        return None
    header_dates = _parse_eia_header_dates(html)
    return value, header_dates[0] if header_dates else None


def _parse_cbam_eur_per_tonne(html: str) -> float:
    text = " ".join(html.replace("&nbsp;", " ").replace("&#160;", " ").split())
    import re

    match = re.search(
        r"Q([1-4])\s+(\d{4})\s+([0-9]{1,2}\s+\w+\s+\d{4})\s+([0-9]+(?:[.,][0-9]+)?)",
        text,
        re.IGNORECASE,
    )
    if not match:
        raise ValueError("CBAM certificate price not found")
    return float(match.group(4).replace(",", "."))


def _parse_ecb_usd_per_eur(xml: str) -> float:
    rate, _observed = _parse_ecb_quote(xml)
    return rate


def _parse_ecb_quote(xml: str) -> tuple[float, datetime | None]:
    import re

    match = re.search(r'<Cube\s+currency=["\']USD["\']\s+rate=["\']([^"\']+)["\']', xml, re.IGNORECASE)
    if not match:
        raise ValueError("ECB USD reference rate not found")
    rate = float(match.group(1))
    time_match = re.search(r'<Cube\s+time=["\'](\d{4}-\d{2}-\d{2})["\']', xml, re.IGNORECASE)
    observed = (
        datetime.fromisoformat(time_match.group(1)).replace(tzinfo=timezone.utc) if time_match else None
    )
    return rate, observed


def _parse_decimal_number(raw: str) -> float:
    cleaned = raw.strip().replace(" ", "")
    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(",", "")
    elif "," in cleaned:
        cleaned = cleaned.replace(",", ".")
    return float(cleaned)


def _parse_ara_rotterdam_jet_usd_per_metric_ton(html: str) -> float:
    import re

    normalized = " ".join(html.replace("&nbsp;", " ").replace("&#160;", " ").split())
    patterns = (
        r'data-test="instrument-price-last"[^>]*>\s*([0-9][0-9.,]*)\s*<',
        r'"last"\s*:\s*"([0-9][0-9.,]*)"',
        r'"last_price"\s*:\s*"([0-9][0-9.,]*)"',
        r'last_last[^>]*>\s*([0-9][0-9.,]*)\s*<',
    )
    for pattern in patterns:
        match = re.search(pattern, normalized, re.IGNORECASE)
        if match:
            return _parse_decimal_number(match.group(1))
    raise ValueError("ARA/Rotterdam jet quote not found in public payload")


def _set_source_detail(
    details: dict[str, object],
    metric_name: str,
    *,
    source: str,
    status: str,
    value: float | None = None,
    error: str | None = None,
    extra: dict[str, object] | None = None,
) -> None:
    context = SOURCE_CONTEXT.get(
        source,
        {
            "region": "global",
            "market_scope": "unknown",
            "lag_minutes": None,
            "confidence_score": 0.5,
            "note": "Source context not classified yet.",
        },
    )
    source_detail: dict[str, object] = {
        "source": source,
        "status": status,
        "region": context["region"],
        "market_scope": context["market_scope"],
        "lag_minutes": context["lag_minutes"],
        "confidence_score": context["confidence_score"],
        # Fallback/seed statuses must surface fallback_used so API consumers can
        # distinguish live public quotes from derived or deterministic proxies.
        "fallback_used": status in {"fallback", "seed"},
        "note": context["note"],
        "fetched_at": isoformat_z(utcnow()),
        "quality": (
            "seed"
            if status in {"seed"} or source == "seed-baseline"
            else "derived"
            if status == "fallback" and ("derived" in source or source in {"brent-derived", "cbam+ecb", "eua+ecb"})
            else "missing"
            if status in {"missing", "error"}
            else "observed"
            if status == "ok"
            else "seed"
            if status == "fallback"
            else "missing"
        ),
    }
    if value is not None:
        source_detail["value"] = value
    if error is not None:
        source_detail["error"] = error
    if extra:
        source_detail.update(extra)
    details["sources"][metric_name] = source_detail


def _public_source_error(status: str, fallback_used: bool, error: object | None) -> str | None:
    if error is None:
        return None
    if fallback_used:
        return "fallback_used"
    if status == "seed":
        return "seed_used"
    return "source_unavailable"


def _ingest_brent_market_value(details: dict[str, object]) -> float | None:
    brent_value = None
    try:
        eia_html = _fetch_text(MARKET_SOURCE_URLS["brent_eia"])
        parsed_eia = _parse_eia_brent_quote(eia_html)
        if parsed_eia is None:
            raise ValueError("Brent value not found on EIA page")
        raw_value, observed_at = parsed_eia
        brent_value = _round(raw_value, 2)
        _set_source_detail(
            details,
            "brent",
            source="eia",
            status="ok",
            value=brent_value,
            extra={
                "quality": "observed",
                "quote_kind": "spot",
                "product_id": "EIA Europe Brent Spot",
                "observed_at": isoformat_z(observed_at) if observed_at else None,
                "published_at": isoformat_z(observed_at) if observed_at else None,
            },
        )
    except Exception as error:
        _set_source_detail(details, "brent", source="eia", status="error", error=str(error))
        try:
            brent_csv = _fetch_text(MARKET_SOURCE_URLS["brent_fred"])
            as_of_str, brent_fred = _parse_fred_csv(brent_csv)
            brent_value = _round(brent_fred, 2)
            observed_at = datetime.fromisoformat(as_of_str).replace(tzinfo=timezone.utc)
            _set_source_detail(
                details,
                "brent",
                source="fred",
                status="ok",
                value=brent_value,
                extra={
                    "quality": "observed",
                    "quote_kind": "spot",
                    "product_id": "FRED DCOILBRENTEU",
                    "observed_at": isoformat_z(observed_at),
                },
            )
        except Exception as fallback_error:
            _set_source_detail(
                details,
                "brent",
                source="fred",
                status="error",
                error=str(fallback_error),
            )
    return brent_value


def _ingest_jet_market_value(details: dict[str, object]) -> float | None:
    jet_value = None
    try:
        jet_csv = _fetch_text(MARKET_SOURCE_URLS["jet_fred"])
        as_of_str, jet_usd_per_gal = _parse_fred_csv(jet_csv)
        jet_value = _round(_to_usd_per_l_from_usd_per_gal(jet_usd_per_gal), 3)
        observed_at = datetime.fromisoformat(as_of_str).replace(tzinfo=timezone.utc)
        _set_source_detail(
            details,
            "jet",
            source="fred",
            status="ok",
            value=jet_value,
            extra={
                "quality": "observed",
                "quote_kind": "spot",
                "product_id": "FRED DJFUELUSGULF",
                "observed_at": isoformat_z(observed_at),
            },
        )
    except Exception as error:
        _set_source_detail(details, "jet", source="fred", status="error", error=str(error))
    return jet_value


def _ingest_ecb_usd_per_eur(details: dict[str, object]) -> float | None:
    try:
        ecb_xml = _fetch_text(MARKET_SOURCE_URLS["ecb_eur_usd"])
        usd_per_eur, observed_at = _parse_ecb_quote(ecb_xml)
        rate = _round(usd_per_eur, 4)
        _set_source_detail(
            details,
            "ecb",
            source="ecb",
            status="ok",
            value=rate,
            extra={
                "quality": "observed",
                "quote_kind": "reference",
                "product_id": "ECB EUR/USD reference",
                "observed_at": isoformat_z(observed_at) if observed_at else None,
                "usd_per_eur": rate,
            },
        )
        return rate
    except Exception as error:
        _set_source_detail(details, "ecb", source="ecb", status="error", error=str(error))
        return None


def _ingest_carbon_market_value(
    details: dict[str, object],
    *,
    eu_ets_eur: float | None = None,
    usd_per_eur: float | None = None,
) -> float | None:
    if eu_ets_eur is not None and usd_per_eur is not None:
        carbon_value = _round(eu_ets_eur * usd_per_eur, 2)
        _set_source_detail(
            details,
            "carbon",
            source="eua+ecb",
            status="ok",
            value=carbon_value,
            extra={
                "quality": "derived",
                "quote_kind": "proxy",
                "product_id": "EUA converted with ECB FX",
                "raw_eur_per_t": eu_ets_eur,
                "usd_per_eur": usd_per_eur,
                "note": "Aviation-relevant EUA converted to USD. Not a CBAM certificate price.",
            },
        )
        return carbon_value
    try:
        cbam_html = _fetch_text(MARKET_SOURCE_URLS["cbam_price"])
        cbam_eur = _parse_cbam_eur_per_tonne(cbam_html)
        rate = usd_per_eur
        if rate is None:
            ecb_xml = _fetch_text(MARKET_SOURCE_URLS["ecb_eur_usd"])
            rate, _observed = _parse_ecb_quote(ecb_xml)
        carbon_value = _round(cbam_eur * rate, 2)
        _set_source_detail(
            details,
            "carbon",
            source="cbam+ecb",
            status="fallback",
            value=carbon_value,
            extra={
                "quality": "derived",
                "quote_kind": "proxy",
                "product_id": "CBAM certificate proxy",
                "cbam_eur": _round(cbam_eur, 2),
                "usd_per_eur": _round(rate, 4),
                "note": "CBAM certificate proxy, not an aviation EUA settlement.",
                "fallback_used": True,
            },
        )
        return carbon_value
    except Exception as error:
        _set_source_detail(details, "carbon", source="cbam+ecb", status="error", error=str(error))
        return None


def _ingest_jet_eu_market_value(
    details: dict[str, object],
    *,
    brent_value: float | None,
    seed_by_key: dict[str, float],
) -> float:
    try:
        ara_html = _fetch_text(MARKET_SOURCE_URLS["jet_ara_rotterdam"])
        ara_usd_per_metric_ton = _parse_ara_rotterdam_jet_usd_per_metric_ton(ara_html)
        jet_eu_value = _round(_to_usd_per_l_from_usd_per_metric_ton(ara_usd_per_metric_ton), 3)
        _set_source_detail(
            details,
            "jet_eu_proxy",
            source="ara-rotterdam-public",
            status="ok",
            value=jet_eu_value,
            extra={
                "quality": "observed",
                "quote_kind": "futures",
                "product_id": "ICE Jet CIF NWE Cargoes Future",
                "raw_usd_per_metric_ton": ara_usd_per_metric_ton,
                "note": f"ICE Jet CIF NWE futures {_round(ara_usd_per_metric_ton, 2)} USD/metric ton converted with 0.8 kg/L reference density. Not a German airport into-plane spot.",
            },
        )
        return jet_eu_value
    except Exception as primary_error:
        primary_error_text = str(primary_error)
        if brent_value is not None:
            derived_value = _round(_derive_jet_eu_proxy_usd_per_l_from_brent(brent_value), 3)
            _set_source_detail(
                details,
                "jet_eu_proxy",
                source="brent-derived",
                status="fallback",
                value=derived_value,
                extra={
                    "quality": "derived",
                    "quote_kind": "proxy",
                    "product_id": "Brent-derived EU jet proxy",
                    "note": "ARA/Rotterdam public quote unavailable; fell back to Brent-derived EU proxy.",
                    "primary_error": primary_error_text,
                    "fallback_used": True,
                },
            )
            return derived_value

        seed_value = float(seed_by_key["jet_eu_proxy_usd_per_l"])
        _set_source_detail(
            details,
            "jet_eu_proxy",
            source="seed-baseline",
            status="fallback",
            value=seed_value,
            extra={
                "quality": "seed",
                "quote_kind": "assumption",
                "product_id": "seed EU jet proxy",
                "note": "ARA/Rotterdam and Brent unavailable; fell back to seeded EU proxy baseline.",
                "primary_error": primary_error_text,
                "confidence_score": DETERMINISTIC_FALLBACK_CONFIDENCE,
                "fallback_used": True,
            },
        )
        return seed_value


def _ingest_rotterdam_jet_fuel_value(
    details: dict[str, object],
    *,
    seed_by_key: dict[str, float],
) -> float | None:
    """ICE Jet CIF NWE futures quote. Failure must not mint a fresh seed observation."""
    try:
        ara_html = _fetch_text(MARKET_SOURCE_URLS["jet_ara_rotterdam"])
        ara_usd_per_metric_ton = _parse_ara_rotterdam_jet_usd_per_metric_ton(ara_html)
        rotterdam_value = _round(_to_usd_per_l_from_usd_per_metric_ton(ara_usd_per_metric_ton), 3)
        _set_source_detail(
            details,
            "rotterdam_jet_fuel",
            source="rotterdam-jet-direct",
            status="ok",
            value=rotterdam_value,
            extra={
                "quality": "observed",
                "quote_kind": "futures",
                "product_id": "ICE Jet CIF NWE Cargoes Future",
                "raw_usd_per_metric_ton": ara_usd_per_metric_ton,
                "note": f"ICE Jet CIF NWE futures {_round(ara_usd_per_metric_ton, 2)} USD/metric ton. Not a German airport into-plane spot.",
            },
        )
        return rotterdam_value
    except Exception as error:
        _set_source_detail(
            details,
            "rotterdam_jet_fuel",
            source="rotterdam-jet-direct",
            status="error",
            error=str(error),
            extra={
                "quality": "missing",
                "quote_kind": "futures",
                "product_id": "ICE Jet CIF NWE Cargoes Future",
                "note": "Public ICE Jet CIF NWE HTML unavailable. Last good observation is retained; seed is not a new quote.",
            },
        )
        return None


def _parse_eu_ets_price_eur(html: str) -> float:
    """Parse EEX EU ETS spot only when the payload identifies EUA / EU ETS."""
    import re

    if not re.search(r"\b(?:EUA|EU ETS|European Emission)\b", html, re.IGNORECASE):
        raise ValueError("EEX payload missing EU ETS product identity")
    normalized = " ".join(html.replace("&nbsp;", " ").replace("&#160;", " ").split())
    patterns = (
        r'(?:EUA|EU ETS)[^0-9]{0,80}([0-9]{2,3}(?:[.,][0-9]+)?)\s*(?:EUR|€)',
        r'(\d+(?:[.,]\d+)?)\s*EUR(?:\s*/)?(?:t|tonne|tCO2)',
        r'data-test="[^"]*(?:eua|ets)[^"]*price[^"]*"[^>]*>\s*([0-9][0-9.,]*)\s*<',
    )
    for pattern in patterns:
        match = re.search(pattern, normalized, re.IGNORECASE)
        if match:
            parsed = _parse_decimal_number(match.group(1))
            if 10 <= parsed <= 500:
                return parsed
    raise ValueError("EU ETS price not found in EEX payload")


def _ingest_eu_ets_price(
    details: dict[str, object],
    *,
    ecb_usd_per_eur: float | None = None,
    seed_by_key: dict[str, float],
) -> float | None:
    """EU ETS spot price from EEX; return EUR/tCO2. Failure does not mint a seed quote."""
    try:
        ets_html = _fetch_text(MARKET_SOURCE_URLS["eu_ets_eex"])
        eu_ets_eur = _parse_eu_ets_price_eur(ets_html)
        ets_value = _round(eu_ets_eur, 2)

        extra_dict: dict[str, object] = {
            "raw_eur_per_t": ets_value,
            "quality": "observed",
            "quote_kind": "spot",
            "product_id": "EEX EUA",
        }
        if ecb_usd_per_eur is not None:
            extra_dict["usd_per_t"] = _round(ets_value * ecb_usd_per_eur, 2)
            extra_dict["usd_per_eur"] = ecb_usd_per_eur

        _set_source_detail(
            details,
            "eu_ets",
            source="eex-eu-ets",
            status="ok",
            value=ets_value,
            extra=extra_dict,
        )
        return ets_value
    except Exception as error:
        _set_source_detail(
            details,
            "eu_ets",
            source="eex-eu-ets",
            status="error",
            error=str(error),
            extra={
                "quality": "missing",
                "quote_kind": "spot",
                "product_id": "EEX EUA",
                "note": "EEX EUA parse failed or product identity missing. Last good observation is retained.",
            },
        )
        return None


def _ingest_germany_premium(
    details: dict[str, object],
    *,
    seed_by_key: dict[str, float],
    jet_eu_proxy_usd_per_l: float | None = None,
) -> float | None:
    """German airport differential is not a public quote.

    EnergiestG §27(2) generally exempts commercial non-private aviation fuel
    from energy tax. A clamped tax/price ratio is not a market premium.
    """
    _set_source_detail(
        details,
        "germany_premium",
        source="airport-differential-pending",
        status="missing",
        extra={
            "quality": "missing",
            "quote_kind": "assumption",
            "product_id": "DE airport into-plane differential",
            "confidence_score": 0.0,
            "fallback_used": False,
            "note": (
                "German airport into-plane differential pending a sourced quote. "
                "Commercial non-private aviation fuel is generally energy-tax exempt "
                "under EnergiestG §27(2). Do not treat a clamped 8% tax ratio as a market premium."
            ),
        },
    )
    return None


def _market_overall_status(details: dict[str, object]) -> str:
    source_states = [item.get("status") for item in details["sources"].values()]
    if all(state == "ok" for state in source_states):
        return "ok"
    if any(state == "ok" for state in source_states):
        return "degraded"
    return "error"


def _ingest_live_market_values() -> tuple[dict[str, float | None], str, dict[str, object]]:
    details: dict[str, object] = {"sources": {}}
    seed_by_key = {item["metric_key"]: item["value"] for item in DEFAULT_MARKET_METRICS}
    ecb_usd_per_eur = _ingest_ecb_usd_per_eur(details)
    brent_value = _ingest_brent_market_value(details)
    jet_value = _ingest_jet_market_value(details)
    jet_eu_proxy_value = _ingest_jet_eu_market_value(
        details,
        brent_value=brent_value,
        seed_by_key=seed_by_key,
    )
    rotterdam_value = _ingest_rotterdam_jet_fuel_value(
        details,
        seed_by_key=seed_by_key,
    )
    eu_ets_value = _ingest_eu_ets_price(
        details,
        ecb_usd_per_eur=ecb_usd_per_eur,
        seed_by_key=seed_by_key,
    )
    carbon_value = _ingest_carbon_market_value(
        details,
        eu_ets_eur=eu_ets_value,
        usd_per_eur=ecb_usd_per_eur,
    )
    germany_premium = _ingest_germany_premium(
        details,
        seed_by_key=seed_by_key,
        jet_eu_proxy_usd_per_l=jet_eu_proxy_value,
    )

    values: dict[str, float | None] = {
        "brent_usd_per_bbl": brent_value,
        "jet_usd_per_l": jet_value,
        "carbon_proxy_usd_per_t": carbon_value,
        "jet_eu_proxy_usd_per_l": jet_eu_proxy_value,
        "rotterdam_jet_fuel_usd_per_l": rotterdam_value,
        "eu_ets_price_eur_per_t": eu_ets_value,
        "germany_premium_pct": germany_premium,
        "usd_per_eur": ecb_usd_per_eur,
    }

    if brent_value is None and "brent" in details["sources"]:
        details["sources"]["brent"]["fallback_used"] = True
    if jet_value is None and "jet" in details["sources"]:
        details["sources"]["jet"]["fallback_used"] = True
    if carbon_value is None and "carbon" in details["sources"]:
        details["sources"]["carbon"]["fallback_used"] = True
    if (
        "jet_eu_proxy" in details["sources"]
        and details["sources"]["jet_eu_proxy"].get("status") != "ok"
    ):
        details["sources"]["jet_eu_proxy"]["fallback_used"] = True

    overall = _market_overall_status(details)
    details["overall"] = overall
    return values, overall, details


def _metric_meta_from_sources(sources: dict[str, object] | None) -> dict[str, dict[str, object]]:
    meta: dict[str, dict[str, object]] = {}
    for source_key, raw in (sources or {}).items():
        if not isinstance(raw, dict):
            continue
        metric_key = SOURCE_DETAIL_TO_METRIC_KEY.get(source_key)
        if not metric_key:
            continue
        meta[metric_key] = {
            "quality": raw.get("quality") or quality_from_detail(raw),
            "observed_at": raw.get("observed_at"),
            "published_at": raw.get("published_at"),
            "quote_kind": raw.get("quote_kind"),
            "product_id": raw.get("product_id"),
        }
    return meta


def _persist_market_snapshot_set(
    db: Session,
    values: dict[str, float | None],
    *,
    as_of: datetime | None = None,
    source_status: str,
    sources: dict[str, object] | None = None,
    ingest: str,
    payload: dict[str, object] | None = None,
    metric_meta: dict[str, dict[str, object]] | None = None,
) -> datetime:
    snapshot_time = _ensure_utc_datetime(as_of or utcnow())
    payload_blob = payload or {}
    metric_defaults = {item["metric_key"]: item for item in DEFAULT_MARKET_METRICS}
    run = MarketRefreshRun(
        refreshed_at=snapshot_time,
        source_status=source_status,
        sources=sources or {},
        ingest=ingest,
    )
    db.add(run)
    db.flush()

    merged_meta = _metric_meta_from_sources(sources)
    if metric_meta:
        for key, extra in metric_meta.items():
            merged_meta[key] = {**merged_meta.get(key, {}), **extra}

    for metric_key, value in values.items():
        defaults = metric_defaults.get(metric_key)
        if defaults is None or value is None:
            continue
        meta = merged_meta.get(metric_key, {})
        quality = str(meta.get("quality") or ("seed" if ingest == "seed" else "observed"))
        has_prior = (
            db.scalar(
                select(MarketSnapshot.id).where(MarketSnapshot.metric_key == metric_key).limit(1)
            )
            is not None
        )
        if not should_persist_snapshot(quality=quality, value=float(value), has_prior=has_prior):
            continue
        observed_at = parse_iso_datetime(meta.get("observed_at"))
        if observed_at is None:
            if quality == "seed":
                observed_at = datetime.fromisoformat(DEFAULT_MARKET_SEED_AS_OF).replace(tzinfo=timezone.utc)
            else:
                observed_at = snapshot_time
        db.add(
            MarketSnapshot(
                source_key=defaults["source_key"],
                metric_key=metric_key,
                value=float(value),
                unit=defaults["unit"],
                as_of=observed_at,
                payload={
                    **payload_blob,
                    "refresh_run_id": run.id,
                    "quality": quality,
                    "fetched_at": isoformat_z(snapshot_time),
                    "observed_at": isoformat_z(observed_at),
                    "published_at": meta.get("published_at"),
                    "quote_kind": meta.get("quote_kind"),
                    "product_id": meta.get("product_id"),
                },
            )
        )

    db.commit()
    return snapshot_time


def _latest_market_snapshots_by_metric(db: Session) -> dict[str, MarketSnapshot]:
    """Load the newest snapshot row for each expected metric with indexed seeks."""
    latest_by_metric: dict[str, MarketSnapshot] = {}
    for metric in DEFAULT_MARKET_METRICS:
        metric_key = str(metric["metric_key"])
        row = db.scalar(
            select(MarketSnapshot)
            .where(MarketSnapshot.metric_key == metric_key)
            .order_by(MarketSnapshot.as_of.desc(), MarketSnapshot.id.desc())
            .limit(1)
        )
        if row is not None:
            latest_by_metric[metric_key] = row
    return latest_by_metric


def _latest_market_values_by_metric(db: Session) -> dict[str, float]:
    latest_by_metric = _latest_market_snapshots_by_metric(db)
    if any(key not in latest_by_metric for key in _required_snapshot_metric_keys()):
        seed_market_snapshot_set(db)
        return _latest_market_values_by_metric(db)
    return {metric_key: float(row.value) for metric_key, row in latest_by_metric.items()}


def _scale_history_to_latest(
    rows: list[tuple[datetime, float]],
    *,
    latest_value: float,
    inverse: bool = False,
) -> list[tuple[datetime, float]]:
    if not rows:
        return []
    latest_proxy = float(rows[-1][1])
    if abs(latest_proxy) < 1e-9:
        return []

    scaled: list[tuple[datetime, float]] = []
    for as_of, proxy_value in rows:
        if inverse:
            value = latest_value * (latest_proxy / float(proxy_value)) if abs(float(proxy_value)) >= 1e-9 else latest_value
        else:
            value = latest_value * (float(proxy_value) / latest_proxy)
        scaled.append((as_of, value))
    return scaled


def _insert_backfill_rows(
    db: Session,
    metric_key: str,
    rows: list[tuple[datetime, float]],
    *,
    payload: dict[str, object],
) -> int:
    if not rows:
        return 0

    metric_defaults = {item["metric_key"]: item for item in DEFAULT_MARKET_METRICS}
    defaults = metric_defaults[metric_key]
    existing = {
        _ensure_utc_datetime(row.as_of).replace(microsecond=0)
        for row in db.scalars(select(MarketSnapshot).where(MarketSnapshot.metric_key == metric_key)).all()
    }

    inserted = 0
    for raw_as_of, value in rows:
        as_of = _ensure_utc_datetime(raw_as_of).replace(microsecond=0)
        if as_of in existing:
            continue
        db.add(
            MarketSnapshot(
                source_key=defaults["source_key"],
                metric_key=metric_key,
                value=float(value),
                unit=defaults["unit"],
                as_of=as_of,
                payload=payload,
            )
        )
        existing.add(as_of)
        inserted += 1
    return inserted


def backfill_market_history_from_public_sources(db: Session, *, days: int = 30) -> dict[str, object]:
    """Backfill local market history with public daily series and labelled proxies.

    Direct public sources are used where available. Metrics without a reliable
    free daily spot series are scaled from a public proxy curve and labelled in
    row payloads instead of being presented as raw exchange settlement data.
    """
    days = max(1, min(int(days), 90))
    latest_values = _latest_market_values_by_metric(db)

    brent_rows = _fetch_yahoo_chart_history("BZ=F", days=days)
    jet_rows = [
        (as_of, _to_usd_per_l_from_usd_per_gal(value))
        for as_of, value in _fetch_fred_history("DJFUELUSGULF", days=days)
    ]
    carbon_proxy_rows = _fetch_yahoo_chart_history("CO2.L", days=days)

    inserted = 0
    sources = ["Yahoo Finance BZ=F", "FRED DJFUELUSGULF", "Yahoo Finance CO2.L"]

    inserted += _insert_backfill_rows(
        db,
        "brent_usd_per_bbl",
        brent_rows,
        payload={
            "history_backfill": True,
            "source": "yahoo:BZ=F",
            "source_url": "https://finance.yahoo.com/quote/BZ=F/",
            "note": "Brent futures daily close from Yahoo chart endpoint.",
        },
    )
    inserted += _insert_backfill_rows(
        db,
        "jet_usd_per_l",
        jet_rows,
        payload={
            "history_backfill": True,
            "source": "fred:DJFUELUSGULF",
            "source_url": "https://fred.stlouisfed.org/series/DJFUELUSGULF",
            "note": "U.S. Gulf Coast kerosene-type jet fuel converted from USD/gal to USD/L.",
        },
    )

    for metric_key, note in (
        (
            "jet_eu_proxy_usd_per_l",
            "EU jet proxy scaled from Brent futures daily returns to the latest local EU jet proxy value.",
        ),
        (
            "rotterdam_jet_fuel_usd_per_l",
            "Rotterdam jet proxy scaled from Brent futures daily returns to the latest local Rotterdam value.",
        ),
    ):
        inserted += _insert_backfill_rows(
            db,
            metric_key,
            _scale_history_to_latest(brent_rows, latest_value=latest_values[metric_key]),
            payload={
                "history_backfill": True,
                "source": "proxy:yahoo:BZ=F",
                "source_url": "https://finance.yahoo.com/quote/BZ=F/",
                "note": note,
            },
        )

    for metric_key, note in (
        (
            "eu_ets_price_eur_per_t",
            "EU ETS proxy scaled from SparkChange Physical Carbon EUA ETC daily returns to the latest local EU ETS value.",
        ),
        (
            "carbon_proxy_usd_per_t",
            "Carbon proxy scaled from SparkChange Physical Carbon EUA ETC daily returns to the latest local carbon proxy value.",
        ),
    ):
        inserted += _insert_backfill_rows(
            db,
            metric_key,
            _scale_history_to_latest(carbon_proxy_rows, latest_value=latest_values[metric_key]),
            payload={
                "history_backfill": True,
                "source": "proxy:yahoo:CO2.L",
                "source_url": "https://finance.yahoo.com/quote/CO2.L/",
                "note": note,
            },
        )

    inserted += _insert_backfill_rows(
        db,
        "germany_premium_pct",
        _scale_history_to_latest(
            brent_rows,
            latest_value=latest_values["germany_premium_pct"],
            inverse=True,
        ),
        payload={
            "history_backfill": True,
            "source": "proxy:yahoo:BZ=F:inverse",
            "source_url": "https://finance.yahoo.com/quote/BZ=F/",
            "note": "Germany premium proxy moves inversely to Brent-derived jet cost and is scaled to the latest local premium value.",
        },
    )

    if inserted:
        db.add(
            MarketRefreshRun(
                refreshed_at=utcnow(),
                source_status="ok",
                sources={"history_backfill": {"sources": sources, "days": days}},
                ingest="history-backfill",
            )
        )
        db.commit()

    return {
        "inserted_metric_count": inserted,
        "days_requested": days,
        "sources": sources,
    }


def seed_market_snapshot_set(db: Session, as_of: datetime | None = None) -> datetime:
    seed_values = {metric["metric_key"]: float(metric["value"]) for metric in DEFAULT_MARKET_METRICS}
    seed_sources = {
        detail_key: {
            "source": "seed-baseline",
            "status": "seed",
            "quality": "seed",
            "fallback_used": True,
            "value": seed_values[metric_key],
        }
        for detail_key, metric_key in SOURCE_DETAIL_TO_METRIC_KEY.items()
        if metric_key in seed_values
    }
    return _persist_market_snapshot_set(
        db,
        seed_values,
        as_of=as_of or datetime.fromisoformat(DEFAULT_MARKET_SEED_AS_OF).replace(tzinfo=timezone.utc),
        source_status="seed",
        sources=seed_sources,
        ingest="seed",
        payload={"seed": "b5-vertical-slice"},
    )


def refresh_market_snapshot_set(db: Session) -> tuple[datetime, str]:
    lock_acquired = False
    lock_supported = True
    try:
        try:
            lock_acquired = bool(
                db.execute(
                    text("SELECT pg_try_advisory_lock(:key)"),
                    {"key": MARKET_REFRESH_LOCK_KEY},
                ).scalar()
            )
        except Exception:
            # Non-Postgres engines may not support advisory lock functions.
            lock_supported = False
            lock_acquired = True

        if not lock_acquired:
            return utcnow(), "skipped-lock"

        values, overall, details = _ingest_live_market_values()
        refreshed_at = _persist_market_snapshot_set(
            db,
            values,
            source_status=overall,
            sources=details.get("sources", {}),
            ingest="live-refresh",
            payload={"lock": "advisory" if lock_supported else "none"},
        )
        return refreshed_at, overall
    finally:
        if lock_acquired and lock_supported:
            try:
                db.execute(
                    text("SELECT pg_advisory_unlock(:key)"),
                    {"key": MARKET_REFRESH_LOCK_KEY},
                )
            except Exception:
                # Best-effort unlock; DB session close will release lock.
                pass


def _required_snapshot_metric_keys() -> list[str]:
    return [
        str(metric["metric_key"])
        for metric in DEFAULT_MARKET_METRICS
        if metric["metric_key"] != "germany_premium_pct"
    ]


def build_market_snapshot_response(db: Session) -> MarketSnapshotResponse:
    latest_by_metric = _latest_market_snapshots_by_metric(db)

    if any(key not in latest_by_metric for key in _required_snapshot_metric_keys()):
        seeded_at = seed_market_snapshot_set(db)
        latest_by_metric = _latest_market_snapshots_by_metric(db)
        generated_at = seeded_at
    else:
        generated_at = max(row.as_of for row in latest_by_metric.values())

    values: dict[str, float | None] = {}
    for metric in DEFAULT_MARKET_METRICS:
        key = metric["metric_key"]
        row = latest_by_metric.get(key)
        values[key] = float(row.value) if row is not None else None

    latest_run = db.scalar(
        select(MarketRefreshRun).order_by(MarketRefreshRun.refreshed_at.desc()).limit(1)
    )
    if latest_run is None:
        overall_status = "ok"
        source_details: dict[str, object] = {}
        refreshed_at = generated_at
    else:
        overall_status = latest_run.source_status
        if overall_status not in {"ok", "degraded", "error", "seed"}:
            overall_status = "ok"
        source_details = latest_run.sources if isinstance(latest_run.sources, dict) else {}
        refreshed_at = latest_run.refreshed_at

    typed_source_details: dict[str, MarketSourceDetail] = {}
    for key, raw in source_details.items():
        if not isinstance(raw, dict):
            continue
        source_name = str(raw.get("source", "unknown"))
        context = SOURCE_CONTEXT.get(
            source_name,
            {
                "region": "global",
                "market_scope": "unknown",
                "lag_minutes": None,
                "confidence_score": 0.5,
                "note": "Source context not classified yet.",
            },
        )
        typed_source_details[key] = MarketSourceDetail(
            source=source_name,
            status=str(raw.get("status", "unknown")),
            value=float(raw["value"]) if raw.get("value") is not None else None,
            error=_public_source_error(
                str(raw.get("status", "unknown")),
                bool(raw.get("fallback_used", False)),
                raw.get("error"),
            ),
            note=str(raw.get("note") or context["note"]),
            region=str(raw.get("region") or context["region"]),
            market_scope=str(raw.get("market_scope") or context["market_scope"]),
            lag_minutes=int(raw["lag_minutes"]) if raw.get("lag_minutes") is not None else context["lag_minutes"],
            confidence_score=float(raw.get("confidence_score", context["confidence_score"])),
            fallback_used=bool(raw.get("fallback_used", False)),
            cbam_eur=float(raw["cbam_eur"]) if raw.get("cbam_eur") is not None else None,
            usd_per_eur=float(raw["usd_per_eur"]) if raw.get("usd_per_eur") is not None else None,
            raw_usd_per_metric_ton=float(raw["raw_usd_per_metric_ton"]) if raw.get("raw_usd_per_metric_ton") is not None else None,
            raw_eur_per_t=float(raw["raw_eur_per_t"]) if raw.get("raw_eur_per_t") is not None else None,
            usd_per_t=float(raw["usd_per_t"]) if raw.get("usd_per_t") is not None else None,
            quality=str(raw.get("quality") or quality_from_detail(raw)),
            quote_kind=str(raw["quote_kind"]) if raw.get("quote_kind") is not None else None,
            product_id=str(raw["product_id"]) if raw.get("product_id") is not None else None,
            observed_at=parse_iso_datetime(raw.get("observed_at")),
            published_at=parse_iso_datetime(raw.get("published_at")),
            fetched_at=parse_iso_datetime(raw.get("fetched_at")) or _ensure_utc_datetime(refreshed_at),
        )

    freshness_minutes = max(
        0,
        int((utcnow() - _ensure_utc_datetime(refreshed_at)).total_seconds() // 60),
    )

    # When the refresh run itself is stale, cap confidence for fallback/proxy rows
    # into the DATA_CONTRACT weak/stale band so product surfaces can warn.
    if freshness_minutes >= STALE_SNAPSHOT_SOFT_MINUTES and typed_source_details:
        capped: dict[str, MarketSourceDetail] = {}
        for key, detail in typed_source_details.items():
            if detail.fallback_used or detail.status in {"fallback", "seed"}:
                capped[key] = detail.model_copy(
                    update={
                        "confidence_score": min(
                            float(detail.confidence_score),
                            STALE_SOURCE_CONFIDENCE_CAP,
                        )
                    }
                )
            else:
                capped[key] = detail
        typed_source_details = capped

    confidence_values = [detail.confidence_score for detail in typed_source_details.values()]
    fallback_count = sum(1 for detail in typed_source_details.values() if detail.fallback_used)
    confidence = _round(sum(confidence_values) / len(confidence_values), 3) if confidence_values else 1.0
    fallback_rate = _round((fallback_count / len(typed_source_details)) * 100.0, 2) if typed_source_details else 0.0

    germany_detail = typed_source_details.get("germany_premium")
    if germany_detail is not None and (
        germany_detail.quality == "missing" or germany_detail.status == "missing"
    ):
        values["germany_premium_pct"] = None

    detail_map = {key: detail.model_dump() for key, detail in typed_source_details.items()}
    selected_jet = select_fossil_jet_benchmark(values, detail_map)
    derived: dict[str, float | str | bool | None] = {
        "jet_source": selected_jet["metric_key"],
        "quality": selected_jet["quality"],
        "usable_for_signal": selected_jet["usable_for_signal"],
    }
    brent_for_decomp = values.get("brent_usd_per_bbl")
    jet_for_decomp = selected_jet["value"]
    brent_quality = quality_from_detail(detail_map.get("brent"))
    if (
        selected_jet["usable_for_signal"]
        and brent_for_decomp
        and jet_for_decomp
        and brent_for_decomp > 0
        and jet_for_decomp > 0
        and brent_quality != "seed"
    ):
        try:
            derived.update(
                compute_jet_brent_decomposition(
                    float(brent_for_decomp),
                    float(jet_for_decomp),
                    jet_source=str(selected_jet["metric_key"]),
                )
            )
        except ValueError:
            derived["method"] = "suppressed"
    else:
        derived["method"] = "suppressed"

    quote_qualities = [quality_from_detail(detail.model_dump()) for detail in typed_source_details.values()]
    observed_count = sum(1 for quality in quote_qualities if quality in {"observed", "stale"})
    quote_coverage_rate = _round(observed_count / len(quote_qualities), 3) if quote_qualities else None

    return MarketSnapshotResponse(
        generated_at=_ensure_utc_datetime(generated_at),
        fetched_at=_ensure_utc_datetime(refreshed_at),
        source_status=SourceStatus(
            overall=str(overall_status),
            confidence=confidence,
            freshness_minutes=freshness_minutes,
            fallback_rate=fallback_rate,
            is_fallback=fallback_count > 0,
            quote_coverage_rate=quote_coverage_rate,
            fetched_at=_ensure_utc_datetime(refreshed_at),
        ),
        values=values,
        source_details=typed_source_details,
        derived=derived,
    )


def build_market_health_response(db: Session, *, runs_window: int = 10) -> MarketHealthResponse:
    """Summarize recent market refresh runs for ops / trust UI."""
    window = max(1, min(50, int(runs_window)))
    interval = max(0, int(settings.market_refresh_interval_seconds))
    now = utcnow()

    runs = list(
        db.scalars(
            select(MarketRefreshRun).order_by(MarketRefreshRun.refreshed_at.desc()).limit(window)
        ).all()
    )

    def _run_ok(status: str) -> bool:
        return status in {"ok", "degraded", "seed", "skipped-lock"}

    def _ensure_utc(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    summaries = [
        MarketRefreshRunSummary(
            id=str(run.id),
            refreshed_at=_ensure_utc(run.refreshed_at),
            source_status=str(run.source_status),
            ingest=str(run.ingest),
            ok=_run_ok(str(run.source_status)),
        )
        for run in runs
    ]
    latest = summaries[0] if summaries else None
    age_seconds: int | None = None
    next_eta: int | None = None
    if latest is not None:
        age_seconds = max(0, int((now - latest.refreshed_at).total_seconds()))
        if interval > 0:
            next_eta = max(0, interval - age_seconds)

    ok_count = sum(1 for item in summaries if item.ok)
    total = len(summaries)
    success_rate = (ok_count / total) if total else None

    quote_coverage_rate: float | None = None
    if runs:
        latest_sources = runs[0].sources if isinstance(runs[0].sources, dict) else {}
        qualities = [
            quality_from_detail(raw)
            for raw in latest_sources.values()
            if isinstance(raw, dict)
        ]
        if qualities:
            observed_count = sum(1 for quality in qualities if quality in {"observed", "stale"})
            quote_coverage_rate = round(observed_count / len(qualities), 3)

    if latest is None:
        healthy = False
        note = "No market refresh runs recorded yet. Start API with refresh loop or POST /v1/market/refresh."
    elif latest.source_status == "error":
        healthy = False
        note = "Latest refresh status is error."
    elif interval > 0 and age_seconds is not None and age_seconds > interval * 2:
        healthy = False
        note = f"Latest refresh is stale (age {age_seconds}s > 2× interval {interval}s)."
    else:
        healthy = True
        coverage_pct = f"{quote_coverage_rate:.0%}" if quote_coverage_rate is not None else "n/a"
        note = (
            "Refresh loop is producing snapshots. "
            f"Task success is not quote coverage (latest quote coverage {coverage_pct})."
        )

    return MarketHealthResponse(
        generated_at=now,
        refresh_interval_seconds=interval,
        latest_refreshed_at=latest.refreshed_at if latest else None,
        latest_status=latest.source_status if latest else None,
        latest_ingest=latest.ingest if latest else None,
        age_seconds=age_seconds,
        next_refresh_eta_seconds=next_eta,
        runs_window=window,
        runs_total=total,
        runs_ok=ok_count,
        success_rate=round(success_rate, 3) if success_rate is not None else None,
        quote_coverage_rate=quote_coverage_rate,
        healthy=healthy,
        note=note,
        recent_runs=summaries,
    )


def _pct_change(latest: float, baseline: float | None) -> float | None:
    if baseline is None:
        return None
    if abs(baseline) < 1e-9:
        return None
    return _round(((latest - baseline) / baseline) * 100.0, 3)


def _snapshot_quality(payload: object) -> str:
    if not isinstance(payload, dict):
        return "observed"
    if payload.get("seed"):
        return str(payload.get("quality") or "seed")
    return str(payload.get("quality") or "observed")


def _daily_aggregate(
    rows: list[tuple[datetime, float, str, str, str | None]],
) -> list[tuple[datetime, float, str, str, str | None]]:
    by_day: dict[str, tuple[datetime, float, str, str, str | None]] = {}
    for as_of, value, unit, quality, source in rows:
        day_key = _ensure_utc_datetime(as_of).date().isoformat()
        by_day[day_key] = (_ensure_utc_datetime(as_of), value, unit, quality, source)
    return [by_day[key] for key in sorted(by_day)]


def build_market_history_response(
    db: Session,
    *,
    points_limit_per_metric: int = 120,
    window_days: int = 30,
    start: datetime | None = None,
    end: datetime | None = None,
) -> MarketHistoryResponse:
    """Build history by observation date, not by the last N refresh heartbeats."""
    expected_metrics = [str(metric["metric_key"]) for metric in DEFAULT_MARKET_METRICS]
    window = max(1, min(365, int(window_days)))
    range_end = _ensure_utc_datetime(end) if end is not None else None
    range_start = (
        _ensure_utc_datetime(start) if start is not None else utcnow() - timedelta(days=window)
    )

    def _load_metric_rows(metric_key: str) -> list[tuple[datetime, float, str, str, str | None]]:
        filters = [
            MarketSnapshot.metric_key == metric_key,
            MarketSnapshot.as_of >= range_start,
        ]
        if range_end is not None:
            filters.append(MarketSnapshot.as_of <= range_end)
        statement = (
            select(
                MarketSnapshot.as_of,
                MarketSnapshot.value,
                MarketSnapshot.unit,
                MarketSnapshot.payload,
                MarketSnapshot.source_key,
            )
            .where(*filters)
            .order_by(MarketSnapshot.as_of.asc())
        )
        rows: list[tuple[datetime, float, str, str, str | None]] = []
        for as_of, value, unit, payload, source_key in db.execute(statement).all():
            rows.append(
                (
                    _ensure_utc_datetime(as_of),
                    float(value),
                    str(unit),
                    _snapshot_quality(payload),
                    str(source_key) if source_key else None,
                )
            )
        aggregated = _daily_aggregate(rows)
        non_seed = [row for row in aggregated if row[3] != "seed"]
        return non_seed or aggregated

    def _load_latest_row(metric_key: str) -> tuple[datetime, float, str, str, str | None] | None:
        row = db.scalar(
            select(MarketSnapshot)
            .where(MarketSnapshot.metric_key == metric_key)
            .order_by(MarketSnapshot.as_of.desc(), MarketSnapshot.id.desc())
            .limit(1)
        )
        if row is None:
            return None
        return (
            _ensure_utc_datetime(row.as_of),
            float(row.value),
            str(row.unit),
            _snapshot_quality(row.payload),
            str(row.source_key) if row.source_key else None,
        )

    def _load_history_rows() -> dict[str, list[tuple[datetime, float, str, str, str | None]]]:
        grouped: dict[str, list[tuple[datetime, float, str, str, str | None]]] = {}
        for metric_key in expected_metrics:
            rows = _load_metric_rows(metric_key)
            if rows:
                grouped[metric_key] = rows
        return grouped

    latest_by_metric = {key: _load_latest_row(key) for key in expected_metrics}
    if any(latest_by_metric[key] is None for key in _required_snapshot_metric_keys()):
        seed_market_snapshot_set(db)
        latest_by_metric = {key: _load_latest_row(key) for key in expected_metrics}

    rows_by_metric = _load_history_rows()
    if not any(latest_by_metric.values()):
        return MarketHistoryResponse(generated_at=_ensure_utc_datetime(utcnow()), metrics={})

    def _baseline_same_quality(
        rows: list[tuple[datetime, float, str, str, str | None]],
        *,
        latest_as_of: datetime,
        latest_quality: str,
        days: int,
    ) -> float | None:
        target = latest_as_of - timedelta(days=days)
        candidates = [
            row
            for row in rows
            if row[0] <= target and same_quality_class(row[3], latest_quality)
        ]
        if not candidates:
            return None
        return float(candidates[-1][1])

    generated_at = max(
        row[0]
        for row in list(latest_by_metric.values()) + [item for rows in rows_by_metric.values() for item in rows]
        if row is not None
    )
    windows = [1, 7, 30]

    metrics: dict[str, MarketMetricHistory] = {}
    for metric_key, latest_row in latest_by_metric.items():
        if latest_row is None:
            continue
        metric_rows = rows_by_metric.get(metric_key) or []
        latest_as_of, latest_value, latest_unit, latest_quality, _source = latest_row
        if metric_rows:
            latest_as_of, latest_value, latest_unit, latest_quality, _source = metric_rows[-1]
        change_1d = _pct_change(
            latest_value,
            _baseline_same_quality(metric_rows, latest_as_of=latest_as_of, latest_quality=latest_quality, days=1),
        )
        change_7d = _pct_change(
            latest_value,
            _baseline_same_quality(metric_rows, latest_as_of=latest_as_of, latest_quality=latest_quality, days=7),
        )
        change_30d = _pct_change(
            latest_value,
            _baseline_same_quality(metric_rows, latest_as_of=latest_as_of, latest_quality=latest_quality, days=30),
        )

        points = [
            MarketHistoryPoint(
                as_of=_ensure_utc_datetime(as_of),
                value=float(value),
                quality=quality,
                source=source,
            )
            for as_of, value, _unit, quality, source in metric_rows[-points_limit_per_metric:]
        ]

        metrics[metric_key] = MarketMetricHistory(
            metric_key=metric_key,
            unit=latest_unit,
            latest_value=latest_value,
            latest_as_of=_ensure_utc_datetime(latest_as_of),
            change_pct_1d=change_1d,
            change_pct_7d=change_7d,
            change_pct_30d=change_30d,
            points=points,
            quality=latest_quality,
        )

    return MarketHistoryResponse(
        generated_at=_ensure_utc_datetime(generated_at),
        windows_days=windows,
        metrics=metrics,
    )
