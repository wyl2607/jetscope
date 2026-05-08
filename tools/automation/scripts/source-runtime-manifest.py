#!/usr/bin/env python3
"""Generate source/runtime/local-only manifests for tools/automation."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

_SCRIPT_DIR = Path(__file__).resolve().parent
AUTOMATION = Path(os.environ.get("AUTOMATION_ROOT", str(_SCRIPT_DIR.parent))).expanduser()
DEFAULT_OUT = AUTOMATION / "runtime" / "task-board" / "source-runtime-manifest.json"

SOURCE_PREFIXES = (
    ".agents/skills/",
    "ai-scheduler/",
    "auto-refactor-loop/",
    "config/",
    "roles/",
    "scripts/",
    "templates/",
    "tests/",
    "workspace-guides/",
)
SOURCE_NAMES = {
    "AGENTS.md",
    "PLANS.md",
    "README.md",
    "PROJECT_PROGRESS.md",
    "plan.md",
    "skills-lock.json",
    "parallel-codex-builder.sh",
    "parallel-dispatch.sh",
    "parallel-sync.sh",
    "ai-code-auditor.sh",
    "automation-summary.md",
    "code-review-report.md",
    "code-review-system.sh",
    "docs-incident-log-archive-2026-04-12.md",
    "enrich-tasks-with-routing.py",
    "master-automation.sh",
    "rollout-omx.sh",
    "run-pipeline.sh",
    "setup-automation.sh",
    "task-executor-router.py",
    "token-budget-manager.py",
    "vps-roundtrip.sh",
}
LOCAL_ONLY_NAMES = {".DS_Store"}
LOCAL_ONLY_PREFIXES = (
    ".omx/",
    "runtime/",
    "runtime-backups/",
    "reports/",
    ".pytest_cache/",
    "code-audit/",
    "review-logs/",
    "__pycache__/",
)
SOURCE_EXCEPTION_NAMES = {
    "runtime/skill-chains/dashboard/app.js",
    "runtime/skill-chains/dashboard/styles.css",
    "runtime/skill-chains/dashboard/i18n.json",
    "runtime/skill-chains/dashboard/i18n.js",
    "runtime/skill-chains/dashboard/index.html",
    "runtime/skill-chains/dashboard/modules/g9a-kpi.js",
    "runtime/skill-chains/dashboard/modules/g9a-kpi.css",
    "runtime/skill-chains/dashboard/modules/g9b-watch-drawer.js",
    "runtime/skill-chains/dashboard/modules/g9b-watch-drawer.css",
    "runtime/skill-chains/dashboard/modules/g9c-chain-drawer.js",
    "runtime/skill-chains/dashboard/modules/g9c-chain-drawer.css",
}
SKIP_INVENTORY_PREFIXES = {
    ".git/",
    "__pycache__/",
}
SKIP_INVENTORY_DIR_NAMES = {
    ".git",
    "__pycache__",
    ".pytest_cache",
}
GENERATED_SUFFIXES = (
    ".log",
    ".tmp",
    ".bak",
    ".backup",
    ".swp",
)
HIGH_RISK_NAMES = {
    "vps-roundtrip.sh",
    "parallel-sync.sh",
    "parallel-dispatch.sh",
}
HIGH_RISK_KEYWORDS = (
    "vps",
    "sync",
    "deploy",
    "cleanup",
    "launchd",
    "install",
    "uninstall",
    "ssh",
    "rsync",
)


def ensure_under_runtime(path: Path) -> Path:
    resolved = path.expanduser().resolve()
    runtime = (AUTOMATION / "runtime").resolve()
    if resolved != runtime and runtime not in resolved.parents:
        raise SystemExit(f"refusing to write outside runtime: {resolved}")
    return resolved


def run_git(args: List[str]) -> List[str]:
    proc = subprocess.run(
        ["git"] + args,
        cwd=str(AUTOMATION),
        capture_output=True,
        text=True,
        check=False,
        timeout=60,
    )
    if proc.returncode != 0:
        return []
    return [line.strip() for line in proc.stdout.splitlines() if line.strip()]


def git_output(args: List[str]) -> str:
    proc = subprocess.run(
        ["git"] + args,
        cwd=str(AUTOMATION),
        capture_output=True,
        text=True,
        check=False,
        timeout=60,
    )
    if proc.returncode != 0:
        return ""
    return proc.stdout.strip()


def first_ignore_rule(paths: Sequence[Path]) -> str:
    candidates = [str(path) for path in paths]
    proc = subprocess.run(
        ["git", "check-ignore", "-v"] + candidates,
        cwd=str(AUTOMATION),
        capture_output=True,
        text=True,
        check=False,
        timeout=60,
    )
    if proc.returncode != 0:
        return ""
    return proc.stdout.splitlines()[0].strip() if proc.stdout.strip() else ""


def git_visibility() -> Dict[str, Any]:
    root = git_output(["rev-parse", "--show-toplevel"])
    probe_paths = [
        AUTOMATION / "plan.md",
        AUTOMATION / "README.md",
        AUTOMATION / "scripts" / "source-runtime-manifest.py",
        AUTOMATION / "runtime" / "task-board" / "source-runtime-manifest.json",
    ]
    ignore_rule = first_ignore_rule(probe_paths)
    tracked_count = len(run_git(["ls-files", str(AUTOMATION)]))
    automation_ignored = bool(ignore_rule)
    return {
        "git_root": root,
        "automation_path": str(AUTOMATION),
        "automation_ignored": automation_ignored,
        "ignore_rule": ignore_rule,
        "tracked_files_under_automation": tracked_count,
        "commit_boundary_note": "tools/automation is ignored by the current root Git repository; changing that requires an explicit source boundary decision." if automation_ignored else "tools/automation is visible to the current Git repository.",
    }


def list_filesystem_files() -> List[str]:
    files: List[str] = []
    for path in AUTOMATION.rglob("*"):
        if path.is_dir():
            continue
        rel = path.relative_to(AUTOMATION).as_posix()
        parts = set(rel.split("/"))
        if parts & SKIP_INVENTORY_DIR_NAMES:
            continue
        if rel in LOCAL_ONLY_NAMES:
            continue
        if any(rel.startswith(prefix) for prefix in SKIP_INVENTORY_PREFIXES):
            continue
        files.append(rel)
    return sorted(files)


def list_files() -> List[str]:
    tracked = run_git(["ls-files"])
    untracked = run_git(["ls-files", "--others", "--exclude-standard"])
    return sorted(set(list_filesystem_files() + tracked + untracked))


def classify(path: str) -> Dict[str, Any]:
    name = Path(path).name
    if path in SOURCE_EXCEPTION_NAMES:
        classification = "source-exception"
        default_action = "candidate-after-validation-and-secret-scan"
    elif name in LOCAL_ONLY_NAMES:
        classification = "generated-local-artifact"
        default_action = "exclude-until-classified"
    elif "/__pycache__/" in path or name.endswith(".pyc"):
        classification = "generated-local-artifact"
        default_action = "exclude-until-classified"
    elif path.startswith(LOCAL_ONLY_PREFIXES):
        classification = "local-only-runtime"
        default_action = "exclude-from-commit-or-publish"
    elif path.startswith("reports/"):
        classification = "generated-report"
        default_action = "exclude-until-classified"
    elif path.endswith(GENERATED_SUFFIXES):
        classification = "generated-local-artifact"
        default_action = "exclude-until-classified"
    elif path in SOURCE_NAMES or path.startswith(SOURCE_PREFIXES):
        classification = "source"
        default_action = "candidate-after-validation-and-secret-scan"
    else:
        classification = "unclassified"
        default_action = "review-before-commit-or-publish"
    high_risk = path in HIGH_RISK_NAMES or (path.startswith("scripts/") and any(word in name.lower() for word in HIGH_RISK_KEYWORDS))
    return {
        "path": path,
        "classification": classification,
        "default_action": default_action,
        "high_risk": high_risk,
    }


def build_manifest() -> Dict[str, Any]:
    entries = [classify(path) for path in list_files()]
    summary: Dict[str, int] = {}
    for entry in entries:
        key = entry["classification"]
        summary[key] = summary.get(key, 0) + 1
    high_risk = [entry for entry in entries if entry["high_risk"]]
    unclassified = [entry for entry in entries if entry["classification"] == "unclassified"]
    visibility = git_visibility()
    source_candidates = [entry for entry in entries if entry["classification"] in {"source", "source-exception"}]
    excluded_by_default = [entry for entry in entries if entry["classification"] not in {"source", "source-exception"}]
    return {
        "scope": str(AUTOMATION),
        "source_policy": "workspace-guides/automation-source-runtime-classification.md",
        "split_policy": "workspace-guides/automation-project-split-decision.md",
        "git_visibility": visibility,
        "summary": {
            "total_files": len(entries),
            "by_classification": summary,
            "high_risk_count": len(high_risk),
            "unclassified_count": len(unclassified),
            "source_candidate_count": len(source_candidates),
            "excluded_by_default_count": len(excluded_by_default),
        },
        "entries": entries,
        "source_candidates": source_candidates,
        "excluded_by_default": excluded_by_default,
        "high_risk": high_risk,
        "unclassified": unclassified,
        "publication_gate": {
            "runtime_excluded_by_default": True,
            "requires_secret_scan": True,
            "requires_user_approval_for_push": True,
            "requires_review_for_high_risk": True,
        },
    }


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    out = ensure_under_runtime(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=str(out.parent), delete=False) as tmp:
        json.dump(payload, tmp, ensure_ascii=False, indent=2, sort_keys=True)
        tmp.write("\n")
        tmp_path = Path(tmp.name)
    tmp_path.replace(out)


def render_markdown(manifest: Dict[str, Any]) -> str:
    summary = manifest["summary"]
    visibility = manifest.get("git_visibility") or {}
    lines = ["# Source Runtime Manifest", "", f"Scope: `{manifest['scope']}`", ""]
    lines.append(f"Total files: {summary['total_files']}")
    for key, value in sorted(summary["by_classification"].items()):
        lines.append(f"- {key}: {value}")
    lines.append(f"- high-risk source/tooling: {summary['high_risk_count']}")
    lines.append(f"- unclassified: {summary['unclassified_count']}")
    lines.extend([
        "",
        "## Git Visibility",
        "",
        f"- git root: `{visibility.get('git_root', '')}`",
        f"- automation ignored: `{visibility.get('automation_ignored')}`",
        f"- tracked files under automation: `{visibility.get('tracked_files_under_automation')}`",
        f"- note: {visibility.get('commit_boundary_note', '')}",
    ])
    if visibility.get("ignore_rule"):
        lines.append(f"- ignore rule: `{visibility.get('ignore_rule')}`")
    if manifest["unclassified"]:
        lines.extend(["", "## Unclassified", ""])
        for entry in manifest["unclassified"][:50]:
            lines.append(f"- `{entry['path']}`")
    if manifest["high_risk"]:
        lines.extend(["", "## High Risk", ""])
        for entry in manifest["high_risk"][:50]:
            lines.append(f"- `{entry['path']}` ({entry['classification']})")
    return "\n".join(lines) + "\n"


def self_test() -> None:
    assert classify("runtime/task-board/full-chain-report.json")["classification"] == "local-only-runtime"
    assert classify("runtime/skill-chains/dashboard/app.js")["classification"] == "source-exception"
    assert classify("scripts/dev-control.py")["classification"] == "source"
    assert classify("workspace-guides/dev-control-queue-runbook.md")["classification"] == "source"
    assert classify("unknown.bin")["classification"] == "unclassified"
    assert classify("scripts/sync-dev-workers.sh")["high_risk"] is True
    manifest = build_manifest()
    assert manifest["summary"]["total_files"] >= 1


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate source/runtime/local-only manifest")
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    parser.add_argument("--markdown-out", default=str(DEFAULT_OUT.with_suffix(".md")))
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    if args.self_test:
        self_test()
        if not args.quiet:
            print("OK source-runtime-manifest self-test passed")
        return 0
    manifest = build_manifest()
    write_json(Path(args.out), manifest)
    markdown_path = Path(args.markdown_out)
    out_md = ensure_under_runtime(markdown_path)
    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_md.write_text(render_markdown(manifest), encoding="utf-8")
    if not args.quiet:
        print(json.dumps(manifest["summary"], ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
