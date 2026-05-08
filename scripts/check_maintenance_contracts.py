#!/usr/bin/env python3
"""Validate the minimal repo maintenance contract files."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def require(path: str) -> Path:
    target = ROOT / path
    if not target.exists():
        raise SystemExit(f"missing required maintenance file: {path}")
    return target


def require_text(path: str, needles: list[str]) -> None:
    text = require(path).read_text(encoding="utf-8")
    missing = [needle for needle in needles if needle not in text]
    if missing:
        raise SystemExit(f"{path} missing required text: {', '.join(missing)}")


def main() -> int:
    require_text(
        ".github/workflows/codex-daily-audit.yml",
        [
            "openai/codex-action@v1",
            "prompt-file: .github/prompts/codex-daily-audit.md",
            "sandbox: read-only",
            "safety-strategy: read-only",
            "permissions:",
            "contents: read",
        ],
    )
    require_text(
        ".github/workflows/maintenance-gates.yml",
        [
            "semgrep scan",
            "markdownlint-cli2",
            "vale --minAlertLevel=error",
        ],
    )
    require_text(
        "AGENTS.md",
        [
            "AGENTS.md - Workspace AI Entry",
            ".evolver/",
            "scripts/review_push_guard.sh origin/main",
        ],
    )

    contract = json.loads(require(".evolver/contract.json").read_text(encoding="utf-8"))
    if contract.get("default_mode") != "read-only":
        raise SystemExit(".evolver/contract.json default_mode must be read-only")
    forbidden = set(contract.get("forbidden") or [])
    for item in ("secrets", "runtime-queues", "obsidian-vault-excerpts"):
        if item not in forbidden:
            raise SystemExit(f".evolver/contract.json must forbid {item}")
    promotion = contract.get("promotion_policy") or {}
    if promotion.get("deploy") != "forbidden" or promotion.get("sync") != "forbidden":
        raise SystemExit(".evolver/contract.json must forbid deploy and sync")
    print("maintenance_contracts: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
