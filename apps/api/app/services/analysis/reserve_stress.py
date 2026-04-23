from app.schemas.reserves import ReserveStressResponse


def get_eu_reserve_stress() -> ReserveStressResponse:
    return ReserveStressResponse(
        region="eu",
        coverage_days=20,
        stress_level="elevated",
        supply_gap_pct=25.0,
        source_type="manual",
        confidence=0.62,
    )
