#!/usr/bin/env python3
"""Build a read-only approval packet for mechanical skill dedupe."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List


ROOT = Path("/Users/yumei/tools/automation")
DEFAULT_PLAN = ROOT / "runtime/skill-chains/dedupe/dedupe-plan.json"
DEFAULT_OUT = ROOT / "runtime/skill-chains/dedupe/mechanical-dedupe-approval-packet.json"
DEFAULT_MARKDOWN_OUT = ROOT / "runtime/skill-chains/dedupe/mechanical-dedupe-approval-packet.md"


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_json(path: Path) -> Dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"expected JSON object: {path}")
    return data


def is_archive_path(path: str) -> bool:
    lowered = path.lower()
    return "/_archive/" in lowered or "/archive/" in lowered or "_active-copies-" in lowered


def proposed_symlink_actions(plan: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for action in plan.get("actions", []):
        if not isinstance(action, dict):
            continue
        skill = action.get("skill")
        keep = action.get("keep", {})
        for duplicate in action.get("duplicates", []):
            if not isinstance(duplicate, dict):
                continue
            source = str(duplicate.get("from") or "")
            target = str(duplicate.get("to") or keep.get("path") or "")
            rows.append(
                {
                    "skill": skill,
                    "from": source,
                    "to": target,
                    "verify_sha256": duplicate.get("verify_sha256") or keep.get("verify_sha256"),
                    "archive_path": is_archive_path(source) or is_archive_path(target),
                    "phase": "approval-required",
                    "preconditions": duplicate.get("preconditions", []),
                }
            )
    return rows


def build_packet(plan: Dict[str, Any], plan_path: Path) -> Dict[str, Any]:
    actions = proposed_symlink_actions(plan)
    archive_actions = [row for row in actions if row["archive_path"]]
    non_archive_actions = [row for row in actions if not row["archive_path"]]
    rollback_target = str(plan.get("rollback_tarball_target") or "/tmp/skills-pre-dedupe-YYYYMMDDTHHMMSSZ.tar.gz")
    roots = sorted(
        {
            path
            for row in actions
            for path in (str(row.get("from") or ""), str(row.get("to") or ""))
            if path.startswith("/Users/yumei/")
        }
    )

    return {
        "generated_at": utc_now(),
        "contract": "Read-only approval packet. Do not mutate skill roots until the user explicitly approves a Phase C execution packet.",
        "plan_source": str(plan_path),
        "phase_c_allowed": False,
        "summary": {
            "byte_identical_groups": plan.get("summary", {}).get("byte_identical_groups", 0),
            "proposed_symlinks": len(actions),
            "non_archive_proposed_symlinks": len(non_archive_actions),
            "archive_proposed_symlinks": len(archive_actions),
            "requires_manual_merge": plan.get("summary", {}).get("requires_manual_merge", 0),
            "skipped_path_aliases": plan.get("summary", {}).get("skipped_path_aliases", 0),
        },
        "rollback": {
            "tarball_target": rollback_target,
            "command_template": "tar -czf <tarball_target> <approved source roots/files>",
            "candidate_paths": roots,
            "rule": "Create rollback tarball before any mutation; do not use rm or symlink writes until tarball exists and hashes are revalidated.",
        },
        "allowed_after_approval": {
            "byte_identical_symlink_candidates": actions,
            "required_preflight": plan.get("validation_for_phase_c", []),
        },
        "blocked_without_separate_approval": {
            "archive_paths": archive_actions,
            "manual_merge_groups": plan.get("requires_manual_merge", []),
            "rules": [
                "Do not mutate archive paths in a mechanical dedupe pass unless the user explicitly includes archives.",
                "Do not merge drift groups mechanically; they require human content decisions.",
                "Do not touch path_alias_groups; they already resolve to the same inode or alias path.",
            ],
        },
        "approval_questions": [
            "Approve non-archive byte-identical symlink candidates only?",
            "Should archive byte-identical duplicates stay untouched in this pass?",
            "Confirm rollback tarball target before Phase C?",
        ],
    }


def bullet_list(items: List[str], empty: str = "_None._") -> List[str]:
    if not items:
        return [empty]
    return [f"- `{item}`" for item in items]


def candidate_lines(rows: List[Dict[str, Any]], limit: int | None = None) -> List[str]:
    selected = rows[:limit] if limit else rows
    lines: List[str] = []
    for row in selected:
        skill = row.get("skill") or "<unknown>"
        source = row.get("from") or "<missing-source>"
        target = row.get("to") or "<missing-target>"
        lines.append(f"- `{skill}`: `{source}` -> `{target}`")
    if limit and len(rows) > limit:
        lines.append(f"- ... {len(rows) - limit} more candidates are in the JSON packet.")
    return lines or ["_None._"]


def render_markdown(packet: Dict[str, Any]) -> str:
    summary = packet.get("summary", {})
    rollback = packet.get("rollback", {})
    allowed = packet.get("allowed_after_approval", {})
    blocked = packet.get("blocked_without_separate_approval", {})
    all_candidates = allowed.get("byte_identical_symlink_candidates", [])
    if not isinstance(all_candidates, list):
        all_candidates = []
    archive_candidates = blocked.get("archive_paths", [])
    if not isinstance(archive_candidates, list):
        archive_candidates = []
    non_archive_candidates = [row for row in all_candidates if isinstance(row, dict) and not row.get("archive_path")]
    manual_merge_groups = blocked.get("manual_merge_groups", [])
    manual_names = [
        str(row.get("skill") or "<unknown>")
        for row in manual_merge_groups
        if isinstance(row, dict)
    ]
    preflight = allowed.get("required_preflight", [])
    if not isinstance(preflight, list):
        preflight = []
    rules = blocked.get("rules", [])
    if not isinstance(rules, list):
        rules = []
    questions = packet.get("approval_questions", [])
    if not isinstance(questions, list):
        questions = []

    phase_line = "Phase C execution is closed." if not packet.get("phase_c_allowed") else "Phase C execution is open."
    lines = [
        "# Mechanical Skill Dedupe Approval Packet",
        "",
        f"Generated: `{packet.get('generated_at', '<unknown>')}`",
        f"Plan source: `{packet.get('plan_source', '<unknown>')}`",
        "",
        "## Execution Gate",
        "",
        f"- {phase_line}",
        "- This packet is review material only; it does not approve symlinks, deletes, archive edits, or skill-root mutation.",
        "- A separate explicit approval is required before any Phase C executor may run.",
        "",
        "## Summary",
        "",
        f"- Byte-identical groups: `{summary.get('byte_identical_groups', 0)}`",
        f"- Proposed symlinks: `{summary.get('proposed_symlinks', 0)}`",
        f"- Non-archive proposed symlinks: `{summary.get('non_archive_proposed_symlinks', 0)}`",
        f"- Archive proposed symlinks: `{summary.get('archive_proposed_symlinks', 0)}`",
        f"- Manual merge groups: `{summary.get('requires_manual_merge', 0)}`",
        f"- Skipped path aliases: `{summary.get('skipped_path_aliases', 0)}`",
        "",
        "## Non-archive candidates",
        "",
        *candidate_lines(non_archive_candidates),
        "",
        "## Archive candidates blocked",
        "",
        "- Archive paths are not approved for mutation in this packet.",
        *candidate_lines(archive_candidates),
        "",
        "## Manual merge groups blocked",
        "",
        *bullet_list(manual_names),
        "",
        "## Rollback",
        "",
        f"- Tarball target: `{rollback.get('tarball_target', '<confirm-before-use>')}`",
        f"- Command template: `{rollback.get('command_template', 'tar -czf <tarball_target> <approved source roots/files>')}`",
        f"- Rule: {rollback.get('rule', 'Create rollback evidence before mutation.')}",
        "",
        "Candidate paths to include before any approved mutation:",
        *bullet_list([str(path) for path in rollback.get("candidate_paths", []) if isinstance(path, str)]),
        "",
        "## Required Preflight",
        "",
        *bullet_list([str(item) for item in preflight]),
        "",
        "## Block Rules",
        "",
        *bullet_list([str(item) for item in rules]),
        "",
        "## Approval Questions",
        "",
        *bullet_list([str(item) for item in questions]),
        "",
    ]
    return "\n".join(lines)


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {path}")
    print("summary=" + json.dumps(payload["summary"], sort_keys=True))


def write_markdown(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_markdown(payload), encoding="utf-8")
    print(f"wrote {path}")


def self_test() -> None:
    plan = {
        "summary": {"byte_identical_groups": 1, "requires_manual_merge": 2, "skipped_path_aliases": 3},
        "rollback_tarball_target": "/tmp/test.tar.gz",
        "actions": [
            {
                "skill": "alpha",
                "keep": {"path": "/Users/yumei/.agents/skills/alpha/SKILL.md", "verify_sha256": "abc"},
                "duplicates": [
                    {"from": "/Users/yumei/.agents/skills/beta/SKILL.md", "to": "/Users/yumei/.agents/skills/alpha/SKILL.md", "verify_sha256": "abc"},
                    {"from": "/Users/yumei/.agents/skills/_archive/alpha/SKILL.md", "to": "/Users/yumei/.agents/skills/alpha/SKILL.md", "verify_sha256": "abc"},
                ],
            }
        ],
        "requires_manual_merge": [{"skill": "drift"}],
    }
    packet = build_packet(plan, Path("/tmp/plan.json"))
    assert packet["phase_c_allowed"] is False
    assert packet["summary"]["proposed_symlinks"] == 2
    assert packet["summary"]["archive_proposed_symlinks"] == 1
    assert packet["blocked_without_separate_approval"]["manual_merge_groups"]
    rendered = render_markdown(packet)
    assert "Phase C execution is closed" in rendered
    assert "Archive candidates blocked" in rendered


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, default=DEFAULT_PLAN)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--markdown-out", type=Path, default=DEFAULT_MARKDOWN_OUT)
    parser.add_argument("--print", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        print(json.dumps({"ok": True, "script": "skill-dedupe-approval-packet"}, indent=2))
        return 0

    plan = load_json(args.plan)
    packet = build_packet(plan, args.plan)
    if args.print:
        print(json.dumps(packet, ensure_ascii=False, indent=2))
    else:
        write_json(args.out, packet)
        write_markdown(args.markdown_out, packet)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
