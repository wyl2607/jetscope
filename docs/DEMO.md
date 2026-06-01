# JetScope Demo Path

This is the shortest reviewer path through JetScope's current product shape. It assumes a local checkout, the defaults from `.env.example`, and mock-first AI behavior.

## Demo Goal

Show that JetScope can explain the SAF decision surface without secrets or production infrastructure:

- market snapshot freshness and provenance
- SAF tipping-point logic
- source coverage and fallback posture
- research signal surfacing
- deterministic mock-first AI behavior

## Reviewer Flow

### 1. Start With The Market Snapshot

Open the web app and confirm the market surface loads. The snapshot should show:

- Brent proxy pricing
- jet fuel proxy pricing
- carbon proxy or EU ETS context
- source freshness and confidence metadata

If you want the raw contract view, use [`GET /v1/market/snapshot`](./API_CONTRACT_V1.md).

### 2. Inspect The SAF Tipping Point

Open the tipping-point analysis surface and vary the fossil jet input.

What to look for:

- the crossover point where SAF becomes economically competitive
- how carbon price changes move the result
- whether the interface explains the gap in plain language

The relevant contract is [`GET /v1/analysis/tipping-point`](./API_CONTRACT_V1.md).

### 3. Review Source Coverage

Check the provenance and fallback indicators on the market view.

The reviewer should be able to see that JetScope is not pretending every source is live all the time. Instead, it should expose:

- source status
- fallback usage
- confidence
- freshness

This behavior is defined in [`docs/API_CONTRACT_V1.md`](./API_CONTRACT_V1.md) and [`docs/DATA_CONTRACT_V1.md`](./DATA_CONTRACT_V1.md).

### 4. Scan Research Signals

Open the research signal surface and verify that it returns structured items from the local contract rather than opaque blobs.

Look for:

- signal type
- entities
- impact direction
- confidence
- bilingual summary fields

The endpoint is [`GET /v1/research/signals`](./API_CONTRACT_V1.md).

### 5. Confirm Mock-First AI Behavior

For a safe reviewer run, keep:

- `JETSCOPE_AI_RESEARCH_ENABLED=false`
- `JETSCOPE_AI_RESEARCH_MOCK_MODE=true`

That means:

- no external Anthropic call is required
- no API key is needed for the demo path
- research extraction stays deterministic and budget-safe

See [`docs/AI_PIPELINE.md`](./AI_PIPELINE.md) for the pipeline rules and the mock/live split.

## Suggested Talk Track

1. JetScope is a market intelligence product for SAF timing and fuel-transition decisions.
2. The platform combines market data, carbon context, reserve stress, and research signals.
3. The interface shows provenance and fallback state instead of hiding uncertainty.
4. The AI pipeline is mock-first by default so an outside reviewer can run the system safely.

## Demo Checklist

- Market snapshot renders with source metadata.
- Tipping-point analysis responds to a changed fossil jet input.
- Source coverage or freshness indicators are visible.
- Research signals endpoint returns structured rows.
- No secret material or production credentials are required.

## If The Reviewer Wants More

Point them to:

- [`docs/QUICKSTART.md`](./QUICKSTART.md) for the local runbook
- [`docs/API_CONTRACT_V1.md`](./API_CONTRACT_V1.md) for the API surface
- [`docs/DATA_CONTRACT_V1.md`](./DATA_CONTRACT_V1.md) for the data model
- [`docs/AI_PIPELINE.md`](./AI_PIPELINE.md) for the mock-first AI design
