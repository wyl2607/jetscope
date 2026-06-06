import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.tables import MarketSnapshot
from app.schemas.grid import GridHistoryPoint, GridHistoryResponse
from app.services.analysis.crossover import compute_crossover
from app.services.analysis.grid_costs import fossil_marginal_cost
from app.services.analysis.grid_parity import GRID_SPREAD_THRESHOLDS, GRID_STATUS_LABELS

GRID_HISTORY_SOURCE_KEY = "grid_baseline_ember_ise"
GRID_HISTORY_METRICS = {
    "grid_carbon_price_eur_per_t": {
        "field": "carbon_price_eur_per_t",
        "unit": "eur_per_t",
    },
    "grid_gas_fuel_eur_per_mwh_th": {
        "field": "gas_fuel_eur_per_mwh_th",
        "unit": "eur_per_mwh_th",
    },
    "grid_solar_lcoe_eur_per_mwh": {
        "field": "solar_lcoe_eur_per_mwh",
        "unit": "eur_per_mwh",
    },
}
GRID_HISTORY_METRIC_KEYS = tuple(GRID_HISTORY_METRICS.keys())

_BASELINE_PATH = Path(__file__).resolve().parent / "analysis" / "grid_baseline.json"


def _load_grid_baseline() -> dict:
    return json.loads(_BASELINE_PATH.read_text(encoding="utf-8"))


def _year_start(year: int) -> datetime:
    return datetime(year, 1, 1, tzinfo=timezone.utc)


def _ensure_utc_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def seed_grid_baseline_history(db: Session) -> int:
    baseline = _load_grid_baseline()
    existing = {
        (row.metric_key, _ensure_utc_datetime(row.as_of))
        for row in db.scalars(
            select(MarketSnapshot).where(
                MarketSnapshot.source_key == GRID_HISTORY_SOURCE_KEY,
                MarketSnapshot.metric_key.in_(GRID_HISTORY_METRIC_KEYS),
            )
        ).all()
    }

    inserted = 0
    for entry in baseline["history"]:
        year = int(entry["year"])
        as_of = _year_start(year)
        payload = {
            "year": year,
            "confidence": float(entry["confidence"]),
            "source": str(entry["source"]),
            "fallback": bool(entry["fallback"]),
        }
        for metric_key, metric in GRID_HISTORY_METRICS.items():
            unique_key = (metric_key, as_of)
            if unique_key in existing:
                continue
            db.add(
                MarketSnapshot(
                    source_key=GRID_HISTORY_SOURCE_KEY,
                    metric_key=metric_key,
                    value=float(entry[metric["field"]]),
                    unit=str(metric["unit"]),
                    as_of=as_of,
                    payload=payload,
                )
            )
            existing.add(unique_key)
            inserted += 1

    if inserted:
        db.commit()
    return inserted


def _history_point(
    *,
    year: int,
    carbon_price_eur_per_t: float,
    gas_fuel_eur_per_mwh_th: float,
    solar_lcoe_eur_per_mwh: float,
    source: str,
    confidence: float,
    fallback: bool,
) -> GridHistoryPoint:
    reference = fossil_marginal_cost(
        "gas_ccgt",
        fuel_cost_eur_per_mwh_th=gas_fuel_eur_per_mwh_th,
        carbon_price_eur_per_t=carbon_price_eur_per_t,
    )
    crossover = compute_crossover(
        clean_cost=solar_lcoe_eur_per_mwh,
        reference_cost=reference,
        thresholds=GRID_SPREAD_THRESHOLDS,
        labels=GRID_STATUS_LABELS,
    )
    return GridHistoryPoint(
        year=year,
        carbon_price_eur_per_t=carbon_price_eur_per_t,
        fossil_marginal_cost_eur_per_mwh=reference,
        solar_lcoe_eur_per_mwh=solar_lcoe_eur_per_mwh,
        solar_gap_eur_per_mwh=crossover.gap,
        status=crossover.status,  # type: ignore[arg-type]
        source=source,
        confidence=confidence,
        fallback=fallback,
    )


def _json_history_points(baseline: dict) -> list[GridHistoryPoint]:
    points: list[GridHistoryPoint] = []
    for entry in baseline["history"]:
        points.append(
            _history_point(
                year=int(entry["year"]),
                carbon_price_eur_per_t=float(entry["carbon_price_eur_per_t"]),
                gas_fuel_eur_per_mwh_th=float(entry["gas_fuel_eur_per_mwh_th"]),
                solar_lcoe_eur_per_mwh=float(entry["solar_lcoe_eur_per_mwh"]),
                source=str(entry["source"]),
                confidence=float(entry["confidence"]),
                fallback=True,
            )
        )
    return points


def _db_history_points(rows: list[MarketSnapshot]) -> list[GridHistoryPoint]:
    rows_by_year: dict[int, dict[str, MarketSnapshot]] = {}
    for row in rows:
        year = _ensure_utc_datetime(row.as_of).year
        rows_by_year.setdefault(year, {})[row.metric_key] = row

    points: list[GridHistoryPoint] = []
    for year in sorted(rows_by_year):
        metric_rows = rows_by_year[year]
        if not all(metric_key in metric_rows for metric_key in GRID_HISTORY_METRIC_KEYS):
            continue

        carbon = metric_rows["grid_carbon_price_eur_per_t"]
        gas = metric_rows["grid_gas_fuel_eur_per_mwh_th"]
        solar = metric_rows["grid_solar_lcoe_eur_per_mwh"]
        payload = carbon.payload or {}

        points.append(
            _history_point(
                year=year,
                carbon_price_eur_per_t=float(carbon.value),
                gas_fuel_eur_per_mwh_th=float(gas.value),
                solar_lcoe_eur_per_mwh=float(solar.value),
                source=str(payload.get("source") or "MarketSnapshot"),
                confidence=float(payload.get("confidence") or 0.0),
                fallback=False,
            )
        )
    return points


def build_grid_history_response(db: Session) -> GridHistoryResponse:
    baseline = _load_grid_baseline()
    meta = baseline["meta"]
    rows = db.scalars(
        select(MarketSnapshot)
        .where(
            MarketSnapshot.source_key == GRID_HISTORY_SOURCE_KEY,
            MarketSnapshot.metric_key.in_(GRID_HISTORY_METRIC_KEYS),
        )
        .order_by(MarketSnapshot.as_of.asc(), MarketSnapshot.metric_key.asc())
    ).all()

    points = _db_history_points(rows) if rows else _json_history_points(baseline)
    if rows and not points:
        points = _json_history_points(baseline)

    return GridHistoryResponse(
        generated_at=datetime.now(timezone.utc),
        region=meta["region"],
        disclaimer=meta["disclaimer"],
        points=points,
    )
