# AI Research Pipeline (Phase B)

## Overview

This pipeline runs a daily loop:

1. Fetch news (`NewsAPI` primary, Reuters commodities RSS fallback)
2. Extract structured ESG signals with Claude Sonnet 4.6
3. Persist to `esg_signals`
4. Expose via `GET /v1/research/signals`

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

`AI_RESEARCH_MOCK_MODE=false`:

- Uses Anthropic Messages API with model `claude-sonnet-4-6`
- Applies prompt caching on system prompt
- Enforces daily token budget

## Environment Variables

```bash
ANTHROPIC_API_KEY=
NEWSAPI_KEY=
AI_RESEARCH_ENABLED=false
AI_RESEARCH_DAILY_TOKEN_BUDGET=500000
AI_RESEARCH_MOCK_MODE=true
```
