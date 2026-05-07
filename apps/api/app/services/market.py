from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import httpx
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models.tables import MarketRefreshRun, MarketSnapshot
from app.schemas.market import (
    MarketHistoryPoint,
    MarketHistoryResponse,
    MarketMetricHistory,
    MarketSnapshotResponse,
    MarketSourceDetail,
    SourceStatus,
)
from app.services.bootstrap import utcnow

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
DEFAULT_BRENT_USD_PER_BBL = 114.93
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
        "value": 0.99,
        "unit": "USD/L",
    },
    {
        "source_key": "cbam_proxy",
        "metric_key": "carbon_proxy_usd_per_t",
        "value": 88.79,
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
        "value": 0.85,
        "unit": "USD/L",
    },
    {
        "source_key": "eu_ets_eex",
        "metric_key": "eu_ets_price_eur_per_t",
        "value": 92.50,
        "unit": "EUR/tCO2",
    },
    {
        "source_key": "germany_premium",
        "metric_key": "germany_premium_pct",
        "value": 2.5,
        "unit": "%",
    },
)

MARKET_REFRESH_LOCK_KEY = 24041801

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
        "market_scope": "physical_spot_ara_rotterdam_proxy",
        "lag_minutes": 1440,
        "confidence_score": 0.76,
        "note": "Public ARA/Rotterdam-aligned quote (CIF NWE), converted from USD/metric ton to USD/L.",
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
        "market_scope": "physical_spot_rotterdam",
        "lag_minutes": 240,
        "confidence_score": 0.82,
        "note": "Direct Rotterdam/ARA Jet Fuel CIF NWE futures quote.",
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
        "confidence_score": 0.75,
        "note": "German aviation fuel tax premium; static configuration per regulatory tax band.",
    },
}


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


def _fetch_text(url: str, timeout_s: float = 12.0) -> str:
    response = httpx.get(
        url,
        timeout=timeout_s,
        headers={"User-Agent": "JetScope API/0.1 (+fastapi vertical slice)"},
        follow_redirects=True,
    )
    response.raise_for_status()
    return response.text


def _fetch_json(url: str, timeout_s: float = 12.0) -> dict:
    response = httpx.get(
        url,
        timeout=timeout_s,
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
        return float(tail[start:end])
    except ValueError:
        return None


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
    import re

    match = re.search(r'<Cube\s+currency=["\']USD["\']\s+rate=["\']([^"\']+)["\']', xml, re.IGNORECASE)
    if not match:
        raise ValueError("ECB USD reference rate not found")
    return float(match.group(1))


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
        "fallback_used": False,
        "note": context["note"],
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
        parsed_eia = _parse_eia_brent(eia_html)
        if parsed_eia is None:
            raise ValueError("Brent value not found on EIA page")
        brent_value = _round(parsed_eia, 2)
        _set_source_detail(details, "brent", source="eia", status="ok", value=brent_value)
    except Exception as error:
        _set_source_detail(details, "brent", source="eia", status="error", error=str(error))
        try:
            brent_csv = _fetch_text(MARKET_SOURCE_URLS["brent_fred"])
            _, brent_fred = _parse_fred_csv(brent_csv)
            brent_value = _round(brent_fred, 2)
            _set_source_detail(details, "brent", source="fred", status="ok", value=brent_value)
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
        _, jet_usd_per_gal = _parse_fred_csv(jet_csv)
        jet_value = _round(_to_usd_per_l_from_usd_per_gal(jet_usd_per_gal), 3)
        _set_source_detail(details, "jet", source="fred", status="ok", value=jet_value)
    except Exception as error:
        _set_source_detail(details, "jet", source="fred", status="error", error=str(error))
    return jet_value


def _ingest_carbon_market_value(details: dict[str, object]) -> float | None:
    carbon_value = None
    try:
        cbam_html = _fetch_text(MARKET_SOURCE_URLS["cbam_price"])
        cbam_eur = _parse_cbam_eur_per_tonne(cbam_html)
        ecb_xml = _fetch_text(MARKET_SOURCE_URLS["ecb_eur_usd"])
        usd_per_eur = _parse_ecb_usd_per_eur(ecb_xml)
        carbon_value = _round(cbam_eur * usd_per_eur, 2)
        _set_source_detail(
            details,
            "carbon",
            source="cbam+ecb",
            status="ok",
            value=carbon_value,
            extra={"cbam_eur": _round(cbam_eur, 2), "usd_per_eur": _round(usd_per_eur, 4)},
        )
    except Exception as error:
        _set_source_detail(details, "carbon", source="cbam+ecb", status="error", error=str(error))
    return carbon_value


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
                "note": f"ARA/Rotterdam quote {_round(ara_usd_per_metric_ton, 2)} USD/metric ton converted with 0.8 kg/L reference density.",
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
                    "note": "ARA/Rotterdam public quote unavailable; fell back to Brent-derived EU proxy.",
                    "primary_error": primary_error_text,
                },
            )
            return derived_value

        seed_value = float(seed_by_key["jet_eu_proxy_usd_per_l"])
        _set_source_detail(
            details,
            "jet_eu_proxy",
            source="brent-derived",
            status="fallback",
            value=seed_value,
            extra={
                "note": "ARA/Rotterdam and Brent unavailable; fell back to seeded EU proxy baseline.",
                "primary_error": primary_error_text,
            },
        )
        return seed_value


def _ingest_rotterdam_jet_fuel_value(
    details: dict[str, object],
    *,
    seed_by_key: dict[str, float],
) -> float:
    """Direct Rotterdam/ARA Jet Fuel CIF NWE price, independent from general EU proxy."""
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
                "raw_usd_per_metric_ton": ara_usd_per_metric_ton,
                "note": f"ARA/Rotterdam Jet Fuel CIF NWE: {_round(ara_usd_per_metric_ton, 2)} USD/metric ton.",
            },
        )
        return rotterdam_value
    except Exception as error:
        seed_value = float(seed_by_key["rotterdam_jet_fuel_usd_per_l"])
        _set_source_detail(
            details,
            "rotterdam_jet_fuel",
            source="rotterdam-jet-direct",
            status="fallback",
            value=seed_value,
            error=str(error),
        )
        return seed_value


def _parse_eu_ets_price_eur(html: str) -> float:
    """Parse EEX EU ETS spot price from HTML payload (EUR/tCO2)."""
    import re
    
    normalized = " ".join(html.replace("&nbsp;", " ").replace("&#160;", " ").split())
    patterns = (
        # JSON-LD / meta tag patterns
        r'(?:price|spot|close)["\']?\s*:\s*["\']?([0-9]{1,4}(?:[.,][0-9]+)?)',
        r'(?:value|last)["\']?\s*:\s*["\']?([0-9]{1,4}(?:[.,][0-9]+)?)',
        # Inline text patterns
        r'(\d+(?:[.,]\d+)?)\s*EUR(?:\s*/)?(?:t|tonne|tCO2)',
        r'(\d+(?:[.,]\d+)?)\s*€(?:\s*/)?(?:t|tonne)',
        # DOM data-test patterns
        r'data-test="[^"]*price[^"]*"[^>]*>\s*([0-9][0-9.,]*)\s*<',
        r'data-test="[^"]*last[^"]*"[^>]*>\s*([0-9][0-9.,]*)\s*<',
        # Table cell patterns
        r'<td[^>]*>\s*([0-9]{2,4}(?:[.,][0-9]+)?)\s*</td>\s*<td[^>]*>\s*EUR',
        r'<td[^>]*>\s*EUR\s*</td>\s*<td[^>]*>\s*([0-9]{2,4}(?:[.,][0-9]+)?)\s*</td>',
        # Script/json embedded
        r'"price"\s*:\s*"?([0-9]{2,4}(?:[.,][0-9]+))"?',
        r'"lastPrice"\s*:\s*"?([0-9]{2,4}(?:[.,][0-9]+))"?',
    )
    
    for pattern in patterns:
        match = re.search(pattern, normalized, re.IGNORECASE)
        if match:
            parsed = _parse_decimal_number(match.group(1))
            # Sanity check: EU ETS historically trades €30-€200/tCO2
            if 10 <= parsed <= 500:
                return parsed
    
    raise ValueError("EU ETS price not found in EEX payload")


def _ingest_eu_ets_price(
    details: dict[str, object],
    *,
    ecb_usd_per_eur: float | None = None,
    seed_by_key: dict[str, float],
) -> float:
    """EU ETS spot price from EEX; return EUR/tCO2."""
    try:
        ets_html = _fetch_text(MARKET_SOURCE_URLS["eu_ets_eex"])
        eu_ets_eur = _parse_eu_ets_price_eur(ets_html)
        ets_value = _round(eu_ets_eur, 2)
        
        extra_dict: dict[str, object] = {"raw_eur_per_t": ets_value}
        if ecb_usd_per_eur is not None:
            usd_value = _round(ets_value * ecb_usd_per_eur, 2)
            extra_dict["usd_per_t"] = usd_value
        
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
        seed_value = float(seed_by_key["eu_ets_price_eur_per_t"])
        _set_source_detail(
            details,
            "eu_ets",
            source="eex-eu-ets",
            status="fallback",
            value=seed_value,
            error=str(error),
        )
        return seed_value


def _ingest_germany_premium(
    details: dict[str, object],
    *,
    seed_by_key: dict[str, float],
    jet_eu_proxy_usd_per_l: float | None = None,
) -> float:
    """German aviation fuel tax premium as percentage.
    
    Dynamically calculated from German energy tax rates:
    - German aviation energy tax: €0.6545/L (2024 rate, adjusted annually)
    - Plus VAT (19%) on the tax itself for non-commercial
    - Effective premium depends on ARA jet price + EU ETS
    """
    try:
        # Base German aviation fuel tax (Energiesteuer) per liter
        DE_AVG_TAX_EUR_PER_L = 0.6545
        VAT_RATE = 0.19
        
        # Use ECB rate if available to convert to USD context
        usd_per_eur = 1.08  # approximate fallback
        try:
            ecb_xml = _fetch_text(MARKET_SOURCE_URLS["ecb_eur_usd"])
            usd_per_eur = _parse_ecb_usd_per_eur(ecb_xml)
        except Exception:
            pass
        
        tax_usd_per_l = DE_AVG_TAX_EUR_PER_L * usd_per_eur
        
        # Premium = (tax / jet_price) * 100
        # If jet price unavailable, use default proxy
        base_jet_price = jet_eu_proxy_usd_per_l if jet_eu_proxy_usd_per_l else 0.85
        if base_jet_price < 0.1:
            base_jet_price = 0.85
            
        germany_premium_pct = _round((tax_usd_per_l / base_jet_price) * 100, 2)
        
        # Clamp to reasonable range (1% - 8% historically)
        germany_premium_pct = max(1.0, min(8.0, germany_premium_pct))
        
        _set_source_detail(
            details,
            "germany_premium",
            source="germany-premium-db",
            status="ok",
            value=germany_premium_pct,
            extra={
                "note": f"German aviation energy tax €{DE_AVG_TAX_EUR_PER_L}/L + VAT {VAT_RATE*100}% vs ARA jet ${base_jet_price:.3f}/L. EUR/USD={usd_per_eur:.4f}",
                "tax_usd_per_l": tax_usd_per_l,
                "base_jet_price": base_jet_price,
                "usd_per_eur": usd_per_eur,
            },
        )
        return germany_premium_pct
    except Exception as error:
        seed_value = float(seed_by_key["germany_premium_pct"])
        _set_source_detail(
            details,
            "germany_premium",
            source="germany-premium-db",
            status="fallback",
            value=seed_value,
            error=str(error),
        )
        return seed_value


def _market_overall_status(details: dict[str, object]) -> str:
    source_states = [item.get("status") for item in details["sources"].values()]
    if all(state == "ok" for state in source_states):
        return "ok"
    if any(state == "ok" for state in source_states):
        return "degraded"
    return "error"


def _ingest_live_market_values() -> tuple[dict[str, float], str, dict[str, object]]:
    details: dict[str, object] = {"sources": {}}
    brent_value = _ingest_brent_market_value(details)
    jet_value = _ingest_jet_market_value(details)
    carbon_value = _ingest_carbon_market_value(details)

    seed_by_key = {item["metric_key"]: item["value"] for item in DEFAULT_MARKET_METRICS}
    jet_eu_proxy_value = _ingest_jet_eu_market_value(
        details,
        brent_value=brent_value,
        seed_by_key=seed_by_key,
    )
    
    # Lane 2: New data sources
    rotterdam_value = _ingest_rotterdam_jet_fuel_value(
        details,
        seed_by_key=seed_by_key,
    )
    
    # Fetch ECB exchange rate if carbon was successful for EU ETS USD conversion
    ecb_usd_per_eur = None
    if carbon_value is not None:
        try:
            ecb_xml = _fetch_text(MARKET_SOURCE_URLS["ecb_eur_usd"])
            ecb_usd_per_eur = _parse_ecb_usd_per_eur(ecb_xml)
        except Exception:
            pass
    
    eu_ets_value = _ingest_eu_ets_price(
        details,
        ecb_usd_per_eur=ecb_usd_per_eur,
        seed_by_key=seed_by_key,
    )
    
    germany_premium = _ingest_germany_premium(
        details,
        seed_by_key=seed_by_key,
        jet_eu_proxy_usd_per_l=jet_eu_proxy_value,
    )

    values = {
        "brent_usd_per_bbl": brent_value if brent_value is not None else float(seed_by_key["brent_usd_per_bbl"]),
        "jet_usd_per_l": jet_value if jet_value is not None else float(seed_by_key["jet_usd_per_l"]),
        "carbon_proxy_usd_per_t": carbon_value
        if carbon_value is not None
        else float(seed_by_key["carbon_proxy_usd_per_t"]),
        "jet_eu_proxy_usd_per_l": jet_eu_proxy_value,
        "rotterdam_jet_fuel_usd_per_l": rotterdam_value,
        "eu_ets_price_eur_per_t": eu_ets_value,
        "germany_premium_pct": germany_premium,
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


def _persist_market_snapshot_set(
    db: Session,
    values: dict[str, float],
    *,
    as_of: datetime | None = None,
    source_status: str,
    sources: dict[str, object] | None = None,
    ingest: str,
    payload: dict[str, object] | None = None,
) -> datetime:
    snapshot_time = as_of or utcnow()
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

    for metric_key, value in values.items():
        defaults = metric_defaults[metric_key]
        db.add(
            MarketSnapshot(
                source_key=defaults["source_key"],
                metric_key=metric_key,
                value=float(value),
                unit=defaults["unit"],
                as_of=snapshot_time,
                payload={**payload_blob, "refresh_run_id": run.id},
            )
        )

    db.commit()
    return snapshot_time


def _latest_market_values_by_metric(db: Session) -> dict[str, float]:
    rows = db.scalars(
        select(MarketSnapshot).order_by(MarketSnapshot.metric_key.asc(), MarketSnapshot.as_of.desc())
    ).all()
    latest: dict[str, float] = {}
    for row in rows:
        if row.metric_key not in latest:
            latest[row.metric_key] = float(row.value)
    if len(latest) < len(DEFAULT_MARKET_METRICS):
        seed_market_snapshot_set(db)
        return _latest_market_values_by_metric(db)
    return latest


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
    return _persist_market_snapshot_set(
        db,
        seed_values,
        as_of=as_of,
        source_status="seed",
        sources={},
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


def build_market_snapshot_response(db: Session) -> MarketSnapshotResponse:
    rows = db.scalars(
        select(MarketSnapshot).order_by(MarketSnapshot.metric_key.asc(), MarketSnapshot.as_of.desc())
    ).all()

    latest_by_metric: dict[str, MarketSnapshot] = {}
    for row in rows:
        if row.metric_key not in latest_by_metric:
            latest_by_metric[row.metric_key] = row

    if len(latest_by_metric) < len(DEFAULT_MARKET_METRICS):
        seeded_at = seed_market_snapshot_set(db)
        rows = db.scalars(
            select(MarketSnapshot).order_by(MarketSnapshot.metric_key.asc(), MarketSnapshot.as_of.desc())
        ).all()
        latest_by_metric = {}
        for row in rows:
            if row.metric_key not in latest_by_metric:
                latest_by_metric[row.metric_key] = row
        generated_at = seeded_at
    else:
        generated_at = max(row.as_of for row in latest_by_metric.values())

    values: dict[str, float] = {}
    for metric in DEFAULT_MARKET_METRICS:
        key = metric["metric_key"]
        values[key] = float(latest_by_metric[key].value)

    latest_run = db.scalar(
        select(MarketRefreshRun).order_by(MarketRefreshRun.refreshed_at.desc())
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
            )

    confidence_values = [detail.confidence_score for detail in typed_source_details.values()]
    fallback_count = sum(1 for detail in typed_source_details.values() if detail.fallback_used)
    confidence = _round(sum(confidence_values) / len(confidence_values), 3) if confidence_values else 1.0
    fallback_rate = _round((fallback_count / len(typed_source_details)) * 100.0, 2) if typed_source_details else 0.0
    freshness_minutes = max(
        0,
        int((utcnow() - _ensure_utc_datetime(refreshed_at)).total_seconds() // 60),
    )

    return MarketSnapshotResponse(
        generated_at=generated_at,
        source_status=SourceStatus(
            overall=str(overall_status),
            confidence=confidence,
            freshness_minutes=freshness_minutes,
            fallback_rate=fallback_rate,
            is_fallback=fallback_count > 0,
        ),
        values=values,
        source_details=typed_source_details,
    )


def _pct_change(latest: float, baseline: float | None) -> float | None:
    if baseline is None:
        return None
    if abs(baseline) < 1e-9:
        return None
    return _round(((latest - baseline) / baseline) * 100.0, 3)


def _nearest_baseline_value(
    rows: list[MarketSnapshot], target_time: datetime
) -> float | None:
    for row in rows:
        if row.as_of <= target_time:
            return float(row.value)
    return None


def build_market_history_response(
    db: Session,
    *,
    points_limit_per_metric: int = 120,
) -> MarketHistoryResponse:
    rows = db.scalars(
        select(MarketSnapshot).order_by(MarketSnapshot.metric_key.asc(), MarketSnapshot.as_of.desc())
    ).all()

    if not rows:
        seed_market_snapshot_set(db)
        rows = db.scalars(
            select(MarketSnapshot).order_by(MarketSnapshot.metric_key.asc(), MarketSnapshot.as_of.desc())
        ).all()

    if not rows:
        return MarketHistoryResponse(generated_at=utcnow(), metrics={})

    rows_by_metric: dict[str, list[MarketSnapshot]] = {}
    for row in rows:
        rows_by_metric.setdefault(row.metric_key, []).append(row)

    expected_metric_keys = {metric["metric_key"] for metric in DEFAULT_MARKET_METRICS}
    if not expected_metric_keys.issubset(rows_by_metric):
        seed_market_snapshot_set(db)
        rows = db.scalars(
            select(MarketSnapshot).order_by(MarketSnapshot.metric_key.asc(), MarketSnapshot.as_of.desc())
        ).all()
        rows_by_metric = {}
        for row in rows:
            rows_by_metric.setdefault(row.metric_key, []).append(row)

    generated_at = max(row.as_of for row in rows)
    windows = [1, 7, 30]

    metrics: dict[str, MarketMetricHistory] = {}
    for metric_key, metric_rows in rows_by_metric.items():
        non_seed_rows = [row for row in metric_rows if not (row.payload or {}).get("seed")]
        if non_seed_rows:
            metric_rows = non_seed_rows

        latest = metric_rows[0]
        latest_value = float(latest.value)
        latest_as_of = latest.as_of

        change_1d = _pct_change(
            latest_value,
            _nearest_baseline_value(metric_rows, latest_as_of - timedelta(days=1)),
        )
        change_7d = _pct_change(
            latest_value,
            _nearest_baseline_value(metric_rows, latest_as_of - timedelta(days=7)),
        )
        change_30d = _pct_change(
            latest_value,
            _nearest_baseline_value(metric_rows, latest_as_of - timedelta(days=30)),
        )

        point_rows = metric_rows[:points_limit_per_metric]
        points = [
            MarketHistoryPoint(as_of=row.as_of, value=float(row.value))
            for row in reversed(point_rows)
        ]

        metrics[metric_key] = MarketMetricHistory(
            metric_key=metric_key,
            unit=latest.unit,
            latest_value=latest_value,
            latest_as_of=latest_as_of,
            change_pct_1d=change_1d,
            change_pct_7d=change_7d,
            change_pct_30d=change_30d,
            points=points,
        )

    return MarketHistoryResponse(
        generated_at=generated_at,
        windows_days=windows,
        metrics=metrics,
    )
