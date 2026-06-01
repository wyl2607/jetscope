from app.schemas.reserves import ReserveStressResponse
from app.services.analysis import reserve_stress


def test_get_eu_reserve_stress_without_db_returns_manual_fallback():
    resp = reserve_stress.get_eu_reserve_stress(db=None)

    assert resp.region == "eu"
    assert resp.coverage_days == 20
    assert resp.stress_level == "elevated"
    assert resp.supply_gap_pct == 25.0
    assert resp.source_type == "manual"
    assert resp.confidence == 0.62


def test_get_eu_reserve_stress_returns_distinct_fallback_copy():
    resp = reserve_stress.get_eu_reserve_stress(db=None)

    assert resp is not reserve_stress._MANUAL_FALLBACK
    assert resp == reserve_stress._MANUAL_FALLBACK


def test_get_eu_reserve_stress_with_db_uses_live_or_fallback(monkeypatch):
    dummy_db = object()

    monkeypatch.setattr(
        reserve_stress,
        "get_eu_reserve_stress_from_db",
        lambda db: None,
    )
    fallback = reserve_stress.get_eu_reserve_stress(db=dummy_db)

    assert fallback == reserve_stress._MANUAL_FALLBACK
    assert fallback is not reserve_stress._MANUAL_FALLBACK

    sentinel = ReserveStressResponse(
        region="eu",
        coverage_days=31,
        stress_level="stable",
        supply_gap_pct=0.0,
        source_type="official",
        confidence=0.91,
    )
    monkeypatch.setattr(
        reserve_stress,
        "get_eu_reserve_stress_from_db",
        lambda db: sentinel,
    )

    assert reserve_stress.get_eu_reserve_stress(db=dummy_db) is sentinel
