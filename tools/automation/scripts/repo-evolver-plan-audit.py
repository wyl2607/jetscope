#!/usr/bin/env python3
"""Audit repo-evolver plan promises against local read-only evidence."""

from __future__ import annotations

import argparse
import json
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Sequence


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PLAN = ROOT / "plan.md"
DEFAULT_MANIFEST = ROOT / "runtime/task-board/source-runtime-manifest.json"
DEFAULT_MIRROR = ROOT / "runtime/self-evolution/mirror-drift-scan.json"
DEFAULT_REGISTRY = ROOT / "workspace-guides/evolution-registry.json"
DEFAULT_RESTORE = ROOT / "runtime/self-evolution/restore-rehearsal-policy.json"
DEFAULT_CONTROL = ROOT / "runtime/self-evolution/daily-evolution-control.json"
DEFAULT_JSON = ROOT / "runtime/self-evolution/repo-evolver-plan-audit.json"
DEFAULT_MD = ROOT / "runtime/self-evolution/repo-evolver-plan-audit.md"


Status = str
NON_BLOCKING_STATUSES = {"pass", "deferred", "approval_required", "informational"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}
    return data if isinstance(data, dict) else {}


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def parse_frontmatter(text: str) -> dict[str, Any]:
    if not text.startswith("---\n"):
        return {}
    end = text.find("\n---", 4)
    if end == -1:
        return {}
    data: dict[str, Any] = {}
    current_key = ""
    for raw_line in text[4:end].splitlines():
        line = raw_line.rstrip()
        if not line or line.lstrip().startswith("#"):
            continue
        if line.startswith("  - ") and current_key:
            value = line[4:].strip()
            existing = data.setdefault(current_key, [])
            if isinstance(existing, list):
                existing.append(value)
            continue
        if ":" not in line:
            continue
        key, raw_value = line.split(":", 1)
        key = key.strip()
        value = raw_value.strip()
        current_key = key
        if not value:
            data[key] = []
        elif value.lower() == "true":
            data[key] = True
        elif value.lower() == "false":
            data[key] = False
        else:
            data[key] = value.strip('"').strip("'")
    return data


def latest_daily_report(root: Path = ROOT) -> Path:
    candidates = sorted((root / "runtime/self-evolution").glob("daily-evolution-20*.json"))
    candidates = [
        item
        for item in candidates
        if not item.name.endswith("-task-packets.json")
        and "control" not in item.name
        and "audit" not in item.name
    ]
    return candidates[-1] if candidates else root / "runtime/self-evolution/daily-evolution-unknown.json"


def latest_task_packets(root: Path = ROOT) -> Path:
    candidates = sorted((root / "runtime/self-evolution").glob("daily-evolution-20*-task-packets.json"))
    return candidates[-1] if candidates else root / "runtime/self-evolution/daily-evolution-task-packets.json"


def ensure_runtime_output(path: Path) -> Path:
    resolved = path.expanduser().resolve()
    runtime = (ROOT / "runtime").resolve()
    if resolved != runtime and runtime not in resolved.parents:
        raise SystemExit(f"refusing to write outside runtime: {resolved}")
    return resolved


def nested(data: dict[str, Any], *keys: str, default: Any = None) -> Any:
    current: Any = data
    for key in keys:
        if not isinstance(current, dict):
            return default
        current = current.get(key)
    return current if current is not None else default


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def lower(text: str) -> str:
    return text.lower()


def contains_all(text: str, needles: Iterable[str]) -> bool:
    haystack = lower(text)
    return all(needle.lower() in haystack for needle in needles)


def count_phase_headings(plan_text: str) -> int:
    return len(re.findall(r"^###\s+Phase\s+[0-5]\b", plan_text, flags=re.MULTILINE))


def entry_paths(manifest: dict[str, Any]) -> list[str]:
    paths: list[str] = []
    for key in ("entries", "source_candidates", "excluded_by_default", "high_risk", "unclassified"):
        for item in as_list(manifest.get(key)):
            if isinstance(item, dict) and isinstance(item.get("path"), str):
                paths.append(item["path"])
    return paths


def queue_items(daily_report: dict[str, Any]) -> list[Any]:
    return as_list(daily_report.get("queue"))


def task_packets(task_packet_report: dict[str, Any]) -> list[Any]:
    return as_list(task_packet_report.get("task_packets"))


def mirror_findings(mirror: dict[str, Any]) -> list[dict[str, Any]]:
    return [item for item in as_list(mirror.get("findings")) if isinstance(item, dict)]


def proposed_mirror_findings(mirror: dict[str, Any], registry: dict[str, Any]) -> list[dict[str, Any]]:
    raw_findings = [
        item
        for item in mirror_findings(mirror)
        if item.get("kind") == "proposed-mirror-target-missing"
        or item.get("status") == "proposed"
        or item.get("approval_required") is True
    ]
    for pair in as_list(registry.get("mirrorPairs")):
        if isinstance(pair, dict) and pair.get("status") == "proposed":
            raw_findings.append({"kind": "registry-proposed-mirror", "pair_id": pair.get("id"), "mirror": pair.get("mirror")})
    seen: set[str] = set()
    findings: list[dict[str, Any]] = []
    for item in raw_findings:
        key = str(item.get("pair_id") or item.get("id") or item.get("mirror") or item)
        if key in seen:
            continue
        seen.add(key)
        findings.append(item)
    return findings


def phase5_decision_document(ctx: dict[str, Any]) -> dict[str, Any]:
    adr_path = ctx["plan_path"].parent / "docs/decisions/phase5-split-decision.md"
    adr_text = read_text(adr_path)
    frontmatter = parse_frontmatter(adr_text)
    lower_text = lower(adr_text)
    phase5_markers = ("phase 5", "phase-5", "phase5", "adr-phase5")
    registered = any(
        isinstance(item, dict) and item.get("source") == str(adr_path)
        for item in as_list(ctx["registry"].get("documentSurfaces"))
    )
    if not adr_path.exists():
        status = "missing"
    elif frontmatter.get("decision_status") in {"accepted", "drafted"}:
        status = str(frontmatter["decision_status"])
    elif "accepted" in lower_text and any(marker in lower_text for marker in phase5_markers):
        status = "accepted"
    else:
        status = "drafted"
    return {
        "status": status,
        "path": str(adr_path),
        "exists": adr_path.exists(),
        "registered": registered,
        "execution": frontmatter.get("execution_status") or "deferred",
        "split_allowed": frontmatter.get("split_allowed") is True,
        "automatic_split_allowed": frontmatter.get("automatic_split_allowed") is True,
        "approval_required_for": as_list(frontmatter.get("approval_required_for")),
    }


def inventory_categories(manifest: dict[str, Any], registry: dict[str, Any], mirror: dict[str, Any]) -> dict[str, bool]:
    summary = manifest.get("summary") if isinstance(manifest.get("summary"), dict) else {}
    by_classification = summary.get("by_classification") if isinstance(summary.get("by_classification"), dict) else {}
    paths = entry_paths(manifest)
    return {
        "source": int(summary.get("source_candidate_count") or by_classification.get("source") or 0) > 0,
        "runtime": int(summary.get("excluded_by_default_count") or by_classification.get("local-only-runtime") or 0) > 0,
        "generated-evidence": int(by_classification.get("generated-local-artifact") or 0) > 0,
        "handoff-files": any("handoff" in path or "task-packet" in path or "multi-agent" in path for path in paths),
        "high-risk-scripts": int(summary.get("high_risk_count") or 0) > 0 or bool(as_list(manifest.get("high_risk"))),
        "skill-assets": bool(as_list(registry.get("skillRoots"))) or any("/skills/" in path for path in paths),
        "obsidian-mirrors": bool(as_list(registry.get("mirrorPairs"))) or bool(mirror_findings(mirror)),
    }


def status_from_bool(passed: bool, weak: bool = False) -> Status:
    if weak:
        return "weak"
    if passed:
        return "pass"
    return "fail"


def is_gap_status(status: Status) -> bool:
    return status not in NON_BLOCKING_STATUSES


def checklist_projection(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": item["id"],
        "status": item["status"],
        "requirement": item["requirement"],
        "note": item.get("note", ""),
        "evidence_sources": item["evidence_sources"],
    }


def checklist_item(check_id: str, requirement: str, evidence_sources: list[str], status: Status, note: str = "") -> dict[str, Any]:
    return {
        "id": check_id,
        "requirement": requirement,
        "evidence_sources": evidence_sources,
        "status": status,
        "note": note,
    }


def split_readiness(ctx: dict[str, Any]) -> dict[str, Any]:
    manifest = ctx["manifest"]
    mirror = ctx["mirror"]
    registry = ctx["registry"]
    restore = ctx["restore"]
    daily = ctx["daily_report"]
    control = ctx["control"]
    categories = inventory_categories(manifest, registry, mirror)
    missing_categories = sorted(key for key, present in categories.items() if not present)
    unclassified_count = int(nested(manifest, "summary", "unclassified_count", default=0) or 0)
    queue_count = len(queue_items(daily))
    proposed = proposed_mirror_findings(mirror, registry)
    hard_gate_failed_count = int(nested(control, "summary", "hard_gate_failed_count", default=0) or 0)
    restore_ok = restore.get("ok") is True
    reasons: list[str] = []
    if missing_categories:
        reasons.append(f"missing_inventory_categories={','.join(missing_categories)}")
    if unclassified_count:
        reasons.append(f"unclassified_count={unclassified_count}")
    if proposed:
        reasons.append(f"proposed_mirror_count={len(proposed)}")
    if hard_gate_failed_count:
        reasons.append(f"hard_gate_failed_count={hard_gate_failed_count}")
    if not restore_ok:
        reasons.append("restore_ok=false")
    reasons.append("explicit user approval")
    decision_document = phase5_decision_document(ctx)
    execution_decision = "defer" if decision_document.get("execution") == "deferred" or not decision_document.get("split_allowed") else "ready-for-human-review"
    return {
        "decision": execution_decision,
        "execution_decision": execution_decision,
        "phase5_decision": decision_document["status"],
        "decision_document": decision_document,
        "split_allowed": False,
        "reasons": reasons,
        "maintenance_backlog": {
            "open_queue": queue_count,
            "blocking_for_local_closure": False,
        },
        "approval_required": proposed,
        "evidence": {
            "missing_inventory_categories": missing_categories,
            "unclassified_count": unclassified_count,
            "open_queue": queue_count,
            "proposed_mirror_count": len(proposed),
            "hard_gate_failed_count": hard_gate_failed_count,
            "restore_ok": restore_ok,
        },
    }


def build_context(
    plan_path: Path,
    manifest_path: Path,
    daily_report_path: Path,
    task_packets_path: Path,
    mirror_path: Path,
    registry_path: Path,
    restore_path: Path,
    control_path: Path,
) -> dict[str, Any]:
    return {
        "plan_path": plan_path,
        "manifest_path": manifest_path,
        "daily_report_path": daily_report_path,
        "task_packets_path": task_packets_path,
        "mirror_path": mirror_path,
        "registry_path": registry_path,
        "restore_path": restore_path,
        "control_path": control_path,
        "plan_text": read_text(plan_path),
        "manifest": read_json(manifest_path),
        "daily_report": read_json(daily_report_path),
        "task_packets": read_json(task_packets_path),
        "mirror": read_json(mirror_path),
        "registry": read_json(registry_path),
        "restore": read_json(restore_path),
        "control": read_json(control_path),
    }


def plan_has_section(plan_text: str, title: str) -> bool:
    pattern = rf"^#+\s+{re.escape(title)}\s*$"
    return re.search(pattern, plan_text, flags=re.IGNORECASE | re.MULTILINE) is not None


def mainline_items(ctx: dict[str, Any]) -> list[dict[str, Any]]:
    plan = ctx["plan_text"]
    registry = ctx["registry"]
    mirror = ctx["mirror"]
    restore = ctx["restore"]
    daily = ctx["daily_report"]
    packets = ctx["task_packets"]
    routing = as_list(registry.get("scannerRouting"))
    routing_text = json.dumps(routing, ensure_ascii=False)
    queue_count = len(queue_items(daily))
    packet_count = len(task_packets(packets))
    proposed = proposed_mirror_findings(mirror, registry)
    return [
        checklist_item(
            "mainline-1-maintenance-audit-queue",
            "Maintenance audit and continuous refactor queue is represented by review-first queue artifacts.",
            ["plan.md:五条主线", "daily-evolution-*.json:queue", "daily-evolution-*-task-packets.json:task_packets"],
            status_from_bool(
                contains_all(plan, ["Maintenance audit", "continuous refactor queue"])
                and (queue_count > 0 or packet_count > 0 or "daily-queue" in json.dumps(registry, ensure_ascii=False))
            ),
            f"queue={queue_count}, task_packets={packet_count}",
        ),
        checklist_item(
            "mainline-2-doc-fact-verification",
            "Documentation fact verification and stale-claim review is grounded in local scanner routing.",
            ["plan.md:五条主线", "evolution-registry.json:scannerRouting", "daily-evolution-*.json:raw_summaries"],
            status_from_bool(
                contains_all(plan, ["Documentation fact verification", "stale-claim"])
                and "doc-drift-auditor" in routing_text
            ),
        ),
        checklist_item(
            "mainline-3-skill-lifecycle-governance",
            "Agent skill lifecycle governance has registered skill roots and review-first routing.",
            ["plan.md:五条主线", "evolution-registry.json:skillRoots", "evolution-registry.json:scannerRouting"],
            status_from_bool(
                contains_all(plan, ["Agent skill lifecycle governance"])
                and bool(as_list(registry.get("skillRoots")))
                and "skill-drift-auditor" in routing_text
            ),
        ),
        checklist_item(
            "mainline-4-obsidian-mirror-policy",
            "Obsidian mirror policy keeps Git/project evidence as canonical truth.",
            ["plan.md:五条主线", "mirror-drift-scan.json:findings", "evolution-registry.json:mirrorPairs"],
            (
                "approval_required"
                if proposed
                and contains_all(plan, ["Obsidian mirror policy", "Git as canonical truth"])
                and nested(mirror, "summary", "blocking_count", default=0) == 0
                and bool(as_list(registry.get("mirrorPairs")))
                else status_from_bool(
                    contains_all(plan, ["Obsidian mirror policy", "Git as canonical truth"])
                    and nested(mirror, "summary", "blocking_count", default=0) == 0
                    and bool(as_list(registry.get("mirrorPairs")))
                )
            ),
            "proposed mirror still needs approval" if proposed else "",
        ),
        checklist_item(
            "mainline-5-backup-restore-governance",
            "Git backup, source manifest, runtime ignore, and restore governance have local evidence.",
            ["plan.md:五条主线", "source-runtime-manifest.json:summary", "restore-rehearsal-policy.json"],
            status_from_bool(
                contains_all(plan, ["Git backup", "source manifest", "runtime ignore", "restore governance"])
                and ctx["manifest"].get("summary") is not None
                and restore.get("ok") is True
            ),
        ),
    ]


def phase_items(ctx: dict[str, Any]) -> list[dict[str, Any]]:
    plan = ctx["plan_text"]
    manifest = ctx["manifest"]
    registry = ctx["registry"]
    mirror = ctx["mirror"]
    restore = ctx["restore"]
    daily = ctx["daily_report"]
    control = ctx["control"]
    categories = inventory_categories(manifest, registry, mirror)
    missing_categories = sorted(key for key, present in categories.items() if not present)
    unclassified_count = int(nested(manifest, "summary", "unclassified_count", default=0) or 0)
    queue_count = len(queue_items(daily))
    proposed = proposed_mirror_findings(mirror, registry)
    hard_gate_failed_count = int(nested(control, "summary", "hard_gate_failed_count", default=0) or 0)
    decision_document = phase5_decision_document(ctx)
    phase_5_local_closed = (
        decision_document.get("status") == "accepted"
        and decision_document.get("execution") == "deferred"
        and decision_document.get("registered") is True
        and decision_document.get("split_allowed") is False
        and decision_document.get("automatic_split_allowed") is False
        and unclassified_count == 0
        and not proposed
        and hard_gate_failed_count == 0
        and restore.get("ok") is True
    )
    return [
        checklist_item(
            "phase-0-inventory",
            "Phase 0 preserves safety boundaries and inventories source, runtime, generated evidence, handoff, high-risk, skill, and Obsidian categories.",
            ["plan.md:Phase 0", "source-runtime-manifest.json", "evolution-registry.json", "mirror-drift-scan.json"],
            "pass" if not missing_categories and unclassified_count == 0 else ("weak" if manifest else "fail"),
            f"missing_categories={missing_categories}, unclassified={unclassified_count}",
        ),
        checklist_item(
            "phase-1-architecture-manifests-metadata",
            "Phase 1 normalizes the architecture plan, manifests, and document metadata.",
            ["plan.md:Phase 1", "source-runtime-manifest.json:summary", "evolution-registry.json:documentSurfaces"],
            status_from_bool(
                plan_has_section(plan, "Phase Plan")
                and plan_has_section(plan, "Current State")
                and bool(manifest.get("summary"))
                and bool(as_list(registry.get("documentSurfaces")))
            ),
        ),
        checklist_item(
            "phase-2-doc-skill-review-first",
            "Phase 2 keeps doc-drift and skill-drift as review-first workflows.",
            ["plan.md:Phase 2", "evolution-registry.json:scannerRouting", "daily-evolution-*.json:queue"],
            status_from_bool(
                contains_all(plan, ["Phase 2", "review-first"])
                and "doc-drift-auditor" in json.dumps(registry, ensure_ascii=False)
                and "skill-drift-auditor" in json.dumps(registry, ensure_ascii=False)
            ),
        ),
        checklist_item(
            "phase-3-obsidian-mirror-governance",
            "Phase 3 adds Obsidian mirror governance without a second source of truth.",
            ["plan.md:Phase 3", "mirror-drift-scan.json", "evolution-registry.json:mirrorPairs"],
            (
                "approval_required"
                if proposed
                and mirror.get("ok") is True
                and int(nested(mirror, "summary", "blocking_count", default=0) or 0) == 0
                and bool(as_list(registry.get("mirrorPairs")))
                else status_from_bool(
                    mirror.get("ok") is True
                    and int(nested(mirror, "summary", "blocking_count", default=0) or 0) == 0
                    and bool(as_list(registry.get("mirrorPairs")))
                )
            ),
            "proposed mirror remains approval-required" if proposed else "",
        ),
        checklist_item(
            "phase-4-backup-restore-policy",
            "Phase 4 has Git backup and restore rehearsal policy evidence.",
            ["plan.md:Phase 4", "evolution-registry.json:backupPolicy", "restore-rehearsal-policy.json"],
            status_from_bool(restore.get("ok") is True and isinstance(registry.get("backupPolicy"), dict)),
        ),
        checklist_item(
            "phase-5-stability-before-split",
            "Phase 5 local closure requires accepted ADR, deferred execution, disabled automatic split, clean manifests, no proposed mirror, clear hard gates, and restore policy evidence.",
            ["plan.md:Phase 5", "daily-evolution-*.json:queue", "mirror-drift-scan.json:findings", "daily-evolution-control.json:summary"],
            "pass" if phase_5_local_closed else "deferred",
            f"maintenance_backlog_open_queue={queue_count}, blocking_for_local_closure=false, proposed_mirror_count={len(proposed)}, hard_gate_failed_count={hard_gate_failed_count}, phase5_decision={decision_document.get('status')}",
        ),
    ]


def interface_safety_acceptance_items(ctx: dict[str, Any]) -> list[dict[str, Any]]:
    plan = ctx["plan_text"]
    registry = ctx["registry"]
    forbidden = set(as_list(nested(registry, "safety", "forbiddenWithoutApproval", default=[])))
    required_forbidden = {"push", "pr", "deploy", "remote-mutation", "secret-access", "destructive-cleanup", "broad-sync"}
    current_state_paths = [
        "PROJECT_PROGRESS.md",
        "README.md",
        "workspace-guides/automation-source-runtime-classification.md",
        "workspace-guides/automation-project-split-decision.md",
        "runtime/self-evolution/daily-evolution-2026-05-08.json",
        "runtime/self-evolution/daily-evolution-2026-05-08-task-packets.json",
    ]
    return [
        checklist_item(
            "execution-handoff",
            "Execution handoff splits tight task packet implementation from architecture review and final acceptance.",
            ["plan.md:Execution Handoff"],
            status_from_bool(contains_all(plan, ["Execution Handoff", "Codex CLI", "tight task packets", "Claude", "验收"])),
        ),
        checklist_item(
            "public-interface",
            "Public interface does not claim proposed future interfaces as implemented capabilities.",
            ["plan.md:Public Interface", "repo-evolver-plan-audit.py:read-only artifact"],
            status_from_bool(
                contains_all(plan, ["Public Interface", "proposal", "不是已实现能力"])
                and contains_all(plan, [".evolver/", "agent-skills/", "source/runtime publication manifest"])
            ),
        ),
        checklist_item(
            "safety-rules",
            "Safety rules prohibit push, PR, remote mutation, sync/deploy, secrets, and source/runtime confusion without approval.",
            ["plan.md:Safety Rules", "evolution-registry.json:safety"],
            status_from_bool(
                contains_all(plan, ["Safety Rules", "push", "PR", "remote mutation", "sync", "deploy", "secret"])
                and required_forbidden.issubset(forbidden)
            ),
            f"missing_registry_forbidden={sorted(required_forbidden - forbidden)}",
        ),
        checklist_item(
            "acceptance-criteria-1",
            "plan.md says this is not a new platform and reuses the existing tools/automation system.",
            ["plan.md:Acceptance Criteria"],
            status_from_bool(contains_all(plan, ["不是新平台", "复用", "tools/automation"])),
        ),
        checklist_item(
            "acceptance-criteria-2",
            "plan.md references and describes the listed local evidence paths.",
            ["plan.md:Current State", "plan.md:Acceptance Criteria"],
            status_from_bool(all(path in plan for path in current_state_paths)),
        ),
        checklist_item(
            "acceptance-criteria-3",
            "plan.md defines five mainlines and six phases without promoting future proposals to completed facts.",
            ["plan.md:五条主线", "plan.md:Phase Plan", "plan.md:Public Interface"],
            status_from_bool(
                all(not is_gap_status(item.get("status", "fail")) or item.get("status") == "weak" for item in mainline_items(ctx))
                and count_phase_headings(plan) == 6
                and contains_all(plan, ["proposal", "不是已实现能力"])
            ),
        ),
        checklist_item(
            "acceptance-criteria-4",
            "plan.md defines Codex CLI as tight task packet executor and Claude as architecture reviewer/acceptor.",
            ["plan.md:Execution Handoff"],
            status_from_bool(contains_all(plan, ["Codex CLI", "tight task packets", "Claude", "架构审查", "验收"])),
        ),
        checklist_item(
            "acceptance-criteria-5",
            "plan.md states Git canonical truth, Obsidian mirror-only semantics, and runtime as local evidence.",
            ["plan.md:Acceptance Criteria", "plan.md:Safety Rules"],
            status_from_bool(contains_all(plan, ["Git canonical truth", "Obsidian mirror", "runtime", "本地证据"])),
        ),
    ]


def build_checklist(ctx: dict[str, Any]) -> list[dict[str, Any]]:
    return mainline_items(ctx) + phase_items(ctx) + interface_safety_acceptance_items(ctx)


def build_evidence_summary(ctx: dict[str, Any]) -> dict[str, Any]:
    manifest = ctx["manifest"]
    mirror = ctx["mirror"]
    registry = ctx["registry"]
    daily = ctx["daily_report"]
    packets = ctx["task_packets"]
    control = ctx["control"]
    restore = ctx["restore"]
    categories = inventory_categories(manifest, registry, mirror)
    proposed = proposed_mirror_findings(mirror, registry)
    return {
        "plan_path": str(ctx["plan_path"]),
        "inputs": {
            "manifest": str(ctx["manifest_path"]),
            "daily_report": str(ctx["daily_report_path"]),
            "task_packets": str(ctx["task_packets_path"]),
            "mirror": str(ctx["mirror_path"]),
            "registry": str(ctx["registry_path"]),
            "restore": str(ctx["restore_path"]),
            "control": str(ctx["control_path"]),
        },
        "plan": {
            "exists": bool(ctx["plan_text"]),
            "phase_heading_count": count_phase_headings(ctx["plan_text"]),
        },
        "inventory_categories": categories,
        "manifest_summary": manifest.get("summary") or {},
        "daily_queue_count": len(queue_items(daily)),
        "task_packet_count": len(task_packets(packets)),
        "mirror_summary": mirror.get("summary") or {},
        "proposed_mirror_count": len(proposed),
        "registry_counts": {
            "skill_roots": len(as_list(registry.get("skillRoots"))),
            "document_surfaces": len(as_list(registry.get("documentSurfaces"))),
            "mirror_pairs": len(as_list(registry.get("mirrorPairs"))),
        },
        "restore_ok": restore.get("ok"),
        "daily_control": control.get("summary") or {},
        "read_only": True,
        "writes_remote_or_git": False,
    }


def build_report(
    plan_path: Path = DEFAULT_PLAN,
    manifest_path: Path = DEFAULT_MANIFEST,
    daily_report_path: Path | None = None,
    task_packets_path: Path | None = None,
    mirror_path: Path = DEFAULT_MIRROR,
    registry_path: Path = DEFAULT_REGISTRY,
    restore_path: Path = DEFAULT_RESTORE,
    control_path: Path = DEFAULT_CONTROL,
) -> dict[str, Any]:
    daily_path = daily_report_path or latest_daily_report(ROOT)
    packets_path = task_packets_path or latest_task_packets(ROOT)
    ctx = build_context(plan_path, manifest_path, daily_path, packets_path, mirror_path, registry_path, restore_path, control_path)
    checklist = build_checklist(ctx)
    readiness = split_readiness(ctx)
    gaps = [checklist_projection(item) for item in checklist if is_gap_status(item["status"])]
    deferred_items = [checklist_projection(item) for item in checklist if item["status"] == "deferred"]
    return {
        "ok": not gaps,
        "generated_at": utc_now(),
        "scanner": "repo-evolver-plan-audit",
        "split_readiness": readiness,
        "checklist": checklist,
        "gaps": gaps,
        "deferred_items": deferred_items,
        "evidence_summary": build_evidence_summary(ctx),
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Repo Evolver Plan Audit",
        "",
        f"- ok: `{str(report.get('ok')).lower()}`",
        f"- generated_at: `{report.get('generated_at')}`",
        f"- scanner: `{report.get('scanner')}`",
        "",
        "## Split Readiness",
        "",
    ]
    readiness = report.get("split_readiness") or {}
    reasons = readiness.get("reasons") or []
    approvals = readiness.get("approval_required") or []
    approval_ids = [
        str(item.get("pair_id") or item.get("id") or item.get("mirror") or item)
        for item in approvals
        if isinstance(item, dict)
    ]
    lines.extend([
        f"- phase5 decision document: `{readiness.get('phase5_decision')}`",
        f"- decision: `{readiness.get('decision')}`",
        f"- execution decision: `{readiness.get('execution_decision')}`",
        f"- split allowed: `{str(readiness.get('split_allowed')).lower()}`",
        f"- reasons: `{', '.join(str(reason) for reason in reasons) if reasons else 'none'}`",
        f"- approval required: `{', '.join(approval_ids) if approval_ids else 'none'}`",
    ])
    backlog = readiness.get("maintenance_backlog") if isinstance(readiness.get("maintenance_backlog"), dict) else {}
    if backlog:
        lines.append(
            f"- maintenance backlog: `open_queue={backlog.get('open_queue')}, blocking_for_local_closure={str(backlog.get('blocking_for_local_closure')).lower()}`"
        )
    lines.extend(["", "## Checklist", ""])
    for item in report.get("checklist") or []:
        lines.append(f"- `{item.get('status')}` `{item.get('id')}`: {item.get('requirement')}")
        lines.append(f"  - evidence sources: `{', '.join(item.get('evidence_sources') or [])}`")
        if item.get("note"):
            lines.append(f"  - note: {item.get('note')}")
    lines.extend(["", "## Gaps", ""])
    gaps = report.get("gaps") or []
    if not gaps:
        lines.append("- none")
    for item in gaps:
        lines.append(f"- `{item.get('status')}` `{item.get('id')}`: {item.get('requirement')}")
        if item.get("note"):
            lines.append(f"  - note: {item.get('note')}")
    lines.extend(["", "## Deferred Items", ""])
    deferred_items = report.get("deferred_items") or []
    if not deferred_items:
        lines.append("- none")
    for item in deferred_items:
        lines.append(f"- `{item.get('status')}` `{item.get('id')}`: {item.get('requirement')}")
        if item.get("note"):
            lines.append(f"  - note: {item.get('note')}")
    lines.extend(["", "## Evidence Summary", ""])
    summary = report.get("evidence_summary") or {}
    lines.append(f"- daily queue count: `{summary.get('daily_queue_count')}`")
    lines.append(f"- task packet count: `{summary.get('task_packet_count')}`")
    lines.append(f"- proposed mirror count: `{summary.get('proposed_mirror_count')}`")
    lines.append(f"- restore ok: `{str(summary.get('restore_ok')).lower()}`")
    lines.append(f"- read only: `{str(summary.get('read_only')).lower()}`")
    lines.append(f"- writes remote or git: `{str(summary.get('writes_remote_or_git')).lower()}`")
    return "\n".join(lines) + "\n"


def write_report(report: dict[str, Any], json_out: Path, markdown_out: Path) -> None:
    json_path = ensure_runtime_output(json_out)
    markdown_path = ensure_runtime_output(markdown_out)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=str(json_path.parent), delete=False) as tmp:
        json.dump(report, tmp, ensure_ascii=False, indent=2, sort_keys=True)
        tmp.write("\n")
        tmp_path = Path(tmp.name)
    tmp_path.replace(json_path)
    markdown_path.write_text(render_markdown(report), encoding="utf-8")


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, default=DEFAULT_PLAN)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--daily-report", type=Path, default=None)
    parser.add_argument("--task-packets", type=Path, default=None)
    parser.add_argument("--mirror", type=Path, default=DEFAULT_MIRROR)
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--restore", type=Path, default=DEFAULT_RESTORE)
    parser.add_argument("--control", type=Path, default=DEFAULT_CONTROL)
    parser.add_argument("--json-out", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--markdown-out", type=Path, default=DEFAULT_MD)
    parser.add_argument("--no-write", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    report = build_report(
        plan_path=args.plan,
        manifest_path=args.manifest,
        daily_report_path=args.daily_report,
        task_packets_path=args.task_packets,
        mirror_path=args.mirror,
        registry_path=args.registry,
        restore_path=args.restore,
        control_path=args.control,
    )
    if not args.no_write:
        write_report(report, args.json_out, args.markdown_out)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
