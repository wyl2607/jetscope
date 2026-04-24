from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.config import settings

NEWSAPI_URL = "https://newsapi.org/v2/everything"
REUTERS_COMMODITIES_RSS = "https://www.reutersagency.com/feed/?best-topics=commodities&post_type=best"
NEWS_QUERY = (
    '"sustainable aviation fuel" OR "jet fuel shortage" OR "ReFuelEU" OR "SAF mandate"'
)


@dataclass(slots=True)
class RawArticle:
    title: str
    url: str
    excerpt: str
    published_at: datetime
    source: str


class NewsScraper:
    def __init__(self, newsapi_key: str | None = None) -> None:
        self._newsapi_key = (newsapi_key if newsapi_key is not None else settings.newsapi_key).strip()

    def fetch_recent(self) -> list[RawArticle]:
        articles = self._fetch_newsapi() if self._newsapi_key else []
        if articles:
            return self._dedupe(articles)
        return self._dedupe(self._fetch_reuters_rss())

    def _fetch_newsapi(self) -> list[RawArticle]:
        try:
            response = httpx.get(
                NEWSAPI_URL,
                params={
                    "q": NEWS_QUERY,
                    "language": "en",
                    "sortBy": "publishedAt",
                    "pageSize": 20,
                    "apiKey": self._newsapi_key,
                },
                timeout=15.0,
                headers={"User-Agent": "JetScope-AI-Research/1.0"},
            )
            response.raise_for_status()
            payload = response.json()
        except Exception:
            return []

        records = payload.get("articles", [])
        output: list[RawArticle] = []
        for item in records:
            url = (item.get("url") or "").strip()
            title = (item.get("title") or "").strip()
            if not url or not title:
                continue
            output.append(
                RawArticle(
                    title=title,
                    url=url,
                    excerpt=(item.get("description") or "").strip(),
                    published_at=self._parse_dt(item.get("publishedAt")),
                    source=((item.get("source") or {}).get("name") or "newsapi").strip(),
                )
            )
        return output

    def _fetch_reuters_rss(self) -> list[RawArticle]:
        import feedparser

        try:
            feed = feedparser.parse(REUTERS_COMMODITIES_RSS)
        except Exception:
            return []

        entries = getattr(feed, "entries", []) or []
        output: list[RawArticle] = []
        for entry in entries:
            url = (getattr(entry, "link", "") or "").strip()
            title = (getattr(entry, "title", "") or "").strip()
            if not url or not title:
                continue
            output.append(
                RawArticle(
                    title=title,
                    url=url,
                    excerpt=(getattr(entry, "summary", "") or "").strip(),
                    published_at=self._parse_dt(
                        getattr(entry, "published", None) or getattr(entry, "updated", None)
                    ),
                    source="Reuters",
                )
            )
        return output

    @staticmethod
    def _parse_dt(value: Any) -> datetime:
        if isinstance(value, datetime):
            dt = value
        elif isinstance(value, str) and value:
            dt = NewsScraper._parse_datetime_str(value)
        else:
            return datetime.now(timezone.utc)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)

    @staticmethod
    def _parse_datetime_str(value: str) -> datetime:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            from email.utils import parsedate_to_datetime

            parsed = parsedate_to_datetime(value)
            if parsed is None:
                return datetime.now(timezone.utc)
            return parsed

    @staticmethod
    def _dedupe(items: list[RawArticle]) -> list[RawArticle]:
        seen: set[str] = set()
        unique: list[RawArticle] = []
        for article in items:
            if article.url in seen:
                continue
            seen.add(article.url)
            unique.append(article)
        return unique
