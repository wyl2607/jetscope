import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from app.schemas.grid import (
    GridHistoryPoint,
    GridHistoryResponse,
    GridLcoeSensitivityCell,
    GridLcoeSensitivityResponse,
    GridParityInputs,
    GridParityResponse,
)
from app.services.analysis.crossover import compute_crossover
from app.services.analysis.grid_costs import (
    DEFAULT_CARBON_PRICE_EUR_PER_T,
    DEFAULT_COAL_FUEL_EUR_PER_MWH_TH,
    DEFAULT_FOSSIL_REFERENCE_KEY,
    DEFAULT_GAS_FUEL_EUR_PER_MWH_TH,
    fossil_marginal_cost,
    fossil_reference_schema,
    fuel_cost_for_plant,
    get_fossil_plant,
)
from app.services.analysis.grid_lcoe_sensitivity import (
    DEFAULT_LCOE_SENSITIVITY_DISCOUNT_RATES,
    LCOE_SENSITIVITY_DISCLAIMER,
    compute_lcoe_sensitivity,
    full_load_hour_scan,
    get_lcoe_sensitivity_tech,
)
from app.services.analysis.grid_parity import (
    GRID_SPREAD_THRESHOLDS,
    GRID_STATUS_LABELS,
    compute_grid_parity_rows,
    grid_carbon_price_sweep,
    grid_parity_signal,
)

router = APIRouter()

_BASELINE_PATH = (
    Path(__file__).resolve().parents[2] / "services" / "analysis" / "grid_baseline.json"
)


@router.get("/grid-parity", response_model=GridParityResponse)
def get_grid_parity_analysis(
    carbon_price_eur_per_t: float = Query(
        DEFAULT_CARBON_PRICE_EUR_PER_T, ge=0, description="EU ETS carbon price in EUR per metric ton"
    ),
    gas_fuel_eur_per_mwh_th: float = Query(
        DEFAULT_GAS_FUEL_EUR_PER_MWH_TH, ge=0, description="Gas fuel cost in EUR per MWh thermal"
    ),
    coal_fuel_eur_per_mwh_th: float = Query(
        DEFAULT_COAL_FUEL_EUR_PER_MWH_TH, ge=0, description="Coal fuel cost in EUR per MWh thermal"
    ),
    fossil_reference_key: str = Query(
        DEFAULT_FOSSIL_REFERENCE_KEY, description="Fossil reference plant key (gas_ccgt | hard_coal)"
    ),
) -> GridParityResponse:
    try:
        get_fossil_plant(fossil_reference_key)
    except KeyError as exc:
        raise HTTPException(
            status_code=404, detail=f"Unknown fossil_reference_key: {fossil_reference_key}"
        ) from exc

    fuel_cost = fuel_cost_for_plant(
        fossil_reference_key,
        gas_fuel_eur_per_mwh_th=gas_fuel_eur_per_mwh_th,
        coal_fuel_eur_per_mwh_th=coal_fuel_eur_per_mwh_th,
    )
    rows = compute_grid_parity_rows(
        fossil_plant_key=fossil_reference_key,
        fuel_cost_eur_per_mwh_th=fuel_cost,
        carbon_price_eur_per_t=carbon_price_eur_per_t,
    )
    sweep = grid_carbon_price_sweep(
        fossil_plant_key=fossil_reference_key,
        fuel_cost_eur_per_mwh_th=fuel_cost,
        carbon_min=0.0,
        carbon_max=150.0,
        step=15.0,
    )
    return GridParityResponse(
        generated_at=datetime.now(timezone.utc),
        inputs=GridParityInputs(
            carbon_price_eur_per_t=carbon_price_eur_per_t,
            gas_fuel_eur_per_mwh_th=gas_fuel_eur_per_mwh_th,
            coal_fuel_eur_per_mwh_th=coal_fuel_eur_per_mwh_th,
            fossil_reference_key=fossil_reference_key,
        ),
        fossil_reference=fossil_reference_schema(
            fossil_reference_key,
            fuel_cost_eur_per_mwh_th=fuel_cost,
            carbon_price_eur_per_t=carbon_price_eur_per_t,
        ),
        rows=rows,
        carbon_sweep=sweep,
        signal=grid_parity_signal(rows),
    )


@router.get("/grid-parity/history", response_model=GridHistoryResponse)
def get_grid_parity_history() -> GridHistoryResponse:
    baseline = json.loads(_BASELINE_PATH.read_text(encoding="utf-8"))
    meta = baseline["meta"]
    points: list[GridHistoryPoint] = []
    for entry in baseline["history"]:
        reference = fossil_marginal_cost(
            "gas_ccgt",
            fuel_cost_eur_per_mwh_th=entry["gas_fuel_eur_per_mwh_th"],
            carbon_price_eur_per_t=entry["carbon_price_eur_per_t"],
        )
        crossover = compute_crossover(
            clean_cost=entry["solar_lcoe_eur_per_mwh"],
            reference_cost=reference,
            thresholds=GRID_SPREAD_THRESHOLDS,
            labels=GRID_STATUS_LABELS,
        )
        points.append(
            GridHistoryPoint(
                year=entry["year"],
                carbon_price_eur_per_t=entry["carbon_price_eur_per_t"],
                fossil_marginal_cost_eur_per_mwh=reference,
                solar_lcoe_eur_per_mwh=entry["solar_lcoe_eur_per_mwh"],
                solar_gap_eur_per_mwh=crossover.gap,
                status=crossover.status,  # type: ignore[arg-type]
                source=entry["source"],
                confidence=entry["confidence"],
                fallback=entry["fallback"],
            )
        )
    return GridHistoryResponse(
        generated_at=datetime.now(timezone.utc),
        region=meta["region"],
        disclaimer=meta["disclaimer"],
        points=points,
    )


@router.get("/grid-parity/lcoe-sensitivity", response_model=GridLcoeSensitivityResponse)
def get_grid_lcoe_sensitivity(
    tech_key: str = Query("solar_pv", description="Renewable technology key"),
    fossil_reference_key: str = Query(
        DEFAULT_FOSSIL_REFERENCE_KEY, description="Fossil reference plant key (gas_ccgt | hard_coal)"
    ),
    gas_fuel_eur_per_mwh_th: float = Query(
        DEFAULT_GAS_FUEL_EUR_PER_MWH_TH, ge=0, description="Gas fuel cost in EUR per MWh thermal"
    ),
) -> GridLcoeSensitivityResponse:
    try:
        tech = get_lcoe_sensitivity_tech(tech_key)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown tech_key: {tech_key}") from exc
    try:
        get_fossil_plant(fossil_reference_key)
    except KeyError as exc:
        raise HTTPException(
            status_code=404, detail=f"Unknown fossil_reference_key: {fossil_reference_key}"
        ) from exc

    points = compute_lcoe_sensitivity(
        tech_key=tech.tech_key,
        fossil_plant_key=fossil_reference_key,
        fuel_cost_eur_per_mwh_th=gas_fuel_eur_per_mwh_th,
    )
    return GridLcoeSensitivityResponse(
        generated_at=datetime.now(timezone.utc),
        tech_key=tech.tech_key,
        tech_name=tech.name,
        fossil_reference_key=fossil_reference_key,
        discount_rates=list(DEFAULT_LCOE_SENSITIVITY_DISCOUNT_RATES),
        full_load_hours=list(full_load_hour_scan(tech)),
        cells=[
            GridLcoeSensitivityCell(
                discount_rate=point.discount_rate,
                full_load_hours=point.full_load_hours,
                lcoe_eur_per_mwh=point.lcoe_eur_per_mwh,
                breakeven_carbon_price_eur_per_t=point.breakeven_carbon_price_eur_per_t,
            )
            for point in points
        ],
        disclaimer=LCOE_SENSITIVITY_DISCLAIMER,
    )
