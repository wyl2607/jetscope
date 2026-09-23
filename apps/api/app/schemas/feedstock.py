from datetime import date, datetime

from pydantic import BaseModel


class UcoPriorYear(BaseModel):
    year: int
    low_eur_per_t: float
    low_date: date
    high_eur_per_t: float
    high_date: date
    vs_high_pct: float
    vs_low_pct: float
    source_name: str
    source_url: str


class UcoPrice(BaseModel):
    """UCO (ISCC) delivered Northwest Europe, midpoint of the published range."""

    week_ending: date
    published_at: date
    ddp_nwe_eur_per_t: float
    ddp_nwe_low_eur_per_t: float
    ddp_nwe_high_eur_per_t: float
    age_days: int
    stale: bool
    source_name: str
    source_url: str
    prior_year: UcoPriorYear | None


class UcoVsGasoil(BaseModel):
    """Same-week UCO CIF ARA (bulk) over ICE gasoil futures, both USD/t."""

    week_ending: date
    uco_cif_ara_bulk_usd_per_t: float
    ice_gasoil_usd_per_t: float
    ratio: float


class SafFeedstockStructure(BaseModel):
    period: str
    published_at: date
    aviation_biofuel_share_of_saf_pct: float
    feedstock_imported_pct: float
    china_share_of_imports_pct: float
    source_name: str
    source_url: str


class FeedstockSqueezeResponse(BaseModel):
    generated_at: datetime
    uco: UcoPrice
    uco_vs_gasoil: UcoVsGasoil
    structure: SafFeedstockStructure
