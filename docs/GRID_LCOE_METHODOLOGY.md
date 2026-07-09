# Grid LCOE Methodology And Dual-Domain Cost Crossover

**Audience:** technical interviewers reviewing JetScope's grid-parity and SAF
tipping-point methodology.

**Status:** personal portfolio methodology note. The figures are illustrative
public-range assumptions, not investment-grade forecasts, procurement advice, or
regulatory guidance.

## Short Chinese Summary

同一个 EU ETS 碳价在 JetScope 中同时推动两条叙事: 航空 SAF tipping-point 与电网
renewable grid-parity。两者复用同一个成本交叉引擎, 只是 clean/reference cost 的业务单位不同。

## One Carbon Lever, Two Decarbonization Domains

JetScope intentionally frames aviation fuel transition and grid decarbonization
as the same economic question:

> At what carbon-adjusted fossil reference cost does the clean option become
> cheaper enough to change the decision?

The shared implementation is
[`apps/api/app/services/analysis/crossover.py`](../apps/api/app/services/analysis/crossover.py).
It is domain-agnostic: callers pass a clean cost, a fossil/reference cost,
percentage thresholds, and labels. The engine returns:

- `gap = clean_cost - reference_cost`
- `spread_pct = gap / reference_cost * 100`
- a four-band status classification

Both domains currently use the same thresholds and labels:

| Spread condition | Status |
| --- | --- |
| `spread_pct > 25` | `uneconomic` |
| `spread_pct > 5` | `inflection` |
| `spread_pct >= -10` | `marginal_switch` |
| `spread_pct < -10` | `dominant` |

The threshold semantics are deliberately shared by
[`breakeven.py`](../apps/api/app/services/analysis/breakeven.py) for SAF and
[`grid_parity.py`](../apps/api/app/services/analysis/grid_parity.py) for grid
parity. SAF compares net SAF cost against fossil jet fuel cost. Grid parity
compares renewable LCOE against fossil marginal electricity cost. The units
differ, but the crossover surface is the same once each domain has converted
its assumptions into comparable costs.

## Grid LCOE Model

The bottom-up sensitivity model lives in
[`grid_lcoe_sensitivity.py`](../apps/api/app/services/analysis/grid_lcoe_sensitivity.py).
It annualizes renewable capital cost with a capital recovery factor (CRF):

```text
CRF = r(1 + r)^n / ((1 + r)^n - 1)
```

where `r` is the discount rate and `n` is asset lifetime in years. When `r = 0`,
the implementation uses `1 / n`.

With CAPEX and fixed O&M entered per kW and LCOE reported per MWh, the model is:

```text
LCOE_EUR_per_MWh =
  ((CRF * CAPEX_EUR_per_kW * 1000) + (fixed_O&M_EUR_per_kW_year * 1000))
  / full_load_hours
```

The sensitivity scan uses discount rates of `3%`, `5%`, `7%`, and `9%`, and
full-load hours at `80%`, `100%`, and `120%` of each technology baseline.

## Renewable Baseline Inputs

These values are copied from `LCOE_SENSITIVITY_TECHS` in
[`grid_lcoe_sensitivity.py`](../apps/api/app/services/analysis/grid_lcoe_sensitivity.py).
The source posture is the implementation disclaimer: illustrative public ranges
calibrated against Fraunhofer ISE 2024 and IRENA 2023 references.

| Technology | Key | CAPEX (EUR/kW) | Fixed O&M (EUR/kW-year) | Lifetime (years) | Baseline full-load hours |
| --- | --- | ---: | ---: | ---: | ---: |
| Solar PV (utility) | `solar_pv` | 700 | 12 | 30 | 1,000 |
| Onshore Wind | `onshore_wind` | 1,400 | 35 | 30 | 2,100 |
| Offshore Wind | `offshore_wind` | 3,300 | 80 | 30 | 3,700 |

The main grid-parity endpoint also exposes static LCOE bands in
[`grid_costs.py`](../apps/api/app/services/analysis/grid_costs.py), while this
sensitivity model shows how the underlying financing and utilization
assumptions move the breakeven carbon price.

## Fossil Reference And Carbon Breakeven

The default fossil reference is `gas_ccgt`, defined in
[`grid_costs.py`](../apps/api/app/services/analysis/grid_costs.py):

| Fossil reference | Fuel input | Efficiency | Variable O&M | Emission intensity |
| --- | ---: | ---: | ---: | ---: |
| Gas CCGT | 30 EUR/MWh_th | 0.55 | 4 EUR/MWh | 0.35 tCO2/MWh |

Fossil marginal cost is:

```text
fossil_marginal_cost =
  fuel_cost_EUR_per_MWh_th / efficiency
  + variable_O&M_EUR_per_MWh
  + carbon_price_EUR_per_tCO2 * emission_intensity_tCO2_per_MWh
```

The grid LCOE sensitivity endpoint solves the EU ETS carbon price at which the
fossil marginal cost equals renewable LCOE:

```text
breakeven_carbon_price_EUR_per_tCO2 =
  (LCOE - fuel_cost / efficiency - variable_O&M) / emission_intensity
```

The implementation clamps the result with `max(0.0, breakeven)`. A zero result
does not mean carbon has no economic value. It means the renewable LCOE is
already below the fossil marginal cost before adding any carbon cost, so the
carbon price required to break even is zero.

## Sensitivity Insight: WACC x Full-Load Hours

The model behaves as expected for capital-heavy renewable assets:

- Higher WACC raises annualized CAPEX through CRF, raising LCOE and pushing the
  breakeven carbon price upward.
- Higher full-load hours spread annualized CAPEX and fixed O&M over more output,
  lowering LCOE and pulling the breakeven carbon price downward.
- Technologies with higher CAPEX are more sensitive to WACC; technologies with
  strong utilization can offset some of that capital burden.

At the default gas benchmark and each technology's baseline full-load hours, the
central `5%` WACC cells are:

| Technology | Baseline FLH | LCOE at 5% WACC (EUR/MWh) | Breakeven carbon price (EUR/tCO2) |
| --- | ---: | ---: | ---: |
| Solar PV (utility) | 1,000 | 57.54 | 0.00 |
| Onshore Wind | 2,100 | 60.03 | 4.25 |
| Offshore Wind | 3,700 | 79.64 | 60.27 |

The important portfolio conclusion is that baseline solar already beats the
default gas CCGT reference at zero carbon price. With gas at `30 EUR/MWh_th`,
gas CCGT has a zero-carbon marginal cost of about `58.55 EUR/MWh`
(`30 / 0.55 + 4`). Baseline solar at `5%` WACC and `1,000` full-load hours is
`57.54 EUR/MWh`, so the computed breakeven is clamped to `0.00 EUR/tCO2`.

For solar PV, the sensitivity matrix makes the direction clear:

| Full-load hours | 3% WACC | 5% WACC | 7% WACC | 9% WACC |
| ---: | ---: | ---: | ---: | ---: |
| 800 | 3.13 | 38.21 | 77.05 | 118.93 |
| 1,000 | 0.00 | 0.00 | 28.19 | 61.69 |
| 1,200 | 0.00 | 0.00 | 0.00 | 23.53 |

Values in this matrix are breakeven carbon prices in `EUR/tCO2`. Moving from
`800` to `1,200` full-load hours can eliminate the need for a carbon price under
low-to-mid WACC assumptions. Moving from `3%` to `9%` WACC can turn the same
physical asset from already competitive into one that needs a material carbon
price to cross the fossil reference.

## Interpretation Boundaries

This document describes implemented methodology for a personal portfolio
project. It uses public, illustrative ranges and deterministic defaults so the
repository remains reproducible. It does not claim official source endorsement,
does not model project-specific financing, curtailment, grid fees, storage,
balancing costs, capacity value, taxes, subsidies, or merchant-price risk, and
should not be used as investment, procurement, regulatory, or trading advice.

For carbon field semantics used elsewhere in the product, see
[`EU_ETS_CARBON_ASSUMPTIONS.md`](./EU_ETS_CARBON_ASSUMPTIONS.md).
