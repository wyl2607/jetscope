#!/usr/bin/env python3
"""Preview or import daily-evolution review-first packets into dev-control.

Default mode is preview-only. With --apply, this script only calls the local
dev-control intake command to create received tasks; it does not approve plans,
execute tasks, mutate Git, sync, deploy, or contact remote systems.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
AUTOMATION = SCRIPT_DIR.parent
SAFE_REL_RE = re.compile(r"^[A-Za-z0-9_./-]+$")


def read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def compact(value: Any, limit: int = 240) -> str:
    text = " ".join(str(value or "").split())
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)].rstrip() + "..."


def latest_task_packets_path(root: Path = AUTOMATION) -> Path:
    candidates = sorted((root / "runtime/self-evolution").glob("daily-evolution-20*-task-packets.json"))
    if candidates:
        return candidates[-1]
    return root / "runtime/self-evolution/daily-evolution-unknown-task-packets.json"


def packet_task_id(packet: dict[str, Any]) -> str:
    key = "|".join(
        compact(item, 200)
        for item in (
            packet.get("scanner"),
            packet.get("kind"),
            packet.get("path"),
            packet.get("target"),
            packet.get("goal"),
        )
    )
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:12]
    return f"packet-{digest}"


def packet_rows(path: Path) -> list[dict[str, Any]]:
    payload = read_json(path, {})
    rows = payload.get("task_packets") if isinstance(payload, dict) else []
    return [row for row in rows if isinstance(row, dict)]


def select_packets(rows: list[dict[str, Any]], task_id: str, index: int, limit: int) -> list[dict[str, Any]]:
    review_first = [
        row
        for row in rows
        if row.get("mode") == "review-first" and row.get("priority") in {"P1", "P2", "P3"}
    ]
    if task_id:
        return [row for row in review_first if packet_task_id(row) == task_id]
    if index >= 0:
        return review_first[index : index + 1]
    return review_first[:limit]


def relative_allowed_files(packet: dict[str, Any], root: Path = AUTOMATION) -> list[str]:
    out: list[str] = []
    root_resolved = root.resolve()
    for raw in packet.get("allowed_files") or []:
        path = Path(str(raw)).expanduser()
        try:
            resolved = path.resolve(strict=False)
            rel = resolved.relative_to(root_resolved).as_posix()
        except ValueError:
            continue
        if rel.startswith("runtime/") or not SAFE_REL_RE.fullmatch(rel):
            continue
        if rel not in out:
            out.append(rel)
    return out


def validation_commands(allowed_files: list[str]) -> list[str]:
    return [f"git diff --check -- {path}" for path in allowed_files if SAFE_REL_RE.fullmatch(path)]


def build_add_command(packet: dict[str, Any], root: Path = AUTOMATION) -> list[str]:
    allowed = relative_allowed_files(packet, root)
    task_id = packet_task_id(packet)
    context_parts = [
        f"Imported from daily-evolution packet {task_id}.",
        f"Scanner={packet.get('scanner')}; kind={packet.get('kind')}; target={packet.get('target')}.",
        f"Evidence={packet.get('evidence_status') or 'review-first'}.",
    ]
    command = [
        sys.executable,
        str(root / "scripts/dev-control.py"),
        "add",
        "--project",
        "tools/automation",
        "--goal",
        compact(packet.get("goal"), 400),
        "--context",
        compact(" ".join(context_parts), 700),
        "--priority",
        str(packet.get("priority") or "P3"),
        "--requires-user-decision",
        "--source",
        "daily-evolution-packet",
        "--task-id",
        task_id,
        "--expected-change",
        compact(packet.get("done") or "Review the packet and make the smallest bounded source change.", 240),
    ]
    for rel in allowed:
        command.extend(["--allowed-file", rel])
    for check in validation_commands(allowed):
        command.extend(["--validation-command", check])
    for item in (packet.get("forbidden") or [])[:3]:
        command.extend(["--constraint", compact(item, 180)])
    done = packet.get("done")
    if done:
        command.extend(["--done", compact(done, 240)])
    return command


def preview(rows: list[dict[str, Any]], root: Path = AUTOMATION) -> dict[str, Any]:
    items = []
    for row in rows:
        items.append(
            {
                "task_id": packet_task_id(row),
                "priority": row.get("priority"),
                "goal": compact(row.get("goal"), 180),
                "allowed_files": relative_allowed_files(row, root),
                "command": build_add_command(row, root),
            }
        )
    return {
        "apply": False,
        "count": len(items),
        "items": items,
        "safety": {
            "preview_only": True,
            "approves_plan": False,
            "executes_tasks": False,
            "git_mutation": False,
            "remote_mutation": False,
        },
    }


def apply_import(rows: list[dict[str, Any]], root: Path = AUTOMATION) -> dict[str, Any]:
    results = []
    for row in rows:
        command = build_add_command(row, root)
        proc = subprocess.run(command, cwd=str(root), text=True, capture_output=True, check=False)
        results.append(
            {
                "task_id": packet_task_id(row),
                "returncode": proc.returncode,
                "stdout": compact(proc.stdout, 500),
                "stderr": compact(proc.stderr, 500),
            }
        )
    return {"apply": True, "count": len(results), "results": results}


def self_test() -> None:
    packet = {
        "scanner": "doc-drift-auditor",
        "kind": "semantic-stale-risk-group",
        "priority": "P1",
        "path": str(AUTOMATION / "workspace-guides/example.md"),
        "target": "example",
        "goal": "Resolve example packet.",
        "allowed_files": [str(AUTOMATION / "workspace-guides/example.md"), str(AUTOMATION / "runtime/private.json")],
        "forbidden": ["No push, PR, deploy, remote mutation, secret access, destructive cleanup, or broad sync."],
        "done": "Claim is verified or marked historical.",
        "mode": "review-first",
    }
    command = build_add_command(packet)
    assert packet_task_id(packet).startswith("packet-")
    assert "--requires-user-decision" in command
    assert "workspace-guides/example.md" in command
    assert not any("runtime/private.json" == part for part in command)
    multi = validation_commands(["workspace-guides/a.md", "workspace-guides/b.md", "workspace-guides/c.md", "workspace-guides/d.md"])
    assert multi == [
        "git diff --check -- workspace-guides/a.md",
        "git diff --check -- workspace-guides/b.md",
        "git diff --check -- workspace-guides/c.md",
        "git diff --check -- workspace-guides/d.md",
    ]
    report = preview([packet])
    assert report["count"] == 1
    assert report["safety"]["preview_only"] is True


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task-packets", type=Path, default=latest_task_packets_path())
    parser.add_argument("--task-id", default="", help="Import one packet by deterministic packet id")
    parser.add_argument("--index", type=int, default=-1, help="Import one review-first packet by index")
    parser.add_argument("--limit", type=int, default=3)
    parser.add_argument("--apply", action="store_true", help="Create dev-control received tasks")
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.self_test:
        self_test()
        print("OK")
        return 0
    rows = select_packets(packet_rows(args.task_packets), args.task_id, args.index, max(1, args.limit))
    report = apply_import(rows) if args.apply else preview(rows)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if not report.get("apply") or all(item.get("returncode") == 0 for item in report.get("results", [])) else 1


if __name__ == "__main__":
    raise SystemExit(main())
