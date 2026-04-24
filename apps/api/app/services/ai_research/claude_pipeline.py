from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.services.ai_research.budget import BudgetStateRepository
from app.services.ai_research.scraper import RawArticle

DEFAULT_MODEL = "claude-sonnet-4-6"
ALLOWED_SIGNAL_TYPES = {
    "SUPPLY_DISRUPTION",
    "POLICY_CHANGE",
    "PRICE_SHOCK",
    "CAPACITY_ANNOUNCEMENT",
    "OTHER",
}
ALLOWED_IMPACT_DIRECTIONS = {"BEARISH_SAF", "BULLISH_SAF", "NEUTRAL"}


class BudgetExceeded(RuntimeError):
    pass


@dataclass(slots=True)
class ExtractedSignal:
    signal_type: str
    entities: list[str]
    impact_direction: str
    confidence: float
    summary_en: str
    summary_cn: str
    claude_model: str
    prompt_cache_hit: bool
    tokens_used: int = 0


class ClaudeSignalExtractor:
    def __init__(
        self,
        *,
        mock_mode: bool | None = None,
        token_budget: int | None = None,
        model: str = DEFAULT_MODEL,
        anthropic_api_key: str | None = None,
    ) -> None:
        self._mock_mode = settings.ai_research_mock_mode if mock_mode is None else mock_mode
        self._token_budget = (
            settings.ai_research_daily_token_budget if token_budget is None else int(token_budget)
        )
        self._model = model
        self._tokens_today = 0
        self._budget_day = self._current_day()
        self._client = None
        self._budget_state_repository = BudgetStateRepository()
        if not self._mock_mode:
            from anthropic import Anthropic

            key = anthropic_api_key if anthropic_api_key is not None else settings.anthropic_api_key
            self._client = Anthropic(api_key=key or None)

    def extract(self, article: RawArticle, *, db: Session | None = None) -> list[ExtractedSignal]:
        self._reset_budget_if_new_day()
        if self._mock_mode:
            return [
                ExtractedSignal(
                    signal_type="OTHER",
                    entities=[],
                    impact_direction="NEUTRAL",
                    confidence=0.5,
                    summary_en=f"Mock signal extracted for: {article.title}",
                    summary_cn=f"模拟信号：{article.title}",
                    claude_model="mock",
                    prompt_cache_hit=False,
                    tokens_used=0,
                )
            ]

        if self._client is None:
            raise RuntimeError("Anthropic client is not initialized")

        if db is not None:
            budget_state = self._budget_state_repository.get_or_create(db, self._budget_day)
            if budget_state.exhausted:
                raise BudgetExceeded("AI research daily token budget exhausted")

            estimated_request_tokens = self._estimate_request_tokens(article)
            if budget_state.tokens_used + estimated_request_tokens > self._token_budget:
                self._budget_state_repository.mark_exhausted(db, self._budget_day)
                raise BudgetExceeded("AI research daily token budget exhausted")

        response = self._client.messages.create(
            model=self._model,
            max_tokens=600,
            system=[
                {
                    "type": "text",
                    "text": (
                        "你是 SAF 行业分析师。输入一条新闻，输出严格 JSON："
                        "{signal_type, entities, impact_direction, confidence, summary_en, summary_cn}。"
                        "signal_type ∈ {SUPPLY_DISRUPTION,POLICY_CHANGE,PRICE_SHOCK,CAPACITY_ANNOUNCEMENT,OTHER}。"
                        "impact_direction ∈ {BEARISH_SAF,BULLISH_SAF,NEUTRAL}。"
                        "confidence 是 0-1 浮点。entities 是公司/政策/国家名列表。"
                    ),
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Title: {article.title}\n"
                        f"Published: {article.published_at.isoformat()}\n"
                        f"Excerpt: {article.excerpt}"
                    ),
                }
            ],
        )

        usage = getattr(response, "usage", None)
        input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
        output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
        total_tokens = input_tokens + output_tokens
        if db is not None:
            budget_state = self._budget_state_repository.get_or_create(db, self._budget_day)
            if budget_state.tokens_used + total_tokens > self._token_budget:
                self._budget_state_repository.mark_exhausted(db, self._budget_day)
                raise BudgetExceeded("AI research daily token budget exceeded")
            budget_state = self._budget_state_repository.record_usage(
                db,
                self._budget_day,
                total_tokens,
                self._token_budget,
            )
            self._tokens_today = budget_state.tokens_used
        else:
            if self._tokens_today + total_tokens > self._token_budget:
                raise BudgetExceeded("AI research daily token budget exceeded")
            self._tokens_today += total_tokens

        parsed = self._parse_signal_payload(response)
        signal = ExtractedSignal(
            signal_type=self._normalize_signal_type(parsed.get("signal_type")),
            entities=self._normalize_entities(parsed.get("entities")),
            impact_direction=self._normalize_impact_direction(parsed.get("impact_direction")),
            confidence=self._normalize_confidence(parsed.get("confidence")),
            summary_en=(parsed.get("summary_en") or "").strip() or article.title,
            summary_cn=(parsed.get("summary_cn") or "").strip() or article.title,
            claude_model=getattr(response, "model", self._model),
            prompt_cache_hit=int(getattr(usage, "cache_read_input_tokens", 0) or 0) > 0,
            tokens_used=total_tokens,
        )
        return [signal]

    @property
    def tokens_today(self) -> int:
        self._reset_budget_if_new_day()
        return self._tokens_today

    def _parse_signal_payload(self, response: Any) -> dict[str, Any]:
        # anthropic SDK can return parsed JSON or raw text segments depending on model behavior.
        content = getattr(response, "content", []) or []
        if not content:
            return {}
        first = content[0]
        input_payload = getattr(first, "input", None)
        if isinstance(input_payload, dict):
            return input_payload
        text = (getattr(first, "text", "") or "").strip()
        if not text:
            return {}
        import json

        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return {}
        return {}

    @staticmethod
    def _normalize_entities(value: Any) -> list[str]:
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        return []

    @staticmethod
    def _normalize_signal_type(value: Any) -> str:
        text = str(value or "OTHER").strip().upper()
        return text if text in ALLOWED_SIGNAL_TYPES else "OTHER"

    @staticmethod
    def _normalize_impact_direction(value: Any) -> str:
        text = str(value or "NEUTRAL").strip().upper()
        return text if text in ALLOWED_IMPACT_DIRECTIONS else "NEUTRAL"

    @staticmethod
    def _normalize_confidence(value: Any) -> float:
        try:
            numeric = float(value)
        except Exception:
            numeric = 0.5
        return max(0.0, min(1.0, numeric))

    @staticmethod
    def _current_day() -> str:
        return datetime.now(timezone.utc).date().isoformat()

    def _reset_budget_if_new_day(self) -> None:
        day = self._current_day()
        if day != self._budget_day:
            self._budget_day = day
            self._tokens_today = 0

    @staticmethod
    def _estimate_request_tokens(article: RawArticle) -> int:
        payload = (
            f"Title: {article.title}\n"
            f"Published: {article.published_at.isoformat()}\n"
            f"Excerpt: {article.excerpt}"
        )
        estimated_input_tokens = max(1, len(payload) // 4)
        return estimated_input_tokens + 600
