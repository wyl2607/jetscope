# Phase C threshold alerts

The tipping-point report shows Jet–SAF and EUA watches in all three locales,
where PR #389's inflection alert appeared. These are stateless evaluations of
the current read model, not notifications or persisted crossover events.
Diesel–HVO stays deferred until B2 has a verified dated public HVO source.

## Threshold assumptions

- Jet–SAF: purchase-reference premium **≤15%**, inclusive. This reuses #389's
  inflection mechanism and the product band in `dashboard_contracts.py`
  `_pathway_status`; it is a model assumption, not a regulatory threshold.
  A statutory-allowance-only premium ≤15% retains the separate what-if copy.
  Statutory coverage comes from the existing API allowance rules (Directive
  2003/87/EC Art. 3c(6)); it never changes the unsubsidised premium.
- EUA: **≥100 EUR/t**, inclusive. This is an assumed product review threshold,
  not an official price cap, market forecast or recommendation to trade.

## Calculation and provenance

The SAF purchase reference is `market_check.saf_eur_per_t`, with its source,
period and publication date. The current reference is the EASA ReFuelEU 2026
report's 2025 realised EU average, curated in
`data/curated/market/saf_market_prices.json`. It is not a live SAF quote.
Production-cost bands, seed references and forecasts do not qualify.

For the alert calculation:

```text
SAF USD/L = SAF EUR/t × current ECB USD/EUR ÷ 1,250 L/t
fossil with ETS USD/L = selected jet USD/L + EUA EUR/t × ECB USD/EUR × 0.0025 tCO₂/L
premium % = (SAF − fossil with ETS) / fossil with ETS × 100
statutory premium % = premium % − max(0, premium %) × coverage % / 100
```

The volume conversion and full combustion factor are existing model
assumptions, shared conceptually with `pathway_costs.py` and `breakeven.py`.
The alert uses current qualified ECB FX, avoiding the backend comparison's
fixed seed FX conversion. Its premium can consequently differ from the
headline model premium; the report explains this beside the alerts.
Every advertised proxy input date must also be valid and current, even if
the proxy has a newer direct observation date. The jet benchmark must match
the report's selected fossil input; no silent substitution with another quote. Source metadata and dates are accessible
through the report's source link; the SAF reference links directly to its
publication. API fields and OpenAPI are unchanged.

## Suppression

Jet, EUA and ECB must have finite positive values, source metadata, observed or
derived quality, and a valid observation date no later than the evaluation
clock. The existing `quoteFreshness` source-cadence policy is reused, but only
**current** inputs qualify: even the market selector's normally usable stale
quotes cannot fire these alerts. Missing cadence defaults to 24 hours.
Seed, unknown, legacy, unverified, missing and stale inputs suppress the
relevant alert. Fallback observations and an entire fallback read model also
suppress; genuine current derived proxies may qualify. A recent fetch cannot
refresh an old observation. Explicit stale/expired metadata also suppresses.

For the annual SAF reference, **400 days after publication** is an explicit
freshness assumption, matching the annual reference-cost policy used in C3.
This bounds reference validity, not the age of a supposed live quote.
Invalid, absent or future publication dates suppress the spread watch.
The report displays the first blocking input and reason, in the reader's
language, instead of displaying an active alert. EUA eligibility is independent
of Jet, FX and SAF; a missing SAF reference cannot hide a current EUA breach.

The watches compare levels on each render. They do not claim a threshold was
crossed since a prior observation and do not send external messages.
