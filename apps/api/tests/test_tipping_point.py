from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.services.analysis.tipping_point import TippingPointEngine


class MockSession:
    def __init__(
        self,
        fossil_price: float | None = None,
        fossil_payload: dict | None = None,
        fossil_rows: dict[str, tuple[float, dict]] | None = None,
    ) -> None:
        self.fossil_price = fossil_price
        self.fossil_payload = fossil_payload
        self.fossil_rows = fossil_rows
        self.recorded_events: list[SimpleNamespace] = []
        self.added: list[object] = []
        self.committed = False

    def _default_payload(self) -> dict:
        if self.fossil_payload is not None:
            return dict(self.fossil_payload)
        return {"quality": "observed", "observed_at": "2026-04-23T11:00:00+00:00"}

    def scalar(self, query):  # noqa: ANN001
        entity_name = query.column_descriptions[0].get("name")
        where_items = list(getattr(query, "_where_criteria", ()))

        if entity_name == "MarketSnapshot":
            metric_key = None
            for condition in where_items:
                if getattr(getattr(condition, "left", None), "key", None) == "metric_key":
                    metric_key = getattr(getattr(condition, "right", None), "value", None)
            if self.fossil_rows is not None:
                row = self.fossil_rows.get(metric_key) if metric_key else None
                if row is None:
                    return None
                value, payload = row
                return SimpleNamespace(value=value, payload=dict(payload))
            if self.fossil_price is None:
                return None
            return SimpleNamespace(value=self.fossil_price, payload=self._default_payload())

        if entity_name == "id":
            event_type = None
            pathway = None
            dedupe_since = None
            for condition in where_items:
                left_key = condition.left.key
                right_value = getattr(condition.right, "value", None)
                if left_key == "event_type":
                    event_type = right_value
                elif left_key == "saf_pathway":
                    pathway = right_value
                elif left_key == "timestamp":
                    dedupe_since = right_value
            for event in self.recorded_events:
                if (
                    event.event_type == event_type
                    and event.saf_pathway == pathway
                    and (dedupe_since is None or event.timestamp >= dedupe_since)
                ):
                    return event.id
            return None

        raise AssertionError(f"Unexpected scalar query entity: {entity_name}")

    def scalars(self, query):  # noqa: ANN001
        if query.column_descriptions[0].get("name") != "TippingEvent":
            raise AssertionError("Unexpected scalars query")

        events = list(self.recorded_events)
        for condition in getattr(query, "_where_criteria", ()):
            if condition.left.key == "timestamp":
                lower_bound = getattr(condition.right, "value", None)
                events = [event for event in events if event.timestamp >= lower_bound]

        events.sort(key=lambda item: item.timestamp, reverse=True)
        limit_clause = getattr(query, "_limit_clause", None)
        if limit_clause is not None:
            limit_value = int(getattr(limit_clause, "value", limit_clause))
            events = events[:limit_value]
        return SimpleNamespace(all=lambda: events)

    def add_all(self, events):  # noqa: ANN001
        self.added.extend(events)
        self.recorded_events.extend(events)

    def commit(self) -> None:
        self.committed = True


@pytest.fixture
def now() -> datetime:
    return datetime(2026, 4, 23, 12, 0, tzinfo=timezone.utc)


def _event_for_pathway(events, pathway: str):  # noqa: ANN001
    return next((event for event in events if event.saf_pathway == pathway), None)


def test_evaluate_emits_crossover_for_positive_gap(now: datetime) -> None:
    session = MockSession(fossil_price=1.40)
    engine = TippingPointEngine()

    events = engine.evaluate(now=now, db=session)

    hefa_event = _event_for_pathway(events, "hefa")
    assert hefa_event is not None
    assert hefa_event.event_type == "CROSSOVER"
    assert hefa_event.gap_usd_per_litre > 0


def test_evaluate_emits_critical_for_gap_inside_5_cents(now: datetime) -> None:
    session = MockSession(fossil_price=1.21)  # HEFA effective=1.25 -> gap=-0.04
    engine = TippingPointEngine()

    events = engine.evaluate(now=now, db=session)

    hefa_event = _event_for_pathway(events, "hefa")
    assert hefa_event is not None
    assert hefa_event.event_type == "CRITICAL"
    assert hefa_event.gap_usd_per_litre == pytest.approx(-0.04, abs=1e-9)


def test_evaluate_emits_alert_for_gap_inside_20_cents(now: datetime) -> None:
    session = MockSession(fossil_price=1.09)  # HEFA effective=1.25 -> gap=-0.16
    engine = TippingPointEngine()

    events = engine.evaluate(now=now, db=session)

    hefa_event = _event_for_pathway(events, "hefa")
    assert hefa_event is not None
    assert hefa_event.event_type == "ALERT"
    assert hefa_event.gap_usd_per_litre == pytest.approx(-0.16, abs=1e-9)


def test_evaluate_dedupes_same_event_and_pathway_within_24h(now: datetime) -> None:
    session = MockSession(fossil_price=1.09)
    session.recorded_events.append(
        SimpleNamespace(
            id="evt-existing",
            event_type="ALERT",
            saf_pathway="hefa",
            timestamp=now - timedelta(hours=1),
        )
    )
    engine = TippingPointEngine()

    events = engine.evaluate(now=now, db=session)

    assert _event_for_pathway(events, "hefa") is None


def test_crossover_boundary_zero_gap_is_not_crossover(now: datetime) -> None:
    session = MockSession(fossil_price=1.25)  # HEFA effective=1.25 -> gap=0.0
    engine = TippingPointEngine()

    events = engine.evaluate(now=now, db=session)
    hefa_event = _event_for_pathway(events, "hefa")

    assert hefa_event is not None
    assert hefa_event.event_type == "CRITICAL"
    assert hefa_event.gap_usd_per_litre == pytest.approx(0.0, abs=1e-9)


def test_record_events_persists_and_commits(now: datetime) -> None:
    session = MockSession(fossil_price=1.40)
    engine = TippingPointEngine()
    events = engine.evaluate(now=now, db=session)

    engine.record_events(events, session)

    assert len(session.added) == len(events)
    assert session.committed is True


def test_fetch_events_since_and_limit() -> None:
    session = MockSession()
    engine = TippingPointEngine()
    base = datetime(2026, 4, 23, 12, 0, tzinfo=timezone.utc)
    session.recorded_events.extend(
        [
            SimpleNamespace(id="a", timestamp=base - timedelta(hours=6), event_type="ALERT", saf_pathway="hefa"),
            SimpleNamespace(id="b", timestamp=base - timedelta(hours=3), event_type="CRITICAL", saf_pathway="atj"),
            SimpleNamespace(id="c", timestamp=base - timedelta(hours=1), event_type="CROSSOVER", saf_pathway="ft"),
        ]
    )

    events = engine.fetch_events(
        session,
        since=base - timedelta(hours=4),
        limit=1,
    )

    assert [event.id for event in events] == ["c"]


def test_evaluate_skips_expired_derived_quote(now: datetime) -> None:
    expired = {"quality": "derived", "observed_at": "2020-01-02T00:00:00+00:00"}
    session = MockSession(
        fossil_rows={
            "rotterdam_jet_fuel_usd_per_l": (1.40, expired),
            "jet_eu_proxy_usd_per_l": (1.40, expired),
            "jet_usd_per_l": (1.40, expired),
        }
    )
    engine = TippingPointEngine()

    assert engine.evaluate(now=now, db=session) == []


def test_evaluate_falls_back_to_fresh_proxy_when_rotterdam_expired(now: datetime) -> None:
    session = MockSession(
        fossil_rows={
            "rotterdam_jet_fuel_usd_per_l": (
                0.50,
                {"quality": "derived", "observed_at": "2020-01-02T00:00:00+00:00"},
            ),
            "jet_eu_proxy_usd_per_l": (
                1.40,
                {"quality": "derived", "observed_at": "2026-04-23T11:00:00+00:00"},
            ),
        }
    )
    engine = TippingPointEngine()

    events = engine.evaluate(now=now, db=session)

    hefa_event = _event_for_pathway(events, "hefa")
    assert hefa_event is not None
    assert hefa_event.event_type == "CROSSOVER"
    assert hefa_event.fossil_price == pytest.approx(1.40)
