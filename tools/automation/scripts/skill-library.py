#!/usr/bin/env python3
"""Generate a read-only Skill Library index from local SKILL.md files."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple


ROOT = Path("/Users/yumei/tools/automation")
DEFAULT_REGISTRY = ROOT / "workspace-guides/skill-chains/registry.json"
DEFAULT_OUT_DIR = ROOT / "runtime/skill-chains/dashboard"
DEFAULT_TRACE_FILES = (
    ROOT / "runtime/ai-trace/session-ledger.jsonl",
    ROOT / "runtime/ai-trace/issue-ledger.jsonl",
    ROOT / "runtime/ai-trace/solution-ledger.jsonl",
)
SKILL_ROOTS = (
    Path("/Users/yumei/.claude/skills"),
    Path("/Users/yumei/.agents/skills"),
    Path("/Users/yumei/.codex/skills"),
    Path("/Users/yumei/vibecoding/.codex/skills"),
    Path("/Users/yumei/vibecoding/.codex/plugins/cache"),
    Path("/Users/yumei/.config/opencode/skills"),
)
INTENTIONAL_VARIANTS = {
    "codex-delegate": "assistant-variant: Claude and Codex/OpenCode variants intentionally differ in subject, fallback, and ledger paths.",
}
TRACE_TAIL_LINES = 500
DOC_REF_FILES = (
    ROOT / "workspace-guides/skill-chains/registry.md",
    ROOT / "workspace-guides/skill-chains/DASHBOARD_DAILY_ENTRY.md",
    ROOT / "workspace-guides/skill-chains/assistant-capabilities.json",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def read_json(path: Path) -> Dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def skill_files(roots: Iterable[Path]) -> List[Path]:
    files: List[Path] = []
    for root in roots:
        if not root.exists():
            continue
        files.extend(path for path in root.rglob("SKILL.md") if path.is_file())
    return sorted(files)


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
        result[key] = value.strip("\"'")
        i += 1
    return result


def parse_header(path: Path) -> Dict[str, Any]:
    name = path.parent.name
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except Exception:
        lines = []
    header = parse_frontmatter(lines[:80])
    name = str(header.get("name") or name)
    description = str(header.get("description") or "")
    category = str(header.get("category") or "")
    family = str(header.get("family") or "")
    raw_chains = header.get("chains") or []
    chains = [str(item) for item in raw_chains] if isinstance(raw_chains, list) else []
    return {
        "name": name,
        "description": description,
        "category": category,
        "family": family,
        "chains": chains,
        "sop_summary": extract_sop(lines),
        "non_negotiables": extract_section_items(lines, {"non-negotiable contract", "non-negotiables", "safety"}),
        "stop_conditions": extract_stop_conditions(lines),
    }


def extract_section_items(lines: List[str], headings: set[str], limit: int = 8) -> List[str]:
    items: List[str] = []
    active = False
    for line in lines:
        stripped = line.strip()
        lower = stripped.strip("# ").lower()
        if stripped.startswith("#") and lower in headings:
            active = True
            continue
        if active and stripped.startswith("#"):
            active = False
        if not active:
            continue
        match = re.match(r"^(?:[-*]|\d+[.)])\s+(.+)$", stripped)
        if match:
            item = match.group(1).strip()
            if item and len(items) < limit:
                items.append(item)
    return items


def extract_stop_conditions(lines: List[str]) -> List[str]:
    stops: List[str] = []
    for line in lines:
        stripped = line.strip()
        lower = stripped.lower()
        if any(token in lower for token in ("stop", "do not", "never", "ask", "fail closed")):
            cleaned = re.sub(r"^(?:[-*]|\d+[.)])\s+", "", stripped).strip()
            if cleaned and len(cleaned) < 180 and cleaned not in stops:
                stops.append(cleaned)
        if len(stops) >= 8:
            break
    return stops


def extract_sop(lines: List[str]) -> List[str]:
    headings = {
        "workflow",
        "working method",
        "non-negotiable contract",
        "routing",
        "test plan",
        "failure handling",
        "steps",
        "sop",
    }
    summary: List[str] = []
    active = False
    for line in lines:
        stripped = line.strip()
        lower = stripped.strip("# ").lower()
        if stripped.startswith("#") and lower in headings:
            active = True
            continue
        if active and stripped.startswith("#"):
            active = False
        if not active:
            continue
        match = re.match(r"^(?:[-*]|\d+[.)])\s+(.+)$", stripped)
        if match:
            item = match.group(1).strip()
            if item and len(summary) < 5:
                summary.append(item)
    return summary


def category_for(name: str, description: str) -> str:
    text = f"{name} {description}".lower()
    exact = {
        "chain-router": "orchestration",
        "harness-engineering-orchestrator": "orchestration",
        "goal-dispatch-planner": "orchestration",
        "grouped-commit-cycle": "orchestration",
        "release-readiness-runner": "orchestration",
        "auto-merge-action": "orchestration",
        "dirty-tree-slicer": "orchestration",
        "analyze": "analysis",
        "code-review": "analysis",
        "repo-onboarding": "analysis",
        "project-boundary-inventory": "analysis",
        "autoresearch": "analysis",
        "incremental-workspace-scan": "analysis",
        "repo-refactor-and-audit": "analysis",
        "test-harness": "quality",
        "test-driven-driver": "quality",
        "acceptance-gate-development": "quality",
        "quality-refactor-loop": "quality",
        "browser-qa": "quality",
        "visual-verdict": "quality",
        "ultraqa": "quality",
        "cycle-effect-auditor": "quality",
        "migration-safety": "quality",
        "security-review": "quality",
        "ai-slop-cleaner": "health",
        "memory-aging-sweeper": "health",
        "workspace-daily-audit": "health",
        "workspace-health-check": "health",
        "workspace-ops-convergence": "health",
        "codex-delegate": "delegation",
        "ask-claude": "delegation",
        "ask-gemini": "delegation",
        "migrate-to-codex": "delegation",
        "command-code-bridge": "delegation",
        "worker": "delegation",
        "plan": "planning",
        "goal-driven-execution": "planning",
        "goal-refactor": "planning",
        "note": "knowledge",
        "trace": "knowledge",
        "wiki": "knowledge",
        "hud": "knowledge",
        "doctor": "knowledge",
        "configure-notifications": "knowledge",
        "pr-push-guard": "gate",
        "pr-review-guard": "gate",
    }
    if name in exact:
        return exact[name]
    rules = [
        ("gate", r"pr|push|release|merge|review-guard|push-guard|auto-merge"),
        ("orchestration", r"router|orchestrat|dispatch|grouped|readiness|slicer|chain"),
        ("analysis", r"analy[sz]e|research|audit|onboarding|inventory|scan|review"),
        ("quality", r"test|gate|acceptance|driver|quality|qa|visual|security|migration|verdict"),
        ("health", r"health|daily|ops|aging|sweeper|cleanup|slop|convergence"),
        ("delegation", r"claude|gemini|codex|opencode|team|worker|delegate|bridge|migrate"),
        ("planning", r"plan|sdd|goal|sprint|rfc|specify|draft"),
        ("knowledge", r"note|trace|wiki|hud|doctor|notification|memory"),
    ]
    for label, pattern in rules:
        if re.search(pattern, text):
            return label
    return "utility/toolbox"


def registry_skill_refs(registry: Dict[str, Any]) -> Dict[str, List[str]]:
    refs: Dict[str, List[str]] = defaultdict(list)
    chains = registry.get("chains", {})
    if not isinstance(chains, dict):
        return refs
    for chain_name, chain in chains.items():
        if not isinstance(chain, dict):
            continue
        for step in chain.get("steps", []):
            if not isinstance(step, dict):
                continue
            for key in ("skill", "stage", "action", "command"):
                value = step.get(key)
                if isinstance(value, str) and value:
                    refs[value].append(f"{chain_name}@step{step.get('step', '?')}")
                    break
            values = step.get("skills")
            if isinstance(values, list):
                for value in values:
                    refs[str(value)].append(f"{chain_name}@step{step.get('step', '?')}")
    return refs


def trace_text(paths: Iterable[Path]) -> str:
    chunks: List[str] = []
    for path in paths:
        if not path.exists():
            continue
        try:
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        except Exception:
            continue
        chunks.extend(lines[-TRACE_TAIL_LINES:])
    return "\n".join(chunks)


def trace_usage(paths: Iterable[Path], skill_names: Iterable[str]) -> Dict[str, Dict[str, Any]]:
    names = sorted(set(skill_names), key=len, reverse=True)
    usage = {name: {"invoke_count_30d": 0, "last_used": "", "source": "runtime/ai-trace/*.jsonl heuristic"} for name in names}
    for path in paths:
        if not path.exists():
            continue
        try:
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()[-TRACE_TAIL_LINES:]
        except Exception:
            continue
        for line in lines:
            timestamp = ""
            try:
                record = json.loads(line)
                timestamp = str(record.get("timestamp") or record.get("ts") or "")
                haystack = json.dumps(record, ensure_ascii=False)
                explicit = record.get("skill_invoked")
                if explicit and str(explicit) in usage:
                    item = usage[str(explicit)]
                    item["invoke_count_30d"] += 1
                    item["source"] = "runtime/ai-trace/*.jsonl skill_invoked"
                    if timestamp > item["last_used"]:
                        item["last_used"] = timestamp
                    continue
            except Exception:
                haystack = line
            for name in names:
                if re.search(r"(?<![A-Za-z0-9_-])" + re.escape(name) + r"(?![A-Za-z0-9_-])", haystack, flags=re.I):
                    item = usage[name]
                    item["invoke_count_30d"] += 1
                    if timestamp > item["last_used"]:
                        item["last_used"] = timestamp
    return usage


def doc_ref_counts(skill_names: Iterable[str]) -> Dict[str, int]:
    text = ""
    for path in DOC_REF_FILES:
        if not path.exists():
            continue
        try:
            text += path.read_text(encoding="utf-8", errors="replace") + "\n"
        except Exception:
            continue
    counts: Dict[str, int] = {}
    for name in skill_names:
        counts[name] = len(re.findall(r"(?<![A-Za-z0-9_-])" + re.escape(name) + r"(?![A-Za-z0-9_-])", text, flags=re.I))
    return counts


def canonical_copy(copies: List[Dict[str, Any]]) -> Dict[str, Any]:
    def score(copy: Dict[str, Any]) -> Tuple[int, int, str]:
        path = copy["source"]
        archive_penalty = 1 if "/_archive/" in path or "/.system/" in path else 0
        root_score = 0
        if "/.codex/skills/" in path:
            root_score = -3
        elif "/.agents/skills/" in path:
            root_score = -2
        elif "/.claude/skills/" in path:
            root_score = -1
        return (archive_penalty, root_score, path)

    return sorted(copies, key=score)[0]


def copy_role(source: str, real_source: str) -> str:
    if "/plugins/cache/" in source:
        return "vendor-managed"
    if "/_archive/" in source:
        return "archive"
    if "/.system/" in source:
        return "system-managed"
    if source != real_source:
        return "path-alias"
    return "live"


def copy_visibility(role: str) -> str:
    if role in {"archive", "vendor-managed"}:
        return "reference"
    if role in {"path-alias", "system-managed"}:
        return "visible"
    return "active"


def role_counts(copies: List[Dict[str, Any]]) -> Dict[str, int]:
    counts: Dict[str, int] = Counter(str(copy.get("copy_role", "live")) for copy in copies)
    return dict(sorted(counts.items()))


def duplicate_kind(name: str, copies: List[Dict[str, Any]]) -> str:
    if name in INTENTIONAL_VARIANTS:
        return "intentional-variant"
    copy_roles = {copy.get("copy_role") for copy in copies}
    active_hashes = {
        copy.get("sha256", "")
        for copy in copies
        if copy.get("copy_visibility") in {"active", "visible"}
    }
    active_hashes.discard("")
    active_roles = {
        copy.get("copy_role")
        for copy in copies
        if copy.get("copy_visibility") in {"active", "visible"}
    }
    if len(active_hashes) > 1:
        return "active-drift-risk"
    if "archive" in copy_roles:
        return "archive-noise"
    if "vendor-managed" in copy_roles:
        return "vendor-noise"
    if active_roles <= {"live", "path-alias", "system-managed"}:
        return "alias-or-system-noise"
    return "duplicate"


def purpose(description: str) -> str:
    return description or "No description in SKILL.md header."


def effect_for(category: str) -> str:
    return {
        "orchestration": "Decides the next role, route, chain, or gate before execution begins.",
        "analysis": "Produces grounded read-only findings before implementation or routing.",
        "quality": "Runs checks or QA loops and turns risk into pass/fail evidence.",
        "health": "Reduces workspace entropy through recurring audits, cleanup, and stale-state review.",
        "delegation": "Chooses or coordinates the right AI/runtime lane for a bounded job.",
        "planning": "Turns ambiguous requests into structured specs, plans, and goal packets.",
        "knowledge": "Writes, reads, or organizes persistent context and traceability.",
        "gate": "Protects push, PR, merge, deploy, and remote action boundaries.",
        "utility/toolbox": "Provides specialized tooling that does not belong to a core chain family.",
    }.get(category, "Captures a reusable local workflow.")


def why_independent(name: str, category: str, chain_refs: List[str], copies: List[Dict[str, Any]]) -> str:
    if chain_refs:
        return "Referenced by skill-chain registry, so it acts as a reusable chain step or gate."
    if category == "gate":
        return "Owns a safety boundary where accidental merging with broader workflows would increase risk."
    if category == "utility/toolbox":
        return "Depends on specialized tools or runtime assumptions that should stay isolated."
    if len(copies) > 1:
        return "Multiple assistants install this workflow; keep one canonical definition and treat the rest as copies."
    return "Independent only if it captures a repeatable SOP that is not just a tag or alias."


def optimization_for(category: str, duplicate_count: int, chain_refs: List[str], usage: int) -> str:
    if duplicate_count > 1:
        return "Pick a canonical copy, archive or alias duplicates, and keep assistant-specific paths as install targets."
    if not chain_refs and usage == 0:
        return "Review whether this should remain a standalone skill, become a library note, or move to archive."
    if chain_refs and usage == 0:
        return "Add trace writeback when this skill runs so utilization reflects real chain use."
    if category == "gate":
        return "Keep independent; improve machine-readable gates and failure reasons."
    return "Add structured metadata for purpose, SOP, expected effect, and verification evidence."


def family_for(name: str, category: str, frontmatter_family: str) -> str:
    if frontmatter_family:
        return frontmatter_family
    family_rules = [
        ("read-only-analysis", {"analyze", "code-review", "repo-onboarding", "project-boundary-inventory", "autoresearch", "incremental-workspace-scan", "repo-refactor-and-audit"}),
        ("goal-routing", {"goal-driven-execution", "goal-refactor", "goal-dispatch-planner", "codex-delegate"}),
        ("sdd", {"sdd-specify", "sdd-draft", "sdd-review", "sdd-rfc"}),
        ("workspace-ops", {"workspace-daily-audit", "workspace-health-check", "workspace-ops-convergence"}),
        ("quality", {"test-harness", "test-driven-driver", "acceptance-gate-development", "quality-refactor-loop"}),
        ("visual-qa", {"visual-verdict", "browser-qa", "ultraqa"}),
        ("release-gates", {"pr-push-guard", "pr-review-guard", "release-readiness-runner", "auto-merge-action"}),
        ("cleanup", {"ai-slop-cleaner", "memory-aging-sweeper"}),
    ]
    for family, names in family_rules:
        if name in names:
            return family
    return category


def consolidation_for(name: str, category: str, family: str, duplicate_count: int, chain_refs: List[str], usage: int) -> Dict[str, Any]:
    merge_with = {
        "read-only-analysis": ["analyze", "code-review", "repo-onboarding"],
        "goal-routing": ["goal-driven-execution", "goal-refactor", "goal-dispatch-planner", "codex-delegate"],
        "workspace-ops": ["workspace-daily-audit", "workspace-health-check", "workspace-ops-convergence"],
        "visual-qa": ["visual-verdict", "browser-qa", "ultraqa"],
        "cleanup": ["ai-slop-cleaner", "memory-aging-sweeper"],
    }.get(family, [])
    if duplicate_count > 1:
        if name in INTENTIONAL_VARIANTS:
            return {
                "verdict": "keep_variant",
                "merge_with": [],
                "rationale": INTENTIONAL_VARIANTS[name],
            }
        return {
            "verdict": "merge_candidate",
            "merge_with": [item for item in merge_with if item != name],
            "rationale": "Multiple installed copies exist; consolidate to one canonical definition plus assistant-specific install targets.",
        }
    if category == "gate" or chain_refs:
        return {
            "verdict": "keep",
            "merge_with": [],
            "rationale": "Referenced by a chain or owns a safety boundary.",
        }
    if usage == 0:
        return {
            "verdict": "retire_candidate",
            "merge_with": merge_with,
            "rationale": "No recent trace usage and no chain reference were found.",
        }
    return {
        "verdict": "keep",
        "merge_with": merge_with,
        "rationale": "Recent usage exists; keep visible while improving metadata.",
    }


def importance_object(chain_refs: List[str], invoke_count: int, user_doc_refs: int, is_gate: bool, max_values: Dict[str, int]) -> Dict[str, Any]:
    chain_norm = len(chain_refs) / max(max_values.get("chain_refs", 1), 1)
    invoke_norm = invoke_count / max(max_values.get("invoke_count", 1), 1)
    doc_norm = user_doc_refs / max(max_values.get("user_doc_refs", 1), 1)
    score = (0.4 * chain_norm) + (0.3 * invoke_norm) + (0.2 * doc_norm) + (0.1 * (1 if is_gate else 0))
    return {
        "score": round(min(score, 1.0), 3),
        "factors": {
            "chain_refs": len(chain_refs),
            "user_doc_refs": user_doc_refs,
            "invoke_count": invoke_count,
            "is_gate": is_gate,
            "chain_refs_norm": round(chain_norm, 3),
            "invoke_count_norm": round(invoke_norm, 3),
            "user_doc_refs_norm": round(doc_norm, 3),
        },
    }


def build_library(registry_path: Path, trace_files: Iterable[Path]) -> Dict[str, Any]:
    registry = read_json(registry_path)
    refs = registry_skill_refs(registry)
    by_name: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for path in skill_files(SKILL_ROOTS):
        header = parse_header(path)
        name = str(header["name"])
        if not name or name == "<name>":
            name = path.parent.name
        source = str(path)
        real_source = str(path.resolve())
        role = copy_role(source, real_source)
        declared_category = str(header.get("category", ""))
        category = declared_category or category_for(name, str(header.get("description", "")))
        by_name[name].append(
            {
                "source": source,
                "real_source": real_source,
                "sha256": file_hash(path),
                "copy_role": role,
                "copy_visibility": copy_visibility(role),
                "description": header.get("description", ""),
                "frontmatter": {
                    "description": header.get("description", ""),
                    "category": declared_category,
                    "family": header.get("family", ""),
                    "chains": header.get("chains", []),
                },
                "chains": header.get("chains", []),
                "sop_summary": header.get("sop_summary", []),
                "non_negotiables": header.get("non_negotiables", []),
                "stop_conditions": header.get("stop_conditions", []),
                "category": category,
            }
        )

    usage_by_name = trace_usage(trace_files, by_name.keys())
    doc_refs_by_name = doc_ref_counts(by_name.keys())
    prelim: List[Dict[str, Any]] = []
    for name, copies in sorted(by_name.items()):
        canonical = canonical_copy(copies)
        chain_refs = sorted(set(refs.get(name, []) + canonical.get("chains", [])))
        usage = usage_by_name.get(name, {"invoke_count_30d": 0, "last_used": "", "source": "runtime/ai-trace/*.jsonl heuristic"})
        prelim.append(
            {
                "name": name,
                "copies": copies,
                "canonical": canonical,
                "chain_refs": chain_refs,
                "usage": usage,
                "user_doc_refs": doc_refs_by_name.get(name, 0),
            }
        )
    max_values = {
        "chain_refs": max([len(item["chain_refs"]) for item in prelim] or [1]),
        "invoke_count": max([item["usage"].get("invoke_count_30d", 0) for item in prelim] or [1]),
        "user_doc_refs": max([item["user_doc_refs"] for item in prelim] or [1]),
    }

    skills: List[Dict[str, Any]] = []
    for item in prelim:
        name = item["name"]
        copies = item["copies"]
        canonical = item["canonical"]
        category = canonical["category"]
        chain_refs = item["chain_refs"]
        usage = item["usage"]
        family = family_for(name, category, str(canonical.get("frontmatter", {}).get("family", "")))
        role_summary = role_counts(copies)
        dup_kind = duplicate_kind(name, copies)
        importance = importance_object(
            chain_refs,
            int(usage.get("invoke_count_30d", 0)),
            int(item["user_doc_refs"]),
            category == "gate",
            max_values,
        )
        consolidation = consolidation_for(name, category, family, len(copies), chain_refs, int(usage.get("invoke_count_30d", 0)))
        skill = {
            "id": name,
            "name": name,
            "title": name,
            "category": category,
            "family": family,
            "source": canonical["source"],
            "frontmatter": canonical.get("frontmatter", {}),
            "purpose": purpose(str(canonical.get("description", ""))),
            "effect": effect_for(category),
            "why_independent": why_independent(name, category, chain_refs, copies),
            "sop": {
                "steps_count": len(canonical.get("sop_summary", [])),
                "summary": canonical.get("sop_summary", []),
                "non_negotiables": canonical.get("non_negotiables", []),
                "stop_conditions": canonical.get("stop_conditions", []),
            },
            "sop_summary": canonical.get("sop_summary", []),
            "chains": chain_refs,
            "copies": copies,
            "copy_roles": role_summary,
            "duplicate_kind": dup_kind,
            "intentional_variant": name in INTENTIONAL_VARIANTS,
            "intentional_variant_reason": INTENTIONAL_VARIANTS.get(name, ""),
            "canonical_source": canonical["source"],
            "usage": {
                "invoke_count_30d": usage.get("invoke_count_30d", 0),
                "trace_mentions_recent": usage.get("invoke_count_30d", 0),
                "last_used": usage.get("last_used", ""),
                "source": usage.get("source", "runtime/ai-trace/*.jsonl heuristic"),
            },
            "importance": importance,
            "importance_score": round(float(importance["score"]) * 100),
            "merge_group": family,
            "consolidation": consolidation,
            "optimization": optimization_for(category, len(copies), chain_refs, int(usage.get("invoke_count_30d", 0))),
            "next_optimization": optimization_for(category, len(copies), chain_refs, int(usage.get("invoke_count_30d", 0))),
        }
        skills.append(skill)

    categories = []
    by_category: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for skill in skills:
        by_category[skill["category"]].append(skill)
    for category, items in sorted(by_category.items()):
        categories.append(
            {
                "id": category,
                "count": len(items),
                "top_skills": [item["id"] for item in sorted(items, key=lambda item: item["importance_score"], reverse=True)[:6]],
            }
        )

    duplicates = [
        {
            "id": skill["id"],
            "copies": len(skill["copies"]),
            "canonical_source": skill["canonical_source"],
            "duplicate_kind": skill["duplicate_kind"],
            "copy_roles": skill["copy_roles"],
        }
        for skill in skills
        if len(skill["copies"]) > 1
    ]
    duplicates.sort(key=lambda item: (-item["copies"], item["id"]))
    duplicate_kinds: Dict[str, int] = Counter(str(item["duplicate_kind"]) for item in duplicates)
    copy_roles: Dict[str, int] = Counter()
    for item in duplicates:
        for role, count in item.get("copy_roles", {}).items():
            copy_roles[str(role)] += int(count)
    active_drift_risk_names = sorted(item["id"] for item in duplicates if item["duplicate_kind"] == "active-drift-risk")
    intentional_variant_names = sorted(item["id"] for item in duplicates if item["duplicate_kind"] == "intentional-variant")
    archive_noise_names = sorted(item["id"] for item in duplicates if item["duplicate_kind"] == "archive-noise")
    alias_or_system_noise_names = sorted(item["id"] for item in duplicates if item["duplicate_kind"] == "alias-or-system-noise")

    return {
        "generated_at": utc_now(),
        "version": 1,
        "sources": {
            "registry": str(registry_path),
            "skill_roots": [str(path) for path in SKILL_ROOTS],
            "trace_files": [str(path) for path in trace_files],
        },
        "summary": {
            "skill_files": sum(len(skill["copies"]) for skill in skills),
            "unique_skills": len(skills),
            "duplicate_skill_names": len(duplicates),
            "active_drift_risk_names": sum(1 for item in duplicates if item["duplicate_kind"] == "active-drift-risk"),
            "intentional_variant_names": sum(1 for item in duplicates if item["duplicate_kind"] == "intentional-variant"),
            "archive_noise_names": sum(1 for item in duplicates if item["duplicate_kind"] == "archive-noise"),
            "alias_or_system_noise_names": sum(1 for item in duplicates if item["duplicate_kind"] == "alias-or-system-noise"),
            "vendor_noise_names": sum(1 for item in duplicates if item["duplicate_kind"] == "vendor-noise"),
            "categories": len(categories),
        },
        "duplicate_metadata": {
            "duplicate_kinds": dict(sorted(duplicate_kinds.items())),
            "copy_roles": dict(sorted(copy_roles.items())),
            "active_drift_risk_names": active_drift_risk_names,
            "intentional_variant_names": intentional_variant_names,
            "archive_noise_names": archive_noise_names,
            "alias_or_system_noise_names": alias_or_system_noise_names,
        },
        "gate": {
            "active_drift_risk_clear": len(active_drift_risk_names) == 0,
            "active_drift_risk_count": len(active_drift_risk_names),
        },
        "categories": categories,
        "duplicates": duplicates,
        "skills": sorted(skills, key=lambda item: (-item["importance_score"], item["id"])),
    }


def write_outputs(payload: Dict[str, Any], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "skills.json"
    js_path = out_dir / "skills.js"
    json_path.write_text(json.dumps(payload, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    js_path.write_text(
        "window.__SKILL_LIBRARY_DATA__ = "
        + json.dumps(payload, ensure_ascii=True, indent=2)
        + ";\n",
        encoding="utf-8",
    )
    print(f"wrote {json_path}")
    print(f"wrote {js_path}")
    print("summary=" + json.dumps(payload["summary"], sort_keys=True))


def print_explain(payload: Dict[str, Any], skill_id: str) -> int:
    for skill in payload["skills"]:
        if skill["id"] == skill_id:
            print(json.dumps(skill, ensure_ascii=False, indent=2))
            return 0
    print(f"skill not found: {skill_id}")
    return 1


def print_duplicates(payload: Dict[str, Any]) -> int:
    print(json.dumps(payload["duplicates"], ensure_ascii=False, indent=2))
    return 0


def print_category(payload: Dict[str, Any], category: str) -> int:
    skills = [skill for skill in payload["skills"] if skill["category"] == category]
    print(json.dumps(skills, ensure_ascii=False, indent=2))
    return 0


def print_list(payload: Dict[str, Any], sort_key: str, top: int) -> int:
    key = "importance_score" if sort_key == "importance" else sort_key
    skills = sorted(payload["skills"], key=lambda item: item.get(key, 0), reverse=True)
    rows = [
        {
            "id": skill["id"],
            "category": skill["category"],
            "family": skill["family"],
            "importance": skill["importance"]["score"],
            "invoke_count_30d": skill["usage"]["invoke_count_30d"],
            "chain_refs": len(skill["chains"]),
            "duplicate_kind": skill.get("duplicate_kind", ""),
            "copy_roles": skill.get("copy_roles", {}),
            "consolidation": skill["consolidation"]["verdict"],
        }
        for skill in skills[:top]
    ]
    print(json.dumps(rows, ensure_ascii=False, indent=2))
    return 0


def print_consolidate_suggest(payload: Dict[str, Any], threshold: float) -> int:
    suggestions = []
    for skill in payload["skills"]:
        consolidation = skill.get("consolidation", {})
        if consolidation.get("verdict") in {"merge_candidate", "retire_candidate", "split_candidate"}:
            score = 1.0 if len(skill.get("copies", [])) > 1 else 0.6
            if score >= threshold:
                suggestions.append(
                    {
                        "id": skill["id"],
                        "category": skill["category"],
                        "family": skill["family"],
                        "verdict": consolidation.get("verdict"),
                        "merge_with": consolidation.get("merge_with", []),
                        "confidence": score,
                        "rationale": consolidation.get("rationale", ""),
                    }
                )
    suggestions.sort(key=lambda item: (-item["confidence"], item["family"], item["id"]))
    print(json.dumps(suggestions, ensure_ascii=False, indent=2))
    return 0


def file_hash(path: Path) -> str:
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except Exception:
        return ""


def root_inventory(root: Path) -> Dict[str, str]:
    result: Dict[str, str] = {}
    if not root.exists():
        return result
    for path in root.rglob("SKILL.md"):
        try:
            rel = str(path.relative_to(root.parent if root.name == "skills" else root))
        except Exception:
            rel = str(path)
        result[rel] = file_hash(path)
    return result


def print_dedupe_roots() -> int:
    pairs = [
        (
            Path("/Users/yumei/.codex/skills"),
            Path("/Users/yumei/vibecoding/.codex/skills"),
        ),
        (
            Path("/Users/yumei/.claude/skills"),
            Path("/Users/yumei/.agents/skills"),
        ),
    ]
    reports = []
    for left, right in pairs:
        left_inv = root_inventory(left)
        right_inv = root_inventory(right)
        common = sorted(set(left_inv) & set(right_inv))
        reports.append(
            {
                "left": str(left),
                "right": str(right),
                "left_count": len(left_inv),
                "right_count": len(right_inv),
                "common": len(common),
                "identical": sum(1 for key in common if left_inv[key] == right_inv[key]),
                "drifted": [key for key in common if left_inv[key] != right_inv[key]][:50],
                "only_left": sorted(set(left_inv) - set(right_inv))[:50],
                "only_right": sorted(set(right_inv) - set(left_inv))[:50],
            }
        )
    print(json.dumps(reports, ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate and query the local Skill Library index")
    parser.add_argument("--out", default=str(DEFAULT_OUT_DIR), help="Output directory for skills.json and skills.js")
    parser.add_argument("--registry", default=str(DEFAULT_REGISTRY))
    parser.add_argument("--trace-file", action="append", default=[str(path) for path in DEFAULT_TRACE_FILES])
    parser.add_argument("--once", action="store_true", help="Write skills.json and skills.js")
    parser.add_argument("--explain", help="Print one skill entry as JSON")
    parser.add_argument("--inspect", help="Alias for --explain")
    parser.add_argument("--duplicates", action="store_true", help="Print duplicate skill groups")
    parser.add_argument("--category", help="Print skills in a category")
    parser.add_argument("--list", action="store_true", help="List skills")
    parser.add_argument("--sort", default="importance", choices=["importance", "id"])
    parser.add_argument("--top", type=int, default=20)
    parser.add_argument("--consolidate-suggest", action="store_true")
    parser.add_argument("--threshold", type=float, default=0.7)
    parser.add_argument("--dedupe-roots", action="store_true")
    args = parser.parse_args()

    if args.dedupe_roots:
        return print_dedupe_roots()
    payload = build_library(Path(args.registry), [Path(path) for path in args.trace_file])
    if args.explain or args.inspect:
        return print_explain(payload, args.explain or args.inspect)
    if args.duplicates:
        return print_duplicates(payload)
    if args.category:
        return print_category(payload, args.category)
    if args.list:
        return print_list(payload, args.sort, args.top)
    if args.consolidate_suggest:
        return print_consolidate_suggest(payload, args.threshold)
    if args.once or not (args.explain or args.inspect or args.duplicates or args.category or args.list or args.consolidate_suggest):
        write_outputs(payload, Path(args.out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
