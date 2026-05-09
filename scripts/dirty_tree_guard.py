#!/usr/bin/env python3
"""Fail-closed guard for AI-produced dirty worktrees.

The guard does not clean, delete, stage, commit, or push. It only reports
worktree states that must be classified before a commit or remote action.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


BLOCKED_PATTERNS = (
    ".env",
    ".env.*",
    "**/.env",
    "**/.env.*",
    ".envrc",
    "**/.envrc",
    "*.log",
    "*.sqlite",
    "*.sqlite3",
    "*.db",
    "*.tar.gz",
    "*.zip",
    ".automation/**",
    ".harness/**",
    ".omx/**",
    ".guard/**",
    ".next/**",
    "apps/web/.next/**",
    "apps/web/dist/**",
    "*.tsbuildinfo",
    "__pycache__/**",
    "**/__pycache__/**",
    "*.pyc",
    "*.pyo",
    "*.egg-info/**",
    ".venv/**",
    "apps/api/.venv/**",
    ".pytest_cache/**",
    ".ruff_cache/**",
    "apps/api/data/**",
    "data/local-preferences.json",
    "data/market.db",
    "infra/postgres-data/**",
    "logs/**",
    "webhook-logs/**",
    "test-results/**",
    "playwright-report/**",
    "coverage/**",
    "htmlcov/**",
    "archive/**",
    "docs/archive/**",
    ".happy/**",
    ".multica/**",
    "multica_workspaces/**",
    "tool-cleanup-archive-*/**",
    "windows-setup-copy/**",
    "tagledger/**",
    "tagledger-signoff-parser/**",
    "tagledger-signoff-parser-clean/**",
    ".claude/projects/*/dev-harness/**",
    "**/.claude/projects/*/dev-harness/**",
)

ALLOWED_SECRET_EXAMPLES = (
    ".env.example",
    ".env.*.example",
    "**/.env.example",
    "**/.env.*.example",
)

CREDENTIAL_NAME_PATTERNS = (
    "*credential*",
    "*credentials*",
    "*secret*",
    "*token*",
    "*private-key*",
)


@dataclass(frozen=True)
class StatusEntry:
    index: str
    worktree: str
    path: str


def run_git(repo: Path, args: list[str]) -> str:
    proc = subprocess.run(
        ["git", *args],
        cwd=str(repo),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        message = proc.stderr.strip() or proc.stdout.strip() or "git command failed"
        raise SystemExit(f"dirty_tree_guard: ERROR: {message}")
    return proc.stdout


def parse_status(raw: str) -> list[StatusEntry]:
    entries: list[StatusEntry] = []
    parts = raw.split("\0")
    i = 0
    while i < len(parts):
        item = parts[i]
        if not item:
            i += 1
            continue
        status = item[:2]
        path = item[3:]
        if status[0] in {"R", "C"}:
            i += 1
            if i < len(parts) and parts[i]:
                path = parts[i]
        entries.append(StatusEntry(status[0], status[1], path))
        i += 1
    return entries


def matches_any(path: str, patterns: Iterable[str]) -> bool:
    return any(fnmatch.fnmatch(path, pattern) for pattern in patterns)


def is_allowed_secret_example(path: str) -> bool:
    return matches_any(path, ALLOWED_SECRET_EXAMPLES)


def is_blocked_path(path: str) -> bool:
    if is_allowed_secret_example(path):
        return False
    return matches_any(path, BLOCKED_PATTERNS)


def is_credential_named(path: str) -> bool:
    if is_allowed_secret_example(path) or path == "scripts/approval-token-ledger.sh":
        return False
    return matches_any(path.lower(), CREDENTIAL_NAME_PATTERNS)


def staged_entries(entries: list[StatusEntry]) -> list[StatusEntry]:
    return [entry for entry in entries if entry.index not in {" ", "?"}]


def untracked_entries(entries: list[StatusEntry]) -> list[StatusEntry]:
    return [entry for entry in entries if entry.index == "?" and entry.worktree == "?"]


def changed_entries(entries: list[StatusEntry]) -> list[StatusEntry]:
    return [entry for entry in entries if not (entry.index == "?" and entry.worktree == "?")]


def nested_git_dirs(repo: Path, paths: Iterable[str]) -> list[str]:
    found: list[str] = []
    for path in paths:
        current = repo / path
        candidates = [current]
        if current.is_file():
            candidates.append(current.parent)
        for candidate in candidates:
            if (candidate / ".git").exists():
                rel = candidate.relative_to(repo).as_posix()
                if rel != ".":
                    found.append(rel)
                break
    return sorted(set(found))


def build_report(repo: Path, entries: list[StatusEntry], mode: str) -> dict[str, object]:
    staged = staged_entries(entries)
    untracked = untracked_entries(entries)
    changed = changed_entries(entries)

    blocked_staged = sorted({entry.path for entry in staged if is_blocked_path(entry.path) or is_credential_named(entry.path)})
    blocked_changed = sorted({entry.path for entry in changed if is_blocked_path(entry.path)})
    blocked_untracked = sorted({entry.path for entry in untracked if is_blocked_path(entry.path) or is_credential_named(entry.path)})
    unknown_untracked = sorted({entry.path for entry in untracked if entry.path not in blocked_untracked})
    nested = nested_git_dirs(repo, [entry.path for entry in untracked])

    errors: list[str] = []
    if blocked_staged:
        errors.append("blocked staged files")
    if blocked_changed:
        errors.append("blocked tracked worktree files")
    if blocked_untracked:
        errors.append("blocked untracked files")
    if unknown_untracked:
        errors.append("unclassified untracked files")
    if nested:
        errors.append("nested git repositories")
    if mode == "publish" and entries:
        errors.append("worktree is dirty")

    return {
        "ok": not errors,
        "mode": mode,
        "repo": str(repo),
        "summary": {
            "entries": len(entries),
            "staged": len(staged),
            "changed": len(changed),
            "untracked": len(untracked),
        },
        "blocked_staged": blocked_staged,
        "blocked_changed": blocked_changed,
        "blocked_untracked": blocked_untracked,
        "unknown_untracked": unknown_untracked,
        "nested_git_dirs": nested,
        "errors": errors,
    }


def print_text(report: dict[str, object]) -> None:
    if report["ok"]:
        print(
            "dirty_tree_guard: ok "
            f"(mode={report['mode']}, entries={report['summary']['entries']}, "
            f"untracked={report['summary']['untracked']})"
        )
        return
    print("dirty_tree_guard: ERROR: dirty tree needs classification", file=sys.stderr)
    for key, label in (
        ("blocked_staged", "blocked staged"),
        ("blocked_changed", "blocked tracked"),
        ("blocked_untracked", "blocked untracked"),
        ("unknown_untracked", "unclassified untracked"),
        ("nested_git_dirs", "nested git repos"),
    ):
        values = report.get(key) or []
        if values:
            print(f"{label}:", file=sys.stderr)
            for value in values:
                print(f"  {value}", file=sys.stderr)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Guard against unsafe AI-produced dirty worktrees")
    parser.add_argument("--repo", default=str(Path(__file__).resolve().parent.parent))
    parser.add_argument("--mode", choices=("pre-commit", "publish"), default="pre-commit")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    args = parser.parse_args(argv)

    repo = Path(args.repo).expanduser().resolve()
    if not (repo / ".git").exists():
        raise SystemExit(f"dirty_tree_guard: ERROR: not a git repository: {repo}")

    raw = run_git(repo, ["status", "--porcelain=v1", "--untracked-files=all", "-z"])
    report = build_report(repo, parse_status(raw), args.mode)
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print_text(report)
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
