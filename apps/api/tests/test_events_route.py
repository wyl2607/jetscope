from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.router import api_router


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(api_router, prefix="/v1")
    return TestClient(app)


def test_list_events_count_matches_events():
    response = _client().get("/v1/events")

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == len(payload["events"])
    assert payload["count"] >= 1


def test_every_listed_event_has_detail_route():
    client = _client()
    events = client.get("/v1/events").json()["events"]

    for event in events:
        response = client.get(f"/v1/events/{event['id']}")
        assert response.status_code == 200, event["id"]
        assert response.json()["id"] == event["id"]


def test_unknown_event_returns_404_with_detail():
    response = _client().get("/v1/events/does-not-exist")

    assert response.status_code == 404
    assert "Unknown event_id" in response.json()["detail"]


def test_lufthansa_event_is_present():
    response = _client().get("/v1/events")

    ids = {event["id"] for event in response.json()["events"]}
    assert "lufthansa-q2-2026-earnings" in ids
