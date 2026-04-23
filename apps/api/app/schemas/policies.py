from pydantic import BaseModel


class PolicyTarget(BaseModel):
    year: int
    saf_share_pct: float
    synthetic_share_pct: float
    label: str
