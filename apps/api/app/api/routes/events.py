"""Curated aviation events (verified facts only, no live scraping)."""

from fastapi import APIRouter, HTTPException

from app.services.curated_events import get_curated_event, list_curated_events

router = APIRouter()


@router.get("")
def list_events() -> dict:
    events = list_curated_events()
    return {"count": len(events), "events": events}


@router.get("/{event_id}")
def get_event(event_id: str) -> dict:
    event = get_curated_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Unknown event_id: {event_id}")
    return event
