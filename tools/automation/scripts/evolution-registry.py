#!/usr/bin/env python3
"""Validate and summarize the local Evolution Registry."""

from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path
from typing import Any


DEFAULT_REGISTRY = Path("/Users/yumei/tools/automation/workspace-guides/evolution-registry.json")
KNOWN_ROOT_ROLES = {"canonical-active", "active-mirror", "system-managed", "vendor-managed", "archive"}
KNOWN_WRITE_POLICIES = {"auto-safe", "review-first", "approval-required", "informational"}
REQUIRED_TOP_LEVEL = {"schemaVersion", "updatedAt", "skillRoots", "documentSurfaces", "mirrorPairs", "projects", "backupPolicy", "scannerRouting", "applyPolicy"}
KNOWN_MIRROR_STATUSES = {"active", "proposed", "archived"}
KNOWN_MIRROR_RELATIONSHIPS = {"mirror", "derived-index", "archive-copy"}
KNOWN_SOURCE_OF_TRUTH = {"project", "obsidian", "external", "human-decision"}
KNOWN_MIRROR_DIRECTIONS = {"project-to-obsidian", "project-to-obsidian-derived", "obsidian-to-project-proposed", "external-to-project"}
KNOWN_PRIVACY_GATES = {"required-before-publish", "local-only", "not-publishable", "approved-public"}
REQUIRED_BACKUP_APPROVALS = {
    "backup-write",
    "restore-write",
    "git-mutation",
    "push",
    "pr",
    "remote-mutation",
    "obsidian-write",
    "destructive-cleanup",
}


def load_registry(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("registry root must be a JSON object")
    return data


def _ids(rows: list[dict[str, Any]], section: str) -> list[str]:
    values = []
    for index, row in enumerate(rows):
        item_id = row.get("id")
        if not isinstance(item_id, str) or not item_id:
            raise ValueError(f"{section}[{index}] needs a non-empty id")
        values.append(item_id)
    return values


def _duplicate_ids(values: list[str]) -> list[str]:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for value in values:
        if value in seen:
            duplicates.add(value)
        seen.add(value)
    return sorted(duplicates)


def _path_status(raw: str) -> dict[str, Any]:
    path = Path(raw).expanduser()
    return {"path": raw, "exists": path.exists(), "kind": "dir" if path.is_dir() else "file" if path.is_file() else "missing"}


def validate_registry(data: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []

    missing = sorted(REQUIRED_TOP_LEVEL - set(data))
    if missing:
        errors.append(f"missing top-level keys: {', '.join(missing)}")

    skill_roots = data.get("skillRoots", [])
    doc_surfaces = data.get("documentSurfaces", [])
    mirror_pairs = data.get("mirrorPairs", [])
    projects = data.get("projects", [])
    backup_policy = data.get("backupPolicy", {})
    scanner_routing = data.get("scannerRouting", [])

    for section_name, rows in (("skillRoots", skill_roots), ("documentSurfaces", doc_surfaces), ("mirrorPairs", mirror_pairs), ("projects", projects), ("scannerRouting", scanner_routing)):
        if not isinstance(rows, list):
            errors.append(f"{section_name} must be a list")
            continue
        try:
            duplicates = _duplicate_ids(_ids(rows, section_name)) if section_name != "scannerRouting" else []
        except ValueError as exc:
            errors.append(str(exc))
            continue
        if duplicates:
            errors.append(f"{section_name} has duplicate ids: {', '.join(duplicates)}")

    for row in skill_roots if isinstance(skill_roots, list) else []:
        role = row.get("role")
        if role not in KNOWN_ROOT_ROLES:
            errors.append(f"skillRoots {row.get('id')} has unknown role: {role}")
        policy = row.get("writePolicy")
        if policy not in KNOWN_WRITE_POLICIES:
            errors.append(f"skillRoots {row.get('id')} has unknown writePolicy: {policy}")
        path = row.get("path")
        if not isinstance(path, str) or not path:
            errors.append(f"skillRoots {row.get('id')} needs path")
        elif not Path(path).expanduser().exists():
            warnings.append(f"skill root path missing: {path}")

    for row in doc_surfaces if isinstance(doc_surfaces, list) else []:
        source = row.get("source")
        if not isinstance(source, str) or not source:
            errors.append(f"documentSurfaces {row.get('id')} needs source")
        elif not Path(source).expanduser().exists():
            warnings.append(f"document source missing: {source}")
        mirrors = row.get("mirrors", [])
        if not isinstance(mirrors, list):
            errors.append(f"documentSurfaces {row.get('id')} mirrors must be a list")
        else:
            for mirror in mirrors:
                if not isinstance(mirror, str):
                    errors.append(f"documentSurfaces {row.get('id')} mirror must be a string")
                elif not Path(mirror).expanduser().exists():
                    warnings.append(f"document mirror missing: {mirror}")

    for row in mirror_pairs if isinstance(mirror_pairs, list) else []:
        status_value = row.get("status")
        if status_value not in KNOWN_MIRROR_STATUSES:
            errors.append(f"mirrorPairs {row.get('id')} has unknown status: {status_value}")
        relationship = row.get("relationship")
        if relationship not in KNOWN_MIRROR_RELATIONSHIPS:
            errors.append(f"mirrorPairs {row.get('id')} has unknown relationship: {relationship}")
        source_of_truth = row.get("sourceOfTruth")
        if source_of_truth not in KNOWN_SOURCE_OF_TRUTH:
            errors.append(f"mirrorPairs {row.get('id')} has unknown sourceOfTruth: {source_of_truth}")
        direction = row.get("direction")
        if direction not in KNOWN_MIRROR_DIRECTIONS:
            errors.append(f"mirrorPairs {row.get('id')} has unknown direction: {direction}")
        privacy_gate = row.get("privacyGate")
        if not isinstance(privacy_gate, str) or not privacy_gate:
            errors.append(f"mirrorPairs {row.get('id')} needs privacyGate")
        elif privacy_gate not in KNOWN_PRIVACY_GATES:
            errors.append(f"mirrorPairs {row.get('id')} has unknown privacyGate: {privacy_gate}")
        conflict_policy = row.get("conflictPolicy")
        if not isinstance(conflict_policy, str) or not conflict_policy:
            errors.append(f"mirrorPairs {row.get('id')} needs conflictPolicy")
        source = row.get("source")
        mirror = row.get("mirror")
        if not isinstance(source, str) or not source:
            errors.append(f"mirrorPairs {row.get('id')} needs source")
        elif not Path(source).expanduser().exists():
            warnings.append(f"mirror pair source missing: {source}")
        if not isinstance(mirror, str) or not mirror:
            errors.append(f"mirrorPairs {row.get('id')} needs mirror")
        elif status_value == "active" and not Path(mirror).expanduser().exists():
            errors.append(f"active mirror pair target missing: {mirror}")
        elif status_value == "proposed" and not Path(mirror).expanduser().exists():
            warnings.append(f"proposed mirror target not created yet: {mirror}")

    for row in projects if isinstance(projects, list) else []:
        project_path = row.get("path")
        if not isinstance(project_path, str) or not project_path:
            errors.append(f"projects {row.get('id')} needs path")
        elif not Path(project_path).expanduser().exists():
            warnings.append(f"project path missing: {project_path}")
        for command in row.get("validationCommands", []):
            if not isinstance(command, str) or not command.strip():
                errors.append(f"projects {row.get('id')} has invalid validation command")

    if not isinstance(backup_policy, dict):
        errors.append("backupPolicy must be an object")
    elif backup_policy:
        for field in ("id", "cadence", "retention", "backupScope", "restoreTarget", "runtimeLane"):
            value = backup_policy.get(field)
            if not isinstance(value, str) or not value.strip():
                errors.append(f"backupPolicy needs {field}")
        approvals = backup_policy.get("approvalRequiredFor")
        if not isinstance(approvals, list) or not all(isinstance(item, str) and item.strip() for item in approvals):
            errors.append("backupPolicy approvalRequiredFor must be a list of non-empty strings")
            approvals = []
        missing_approvals = sorted(REQUIRED_BACKUP_APPROVALS - set(approvals))
        if missing_approvals:
            errors.append(f"backupPolicy missing approvalRequiredFor: {', '.join(missing_approvals)}")
        commands = backup_policy.get("verificationCommands")
        if not isinstance(commands, list) or not all(isinstance(item, str) and item.strip() for item in commands):
            errors.append("backupPolicy verificationCommands must be a list of non-empty strings")

    return {
        "ok": not errors,
        "errors": errors,
        "warnings": warnings,
        "counts": {
            "skillRoots": len(skill_roots) if isinstance(skill_roots, list) else 0,
            "documentSurfaces": len(doc_surfaces) if isinstance(doc_surfaces, list) else 0,
            "mirrorPairs": len(mirror_pairs) if isinstance(mirror_pairs, list) else 0,
            "projects": len(projects) if isinstance(projects, list) else 0,
            "backupPolicy": 1 if isinstance(backup_policy, dict) and backup_policy else 0,
            "scannerRouting": len(scanner_routing) if isinstance(scanner_routing, list) else 0,
        },
    }


def summarize_registry(data: dict[str, Any]) -> dict[str, Any]:
    validation = validate_registry(data)
    document_sources = [_path_status(row["source"]) for row in data.get("documentSurfaces", []) if isinstance(row, dict) and isinstance(row.get("source"), str)]
    mirror_pairs = [
        {
            "id": row.get("id"),
            "status": row.get("status"),
            "relationship": row.get("relationship"),
            "sourceOfTruth": row.get("sourceOfTruth"),
            "direction": row.get("direction"),
            "privacyGate": row.get("privacyGate"),
            "conflictPolicy": row.get("conflictPolicy"),
            "source": _path_status(row["source"]),
            "mirror": _path_status(row["mirror"]),
        }
        for row in data.get("mirrorPairs", [])
        if isinstance(row, dict) and isinstance(row.get("source"), str) and isinstance(row.get("mirror"), str)
    ]
    skill_paths = [_path_status(row["path"]) for row in data.get("skillRoots", []) if isinstance(row, dict) and isinstance(row.get("path"), str)]
    backup_policy = data.get("backupPolicy") if isinstance(data.get("backupPolicy"), dict) else {}
    return {
        "schemaVersion": data.get("schemaVersion"),
        "updatedAt": data.get("updatedAt"),
        "ok": validation["ok"],
        "counts": validation["counts"],
        "warningCount": len(validation["warnings"]),
        "errorCount": len(validation["errors"]),
        "documentSources": document_sources,
        "mirrorPairs": mirror_pairs,
        "backupPolicy": {
            "id": backup_policy.get("id"),
            "cadence": backup_policy.get("cadence"),
            "retention": backup_policy.get("retention"),
            "backupScope": backup_policy.get("backupScope"),
            "restoreTarget": backup_policy.get("restoreTarget"),
            "runtimeLane": backup_policy.get("runtimeLane"),
            "approvalRequiredFor": backup_policy.get("approvalRequiredFor", []),
            "verificationCommands": backup_policy.get("verificationCommands", []),
        } if backup_policy else {},
        "skillRoots": skill_paths,
    }


def self_test() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        skills = root / "skills"
        docs = root / "docs"
        project = root / "project"
        skills.mkdir()
        docs.mkdir()
        project.mkdir()
        registry = {
            "schemaVersion": "evolution-registry-1.0",
            "updatedAt": "2026-05-08",
            "skillRoots": [{"id": "skills", "path": str(skills), "role": "canonical-active", "writePolicy": "review-first"}],
            "documentSurfaces": [{"id": "docs", "source": str(docs), "mirrors": [], "role": "docs"}],
            "mirrorPairs": [
                {
                    "id": "docs-mirror",
                    "source": str(docs),
                    "mirror": str(docs),
                    "status": "active",
                    "relationship": "mirror",
                    "sourceOfTruth": "project",
                    "direction": "project-to-obsidian",
                    "privacyGate": "required-before-publish",
                    "conflictPolicy": "project-wins-unless-human-promotes-obsidian-note",
                }
            ],
            "projects": [{"id": "project", "path": str(project), "validationCommands": ["python3 -m unittest"]}],
            "backupPolicy": {
                "id": "project-source-restore-rehearsal",
                "cadence": "before-push-and-weekly-local",
                "retention": "keep-last-7-local-evidence-reports",
                "backupScope": "classified-source-plus-local-runtime-evidence-manifest",
                "restoreTarget": "source-only",
                "runtimeLane": "separate-local-evidence-only",
                "approvalRequiredFor": sorted(REQUIRED_BACKUP_APPROVALS),
                "verificationCommands": [
                    "python3 scripts/automationctl manifest --check",
                    "python3 scripts/restore-rehearsal-policy.py",
                ],
            },
            "scannerRouting": [{"scanner": "doc-drift-auditor", "priorities": {"P1": "review-first"}}],
            "applyPolicy": {"doc-drift-auditor": {"autoSafeKinds": ["missing-absolute-path"]}},
        }
        result = validate_registry(registry)
        assert result["ok"], result
        assert summarize_registry(registry)["counts"]["skillRoots"] == 1
        assert summarize_registry(registry)["counts"]["mirrorPairs"] == 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=False)
    for name in ("validate", "summary"):
        sub = subparsers.add_parser(name)
        sub.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        print(json.dumps({"ok": True, "script": "evolution-registry"}, indent=2))
        return 0

    command = args.command or "summary"
    registry_path = getattr(args, "registry", DEFAULT_REGISTRY)
    data = load_registry(registry_path)
    payload = validate_registry(data) if command == "validate" else summarize_registry(data)
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0 if payload.get("ok", True) else 1


if __name__ == "__main__":
    raise SystemExit(main())
