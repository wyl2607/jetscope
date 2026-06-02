from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.routes import analysis as analysis_route


def test_get_tipping_point_analysis_delegates_to_builder(monkeypatch: pytest.MonkeyPatch) -> None:
    called: dict[str, float] = {}
    expected = SimpleNamespace(marker="tip")

    def _fake_builder(**kwargs):  # noqa: ANN003
        called.update(kwargs)
        return expected

    monkeypatch.setattr(analysis_route, "build_tipping_point_response", _fake_builder)

    result = analysis_route.get_tipping_point_analysis(
        fossil_jet_usd_per_l=1.31,
        carbon_price_eur_per_t=92.0,
        subsidy_usd_per_l=0.15,
        blend_rate_pct=12.5,
    )

    assert result is expected
    assert called["fossil_jet_usd_per_l"] == 1.31
    assert called["carbon_price_eur_per_t"] == 92.0
    assert called["subsidy_usd_per_l"] == 0.15
    assert called["blend_rate_pct"] == 12.5


def test_get_airline_decision_analysis_raises_404_for_unknown_pathway(monkeypatch: pytest.MonkeyPatch) -> None:
    def _raise_key_error(pathway_key: str):  # noqa: ARG001
        raise KeyError("missing")

    monkeypatch.setattr(analysis_route, "get_pathway_cost", _raise_key_error)

    with pytest.raises(HTTPException) as exc_info:
        analysis_route.get_airline_decision_analysis(
            fossil_jet_usd_per_l=1.2,
            reserve_weeks=4.0,
            carbon_price_eur_per_t=50.0,
            pathway_key="not-real",
        )

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Unknown pathway_key: not-real"


def test_get_airline_decision_analysis_validates_pathway_and_returns_builder_value(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    call_log: list[tuple[str, object]] = []
    expected = SimpleNamespace(marker="airline")

    def _fake_get_pathway_cost(pathway_key: str):
        call_log.append(("get_pathway_cost", pathway_key))
        return {"pathway_key": pathway_key}

    def _fake_build_airline_decision_response(**kwargs):  # noqa: ANN003
        call_log.append(("build_airline_decision_response", kwargs))
        return expected

    monkeypatch.setattr(analysis_route, "get_pathway_cost", _fake_get_pathway_cost)
    monkeypatch.setattr(analysis_route, "build_airline_decision_response", _fake_build_airline_decision_response)

    result = analysis_route.get_airline_decision_analysis(
        fossil_jet_usd_per_l=1.4,
        reserve_weeks=2.5,
        carbon_price_eur_per_t=88.0,
        pathway_key="hefa",
    )

    assert result is expected
    assert call_log[0] == ("get_pathway_cost", "hefa")
    assert call_log[1][0] == "build_airline_decision_response"
    builder_kwargs = call_log[1][1]
    assert builder_kwargs["fossil_jet_usd_per_l"] == 1.4
    assert builder_kwargs["reserve_weeks"] == 2.5
    assert builder_kwargs["carbon_price_eur_per_t"] == 88.0
    assert builder_kwargs["pathway_key"] == "hefa"


def test_list_tipping_point_events_serializes_and_defaults_metadata(monkeypatch: pytest.MonkeyPatch) -> None:
    db_marker = object()
    since = datetime(2026, 5, 1, tzinfo=timezone.utc)
    observed = datetime(2026, 5, 1, 13, 30, tzinfo=timezone.utc)

    events = [
        SimpleNamespace(
            id="evt-1",
            event_type="CROSSOVER",
            saf_pathway="hefa",
            fossil_price="1.35",
            saf_effective_price="1.22",
            gap_usd_per_litre="0.13",
            timestamp=observed,
            metadata_={"source": "test"},
        ),
        SimpleNamespace(
            id="evt-2",
            event_type="ALERT",
            saf_pathway="atj",
            fossil_price=1.05,
            saf_effective_price=1.20,
            gap_usd_per_litre=-0.15,
            timestamp=observed,
            metadata_=None,
        ),
    ]

    class FakeEngine:
        def __init__(self) -> None:
            self.calls: list[tuple[object, datetime, int]] = []

        def fetch_events(self, db, since, limit):  # noqa: ANN001
            self.calls.append((db, since, limit))
            return events

    fake_engine = FakeEngine()
    monkeypatch.setattr(analysis_route, "engine", fake_engine)

    payload = analysis_route.list_tipping_point_events(since=since, limit=2, db=db_marker)

    assert fake_engine.calls == [(db_marker, since, 2)]
    assert len(payload) == 2
    assert payload[0].fossil_price_usd_per_l == 1.35
    assert payload[0].metadata == {"source": "test"}
    assert payload[1].gap_usd_per_l == -0.15
    assert payload[1].metadata == {}
    assert payload[1].observed_at == observed
