from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.api.routes.analysis import (
    get_airline_decision_analysis,
    get_tipping_point_analysis,
    list_tipping_point_events,
)
from app.schemas.analysis import (
    AirlineDecisionInputs,
    AirlineDecisionProbabilities,
    AirlineDecisionResponse,
    TippingPointInputs,
    TippingPointResponse,
)


class TestGetTippingPointAnalysis:
    @staticmethod
    def _sample_response(**overrides: object) -> TippingPointResponse:
        kwargs: dict[str, object] = dict(
            generated_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
            inputs=TippingPointInputs(
                fossil_jet_usd_per_l=1.3,
                carbon_price_eur_per_t=95,
                subsidy_usd_per_l=0.0,
                blend_rate_pct=0.0,
            ),
            effective_fossil_jet_usd_per_l=1.4086,
            pathways=[],
            signal="fossil_still_advantaged",
        )
        kwargs.update(overrides)
        return TippingPointResponse(**kwargs)  # type: ignore[arg-type]

    def test_delegates_to_build_response(self) -> None:
        """Route passes all arguments through to build_tipping_point_response."""
        mock_response = self._sample_response()

        with patch(
            "app.api.routes.analysis.build_tipping_point_response",
            return_value=mock_response,
        ) as mock_build:
            result = get_tipping_point_analysis(
                fossil_jet_usd_per_l=1.3,
                carbon_price_eur_per_t=95,
                subsidy_usd_per_l=0.0,
                blend_rate_pct=0.0,
            )

        mock_build.assert_called_once_with(
            fossil_jet_usd_per_l=1.3,
            carbon_price_eur_per_t=95,
            subsidy_usd_per_l=0.0,
            blend_rate_pct=0.0,
        )
        assert result is mock_response

    def test_signal_reflects_underlying_analysis(self) -> None:
        """Route returns whatever signal the service layer produces."""
        mock_response = self._sample_response(signal="saf_cost_advantaged")

        with patch(
            "app.api.routes.analysis.build_tipping_point_response",
            return_value=mock_response,
        ):
            result = get_tipping_point_analysis(
                fossil_jet_usd_per_l=0.8,
                carbon_price_eur_per_t=200,
                subsidy_usd_per_l=0.5,
                blend_rate_pct=50.0,
            )

        assert result.signal == "saf_cost_advantaged"
        assert result.effective_fossil_jet_usd_per_l == 1.4086


class TestGetAirlineDecisionAnalysis:
    @staticmethod
    def _sample_response(**overrides: object) -> AirlineDecisionResponse:
        return AirlineDecisionResponse(
            generated_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
            inputs=AirlineDecisionInputs(
                fossil_jet_usd_per_l=1.3,
                reserve_weeks=3,
                carbon_price_eur_per_t=95,
                pathway_key="hefa",
            ),
            probabilities=AirlineDecisionProbabilities(
                raise_fares=0.3,
                cut_capacity=0.5,
                buy_spot_saf=0.6,
                sign_long_term_offtake=0.2,
                ground_routes=0.4,
            ),
            signal="switch_window_opening",
            **overrides,  # type: ignore[arg-type]
        )

    def test_returns_decision_for_valid_pathway(self) -> None:
        """Valid pathway_key returns full AirlineDecisionResponse."""
        mock_response = self._sample_response()

        with patch(
            "app.api.routes.analysis.build_airline_decision_response",
            return_value=mock_response,
        ):
            result = get_airline_decision_analysis(
                fossil_jet_usd_per_l=1.3,
                reserve_weeks=3,
                carbon_price_eur_per_t=95,
                pathway_key="hefa",
            )

        assert result.signal == "switch_window_opening"
        assert result.inputs.pathway_key == "hefa"
        assert result.probabilities.raise_fares == 0.3

    def test_unknown_pathway_raises_404(self) -> None:
        """Invalid pathway_key raises HTTPException 404 before calling build."""
        with patch(
            "app.api.routes.analysis.get_pathway_cost",
            side_effect=KeyError("bogus"),
        ):
            with pytest.raises(HTTPException) as exc_info:
                get_airline_decision_analysis(
                    fossil_jet_usd_per_l=1.3,
                    reserve_weeks=3,
                    carbon_price_eur_per_t=0,
                    pathway_key="bogus",
                )

        assert exc_info.value.status_code == 404
        assert "bogus" in exc_info.value.detail


class TestListTippingPointEvents:
    @staticmethod
    def _fake_event(
        event_type: str = "CROSSOVER",
        gap: float = 0.03,
    ) -> SimpleNamespace:
        return SimpleNamespace(
            id="evt-1",
            event_type=event_type,
            saf_pathway="hefa",
            fossil_price=1.28,
            saf_effective_price=1.25,
            gap_usd_per_litre=gap,
            timestamp=datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc),
            metadata_={"breakeven_oil_price_usd_per_bbl": 137.5},
        )

    def test_serializes_db_events_into_response_models(self) -> None:
        """Route returns properly serialized TippingEventResponse objects."""
        fake_events = [self._fake_event()]

        with patch(
            "app.api.routes.analysis.engine.fetch_events",
            return_value=fake_events,
        ):
            result = list_tipping_point_events(
                since=datetime(2026, 6, 1, 10, 0, tzinfo=timezone.utc),
                limit=10,
            )

        assert len(result) == 1
        event = result[0]
        assert event.id == "evt-1"
        assert event.event_type == "CROSSOVER"
        assert event.gap_usd_per_l == 0.03
        assert event.metadata["breakeven_oil_price_usd_per_bbl"] == 137.5

    def test_empty_db_returns_empty_list(self) -> None:
        """When no events match, returns empty list."""
        with patch(
            "app.api.routes.analysis.engine.fetch_events",
            return_value=[],
        ):
            result = list_tipping_point_events(since=None, limit=10)

        assert result == []

    def test_null_metadata_defaults_to_empty_dict(self) -> None:
        """Events with None metadata_ are serialized with empty dict."""
        fake_event = self._fake_event()
        fake_event.metadata_ = None

        with patch(
            "app.api.routes.analysis.engine.fetch_events",
            return_value=[fake_event],
        ):
            (result,) = list_tipping_point_events(since=None, limit=10)

        assert result.metadata == {}
