#!/usr/bin/env python3
"""Run markdownlint as a pull-request new-line gate.

The script lints changed Markdown files, then only fails for findings on lines
added by the current comparison. Historical findings in touched files are
reported but do not block the PR gate.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


FINDING_RE = re.compile(r"^(?P<path>.+?):(?P<line>\d+)(?::\d+)?\s+error\s+(?P<rule>\S+)\s+(?P<message>.*)$")


def run_git(args: list[str], root: Path) -> str:
    return subprocess.check_output(["git", *args], cwd=root, text=True)


def changed_markdown_files(root: Path, base: str, head: str) -> list[str]:
    raw = subprocess.check_output(
        ["git", "diff", "-z", "--name-only", "--diff-filter=ACMR", f"{base}...{head}", "--", "*.md"],
        cwd=root,
    )
    return [item.decode("utf-8") for item in raw.split(b"\0") if item]


def added_ranges(root: Path, base: str, head: str, path: str) -> list[tuple[int, int]]:
    diff = run_git(["diff", "--unified=0", "--diff-filter=ACMR", f"{base}...{head}", "--", path], root)
    ranges: list[tuple[int, int]] = []
    for line in diff.splitlines():
        if not line.startswith("@@"):
            continue
        marker = line.split(" +", 1)[1].split(" ", 1)[0]
        if "," in marker:
            start_text, count_text = marker.split(",", 1)
            start = int(start_text)
            count = int(count_text)
        else:
            start = int(marker)
            count = 1
        if count > 0:
            ranges.append((start, start + count - 1))
    return ranges


def in_ranges(line: int, ranges: list[tuple[int, int]]) -> bool:
    return any(start <= line <= end for start, end in ranges)


def markdownlint_command() -> list[str]:
    configured = os.environ.get("MARKDOWNLINT_COMMAND")
    if configured:
        return configured.split()
    if shutil.which("markdownlint-cli2"):
        return ["markdownlint-cli2"]
    return ["npx", "--yes", "markdownlint-cli2"]


def parse_findings(output: str) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for line in output.splitlines():
        match = FINDING_RE.match(line)
        if not match:
            continue
        findings.append(
            {
                "file": match.group("path"),
                "line": int(match.group("line")),
                "rule": match.group("rule"),
                "message": match.group("message"),
            }
        )
    return findings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True)
    parser.add_argument("--head", default="HEAD")
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--report", type=Path, default=Path("runtime/maintenance-gates/markdownlint-pr-gate.json"))
    args = parser.parse_args(argv)

    root = args.root.resolve()
    files = changed_markdown_files(root, args.base, args.head)
    if not files:
        print("No changed Markdown files.")
        return 0

    command = [*markdownlint_command(), "--no-globs", *files]
    completed = subprocess.run(command, cwd=root, text=True, capture_output=True, check=False)
    output = "\n".join(part for part in (completed.stdout, completed.stderr) if part)
    findings = parse_findings(output)
    ranges_by_file = {path: added_ranges(root, args.base, args.head, path) for path in files}
    new_findings = [
        finding
        for finding in findings
        if in_ranges(finding["line"], ranges_by_file.get(finding["file"], []))
    ]

    report = {
        "base": args.base,
        "head": args.head,
        "changed_markdown_files": files,
        "finding_count": len(findings),
        "new_finding_count": len(new_findings),
        "new_findings": new_findings,
    }
    report_path = root / args.report
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=True, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(f"markdownlint findings on changed files: {len(findings)}")
    print(f"markdownlint findings on added lines: {len(new_findings)}")
    if new_findings:
        for finding in new_findings:
            print(f"{finding['file']}:{finding['line']} {finding['rule']} {finding['message']}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
