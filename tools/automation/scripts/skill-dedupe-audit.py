#!/usr/bin/env python3
"""Read-only audit for duplicate local AI skill directories.

G8a contract: inspect only, never modify skill roots.
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple


ROOT = Path("/Users/yumei/tools/automation")
DEFAULT_OUT = ROOT / "runtime/skill-chains/dedupe/dedupe-audit.json"
DEFAULT_DRIFT_DIFF = ROOT / "runtime/skill-chains/dedupe/drift-diffs.md"
SKILL_ROOTS = (
    Path("/Users/yumei/.codex/skills"),
    Path("/Users/yumei/vibecoding/.codex/skills"),
    Path("/Users/yumei/.agents/skills"),
    Path("/Users/yumei/.claude/skills"),
    Path("/Users/yumei/.config/opencode/skills"),
)
DOC_ROOTS = (
    Path("/Users/yumei/.codex/memories"),
    ROOT / "workspace-guides",
)
DOC_FILES = (
    Path("/Users/yumei/.claude/CLAUDE.md"),
    Path("/Users/yumei/AGENTS.md"),
    Path("/Users/yumei/.codex/config.toml"),
    Path("/Users/yumei/.codex/memories/UNIVERSAL_AI_DEV_POLICY.md"),
)
PATH_PATTERNS = (
    "/Users/yumei/.codex/skills",
    "/Users/yumei/vibecoding/.codex/skills",
    "/Users/yumei/.agents/skills",
    "/Users/yumei/.claude/skills",
    "~/.codex/skills",
    "~/vibecoding/.codex/skills",
    "~/.agents/skills",
    "~/.claude/skills",
)
MAX_DOC_BYTES = 2_000_000


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha256(path: Path) -> str:
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except Exception:
        return ""


def parse_skill_name(path: Path) -> str:
    name = path.parent.name
    try:
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines()[:40]:
            stripped = line.strip()
            if stripped.startswith("name:"):
                value = stripped.split(":", 1)[1].strip().strip("\"'")
                return value or name
    except Exception:
        pass
    return name


def root_record(root: Path) -> Dict[str, Any]:
    exists = root.exists()
    parent = root.parent
    return {
        "path": str(root),
        "exists": exists,
        "is_symlink": root.is_symlink(),
        "realpath": str(root.resolve()) if exists else "",
        "parent": str(parent),
        "parent_is_symlink": parent.is_symlink(),
        "parent_realpath": str(parent.resolve()) if parent.exists() else "",
    }


def skill_files(roots: Iterable[Path]) -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []
    seen: set[Tuple[str, str]] = set()
    for root in roots:
        if not root.exists():
            continue
        for path in sorted(root.rglob("SKILL.md")):
            if not path.is_file():
                continue
            real = str(path.resolve())
            source = str(path)
            key = (source, real)
            if key in seen:
                continue
            seen.add(key)
            records.append(
                {
                    "skill": parse_skill_name(path),
                    "path": source,
                    "realpath": real,
                    "root": str(root),
                    "root_realpath": str(root.resolve()),
                    "sha": sha256(path),
                    "size": path.stat().st_size,
                }
            )
    return records


def diff_summary(paths: List[str]) -> str:
    if len(paths) < 2:
        return ""
    left = Path(paths[0])
    right = Path(paths[1])
    try:
        a = left.read_text(encoding="utf-8", errors="replace").splitlines()
        b = right.read_text(encoding="utf-8", errors="replace").splitlines()
    except Exception:
        return "unable to read text diff"
    diff = list(difflib.unified_diff(a, b, fromfile=str(left), tofile=str(right), n=2))
    return "\n".join(diff[:80])


def parse_frontmatter_lines(lines: List[str]) -> Dict[str, Any]:
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
        result[key] = value.strip("\"'")
        i += 1
    return result


def frontmatter(path: Path) -> Dict[str, str]:
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()[:80]
    except Exception:
        return {}
    parsed = parse_frontmatter_lines(lines)
    result: Dict[str, str] = {}
    for key in {"name", "description", "category", "family"}:
        value = parsed.get(key)
        if isinstance(value, str):
            result[key] = value
    return result


def full_diff(left: Path, right: Path) -> str:
    try:
        a = left.read_text(encoding="utf-8", errors="replace").splitlines()
        b = right.read_text(encoding="utf-8", errors="replace").splitlines()
    except Exception:
        return "unable to read text diff"
    return "\n".join(difflib.unified_diff(a, b, fromfile=str(left), tofile=str(right), n=3))


def path_mtime(path: str) -> str:
    try:
        return datetime.fromtimestamp(Path(path).stat().st_mtime, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        return ""


def markdown_table(headers: List[str], rows: List[List[str]]) -> str:
    escaped_headers = [header.replace("|", "\\|") for header in headers]
    lines = ["| " + " | ".join(escaped_headers) + " |"]
    lines.append("| " + " | ".join("---" for _ in headers) + " |")
    for row in rows:
        escaped = [str(cell).replace("\n", " ").replace("|", "\\|") for cell in row]
        lines.append("| " + " | ".join(escaped) + " |")
    return "\n".join(lines)


def drift_diff_markdown(audit: Dict[str, Any]) -> str:
    lines: List[str] = [
        "# Skill Drift Diff Report",
        "",
        f"generated_at: {utc_now()}",
        "",
        "This is a read-only G8 drift artifact. It does not choose a winner or mutate skill roots.",
        "",
        "Decision vocabulary: keep A / keep B / merge / three-way merge.",
        "",
    ]
    drift_groups = audit.get("drift_groups", [])
    for index, group in enumerate(drift_groups, start=1):
        skill = group.get("skill", f"skill-{index}")
        paths = [str(path) for path in group.get("copies", [])]
        lines.extend([f"## {index}. {skill}", ""])
        lines.append("### Copies")
        copy_rows = [
            [chr(ord("A") + offset), path, sha256(Path(path)), path_mtime(path)]
            for offset, path in enumerate(paths)
        ]
        lines.extend([markdown_table(["id", "path", "sha256", "mtime_utc"], copy_rows), ""])

        lines.append("### Frontmatter")
        keys = ["name", "description", "category", "family"]
        fm_rows: List[List[str]] = []
        for offset, path in enumerate(paths):
            fm = frontmatter(Path(path))
            fm_rows.append([chr(ord("A") + offset), *(fm.get(key, "") for key in keys)])
        lines.extend([markdown_table(["id", *keys], fm_rows), ""])

        lines.extend(
            [
                "### Drift Summary",
                "",
                "```diff",
                group.get("diff_summary", "") or "(no short diff available)",
                "```",
                "",
            ]
        )

        lines.append("### Pairwise Diffs")
        for left_index in range(len(paths)):
            for right_index in range(left_index + 1, len(paths)):
                left_id = chr(ord("A") + left_index)
                right_id = chr(ord("A") + right_index)
                diff = full_diff(Path(paths[left_index]), Path(paths[right_index]))
                lines.extend(
                    [
                        "",
                        f"#### {left_id} vs {right_id}",
                        "",
                        "```diff",
                        diff or "(no diff output)",
                        "```",
                    ]
                )
        lines.extend(
            [
                "",
                "### Manual Decision",
                "",
                "- Decision: pending manual review",
                "- Rationale: pending manual review",
                "- Merge notes: pending manual review",
                "",
            ]
        )
    return "\n".join(lines) + "\n"


def group_records(records: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    groups: Dict[str, List[Dict[str, Any]]] = {}
    for record in records:
        groups.setdefault(record["skill"], []).append(record)
    return groups


def duplicate_analysis(records: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    byte_identical: List[Dict[str, Any]] = []
    drift: List[Dict[str, Any]] = []
    path_alias: List[Dict[str, Any]] = []
    for skill, group in sorted(group_records(records).items()):
        if len(group) < 2:
            continue
        by_realpath: Dict[str, List[Dict[str, Any]]] = {}
        for item in group:
            by_realpath.setdefault(item["realpath"], []).append(item)

        for realpath, aliases in sorted(by_realpath.items()):
            if len(aliases) < 2:
                continue
            path_alias.append(
                {
                    "skill": skill,
                    "paths": [item["path"] for item in aliases],
                    "realpath": realpath,
                    "roots": sorted({item["root"] for item in aliases}),
                    "sha": aliases[0]["sha"],
                    "classification": "path_alias_same_inode",
                }
            )

        physical = [items[0] for _, items in sorted(by_realpath.items())]
        if len(physical) < 2:
            continue
        shas = {item["sha"] for item in physical}
        roots = sorted({item["root"] for item in physical})
        if len(shas) == 1:
            byte_identical.append(
                {
                    "skill": skill,
                    "copies": [item["path"] for item in physical],
                    "realpaths": [item["realpath"] for item in physical],
                    "roots": roots,
                    "sha": physical[0]["sha"],
                }
            )
        else:
            drift.append(
                {
                    "skill": skill,
                    "copies": [item["path"] for item in physical],
                    "shas": sorted(shas),
                    "roots": roots,
                    "diff_summary": diff_summary([item["path"] for item in physical[:2]]),
                }
            )
    return byte_identical, drift, path_alias


def doc_candidates() -> List[Path]:
    files: List[Path] = []
    for path in DOC_FILES:
        if path.exists() and path.is_file():
            files.append(path)
    for root in DOC_ROOTS:
        if not root.exists():
            continue
        files.extend(path for path in root.rglob("*.md") if path.is_file())
        files.extend(path for path in root.rglob("*.toml") if path.is_file())
        files.extend(path for path in root.rglob("*.json") if path.is_file())
    unique: Dict[str, Path] = {}
    for path in files:
        unique[str(path)] = path
    return sorted(unique.values())


def doc_references() -> List[Dict[str, Any]]:
    refs: List[Dict[str, Any]] = []
    patterns = [(pattern, re.compile(re.escape(pattern))) for pattern in PATH_PATTERNS]
    for path in doc_candidates():
        try:
            if path.stat().st_size > MAX_DOC_BYTES:
                continue
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        except Exception:
            continue
        for lineno, line in enumerate(lines, start=1):
            for pattern, regex in patterns:
                if regex.search(line):
                    refs.append(
                        {
                            "file": f"{path}:{lineno}",
                            "path_pattern": pattern,
                            "line": line.strip()[:260],
                        }
                    )
    return refs


def config_clues() -> Dict[str, Any]:
    config_path = Path("/Users/yumei/.codex/config.toml")
    config_text = ""
    if config_path.exists():
        config_text = config_path.read_text(encoding="utf-8", errors="replace")
    skill_lines = [
        {"line": index + 1, "text": line.strip()}
        for index, line in enumerate(config_text.splitlines())
        if "skill" in line.lower() or ".codex" in line.lower()
    ]
    return {
        "codex_home_path": "/Users/yumei/.codex",
        "codex_home_is_symlink": Path("/Users/yumei/.codex").is_symlink(),
        "codex_home_realpath": str(Path("/Users/yumei/.codex").resolve()),
        "config_path": str(config_path),
        "config_realpath": str(config_path.resolve()) if config_path.exists() else "",
        "config_skill_related_lines": skill_lines,
        "inference": "Codex CLI help states config is loaded from ~/.codex/config.toml; on this machine ~/.codex is a symlink to /Users/yumei/vibecoding/.codex.",
    }


def ssot_candidates(root_records: List[Dict[str, Any]], byte_identical: List[Dict[str, Any]], path_alias: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    candidates = [
        {
            "path": "/Users/yumei/.codex/skills",
            "realpath": str(Path("/Users/yumei/.codex/skills").resolve()) if Path("/Users/yumei/.codex/skills").exists() else "",
            "score": 0.92,
            "rationale": "Operational Codex path; currently aliases the vibecoding path through ~/.codex symlink.",
        },
        {
            "path": "/Users/yumei/vibecoding/.codex/skills",
            "realpath": str(Path("/Users/yumei/vibecoding/.codex/skills").resolve()) if Path("/Users/yumei/vibecoding/.codex/skills").exists() else "",
            "score": 0.9,
            "rationale": "Physical target behind ~/.codex symlink; safest realpath canonical if using filesystem-level SSOT.",
        },
        {
            "path": "/Users/yumei/.agents/skills",
            "realpath": str(Path("/Users/yumei/.agents/skills").resolve()) if Path("/Users/yumei/.agents/skills").exists() else "",
            "score": 0.55,
            "rationale": "Shared assistant directory, but currently contains far fewer skills than Codex roots.",
        },
    ]
    if path_alias and not byte_identical:
        candidates[0]["note"] = "Largest apparent duplicate set is path alias, not a second physical copy."
    return candidates


def build_audit() -> Dict[str, Any]:
    roots = [root_record(root) for root in SKILL_ROOTS]
    records = skill_files(SKILL_ROOTS)
    byte_identical, drift, path_alias = duplicate_analysis(records)
    return {
        "generated_at": utc_now(),
        "version": 1,
        "contract": "G8a read-only audit; no filesystem mutations performed.",
        "skill_roots": roots,
        "summary": {
            "skill_file_records": len(records),
            "unique_real_skill_files": len({item["realpath"] for item in records}),
            "unique_skill_names": len({item["skill"] for item in records}),
            "path_alias_groups": len(path_alias),
            "byte_identical_groups": len(byte_identical),
            "drift_groups": len(drift),
            "doc_references": 0,
        },
        "path_alias_groups": path_alias,
        "byte_identical_groups": byte_identical,
        "drift_groups": drift,
        "doc_references": doc_references(),
        "config_clues": config_clues(),
        "ssot_candidates": ssot_candidates(roots, byte_identical, path_alias),
        "phase_a_conclusion": {
            "safe_to_run_phase_c": False,
            "reason": "Phase C is intentionally blocked. Review this audit and produce Phase B plan first.",
            "notable_finding": "/Users/yumei/.codex is a symlink to /Users/yumei/vibecoding/.codex, so many apparent duplicates are path aliases.",
        },
    }


def write_audit(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {path}")
    print("summary=" + json.dumps(payload["summary"], sort_keys=True))


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only G8a duplicate skill audit")
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    parser.add_argument("--drift-diff", action="store_true", help="Print markdown drift diff report to stdout")
    parser.add_argument("--drift-diff-out", help="Write markdown drift diff report to this path")
    parser.add_argument("--print", action="store_true", help="Print JSON to stdout instead of writing")
    args = parser.parse_args()
    payload = build_audit()
    payload["summary"]["doc_references"] = len(payload["doc_references"])
    if args.drift_diff or args.drift_diff_out:
        report = drift_diff_markdown(payload)
        if args.drift_diff_out:
            out_path = Path(args.drift_diff_out)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(report, encoding="utf-8")
            print(f"wrote {out_path}")
        else:
            print(report, end="")
        return 0
    if args.print:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        write_audit(Path(args.out), payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
