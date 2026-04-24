from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


ResearchSignalType = Literal[
    "SUPPLY_DISRUPTION",
    "POLICY_CHANGE",
    "PRICE_SHOCK",
    "CAPACITY_ANNOUNCEMENT",
    "OTHER",
]
ResearchImpactDirection = Literal["BEARISH_SAF", "BULLISH_SAF", "NEUTRAL"]


class ResearchSignalResponse(BaseModel):
    id: str
    created_at: datetime
    updated_at: datetime
    source_url: str
    signal_type: ResearchSignalType
    entities: list[str] = Field(default_factory=list)
    impact_direction: ResearchImpactDirection
    confidence: float = Field(ge=0, le=1)
    summary_en: str
    summary_cn: str
    raw_title: str
    raw_excerpt: str
    published_at: datetime
    claude_model: str
    prompt_cache_hit: bool
