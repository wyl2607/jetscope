from datetime import datetime, timezone
from unittest.mock import MagicMock

from sqlalchemy.orm import Session

from app.api.routes import health as health_route
from app.schemas.market import MarketSnapshotResponse, SourceStatus
from app.schemas.readiness import ReadinessResponse
from app.schemas.sources import SourceCoverageMetric, SourceCoverageResponse


def test_health_returns_expected_structure():
    result = health_route.get_health()

    assert result["ok"] is True
    assert result["service"] == "api"
    assert "T" in result["time"]
    assert result["phase0_deprecation_gate"] == health_route.settings.phase0_deprecation_gate
    caps = result["phase_b_capabilities"]
    assert caps["market_snapshot"] is True
    assert caps["scenario_crud"] is True


def test_readiness_all_ok(monkeypatch):
    fake_now = datetime(2025, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(health_route, "utcnow", lambda: fake_now)

    db = MagicMock(spec=Session)
    db.execute.return_value = MagicMock()

    monkeypatch.setattr(
        health_route,
        "build_market_snapshot_response",
        lambda _db: MarketSnapshotResponse(
            generated_at=fake_now,
            source_status=SourceStatus(overall="ok"),
            values={"brent_usd_per_bbl": 85.0},
            source_details={},
        ),
    )
    monkeypatch.setattr(
        health_route,
        "build_source_coverage_response",
        lambda _db: SourceCoverageResponse(
            generated_at=fake_now,
            completeness=1.0,
            degraded=False,
            metrics=[
                SourceCoverageMetric(
                    metric_key="brent_usd_per_bbl",
                    source_name="eia",
                    source_type="official",
                    confidence_score=0.9,
                    lag_minutes=30,
                    fallback_used=False,
                    status="ok",
                    region="global",
                    market_scope="benchmark",
                )
            ],
        ),
    )

    result = health_route.get_readiness(db)

    assert isinstance(result, ReadinessResponse)
    assert result.ready is True
    assert result.status == "ready"
    assert result.degraded is False
    assert result.checks["database"].ok is True
    assert result.checks["market_snapshot"].ok is True
    assert result.checks["source_coverage"].ok is True
    assert result.generated_at == fake_now
    assert result.environment == health_route.settings.app_env
    assert result.api_prefix == health_route.settings.api_prefix


def test_readiness_database_failure(monkeypatch):
    fake_now = datetime(2025, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(health_route, "utcnow", lambda: fake_now)

    db = MagicMock(spec=Session)
    db.execute.side_effect = RuntimeError("db is down")

    monkeypatch.setattr(
        health_route,
        "build_market_snapshot_response",
        lambda _db: MarketSnapshotResponse(
            generated_at=fake_now,
            source_status=SourceStatus(overall="ok"),
            values={"brent_usd_per_bbl": 85.0},
            source_details={},
        ),
    )
    monkeypatch.setattr(
        health_route,
        "build_source_coverage_response",
        lambda _db: SourceCoverageResponse(
            generated_at=fake_now,
            completeness=1.0,
            degraded=False,
            metrics=[],
        ),
    )

    result = health_route.get_readiness(db)

    assert result.ready is False
    assert result.status == "not_ready"
    assert result.checks["database"].ok is False
    assert result.checks["database"].status == "error"
    assert "db is down" in result.checks["database"].detail


def test_readiness_market_snapshot_failure(monkeypatch):
    fake_now = datetime(2025, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(health_route, "utcnow", lambda: fake_now)

    db = MagicMock(spec=Session)
    db.execute.return_value = MagicMock()

    monkeypatch.setattr(
        health_route,
        "build_market_snapshot_response",
        lambda _db: (_ for _ in ()).throw(RuntimeError("market API unavailable")),
    )
    monkeypatch.setattr(
        health_route,
        "build_source_coverage_response",
        lambda _db: SourceCoverageResponse(
            generated_at=fake_now,
            completeness=0.0,
            degraded=True,
            metrics=[],
        ),
    )

    result = health_route.get_readiness(db)

    assert result.ready is False
    assert result.status == "not_ready"
    assert result.checks["market_snapshot"].ok is False
    assert result.checks["market_snapshot"].status == "error"
    assert "market API unavailable" in result.checks["market_snapshot"].detail
