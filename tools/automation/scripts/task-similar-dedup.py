#!/usr/bin/env python3
"""Phase H: read-only similar-task dedup and cooldown suggestions."""

from __future__ import annotations

import argparse
import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Sequence, Set


AUTOMATION = Path(__file__).resolve().parent.parent
RUNTIME = AUTOMATION / "runtime"
DEFAULT_STATE = RUNTIME / "dev-control" / "state.json"
DEFAULT_BOARD = RUNTIME / "task-board" / "enriched-board.json"
DEFAULT_OUT = RUNTIME / "multi-agent" / "dedup-cooldown.json"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_runtime_path(path: Path) -> Path:
    resolved = path.expanduser().resolve(strict=False)
    root = RUNTIME.resolve(strict=False)
    if resolved != root and root not in resolved.parents:
        raise SystemExit(f"output must stay under {root}: {resolved}")
    return resolved


def atomic_write_json(path: Path, payload: Dict[str, Any]) -> None:
    out = ensure_runtime_path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=str(out.parent), delete=False) as tmp:
        tmp.write(text)
        tmp_path = Path(tmp.name)
    os.replace(tmp_path, out)


def load_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def tokens(text: Any) -> Set[str]:
    value = re.sub(r"[^\w\u4e00-\u9fff]+", " ", str(text or "").lower())
    raw = [part for part in value.split() if len(part) >= 2]
    grams = set(raw)
    joined = "".join(raw)
    for i in range(max(0, len(joined) - 2)):
        grams.add(joined[i : i + 3])
    return grams


def jaccard(a: Set[str], b: Set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def candidate_tasks(state: Dict[str, Any]) -> List[Dict[str, Any]]:
    terminal = {"completed", "cancelled", "failed"}
    tasks = [t for t in state.get("tasks") or [] if isinstance(t, dict)]
    return [t for t in tasks if t.get("status") not in terminal]


def build_report(state: Dict[str, Any], *, threshold: float) -> Dict[str, Any]:
    tasks = candidate_tasks(state)
    terminal = {"completed", "cancelled", "failed"}
    active_count = len([t for t in state.get("tasks") or [] if isinstance(t, dict) and t.get("status") not in terminal])
    rows = []
    pairs = []
    signatures = {
        str(t.get("task_id") or ""): tokens(" ".join(str(t.get(key) or "") for key in ("goal", "title", "context", "summary")))
        for t in tasks
    }
    for idx, task in enumerate(tasks):
        task_id = str(task.get("task_id") or "")
        if not task_id:
            continue
        for other in tasks[idx + 1 :]:
            other_id = str(other.get("task_id") or "")
            if not other_id or task.get("project") != other.get("project"):
                continue
            score = jaccard(signatures[task_id], signatures[other_id])
            same_kind = str(task.get("source") or "") == str(other.get("source") or "")
            if score >= threshold or (same_kind and score >= threshold - 0.1):
                keep, cancel = sorted([task_id, other_id])
                command = f"python3 scripts/dev-control.py cancel {cancel} --source task-similar-dedup --note duplicate-of:{keep}"
                pairs.append({"a": keep, "b": other_id if keep == task_id else task_id, "score": round(score, 3), "suggested_cancel": cancel})
                rows.append(
                    {
                        "keep_task_id": keep,
                        "cancel_task_id": cancel,
                        "project": task.get("project"),
                        "similarity": round(score, 3),
                        "suggested_command": command,
                    }
                )
    unique = {row["cancel_task_id"]: row for row in sorted(rows, key=lambda r: (-r["similarity"], r["cancel_task_id"]))}
    suggestions = list(unique.values())
    pairs.sort(key=lambda r: (-r["score"], r["suggested_cancel"], r["a"], r["b"]))
    return {
        "generated_at": utc_now(),
        "mode": "preview-only",
        "summary": {"active_task_count": active_count, "candidate_task_count": len(tasks), "pair_count": len(pairs), "suggestion_count": len(suggestions), "threshold": threshold},
        "pairs": pairs,
        "cancel_suggestions": [row["suggested_command"] for row in suggestions],
        "suggestions": suggestions,
        "safety": {"read_only": True, "executes_cancel": False, "no_remote_mutation": True},
    }


def self_test() -> None:
    state = {
        "tasks": [
            {"task_id": "a", "project": "tools/automation", "status": "planned", "goal": "dev-control dry-run debounce check"},
            {"task_id": "b", "project": "tools/automation", "status": "received", "goal": "dev control dry run debounce checks"},
            {"task_id": "c", "project": "jetscope", "status": "planned", "goal": "source coverage test"},
        ]
    }
    report = build_report(state, threshold=0.45)
    assert report["summary"]["suggestion_count"] >= 1
    assert report["pairs"] and {"a", "b", "score", "suggested_cancel"}.issubset(report["pairs"][0])
    assert report["cancel_suggestions"]
    assert "cancel b" in report["suggestions"][0]["suggested_command"]


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Suggest duplicate dev-control tasks without mutating queue")
    parser.add_argument("--state", default=str(DEFAULT_STATE))
    parser.add_argument("--board", default=str(DEFAULT_BOARD))
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    parser.add_argument("--threshold", type=float, default=0.55)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--quiet", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    if args.self_test:
        self_test()
        if not args.quiet:
            print("OK task-similar-dedup self-test passed")
        return 0
    state = load_json(Path(args.state))
    if not state.get("tasks"):
        state = load_json(Path(args.board))
    report = build_report(state, threshold=args.threshold)
    atomic_write_json(Path(args.out), report)
    if not args.quiet:
        print(Path(args.out).expanduser())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
