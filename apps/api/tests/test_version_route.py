from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.router import api_router
from app.core.config import settings


def test_version_reports_build_sha(monkeypatch):
    monkeypatch.setattr(settings, "build_sha", "abc1234")
    app = FastAPI()
    app.include_router(api_router, prefix="/v1")

    response = TestClient(app).get("/v1/version")

    assert response.status_code == 200
    assert response.json() == {"service": "api", "commit": "abc1234"}
