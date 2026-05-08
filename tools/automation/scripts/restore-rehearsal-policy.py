#!/usr/bin/env python3
"""Read-only Git backup and restore rehearsal policy check."""

from __future__ import annotations

import argparse
import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MANIFEST = ROOT / "runtime/task-board/source-runtime-manifest.json"
DEFAULT_MIRROR_DRIFT = ROOT / "runtime/self-evolution/mirror-drift-scan.json"
DEFAULT_REGISTRY = ROOT / "workspace-guides/evolution-registry.json"
DEFAULT_JSON = ROOT / "runtime/self-evolution/restore-rehearsal-policy.json"
DEFAULT_MD = ROOT / "runtime/self-evolution/restore-rehearsal-policy.md"


REQUIRED_FORBIDDEN_ACTIONS = {
    "push",
    "pr",
    "deploy",
    "remote-mutation",
    "secret-access",
    "destructive-cleanup",
    "broad-sync",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def check(check_id: str, passed: bool, message: str, **evidence: Any) -> dict[str, Any]:
    return {
        "id": check_id,
        "status": "pass" if passed else "fail",
        "message": message,
        "evidence": evidence,
    }


def build_report(manifest_path: Path = DEFAULT_MANIFEST, mirror_path: Path = DEFAULT_MIRROR_DRIFT, registry_path: Path = DEFAULT_REGISTRY) -> dict[str, Any]:
    manifest = read_json(manifest_path)
    mirror = read_json(mirror_path)
    registry = read_json(registry_path)
    summary = manifest.get("summary") if isinstance(manifest.get("summary"), dict) else {}
    visibility = manifest.get("git_visibility") if isinstance(manifest.get("git_visibility"), dict) else {}
    publication_gate = manifest.get("publication_gate") if isinstance(manifest.get("publication_gate"), dict) else {}
    mirror_summary = mirror.get("summary") if isinstance(mirror.get("summary"), dict) else {}
    mirror_findings = mirror.get("findings") if isinstance(mirror.get("findings"), list) else []
    safety = registry.get("safety") if isinstance(registry.get("safety"), dict) else {}
    forbidden = set(safety.get("forbiddenWithoutApproval") if isinstance(safety.get("forbiddenWithoutApproval"), list) else [])

    source_ok = (
        bool(visibility.get("automation_ignored"))
        and bool(visibility.get("ignore_rule"))
        and int(summary.get("source_candidate_count") or 0) > 0
        and int(summary.get("unclassified_count") or 0) == 0
    )
    runtime_ok = (
        publication_gate.get("runtime_excluded_by_default") is True
        and int(summary.get("excluded_by_default_count") or 0) > 0
    )
    mirror_ok = (
        mirror.get("ok") is True
        and int(mirror_summary.get("blocking_count") or 0) == 0
        and all(item.get("source_of_truth", "project") == "project" for item in mirror_findings if isinstance(item, dict) and item.get("kind") != "derived-index-registered")
        and any(item.get("kind") == "derived-index-registered" for item in mirror_findings if isinstance(item, dict))
    )
    approval_ok = (
        REQUIRED_FORBIDDEN_ACTIONS.issubset(forbidden)
        and publication_gate.get("requires_user_approval_for_push") is True
        and publication_gate.get("requires_secret_scan") is True
        and publication_gate.get("requires_review_for_high_risk") is True
    )

    checks = [
        check(
            "git-canonical-source",
            source_ok,
            "Restore rehearsal must start from classified Git/source candidates, not chat memory or Obsidian.",
            automation_ignored=visibility.get("automation_ignored"),
            ignore_rule=visibility.get("ignore_rule"),
            source_candidate_count=summary.get("source_candidate_count", 0),
            unclassified_count=summary.get("unclassified_count", 0),
        ),
        check(
            "runtime-ignore-boundary",
            runtime_ok,
            "Runtime and generated evidence must remain excluded from source restore targets.",
            runtime_excluded_by_default=publication_gate.get("runtime_excluded_by_default"),
            excluded_by_default_count=summary.get("excluded_by_default_count", 0),
        ),
        check(
            "mirror-policy",
            mirror_ok,
            "Obsidian mirrors must remain derived or project-sourced and must not become restore truth.",
            mirror_ok=mirror.get("ok"),
            blocking_count=mirror_summary.get("blocking_count", 0),
            finding_count=len(mirror_findings),
        ),
        check(
            "approval-boundary",
            approval_ok,
            "Backup, restore, push, publication, remote mutation, and destructive cleanup require explicit approval.",
            missing_forbidden_actions=sorted(REQUIRED_FORBIDDEN_ACTIONS - forbidden),
            requires_user_approval_for_push=publication_gate.get("requires_user_approval_for_push"),
            requires_secret_scan=publication_gate.get("requires_secret_scan"),
            requires_review_for_high_risk=publication_gate.get("requires_review_for_high_risk"),
        ),
    ]
    return {
        "ok": all(item["status"] == "pass" for item in checks),
        "generated_at": utc_now(),
        "scanner": "restore-rehearsal-policy",
        "inputs": {
            "manifest": str(manifest_path),
            "mirror_drift": str(mirror_path),
            "registry": str(registry_path),
        },
        "policy": {
            "mode": "read-only-rehearsal-policy",
            "restore_target": "source-only",
            "runtime_lane": "separate-local-evidence-only",
            "backup_scope": "classified-source-plus-local-runtime-evidence-manifest",
            "restore_rehearsal_order": [
                "verify-source-runtime-manifest",
                "verify-runtime-exclusion-boundary",
                "verify-mirror-policy",
                "verify-approval-boundary",
            ],
            "never_performed_by_this_check": [
                "backup-write",
                "restore-write",
                "git-mutation",
                "push",
                "pr",
                "remote-mutation",
                "obsidian-write",
                "destructive-cleanup",
            ],
        },
        "checks": checks,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Restore Rehearsal Policy",
        "",
        f"- ok: `{str(report.get('ok')).lower()}`",
        f"- mode: `{(report.get('policy') or {}).get('mode')}`",
        f"- restore target: `{(report.get('policy') or {}).get('restore_target')}`",
        f"- runtime lane: `{(report.get('policy') or {}).get('runtime_lane')}`",
        "",
        "Safety: read-only policy report; no backup write, restore write, Git mutation, push, PR, Obsidian write, deploy, remote mutation, or destructive cleanup.",
        "",
        "## Checks",
    ]
    for item in report.get("checks") or []:
        lines.append(f"- `{item.get('status')}` `{item.get('id')}`: {item.get('message')}")
    return "\n".join(lines) + "\n"


def write_report(report: dict[str, Any], json_out: Path, markdown_out: Path) -> None:
    json_out.parent.mkdir(parents=True, exist_ok=True)
    markdown_out.parent.mkdir(parents=True, exist_ok=True)
    json_out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    markdown_out.write_text(render_markdown(report), encoding="utf-8")


def self_test() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        manifest = root / "manifest.json"
        mirror = root / "mirror.json"
        registry = root / "registry.json"
        manifest.write_text(
            json.dumps(
                {
                    "summary": {"unclassified_count": 0, "source_candidate_count": 1, "excluded_by_default_count": 1},
                    "git_visibility": {"automation_ignored": True, "ignore_rule": ".gitignore:103:tools/automation/*"},
                    "publication_gate": {
                        "runtime_excluded_by_default": True,
                        "requires_secret_scan": True,
                        "requires_user_approval_for_push": True,
                        "requires_review_for_high_risk": True,
                    },
                }
            ),
            encoding="utf-8",
        )
        mirror.write_text(
            json.dumps({"ok": True, "summary": {"blocking_count": 0}, "findings": [{"kind": "derived-index-registered"}]}),
            encoding="utf-8",
        )
        registry.write_text(json.dumps({"safety": {"forbiddenWithoutApproval": sorted(REQUIRED_FORBIDDEN_ACTIONS)}}), encoding="utf-8")
        assert build_report(manifest, mirror, registry)["ok"] is True


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--mirror-drift", type=Path, default=DEFAULT_MIRROR_DRIFT)
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--json-out", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--markdown-out", type=Path, default=DEFAULT_MD)
    parser.add_argument("--no-write", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    if args.self_test:
        self_test()
        print(json.dumps({"ok": True, "script": "restore-rehearsal-policy"}, indent=2))
        return 0
    report = build_report(args.manifest, args.mirror_drift, args.registry)
    if not args.no_write:
        write_report(report, args.json_out, args.markdown_out)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
