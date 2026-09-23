"""German pump prices (EU Weekly Oil Bulletin) and their CPI pass-through.

Only the Bulletin's history workbook is used: on 2026-09-23 its "latest prices
with taxes" download served the same ex-tax figures as the "without taxes" one
(Germany Euro-super 95 at 1,170 EUR/1000 L while the pump price was ~2.35).
"""

from __future__ import annotations

import io
import json
import logging
import re
import threading
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass
from datetime import date, datetime, timedelta

import httpx

from app.services.bootstrap import utcnow
from app.services.curated_events import curated_dir

logger = logging.getLogger("jetscope.road_fuels")

WOB_HISTORY_URL = (
    "https://energy.ec.europa.eu/document/download/906e60ca-8b6a-44e7-8589-652854d2fd3f_en"
    "?filename=Weekly_Oil_Bulletin_Prices_History_maticni_4web.xlsx"
)
WOB_SOURCE_NAME = "European Commission Weekly Oil Bulletin, price history (Germany)"
# The Bulletin is weekly (Monday prices, published Thursday); daily is plenty.
REFRESH_INTERVAL = timedelta(hours=24)
EXCEL_EPOCH = date(1899, 12, 30)
_NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
_COLUMNS = {
    "euro95_with_tax": ("Prices with taxes", "DE_price_with_tax_euro95"),
    "diesel_with_tax": ("Prices with taxes", "DE_price_with_tax_diesel"),
    "euro95_ex_tax": ("Prices wo taxes", "DE_price_wo_tax_euro95"),
    "diesel_ex_tax": ("Prices wo taxes", "DE_price_wo_tax_diesel"),
}


@dataclass(frozen=True, slots=True)
class WeeklyPrice:
    week: date
    eur_per_l: float


def _column_index(ref: str) -> int:
    index = 0
    for char in re.match(r"[A-Z]+", ref).group():  # type: ignore[union-attr]
        index = index * 26 + ord(char) - 64
    return index


def _sheet_rows(workbook: zipfile.ZipFile, name: str, shared: list[str]) -> list[dict[int, str]]:
    book = ET.fromstring(workbook.read("xl/workbook.xml"))
    rels = {rel.get("Id"): rel.get("Target") for rel in ET.fromstring(workbook.read("xl/_rels/workbook.xml.rels"))}
    sheet = next(s for s in book.find("m:sheets", _NS) if s.get("name") == name)  # type: ignore[union-attr]
    target = str(rels[sheet.get(f"{{{_NS['r']}}}id")]).lstrip("/")
    path = target if target.startswith("xl/") else f"xl/{target}"
    rows: list[dict[int, str]] = []
    for _event, element in ET.iterparse(workbook.open(path)):
        if element.tag != f"{{{_NS['m']}}}row":
            continue
        row: dict[int, str] = {}
        for cell in element.findall("m:c", _NS):
            value = cell.find("m:v", _NS)
            if value is None or value.text is None:
                continue
            row[_column_index(str(cell.get("r")))] = shared[int(value.text)] if cell.get("t") == "s" else value.text
        rows.append(row)
        element.clear()
    return rows


def parse_wob_history(payload: bytes) -> dict[str, list[WeeklyPrice]]:
    """Germany's weekly Euro-super 95 / diesel series, EUR per litre, oldest first."""
    with zipfile.ZipFile(io.BytesIO(payload)) as workbook:
        shared = [
            "".join(text.text or "" for text in item.iter(f"{{{_NS['m']}}}t"))
            for item in ET.fromstring(workbook.read("xl/sharedStrings.xml")).findall("m:si", _NS)
        ]
        sheets = {name: _sheet_rows(workbook, name, shared) for name in {sheet for sheet, _ in _COLUMNS.values()}}
    series: dict[str, list[WeeklyPrice]] = {}
    for key, (sheet, header) in _COLUMNS.items():
        rows = sheets[sheet]
        header_row = next(row for row in rows if header in row.values())
        column = next(index for index, value in header_row.items() if value == header)
        points = []
        for row in rows:
            serial, value = row.get(1), row.get(column)
            if serial is None or value is None or not re.fullmatch(r"\d{5}(\.0+)?", serial):
                continue
            points.append(WeeklyPrice(EXCEL_EPOCH + timedelta(days=int(float(serial))), float(value) / 1000.0))
        if not points:
            raise ValueError(f"No Germany rows for {header}")
        series[key] = sorted(points, key=lambda point: point.week)
    return series


def _value_on_or_before(points: list[WeeklyPrice], week: date) -> WeeklyPrice | None:
    earlier = [point for point in points if point.week <= week]
    return earlier[-1] if earlier else None


def summarize(series: dict[str, list[WeeklyPrice]]) -> dict[str, object]:
    latest_week = min(points[-1].week for points in series.values())
    fuels: dict[str, dict[str, object]] = {}
    for fuel in ("euro95", "diesel"):
        with_tax = series[f"{fuel}_with_tax"]
        latest = _value_on_or_before(with_tax, latest_week)
        ex_tax = _value_on_or_before(series[f"{fuel}_ex_tax"], latest_week)
        if latest is None or ex_tax is None:
            raise ValueError(f"No aligned {fuel} week")
        changes: dict[str, float | None] = {}
        for label, weeks in (("change_4w_pct", 4), ("change_52w_pct", 52)):
            base = _value_on_or_before(with_tax, latest_week - timedelta(weeks=weeks))
            changes[label] = round((latest.eur_per_l / base.eur_per_l - 1) * 100, 1) if base else None
        fuels[fuel] = {
            "with_tax_eur_per_l": round(latest.eur_per_l, 3),
            "ex_tax_eur_per_l": round(ex_tax.eur_per_l, 3),
            "tax_share_pct": round((1 - ex_tax.eur_per_l / latest.eur_per_l) * 100, 1),
            **changes,
        }
    return {"week": latest_week, "fuels": fuels}


_lock = threading.Lock()
_state: dict[str, object] = {"summary": None, "fetched_at": None, "next_refresh_at": None}


def refresh_if_due(now: datetime | None = None) -> None:
    """Fetch and parse the Bulletin at most once per REFRESH_INTERVAL; keep the last good copy."""
    clock = now or utcnow()
    with _lock:
        due = _state["next_refresh_at"]
        if isinstance(due, datetime) and clock < due:
            return
        _state["next_refresh_at"] = clock + REFRESH_INTERVAL
    try:
        response = httpx.get(WOB_HISTORY_URL, timeout=60.0, follow_redirects=True, headers={"User-Agent": "JetScope API/0.1"})
        response.raise_for_status()
        summary = summarize(parse_wob_history(response.content))
    except Exception:
        logger.exception("road_fuels_refresh_failed")
        return
    with _lock:
        _state["summary"] = summary
        _state["fetched_at"] = clock
    logger.info("road_fuels_refresh week=%s", summary["week"])


def latest_pump_prices() -> tuple[dict[str, object] | None, datetime | None]:
    with _lock:
        return _state["summary"], _state["fetched_at"]  # type: ignore[return-value]


def latest_cpi_release() -> dict[str, object] | None:
    path = curated_dir() / "market" / "destatis_cpi.json"
    if not path.is_file():
        return None
    with path.open(encoding="utf-8") as handle:
        releases = json.load(handle).get("releases", [])
    return max(releases, key=lambda item: str(item["published_at"]), default=None)
