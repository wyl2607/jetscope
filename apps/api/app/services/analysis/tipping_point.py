from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.tables import MarketSnapshot, TippingEvent
from app.services.analysis.breakeven import compute_breakeven_oil_price
from app.services.analysis.pathway_costs import effective_saf_cost
from app.services.market_quality import SIGNAL_QUALITIES

TippingEventType = Literal["CRITICAL", "ALERT", "CROSSOVER"]


class TippingPointEngine:
    PATHWAY_PRIORITY: tuple[str, ...] = ("hefa", "atj", "ft", "ptl")
    FOSSIL_METRIC_PRIORITY: tuple[str, ...] = (
        "rotterdam_jet_fuel_usd_per_l",
        "jet_eu_proxy_usd_per_l",
        "jet_usd_per_l",
    )
    DEDUPE_WINDOW = timedelta(hours=24)
    JET_PROXY_SLOPE = 0.0082
    JET_PROXY_INTERCEPT = 0.12

    def evaluate(self, now: datetime, db: Session) -> list[TippingEvent]:
        now_utc = self._as_utc(now)
        fossil_price = self._latest_fossil_price(db)
        if fossil_price is None:
            return []

        events: list[TippingEvent] = []
        for pathway in self.PATHWAY_PRIORITY:
            saf_effective = effective_saf_cost(pathway)
            gap = fossil_price - saf_effective
            event_type = self._event_type_for_gap(gap)
            if event_type is None:
                continue
            if self._seen_recent_event(db, event_type, pathway, now_utc):
                continue

            breakeven_oil = compute_breakeven_oil_price(
                saf_effective_usd_per_l=saf_effective,
                jet_proxy_slope=self.JET_PROXY_SLOPE,
                jet_proxy_intercept=self.JET_PROXY_INTERCEPT,
            )
            events.append(
                TippingEvent(
                    event_type=event_type,
                    saf_pathway=pathway,
                    fossil_price=round(float(fossil_price), 4),
                    saf_effective_price=round(float(saf_effective), 4),
                    gap_usd_per_litre=round(float(gap), 4),
                    timestamp=now_utc,
                    metadata_={
                        "breakeven_oil_price_usd_per_bbl": round(float(breakeven_oil), 4),
                        "jet_proxy_slope": self.JET_PROXY_SLOPE,
                        "jet_proxy_intercept": self.JET_PROXY_INTERCEPT,
                    },
                )
            )
        return events

    def record_events(self, events: list[TippingEvent], db: Session) -> None:
        if not events:
            return
        db.add_all(events)
        db.commit()

    def fetch_events(
        self,
        db: Session,
        *,
        since: datetime | None = None,
        limit: int = 100,
    ) -> list[TippingEvent]:
        query = select(TippingEvent).order_by(TippingEvent.timestamp.desc(), TippingEvent.id.desc()).limit(limit)
        if since is not None:
            query = query.where(TippingEvent.timestamp >= self._as_utc(since))
        return list(db.scalars(query).all())

    def _latest_fossil_price(self, db: Session) -> float | None:
        ranked: list[tuple[int, float]] = []
        for index, metric_key in enumerate(self.FOSSIL_METRIC_PRIORITY):
            latest = db.scalar(
                select(MarketSnapshot)
                .where(MarketSnapshot.metric_key == metric_key)
                .order_by(MarketSnapshot.as_of.desc())
                .limit(1)
            )
            if latest is None or float(latest.value) <= 0:
                continue
            payload = getattr(latest, "payload", None)
            if not isinstance(payload, dict):
                payload = {}
            quality = str(payload.get("quality") or ("seed" if payload.get("seed") else "observed"))
            if quality not in SIGNAL_QUALITIES:
                continue
            ranked.append((index if quality == "observed" else 10 + index, float(latest.value)))
        if not ranked:
            return None
        ranked.sort()
        return ranked[0][1]

    def _seen_recent_event(
        self,
        db: Session,
        event_type: TippingEventType,
        saf_pathway: str,
        now: datetime,
    ) -> bool:
        dedupe_since = now - self.DEDUPE_WINDOW
        existing = db.scalar(
            select(TippingEvent.id)
            .where(
                TippingEvent.event_type == event_type,
                TippingEvent.saf_pathway == saf_pathway,
                TippingEvent.timestamp >= dedupe_since,
            )
            .limit(1)
        )
        return existing is not None

    @staticmethod
    def _as_utc(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    @staticmethod
    def _event_type_for_gap(gap: float) -> TippingEventType | None:
        if gap > 0:
            return "CROSSOVER"
        if gap > -0.05:
            return "CRITICAL"
        if gap > -0.20:
            return "ALERT"
        return None
