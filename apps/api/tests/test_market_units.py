from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.tables import MarketSnapshot
from app.services import market


def test_fetch_text_uses_configured_market_source_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class FakeResponse:
        text = "ok"

        def raise_for_status(self) -> None:
            return None

    def fake_get(url: str, *, timeout: float, headers: dict[str, str], follow_redirects: bool) -> FakeResponse:
        captured.update(
            {
                "url": url,
                "timeout": timeout,
                "headers": headers,
                "follow_redirects": follow_redirects,
            }
        )
        return FakeResponse()

    monkeypatch.setenv("JETSCOPE_MARKET_SOURCE_TIMEOUT_SECONDS", "0.25")
    monkeypatch.delenv("SAFVSOIL_MARKET_REFRESH_TIMEOUT_MS", raising=False)
    monkeypatch.setattr(market.httpx, "get", fake_get)

    assert market._fetch_text("https://example.test/source") == "ok"
    assert captured["timeout"] == 0.25


def test_fetch_json_supports_legacy_market_refresh_timeout_ms(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"ok": True}

    def fake_get(url: str, *, timeout: float, headers: dict[str, str], follow_redirects: bool) -> FakeResponse:
        captured.update({"url": url, "timeout": timeout, "headers": headers, "follow_redirects": follow_redirects})
        return FakeResponse()

    monkeypatch.delenv("JETSCOPE_MARKET_SOURCE_TIMEOUT_SECONDS", raising=False)
    monkeypatch.setenv("SAFVSOIL_MARKET_REFRESH_TIMEOUT_MS", "250")
    monkeypatch.setattr(market.httpx, "get", fake_get)

    assert market._fetch_json("https://example.test/source") == {"ok": True}
    assert captured["timeout"] == 0.25


def test_parse_fred_csv_uses_last_valid_row_and_skips_missing_values() -> None:
    csv_payload = """DATE,VALUE
2026-01-01,.
2026-01-02,100.5
2026-01-03,
2026-01-04,101.75
"""

    as_of, value = market._parse_fred_csv(csv_payload)

    assert as_of == "2026-01-04"
    assert value == 101.75


def test_parse_fred_csv_raises_when_no_usable_rows() -> None:
    csv_payload = """DATE,VALUE
2026-01-01,.
2026-01-02,
"""

    with pytest.raises(ValueError, match="No usable rows"):
        market._parse_fred_csv(csv_payload)


def test_fetch_yahoo_chart_history_filters_cutoff_and_none_values(monkeypatch: pytest.MonkeyPatch) -> None:
    fixed_now = datetime(2026, 1, 15, tzinfo=UTC)

    monkeypatch.setattr(market, "utcnow", lambda: fixed_now)
    monkeypatch.setattr(
        market,
        "_fetch_json",
        lambda _url: {
            "chart": {
                "result": [
                    {
                        "timestamp": [
                            int(datetime(2025, 12, 1, tzinfo=UTC).timestamp()),
                            int(datetime(2026, 1, 10, tzinfo=UTC).timestamp()),
                            int(datetime(2026, 1, 12, tzinfo=UTC).timestamp()),
                        ],
                        "indicators": {"quote": [{"close": [10.0, None, 12.5]}]},
                    }
                ],
                "error": None,
            }
        },
    )

    rows = market._fetch_yahoo_chart_history("BZ=F", days=30)

    assert rows == [(datetime(2026, 1, 12, tzinfo=UTC), 12.5)]


def test_ingest_jet_eu_market_value_falls_back_to_brent_when_public_quote_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(market, "_fetch_text", lambda _url: (_ for _ in ()).throw(RuntimeError("source down")))

    details: dict[str, object] = {"sources": {}}
    seed_by_key = {item["metric_key"]: float(item["value"]) for item in market.DEFAULT_MARKET_METRICS}

    result = market._ingest_jet_eu_market_value(
        details,
        brent_value=120.0,
        seed_by_key=seed_by_key,
    )

    expected = round((120.0 / market.LITERS_PER_BARREL) * market.EU_JET_PROXY_BRENT_PREMIUM_MULTIPLIER, 3)
    source_detail = details["sources"]["jet_eu_proxy"]

    assert result == expected
    assert source_detail["status"] == "estimated"
    assert source_detail["source"] == "brent-derived"
    assert "1.20" in str(source_detail.get("method"))
    assert source_detail["primary_error"] == "source down"


def test_latest_market_snapshots_query_returns_one_row_per_metric() -> None:
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)

    with Session(engine) as db:
        older = datetime(2026, 1, 1, tzinfo=UTC)
        newer = datetime(2026, 1, 2, tzinfo=UTC)
        for item in market.DEFAULT_MARKET_METRICS:
            db.add(
                MarketSnapshot(
                    source_key=item["source_key"],
                    metric_key=item["metric_key"],
                    value=1.0,
                    unit=item["unit"],
                    as_of=older,
                    payload={},
                )
            )
            db.add(
                MarketSnapshot(
                    source_key=item["source_key"],
                    metric_key=item["metric_key"],
                    value=2.0,
                    unit=item["unit"],
                    as_of=newer,
                    payload={},
                )
            )
        db.commit()

        latest = market._latest_market_snapshots_by_metric(db)

    assert set(latest) == {item["metric_key"] for item in market.DEFAULT_MARKET_METRICS}
    assert all(float(row.value) == 2.0 for row in latest.values())


# Trimmed from https://www.eia.gov/todayinenergy/prices.php as served on 2026-09-23.
EIA_PRICES_HTML = """
<table summary="Spot Petroleum Prices" class="t2 basic-table">
<tr class="prices_table_title"> <td colspan="4"> <b>Wholesale Spot Petroleum Prices, 9/21/26 Close</b> </td> </tr>
<tr valign="top"> <td class="s1" rowspan="3">Crude Oil<br> ($/barrel)</td>
<td class="s2">WTI</td> <td class="d1">96.97</td> <td class="dn">-4.4</td> </tr>
<tr> <td class="s2">Brent</td> <td class="d1">116.15</td> <td class="dn">-2.9</td> </tr>
</table>
<b> Retail Petroleum Prices (<a href="http://www.fuelgaugereport.com/">AAA</a>), 9/20/26 ($/gallon) </b>
"""


def test_parse_eia_brent_quote_reads_date_from_wholesale_table_title() -> None:
    assert market._parse_eia_brent_quote(EIA_PRICES_HTML) == (116.15, datetime(2026, 9, 21, tzinfo=UTC))


# Trimmed from https://www.eia.gov/dnav/pet/pet_pri_spt_s1_d.htm as served on 2026-09-23.
EIA_SPOT_HTML = """
<tr> <th class="Series5">09/11/26</th> <th class="Series5">09/14/26</th> <th class="Series5">09/15/26</th> </tr>
<tr class="DataRow"> <td class="DataStub2">Kerosene-Type Jet Fuel<br> </td> </tr>
<tr class="DataRow"> <td width="228" class="DataStub"> <table class="data2"> <tr> <td width="3"></td>
<td class="DataStub1">U.S. Gulf Coast</td> </tr> </table> </td>
<td width="76" class="DataB">4.521</td> <td width="76" class="DataB">4.488</td> <td width="76" class="Current2">NA</td>
<td width="76" class="DataHist"><a href="./hist/LeafHandler.ashx" class="Hist">1990-2026</a></td> </tr>
"""


def test_parse_eia_spot_jet_skips_na_and_keeps_its_own_date() -> None:
    assert market._parse_eia_spot_jet_gulf_coast(EIA_SPOT_HTML) == (4.488, datetime(2026, 9, 14, tzinfo=UTC))


def test_jet_ingest_falls_back_to_eia_when_fred_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_fetch(url: str, timeout_s: float | None = None) -> str:
        if "fred" in url:
            raise TimeoutError("The read operation timed out")
        return EIA_SPOT_HTML

    monkeypatch.setattr(market, "_fetch_text", fake_fetch)
    details: dict[str, object] = {"sources": {}}

    value = market._ingest_jet_market_value(details)

    jet = details["sources"]["jet"]  # type: ignore[index]
    assert value == pytest.approx(round(4.488 / 3.785411784, 3))
    assert jet["source"] == "eia"
    assert jet["status"] == "ok"
    assert jet["observed_at"].startswith("2026-09-14")


EIA_SPOT_WITH_BRENT_HTML = """
<tr> <th class="Series5">09/14/26</th> <th class="Series5">09/15/26</th> <th class="Series5">09/16/26</th> </tr>
<tr class="DataRow"> <td class="DataStub"> <table class="data2"> <tr>
<td class="DataStub1">Brent - Europe</td> </tr> </table> </td>
<td class="DataB">121.25</td> <td class="DataB">130.80</td> <td class="Current2">128.00</td> </tr>
<tr class="DataRow"> <td class="DataStub2">Kerosene-Type Jet Fuel<br> </td> </tr>
<tr class="DataRow"> <td class="DataStub"> <table class="data2"> <tr>
<td class="DataStub1">U.S. Gulf Coast</td> </tr> </table> </td>
<td class="DataB">4.488</td> <td class="DataB">4.705</td> <td class="Current2">NA</td> </tr>
"""


def test_jet_brent_ratio_uses_latest_day_eia_prints_both() -> None:
    ratio, day = market._parse_eia_spot_jet_brent_ratio(EIA_SPOT_WITH_BRENT_HTML)

    assert day == datetime(2026, 9, 15, tzinfo=UTC)
    assert ratio == pytest.approx((4.705 / market.LITERS_PER_US_GALLON) / (130.80 / market.LITERS_PER_BARREL))


def test_jet_eu_proxy_uses_same_day_ratio_instead_of_fixed_multiplier(monkeypatch: pytest.MonkeyPatch) -> None:
    # 2026-09-23: EIA Gulf jet/Brent was 1.51; the fixed 1.20 put the EU proxy at
    # 0.867 USD/L while US Gulf jet traded at 1.243.
    monkeypatch.setattr(market, "_fetch_text", lambda _url: (_ for _ in ()).throw(RuntimeError("ARA down")))
    details: dict[str, object] = {"sources": {}}
    observed = datetime(2026, 9, 15, tzinfo=UTC)

    result = market._ingest_jet_eu_market_value(
        details,
        brent_value=114.89,
        seed_by_key={},
        jet_brent_ratio=(1.5108, observed),
    )

    detail = details["sources"]["jet_eu_proxy"]
    assert result == round(114.89 / market.LITERS_PER_BARREL * 1.5108, 3)
    assert detail["jet_brent_ratio"] == pytest.approx(1.5108)
    assert "1.511" in detail["method"] and "2026-09-15" in detail["method"]

    now = datetime.now(UTC)
    sources = {
        "brent": {"source": "eia", "status": "ok", "quality": "observed", "value": 114.89, "observed_at": now.isoformat()},
        "jet_eu_proxy": detail,
        "rotterdam_jet_fuel": {"source": "rotterdam-jet-direct", "status": "error", "quality": "missing"},
    }
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)
    with Session(engine) as db:
        _values, published = market._apply_public_quote_policy(db, sources, now=now)
        # The snapshot endpoint re-publishes the persisted run on every read.
        _values, republished = market._apply_public_quote_policy(db, published, now=now)

    for result in (published, republished):
        for key in ("jet_eu_proxy", "rotterdam_jet_fuel"):
            assert result[key]["status"] == "estimated"
            assert result[key]["value"] == round(114.89 / market.LITERS_PER_BARREL * 1.5108, 3)
            assert "1.511" in result[key]["method"]


def test_stale_jet_brent_ratio_falls_back_to_fixed_multiplier(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(market, "_fetch_text", lambda _url: EIA_SPOT_WITH_BRENT_HTML)
    monkeypatch.setattr(market, "utcnow", lambda: datetime(2026, 10, 30, tzinfo=UTC))

    assert market._ingest_jet_brent_ratio() is None
