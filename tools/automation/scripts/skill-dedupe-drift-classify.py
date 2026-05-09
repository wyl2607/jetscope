#!/usr/bin/env python3
"""Classify live skill drift and suggest a non-archive SSOT candidate.

G8-drift-classify contract: read skill roots and existing audit artifacts,
write only the classified drift report artifacts.
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple


ROOT = Path("/Users/yumei/tools/automation")
AUDIT_PATH = ROOT / "runtime/skill-chains/dedupe/dedupe-audit.json"
OUT_MD = ROOT / "runtime/skill-chains/dedupe/drift-classified.md"
OUT_JSON = ROOT / "runtime/skill-chains/dedupe/drift-classified.json"
IGNORED_SCHEMA_FIELDS = {"chains", "category", "family", "name"}
INTENTIONAL_VARIANTS = {
    "codex-delegate": "assistant-variant: Claude and Codex/OpenCode variants intentionally differ in subject, fallback, and ledger paths.",
}
PATH_PRIORITY = (
    "/Users/yumei/.agents/skills/",
    "/Users/yumei/.codex/skills/",
    "/Users/yumei/.config/opencode/skills/",
    "/Users/yumei/.claude/skills/",
)
ACTION_VERBS = {
    "add",
    "analyze",
    "append",
    "ask",
    "build",
    "check",
    "choose",
    "classify",
    "collect",
    "compare",
    "confirm",
    "create",
    "define",
    "delegate",
    "detect",
    "document",
    "execute",
    "fix",
    "generate",
    "identify",
    "implement",
    "inspect",
    "list",
    "load",
    "merge",
    "note",
    "parse",
    "plan",
    "read",
    "record",
    "report",
    "review",
    "run",
    "select",
    "stop",
    "summarize",
    "update",
    "validate",
    "verify",
    "write",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def mtime_utc(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def read_text(path: str) -> str:
    return Path(path).read_text(encoding="utf-8", errors="replace")


def parse_frontmatter(text: str) -> Dict[str, Any]:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}
    result: Dict[str, Any] = {}
    i = 1
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
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
            current_list: List[str] = []
            i += 1
            while i < len(lines):
                next_raw = lines[i]
                next_stripped = next_raw.strip()
                if next_stripped == "---":
                    break
                if next_stripped.startswith("- "):
                    current_list.append(next_stripped[2:].strip().strip("\"'"))
                    i += 1
                    continue
                if next_raw and not next_raw[:1].isspace() and ":" in next_stripped:
                    break
                if next_stripped:
                    current_list.append(next_stripped.strip("\"'"))
                i += 1
            result[key] = current_list
            continue
        if ":" in stripped and not stripped.startswith("#"):
            result[key] = value.strip("\"'")
        i += 1
    return result


def normalize_title(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()


def parse_sections(text: str) -> Dict[str, str]:
    sections: Dict[str, List[str]] = {}
    current = "preamble"
    sections[current] = []
    for line in text.splitlines():
        match = re.match(r"^##+\s+(.+?)\s*$", line)
        if match:
            current = normalize_title(match.group(1))
            sections.setdefault(current, [])
            continue
        sections.setdefault(current, []).append(line)
    return {name: "\n".join(lines).strip() for name, lines in sections.items()}


def matching_section_content(sections: Dict[str, str], needles: Iterable[str]) -> str:
    parts = [
        body
        for title, body in sorted(sections.items())
        if any(needle in title for needle in needles)
    ]
    return "\n\n".join(part for part in parts if part).strip()


def normalized_body(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def count_steps(text: str) -> int:
    return sum(1 for line in text.splitlines() if re.match(r"^\s*(?:\d+\.|-|\*)\s+\S", line))


def action_verbs(text: str) -> List[str]:
    verbs: List[str] = []
    for line in text.splitlines():
        match = re.match(r"^\s*(?:\d+\.|-|\*)\s+`?([A-Za-z][A-Za-z_-]*)", line)
        if not match:
            continue
        token = match.group(1).lower().replace("_", "-").split("-", 1)[0]
        if token in ACTION_VERBS:
            verbs.append(token)
    return verbs


def jaccard_distance(left: Iterable[str], right: Iterable[str]) -> float:
    a = set(left)
    b = set(right)
    if not a and not b:
        return 0.0
    return 1.0 - (len(a & b) / len(a | b))


def section_count_pair(left: Dict[str, str], right: Dict[str, str]) -> Dict[str, int]:
    return {"A": len(left), "B": len(right)}


def compare_pair(left: Dict[str, Any], right: Dict[str, Any]) -> Dict[str, Any]:
    left_text = read_text(left["representative_path"])
    right_text = read_text(right["representative_path"])
    left_fm = parse_frontmatter(left_text)
    right_fm = parse_frontmatter(right_text)
    left_sections = parse_sections(left_text)
    right_sections = parse_sections(right_text)
    frontmatter_field_diff = sorted(
        (set(left_fm) ^ set(right_fm)) - IGNORED_SCHEMA_FIELDS
    )
    left_section_names = set(left_sections)
    right_section_names = set(right_sections)
    non_left = matching_section_content(left_sections, ("non negotiable", "non negotiables"))
    non_right = matching_section_content(right_sections, ("non negotiable", "non negotiables"))
    stop_left = matching_section_content(left_sections, ("stop condition", "stop conditions", "forbidden"))
    stop_right = matching_section_content(right_sections, ("stop condition", "stop conditions", "forbidden"))
    workflow_left = matching_section_content(left_sections, ("workflow", "steps"))
    workflow_right = matching_section_content(right_sections, ("workflow", "steps"))
    left_steps = count_steps(workflow_left)
    right_steps = count_steps(workflow_right)
    verb_distance = jaccard_distance(action_verbs(workflow_left), action_verbs(workflow_right))
    non_differ = bool(non_left or non_right) and normalized_body(non_left) != normalized_body(non_right)
    stop_differ = bool(stop_left or stop_right) and normalized_body(stop_left) != normalized_body(stop_right)
    workflow_semantic_differ = abs(left_steps - right_steps) >= 3 or verb_distance >= 0.40
    if non_differ or stop_differ or workflow_semantic_differ:
        pair_class = "L3"
    elif frontmatter_field_diff:
        pair_class = "L2"
    else:
        pair_class = "L1"
    return {
        "left": left["group"],
        "right": right["group"],
        "class": pair_class,
        "frontmatter_field_diff": frontmatter_field_diff,
        "section_count": section_count_pair(left_sections, right_sections),
        "section_names_only_left": sorted(left_section_names - right_section_names),
        "section_names_only_right": sorted(right_section_names - left_section_names),
        "section_name_jaccard": round(1.0 - jaccard_distance(left_section_names, right_section_names), 3),
        "non_negotiables_differ": non_differ,
        "stop_conditions_differ": stop_differ,
        "workflow_step_count": {"A": left_steps, "B": right_steps},
        "workflow_action_verb_distance": round(verb_distance, 3),
        "workflow_semantic_differ": workflow_semantic_differ,
    }


def path_priority(path: str) -> int:
    for index, prefix in enumerate(PATH_PRIORITY):
        if path.startswith(prefix):
            return len(PATH_PRIORITY) - index
    return 0


def copy_record(path: str) -> Dict[str, Any]:
    p = Path(path)
    return {
        "path": path,
        "sha": sha256(p),
        "mtime": mtime_utc(p),
        "is_archive": "/_archive/" in path,
    }


def live_groups(copies: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    by_sha: Dict[str, List[Dict[str, Any]]] = {}
    for copy in copies:
        by_sha.setdefault(copy["sha"], []).append(copy)
    groups: List[Dict[str, Any]] = []
    for index, sha in enumerate(sorted(by_sha), start=1):
        items = sorted(by_sha[sha], key=lambda item: (-path_priority(item["path"]), item["path"]))
        groups.append(
            {
                "group": f"grp{index}",
                "sha": sha,
                "paths": [item["path"] for item in items],
                "representative_path": items[0]["path"],
                "mtime_latest": max(item["mtime"] for item in items),
            }
        )
    return groups


def suggest_ssot(live: List[Dict[str, Any]]) -> str:
    candidates = []
    for group in live:
        for path in group["paths"]:
            if "/_archive/" in path:
                continue
            candidates.append((group["mtime_latest"], path_priority(path), path))
    if not candidates:
        return ""
    return sorted(candidates, key=lambda item: (item[0], item[1], item[2]), reverse=True)[0][2]


def classify_group(group: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    skill = group["skill"]
    records = [copy_record(path) for path in group.get("copies", [])]
    archive = [record for record in records if record["is_archive"]]
    live = [record for record in records if not record["is_archive"]]
    live_by_sha = live_groups(live)
    live_sha_to_group = {item["sha"]: item["group"] for item in live_by_sha}
    live_shas = set(live_sha_to_group)
    archive_records: List[Dict[str, Any]] = []
    notes: List[str] = []
    for record in archive:
        matches_live = record["sha"] in live_shas
        archive_records.append(
            {
                "path": record["path"],
                "sha": record["sha"],
                "mtime": record["mtime"],
                "matches_live": matches_live,
                "matching_live_group": live_sha_to_group.get(record["sha"], ""),
            }
        )
        if not matches_live:
            notes.append(f"{skill}: 归档与活跃版本漂移: {record['path']}")
    live_rows = []
    for group_record in live_by_sha:
        for path in group_record["paths"]:
            source = next(item for item in live if item["path"] == path)
            live_rows.append(
                {
                    "path": path,
                    "sha": group_record["sha"],
                    "mtime": source["mtime"],
                    "group": group_record["group"],
                }
            )
    pairwise = []
    for left_index in range(len(live_by_sha)):
        for right_index in range(left_index + 1, len(live_by_sha)):
            pairwise.append(compare_pair(live_by_sha[left_index], live_by_sha[right_index]))
    class_rank = {"L1": 1, "L2": 2, "L3": 3}
    drift_class = "L1"
    for pair in pairwise:
        if class_rank[pair["class"]] > class_rank[drift_class]:
            drift_class = pair["class"]
    frontmatter_diff = sorted({field for pair in pairwise for field in pair["frontmatter_field_diff"]})
    non_diff = any(pair["non_negotiables_differ"] for pair in pairwise)
    stop_diff = any(pair["stop_conditions_differ"] for pair in pairwise)
    workflow_diff = any(pair["workflow_semantic_differ"] for pair in pairwise)
    section_count = pairwise[0]["section_count"] if pairwise else {"A": 0, "B": 0}
    ssot = suggest_ssot(live_by_sha)
    if drift_class == "L3":
        confidence = "low"
        rationale = "manual decision required: live copies differ in behavioral surfaces such as workflow, non-negotiables, or stop/forbidden guidance."
    elif drift_class == "L2":
        confidence = "medium"
        rationale = "SSOT is the newest live copy after excluding archives, but schema/frontmatter fields differ and need review."
    else:
        confidence = "high"
        rationale = "SSOT is the newest live copy after excluding archives; detected differences are cosmetic by the configured heuristics."
    if skill in INTENTIONAL_VARIANTS and len(live_by_sha) > 1:
        drift_class = "L0"
        confidence = "high"
        rationale = INTENTIONAL_VARIANTS[skill]
    for record in live:
        if "/.config/opencode/skills/" in record["path"] and record["sha"] in {item["sha"] for item in archive} and len(live_by_sha) > 1:
            notes.append(f"{skill}: opencode 在用与归档副本相同的内容: {record['path']}")
    return (
        {
            "id": skill,
            "class": drift_class,
            "live_copies": live_rows,
            "archive_copies": archive_records,
            "live_groups": [
                {
                    "group": item["group"],
                    "sha": item["sha"],
                    "representative_path": item["representative_path"],
                    "paths": item["paths"],
                }
                for item in live_by_sha
            ],
            "drift_surface": {
                "frontmatter_field_diff": frontmatter_diff,
                "section_count": section_count,
                "non_negotiables_differ": non_diff,
                "stop_conditions_differ": stop_diff,
                "workflow_semantic_differ": workflow_diff,
                "pairwise": pairwise,
            },
            "suggested_ssot": ssot,
            "confidence": confidence,
            "rationale": rationale,
        },
        notes,
    )


def markdown_table(headers: List[str], rows: List[List[str]]) -> List[str]:
    lines = ["| " + " | ".join(headers) + " |"]
    lines.append("| " + " | ".join("---" for _ in headers) + " |")
    for row in rows:
        escaped = [str(cell).replace("\n", " ").replace("|", "\\|") for cell in row]
        lines.append("| " + " | ".join(escaped) + " |")
    return lines


def render_markdown(payload: Dict[str, Any]) -> str:
    lines: List[str] = [
        "# Drift Classification Report",
        "",
        f"generated_at: {payload['generated_at']}",
        "",
        "read-only artifact. Does not mutate skill roots or dedupe plan.",
        "",
        "## Triage Summary",
        "",
    ]
    by_class = {key: [] for key in ("L0", "L1", "L2", "L3")}
    for skill in payload["skills"]:
        by_class[skill["class"]].append(skill["id"])
    lines.extend(
        markdown_table(
            ["Class", "Count", "Skills"],
            [
                ["L0 Intentional Variant", payload["summary"]["L0"], ", ".join(by_class["L0"]) or "-"],
                ["L1 Cosmetic", payload["summary"]["L1"], ", ".join(by_class["L1"]) or "-"],
                ["L2 Schema", payload["summary"]["L2"], ", ".join(by_class["L2"]) or "-"],
                ["L3 Behavioral", payload["summary"]["L3"], ", ".join(by_class["L3"]) or "-"],
            ],
        )
    )
    lines.extend(["", "## ⚠️ Notable Findings", ""])
    if payload["notable_findings"]:
        lines.extend(f"- {note}" for note in payload["notable_findings"])
    else:
        lines.append("- None detected.")
    lines.extend(["", "## Per-Skill Sections", ""])
    for index, skill in enumerate(payload["skills"], start=1):
        surface = skill["drift_surface"]
        lines.extend(
            [
                f"### {index}. {skill['id']}",
                "",
                f"**Class**: {skill['class']}",
                "",
                "**Live Copies**",
            ]
        )
        lines.extend(
            markdown_table(
                ["id", "path", "sha256 (short)", "mtime", "group"],
                [
                    [chr(ord("A") + offset), item["path"], item["sha"][:12], item["mtime"], item["group"]]
                    for offset, item in enumerate(skill["live_copies"])
                ],
            )
        )
        lines.extend(["", "**Archive Copies (excluded from SSOT)**"])
        if skill["archive_copies"]:
            for item in skill["archive_copies"]:
                marker = "" if item["matches_live"] else " ⚠️ sha differs from live"
                match = f" matches {item['matching_live_group']}" if item["matching_live_group"] else ""
                lines.append(f"- {item['path']} ({item['sha'][:12]}, {item['mtime']}){match}{marker}")
        else:
            lines.append("- None")
        pair_summary = "; ".join(
            f"{pair['left']} vs {pair['right']}={pair['class']}"
            for pair in surface["pairwise"]
        ) or "single live group"
        lines.extend(
            [
                "",
                "**Drift Surface**",
                f"- frontmatter diff: {', '.join(surface['frontmatter_field_diff']) or 'none'}",
                f"- section count: A={surface['section_count'].get('A', 0)} / B={surface['section_count'].get('B', 0)}",
                f"- non-negotiables differ: {str(surface['non_negotiables_differ']).lower()}",
                f"- stop conditions differ: {str(surface['stop_conditions_differ']).lower()}",
                f"- workflow semantic differ: {str(surface['workflow_semantic_differ']).lower()}",
                f"- pairwise class: {pair_summary}",
                "",
                f"**Suggested SSOT**: {skill['suggested_ssot']}",
                f"**Confidence**: {skill['confidence']}",
                f"**Rationale**: {skill['rationale']}",
                "",
                "**Manual Decision**:",
                "- [ ] Confirm class",
                "- [ ] Confirm SSOT choice",
                "- [ ] Note any unique content to port",
                "",
                "---",
                "",
            ]
        )
    return "\n".join(lines)


def build_report() -> Dict[str, Any]:
    audit = json.loads(AUDIT_PATH.read_text(encoding="utf-8"))
    skills: List[Dict[str, Any]] = []
    notes: List[str] = []
    for group in audit.get("drift_groups", []):
        skill, skill_notes = classify_group(group)
        skills.append(skill)
        notes.extend(skill_notes)
    summary = {"L0": 0, "L1": 0, "L2": 0, "L3": 0}
    for skill in skills:
        summary[skill["class"]] += 1
    unique_notes = sorted(dict.fromkeys(notes))
    return {
        "generated_at": utc_now(),
        "summary": summary,
        "notable_findings": unique_notes,
        "skills": skills,
    }


def main() -> int:
    payload = build_report()
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    OUT_MD.write_text(render_markdown(payload) + "\n", encoding="utf-8")
    print(f"wrote {OUT_MD}")
    print(f"wrote {OUT_JSON}")
    print("summary=" + json.dumps(payload["summary"], sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
