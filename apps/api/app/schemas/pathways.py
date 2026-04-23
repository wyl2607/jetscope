from pydantic import BaseModel


class PathwaySummary(BaseModel):
    pathway_id: str
    name: str
    base_cost_usd_per_l: float
    co2_savings_kg_per_l: float


class PathwayUpsert(PathwaySummary):
    pathway: str = ""
    category: str = "saf"
