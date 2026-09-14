"""Quality-aware market quote selection and timestamp helpers.

Observed quotes, derived proxies, and seed baselines must not be mixed as if
they were the same market observation. Seed values never generate action signals.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Mapping

Quality = Literal["observed", "stale", "derived", "seed", "missing"]

QUALITY_RANK: dict[str, int] = {
    "observed": 0,
    "stale": 1,
    "derived": 2,
    "seed": 3,
    "missing": 4,
}

JET_CANDIDATES: tuple[tuple[str, str], ...] = (
    ("rotterdam_jet_fuel_usd_per_l", "rotterdam_jet_fuel"),
    ("jet_eu_proxy_usd_per_l", "jet_eu_proxy"),
    ("jet_usd_per_l", "jet"),
)

SIGNAL_QUALITIES = frozenset({"observed", "stale", "derived"})


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
    return "missing"


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
) -> dict[str, Any]:
    """Pick the best European/fossil jet quote by quality, then by regional relevance.

    Seed Rotterdam must not beat a Brent-derived EU proxy. Missing/non-positive
    values are skipped. Seed-only results are not usable for market signals.
    """
    ranked: list[tuple[int, int, str, float, Quality]] = []
    for index, (metric_key, detail_key) in enumerate(JET_CANDIDATES):
        value = _positive_float(values.get(metric_key))
        if value is None:
            continue
        quality = quality_from_detail(_detail_for_metric(details, metric_key, detail_key))
        if quality == "missing":
            continue
        ranked.append((QUALITY_RANK[quality], index, metric_key, value, quality))

    if not ranked:
        return {
            "value": None,
            "metric_key": None,
            "quality": "missing",
            "usable_for_signal": False,
        }

    ranked.sort()
    _rank, _index, metric_key, value, quality = ranked[0]
    return {
        "value": value,
        "metric_key": metric_key,
        "quality": quality,
        "usable_for_signal": quality in SIGNAL_QUALITIES,
    }


def should_persist_snapshot(
    *,
    quality: Quality,
    value: float | None,
    has_prior: bool,
) -> bool:
    """Seed must not overwrite a prior quote with a fresh fetch timestamp."""
    if value is None or quality == "missing":
        return False
    if quality == "seed" and has_prior:
        return False
    return True


def same_quality_class(left: Quality | str | None, right: Quality | str | None) -> bool:
    if not left or not right:
        return False
    if left == right:
        return True
    return {left, right} <= {"observed", "stale"}
