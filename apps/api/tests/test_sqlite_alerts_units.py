from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.api.routes import sqlite_alerts
from app.models.sqlite_models import MarketAlert
from app.schemas.sqlite_schemas import MarketAlertCreate, MarketAlertUpdate


class FakeQuery:
    def __init__(self, items: list[MarketAlert]):
        self._items = items

    def filter(self, expression):
        key = expression.left.key
        value = expression.right.value
        filtered = [item for item in self._items if getattr(item, key) == value]
        return FakeQuery(filtered)

    def order_by(self, _expression):
        ordered = sorted(self._items, key=lambda item: item.created_at, reverse=True)
        return FakeQuery(ordered)

    def all(self):
        return list(self._items)

    def first(self):
        return self._items[0] if self._items else None


class FakeDB:
    def __init__(self, items: list[MarketAlert] | None = None):
        self.items = items or []
        self.added: list[MarketAlert] = []
        self.deleted: list[MarketAlert] = []
        self.commit_calls = 0
        self.refresh_calls = 0

    def query(self, model):
        assert model is MarketAlert
        return FakeQuery(self.items)

    def add(self, obj):
        self.added.append(obj)
        if obj not in self.items:
            self.items.append(obj)

    def commit(self):
        self.commit_calls += 1

    def refresh(self, _obj):
        self.refresh_calls += 1

    def delete(self, obj):
        self.deleted.append(obj)
        self.items.remove(obj)


@pytest.fixture
def seeded_alerts() -> list[MarketAlert]:
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    older = MarketAlert(
        id="a1",
        market_type="ARA",
        threshold_type="above",
        threshold_value=600.0,
        status="inactive",
        created_at=base,
        updated_at=base,
    )
    newer = MarketAlert(
        id="a2",
        market_type="ARA",
        threshold_type="below",
        threshold_value=500.0,
        status="active",
        created_at=base + timedelta(hours=1),
        updated_at=base + timedelta(hours=1),
    )
    other_market = MarketAlert(
        id="a3",
        market_type="US_Gulf",
        threshold_type="above",
        threshold_value=400.0,
        status="active",
        created_at=base + timedelta(hours=2),
        updated_at=base + timedelta(hours=2),
    )
    return [older, newer, other_market]


def test_list_market_alerts_applies_filters_and_sorts_desc(seeded_alerts: list[MarketAlert]):
    db = FakeDB(seeded_alerts)

    result = sqlite_alerts.list_market_alerts(market_type="ARA", status="active", db=db)

    assert len(result) == 1
    assert result[0].id == "a2"
    assert result[0].market_type == "ARA"


def test_create_market_alert_rejects_invalid_market_type():
    db = FakeDB([])
    payload = MarketAlertCreate(
        market_type="NOT_A_MARKET",
        threshold_type="above",
        threshold_value=123.0,
        status="active",
    )

    with pytest.raises(HTTPException) as exc_info:
        sqlite_alerts.create_market_alert(payload, db=db)

    assert exc_info.value.status_code == 400
    assert "Invalid market_type" in exc_info.value.detail


def test_create_market_alert_persists_valid_alert():
    db = FakeDB([])
    payload = MarketAlertCreate(
        market_type="EU_ETS",
        threshold_type="above",
        threshold_value=88.5,
        status="active",
    )

    created = sqlite_alerts.create_market_alert(payload, db=db)

    assert created.market_type == "EU_ETS"
    assert created.threshold_value == pytest.approx(88.5)
    assert db.commit_calls == 1
    assert db.refresh_calls == 1
    assert created in db.items


def test_get_market_alert_raises_404_for_missing_alert():
    db = FakeDB([])

    with pytest.raises(HTTPException) as exc_info:
        sqlite_alerts.get_market_alert("missing", db=db)

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Alert not found"


def test_update_delete_and_trigger_alert_mutate_existing_record(seeded_alerts: list[MarketAlert]):
    db = FakeDB(seeded_alerts)

    updated = sqlite_alerts.update_market_alert(
        "a1",
        MarketAlertUpdate(status="active", threshold_value=777.0),
        db=db,
    )
    assert updated.status == "active"
    assert updated.threshold_value == pytest.approx(777.0)

    triggered = sqlite_alerts.trigger_market_alert("a1", db=db)
    assert triggered.last_triggered is not None
    assert isinstance(triggered.last_triggered, datetime)
    assert triggered.last_triggered.tzinfo is timezone.utc

    sqlite_alerts.delete_market_alert("a1", db=db)
    assert all(item.id != "a1" for item in db.items)
    assert len(db.deleted) == 1
    assert db.commit_calls == 3
