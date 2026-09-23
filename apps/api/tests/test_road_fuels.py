from __future__ import annotations

import io
import zipfile
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import road_fuels

WB_NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'


def _workbook(weeks: list[tuple[date, float, float, float, float]]) -> bytes:
    """Minimal Bulletin-shaped workbook: EUR per 1000 L, header row, then weekly rows."""
    shared = ["DE_price_with_tax_euro95", "DE_price_with_tax_diesel", "DE_price_wo_tax_euro95", "DE_price_wo_tax_diesel"]

    def sheet(header_ids: tuple[int, int], values: list[tuple[float, float]]) -> str:
        rows = [f'<row r="1"><c r="B1" t="s"><v>{header_ids[0]}</v></c><c r="C1" t="s"><v>{header_ids[1]}</v></c></row>']
        for index, ((week, *_), (e95, diesel)) in enumerate(zip(weeks, values), start=2):
            serial = (week - date(1899, 12, 30)).days
            rows.append(f'<row r="{index}"><c r="A{index}"><v>{serial}</v></c><c r="B{index}"><v>{e95}</v></c><c r="C{index}"><v>{diesel}</v></c></row>')
        return f'<worksheet {WB_NS}><sheetData>{"".join(rows)}</sheetData></worksheet>'

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as book:
        book.writestr("xl/workbook.xml", f'<workbook {WB_NS}><sheets><sheet name="Prices with taxes" sheetId="2" r:id="rId1"/><sheet name="Prices wo taxes" sheetId="3" r:id="rId2"/></sheets></workbook>')
        book.writestr("xl/_rels/workbook.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>')
        book.writestr("xl/sharedStrings.xml", f'<sst {WB_NS}>' + "".join(f"<si><t>{text}</t></si>" for text in shared) + "</sst>")
        book.writestr("xl/worksheets/sheet1.xml", sheet((0, 1), [(w[1], w[2]) for w in weeks]))
        book.writestr("xl/worksheets/sheet2.xml", sheet((2, 3), [(w[3], w[4]) for w in weeks]))
    return buffer.getvalue()


def _weeks() -> list[tuple[date, float, float, float, float]]:
    latest = date(2026, 9, 21)
    rows = [(latest - timedelta(weeks=52), 1715.0, 1584.0, 700.0, 800.0)]
    rows += [(latest - timedelta(weeks=n), 2245.0, 2285.0, 1100.0, 1300.0) for n in range(4, 0, -1)]
    rows.append((latest, 2348.0, 2457.0, 1170.4, 1432.5))
    return rows


def test_bulletin_history_gives_german_pump_prices_and_changes() -> None:
    summary = road_fuels.summarize(road_fuels.parse_wob_history(_workbook(_weeks())))

    assert summary["week"] == date(2026, 9, 21)
    diesel = summary["fuels"]["diesel"]
    assert diesel["with_tax_eur_per_l"] == 2.457
    assert diesel["ex_tax_eur_per_l"] == round(1432.5 / 1000, 3)
    assert diesel["tax_share_pct"] == round((1 - 1.4325 / 2.457) * 100, 1)
    assert diesel["change_4w_pct"] == round((2457 / 2285 - 1) * 100, 1)
    assert diesel["change_52w_pct"] == round((2457 / 1584 - 1) * 100, 1)


@pytest.fixture
def fresh_state(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(road_fuels, "_state", {"summary": None, "fetched_at": None, "next_refresh_at": None})


def test_refresh_is_daily_and_a_failure_keeps_the_last_good_copy(fresh_state, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    payload = _workbook(_weeks())

    class Response:
        content = payload

        def raise_for_status(self) -> None:
            return None

    def fake_get(url: str, **_kwargs):
        calls.append(url)
        if len(calls) > 1:
            raise RuntimeError("bulletin down")
        return Response()

    monkeypatch.setattr(road_fuels.httpx, "get", fake_get)
    start = datetime(2026, 9, 23, 12, tzinfo=UTC)

    road_fuels.refresh_if_due(start)
    road_fuels.refresh_if_due(start + timedelta(hours=1))
    road_fuels.refresh_if_due(start + timedelta(hours=25))

    assert len(calls) == 2
    summary, fetched_at = road_fuels.latest_pump_prices()
    assert summary is not None and summary["week"] == date(2026, 9, 21)
    assert fetched_at == start


def test_route_reports_pump_prices_and_cpi_pass_through(fresh_state) -> None:
    client = TestClient(app)

    empty = client.get("/v1/road-fuels/germany").json()
    assert empty["pump"] is None

    road_fuels._state.update(
        summary=road_fuels.summarize(road_fuels.parse_wob_history(_workbook(_weeks()))),
        fetched_at=datetime(2026, 9, 23, 12, tzinfo=UTC),
    )
    body = client.get("/v1/road-fuels/germany").json()

    assert body["pump"]["week"] == "2026-09-21"
    assert body["pump"]["euro95"]["with_tax_eur_per_l"] == 2.348
    # Destatis Aug 2026: weight 30.46 per mille x motor fuels +27.7 % YoY.
    assert body["inflation"]["period"] == "2026-08"
    assert body["inflation"]["motor_fuels_contribution_pp"] == 0.84
