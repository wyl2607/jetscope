from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from app.schemas.heat import (
    GasBoilerReference,
    HeatParityInputs,
    HeatParityResponse,
    HeatPumpReference,
    HeatSensitivityCell,
    HeatSensitivityResponse,
)
from app.services.analysis.heat_costs import (
    DEFAULT_CARBON_PRICE_EUR_PER_T,
    DEFAULT_ELEC_PRICE_EUR_PER_MWH_EL,
    DEFAULT_GAS_PRICE_EUR_PER_MWH_TH,
    GAS_BOILER,
    HEAT_PUMP_TECHS,
    gas_heat_cost,
)
from app.services.analysis.heat_parity import (
    compute_heat_parity_rows,
    heat_carbon_price_sweep,
    heat_parity_signal,
)
from app.services.analysis.heat_sensitivity import (
    COP_VALUES,
    HEAT_SENSITIVITY_DISCLAIMER,
    compute_heat_sensitivity,
    elec_price_scan,
)

router = APIRouter()


@router.get("/heat-parity", response_model=HeatParityResponse)
def get_heat_parity_analysis(
    carbon_price: float = Query(
        DEFAULT_CARBON_PRICE_EUR_PER_T,
        ge=0,
        description="EU ETS2 carbon price in EUR per metric ton for heating fuels",
    ),
    elec_price: float = Query(
        DEFAULT_ELEC_PRICE_EUR_PER_MWH_EL,
        ge=0,
        description="Residential electricity price in EUR per MWh electric",
    ),
    gas_price: float = Query(
        DEFAULT_GAS_PRICE_EUR_PER_MWH_TH,
        ge=0,
        description="Residential gas price in EUR per MWh thermal",
    ),
) -> HeatParityResponse:
    try:
        rows = compute_heat_parity_rows(
            carbon_price_eur_per_t=carbon_price,
            elec_price_eur_per_mwh_el=elec_price,
            gas_price_eur_per_mwh_th=gas_price,
        )
        sweep = heat_carbon_price_sweep(
            elec_price_eur_per_mwh_el=elec_price,
            gas_price_eur_per_mwh_th=gas_price,
            carbon_min=0.0,
            carbon_max=150.0,
            step=15.0,
        )
        reference_cost = gas_heat_cost(
            gas_price_eur_per_mwh_th=gas_price,
            carbon_price_eur_per_t=carbon_price,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return HeatParityResponse(
        generated_at=datetime.now(timezone.utc),
        inputs=HeatParityInputs(
            carbon_price_eur_per_t=carbon_price,
            elec_price_eur_per_mwh_el=elec_price,
            gas_price_eur_per_mwh_th=gas_price,
        ),
        gas_boiler_reference=GasBoilerReference(
            name=GAS_BOILER.name,
            efficiency=GAS_BOILER.efficiency,
            gas_price_eur_per_mwh_th=gas_price,
            emission_intensity_t_per_mwh_th=GAS_BOILER.emission_intensity_t_per_mwh_th,
            heat_cost_eur_per_mwh=reference_cost,
        ),
        heat_pump_references=[
            HeatPumpReference(tech_key=tech_key, name=tech.name, cop=tech.cop)
            for tech_key, tech in HEAT_PUMP_TECHS.items()
        ],
        rows=rows,
        carbon_sweep=sweep,
        signal=heat_parity_signal(rows),
    )


@router.get("/heat-parity/sensitivity", response_model=HeatSensitivityResponse)
def get_heat_sensitivity(
    gas_price: float = Query(
        DEFAULT_GAS_PRICE_EUR_PER_MWH_TH,
        ge=0,
        description="Residential gas price in EUR per MWh thermal",
    ),
) -> HeatSensitivityResponse:
    points = compute_heat_sensitivity(gas_price_eur_per_mwh_th=gas_price)
    return HeatSensitivityResponse(
        generated_at=datetime.now(timezone.utc),
        gas_price_eur_per_mwh_th=gas_price,
        cops=list(COP_VALUES),
        elec_prices=list(elec_price_scan()),
        cells=[
            HeatSensitivityCell(
                cop=point.cop,
                elec_price_eur_per_mwh_el=point.elec_price_eur_per_mwh_el,
                hp_heat_cost_eur_per_mwh=point.hp_heat_cost_eur_per_mwh,
                breakeven_carbon_price_eur_per_t=point.breakeven_carbon_price_eur_per_t,
            )
            for point in points
        ],
        disclaimer=HEAT_SENSITIVITY_DISCLAIMER,
    )
