#!/usr/bin/env python3
"""Read-only Git backup and restore rehearsal policy check."""

from __future__ import annotations

import argparse
import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MANIFEST = ROOT / "runtime/task-board/source-runtime-manifest.json"
DEFAULT_MIRROR_DRIFT = ROOT / "runtime/self-evolution/mirror-drift-scan.json"
DEFAULT_REGISTRY = ROOT / "workspace-guides/evolution-registry.json"
DEFAULT_JSON = ROOT / "runtime/self-evolution/restore-rehearsal-policy.json"
DEFAULT_MD = ROOT / "runtime/self-evolution/restore-rehearsal-policy.md"


REQUIRED_APPROVAL_ACTIONS = {
    "backup-write",
    "restore-write",
    "git-mutation",
    "push",
    "pr",
    "remote-mutation",
    "obsidian-write",
    "destructive-cleanup",
}

REQUIRED_VERIFICATION_COMMANDS = {
    "python3 scripts/automationctl manifest --check",
    "python3 scripts/restore-rehearsal-policy.py",
}

AUDIT_CHECKLIST_SPECS = [
    {
        "id": "source-manifest",
        "requirement": "Restore rehearsal evidence must include a classified source manifest with no unclassified files.",
        "evidence_sources": ["source-runtime-manifest.json:summary", "source-runtime-manifest.json:git_visibility"],
        "covered_by_checks": ["git-canonical-source"],
    },
    {
        "id": "runtime-ignore",
        "requirement": "Runtime and generated evidence must remain ignored and excluded from source restore targets.",
        "evidence_sources": ["source-runtime-manifest.json:publication_gate", "source-runtime-manifest.json:summary"],
        "covered_by_checks": ["runtime-ignore-boundary"],
    },
    {
        "id": "mirror-relationship",
        "requirement": "Mirror relationships must keep project files as source of truth and mirrors as derived evidence.",
        "evidence_sources": ["mirror-drift-scan.json:summary", "mirror-drift-scan.json:findings"],
        "covered_by_checks": ["mirror-policy"],
    },
    {
        "id": "backup-cadence-retention",
        "requirement": "Backup policy must define cadence, retention, scope, restore target, runtime lane, and verification commands.",
        "evidence_sources": ["evolution-registry.json:backupPolicy"],
        "covered_by_checks": ["registry-backup-policy"],
    },
    {
        "id": "approval-boundary",
        "requirement": "Backup, restore, publication, remote mutation, and destructive cleanup require explicit approval.",
        "evidence_sources": ["evolution-registry.json:backupPolicy.approvalRequiredFor", "source-runtime-manifest.json:publication_gate"],
        "covered_by_checks": ["approval-boundary"],
    },
    {
        "id": "forbidden-actions-no-write",
        "requirement": "This rehearsal report must not perform backup writes, restore writes, Git mutations, pushes, PRs, remote writes, or destructive actions.",
        "evidence_sources": ["restore-rehearsal-policy.py:mode", "evolution-registry.json:backupPolicy.verificationCommands"],
        "covered_by_checks": ["registry-backup-policy", "approval-boundary"],
    },
]

EXECUTION_CHECKPOINT_SPECS = [
    {
        "id": "pre-backup",
        "description": "Confirm source/runtime boundaries before any backup would be planned.",
        "covered_by_checks": ["git-canonical-source", "runtime-ignore-boundary", "approval-boundary"],
    },
    {
        "id": "backup-plan",
        "description": "Validate the backup plan metadata without writing a backup artifact.",
        "covered_by_checks": ["registry-backup-policy", "approval-boundary"],
    },
    {
        "id": "restore-plan",
        "description": "Validate the source-only restore target without restoring files.",
        "covered_by_checks": ["registry-backup-policy", "mirror-policy", "approval-boundary"],
    },
    {
        "id": "post-restore-verification",
        "description": "Confirm the verification commands required after a hypothetical restore.",
        "covered_by_checks": ["registry-backup-policy", "git-canonical-source", "runtime-ignore-boundary"],
    },
    {
        "id": "retention-check",
        "description": "Confirm retention policy metadata without creating or pruning backup files.",
        "covered_by_checks": ["registry-backup-policy", "approval-boundary"],
    },
    {
        "id": "before-after-comparison",
        "description": "Compare planned source/runtime evidence boundaries without changing the worktree.",
        "covered_by_checks": ["git-canonical-source", "runtime-ignore-boundary", "mirror-policy"],
    },
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def check(check_id: str, passed: bool, message: str, **evidence: Any) -> dict[str, Any]:
    return {
        "id": check_id,
        "status": "pass" if passed else "fail",
        "message": message,
        "evidence": evidence,
    }


def build_audit_checklist(checks: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    checks_by_id = {item.get("id"): item for item in checks}
    checklist = []
    for spec in AUDIT_CHECKLIST_SPECS:
        covered_checks = [checks_by_id.get(check_id) for check_id in spec["covered_by_checks"]]
        status = "pass" if covered_checks and all(item and item.get("status") == "pass" for item in covered_checks) else "fail"
        checklist.append(
            {
                "id": spec["id"],
                "requirement": spec["requirement"],
                "evidence_sources": list(spec["evidence_sources"]),
                "covered_by_checks": list(spec["covered_by_checks"]),
                "status": status,
            }
        )
    return checklist


def build_execution_evidence(checks: Sequence[dict[str, Any]], policy: dict[str, Any]) -> dict[str, Any]:
    checks_by_id = {item.get("id"): item for item in checks}
    checkpoints = []
    for spec in EXECUTION_CHECKPOINT_SPECS:
        covered_checks = [checks_by_id.get(check_id) for check_id in spec["covered_by_checks"]]
        failed_checks = [
            check_id
            for check_id, item in zip(spec["covered_by_checks"], covered_checks)
            if not item or item.get("status") != "pass"
        ]
        checkpoints.append(
            {
                "id": spec["id"],
                "status": "pass" if covered_checks and not failed_checks else "fail",
                "description": spec["description"],
                "semantics": ["dry-run", "read-only", "no-write"],
                "backup_written": False,
                "restore_executed": False,
                "git_mutation": False,
                "covered_by_checks": list(spec["covered_by_checks"]),
                "failed_checks": failed_checks,
            }
        )
    return {
        "mode": "dry-run-read-only-no-write",
        "summary": "Read-only restore rehearsal checkpoints; no backup is written and no restore is executed.",
        "backup_written": False,
        "restore_executed": False,
        "git_mutation": False,
        "restore_target": policy.get("restore_target"),
        "runtime_lane": policy.get("runtime_lane"),
        "checkpoints": checkpoints,
    }


def registry_backup_policy(registry: dict[str, Any]) -> dict[str, Any]:
    backup_policy = registry.get("backupPolicy") if isinstance(registry.get("backupPolicy"), dict) else {}
    approval_required_for = (
        backup_policy.get("approvalRequiredFor") if isinstance(backup_policy.get("approvalRequiredFor"), list) else []
    )
    verification_commands = (
        backup_policy.get("verificationCommands") if isinstance(backup_policy.get("verificationCommands"), list) else []
    )
    return {
        "mode": "read-only-rehearsal-policy",
        "cadence": backup_policy.get("cadence"),
        "retention": backup_policy.get("retention"),
        "restore_target": backup_policy.get("restoreTarget"),
        "runtime_lane": backup_policy.get("runtimeLane"),
        "backup_scope": backup_policy.get("backupScope"),
        "verification_commands": verification_commands,
        "approval_required_for": approval_required_for,
        "never_performed_by_this_check": approval_required_for,
    }


def build_report(manifest_path: Path = DEFAULT_MANIFEST, mirror_path: Path = DEFAULT_MIRROR_DRIFT, registry_path: Path = DEFAULT_REGISTRY) -> dict[str, Any]:
    manifest = read_json(manifest_path)
    mirror = read_json(mirror_path)
    registry = read_json(registry_path)
    summary = manifest.get("summary") if isinstance(manifest.get("summary"), dict) else {}
    visibility = manifest.get("git_visibility") if isinstance(manifest.get("git_visibility"), dict) else {}
    publication_gate = manifest.get("publication_gate") if isinstance(manifest.get("publication_gate"), dict) else {}
    mirror_summary = mirror.get("summary") if isinstance(mirror.get("summary"), dict) else {}
    mirror_findings = mirror.get("findings") if isinstance(mirror.get("findings"), list) else []
    policy = registry_backup_policy(registry)
    approval_required_for = set(policy["approval_required_for"])
    verification_commands = set(policy["verification_commands"])
    source_ignore_rule = visibility.get("source_ignore_rule") or visibility.get("ignore_rule")

    source_ok = (
        bool(visibility.get("automation_ignored"))
        and bool(source_ignore_rule)
        and int(summary.get("source_candidate_count") or 0) > 0
        and int(summary.get("unclassified_count") or 0) == 0
    )
    runtime_ok = (
        publication_gate.get("runtime_excluded_by_default") is True
        and int(summary.get("excluded_by_default_count") or 0) > 0
    )
    mirror_ok = (
        mirror.get("ok") is True
        and int(mirror_summary.get("blocking_count") or 0) == 0
        and all(item.get("source_of_truth", "project") == "project" for item in mirror_findings if isinstance(item, dict) and item.get("kind") != "derived-index-registered")
        and any(item.get("kind") == "derived-index-registered" for item in mirror_findings if isinstance(item, dict))
    )
    backup_policy_ok = (
        isinstance(registry.get("backupPolicy"), dict)
        and all(isinstance(policy.get(key), str) and bool(policy.get(key)) for key in ("cadence", "retention", "restore_target", "runtime_lane", "backup_scope"))
        and REQUIRED_APPROVAL_ACTIONS.issubset(approval_required_for)
        and REQUIRED_VERIFICATION_COMMANDS.issubset(verification_commands)
    )
    approval_ok = (
        REQUIRED_APPROVAL_ACTIONS.issubset(approval_required_for)
        and publication_gate.get("requires_user_approval_for_push") is True
        and publication_gate.get("requires_secret_scan") is True
        and publication_gate.get("requires_review_for_high_risk") is True
    )

    checks = [
        check(
            "git-canonical-source",
            source_ok,
            "Restore rehearsal must start from classified Git/source candidates, not chat memory or Obsidian.",
            automation_ignored=visibility.get("automation_ignored"),
            ignore_rule=visibility.get("ignore_rule"),
            source_ignore_rule=source_ignore_rule,
            runtime_ignore_rule=visibility.get("runtime_ignore_rule"),
            source_candidate_count=summary.get("source_candidate_count", 0),
            unclassified_count=summary.get("unclassified_count", 0),
        ),
        check(
            "runtime-ignore-boundary",
            runtime_ok,
            "Runtime and generated evidence must remain excluded from source restore targets.",
            runtime_excluded_by_default=publication_gate.get("runtime_excluded_by_default"),
            excluded_by_default_count=summary.get("excluded_by_default_count", 0),
        ),
        check(
            "mirror-policy",
            mirror_ok,
            "Obsidian mirrors must remain derived or project-sourced and must not become restore truth.",
            mirror_ok=mirror.get("ok"),
            blocking_count=mirror_summary.get("blocking_count", 0),
            finding_count=len(mirror_findings),
        ),
        check(
            "registry-backup-policy",
            backup_policy_ok,
            "Restore rehearsal policy must be governed by Evolution Registry backupPolicy.",
            has_backup_policy=isinstance(registry.get("backupPolicy"), dict),
            cadence=policy.get("cadence"),
            retention=policy.get("retention"),
            backup_scope=policy.get("backup_scope"),
            restore_target=policy.get("restore_target"),
            runtime_lane=policy.get("runtime_lane"),
            missing_approval_actions=sorted(REQUIRED_APPROVAL_ACTIONS - approval_required_for),
            missing_verification_commands=sorted(REQUIRED_VERIFICATION_COMMANDS - verification_commands),
        ),
        check(
            "approval-boundary",
            approval_ok,
            "Backup, restore, push, publication, remote mutation, and destructive cleanup require explicit approval.",
            missing_approval_actions=sorted(REQUIRED_APPROVAL_ACTIONS - approval_required_for),
            requires_user_approval_for_push=publication_gate.get("requires_user_approval_for_push"),
            requires_secret_scan=publication_gate.get("requires_secret_scan"),
            requires_review_for_high_risk=publication_gate.get("requires_review_for_high_risk"),
        ),
    ]
    audit_checklist = build_audit_checklist(checks)
    execution_evidence = build_execution_evidence(checks, policy)
    checks_ok = all(item["status"] == "pass" for item in checks)
    execution_ok = all(item["status"] == "pass" for item in execution_evidence["checkpoints"])
    return {
        "ok": checks_ok and execution_ok,
        "generated_at": utc_now(),
        "scanner": "restore-rehearsal-policy",
        "inputs": {
            "manifest": str(manifest_path),
            "mirror_drift": str(mirror_path),
            "registry": str(registry_path),
        },
        "policy": policy,
        "execution_evidence": execution_evidence,
        "checks": checks,
        "audit_checklist": audit_checklist,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Restore Rehearsal Policy",
        "",
        f"- ok: `{str(report.get('ok')).lower()}`",
        f"- mode: `{(report.get('policy') or {}).get('mode')}`",
        f"- cadence: `{(report.get('policy') or {}).get('cadence')}`",
        f"- retention: `{(report.get('policy') or {}).get('retention')}`",
        f"- restore target: `{(report.get('policy') or {}).get('restore_target')}`",
        f"- runtime lane: `{(report.get('policy') or {}).get('runtime_lane')}`",
        "",
        "Safety: read-only policy report; no backup write, restore write, Git mutation, push, PR, Obsidian write, deploy, remote mutation, or destructive cleanup.",
        "",
        "## Execution Evidence",
        "",
        f"- mode: `{(report.get('execution_evidence') or {}).get('mode')}`",
        f"- backup written: `{str((report.get('execution_evidence') or {}).get('backup_written')).lower()}`",
        f"- restore executed: `{str((report.get('execution_evidence') or {}).get('restore_executed')).lower()}`",
        f"- Git mutation: `{str((report.get('execution_evidence') or {}).get('git_mutation')).lower()}`",
        f"- summary: {(report.get('execution_evidence') or {}).get('summary')}",
        "",
        "### Checkpoints",
    ]
    for item in (report.get("execution_evidence") or {}).get("checkpoints") or []:
        lines.append(f"- `{item.get('status')}` `{item.get('id')}`: {item.get('description')}")
        lines.append(f"  - semantics: `{', '.join(item.get('semantics') or [])}`")
        lines.append(
            "  - side effects: "
            f"backup_written=`{str(item.get('backup_written')).lower()}`, "
            f"restore_executed=`{str(item.get('restore_executed')).lower()}`, "
            f"git_mutation=`{str(item.get('git_mutation')).lower()}`"
        )
        lines.append(f"  - covered by checks: `{', '.join(item.get('covered_by_checks') or [])}`")
        if item.get("failed_checks"):
            lines.append(f"  - failed checks: `{', '.join(item.get('failed_checks') or [])}`")
    lines.extend(
        [
            "",
            "## Audit Checklist",
        ]
    )
    for item in report.get("audit_checklist") or []:
        lines.append(f"- `{item.get('status')}` `{item.get('id')}`: {item.get('requirement')}")
        lines.append(f"  - evidence sources: `{', '.join(item.get('evidence_sources') or [])}`")
        lines.append(f"  - covered by checks: `{', '.join(item.get('covered_by_checks') or [])}`")
    lines.extend(
        [
            "",
            "## Checks",
        ]
    )
    for item in report.get("checks") or []:
        lines.append(f"- `{item.get('status')}` `{item.get('id')}`: {item.get('message')}")
    return "\n".join(lines) + "\n"


def write_report(report: dict[str, Any], json_out: Path, markdown_out: Path) -> None:
    json_out.parent.mkdir(parents=True, exist_ok=True)
    markdown_out.parent.mkdir(parents=True, exist_ok=True)
    json_out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    markdown_out.write_text(render_markdown(report), encoding="utf-8")


def self_test() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        manifest = root / "manifest.json"
        mirror = root / "mirror.json"
        registry = root / "registry.json"
        manifest.write_text(
            json.dumps(
                {
                    "summary": {"unclassified_count": 0, "source_candidate_count": 1, "excluded_by_default_count": 1},
                    "git_visibility": {"automation_ignored": True, "ignore_rule": ".gitignore:103:tools/automation/*"},
                    "publication_gate": {
                        "runtime_excluded_by_default": True,
                        "requires_secret_scan": True,
                        "requires_user_approval_for_push": True,
                        "requires_review_for_high_risk": True,
                    },
                }
            ),
            encoding="utf-8",
        )
        mirror.write_text(
            json.dumps({"ok": True, "summary": {"blocking_count": 0}, "findings": [{"kind": "derived-index-registered"}]}),
            encoding="utf-8",
        )
        registry.write_text(
            json.dumps(
                {
                    "backupPolicy": {
                        "cadence": "before-push-and-weekly-local",
                        "retention": "keep-last-7-local-evidence-reports",
                        "backupScope": "classified-source-plus-local-runtime-evidence-manifest",
                        "restoreTarget": "source-only",
                        "runtimeLane": "separate-local-evidence-only",
                        "approvalRequiredFor": sorted(REQUIRED_APPROVAL_ACTIONS),
                        "verificationCommands": sorted(REQUIRED_VERIFICATION_COMMANDS),
                    }
                }
            ),
            encoding="utf-8",
        )
        assert build_report(manifest, mirror, registry)["ok"] is True


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--mirror-drift", type=Path, default=DEFAULT_MIRROR_DRIFT)
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--json-out", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--markdown-out", type=Path, default=DEFAULT_MD)
    parser.add_argument("--no-write", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    if args.self_test:
        self_test()
        print(json.dumps({"ok": True, "script": "restore-rehearsal-policy"}, indent=2))
        return 0
    report = build_report(args.manifest, args.mirror_drift, args.registry)
    if not args.no_write:
        write_report(report, args.json_out, args.markdown_out)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
