#!/usr/bin/env python3
"""Write a local workspace project index into an Obsidian vault.

This helper is intentionally one-way: it summarizes local project metadata into
the vault and never copies vault notes back into repositories.
"""

from __future__ import annotations

import argparse
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path("/Users/yumei")
PROJECTS_DIR = ROOT / "projects"
DEFAULT_VAULT = ROOT / "Obsidian" / "MyKnowledgeVault"
DEFAULT_INDEX_RELATIVE = Path("30-AI-Ingest") / "workspace-project-index.md"

SKIP_DIRS = {
    ".git",
    ".next",
    ".omx",
    ".automation",
    ".guard",
    ".venv",
    "node_modules",
    "__pycache__",
}


def run_git(args: list[str], cwd: Path) -> str:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=str(cwd),
            check=False,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
    except OSError:
        return ""
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def is_git_repo(path: Path) -> bool:
    return (path / ".git").is_dir()


def summarize_git(path: Path) -> tuple[str, str]:
    if not is_git_repo(path):
        return "not a git repository", ""

    branch = run_git(["branch", "--show-current"], path) or "detached"
    status = run_git(["status", "--short"], path)
    dirty_count = len([line for line in status.splitlines() if line.strip()])
    upstream = run_git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], path)
    relation = ""
    if upstream:
        counts = run_git(["rev-list", "--left-right", "--count", f"HEAD...{upstream}"], path)
        if counts:
            ahead, behind = counts.split()[:2]
            relation = f", ahead {ahead}, behind {behind}"

    return f"git: {branch}{relation}, dirty files {dirty_count}", status


def first_existing(paths: list[Path]) -> Path | None:
    for path in paths:
        if path.exists():
            return path
    return None


def project_dirs() -> list[Path]:
    dirs = [ROOT]
    if PROJECTS_DIR.exists():
        dirs.extend(path for path in PROJECTS_DIR.iterdir() if path.is_dir())
    return sorted(dirs, key=lambda item: str(item).lower())


def classify_project(path: Path) -> str:
    if path == ROOT:
        return "root workspace"
    progress = path / "PROJECT_PROGRESS.md"
    package = path / "package.json"
    readme = path / "README.md"
    if is_git_repo(path):
        return "git project"
    if package.exists():
        return "local app/workspace"
    if progress.exists() or readme.exists():
        return "local documented workspace"
    return "local directory"


def local_link(path: Path) -> str:
    return str(path)


def build_index() -> str:
    generated_at = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    lines = [
        "# Workspace Project Index",
        "",
        f"Generated: {generated_at}",
        "",
        "> Local-only bridge note. Do not copy this file or vault contents into GitHub, releases, sync payloads, or public project repositories.",
        "",
        "## Projects",
        "",
    ]

    for path in project_dirs():
        if any(part in SKIP_DIRS for part in path.parts):
            continue

        title = "root-workspace" if path == ROOT else path.name
        progress = first_existing([path / "PROJECT_PROGRESS.md", path / "README.md", path / "AGENTS.md"])
        git_summary, status = summarize_git(path)
        lines.extend(
            [
                f"### {title}",
                "",
                f"- Path: `{local_link(path)}`",
                f"- Type: {classify_project(path)}",
                f"- State: {git_summary}",
            ]
        )
        if progress:
            lines.append(f"- Local record: `{local_link(progress)}`")
        if status:
            preview = "; ".join(line.strip() for line in status.splitlines()[:8])
            lines.append(f"- Dirty preview: `{preview}`")
        lines.append("")

    lines.extend(
        [
            "## Bridge Rules",
            "",
            "- This note is generated from project metadata only.",
            "- Do not import vault notes, `.obsidian/`, logs, env files, exports, or generated ingest state into any repository.",
            "- Update `/Users/yumei/docs/obsidian-local-bridge.md` and nearest `.gitignore` before adding new generated paths.",
            "",
        ]
    )
    return "\n".join(lines)


def resolve_index_path() -> Path:
    explicit_index = os.environ.get("OBSIDIAN_INDEX_PATH")
    if explicit_index:
        return Path(explicit_index).expanduser()

    vault = Path(os.environ.get("OBSIDIAN_VAULT", str(DEFAULT_VAULT))).expanduser()
    return vault / DEFAULT_INDEX_RELATIVE


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a local Obsidian workspace project index.")
    parser.add_argument("--dry-run", action="store_true", help="Print the generated note instead of writing it.")
    parser.add_argument("--index", type=Path, help="Override the output markdown path.")
    args = parser.parse_args()

    content = build_index()
    index_path = args.index.expanduser() if args.index else resolve_index_path()

    if args.dry_run:
        print(content)
        return 0

    index_path.parent.mkdir(parents=True, exist_ok=True)
    index_path.write_text(content, encoding="utf-8")
    print(f"wrote {index_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
