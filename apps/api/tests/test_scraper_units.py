from __future__ import annotations

from datetime import datetime, timezone
import importlib.util
from pathlib import Path
import sys
import types

import pytest


ROOT = Path(__file__).resolve().parents[1]
SCRAPER_PATH = ROOT / "app" / "services" / "ai_research" / "scraper.py"

sys.modules.setdefault("app", types.ModuleType("app"))
sys.modules.setdefault("app.core", types.ModuleType("app.core"))
sys.modules.setdefault(
    "app.core.config",
    types.SimpleNamespace(settings=types.SimpleNamespace(newsapi_key="")),
)

spec = importlib.util.spec_from_file_location("app.services.ai_research.scraper", SCRAPER_PATH)
assert spec is not None
assert spec.loader is not None
scraper = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = scraper
spec.loader.exec_module(scraper)

NewsScraper = scraper.NewsScraper
RawArticle = scraper.RawArticle


def test_parse_dt_normalizes_supported_inputs_to_utc():
    iso_dt = NewsScraper._parse_dt("2026-06-01T10:15:30+02:00")
    naive_dt = NewsScraper._parse_dt(datetime(2026, 6, 1, 10, 15, 30))
    rss_dt = NewsScraper._parse_dt("Mon, 01 Jun 2026 08:15:30 GMT")

    assert iso_dt == datetime(2026, 6, 1, 8, 15, 30, tzinfo=timezone.utc)
    assert naive_dt == datetime(2026, 6, 1, 10, 15, 30, tzinfo=timezone.utc)
    assert rss_dt == datetime(2026, 6, 1, 8, 15, 30, tzinfo=timezone.utc)


def test_fetch_recent_uses_newsapi_payload_and_dedupes(monkeypatch: pytest.MonkeyPatch):
    captured: dict = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "articles": [
                    {
                        "title": " SAF mandate update ",
                        "url": " https://example.test/saf ",
                        "description": " Policy detail ",
                        "publishedAt": "2026-06-01T08:00:00Z",
                        "source": {"name": " Example News "},
                    },
                    {
                        "title": "duplicate should be dropped",
                        "url": "https://example.test/saf",
                        "description": "duplicate",
                        "publishedAt": "2026-06-01T09:00:00Z",
                        "source": {"name": "Duplicate"},
                    },
                    {
                        "title": "missing url should be skipped",
                        "url": "",
                    },
                    {
                        "title": "",
                        "url": "https://example.test/missing-title",
                    },
                ]
            }

    def fake_get(url, *, params, timeout, headers):
        captured.update({"url": url, "params": params, "timeout": timeout, "headers": headers})
        return FakeResponse()

    def fail_if_rss_called(self):
        raise AssertionError("Reuters fallback should not run when NewsAPI returns articles")

    monkeypatch.setattr(scraper.httpx, "get", fake_get)
    monkeypatch.setattr(NewsScraper, "_fetch_reuters_rss", fail_if_rss_called)

    articles = NewsScraper(newsapi_key=" api-key ").fetch_recent()

    assert captured["url"] == scraper.NEWSAPI_URL
    assert captured["params"]["apiKey"] == "api-key"
    assert captured["params"]["pageSize"] == 20
    assert captured["headers"]["User-Agent"] == "JetScope-AI-Research/1.0"
    assert articles == [
        RawArticle(
            title="SAF mandate update",
            url="https://example.test/saf",
            excerpt="Policy detail",
            published_at=datetime(2026, 6, 1, 8, 0, tzinfo=timezone.utc),
            source="Example News",
        )
    ]


def test_fetch_recent_falls_back_to_reuters_when_newsapi_fails(monkeypatch: pytest.MonkeyPatch):
    def fake_get(*args, **kwargs):
        raise RuntimeError("network unavailable")

    def fake_parse(url):
        assert url == scraper.REUTERS_COMMODITIES_RSS
        return types.SimpleNamespace(
            entries=[
                types.SimpleNamespace(
                    link=" https://reuters.test/commodities ",
                    title=" Jet fuel markets ",
                    summary=" Supply note ",
                    published="Mon, 01 Jun 2026 08:15:30 GMT",
                ),
                types.SimpleNamespace(link="", title="missing link"),
                types.SimpleNamespace(link="https://reuters.test/missing-title", title=""),
            ]
        )

    monkeypatch.setattr(scraper.httpx, "get", fake_get)
    monkeypatch.setitem(sys.modules, "feedparser", types.SimpleNamespace(parse=fake_parse))

    articles = NewsScraper(newsapi_key="api-key").fetch_recent()

    assert len(articles) == 1
    assert articles[0].title == "Jet fuel markets"
    assert articles[0].url == "https://reuters.test/commodities"
    assert articles[0].excerpt == "Supply note"
    assert articles[0].published_at == datetime(2026, 6, 1, 8, 15, 30, tzinfo=timezone.utc)
    assert articles[0].source == "Reuters"


def test_fetch_recent_with_blank_key_skips_newsapi(monkeypatch: pytest.MonkeyPatch):
    def fail_if_newsapi_called(*args, **kwargs):
        raise AssertionError("NewsAPI should not be called without a configured key")

    rss_article = RawArticle(
        title="Reuters only",
        url="https://reuters.test/only",
        excerpt="fallback",
        published_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
        source="Reuters",
    )

    monkeypatch.setattr(scraper.httpx, "get", fail_if_newsapi_called)
    monkeypatch.setattr(NewsScraper, "_fetch_reuters_rss", lambda self: [rss_article])

    assert NewsScraper(newsapi_key="   ").fetch_recent() == [rss_article]
