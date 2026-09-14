"""Quality-aware market quote selection and timestamp helpers.

Observed quotes, derived proxies, and seed baselines must not be mixed as if
they were the same market observation. Seed values never generate action signals.
Unknown/legacy rows are not treated as measured quotes.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Mapping

from sqlalchemy import select
from sqlalchemy.orm import Session

Quality = Literal[
    "observed",
    "stale",
    "derived",
    "seed",
    "unknown",
    "legacy",
    "unverified",
    "missing",
]
Freshness = Literal["current", "stale", "expired", "unverifiable", "not_applicable"]

QUALITY_RANK: dict[str, int] = {
    "observed": 0,
    "stale": 1,
    "derived": 2,
    "seed": 3,
    "unknown": 4,
    "legacy": 4,
    "unverified": 4,
    "missing": 5,
}

JET_CANDIDATES: tuple[tuple[str, str], ...] = (
    ("rotterdam_jet_fuel_usd_per_l", "rotterdam_jet_fuel"),
    ("jet_eu_proxy_usd_per_l", "jet_eu_proxy"),
    ("jet_usd_per_l", "jet"),
)

SIGNAL_QUALITIES = frozenset({"observed", "stale", "derived"})
COST_QUALITIES = SIGNAL_QUALITIES
UNKNOWN_QUALITIES = frozenset({"unknown", "legacy", "unverified"})
# A quote older than this multiple of its source lag is no longer usable.
STALE_USABLE_MULTIPLIER = 7
DEFAULT_LAG_MINUTES = 1440

METRIC_KEY_TO_DETAIL_KEY = {
    "brent_usd_per_bbl": "brent",
    "jet_usd_per_l": "jet",
    "carbon_proxy_usd_per_t": "carbon",
    "jet_eu_proxy_usd_per_l": "jet_eu_proxy",
    "rotterdam_jet_fuel_usd_per_l": "rotterdam_jet_fuel",
    "eu_ets_price_eur_per_t": "eu_ets",
    "germany_premium_pct": "germany_premium",
    "usd_per_eur": "ecb",
}


def ensure_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def isoformat_z(value: datetime) -> str:
    aware = ensure_utc(value)
    assert aware is not None
    return aware.isoformat().replace("+00:00", "Z")


def parse_iso_datetime(raw: object) -> datetime | None:
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return ensure_utc(raw)
    text = str(raw).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return ensure_utc(datetime.fromisoformat(text))
    except ValueError:
        return None


def earliest_datetime(*values: object) -> datetime | None:
    parsed = [parse_iso_datetime(value) for value in values]
    known = [item for item in parsed if item is not None]
    if not known:
        return None
    return min(known)


def snapshot_quality(payload: Mapping[str, Any] | None) -> Quality:
    """Classify a persisted snapshot. Missing quality is unknown, never observed."""
    if not isinstance(payload, Mapping):
        return "unknown"
    explicit = str(payload.get("quality") or "").strip().lower()
    if explicit in QUALITY_RANK:
        return explicit  # type: ignore[return-value]
    if payload.get("seed"):
        return "seed"
    if payload.get("legacy") or payload.get("unverified"):
        return "unverified"
    return "unknown"


def quality_from_detail(detail: Mapping[str, Any] | None) -> Quality:
    if not detail:
        return "missing"
    explicit = str(detail.get("quality") or "").strip().lower()
    if explicit in QUALITY_RANK:
        return explicit  # type: ignore[return-value]
    status = str(detail.get("status") or "").strip().lower()
    source = str(detail.get("source") or "").strip().lower()
    fallback_used = bool(detail.get("fallback_used"))
    if status in {"missing", "error"} and detail.get("value") is None:
        return "missing"
    if status == "missing":
        return "missing"
    if status == "seed" or source in {"seed-baseline"}:
        return "seed"
    if fallback_used or status in {"fallback", "seed"}:
        if "derived" in source or source in {"brent-derived", "cbam+ecb", "eua+ecb"}:
            return "derived"
        return "seed"
    if status == "stale":
        return "stale"
    if status == "ok":
        if "derived" in source or source in {"brent-derived"}:
            return "derived"
        return "observed"
    return "unknown"


def observation_from_detail(detail: Mapping[str, Any] | None) -> datetime | None:
    """Prefer a market quote date; derived quotes may only have input observations."""
    if not detail:
        return None
    observed = parse_iso_datetime(detail.get("observed_at")) or parse_iso_datetime(detail.get("published_at"))
    if observed is not None:
        return observed
    inputs = detail.get("input_observed_at")
    if isinstance(inputs, Mapping):
        return earliest_datetime(*inputs.values())
    return None


def quote_freshness(
    *,
    quality: str,
    observed_at: datetime | None,
    lag_minutes: int | None,
    now: datetime | None = None,
) -> Freshness:
    """Age of the input/quote date versus the source cadence."""
    ranked = quality if quality in QUALITY_RANK else "unknown"
    if ranked in {"seed", "missing"}:
        return "not_applicable"
    observed = ensure_utc(observed_at)
    if observed is None:
        if ranked in {"observed", "stale", "derived"}:
            return "unverifiable"
        return "not_applicable"
    clock = ensure_utc(now) or datetime.now(timezone.utc)
    age_minutes = max(0.0, (clock - observed).total_seconds() / 60.0)
    lag = float(lag_minutes) if lag_minutes and lag_minutes > 0 else float(DEFAULT_LAG_MINUTES)
    if age_minutes <= lag:
        return "current"
    if age_minutes <= lag * STALE_USABLE_MULTIPLIER:
        return "stale"
    return "expired"


def classify_quote_freshness(
    *,
    quality: str,
    observed_at: datetime | None,
    fetched_at: datetime | None = None,
    lag_minutes: int | None,
    now: datetime | None = None,
) -> Quality:
    """Stale is about observation age versus source cadence, not fetch recency.

    Derived quotes keep their derived type. Freshness/usability is decided
    separately from that type so an expired proxy is still labelled derived.
    """
    del fetched_at  # fetch time must not keep a quote looking current
    ranked = quality if quality in QUALITY_RANK else "unknown"
    if ranked not in {"observed", "stale", "derived"}:
        return ranked  # type: ignore[return-value]
    if ranked == "derived":
        return "derived"
    observed = ensure_utc(observed_at)
    if observed is None:
        return ranked  # type: ignore[return-value]
    freshness = quote_freshness(
        quality=ranked,
        observed_at=observed,
        lag_minutes=lag_minutes,
        now=now,
    )
    if freshness == "current":
        return "observed"
    if freshness == "stale":
        return "stale"
    if freshness == "expired":
        return "missing"
    return ranked  # type: ignore[return-value]


def usable_for_signal(quality: str, freshness: str | None = None) -> bool:
    if quality not in SIGNAL_QUALITIES:
        return False
    if freshness in {"expired", "unverifiable"}:
        return False
    return True


def _as_detail_mapping(raw: Any) -> Mapping[str, Any] | None:
    if raw is None:
        return None
    if isinstance(raw, Mapping):
        return raw
    dump = getattr(raw, "model_dump", None)
    if callable(dump):
        dumped = dump()
        if isinstance(dumped, Mapping):
            return dumped
    return None


def _detail_for_metric(
    details: Mapping[str, Any],
    metric_key: str,
    detail_key: str,
) -> Mapping[str, Any] | None:
    return _as_detail_mapping(details.get(detail_key)) or _as_detail_mapping(details.get(metric_key))


def _positive_float(value: object) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number or number <= 0:  # NaN or non-positive
        return None
    return number


def select_fossil_jet_benchmark(
    values: Mapping[str, Any],
    details: Mapping[str, Any],
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Pick the best European/fossil jet quote by quality, then by regional relevance.

    Seed Rotterdam must not beat a Brent-derived EU proxy. Missing/non-positive
    values are skipped. Seed-only results are not usable for market signals.
    US Gulf jet is never preferred over a European quote of equal quality.
    A usable (current/stale) quote always outranks an expired/unverifiable one
    of the same type, so a stale-dated Rotterdam proxy never blocks a fresh
    EU proxy.
    """
    ranked: list[tuple[int, int, int, str, float, Quality, str]] = []
    clock = ensure_utc(now)
    for index, (metric_key, detail_key) in enumerate(JET_CANDIDATES):
        value = _positive_float(values.get(metric_key))
        if value is None:
            continue
        detail = _detail_for_metric(details, metric_key, detail_key)
        quality = quality_from_detail(detail)
        if quality == "missing":
            continue
        observed_at = observation_from_detail(detail)
        lag_minutes = int(detail["lag_minutes"]) if detail and detail.get("lag_minutes") is not None else None
        if detail:
            quality = classify_quote_freshness(
                quality=quality,
                observed_at=observed_at,
                fetched_at=parse_iso_datetime(detail.get("fetched_at")),
                lag_minutes=lag_minutes,
                now=clock,
            )
        freshness = quote_freshness(
            quality=quality,
            observed_at=observed_at,
            lag_minutes=lag_minutes,
            now=clock,
        )
        if quality == "missing":
            continue
        usable = usable_for_signal(quality, freshness)
        ranked.append((0 if usable else 1, QUALITY_RANK[quality], index, metric_key, value, quality, freshness))

    if not ranked:
        return {
            "value": None,
            "metric_key": None,
            "quality": "missing",
            "freshness": "not_applicable",
            "usable_for_signal": False,
        }

    ranked.sort()
    _usable_rank, _rank, _index, metric_key, value, quality, freshness = ranked[0]
    return {
        "value": value,
        "metric_key": metric_key,
        "quality": quality,
        "freshness": freshness,
        "usable_for_signal": usable_for_signal(quality, freshness),
    }


def select_qualified_input(
    *,
    value: object,
    detail: Mapping[str, Any] | None,
    now: datetime | None = None,
) -> dict[str, Any]:
    number = _positive_float(value)
    quality = quality_from_detail(detail)
    observed_at = observation_from_detail(detail)
    lag_minutes = int(detail["lag_minutes"]) if detail and detail.get("lag_minutes") is not None else None
    if detail:
        quality = classify_quote_freshness(
            quality=quality,
            observed_at=observed_at,
            fetched_at=parse_iso_datetime(detail.get("fetched_at")),
            lag_minutes=lag_minutes,
            now=now,
        )
    freshness = quote_freshness(
        quality=quality if number is not None else "missing",
        observed_at=observed_at,
        lag_minutes=lag_minutes,
        now=now,
    )
    usable = number is not None and quality in COST_QUALITIES and freshness not in {"expired", "unverifiable"}
    return {
        "value": number if usable else None,
        "quality": quality if number is not None else "missing",
        "freshness": freshness,
        "usable_for_cost": usable,
        "usable_for_signal": usable and usable_for_signal(quality, freshness),
    }


def should_persist_snapshot(
    *,
    quality: Quality | str,
    value: float | None,
    has_prior: bool,
    observed_at: datetime | None = None,
    prior_value: float | None = None,
    prior_observed_at: datetime | None = None,
    prior_quality: str | None = None,
) -> bool:
    """Seed must not overwrite a prior quote. Unknown dates and duplicates are skipped."""
    if value is None or quality in {"missing"}:
        return False
    if observed_at is None and quality != "seed":
        return False
    if quality == "seed" and has_prior:
        return False
    if (
        prior_value is not None
        and prior_observed_at is not None
        and observed_at is not None
        and abs(float(prior_value) - float(value)) < 1e-9
        and ensure_utc(prior_observed_at) == ensure_utc(observed_at)
        and (prior_quality or quality) == quality
    ):
        return False
    return True


def same_quality_class(left: Quality | str | None, right: Quality | str | None) -> bool:
    if not left or not right:
        return False
    if left == right:
        return True
    return {left, right} <= {"observed", "stale"}


def same_comparable_series(left: Mapping[str, Any] | None, right: Mapping[str, Any] | None) -> bool:
    if not left or not right:
        return False
    if not same_quality_class(left.get("quality"), right.get("quality")):
        return False
    for key in ("quote_kind", "product_id", "unit"):
        left_value = left.get(key)
        right_value = right.get(key)
        if not left_value or not right_value or left_value != right_value:
            return False
    left_source = left.get("source")
    right_source = right.get("source")
    if left_source and right_source and left_source != right_source:
        return False
    return True


def recover_quality_from_refresh_run(
    payload: Mapping[str, Any] | None,
    *,
    metric_key: str,
    refresh_sources: Mapping[str, Any] | None,
) -> dict[str, Any]:
    current = dict(payload or {})
    if str(current.get("quality") or "").strip().lower() in QUALITY_RANK:
        return current
    detail_key = METRIC_KEY_TO_DETAIL_KEY.get(metric_key)
    raw = None
    if refresh_sources and detail_key:
        raw = refresh_sources.get(detail_key) or refresh_sources.get(metric_key)
    if isinstance(raw, Mapping):
        recovered_quality = quality_from_detail(raw)
        has_quote_date = bool(
            raw.get("observed_at")
            or raw.get("published_at")
            or current.get("observed_at")
            or current.get("published_at")
            or (isinstance(raw.get("input_observed_at"), Mapping) and any(raw.get("input_observed_at").values()))
        )
        if recovered_quality in SIGNAL_QUALITIES and not has_quote_date:
            current["quality"] = "unknown"
            current["legacy"] = True
            current["recovered_from_refresh_run"] = True
            return current
        current["quality"] = recovered_quality
        if raw.get("quote_kind") and not current.get("quote_kind"):
            current["quote_kind"] = raw.get("quote_kind")
        if raw.get("product_id") and not current.get("product_id"):
            current["product_id"] = raw.get("product_id")
        if raw.get("observed_at") and not current.get("observed_at"):
            current["observed_at"] = raw.get("observed_at")
        if raw.get("published_at") and not current.get("published_at"):
            current["published_at"] = raw.get("published_at")
        current["recovered_from_refresh_run"] = True
        return current
    current["quality"] = "unknown"
    current["legacy"] = True
    return current


def backfill_legacy_market_snapshots(db: Session) -> int:
    """Upgrade production-shaped rows in place. Never deletes history."""
    from app.models.tables import MarketRefreshRun, MarketSnapshot

    runs = {run.id: run for run in db.scalars(select(MarketRefreshRun)).all()}
    changed = 0
    for row in db.scalars(select(MarketSnapshot)).all():
        payload = dict(row.payload or {})
        if str(payload.get("quality") or "").strip().lower() in QUALITY_RANK:
            continue
        run = runs.get(payload.get("refresh_run_id"))
        sources = run.sources if run is not None and isinstance(run.sources, dict) else None
        updated = recover_quality_from_refresh_run(
            payload,
            metric_key=str(row.metric_key),
            refresh_sources=sources,
        )
        if updated != payload:
            row.payload = updated
            changed += 1
    return changed
