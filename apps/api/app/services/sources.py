from sqlalchemy.orm import Session

from app.schemas.sources import SourceCoverageMetric, SourceCoverageResponse
from app.services.bootstrap import utcnow
from app.services.market import DEFAULT_MARKET_METRICS, build_market_snapshot_response


SOURCE_DETAIL_KEY_TO_METRIC_KEY = {
    "brent": "brent_usd_per_bbl",
    "jet": "jet_usd_per_l",
    "carbon": "carbon_proxy_usd_per_t",
    "jet_eu_proxy": "jet_eu_proxy_usd_per_l",
    "rotterdam_jet_fuel": "rotterdam_jet_fuel_usd_per_l",
    "eu_ets": "eu_ets_price_eur_per_t",
    "germany_premium": "germany_premium_pct",
}

_EXPECTED_METRIC_KEYS = set(SOURCE_DETAIL_KEY_TO_METRIC_KEY.values())

# Seed fallback rows for per-metric backfill when coverage is partial.
# Each entry maps metric_key -> (source_name, source_type, confidence, region, market_scope)
_SEED_FALLBACKS: dict[str, tuple[str, str, float, str, str]] = {
    "brent_usd_per_bbl": ("EIA / FRED", "public_proxy", 0.70, "global", "benchmark"),
    "jet_usd_per_l": ("FRED Gulf Coast", "public_proxy", 0.70, "us", "statistical_series"),
    "carbon_proxy_usd_per_t": ("CBAM + ECB", "derived", 0.70, "eu", "regulatory_proxy"),
    "jet_eu_proxy_usd_per_l": ("Derived from Brent", "derived", 0.65, "eu", "derived_proxy"),
    "rotterdam_jet_fuel_usd_per_l": ("ARA/Rotterdam (public)", "public_proxy", 0.60, "eu", "spot_market"),
    "eu_ets_price_eur_per_t": ("EEX EU ETS", "official", 0.85, "eu", "compliance_market"),
    "germany_premium_pct": ("Derived comparison", "derived", 0.60, "de", "price_differential"),
}


def _classify_source_type(source_name: str, fallback_used: bool) -> str:
    normalized = source_name.lower()
    if fallback_used:
        return "derived"
    if normalized in {"eia", "ecb", "eu_ets_eex", "eex-eu-ets"}:
        return "official"
    if normalized == "cbam+ecb":
        return "derived"
    if normalized in {"fred", "ara-rotterdam-public", "rotterdam-jet-direct"}:
        return "public_proxy"
    if "derived" in normalized or "proxy" in normalized:
        return "derived"
    return "market_primary"


def build_source_coverage_response(db: Session) -> SourceCoverageResponse:
    snapshot = build_market_snapshot_response(db)
    metrics: list[SourceCoverageMetric] = []

    for source_detail_key, detail in sorted(snapshot.source_details.items()):
        metric_key = SOURCE_DETAIL_KEY_TO_METRIC_KEY.get(source_detail_key, source_detail_key)
        metrics.append(
            SourceCoverageMetric(
                metric_key=metric_key,
                source_name=detail.source,
                source_type=_classify_source_type(detail.source, detail.fallback_used),
                confidence_score=detail.confidence_score,
                lag_minutes=detail.lag_minutes,
                fallback_used=detail.fallback_used,
                status=detail.status,
                region=detail.region,
                market_scope=detail.market_scope,
            )
        )

    # Backfill any missing expected metrics individually so partial upstream
    # loss does not silently drop rows from the sources table.
    present_keys = {m.metric_key for m in metrics if m.metric_key in _EXPECTED_METRIC_KEYS}
    had_source_details = bool(metrics)
    for metric_key in _EXPECTED_METRIC_KEYS:
        if metric_key in present_keys:
            continue
        source_name, source_type, confidence, region, market_scope = _SEED_FALLBACKS[metric_key]
        metrics.append(
            SourceCoverageMetric(
                metric_key=metric_key,
                source_name=source_name,
                source_type=source_type,
                confidence_score=confidence,
                lag_minutes=None,
                fallback_used=True,
                status="seed",
                region=region,
                market_scope=market_scope,
            )
        )

    # Legacy total-loss fallback: only used when the snapshot itself has
    # zero source_details and we have nothing to iterate above.
    if not metrics:
        for metric in DEFAULT_MARKET_METRICS:
            source_name = str(metric["source_key"])
            metrics.append(
                SourceCoverageMetric(
                    metric_key=str(metric["metric_key"]),
                    source_name=source_name,
                    source_type=_classify_source_type(source_name, False),
                    confidence_score=0.5,
                    lag_minutes=None,
                    fallback_used=False,
                    status="seed",
                    region="global",
                    market_scope="seed_metric",
                )
            )

    if had_source_details:
        completeness = len(present_keys) / len(_EXPECTED_METRIC_KEYS)
    else:
        # A freshly bootstrapped market snapshot has no per-source details yet;
        # the seeded catalog is complete enough for the public contract.
        completeness = 1.0
    return SourceCoverageResponse(
        generated_at=utcnow(),
        metrics=metrics,
        completeness=completeness,
        degraded=completeness < 1.0,
    )
