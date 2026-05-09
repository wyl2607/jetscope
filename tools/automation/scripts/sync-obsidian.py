#!/usr/bin/env python3
"""One-way project→Obsidian mirror sync. Dry-run by default. Registry-gated."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List

SCRIPT_DIR = Path(__file__).resolve().parent
AUTOMATION = Path(os.environ.get("AUTOMATION_ROOT", str(SCRIPT_DIR.parent))).expanduser()
REGISTRY = AUTOMATION / "workspace-guides" / "evolution-registry.json"
DEFAULT_OUT = AUTOMATION / "runtime" / "self-evolution" / "mirror-sync-report.json"


def load_registry() -> dict:
    with open(REGISTRY) as f:
        return json.load(f)


def source_truth(pair: dict[str, Any]) -> str:
    return str(pair.get("sourceOfTruth") or pair.get("source_of_truth") or "project")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sync_plan(registry: dict, apply: bool = False) -> Dict[str, Any]:
    pairs = registry.get("mirrorPairs", [])
    actions: List[Dict[str, Any]] = []
    for pair in pairs:
        status = pair.get("status", "")
        if status == "proposed":
            actions.append({
                "pair_id": pair["id"],
                "action": "skip",
                "reason": "proposed mirror requires human approval before sync",
                "source": pair["source"],
                "mirror": pair["mirror"],
            })
            continue
        if pair.get("direction", "") not in ("project-to-obsidian", "project-to-obsidian-derived"):
            actions.append({
                "pair_id": pair["id"],
                "action": "skip",
                "reason": f"direction {pair.get('direction')} not supported for sync",
                "source": pair["source"],
                "mirror": pair["mirror"],
            })
            continue

        pair_source_truth = source_truth(pair)
        if pair_source_truth != "project":
            actions.append({
                "pair_id": pair["id"],
                "action": "skip",
                "reason": f"sync skipped because sourceOfTruth is {pair_source_truth}",
                "source": pair["source"],
                "mirror": pair["mirror"],
                "sourceOfTruth": pair_source_truth,
            })
            continue
        source_path = Path(pair["source"]).expanduser()
        mirror_path = Path(pair["mirror"]).expanduser()
        if not source_path.exists():
            actions.append({
                "pair_id": pair["id"],
                "action": "skip",
                "reason": "source file missing",
                "source": str(source_path),
            })
            continue
        relationship = pair.get("relationship", "mirror")
        if relationship == "derived-index":
            actions.append({
                "pair_id": pair["id"],
                "action": "skip",
                "reason": "derived-index pairs are not 1:1 mirrors; sync is manual",
                "source": str(source_path),
                "mirror": str(mirror_path),
            })
            continue
        source_hash = sha256(source_path)
        mirror_exists = mirror_path.exists()
        mirror_hash = sha256(mirror_path) if mirror_exists else ""
        needs_sync = not mirror_exists or source_hash != mirror_hash
        action = {
            "pair_id": pair["id"],
            "action": "sync-needed" if needs_sync else "in-sync",
            "source": str(source_path),
            "mirror": str(mirror_path),
            "source_hash": source_hash,
            "mirror_hash": mirror_hash,
            "mirror_exists": mirror_exists,
            "sourceOfTruth": pair_source_truth,
            "conflict_policy": pair.get("conflictPolicy", "project-wins"),
            "conflictPolicy": pair.get("conflictPolicy", "project-wins"),
            "direction": pair.get("direction", ""),
            "privacyGate": pair.get("privacyGate"),
        }
        if apply and needs_sync and mirror_exists:
            mirror_path.parent.mkdir(parents=True, exist_ok=True)
            mirror_path.write_text(source_path.read_text())
            action["synced"] = True
            action["post_hash"] = sha256(mirror_path)
        elif apply and needs_sync and not mirror_exists:
            action["action"] = "skip"
            action["reason"] = "proposed mirror target; creation requires approval"
        actions.append(action)
    return {
        "generated_at": __import__("datetime").datetime.now().isoformat(),
        "scanner": "sync-obsidian",
        "registry": str(REGISTRY),
        "apply": apply,
        "pair_count": len(pairs),
        "sync_count": sum(1 for a in actions if a.get("synced")),
        "actions": actions,
    }


def main():
    parser = argparse.ArgumentParser(description="One-way project→Obsidian mirror sync (dry-run by default).")
    parser.add_argument("--apply", action="store_true", help="Actually write mirror files (default: dry-run only).")
    parser.add_argument("--registry", default=str(REGISTRY), help="Path to evolution-registry.json.")
    parser.add_argument("--json-out", default=str(DEFAULT_OUT), help="Path for JSON report output.")
    parser.add_argument("--self-test", action="store_true", help="Run self-test assertions.")
    args = parser.parse_args()

    if args.self_test:
        _self_test()
        return

    registry = load_registry()
    result = sync_plan(registry, apply=args.apply)
    out = Path(args.json_out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"wrote {out}")
    summary = f"synced={result['sync_count']} skipped={sum(1 for a in result['actions'] if a['action'] == 'skip')} in-sync={sum(1 for a in result['actions'] if a['action'] == 'in-sync')} sync-needed={sum(1 for a in result['actions'] if a['action'] == 'sync-needed')}"
    print(f"summary={{{summary}}}")


def _self_test():
    pairs = [
        {
            "id": "test-active-mirror",
            "source": "/tmp/evolver-test-source.txt",
            "mirror": "/tmp/evolver-test-mirror.txt",
            "status": "active",
            "relationship": "mirror",
            "direction": "project-to-obsidian",
            "conflictPolicy": "project-wins",
        },
        {
            "id": "test-proposed",
            "source": "/tmp/evolver-test-proposed.txt",
            "mirror": "/tmp/evolver-test-proposed-mirror.txt",
            "status": "proposed",
            "relationship": "mirror",
            "direction": "project-to-obsidian",
            "conflictPolicy": "project-wins",
        },
        {
            "id": "test-derived",
            "source": "/tmp/evolver-test-derived.txt",
            "mirror": "/tmp/evolver-test-derived-mirror.txt",
            "status": "active",
            "relationship": "derived-index",
            "direction": "project-to-obsidian-derived",
            "conflictPolicy": "do-not-merge-derived-output-back",
        },
    ]
    registry = {"mirrorPairs": pairs}
    # Create test source
    Path("/tmp/evolver-test-source.txt").write_text("hello sync test")
    result = sync_plan(registry, apply=False)
    assert result["pair_count"] == 3
    actions = {a["pair_id"]: a for a in result["actions"]}
    assert actions["test-active-mirror"]["action"] in ("in-sync", "sync-needed")
    assert actions["test-proposed"]["action"] == "skip"
    assert actions["test-derived"]["action"] == "skip"
    Path("/tmp/evolver-test-source.txt").unlink()
    print("self-test: OK")


if __name__ == "__main__":
    main()
