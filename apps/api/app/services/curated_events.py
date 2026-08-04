"""Load curated aviation events from data/curated/*.json only."""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any


def _candidate_curated_dirs(here: Path) -> list[Path]:
    """Resolve curated dir for monorepo checkout and Docker layouts.

    Monorepo: jetscope/apps/api/app/services/curated_events.py → parents[4]/data/curated
    Docker image WORKDIR /app with COPY app → /app/app/services/... → only parents[0..2]
    Docker volume: host data mounted at /app/data → /app/data/curated
    """
    candidates: list[Path] = []
    env_dir = os.environ.get("JETSCOPE_CURATED_DIR", "").strip()
    if env_dir:
        candidates.append(Path(env_dir))
    candidates.append(Path("/app/data/curated"))
    # Safe parent walks (Docker only has parents[0..2] for this file)
    parents = here.parents
    if len(parents) > 2:
        candidates.append(parents[2] / "data" / "curated")  # /app/data when file is /app/app/services/*
    if len(parents) > 4:
        candidates.append(parents[4] / "data" / "curated")  # monorepo root
    return candidates


@lru_cache(maxsize=1)
def curated_dir() -> Path:
    here = Path(__file__).resolve()
    for candidate in _candidate_curated_dirs(here):
        if candidate.is_dir():
            return candidate
    # Prefer monorepo path when present in tree; else Docker volume convention
    parents = here.parents
    if len(parents) > 4:
        return parents[4] / "data" / "curated"
    return Path("/app/data/curated")


def list_curated_events() -> list[dict[str, Any]]:
    directory = curated_dir()
    if not directory.is_dir():
        return []
    events: list[dict[str, Any]] = []
    for path in sorted(directory.glob("*.json")):
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
