import os
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import httpx
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.tables import MarketRefreshRun, MarketSnapshot
from app.schemas.market import (
    MarketAssumption,
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
    METRIC_KEY_TO_DETAIL_KEY,
    QUALITY_RANK,
    SIGNAL_QUALITIES,
    UNKNOWN_QUALITIES,
    classify_quote_freshness,
    earliest_datetime,
    isoformat_z,
    parse_iso_datetime,
    quality_from_detail,
    quote_freshness,
    same_comparable_series,
    select_fossil_jet_benchmark,
    should_persist_snapshot,
    snapshot_quality,
)

MARKET_SOURCE_URLS = {
    "brent_fred": "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU",
    "jet_fred": "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DJFUELUSGULF",
    "jet_ara_rotterdam": "https://www.investing.com/commodities/jet-fuel-cargoes-cif-nwe-futures",
    "brent_eia": "https://www.eia.gov/todayinenergy/prices.php",
    # EIA daily spot table; FRED DJFUELUSGULF republishes the same Gulf Coast jet series.
    "jet_eia_spot": "https://www.eia.gov/dnav/pet/pet_pri_spt_s1_d.htm",
    "cbam_price": "https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism/price-cbam-certificates_en",
    "ecb_eur_usd": "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
    "eu_ets_eex": "https://www.eex.com/en/market-data/environmental-markets/spot-market",
    # Official EEX primary-market auction workbook. No API key. Year is filled at fetch time.
    "eu_ets_auction_xlsx": "https://public.eex-group.com/eex/eua-auction-report/emission-spot-primary-market-auction-report-{year}-data.xlsx",
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

# Quote age policy lives in one place.
# max_age: a successful external read is `live` only when the observation is this fresh.
# stale_limit: a failed read may reuse an earlier real observation this fresh, never a seed.
# FRED jet (DJFUELUSGULF) publishes with lag, so its live window is 10 days.
DEFAULT_STALE_LIMIT_DAYS = 14
METRIC_QUOTE_AGE_DAYS: dict[str, dict[str, int]] = {
    "brent": {"max_age_days": 10, "stale_limit_days": DEFAULT_STALE_LIMIT_DAYS},
    "jet": {"max_age_days": 10, "stale_limit_days": DEFAULT_STALE_LIMIT_DAYS},
    "carbon": {"max_age_days": 10, "stale_limit_days": DEFAULT_STALE_LIMIT_DAYS},
    "jet_eu_proxy": {"max_age_days": 10, "stale_limit_days": DEFAULT_STALE_LIMIT_DAYS},
    "rotterdam_jet_fuel": {"max_age_days": 10, "stale_limit_days": DEFAULT_STALE_LIMIT_DAYS},
    "eu_ets": {"max_age_days": 10, "stale_limit_days": DEFAULT_STALE_LIMIT_DAYS},
    "germany_premium": {"max_age_days": 14, "stale_limit_days": DEFAULT_STALE_LIMIT_DAYS},
    "ecb": {"max_age_days": 5, "stale_limit_days": DEFAULT_STALE_LIMIT_DAYS},
}
PUBLIC_QUOTE_STATUSES = ("live", "stale", "estimated", "missing")
CORE_HEALTH_DETAILS = ("jet", "brent")
# Qualities that count as a previous real fetch. Seeds and unlabeled rows do not.
REAL_OBSERVATION_QUALITIES = frozenset({"observed", "stale"})
ROTTERDAM_FROM_BRENT_METHOD = (
    "Rotterdam jet USD/L = Brent USD/bbl / 158.987294928 L/bbl × 1.20 "
    "(public EU jet crack and ARA basis multiplier)"
)
JET_EU_FROM_BRENT_METHOD = (
    "EU jet proxy USD/L = Brent USD/bbl / 158.987294928 L/bbl × 1.20 "
    "(public EU jet crack and ARA basis multiplier)"
)
CARBON_FROM_EUA_FX_METHOD = "carbon proxy USD/t = EU ETS auction EUR/t × ECB USD per EUR"
EXCEL_SERIAL_EPOCH = datetime(1899, 12, 30, tzinfo=timezone.utc)

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
    "eex-eua-auction": {
        "region": "eu",
        "market_scope": "carbon_ets_primary_auction",
        "lag_minutes": 1440,
        "confidence_score": 0.9,
        "note": "EEX EUA primary-market auction clearing price (EUR/tCO2), published workbook. Not a continuous secondary spot.",
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

    # The Brent row sits in the table titled "Wholesale Spot Petroleum Prices, 9/21/26 Close";
    # the date lives only in that title, never in a data cell.
    dates: list[datetime] = []
    for match in re.finditer(r"Wholesale Spot Petroleum Prices,\s*([0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4})", html):
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


def _parse_eia_spot_jet_gulf_coast(html: str) -> tuple[float, datetime]:
    """Latest U.S. Gulf Coast kerosene-type jet fuel price (USD/gal) and its date."""
    import re

    normalized = " ".join(html.split())
    dates = re.findall(r'class="Series5"[^>]*>\s*([0-9]{2}/[0-9]{2}/[0-9]{2})\s*<', normalized)
    section = normalized.find("Kerosene-Type Jet Fuel")
    row_start = normalized.find('class="DataStub1">U.S. Gulf Coast<', section) if section >= 0 else -1
    if not dates or row_start < 0:
        raise ValueError("Jet fuel Gulf Coast row not found on EIA spot page")
    row = normalized[row_start : normalized.find("</tr>", normalized.find("</table>", row_start))]
    cells = re.findall(r'class="(?:DataB|Current2)">\s*([^<]*?)\s*<', row)
    if len(cells) != len(dates):
        raise ValueError("EIA spot page columns do not line up with its dates")
    for raw, day in reversed(list(zip(cells, dates))):
        try:
            value = float(raw)
        except ValueError:
            continue
        return value, datetime.strptime(day, "%m/%d/%y").replace(tzinfo=timezone.utc)
    raise ValueError("No numeric jet fuel price on EIA spot page")


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
    value, _observed = _parse_ara_rotterdam_quote(html)
    return value


def _parse_ara_rotterdam_quote(html: str) -> tuple[float, datetime | None]:
    import re

    normalized = " ".join(html.replace("&nbsp;", " ").replace("&#160;", " ").split())
    patterns = (
        r'data-test="instrument-price-last"[^>]*>\s*([0-9][0-9.,]*)\s*<',
        r'"last"\s*:\s*"([0-9][0-9.,]*)"',
        r'"last_price"\s*:\s*"([0-9][0-9.,]*)"',
        r'last_last[^>]*>\s*([0-9][0-9.,]*)\s*<',
    )
    value: float | None = None
    for pattern in patterns:
        match = re.search(pattern, normalized, re.IGNORECASE)
        if match:
            value = _parse_decimal_number(match.group(1))
            break
    if value is None:
        raise ValueError("ARA/Rotterdam jet quote not found in public payload")

    observed: datetime | None = None
    unix_match = re.search(
        r'"(?:last_timestamp|last_time|timestamp|utctime)"\s*:\s*"?(\d{10,13})"?',
        html,
        re.IGNORECASE,
    )
    if unix_match:
        raw = int(unix_match.group(1))
        if raw > 10_000_000_000:
            raw = raw // 1000
        observed = datetime.fromtimestamp(raw, tz=timezone.utc)
    if observed is None:
        iso_match = re.search(
            r'data-test="instrument-price-last-time"[^>]*>\s*([^<]+)',
            html,
            re.IGNORECASE,
        )
        if iso_match:
            observed = parse_iso_datetime(iso_match.group(1).strip())
    return value, observed


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
        try:
            jet_usd_per_gal, observed_at = _parse_eia_spot_jet_gulf_coast(_fetch_text(MARKET_SOURCE_URLS["jet_eia_spot"]))
            jet_value = _round(_to_usd_per_l_from_usd_per_gal(jet_usd_per_gal), 3)
            _set_source_detail(
                details,
                "jet",
                source="eia",
                status="ok",
                value=jet_value,
                extra={
                    "quality": "observed",
                    "quote_kind": "spot",
                    "product_id": "EIA U.S. Gulf Coast Kerosene-Type Jet Fuel",
                    "region": "us",
                    "observed_at": isoformat_z(observed_at),
                },
            )
        except Exception as fallback_error:
            _set_source_detail(details, "jet", source="eia", status="error", error=str(fallback_error))
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
        sources = details.get("sources", {}) if isinstance(details.get("sources"), dict) else {}
        eua_detail = sources.get("eu_ets", {}) if isinstance(sources.get("eu_ets"), dict) else {}
        ecb_detail = sources.get("ecb", {}) if isinstance(sources.get("ecb"), dict) else {}
        derived_at = earliest_datetime(eua_detail.get("observed_at"), ecb_detail.get("observed_at"))
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
                "observed_at": isoformat_z(derived_at) if derived_at else None,
                "published_at": isoformat_z(derived_at) if derived_at else None,
                "input_observed_at": {
                    "eu_ets": eua_detail.get("observed_at"),
                    "ecb": ecb_detail.get("observed_at"),
                },
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
            status="ok",
            value=carbon_value,
            extra={
                "quality": "observed",
                "quote_kind": "proxy",
                "product_id": "CBAM certificate proxy",
                "cbam_eur": _round(cbam_eur, 2),
                "usd_per_eur": _round(rate, 4),
                "observed_at": isoformat_z(utcnow()),
                "note": "CBAM certificate proxy from the public price page, not an aviation EUA settlement.",
                "fallback_used": False,
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
) -> float | None:
    try:
        ara_html = _fetch_text(MARKET_SOURCE_URLS["jet_ara_rotterdam"])
        ara_usd_per_metric_ton, ara_observed = _parse_ara_rotterdam_quote(ara_html)
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
                "observed_at": isoformat_z(ara_observed) if ara_observed else None,
                "published_at": isoformat_z(ara_observed) if ara_observed else None,
                "note": f"ICE Jet CIF NWE futures {_round(ara_usd_per_metric_ton, 2)} USD/metric ton converted with 0.8 kg/L reference density. Not a German airport into-plane spot.",
            },
        )
        return jet_eu_value
    except Exception as primary_error:
        primary_error_text = str(primary_error)
        if brent_value is not None:
            derived_value = _round(_derive_jet_eu_proxy_usd_per_l_from_brent(brent_value), 3)
            brent_detail = details.get("sources", {}).get("brent", {}) if isinstance(details.get("sources"), dict) else {}
            brent_observed = brent_detail.get("observed_at") if isinstance(brent_detail, dict) else None
            brent_published = brent_detail.get("published_at") if isinstance(brent_detail, dict) else brent_observed
            _set_source_detail(
                details,
                "jet_eu_proxy",
                source="brent-derived",
                status="estimated",
                value=derived_value,
                extra={
                    "quality": "derived",
                    "quote_kind": "proxy",
                    "product_id": "Brent-derived EU jet proxy",
                    "observed_at": brent_observed,
                    "published_at": brent_published,
                    "input_observed_at": {"brent": brent_observed},
                    "method": JET_EU_FROM_BRENT_METHOD,
                    "note": JET_EU_FROM_BRENT_METHOD,
                    "primary_error": primary_error_text,
                    "fallback_used": True,
                },
            )
            return derived_value

        _set_source_detail(
            details,
            "jet_eu_proxy",
            source="brent-derived",
            status="missing",
            extra={
                "quality": "missing",
                "quote_kind": "proxy",
                "product_id": "Brent-derived EU jet proxy",
                "method": None,
                "note": "ARA/Rotterdam quote and Brent input are both unavailable.",
                "primary_error": primary_error_text,
                "fallback_used": True,
                "confidence_score": 0.0,
            },
        )
        return None


def _ingest_rotterdam_jet_fuel_value(
    details: dict[str, object],
    *,
    seed_by_key: dict[str, float],
) -> float | None:
    """ICE Jet CIF NWE futures quote. Failure must not mint a fresh seed observation."""
    try:
        ara_html = _fetch_text(MARKET_SOURCE_URLS["jet_ara_rotterdam"])
        ara_usd_per_metric_ton, ara_observed = _parse_ara_rotterdam_quote(ara_html)
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
                "observed_at": isoformat_z(ara_observed) if ara_observed else None,
                "published_at": isoformat_z(ara_observed) if ara_observed else None,
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


def _ingest_eu_ets_auction_workbook(details: dict[str, object]) -> float:
    last_error: Exception | None = None
    for year in (utcnow().year, utcnow().year - 1):
        url = MARKET_SOURCE_URLS["eu_ets_auction_xlsx"].format(year=year)
        try:
            payload = _fetch_bytes(url)
            price, observed, auction_name = _parse_eex_eua_auction_xlsx(payload)
            ets_value = _round(price, 2)
            _set_source_detail(
                details,
                "eu_ets",
                source="eex-eua-auction",
                status="ok",
                value=ets_value,
                extra={
                    "quality": "observed",
                    "quote_kind": "auction",
                    "product_id": auction_name,
                    "raw_eur_per_t": ets_value,
                    "observed_at": isoformat_z(observed),
                    "published_at": isoformat_z(observed),
                    "note": f"EEX primary auction clearing price from {auction_name}.",
                    "source_url": url,
                },
            )
            return ets_value
        except Exception as error:
            last_error = error
    raise last_error or ValueError("EEX EUA auction workbook unavailable")


def _ingest_eu_ets_price(
    details: dict[str, object],
    *,
    ecb_usd_per_eur: float | None = None,
    seed_by_key: dict[str, float],
) -> float | None:
    """EU ETS EUR/tCO2. Prefer the public EEX auction workbook; HTML failure does not mint a seed."""
    del seed_by_key
    try:
        return _ingest_eu_ets_auction_workbook(details)
    except Exception:
        pass
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
            "source": raw.get("source"),
            "input_observed_at": raw.get("input_observed_at"),
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
        quality = str(meta.get("quality") or ("seed" if ingest == "seed" else "unknown"))
        prior_row = db.scalar(
            select(MarketSnapshot)
            .where(MarketSnapshot.metric_key == metric_key)
            .order_by(MarketSnapshot.as_of.desc(), MarketSnapshot.id.desc())
            .limit(1)
        )
        has_prior = prior_row is not None
        prior_payload = prior_row.payload if prior_row is not None and isinstance(prior_row.payload, dict) else {}
        observed_at = parse_iso_datetime(meta.get("observed_at")) or parse_iso_datetime(meta.get("published_at"))
        if observed_at is None and quality == "seed":
            observed_at = datetime.fromisoformat(DEFAULT_MARKET_SEED_AS_OF).replace(tzinfo=timezone.utc)
        if not should_persist_snapshot(
            quality=quality,
            value=float(value),
            has_prior=has_prior,
            observed_at=observed_at,
            prior_value=float(prior_row.value) if prior_row is not None else None,
            prior_observed_at=parse_iso_datetime(prior_payload.get("observed_at"))
            or (_ensure_utc_datetime(prior_row.as_of) if prior_row is not None else None),
            prior_quality=snapshot_quality(prior_payload) if prior_row is not None else None,
        ):
            continue
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
                    "observed_at": isoformat_z(observed_at) if observed_at is not None else None,
                    "published_at": meta.get("published_at"),
                    "quote_kind": meta.get("quote_kind"),
                    "product_id": meta.get("product_id"),
                    "source": meta.get("source"),
                    "input_observed_at": meta.get("input_observed_at"),
                },
            )
        )

    db.commit()
    return snapshot_time


def _latest_market_snapshots_by_metric(db: Session) -> dict[str, MarketSnapshot]:
    """Load the best snapshot per metric: quality first, then observation date.

    Fetch-time fallback rows must not outrank a dated observed quote.
    """
    latest_by_metric: dict[str, MarketSnapshot] = {}
    for metric in DEFAULT_MARKET_METRICS:
        metric_key = str(metric["metric_key"])
        rows = list(
            db.scalars(
                select(MarketSnapshot)
                .where(MarketSnapshot.metric_key == metric_key)
                .order_by(MarketSnapshot.as_of.desc(), MarketSnapshot.id.desc())
                .limit(50)
            ).all()
        )
        if not rows:
            continue

        def _rank(row: MarketSnapshot) -> tuple[int, float]:
            payload = row.payload if isinstance(row.payload, dict) else {}
            quality = snapshot_quality(payload)
            as_of = _ensure_utc_datetime(row.as_of)
            return (QUALITY_RANK.get(quality, 99), -as_of.timestamp())

        latest_by_metric[metric_key] = sorted(rows, key=_rank)[0]
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
            "quality": "derived",
            "quote_kind": "futures",
            "product_id": "Yahoo BZ=F",
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
            "quality": "derived",
            "quote_kind": "spot",
            "product_id": "FRED DJFUELUSGULF",
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
                "quality": "derived",
                "quote_kind": "proxy",
                "product_id": "Brent-scaled EU jet proxy",
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
                "quality": "derived",
                "quote_kind": "proxy",
                "product_id": "Yahoo CO2.L scaled EUA proxy",
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
            "quality": "derived",
            "quote_kind": "proxy",
            "product_id": "Brent-inverse Germany premium proxy",
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


def _metric_unit(metric_key: str) -> str:
    for item in DEFAULT_MARKET_METRICS:
        if item["metric_key"] == metric_key:
            return str(item["unit"])
    return ""


def _quote_age_limits(detail_key: str) -> tuple[int, int]:
    policy = METRIC_QUOTE_AGE_DAYS.get(detail_key) or {
        "max_age_days": 10,
        "stale_limit_days": DEFAULT_STALE_LIMIT_DAYS,
    }
    return int(policy["max_age_days"]), int(policy["stale_limit_days"])


def _age_days(observed: datetime | None, now: datetime) -> float | None:
    if observed is None:
        return None
    delta = _ensure_utc_datetime(now) - _ensure_utc_datetime(observed)
    return max(0.0, delta.total_seconds() / 86400.0)


def _detail_observation(detail: dict[str, object]) -> datetime | None:
    return (
        parse_iso_datetime(detail.get("as_of"))
        or parse_iso_datetime(detail.get("observed_at"))
        or parse_iso_datetime(detail.get("published_at"))
    )


def _is_seed_detail(detail: dict[str, object]) -> bool:
    status = str(detail.get("status") or "").strip().lower()
    quality = str(detail.get("quality") or "").strip().lower()
    source = str(detail.get("source") or "").strip().lower()
    return status == "seed" or quality == "seed" or source == "seed-baseline"


def _copy_source_context(detail: dict[str, object]) -> dict[str, object]:
    source_name = str(detail.get("source") or "unavailable")
    context = SOURCE_CONTEXT.get(
        source_name,
        {
            "region": "global",
            "market_scope": "unknown",
            "lag_minutes": None,
            "confidence_score": 0.0,
            "note": "Source context not classified yet.",
        },
    )
    return {
        "source": source_name,
        "region": detail.get("region") or context["region"],
        "market_scope": detail.get("market_scope") or context["market_scope"],
        "lag_minutes": detail.get("lag_minutes") if detail.get("lag_minutes") is not None else context["lag_minutes"],
        "confidence_score": float(detail.get("confidence_score") if detail.get("confidence_score") is not None else context["confidence_score"]),
        "note": detail.get("note") or context["note"],
        "quote_kind": detail.get("quote_kind"),
        "product_id": detail.get("product_id"),
        "error": detail.get("error"),
        "cbam_eur": detail.get("cbam_eur"),
        "usd_per_eur": detail.get("usd_per_eur"),
        "raw_usd_per_metric_ton": detail.get("raw_usd_per_metric_ton"),
        "raw_eur_per_t": detail.get("raw_eur_per_t"),
        "usd_per_t": detail.get("usd_per_t"),
        "fetched_at": detail.get("fetched_at") or isoformat_z(utcnow()),
    }


def _public_detail(
    detail_key: str,
    *,
    status: str,
    value: float | None,
    observed: datetime | None,
    source_fields: dict[str, object],
    method: str | None,
    note: str | None,
    now: datetime,
) -> dict[str, object]:
    metric_key = SOURCE_DETAIL_TO_METRIC_KEY[detail_key]
    if status == "missing":
        value = None
        observed = None
        method = None
    quality = {"live": "observed", "stale": "stale", "estimated": "derived", "missing": "missing"}[status]
    as_of_text = isoformat_z(observed) if observed is not None else None
    published = {
        **source_fields,
        "status": status,
        "value": value,
        "unit": _metric_unit(metric_key),
        "as_of": as_of_text,
        "observed_at": as_of_text,
        "method": method,
        "quality": quality,
        "fallback_used": status != "live",
        "fetched_at": source_fields.get("fetched_at") or isoformat_z(now),
    }
    if note:
        published["note"] = note
    return published


def _last_real_snapshot(
    db: Session,
    metric_key: str,
    *,
    now: datetime,
    stale_limit_days: int,
) -> MarketSnapshot | None:
    cutoff = _ensure_utc_datetime(now) - timedelta(days=stale_limit_days)
    rows = list(
        db.scalars(
            select(MarketSnapshot)
            .where(MarketSnapshot.metric_key == metric_key)
            .order_by(MarketSnapshot.as_of.desc(), MarketSnapshot.id.desc())
            .limit(40)
        ).all()
    )
    for row in rows:
        payload = row.payload if isinstance(row.payload, dict) else {}
        if snapshot_quality(payload) not in REAL_OBSERVATION_QUALITIES:
            continue
        observed = parse_iso_datetime(payload.get("observed_at")) or _ensure_utc_datetime(row.as_of)
        if observed < cutoff:
            continue
        return row
    return None


def _direct_fetch_succeeded(detail: dict[str, object]) -> bool:
    if _is_seed_detail(detail):
        return False
    status = str(detail.get("status") or "").strip().lower()
    quality = str(detail.get("quality") or "").strip().lower()
    source = str(detail.get("source") or "")
    if status in {"estimated", "missing", "error", "fallback", "seed", "stale"}:
        return False
    if quality in {"derived", "seed", "missing"}:
        return False
    if source in {"brent-derived", "eua+ecb", "seed-baseline"}:
        return False
    if detail.get("value") is None:
        return False
    return status in {"ok", "live"}


def _classify_direct_detail(
    db: Session,
    detail_key: str,
    raw: dict[str, object] | None,
    *,
    now: datetime,
) -> dict[str, object]:
    detail = dict(raw or {})
    fields = _copy_source_context(detail)
    max_age, stale_limit = _quote_age_limits(detail_key)
    metric_key = SOURCE_DETAIL_TO_METRIC_KEY[detail_key]
    observed = _detail_observation(detail)
    age = _age_days(observed, now)
    value = detail.get("value")

    if _direct_fetch_succeeded(detail) and observed is not None and age is not None:
        number = float(value)  # type: ignore[arg-type]
        if age <= max_age:
            return _public_detail(
                detail_key,
                status="live",
                value=number,
                observed=observed,
                source_fields=fields,
                method=None,
                note=str(fields.get("note") or ""),
                now=now,
            )
        if age <= stale_limit:
            return _public_detail(
                detail_key,
                status="stale",
                value=number,
                observed=observed,
                source_fields=fields,
                method=None,
                note="外部源返回了真实观测，但已超过该指标的 live 窗口。",
                now=now,
            )

    if str(detail.get("status") or "").lower() == "stale" and not _is_seed_detail(detail) and value is not None and observed is not None and age is not None and age <= stale_limit:
        return _public_detail(
            detail_key,
            status="stale",
            value=float(value),
            observed=observed,
            source_fields=fields,
            method=None,
            note=str(detail.get("note") or "沿用此前真实观测。"),
            now=now,
        )

    row = _last_real_snapshot(db, metric_key, now=now, stale_limit_days=stale_limit)
    if row is not None:
        payload = row.payload if isinstance(row.payload, dict) else {}
        observed_at = parse_iso_datetime(payload.get("observed_at")) or _ensure_utc_datetime(row.as_of)
        prior_fields = _copy_source_context(
            {
                "source": payload.get("source") or detail.get("source") or row.source_key,
                "region": detail.get("region"),
                "market_scope": detail.get("market_scope"),
                "quote_kind": payload.get("quote_kind") or detail.get("quote_kind"),
                "product_id": payload.get("product_id") or detail.get("product_id"),
                "note": payload.get("note"),
            }
        )
        return _public_detail(
            detail_key,
            status="stale",
            value=float(row.value),
            observed=observed_at,
            source_fields=prior_fields,
            method=None,
            note="本次刷新未取得新值，沿用数据库中此前的真实抓取。",
            now=now,
        )

    return _public_detail(
        detail_key,
        status="missing",
        value=None,
        observed=None,
        source_fields=fields,
        method=None,
        note=str(detail.get("note") or "没有可用的实时或未过期真实观测。"),
        now=now,
    )


def _oldest_as_of(*details: dict[str, object]) -> datetime | None:
    return earliest_datetime(*(detail.get("as_of") or detail.get("observed_at") for detail in details))


def _estimate_from_inputs(
    detail_key: str,
    *,
    inputs: list[dict[str, object]],
    value: float,
    method: str,
    source: str,
    now: datetime,
    base: dict[str, object],
) -> dict[str, object]:
    if any(str(item.get("status") or "") == "missing" or item.get("value") is None for item in inputs):
        return _public_detail(
            detail_key,
            status="missing",
            value=None,
            observed=None,
            source_fields=base,
            method=None,
            note="推导输入缺失，结果也为缺失。",
            now=now,
        )
    observed = _oldest_as_of(*inputs)
    fields = _copy_source_context({**base, "source": source})
    return _public_detail(
        detail_key,
        status="estimated",
        value=value,
        observed=observed,
        source_fields=fields,
        method=method,
        note=method,
        now=now,
    )


def _apply_public_quote_policy(
    db: Session,
    sources: dict[str, object] | None,
    *,
    now: datetime | None = None,
) -> tuple[dict[str, float | None], dict[str, dict[str, object]]]:
    """Map a refresh payload onto live/stale/estimated/missing. Seeds never become values."""
    clock = _ensure_utc_datetime(now or utcnow())
    raw_sources = sources if isinstance(sources, dict) else {}
    published: dict[str, dict[str, object]] = {}
    for detail_key in ("brent", "jet", "ecb", "eu_ets", "germany_premium"):
        raw = raw_sources.get(detail_key)
        published[detail_key] = _classify_direct_detail(
            db,
            detail_key,
            raw if isinstance(raw, dict) else {},
            now=clock,
        )

    for detail_key in ("rotterdam_jet_fuel", "jet_eu_proxy"):
        raw = raw_sources.get(detail_key)
        direct = _classify_direct_detail(
            db,
            detail_key,
            raw if isinstance(raw, dict) else {},
            now=clock,
        )
        if direct["status"] in {"live", "stale"}:
            published[detail_key] = direct
            continue
        brent = published["brent"]
        brent_value = brent.get("value")
        if brent["status"] in {"live", "stale"} and isinstance(brent_value, (int, float)):
            derived = _round(
                _derive_jet_eu_proxy_usd_per_l_from_brent(float(brent_value)),
                3,
            )
            method = ROTTERDAM_FROM_BRENT_METHOD if detail_key == "rotterdam_jet_fuel" else JET_EU_FROM_BRENT_METHOD
            published[detail_key] = _estimate_from_inputs(
                detail_key,
                inputs=[brent],
                value=derived,
                method=method,
                source="brent-derived",
                now=clock,
                base=direct,
            )
        else:
            published[detail_key] = direct

    carbon_raw = raw_sources.get("carbon")
    carbon_direct = _classify_direct_detail(
        db,
        "carbon",
        carbon_raw if isinstance(carbon_raw, dict) else {},
        now=clock,
    )
    eu_ets = published["eu_ets"]
    fx = published["ecb"]
    eu_value = eu_ets.get("value")
    fx_value = fx.get("value")
    inputs_ready = (
        eu_ets["status"] in {"live", "stale"}
        and fx["status"] in {"live", "stale"}
        and isinstance(eu_value, (int, float))
        and isinstance(fx_value, (int, float))
    )
    if carbon_direct["status"] == "live":
        published["carbon"] = carbon_direct
    elif inputs_ready:
        published["carbon"] = _estimate_from_inputs(
            "carbon",
            inputs=[eu_ets, fx],
            value=_round(float(eu_value) * float(fx_value), 2),
            method=CARBON_FROM_EUA_FX_METHOD,
            source="eua+ecb",
            now=clock,
            base=carbon_direct,
        )
    else:
        published["carbon"] = carbon_direct

    values: dict[str, float | None] = {}
    for detail_key, detail in published.items():
        metric_key = SOURCE_DETAIL_TO_METRIC_KEY[detail_key]
        if detail.get("status") == "missing" or detail.get("value") is None:
            detail["value"] = None
            values[metric_key] = None
        else:
            values[metric_key] = float(detail["value"])  # type: ignore[arg-type]
    return values, published


def _public_overall_status(published: dict[str, dict[str, object]]) -> str:
    statuses = [str(item.get("status") or "missing") for item in published.values()]
    if statuses and all(status == "live" for status in statuses):
        return "ok"
    if any(status == "live" for status in statuses):
        return "degraded"
    if any(status in {"stale", "estimated"} for status in statuses):
        return "degraded"
    return "error"


def _status_counts(published: dict[str, dict[str, object]]) -> dict[str, int]:
    counts = {status: 0 for status in PUBLIC_QUOTE_STATUSES}
    for detail in published.values():
        status = str(detail.get("status") or "missing")
        if status not in counts:
            status = "missing"
        counts[status] += 1
    return counts


def _market_assumptions() -> dict[str, MarketAssumption]:
    assumptions: dict[str, MarketAssumption] = {}
    for item in DEFAULT_MARKET_METRICS:
        assumptions[str(item["metric_key"])] = MarketAssumption(
            value=float(item["value"]),
            unit=str(item["unit"]),
            kind="assumption",
            as_of=DEFAULT_MARKET_SEED_AS_OF,
            note="Workbench default only. Not a market observation.",
        )
    return assumptions


def _materialize_public_details(
    existing: dict[str, MarketSourceDetail],
    published: dict[str, dict[str, object]],
    *,
    refreshed_at: datetime,
) -> dict[str, MarketSourceDetail]:
    merged: dict[str, MarketSourceDetail] = {}
    for key, raw in published.items():
        base = existing.get(key)
        as_of = parse_iso_datetime(raw.get("as_of") or raw.get("observed_at"))
        status = str(raw.get("status") or "missing")
        value = None if status == "missing" or raw.get("value") is None else float(raw["value"])  # type: ignore[arg-type]
        updates: dict[str, object] = {
            "source": str(raw.get("source") or (base.source if base else "unavailable")),
            "status": status,
            "value": value,
            "unit": str(raw.get("unit") or _metric_unit(SOURCE_DETAIL_TO_METRIC_KEY[key])),
            "as_of": as_of,
            "observed_at": as_of,
            "fetched_at": parse_iso_datetime(raw.get("fetched_at")) or _ensure_utc_datetime(refreshed_at),
            "method": str(raw["method"]) if raw.get("method") else None,
            "note": str(raw.get("note") or (base.note if base and base.note else "") or ""),
            "quality": str(raw.get("quality") or "missing"),
            "fallback_used": status != "live",
            "region": str(raw.get("region") or (base.region if base else "global")),
            "market_scope": str(raw.get("market_scope") or (base.market_scope if base else "unavailable")),
            "confidence_score": float(
                raw.get("confidence_score") if raw.get("confidence_score") is not None else (base.confidence_score if base else 0.0)
            ),
            "lag_minutes": int(raw["lag_minutes"]) if raw.get("lag_minutes") is not None else (base.lag_minutes if base else None),
        }
        if base is not None:
            merged[key] = base.model_copy(update=updates)
            continue
        merged[key] = MarketSourceDetail(
            source=str(updates["source"]),
            status=status,
            value=value,
            unit=str(updates["unit"]),
            as_of=as_of,
            method=updates["method"] if isinstance(updates["method"], str) else None,
            error=_public_source_error(status, status != "live", raw.get("error")),
            note=str(updates["note"]) or None,
            region=str(updates["region"]),
            market_scope=str(updates["market_scope"]),
            lag_minutes=updates["lag_minutes"] if isinstance(updates["lag_minutes"], int) else None,
            confidence_score=float(updates["confidence_score"]),
            fallback_used=status != "live",
            quality=str(updates["quality"]),
            observed_at=as_of,
            fetched_at=updates["fetched_at"] if isinstance(updates["fetched_at"], datetime) else _ensure_utc_datetime(refreshed_at),
            cbam_eur=float(raw["cbam_eur"]) if raw.get("cbam_eur") is not None else None,
            usd_per_eur=float(raw["usd_per_eur"]) if raw.get("usd_per_eur") is not None else None,
            raw_usd_per_metric_ton=float(raw["raw_usd_per_metric_ton"]) if raw.get("raw_usd_per_metric_ton") is not None else None,
            raw_eur_per_t=float(raw["raw_eur_per_t"]) if raw.get("raw_eur_per_t") is not None else None,
            usd_per_t=float(raw["usd_per_t"]) if raw.get("usd_per_t") is not None else None,
            quote_kind=str(raw["quote_kind"]) if raw.get("quote_kind") is not None else None,
            product_id=str(raw["product_id"]) if raw.get("product_id") is not None else None,
        )
    return merged


def _fetch_bytes(url: str, timeout_s: float | None = None) -> bytes:
    effective_timeout_s = timeout_s if timeout_s is not None else _market_source_timeout_seconds()
    response = httpx.get(
        url,
        timeout=effective_timeout_s,
        headers={"User-Agent": "JetScope API/0.1 (+fastapi vertical slice)"},
        follow_redirects=True,
    )
    response.raise_for_status()
    return response.content


def _excel_serial_to_datetime(serial: float) -> datetime:
    return EXCEL_SERIAL_EPOCH + timedelta(days=float(serial))


def _xlsx_cell_map(payload: bytes) -> dict[int, dict[int, str]]:
    import zipfile
    from xml.etree import ElementTree as ET

    ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    with zipfile.ZipFile(__import__("io").BytesIO(payload)) as workbook:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            root = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
            for item in root.findall(f"{ns}si"):
                shared.append("".join(text.text or "" for text in item.iter(f"{ns}t")))
        sheet_name = next((name for name in workbook.namelist() if name.startswith("xl/worksheets/sheet")), None)
        if sheet_name is None:
            raise ValueError("EUA auction workbook has no worksheet")
        sheet = ET.fromstring(workbook.read(sheet_name))
    rows: dict[int, dict[int, str]] = {}

    def column_index(ref: str) -> tuple[int, int]:
        letters = ""
        digits = ""
        for char in ref:
            if char.isalpha():
                letters += char
            elif char.isdigit():
                digits += char
        index = 0
        for char in letters:
            index = index * 26 + ord(char.upper()) - 64
        return index, int(digits or "0")

    for cell in sheet.iter(f"{ns}c"):
        ref = cell.attrib.get("r")
        if not ref:
            continue
        column, row_number = column_index(ref)
        node = cell.find(f"{ns}v")
        if node is None or node.text is None:
            continue
        if cell.attrib.get("t") == "s":
            value = shared[int(node.text)]
        else:
            value = node.text
        rows.setdefault(row_number, {})[column] = value
    return rows


def _parse_eex_eua_auction_xlsx(payload: bytes) -> tuple[float, datetime, str]:
    """Latest successful EEX primary auction clearing price from the public workbook."""
    rows = _xlsx_cell_map(payload)
    header_row = None
    columns: dict[str, int] = {}
    for row_number, cells in rows.items():
        labels = {text.strip(): column for column, text in cells.items()}
        date_column = next((column for label, column in labels.items() if label == "Date"), None)
        price_column = next((column for label, column in labels.items() if label.startswith("Auction Price")), None)
        status_column = next((column for label, column in labels.items() if label == "Status"), None)
        name_column = next((column for label, column in labels.items() if label == "Auction Name"), None)
        if date_column and price_column and status_column:
            header_row = row_number
            columns = {
                "date": date_column,
                "price": price_column,
                "status": status_column,
                "name": name_column or 0,
            }
            break
    if header_row is None:
        raise ValueError("EUA auction workbook is missing Date/Auction Price/Status headers")

    latest: tuple[datetime, float, str] | None = None
    for row_number, cells in rows.items():
        if row_number <= header_row:
            continue
        status = str(cells.get(columns["status"]) or "").strip().lower()
        if status != "successful":
            continue
        try:
            observed = _excel_serial_to_datetime(float(cells[columns["date"]]))
            price = float(cells[columns["price"]])
        except (KeyError, TypeError, ValueError):
            continue
        if not 1.0 <= price <= 500.0:
            continue
        auction_name = str(cells.get(columns["name"]) or "EEX EUA primary auction")
        if latest is None or observed > latest[0]:
            latest = (observed, price, auction_name)
    if latest is None:
        raise ValueError("EUA auction workbook has no successful clearing price")
    observed, price, auction_name = latest
    return price, observed, auction_name


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
        _public_values, published = _apply_public_quote_policy(db, details.get("sources", {}))
        del _public_values
        details["sources"] = published
        overall = _public_overall_status(published)
        persist_values = {
            SOURCE_DETAIL_TO_METRIC_KEY[detail_key]: float(detail["value"])
            for detail_key, detail in published.items()
            if detail.get("status") in {"live", "estimated"} and detail.get("value") is not None
        }
        refreshed_at = _persist_market_snapshot_set(
            db,
            persist_values,
            source_status=overall,
            sources=published,
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
    if latest_by_metric:
        generated_at = max(row.as_of for row in latest_by_metric.values())
    else:
        generated_at = utcnow()

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
        # Rows carry the market's observation date and are skipped when a quote has
        # not moved, so their as_of says nothing about when this set was produced.
        generated_at = refreshed_at

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

    for metric_key, row in latest_by_metric.items():
        detail_key = METRIC_KEY_TO_DETAIL_KEY.get(metric_key)
        if not detail_key:
            continue
        payload = row.payload if isinstance(row.payload, dict) else {}
        payload_quality = snapshot_quality(payload)
        payload_observed = parse_iso_datetime(payload.get("observed_at")) or parse_iso_datetime(
            payload.get("published_at")
        )
        if payload_quality == "seed" and payload_observed is None:
            payload_observed = _ensure_utc_datetime(row.as_of)
        elif payload_quality in UNKNOWN_QUALITIES:
            payload_observed = parse_iso_datetime(payload.get("observed_at"))
        overlay = {
            "value": float(row.value),
            "quality": payload_quality,
            "observed_at": payload_observed,
            "published_at": parse_iso_datetime(payload.get("published_at")),
            "quote_kind": payload.get("quote_kind"),
            "product_id": payload.get("product_id"),
        }
        existing = typed_source_details.get(detail_key)
        if existing is not None:
            typed_source_details[detail_key] = existing.model_copy(
                update={
                    key: value
                    for key, value in overlay.items()
                    if value is not None or key in {"value", "quality", "observed_at"}
                }
            )

    classified_details: dict[str, MarketSourceDetail] = {}
    for key, detail in typed_source_details.items():
        classified = classify_quote_freshness(
            quality=str(detail.quality or "unknown"),
            observed_at=detail.observed_at,
            fetched_at=detail.fetched_at,
            lag_minutes=detail.lag_minutes,
            now=utcnow(),
        )
        freshness = quote_freshness(
            quality=classified,
            observed_at=detail.observed_at,
            lag_minutes=detail.lag_minutes,
            now=utcnow(),
        )
        updates = {}
        if classified != detail.quality:
            updates["quality"] = classified
        if getattr(detail, "freshness", None) != freshness:
            updates["freshness"] = freshness
        classified_details[key] = detail.model_copy(update=updates) if updates else detail
    typed_source_details = classified_details

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

    public_values, published = _apply_public_quote_policy(
        db,
        source_details if isinstance(source_details, dict) else {},
        now=utcnow(),
    )
    values = public_values
    typed_source_details = _materialize_public_details(
        typed_source_details,
        published,
        refreshed_at=refreshed_at,
    )
    if latest_run is None:
        # A produced book with no refresh run is degraded, not an empty error.
        # Readiness treats overall "error" as a blocker; missing quotes stay
        # on each metric instead of being filled with seeds.
        overall_status = "degraded"
    if freshness_minutes >= STALE_SNAPSHOT_SOFT_MINUTES and typed_source_details:
        recapped: dict[str, MarketSourceDetail] = {}
        for key, detail in typed_source_details.items():
            if detail.status != "live":
                recapped[key] = detail.model_copy(
                    update={
                        "confidence_score": min(float(detail.confidence_score), STALE_SOURCE_CONFIDENCE_CAP)
                    }
                )
            else:
                recapped[key] = detail
        typed_source_details = recapped

    counts = _status_counts(published)
    total_quotes = sum(counts.values())
    non_live = total_quotes - counts.get("live", 0)
    confidence_values = [detail.confidence_score for detail in typed_source_details.values()]
    confidence = _round(sum(confidence_values) / len(confidence_values), 3) if confidence_values else 1.0
    fallback_rate = _round((non_live / total_quotes) * 100.0, 2) if total_quotes else 0.0
    is_fallback = non_live > 0

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
            is_fallback=is_fallback,
            status_counts=counts,
            quote_coverage_rate=quote_coverage_rate,
            fetched_at=_ensure_utc_datetime(refreshed_at),
        ),
        values=values,
        source_details=typed_source_details,
        assumptions=_market_assumptions(),
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

    reasons: list[str] = []
    core_status = {"jet": "missing", "brent": "missing"}
    if runs:
        _core_values, core_published = _apply_public_quote_policy(
            db,
            runs[0].sources if isinstance(runs[0].sources, dict) else {},
            now=now,
        )
        del _core_values
        for name in CORE_HEALTH_DETAILS:
            core_status[name] = str(core_published.get(name, {}).get("status") or "missing")

    task_ok = False
    if latest is None:
        reasons.append("no_refresh_run")
        note = "No market refresh runs recorded yet. Start API with refresh loop or POST /v1/market/refresh."
    elif latest.source_status == "error" or latest.ingest == "seed":
        reasons.append("refresh_task_failed" if latest.source_status == "error" else "refresh_was_seed")
        note = "Latest refresh did not succeed."
    elif interval > 0 and age_seconds is not None and age_seconds > interval * 2:
        reasons.append("refresh_task_overdue")
        note = f"Latest refresh is stale (age {age_seconds}s > 2× interval {interval}s)."
    else:
        task_ok = True
        coverage_pct = f"{quote_coverage_rate:.0%}" if quote_coverage_rate is not None else "n/a"
        note = (
            "Refresh loop is producing snapshots. "
            f"Task success is not quote coverage (latest quote coverage {coverage_pct})."
        )

    for name in CORE_HEALTH_DETAILS:
        status = core_status[name]
        if status not in {"live", "stale"}:
            reasons.append(f"{name}_{status}")
    healthy = task_ok and not any(item.startswith("jet_") or item.startswith("brent_") for item in reasons)
    if not healthy and task_ok:
        note = "Latest refresh ran, but core jet/brent quotes are not live or stale: " + ", ".join(reasons)

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
        reasons=reasons,
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
    return snapshot_quality(payload if isinstance(payload, dict) else None)


def _series_fields(payload: object, source_key: str | None, unit: str) -> dict[str, str | None]:
    body = payload if isinstance(payload, dict) else {}
    return {
        "quality": _snapshot_quality(body),
        "source": str(body.get("source") or source_key or "") or None,
        "quote_kind": str(body["quote_kind"]) if body.get("quote_kind") else None,
        "product_id": str(body["product_id"]) if body.get("product_id") else None,
        "unit": unit,
    }


HistoryRow = tuple[datetime, float, str, str, str | None, str | None, str | None]


def _daily_aggregate(rows: list[HistoryRow]) -> list[HistoryRow]:
    by_day: dict[str, HistoryRow] = {}
    for as_of, value, unit, quality, source, quote_kind, product_id in rows:
        day_key = _ensure_utc_datetime(as_of).date().isoformat()
        by_day[day_key] = (
            _ensure_utc_datetime(as_of),
            value,
            unit,
            quality,
            source,
            quote_kind,
            product_id,
        )
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

    def _load_metric_rows(metric_key: str) -> list[HistoryRow]:
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
        rows: list[HistoryRow] = []
        for as_of, value, unit, payload, source_key in db.execute(statement).all():
            fields = _series_fields(payload, source_key, str(unit))
            rows.append(
                (
                    _ensure_utc_datetime(as_of),
                    float(value),
                    str(unit),
                    str(fields["quality"] or "unknown"),
                    fields["source"],
                    fields["quote_kind"],
                    fields["product_id"],
                )
            )
        aggregated = _daily_aggregate(rows)
        non_seed = [row for row in aggregated if row[3] != "seed"]
        return non_seed or aggregated

    def _load_latest_row(metric_key: str) -> HistoryRow | None:
        row = db.scalar(
            select(MarketSnapshot)
            .where(MarketSnapshot.metric_key == metric_key)
            .order_by(MarketSnapshot.as_of.desc(), MarketSnapshot.id.desc())
            .limit(1)
        )
        if row is None:
            return None
        fields = _series_fields(row.payload, row.source_key, str(row.unit))
        return (
            _ensure_utc_datetime(row.as_of),
            float(row.value),
            str(row.unit),
            str(fields["quality"] or "unknown"),
            fields["source"],
            fields["quote_kind"],
            fields["product_id"],
        )

    def _load_history_rows() -> dict[str, list[HistoryRow]]:
        grouped: dict[str, list[HistoryRow]] = {}
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
    if not any(latest_by_metric.values()) and not rows_by_metric:
        return MarketHistoryResponse(generated_at=_ensure_utc_datetime(utcnow()), metrics={})

    def _row_series(row: HistoryRow) -> dict[str, str | None]:
        return {
            "quality": row[3],
            "source": row[4],
            "unit": row[2],
            "quote_kind": row[5],
            "product_id": row[6],
        }

    def _baseline_same_series(
        rows: list[HistoryRow],
        *,
        latest_as_of: datetime,
        latest_row: HistoryRow,
        days: int,
    ) -> float | None:
        target = latest_as_of - timedelta(days=days)
        latest_series = _row_series(latest_row)
        candidates = [
            row
            for row in rows
            if row[0] <= target and same_comparable_series(_row_series(row), latest_series)
        ]
        if not candidates:
            return None
        return float(candidates[-1][1])

    dated_rows = [row for row in list(latest_by_metric.values()) + [item for rows in rows_by_metric.values() for item in rows] if row is not None]
    generated_at = max(row[0] for row in dated_rows) if dated_rows else _ensure_utc_datetime(utcnow())
    windows = [1, 7, 30]

    metrics: dict[str, MarketMetricHistory] = {}
    for metric_key, latest_row in latest_by_metric.items():
        metric_rows = rows_by_metric.get(metric_key) or []
        if not metric_rows:
            unit = latest_row[2] if latest_row is not None else "unknown"
            metrics[metric_key] = MarketMetricHistory(
                metric_key=metric_key,
                unit=unit,
                latest_value=None,
                latest_as_of=None,
                change_pct_1d=None,
                change_pct_7d=None,
                change_pct_30d=None,
                points=[],
                quality=latest_row[3] if latest_row is not None else None,
            )
            continue
        series_rows = [row for row in metric_rows if row[3] in SIGNAL_QUALITIES]
        window_latest = series_rows[-1] if series_rows else metric_rows[-1]
        latest_as_of, latest_value, latest_unit, latest_quality, source, quote_kind, product_id = window_latest
        change_1d = _pct_change(
            latest_value,
            _baseline_same_series(metric_rows, latest_as_of=latest_as_of, latest_row=window_latest, days=1),
        )
        change_7d = _pct_change(
            latest_value,
            _baseline_same_series(metric_rows, latest_as_of=latest_as_of, latest_row=window_latest, days=7),
        )
        change_30d = _pct_change(
            latest_value,
            _baseline_same_series(metric_rows, latest_as_of=latest_as_of, latest_row=window_latest, days=30),
        )

        points = [
            MarketHistoryPoint(
                as_of=_ensure_utc_datetime(as_of),
                value=float(value),
                quality=quality,
                source=point_source,
                quote_kind=point_kind,
                product_id=point_product,
            )
            for as_of, value, _unit, quality, point_source, point_kind, point_product in metric_rows[-points_limit_per_metric:]
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
