#!/usr/bin/env python3
"""Generate static dashboard data for skill-chain registry, state, and trace ledgers."""

from __future__ import annotations

import argparse
import json
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from _skill_chain_common import classify, load_json


ROOT = Path("/Users/yumei/tools/automation")
DEFAULT_REGISTRY = ROOT / "workspace-guides/skill-chains/registry.json"
DEFAULT_CAPABILITIES = ROOT / "workspace-guides/skill-chains/assistant-capabilities.json"
DEFAULT_SCHEMA = ROOT / "workspace-guides/skill-chains/state-schema.json"
DEFAULT_STATE_DIR = ROOT / "runtime/skill-chains/state"
DEFAULT_TRACE_FILES = (
    ROOT / "runtime/ai-trace/session-ledger.jsonl",
    ROOT / "runtime/ai-trace/issue-ledger.jsonl",
)
DEFAULT_OUT_DIR = ROOT / "runtime/skill-chains/dashboard"
DEFAULT_SKILL_LIBRARY = DEFAULT_OUT_DIR / "skills.json"
DEFAULT_MODEL_ROUTER_STATE = ROOT / "runtime/ai-model-router/state.json"
CLAUDE_SKILL_ROOTS = (Path("/Users/yumei/.claude/skills"),)
CODEX_SKILL_ROOTS = (
    Path("/Users/yumei/.codex/skills"),
    Path("/Users/yumei/vibecoding/.codex/skills"),
    Path("/Users/yumei/vibecoding/.codex/plugins/cache"),
    Path("/Users/yumei/.agents/skills"),
)
SHARED_SKILL_ROOTS = (Path("/Users/yumei/.agents/skills"),)
OPENCODE_SKILL_ROOTS = (
    Path("/Users/yumei/.agents/skills"),
    Path("/Users/yumei/.config/opencode/skills"),
)
CODEX_POLICY = Path("/Users/yumei/.codex/memories/UNIVERSAL_AI_DEV_POLICY.md")
TAIL_LINES = 50
TAIL_BYTES = 131072


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def read_json(path: Path) -> Dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def tail_jsonl(path: Path, limit: int = TAIL_LINES) -> List[Dict[str, Any]]:
    if not path.exists():
        return []

    size = path.stat().st_size
    with path.open("rb") as handle:
        handle.seek(max(size - TAIL_BYTES, 0))
        if size > TAIL_BYTES:
            handle.readline()
        chunk = handle.read()

    rows: List[Dict[str, Any]] = []
    for raw_line in chunk.decode("utf-8", errors="replace").splitlines()[-limit:]:
        if not raw_line.strip():
            continue
        try:
            item = json.loads(raw_line)
        except json.JSONDecodeError:
            continue
        if isinstance(item, dict):
            rows.append(item)
    return rows


def state_enum(schema: Dict[str, Any]) -> List[str]:
    state = schema.get("properties", {}).get("state", {})
    values = state.get("enum")
    return list(values) if isinstance(values, list) else []


def registry_chains(registry: Dict[str, Any]) -> List[Dict[str, Any]]:
    chains = registry.get("chains", {})
    if not isinstance(chains, dict):
        return []

    result: List[Dict[str, Any]] = []
    for name, chain in chains.items():
        if not isinstance(chain, dict):
            result.append(
                {
                    "name": str(name),
                    "purpose": "",
                    "steps": [],
                    "required_gates": [],
                    "forbidden_actions": [],
                    "raw": chain,
                }
            )
            continue

        item = dict(chain)
        item["name"] = str(name)
        item["purpose"] = chain.get("purpose", "")
        item["steps"] = chain.get("steps", [])
        item["required_gates"] = chain.get("required_gates", [])
        item["forbidden_actions"] = chain.get("forbidden_actions", [])
        result.append(item)
    return result


def chain_skill_names(chain: Dict[str, Any]) -> List[str]:
    names: List[str] = []
    for step in chain.get("steps", []):
        if isinstance(step, str):
            names.append(step)
        elif isinstance(step, dict):
            for key in ("skill", "stage", "action", "command"):
                value = step.get(key)
                if isinstance(value, str) and value:
                    names.append(value)
                    break
            values = step.get("skills")
            if isinstance(values, list):
                names.extend(str(value) for value in values if value)
    return sorted(set(names))


def parse_skill_header(skill_file: Path) -> Dict[str, str]:
    name = skill_file.parent.name
    description = ""
    try:
        for line in skill_file.read_text(encoding="utf-8", errors="replace").splitlines()[:40]:
            stripped = line.strip()
            if stripped.startswith("name:"):
                name = stripped.split(":", 1)[1].strip().strip("\"'")
            elif stripped.startswith("description:"):
                description = stripped.split(":", 1)[1].strip().strip("\"'")
            if stripped == "---" and description:
                break
    except Exception:
        pass
    return {"name": name, "description": description, "source": str(skill_file)}


def discover_skills(roots: Iterable[Path]) -> List[Dict[str, str]]:
    skills: Dict[str, Dict[str, str]] = {}
    for root in roots:
        if not root.exists():
            continue
        for skill_file in root.rglob("SKILL.md"):
            skill = parse_skill_header(skill_file)
            name = skill.get("name")
            if name and name not in skills:
                skills[name] = skill
    return sorted(skills.values(), key=lambda item: item["name"])


def has_codex_goal_support() -> bool:
    if not CODEX_POLICY.exists():
        return False
    try:
        text = CODEX_POLICY.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return False
    return "Codex" in text and ("gate" in text.lower() or "review_push_guard" in text)


def support_matrix(chains: List[Dict[str, Any]], supported_names: set[str]) -> List[Dict[str, Any]]:
    matrix = []
    for chain in chains:
        required = chain_skill_names(chain)
        matched = [name for name in required if name in supported_names]
        matrix.append(
            {
                "chain": chain["name"],
                "required": required,
                "matched": matched,
                "missing": [name for name in required if name not in supported_names],
                "coverage": round(len(matched) / len(required), 2) if required else 0,
            }
        )
    return matrix


def skill_library_snapshot(path: Path) -> Dict[str, Any]:
    data = read_json(path)
    summary = data.get("summary", {})
    duplicates = data.get("duplicates", [])
    if not isinstance(summary, dict):
        summary = {}
    if not isinstance(duplicates, list):
        duplicates = []

    duplicate_kinds: Dict[str, int] = defaultdict(int)
    copy_roles: Dict[str, int] = defaultdict(int)
    active_drift_risk_names: List[str] = []
    intentional_variant_names: List[str] = []
    archive_noise_names: List[str] = []
    alias_or_system_noise_names: List[str] = []

    for item in duplicates:
        if not isinstance(item, dict):
            continue
        name = str(item.get("id") or "")
        kind = str(item.get("duplicate_kind") or "unknown")
        duplicate_kinds[kind] += 1
        if kind == "active-drift-risk" and name:
            active_drift_risk_names.append(name)
        elif kind == "intentional-variant" and name:
            intentional_variant_names.append(name)
        elif kind == "archive-noise" and name:
            archive_noise_names.append(name)
        elif kind == "alias-or-system-noise" and name:
            alias_or_system_noise_names.append(name)

        roles = item.get("copy_roles", {})
        if isinstance(roles, dict):
            for role, count in roles.items():
                try:
                    copy_roles[str(role)] += int(count)
                except Exception:
                    continue

    active_count = int(summary.get("active_drift_risk_names", len(active_drift_risk_names)) or 0)
    return {
        "source": str(path),
        "missing": not path.exists(),
        "summary": {
            "skill_files": int(summary.get("skill_files", 0) or 0),
            "unique_skills": int(summary.get("unique_skills", 0) or 0),
            "duplicate_skill_names": int(summary.get("duplicate_skill_names", len(duplicates)) or 0),
            "active_drift_risk_names": active_count,
            "intentional_variant_names": int(summary.get("intentional_variant_names", len(intentional_variant_names)) or 0),
            "archive_noise_names": int(summary.get("archive_noise_names", len(archive_noise_names)) or 0),
            "alias_or_system_noise_names": int(summary.get("alias_or_system_noise_names", len(alias_or_system_noise_names)) or 0),
            "vendor_noise_names": int(summary.get("vendor_noise_names", 0) or 0),
        },
        "duplicate_metadata": {
            "duplicate_kinds": dict(sorted(duplicate_kinds.items())),
            "copy_roles": dict(sorted(copy_roles.items())),
            "active_drift_risk_names": sorted(active_drift_risk_names),
            "intentional_variant_names": sorted(intentional_variant_names),
            "archive_noise_names": sorted(archive_noise_names),
            "alias_or_system_noise_names": sorted(alias_or_system_noise_names),
        },
        "gate": {
            "active_drift_risk_clear": active_count == 0,
            "active_drift_risk_count": active_count,
        },
    }


def int_value(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def model_router_snapshot(path: Path, now: Optional[int] = None) -> Dict[str, Any]:
    data = read_json(path)
    now = now or int(time.time())
    models = data.get("models", {})
    if not isinstance(models, dict):
        models = {}

    rows: List[Dict[str, Any]] = []
    summary = {
        "models": 0,
        "ready": 0,
        "cooldown": 0,
        "fatal": 0,
        "last_success": 0,
    }
    for model, entry in models.items():
        if not isinstance(entry, dict):
            entry = {}
        cooldown_until = int_value(entry.get("cooldown_until"))
        fatal = bool(entry.get("fatal"))
        last_success = int_value(entry.get("last_success"))
        if fatal:
            status = "fatal"
        elif cooldown_until > now:
            status = "cooldown"
        else:
            status = "ready"
        summary["models"] += 1
        summary[status] += 1
        if last_success:
            summary["last_success"] += 1
        rows.append(
            {
                "model": str(model),
                "status": status,
                "failure_count": int_value(entry.get("failure_count")),
                "cooldown_until": cooldown_until,
                "last_seen": int_value(entry.get("last_seen")),
                "last_success": last_success,
                "last_failure": int_value(entry.get("last_failure")),
                "last_failure_reason": str(entry.get("last_failure_reason") or ""),
            }
        )

    status_order = {"cooldown": 0, "fatal": 1, "ready": 2}
    rows.sort(key=lambda item: (status_order.get(item["status"], 9), item["model"]))
    return {
        "source": str(path),
        "missing": not path.exists(),
        "summary": summary,
        "models": rows,
        "gate": {
            "fatal_clear": summary["fatal"] == 0,
            "cooldown_clear": summary["cooldown"] == 0,
        },
    }


def split_roles(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(item) for item in value if item]
    if isinstance(value, str):
        return [item.strip() for item in value.split("|") if item.strip()]
    return []


def capability_support_matrix(chains: List[Dict[str, Any]], assistant: Dict[str, Any]) -> List[Dict[str, Any]]:
    declared = assistant.get("chains", {})
    if not isinstance(declared, dict):
        declared = {}
    matrix: List[Dict[str, Any]] = []
    for chain in chains:
        chain_name = chain["name"]
        entry = declared.get(chain_name, {})
        if not isinstance(entry, dict):
            entry = {}
        ok = bool(entry.get("ok", False))
        role = entry.get("role", "")
        missing = [] if ok else [str(entry.get("reason") or "not_declared")]
        matrix.append(
            {
                "chain": chain_name,
                "required": chain_skill_names(chain),
                "matched": split_roles(role) if ok else [],
                "missing": missing,
                "coverage": 1 if ok else 0,
                "declared_role": role,
                "ok": ok,
                "reason": str(entry.get("reason") or assistant.get("rationale") or ""),
            }
        )
    return matrix


def skill_sets() -> Dict[str, List[Dict[str, str]]]:
    claude_skills = discover_skills(CLAUDE_SKILL_ROOTS)
    codex_skills = discover_skills(CODEX_SKILL_ROOTS)
    shared_skills = discover_skills(SHARED_SKILL_ROOTS)
    opencode_skills = discover_skills(OPENCODE_SKILL_ROOTS)
    if has_codex_goal_support() and not any(skill["name"] == "/goal" for skill in codex_skills):
        codex_skills = [
            {
                "name": "/goal",
                "description": "Codex CLI bounded goal packet execution with local gate compatibility",
                "source": str(CODEX_POLICY),
            }
        ] + codex_skills
    return {
        "claude-code": sorted(claude_skills + shared_skills, key=lambda item: item["name"]),
        "codex-cli": codex_skills,
        "opencode": opencode_skills,
        "copilot": [],
    }


def fallback_assistant_profiles(chains: List[Dict[str, Any]], skills_by_id: Dict[str, List[Dict[str, str]]]) -> List[Dict[str, Any]]:
    claude_skills = skills_by_id.get("claude-code", [])
    codex_skills = skills_by_id.get("codex-cli", [])
    opencode_skills = skills_by_id.get("opencode", [])
    shared_skills = discover_skills(SHARED_SKILL_ROOTS)
    claude_names = {item["name"] for item in claude_skills} | {item["name"] for item in shared_skills}
    codex_names = {item["name"] for item in codex_skills}
    opencode_names = {item["name"] for item in opencode_skills}

    assistants = [
        {
            "name": "Claude Code",
            "id": "claude-code",
            "role": "parent controller / router / reviewer",
            "chain_roles": ["parent_controller", "router", "reviewer"],
            "supports": ["plan-first", "grouped-commit", "release-readiness"],
            "open_hint": "read dashboard/data.json assistants[] or open index.html",
            "skills": sorted(claude_skills + shared_skills, key=lambda item: item["name"]),
            "supported_names": claude_names,
            "supports_skill_chain": True,
        },
        {
            "name": "Codex CLI",
            "id": "codex-cli",
            "role": "executor / local gates / browser QA",
            "chain_roles": ["executor", "validator"],
            "supports": ["feature-pr", "refactor-pr", "dirty-tree-slice", "grouped-commit-cycle"],
            "open_hint": "open /Users/yumei/tools/automation/runtime/skill-chains/dashboard/index.html",
            "skills": codex_skills,
            "supported_names": codex_names,
            "supports_skill_chain": True,
        },
        {
            "name": "OpenCode",
            "id": "opencode",
            "role": "low-cost executor branch / partial skill-chain support",
            "chain_roles": ["executor_branch"],
            "supports": ["harness-bootstrap", "dirty-tree-slice", "feature-pr"],
            "open_hint": "read registry.json, state/*.json, and dashboard/data.json",
            "skills": opencode_skills,
            "supported_names": opencode_names,
            "supports_skill_chain": True,
        },
        {
            "name": "Copilot",
            "id": "copilot",
            "role": "IDE completion / small scoped edits",
            "chain_roles": ["completion_assistant"],
            "supports": [],
            "open_hint": "open index.html in a browser; follow dashboard-selected goal packets",
            "skills": [],
            "supported_names": set(),
            "supports_skill_chain": False,
        },
    ]

    result: List[Dict[str, Any]] = []
    for assistant in assistants:
        supported_names = assistant.pop("supported_names")
        matrix = support_matrix(chains, supported_names)
        assistant["support_matrix"] = matrix
        assistant["support"] = matrix
        result.append(assistant)
    return result


def assistant_profiles(chains: List[Dict[str, Any]], capabilities: Dict[str, Any]) -> List[Dict[str, Any]]:
    skills_by_id = skill_sets()
    assistants_declared = capabilities.get("assistants", {}) if isinstance(capabilities, dict) else {}
    if not assistants_declared:
        return fallback_assistant_profiles(chains, skills_by_id)

    result: List[Dict[str, Any]] = []
    for assistant_id, declared in assistants_declared.items():
        if not isinstance(declared, dict):
            continue
        skills = skills_by_id.get(str(assistant_id), [])
        assistant = {
            "id": str(assistant_id),
            "name": str(declared.get("display_name") or assistant_id),
            "role": str(declared.get("rationale") or ""),
            "chain_roles": declared.get("chain_roles", []),
            "supports": [
                chain_name
                for chain_name, item in (declared.get("chains", {}) or {}).items()
                if isinstance(item, dict) and item.get("ok")
            ],
            "open_hint": "",
            "skills": skills,
            "supports_skill_chain": bool(declared.get("supports_skill_chain", False)),
            "fallbacks": declared.get("fallbacks", []),
            "forbidden": declared.get("forbidden", []),
            "rationale": str(declared.get("rationale") or ""),
            "capability_source": str(DEFAULT_CAPABILITIES),
        }
        matrix = capability_support_matrix(chains, declared)
        assistant["support_matrix"] = matrix
        assistant["support"] = matrix
        result.append(assistant)
    return result


def current_gate(state: Dict[str, Any]) -> str:
    gates = state.get("gates")
    if isinstance(gates, dict):
        for key in ("current", "active", "gate", "last"):
            value = gates.get(key)
            if value:
                return str(value)
        after = gates.get("after")
        if isinstance(after, list) and after:
            return str(after[-1])
        before = gates.get("before")
        if isinstance(before, list) and before:
            return str(before[-1])
    return str(state.get("gate_type") or "")


def project_from_state(path: Path, state: Dict[str, Any]) -> str:
    identity = state.get("identity", {}) if isinstance(state.get("identity"), dict) else {}
    project = identity.get("project")
    if project:
        return str(project)
    return path.stem.rsplit("_", 1)[0] or "unknown"


def build_projects(state_dir: Path) -> List[Dict[str, Any]]:
    grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for path in sorted(state_dir.glob("*.json")):
        raw = load_json(path)
        classification = classify(path, raw)
        project = project_from_state(path, raw)
        grouped[project].append(
            {
                "file": str(path),
                "chain": str(raw.get("selected_chain") or ""),
                "state": str(raw.get("state") or ""),
                "gate": current_gate(raw),
                "classification": classification["classification"],
                "raw": raw,
            }
        )

    return [{"project": project, "states": states} for project, states in sorted(grouped.items())]


def infer_project(scope: str) -> str:
    if not scope:
        return ""
    return scope.replace(":", "/").split("/", 1)[0]


def infer_chain(record: Dict[str, Any], chain_names: Iterable[str]) -> str:
    for key in ("chain", "selected_chain"):
        value = record.get(key)
        if value:
            return str(value)
    haystack = " ".join(str(record.get(key, "")) for key in ("scope", "summary", "symptom", "linked_issue"))
    for name in chain_names:
        if name in haystack:
            return name
    return ""


def normalize_trace(kind: str, record: Dict[str, Any], chain_names: Iterable[str]) -> Dict[str, str]:
    scope = str(record.get("scope") or "")
    trace_kind = str(record.get("kind") or kind)
    msg = record.get("summary") if kind == "session" or trace_kind == "goal_status" else record.get("symptom")
    return {
        "ts": str(record.get("timestamp") or record.get("ts") or ""),
        "kind": trace_kind,
        "project": str(record.get("project") or infer_project(scope)),
        "chain": infer_chain(record, chain_names),
        "msg": str(msg or record.get("message") or ""),
        "goal_run_id": str(record.get("goal_run_id") or ""),
        "goal_packet_id": str(record.get("goal_packet_id") or ""),
        "status": str(record.get("status") or ""),
        "agent": str(record.get("agent") or ""),
    }


def build_traces(trace_files: Iterable[Path], chain_names: Iterable[str]) -> List[Dict[str, str]]:
    traces: List[Dict[str, str]] = []
    for path in trace_files:
        kind = path.name.split("-", 1)[0]
        for record in tail_jsonl(path):
            traces.append(normalize_trace(kind, record, chain_names))
    traces.sort(key=lambda item: item.get("ts", ""))
    return traces


def build_goal_runs(traces: List[Dict[str, str]]) -> List[Dict[str, str]]:
    grouped: Dict[str, List[Dict[str, str]]] = defaultdict(list)
    for trace in traces:
        if trace.get("kind") != "goal_status":
            continue
        run_id = trace.get("goal_run_id") or trace.get("goal_packet_id")
        if not run_id:
            continue
        grouped[run_id].append(trace)

    runs: List[Dict[str, str]] = []
    for run_id, items in grouped.items():
        items.sort(key=lambda item: item.get("ts", ""))
        latest = items[-1]
        runs.append(
            {
                "goal_run_id": run_id,
                "goal_packet_id": latest.get("goal_packet_id", ""),
                "project": latest.get("project", ""),
                "chain": latest.get("chain", ""),
                "status": latest.get("status", ""),
                "agent": latest.get("agent", ""),
                "summary": latest.get("msg", ""),
                "started_at": items[0].get("ts", ""),
                "updated_at": latest.get("ts", ""),
                "events": str(len(items)),
            }
        )
    runs.sort(key=lambda item: item.get("updated_at", ""))
    return runs


def capability_registry(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {
            "version": 0,
            "source": str(path),
            "missing": True,
            "warnings": ["assistant-capabilities.json not found; falling back to local skill scans"],
            "assistants": {},
        }
    data = read_json(path)
    data["source"] = str(path)
    data["missing"] = False
    data.setdefault("warnings", [])
    return data


def build_payload(
    registry_path: Path,
    schema_path: Path,
    state_dir: Path,
    trace_files: Iterable[Path],
    capability_path: Path,
    skill_library_path: Path,
    model_router_state_path: Path,
) -> Dict[str, Any]:
    registry = read_json(registry_path)
    schema = read_json(schema_path)
    chains = registry_chains(registry)
    capabilities = capability_registry(capability_path)
    traces = build_traces(trace_files, [chain["name"] for chain in chains])
    return {
        "generated_at": utc_now(),
        "registry_version": registry.get("version", 0),
        "state_enum": state_enum(schema),
        "chains": chains,
        "projects": build_projects(state_dir),
        "traces": traces,
        "goal_runs": build_goal_runs(traces),
        "assistants": assistant_profiles(chains, capabilities),
        "skill_library": skill_library_snapshot(skill_library_path),
        "model_router": model_router_snapshot(model_router_state_path),
        "capability_registry": {
            "version": capabilities.get("version", 0),
            "updated_at": capabilities.get("updated_at", ""),
            "source": capabilities.get("source", str(capability_path)),
            "missing": bool(capabilities.get("missing", False)),
            "warnings": capabilities.get("warnings", []),
        },
        "daily_entry": {
            "title": "Daily AI collaboration entry",
            "url": "file:///Users/yumei/tools/automation/runtime/skill-chains/dashboard/index.html",
            "http_url": "http://127.0.0.1:8765/index.html",
            "refresh_command": "python3 /Users/yumei/tools/automation/scripts/skill-chain-dashboard.py --once",
            "server_command": "bash /Users/yumei/tools/automation/scripts/dashboard-server.sh",
            "sources": [
                str(DEFAULT_REGISTRY),
                str(DEFAULT_STATE_DIR),
                "/Users/yumei/tools/automation/runtime/ai-trace/*.jsonl",
                str(CODEX_POLICY),
                str(DEFAULT_CAPABILITIES),
                str(DEFAULT_SKILL_LIBRARY),
                str(DEFAULT_MODEL_ROUTER_STATE),
            ],
        },
    }


def write_once(args: argparse.Namespace) -> Path:
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    data_path = out_dir / "data.json"
    payload = build_payload(
        Path(args.registry),
        Path(args.schema),
        Path(args.state_dir),
        [Path(path) for path in args.trace_file],
        Path(args.capabilities),
        Path(args.skill_library),
        Path(args.model_router_state),
    )
    data_path.write_text(json.dumps(payload, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    data_js_path = out_dir / "data.js"
    data_js_path.write_text(
        "window.__SKILL_CHAIN_DATA__ = "
        + json.dumps(payload, ensure_ascii=True, indent=2)
        + ";\n",
        encoding="utf-8",
    )
    print(f"wrote {data_path}")
    print(f"wrote {data_js_path}")
    print(
        "summary="
        + json.dumps(
            {
                "projects": len(payload["projects"]),
                "chains": len(payload["chains"]),
                "traces": len(payload["traces"]),
                "assistants": len(payload["assistants"]),
                "active_drift_risk_names": payload["skill_library"]["summary"]["active_drift_risk_names"],
            },
            ensure_ascii=True,
            sort_keys=True,
        )
    )
    return data_path


def file_signature(paths: Iterable[Path]) -> List[tuple[str, int, int]]:
    signature: List[tuple[str, int, int]] = []
    for path in sorted(paths):
        if not path.exists():
            signature.append((str(path), -1, -1))
            continue
        if path.is_dir():
            for child in sorted(path.glob("*.json")):
                stat = child.stat()
                signature.append((str(child), stat.st_mtime_ns, stat.st_size))
            continue
        stat = path.stat()
        signature.append((str(path), stat.st_mtime_ns, stat.st_size))
    return signature


def input_signature(args: argparse.Namespace) -> List[tuple[str, int, int]]:
    paths: List[Path] = [
        Path(args.registry),
        Path(args.schema),
        Path(args.capabilities),
        Path(args.state_dir),
        Path(args.model_router_state),
    ]
    paths.extend(Path(path) for path in args.trace_file)
    return file_signature(paths)


def watch(args: argparse.Namespace) -> int:
    previous: Optional[List[tuple[str, int, int]]] = None
    last_write = 0.0
    heartbeat_seconds = max(30, int(args.heartbeat_seconds))
    while True:
        now = time.monotonic()
        current = input_signature(args)
        if current != previous or now - last_write >= heartbeat_seconds:
            write_once(args)
            previous = current
            last_write = now
        time.sleep(2)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate skill-chain dashboard data.json")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--once", action="store_true", help="Generate data.json once and exit")
    mode.add_argument("--watch", action="store_true", help="Poll dashboard inputs and regenerate on change")
    parser.add_argument("--heartbeat-seconds", type=int, default=600, help="Regenerate at least this often in --watch mode")
    parser.add_argument("--out", default=str(DEFAULT_OUT_DIR), help="Output directory for data.json")
    parser.add_argument("--registry", default=str(DEFAULT_REGISTRY))
    parser.add_argument("--schema", default=str(DEFAULT_SCHEMA))
    parser.add_argument("--capabilities", default=str(DEFAULT_CAPABILITIES))
    parser.add_argument("--skill-library", default=str(DEFAULT_SKILL_LIBRARY))
    parser.add_argument("--model-router-state", default=str(DEFAULT_MODEL_ROUTER_STATE))
    parser.add_argument("--state-dir", default=str(DEFAULT_STATE_DIR))
    parser.add_argument("--trace-file", action="append", default=[str(path) for path in DEFAULT_TRACE_FILES])
    args = parser.parse_args()

    if args.watch:
        return watch(args)
    write_once(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
