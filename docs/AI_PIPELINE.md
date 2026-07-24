# AI Research Pipeline (Phase B)

## Overview

This pipeline runs a daily loop:

1. Fetch news (`NewsAPI` primary, Reuters commodities RSS fallback)
2. Extract structured ESG signals with Claude Sonnet 4.6
3. Persist to `esg_signals`
4. Expose via `GET /v1/research/signals`

Operators can also trigger a protected manual refresh with `POST
/v1/research/refresh` after configuring `JETSCOPE_ADMIN_TOKEN` and enabling the
research pipeline.

Default merge posture is budget-safe:

- `AI_RESEARCH_ENABLED=false`
- `AI_RESEARCH_MOCK_MODE=true`

## Prompt Design

System prompt is stable and cached:

- Role: SAF industry analyst
- Output contract: strict JSON
- Enumerated fields:
  - `signal_type` ∈ `SUPPLY_DISRUPTION|POLICY_CHANGE|PRICE_SHOCK|CAPACITY_ANNOUNCEMENT|OTHER`
  - `impact_direction` ∈ `BEARISH_SAF|BULLISH_SAF|NEUTRAL`
  - `confidence` in `[0,1]`
  - `entities` as list
  - bilingual summaries (`summary_en`, `summary_cn`)

Per-article payload is sent in `user` content:

- `Title`
- `Published`
- `Excerpt`

The article block is explicitly treated as untrusted data: it is wrapped in
`<untrusted_article>`, capped at 12,000 characters, and the system prompt forbids
following instructions found in it. This narrows prompt-injection exposure while
keeping the source text available as evidence; it is covered by focused unit tests.

## Prompt Caching Strategy

Caching is enabled on the system prompt by setting:

`cache_control={"type":"ephemeral"}`

At runtime, cache usage is captured from `response.usage.cache_read_input_tokens` and stored as `prompt_cache_hit`.

## Cost Estimate (Claude Sonnet 4.6)

Assumptions:

- Input: `$3 / MTok`
- Cached input discount: `10%` (effective `90%` price on cached reads)
- Output: `$15 / MTok`

Conservative daily estimate (mock-first rollout, low article volume): under `$0.50/day`.

Budget guardrail:

- `AI_RESEARCH_DAILY_TOKEN_BUDGET=500000`
- Exceeding budget raises `BudgetExceeded`, and that article is skipped.

## Mock vs Live

`AI_RESEARCH_MOCK_MODE=true`:

- No Anthropic client initialization
- No external LLM API call
- Returns deterministic neutral `OTHER` signal per article
- Deterministic stub shape is pinned by `apps/api/tests/test_ai_research_boundary.py::test_mock_mode_is_deterministic_and_key_free`

`AI_RESEARCH_MOCK_MODE=false`:

- Uses Anthropic Messages API with model `claude-sonnet-4-6`
- Applies prompt caching on system prompt
- Enforces daily token budget
- Explicit live-mode and DB-backed pre-call budget refusal are pinned by
  `apps/api/tests/test_ai_research_boundary.py::test_live_mode_is_explicit_and_db_budget_guarded`

## Manual Refresh

`POST /v1/research/refresh` requires `x-admin-token` matching
`JETSCOPE_ADMIN_TOKEN`.

The route refuses to run when:

- `JETSCOPE_AI_RESEARCH_ENABLED=false`
- `JETSCOPE_AI_RESEARCH_MOCK_MODE=false` and `JETSCOPE_ANTHROPIC_API_KEY` is not configured

Successful responses return counters for fetched articles, extracted signals,
persisted signals, and budget-skipped articles.

## Environment Variables

```bash
JETSCOPE_ANTHROPIC_API_KEY=
JETSCOPE_NEWSAPI_KEY=
JETSCOPE_AI_RESEARCH_ENABLED=false
JETSCOPE_AI_RESEARCH_DAILY_TOKEN_BUDGET=500000
JETSCOPE_AI_RESEARCH_MOCK_MODE=true
```
