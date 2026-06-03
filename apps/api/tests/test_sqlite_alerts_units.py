from __future__ import annotations

from unittest.mock import MagicMock, PropertyMock

import pytest
from fastapi import HTTPException

from app.api.routes.sqlite_alerts import (
    create_market_alert,
    delete_market_alert,
    get_market_alert,
    list_market_alerts,
    trigger_market_alert,
    update_market_alert,
)
from app.schemas.sqlite_schemas import MarketAlertCreate, MarketAlertUpdate


@pytest.fixture
def mock_db():
    """Return a MagicMock that stands in for a SQLAlchemy Session."""
    return MagicMock()


def _make_alert_row(**overrides):
    """Build a fake MarketAlert-like object via a mock.

    SQLAlchemy ORM instances support attribute access that matches
    the column names, so a MagicMock with a spec is sufficient for
    unit tests that only read/write attributes.
    """
    defaults = dict(
        id="alert-abc",
        market_type="ARA",
        threshold_type="above",
        threshold_value=50.0,
        status="active",
        last_triggered=None,
    )
    values = {**defaults, **overrides}
    row = MagicMock()
    for k, v in values.items():
        setattr(row, k, v)

    # .model_dump() used internally by FastAPI for serialisation
    if hasattr(row, "model_dump"):
        pass
    return row


# ── create_market_alert ──────────────────────────────────────────────


class TestCreateMarketAlert:
    def test_valid_alert_creates_successfully(self, mock_db):
        data = MarketAlertCreate(
            market_type="ARA",
            threshold_type="above",
            threshold_value=100.0,
        )
        mock_db.add.return_value = None
        mock_db.commit.return_value = None
        mock_db.refresh.return_value = None

        # Stub the newly created alert as it would be returned after refresh
        created = _make_alert_row(market_type="ARA", threshold_value=100.0)
        mock_db.refresh.side_effect = lambda obj: setattr(
            obj, "id", created.id
        ) or setattr(obj, "market_type", created.market_type)

        result = create_market_alert(alert_data=data, db=mock_db)

        assert result.market_type == "ARA"
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()

    def test_invalid_market_type_raises_400(self, mock_db):
        data = MarketAlertCreate(
            market_type="INVALID",
            threshold_type="above",
            threshold_value=100.0,
        )
        with pytest.raises(HTTPException) as exc:
            create_market_alert(alert_data=data, db=mock_db)
        assert exc.value.status_code == 400
        assert "Invalid market_type" in exc.value.detail

    def test_invalid_threshold_type_raises_400(self, mock_db):
        data = MarketAlertCreate(
            market_type="EU_ETS",
            threshold_type="invalid",
            threshold_value=100.0,
        )
        with pytest.raises(HTTPException) as exc:
            create_market_alert(alert_data=data, db=mock_db)
        assert exc.value.status_code == 400
        assert "threshold_type must be 'above' or 'below'" in exc.value.detail


# ── get_market_alert ─────────────────────────────────────────────────


class TestGetMarketAlert:
    def test_returns_alert_when_found(self, mock_db):
        row = _make_alert_row(id="alert-xyz", market_type="EU_ETS")
        mock_db.query.return_value.filter.return_value.first.return_value = row

        result = get_market_alert(alert_id="alert-xyz", db=mock_db)

        assert result.id == "alert-xyz"
        assert result.market_type == "EU_ETS"

    def test_raises_404_when_not_found(self, mock_db):
        mock_db.query.return_value.filter.return_value.first.return_value = None

        with pytest.raises(HTTPException) as exc:
            get_market_alert(alert_id="nonexistent", db=mock_db)
        assert exc.value.status_code == 404
        assert exc.value.detail == "Alert not found"


# ── update_market_alert ──────────────────────────────────────────────


class TestUpdateMarketAlert:
    def test_updates_existing_alert(self, mock_db):
        row = _make_alert_row(id="alert-1", threshold_value=50.0, status="active")
        mock_db.query.return_value.filter.return_value.first.return_value = row
        update_data = MarketAlertUpdate(threshold_value=75.0)

        result = update_market_alert(alert_id="alert-1", alert_data=update_data, db=mock_db)

        assert result.threshold_value == 75.0
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()

    def test_raises_404_when_alert_not_found(self, mock_db):
        mock_db.query.return_value.filter.return_value.first.return_value = None
        update_data = MarketAlertUpdate(threshold_value=75.0)

        with pytest.raises(HTTPException) as exc:
            update_market_alert(alert_id="nonexistent", alert_data=update_data, db=mock_db)
        assert exc.value.status_code == 404
        assert exc.value.detail == "Alert not found"


# ── delete_market_alert ──────────────────────────────────────────────


class TestDeleteMarketAlert:
    def test_deletes_existing_alert(self, mock_db):
        row = _make_alert_row(id="alert-del")
        mock_db.query.return_value.filter.return_value.first.return_value = row

        result = delete_market_alert(alert_id="alert-del", db=mock_db)

        assert result is None
        mock_db.delete.assert_called_once_with(row)
        mock_db.commit.assert_called_once()

    def test_raises_404_when_alert_not_found(self, mock_db):
        mock_db.query.return_value.filter.return_value.first.return_value = None

        with pytest.raises(HTTPException) as exc:
            delete_market_alert(alert_id="nonexistent", db=mock_db)
        assert exc.value.status_code == 404
        assert exc.value.detail == "Alert not found"


# ── trigger_market_alert ──────────────────────────────────────────────


class TestTriggerMarketAlert:
    def test_triggers_existing_alert(self, mock_db):
        row = _make_alert_row(id="alert-trig", last_triggered=None)
        mock_db.query.return_value.filter.return_value.first.return_value = row

        result = trigger_market_alert(alert_id="alert-trig", db=mock_db)

        assert result.id == "alert-trig"
        assert result.last_triggered is not None  # set to datetime.utcnow()
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()

    def test_raises_404_when_alert_not_found(self, mock_db):
        mock_db.query.return_value.filter.return_value.first.return_value = None

        with pytest.raises(HTTPException) as exc:
            trigger_market_alert(alert_id="nonexistent", db=mock_db)
        assert exc.value.status_code == 404
        assert exc.value.detail == "Alert not found"


# ── list_market_alerts ────────────────────────────────────────────────


class TestListMarketAlerts:
    def test_lists_all_when_no_filters(self, mock_db):
        rows = [
            _make_alert_row(id="a1", market_type="ARA"),
            _make_alert_row(id="a2", market_type="EU_ETS"),
        ]
        mock_db.query.return_value.filter.return_value.filter.return_value.order_by.return_value.all.return_value = rows

        result = list_market_alerts(db=mock_db)

        assert len(result) == 2
        assert result[0].id == "a1"

    def test_filters_by_market_type(self, mock_db):
        rows = [_make_alert_row(id="a1", market_type="ARA")]
        mock_db.query.return_value.filter.return_value.filter.return_value.order_by.return_value.all.return_value = rows

        result = list_market_alerts(market_type="ARA", db=mock_db)

        assert len(result) == 1
        assert result[0].market_type == "ARA"

    def test_filters_by_status(self, mock_db):
        rows = [_make_alert_row(id="a2", status="inactive")]
        mock_db.query.return_value.filter.return_value.filter.return_value.order_by.return_value.all.return_value = rows

        result = list_market_alerts(status="inactive", db=mock_db)

        assert len(result) == 1
        assert result[0].status == "inactive"
