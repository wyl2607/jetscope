#!/usr/bin/env python3
"""Read-only lint for local AI SKILL.md frontmatter."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List


ROOT = Path("/Users/yumei/tools/automation")
DEFAULT_ROOTS = (
    Path("/Users/yumei/.agents/skills"),
    Path("/Users/yumei/.codex/skills"),
    Path("/Users/yumei/vibecoding/.codex/skills"),
    Path("/Users/yumei/.claude/skills"),
    Path("/Users/yumei/.config/opencode/skills"),
)
VALID_CHAIN_RE = re.compile(r"^[a-z0-9][a-z0-9-]*(?:@step[0-9]+)?$", re.I)


def parse_frontmatter(lines: List[str]) -> Dict[str, Any]:
    if not lines or lines[0].strip() != "---":
        return {}
    result: Dict[str, Any] = {}
    i = 1
    while i < len(lines):
        raw = lines[i]
        stripped = raw.strip()
        if stripped == "---":
            break
        if not stripped or stripped.startswith("#"):
            i += 1
            continue
        if ":" not in stripped:
            i += 1
            continue
        key, value = stripped.split(":", 1)
        key = key.strip()
        value = value.strip()
        if value in {">", ">-", "|", "|-"}:
            block: List[str] = []
            i += 1
            while i < len(lines):
                next_raw = lines[i]
                next_stripped = next_raw.strip()
                if next_stripped == "---":
                    break
                if next_raw and not next_raw[:1].isspace() and ":" in next_stripped:
                    break
                if next_stripped:
                    block.append(next_stripped)
                i += 1
            result[key] = " ".join(block).strip()
            continue
        if value == "":
            items: List[str] = []
            i += 1
            while i < len(lines):
                next_raw = lines[i]
                next_stripped = next_raw.strip()
                if next_stripped == "---":
                    break
                if next_stripped.startswith("-"):
                    items.append(next_stripped[1:].strip().strip("\"'"))
                    i += 1
                    continue
                if next_raw and not next_raw[:1].isspace() and ":" in next_stripped:
                    break
                if next_stripped:
                    items.append(next_stripped.strip("\"'"))
                i += 1
            result[key] = items
            continue
        if value.startswith("[") and value.endswith("]"):
            inner = value[1:-1].strip()
            if not inner:
                result[key] = []
            else:
                result[key] = [item.strip().strip("\"'") for item in inner.split(",") if item.strip()]
            i += 1
            continue
        result[key] = value.strip("\"'")
        i += 1
    return result


def is_skipped_path(path: Path) -> bool:
    text = str(path)
    return "/_archive/" in text or "/plugins/cache/" in text


def finding(path: Path, code: str, message: str) -> Dict[str, str]:
    return {"path": str(path), "code": code, "message": message}


def lint_skill_file(path: Path) -> List[Dict[str, str]]:
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()[:120]
    except Exception as exc:
        return [finding(path, "unreadable", f"cannot read SKILL.md: {exc}")]

    header = parse_frontmatter(lines)
    findings: List[Dict[str, str]] = []
    name = header.get("name")
    description = header.get("description")
    chains = header.get("chains")

    if not isinstance(name, str) or not name.strip() or name.strip() == "<name>":
        findings.append(finding(path, "missing_name", "frontmatter must include non-empty name"))
    if not isinstance(description, str) or not description.strip():
        findings.append(finding(path, "missing_description", "frontmatter must include non-empty description"))
    elif len(description.strip()) < 12:
        findings.append(finding(path, "weak_description", "description is too short to trigger reliably"))

    if "chains" in header:
        if not isinstance(chains, list):
            findings.append(finding(path, "invalid_chains", "chains must be a YAML list"))
        else:
            for chain in chains:
                if not isinstance(chain, str) or not VALID_CHAIN_RE.match(chain):
                    findings.append(finding(path, "invalid_chain_ref", f"invalid chain reference: {chain!r}"))
    return findings


def skill_files(root: Path) -> List[Path]:
    if root.is_file() and root.name == "SKILL.md":
        return [root] if not is_skipped_path(root) else []
    if not root.exists():
        return []
    return [path for path in sorted(root.rglob("SKILL.md")) if path.is_file() and not is_skipped_path(path)]


def lint_roots(roots: Iterable[Path]) -> List[Dict[str, str]]:
    findings: List[Dict[str, str]] = []
    for root in roots:
        for path in skill_files(root):
            findings.extend(lint_skill_file(path))
    return findings


def self_test() -> int:
    good = [
        "---",
        "name: good-skill",
        "description: >",
        "  Use when checking a valid multiline skill description.",
        "chains:",
        "  - feature-pr@step1",
        "---",
    ]
    bad = [
        "---",
        "name:",
        "description: >",
        "chains: feature-pr@step1",
        "---",
    ]
    good_findings = lint_header_for_self_test(good)
    bad_findings = lint_header_for_self_test(bad)
    if good_findings:
        print("self-test failed: valid block scalar was flagged")
        return 1
    codes = {item["code"] for item in bad_findings}
    if not {"missing_name", "missing_description", "invalid_chains"} <= codes:
        print("self-test failed: bad header did not produce expected findings")
        return 1
    print("self-test ok")
    return 0


def lint_header_for_self_test(lines: List[str]) -> List[Dict[str, str]]:
    path = Path("<self-test>/SKILL.md")
    header = parse_frontmatter(lines)
    findings: List[Dict[str, str]] = []
    if not isinstance(header.get("name"), str) or not str(header.get("name")).strip():
        findings.append(finding(path, "missing_name", "frontmatter must include non-empty name"))
    if not isinstance(header.get("description"), str) or not str(header.get("description")).strip():
        findings.append(finding(path, "missing_description", "frontmatter must include non-empty description"))
    if "chains" in header and not isinstance(header.get("chains"), list):
        findings.append(finding(path, "invalid_chains", "chains must be a YAML list"))
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only lint for local AI SKILL.md frontmatter")
    parser.add_argument("roots", nargs="*", help="Skill roots or SKILL.md files")
    parser.add_argument("--json", action="store_true", help="Print JSON findings")
    parser.add_argument("--include-archives", action="store_true", help="Lint _archive and plugin cache paths too")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        return self_test()

    roots = [Path(item) for item in args.roots] if args.roots else list(DEFAULT_ROOTS)
    global is_skipped_path
    if args.include_archives:
        is_skipped_path = lambda path: False  # type: ignore[assignment]

    findings = lint_roots(roots)
    if args.json:
        print(json.dumps({"ok": not findings, "finding_count": len(findings), "findings": findings}, indent=2))
    else:
        for item in findings:
            print(f"{item['path']}: {item['code']}: {item['message']}")
        print(f"finding_count={len(findings)}")
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
