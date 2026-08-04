"""Load curated aviation events from repo data/curated/*.json only."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

# apps/api/app/services -> repo root is parents[4]? 
# services -> app -> api -> apps -> jetscope root
# Path: jetscope/apps/api/app/services/curated_events.py
# parents[0]=services, [1]=app, [2]=api, [3]=apps, [4]=jetscope
_REPO_ROOT = Path(__file__).resolve().parents[4]
_CURATED_DIR = _REPO_ROOT / "data" / "curated"


def curated_dir() -> Path:
    return _CURATED_DIR


def list_curated_events() -> list[dict[str, Any]]:
    if not _CURATED_DIR.is_dir():
        return []
    events: list[dict[str, Any]] = []
    for path in sorted(_CURATED_DIR.glob("*.json")):
        with path.open(encoding="utf-8") as handle:
            payload = json.load(handle)
        if not isinstance(payload, dict):
            continue
        events.append(
            {
                "file": path.name,
                "id": payload.get("id"),
                "as_of": payload.get("as_of"),
                "source": payload.get("source"),
                "entity": payload.get("entity"),
                "verified_facts": payload.get("verified_facts"),
                "explicitly_not_in_source": payload.get("explicitly_not_in_source"),
                "jetscope_mapping": payload.get("jetscope_mapping"),
            }
        )
    return events


def get_curated_event(event_id: str) -> dict[str, Any] | None:
    for event in list_curated_events():
        if event.get("id") == event_id:
            return event
    return None
