from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pytest

from app.services.ai_research.scraper import NewsScraper, RawArticle


class TestRawArticle:
    def test_constructs_and_exposes_fields(self) -> None:
        dt = datetime(2026, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
        article = RawArticle(
            title="SAF mandate update",
            url="https://example.com/saf-1",
            excerpt="Excerpt text",
            published_at=dt,
            source="Reuters",
        )
        assert article.title == "SAF mandate update"
        assert article.url == "https://example.com/saf-1"
        assert article.excerpt == "Excerpt text"
        assert article.published_at == dt
        assert article.source == "Reuters"


class TestParseDt:
    def test_from_datetime_object(self) -> None:
        dt = datetime(2026, 5, 15, 10, 30, 0, tzinfo=timezone.utc)
        result = NewsScraper._parse_dt(dt)
        assert result == dt
        assert result.tzinfo is not None

    def test_from_datetime_naive_gets_utc(self) -> None:
        naive = datetime(2026, 5, 15, 10, 30, 0)
        result = NewsScraper._parse_dt(naive)
        assert result == naive.replace(tzinfo=timezone.utc)

    def test_from_iso_string(self) -> None:
        result = NewsScraper._parse_dt("2026-05-15T10:30:00Z")
        assert result == datetime(2026, 5, 15, 10, 30, 0, tzinfo=timezone.utc)

    def test_from_iso_string_with_offset(self) -> None:
        result = NewsScraper._parse_dt("2026-05-15T12:30:00+02:00")
        assert result == datetime(2026, 5, 15, 10, 30, 0, tzinfo=timezone.utc)

    def test_from_email_date_string(self) -> None:
        result = NewsScraper._parse_dt("Thu, 04 Jun 2026 08:15:00 +0000")
        assert result == datetime(2026, 6, 4, 8, 15, 0, tzinfo=timezone.utc)

    def test_from_none_returns_now(self) -> None:
        before = datetime.now(timezone.utc)
        result = NewsScraper._parse_dt(None)
        after = datetime.now(timezone.utc)
        assert before <= result <= after

    def test_from_empty_string_returns_now(self) -> None:
        result = NewsScraper._parse_dt("")
        assert isinstance(result, datetime)
        assert result.tzinfo is not None


class TestParseDatetimeStr:
    def test_iso_format(self) -> None:
        result = NewsScraper._parse_datetime_str("2026-06-01T00:00:00Z")
        assert result == datetime(2026, 6, 1, 0, 0, 0, tzinfo=timezone.utc)

    def test_email_date_format(self) -> None:
        result = NewsScraper._parse_datetime_str("Mon, 01 Jun 2026 12:00:00 +0000")
        assert result == datetime(2026, 6, 1, 12, 0, 0, tzinfo=timezone.utc)

    def test_invalid_string_raises(self) -> None:
        with pytest.raises((ValueError, Exception)):
            NewsScraper._parse_datetime_str("not-a-date")


class TestDedupe:
    def test_removes_duplicate_urls(self) -> None:
        articles = [
            RawArticle("A", "https://example.com/1", "a", datetime.now(timezone.utc), "S1"),
            RawArticle("B", "https://example.com/2", "b", datetime.now(timezone.utc), "S2"),
            RawArticle("C", "https://example.com/1", "c", datetime.now(timezone.utc), "S3"),
        ]
        result = NewsScraper._dedupe(articles)
        assert len(result) == 2
        assert result[0].title == "A"
        assert result[1].title == "B"

    def test_empty_input_returns_empty(self) -> None:
        assert NewsScraper._dedupe([]) == []

    def test_preserves_order_of_first_occurrence(self) -> None:
        articles = [
            RawArticle("First", "https://example.com/u", "f", datetime.now(timezone.utc), "S"),
            RawArticle("Second", "https://example.com/u", "s", datetime.now(timezone.utc), "S"),
        ]
        result = NewsScraper._dedupe(articles)
        assert len(result) == 1
        assert result[0].title == "First"


class TestInit:
    def test_with_explicit_key(self) -> None:
        scraper = NewsScraper(newsapi_key="test-key-123")
        assert scraper._newsapi_key == "test-key-123"

    def test_strips_whitespace_from_key(self) -> None:
        scraper = NewsScraper(newsapi_key="  spaced-key  ")
        assert scraper._newsapi_key == "spaced-key"

    def test_falls_back_to_settings(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from app.core.config import settings

        monkeypatch.setattr(settings, "newsapi_key", "settings-key")
        scraper = NewsScraper()
        assert scraper._newsapi_key == "settings-key"


class FakeResponse:
    def __init__(self, status_code: int, json_data: Any) -> None:
        self._status = status_code
        self._json = json_data

    def json(self) -> Any:
        return self._json

    def raise_for_status(self) -> None:
        if self._status >= 400:
            raise httpx.HTTPStatusError("error", request=None, response=self)


import httpx


class TestFetchNewsapi:
    def test_parses_valid_articles(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def fake_get(url, **kwargs):
            return FakeResponse(
                200,
                {
                    "articles": [
                        {
                            "url": "https://newsapi.org/a1",
                            "title": "SAF breakthrough",
                            "description": "New SAF tech",
                            "publishedAt": "2026-06-01T10:00:00Z",
                            "source": {"name": "NewsSource"},
                        },
                        {
                            "url": "https://newsapi.org/a2",
                            "title": "Jet fuel prices",
                            "description": "Price surge",
                            "publishedAt": "2026-06-01T09:00:00Z",
                            "source": {"name": "FinanceDaily"},
                        },
                    ]
                },
            )

        monkeypatch.setattr(httpx, "get", fake_get)
        scraper = NewsScraper(newsapi_key="key")
        result = scraper._fetch_newsapi()

        assert len(result) == 2
        assert result[0].title == "SAF breakthrough"
        assert result[0].url == "https://newsapi.org/a1"
        assert result[0].excerpt == "New SAF tech"
        assert result[0].published_at == datetime(2026, 6, 1, 10, 0, 0, tzinfo=timezone.utc)
        assert result[0].source == "NewsSource"
        assert result[1].source == "FinanceDaily"

    def test_skips_articles_without_url_or_title(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def fake_get(url, **kwargs):
            return FakeResponse(
                200,
                {
                    "articles": [
                        {"url": "", "title": "No URL", "description": "x", "publishedAt": None, "source": None},
                        {"url": "https://ok", "title": "", "description": "x", "publishedAt": None, "source": None},
                        {"url": "https://valid", "title": "Valid", "description": "x", "publishedAt": None, "source": None},
                    ]
                },
            )

        monkeypatch.setattr(httpx, "get", fake_get)
        scraper = NewsScraper(newsapi_key="key")
        result = scraper._fetch_newsapi()

        assert len(result) == 1
        assert result[0].title == "Valid"

    def test_empty_articles_returns_empty_list(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def fake_get(url, **kwargs):
            return FakeResponse(200, {"articles": []})

        monkeypatch.setattr(httpx, "get", fake_get)
        scraper = NewsScraper(newsapi_key="key")
        assert scraper._fetch_newsapi() == []

    def test_http_error_returns_empty_list(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def fake_get(url, **kwargs):
            return FakeResponse(500, {})

        monkeypatch.setattr(httpx, "get", fake_get)
        scraper = NewsScraper(newsapi_key="key")
        assert scraper._fetch_newsapi() == []


import types


class TestFetchReutersRss:
    def test_parses_feed_entries(self, monkeypatch: pytest.MonkeyPatch) -> None:
        feedparser = types.ModuleType("feedparser")

        class FakeEntry:
            link = "https://reuters.com/commodity-1"
            title = "Commodity prices rise"
            summary = "A summary of commodities"
            published = "Thu, 04 Jun 2026 08:00:00 +0000"

        class FakeFeed:
            entries = [FakeEntry()]

        feedparser.parse = lambda _url: FakeFeed()
        monkeypatch.setitem(__import__("sys").modules, "feedparser", feedparser)

        scraper = NewsScraper(newsapi_key="")
        result = scraper._fetch_reuters_rss()

        assert len(result) == 1
        assert result[0].title == "Commodity prices rise"
        assert result[0].url == "https://reuters.com/commodity-1"
        assert result[0].excerpt == "A summary of commodities"
        assert result[0].source == "Reuters"
        assert result[0].published_at == datetime(2026, 6, 4, 8, 0, 0, tzinfo=timezone.utc)

    def test_parse_exception_returns_empty_list(self, monkeypatch: pytest.MonkeyPatch) -> None:
        feedparser = types.ModuleType("feedparser")
        feedparser.parse = lambda _url: (_ for _ in ()).throw(Exception("network error"))
        monkeypatch.setitem(__import__("sys").modules, "feedparser", feedparser)

        scraper = NewsScraper(newsapi_key="")
        assert scraper._fetch_reuters_rss() == []


class TestFetchRecent:
    def test_uses_newsapi_when_key_set(self, monkeypatch: pytest.MonkeyPatch) -> None:
        recorded: list[str] = []

        def fake_newsapi(self_obj) -> list[RawArticle]:
            recorded.append("newsapi")
            return [
                RawArticle("A", "https://a.com", "a", datetime.now(timezone.utc), "N1"),
                RawArticle("B", "https://b.com", "b", datetime.now(timezone.utc), "N2"),
            ]

        def fake_reuters(self_obj) -> list[RawArticle]:
            recorded.append("reuters")
            return []

        monkeypatch.setattr(NewsScraper, "_fetch_newsapi", fake_newsapi)
        monkeypatch.setattr(NewsScraper, "_fetch_reuters_rss", fake_reuters)

        scraper = NewsScraper(newsapi_key="key")
        result = scraper.fetch_recent()

        assert recorded == ["newsapi"]
        assert len(result) == 2

    def test_uses_reuters_when_key_empty(self, monkeypatch: pytest.MonkeyPatch) -> None:
        recorded: list[str] = []

        def fake_newsapi(self_obj) -> list[RawArticle]:
            recorded.append("newsapi")
            return []

        def fake_reuters(self_obj) -> list[RawArticle]:
            recorded.append("reuters")
            return [
                RawArticle("R1", "https://r.com/1", "r1", datetime.now(timezone.utc), "Reuters"),
            ]

        monkeypatch.setattr(NewsScraper, "_fetch_newsapi", fake_newsapi)
        monkeypatch.setattr(NewsScraper, "_fetch_reuters_rss", fake_reuters)

        scraper = NewsScraper(newsapi_key="")
        result = scraper.fetch_recent()

        assert recorded == ["reuters"]
        assert len(result) == 1
        assert result[0].source == "Reuters"

    def test_dedupe_applied_to_results(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def fake_newsapi(self_obj) -> list[RawArticle]:
            return [
                RawArticle("A", "https://dup.com", "a", datetime.now(timezone.utc), "N1"),
                RawArticle("B", "https://dup.com", "b", datetime.now(timezone.utc), "N2"),
            ]

        monkeypatch.setattr(NewsScraper, "_fetch_newsapi", fake_newsapi)

        scraper = NewsScraper(newsapi_key="key")
        result = scraper.fetch_recent()

        assert len(result) == 1
        assert result[0].title == "A"
