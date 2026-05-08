from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path("/Users/yumei/tools/automation/scripts/restore-rehearsal-policy.py")
REQUIRED_AUDIT_CHECKLIST_IDS = {
    "source-manifest",
    "runtime-ignore",
    "mirror-relationship",
    "backup-cadence-retention",
    "approval-boundary",
    "forbidden-actions-no-write",
}
REQUIRED_EXECUTION_CHECKPOINT_IDS = {
    "pre-backup",
    "backup-plan",
    "restore-plan",
    "post-restore-verification",
    "retention-check",
    "before-after-comparison",
}


def _load_module():
    if str(SCRIPT.parent) not in sys.path:
        sys.path.insert(0, str(SCRIPT.parent))
    spec = importlib.util.spec_from_file_location("restore_rehearsal_policy_test_module", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class RestoreRehearsalPolicyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = _load_module()

    def test_policy_requires_manifest_runtime_mirror_and_approval_gates(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest = root / "manifest.json"
            mirror = root / "mirror.json"
            registry = root / "registry.json"
            manifest.write_text(
                self.module.json.dumps(
                    {
                        "summary": {
                            "unclassified_count": 0,
                            "source_candidate_count": 7,
                            "excluded_by_default_count": 3,
                        },
                        "git_visibility": {
                            "automation_ignored": True,
                            "ignore_rule": ".gitignore:103:tools/automation/*",
                            "source_ignore_rule": ".gitignore:103:tools/automation/*",
                            "runtime_ignore_rule": ".gitignore:108:tools/automation/runtime/",
                        },
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
                self.module.json.dumps(
                    {
                        "ok": True,
                        "summary": {"blocking_count": 0, "drift_count": 0},
                        "findings": [
                            {"kind": "derived-index-registered"},
                            {
                                "kind": "proposed-mirror-target-missing",
                                "approval_required": True,
                                "source_of_truth": "project",
                            },
                        ],
                    }
                ),
                encoding="utf-8",
            )
            registry.write_text(
                self.module.json.dumps(
                    {
                        "safety": {
                            "forbiddenWithoutApproval": [
                                "push",
                                "pr",
                                "deploy",
                                "remote-mutation",
                                "secret-access",
                                "destructive-cleanup",
                                "broad-sync",
                            ]
                        },
                        "backupPolicy": {
                            "id": "project-source-restore-rehearsal",
                            "cadence": "before-push-and-weekly-local",
                            "retention": "keep-last-7-local-evidence-reports",
                            "backupScope": "classified-source-plus-local-runtime-evidence-manifest",
                            "restoreTarget": "source-only",
                            "runtimeLane": "separate-local-evidence-only",
                            "approvalRequiredFor": [
                                "backup-write",
                                "restore-write",
                                "git-mutation",
                                "push",
                                "pr",
                                "remote-mutation",
                                "obsidian-write",
                                "destructive-cleanup",
                            ],
                            "verificationCommands": [
                                "python3 scripts/automationctl manifest --check",
                                "python3 scripts/restore-rehearsal-policy.py",
                            ],
                        },
                        "mirrorPairs": [{"sourceOfTruth": "project"}],
                    }
                ),
                encoding="utf-8",
            )

            report = self.module.build_report(manifest, mirror, registry)

        self.assertTrue(report["ok"])
        checks = {item["id"]: item for item in report["checks"]}
        self.assertEqual(checks["git-canonical-source"]["status"], "pass")
        self.assertEqual(checks["runtime-ignore-boundary"]["status"], "pass")
        self.assertEqual(checks["mirror-policy"]["status"], "pass")
        self.assertEqual(checks["approval-boundary"]["status"], "pass")
        self.assertEqual(report["policy"]["restore_target"], "source-only")
        self.assertEqual(report["policy"]["runtime_lane"], "separate-local-evidence-only")
        self.assertEqual(report["policy"]["cadence"], "before-push-and-weekly-local")
        self.assertEqual(report["policy"]["retention"], "keep-last-7-local-evidence-reports")
        self.assertEqual(report["policy"]["backup_scope"], "classified-source-plus-local-runtime-evidence-manifest")
        self.assertEqual(
            report["policy"]["approval_required_for"],
            [
                "backup-write",
                "restore-write",
                "git-mutation",
                "push",
                "pr",
                "remote-mutation",
                "obsidian-write",
                "destructive-cleanup",
            ],
        )
        self.assertIn("python3 scripts/automationctl manifest --check", report["policy"]["verification_commands"])
        self.assertIn("python3 scripts/restore-rehearsal-policy.py", report["policy"]["verification_commands"])
        self.assertEqual(report["policy"]["mode"], "read-only-rehearsal-policy")
        execution_evidence = report["execution_evidence"]
        self.assertFalse(execution_evidence["backup_written"])
        self.assertFalse(execution_evidence["restore_executed"])
        self.assertFalse(execution_evidence["git_mutation"])
        checkpoints = {item["id"]: item for item in execution_evidence["checkpoints"]}
        self.assertEqual(set(checkpoints), REQUIRED_EXECUTION_CHECKPOINT_IDS)
        for item in checkpoints.values():
            self.assertEqual(item["status"], "pass")
            self.assertFalse(item["backup_written"])
            self.assertFalse(item["restore_executed"])
            self.assertFalse(item["git_mutation"])
            self.assertIn("dry-run", item["semantics"])
            self.assertIn("read-only", item["semantics"])
            self.assertIn("no-write", item["semantics"])
        checklist = {item["id"]: item for item in report["audit_checklist"]}
        self.assertEqual(set(checklist), REQUIRED_AUDIT_CHECKLIST_IDS)
        for item in checklist.values():
            self.assertIn("requirement", item)
            self.assertIsInstance(item["evidence_sources"], list)
            self.assertGreater(len(item["evidence_sources"]), 0)
            self.assertIsInstance(item["covered_by_checks"], list)
            self.assertGreater(len(item["covered_by_checks"]), 0)
            self.assertEqual(item["status"], "pass")
        self.assertTrue(report["ok"])
        markdown = self.module.render_markdown(report)
        self.assertIn("## Audit Checklist", markdown)
        self.assertIn("## Execution Evidence", markdown)
        self.assertIn("backup written: `false`", markdown)
        self.assertIn("restore executed: `false`", markdown)
        self.assertIn("Git mutation: `false`", markdown)
        self.assertIn("`pass` `before-after-comparison`", markdown)
        self.assertIn("`pass` `source-manifest`", markdown)
        self.assertIn("evidence sources:", markdown)

    def test_policy_fails_closed_when_runtime_is_not_excluded(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest = root / "manifest.json"
            mirror = root / "mirror.json"
            registry = root / "registry.json"
            manifest.write_text(
                self.module.json.dumps(
                    {
                        "summary": {"unclassified_count": 0, "source_candidate_count": 1, "excluded_by_default_count": 0},
                        "git_visibility": {
                            "automation_ignored": True,
                            "ignore_rule": ".gitignore:103:tools/automation/*",
                            "source_ignore_rule": ".gitignore:103:tools/automation/*",
                            "runtime_ignore_rule": ".gitignore:108:tools/automation/runtime/",
                        },
                        "publication_gate": {"runtime_excluded_by_default": False},
                    }
                ),
                encoding="utf-8",
            )
            mirror.write_text(self.module.json.dumps({"ok": True, "summary": {"blocking_count": 0}, "findings": []}), encoding="utf-8")
            registry.write_text(self.module.json.dumps({"safety": {"forbiddenWithoutApproval": []}, "mirrorPairs": []}), encoding="utf-8")

            report = self.module.build_report(manifest, mirror, registry)

        self.assertFalse(report["ok"])
        failed = {item["id"] for item in report["checks"] if item["status"] == "fail"}
        self.assertIn("runtime-ignore-boundary", failed)
        self.assertIn("approval-boundary", failed)

    def test_policy_fails_closed_without_backup_policy(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest = root / "manifest.json"
            mirror = root / "mirror.json"
            registry = root / "registry.json"
            manifest.write_text(
                self.module.json.dumps(
                    {
                        "summary": {"unclassified_count": 0, "source_candidate_count": 1, "excluded_by_default_count": 1},
                        "git_visibility": {
                            "automation_ignored": True,
                            "source_ignore_rule": ".gitignore:103:tools/automation/*",
                        },
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
                self.module.json.dumps({"ok": True, "summary": {"blocking_count": 0}, "findings": [{"kind": "derived-index-registered"}]}),
                encoding="utf-8",
            )
            registry.write_text(self.module.json.dumps({"safety": {"forbiddenWithoutApproval": []}}), encoding="utf-8")

            report = self.module.build_report(manifest, mirror, registry)

        self.assertFalse(report["ok"])
        checks = {item["id"]: item for item in report["checks"]}
        self.assertEqual(checks["registry-backup-policy"]["status"], "fail")
        self.assertEqual(checks["approval-boundary"]["status"], "fail")
        checkpoints = {item["id"]: item for item in report["execution_evidence"]["checkpoints"]}
        self.assertEqual(checkpoints["backup-plan"]["status"], "fail")
        self.assertEqual(checkpoints["restore-plan"]["status"], "fail")
        self.assertEqual(checkpoints["retention-check"]["status"], "fail")
        self.assertNotEqual(
            {item["status"] for item in checkpoints.values()},
            {"pass"},
        )
        checklist = {item["id"]: item for item in report["audit_checklist"]}
        self.assertEqual(checklist["backup-cadence-retention"]["status"], "fail")
        self.assertEqual(checklist["approval-boundary"]["status"], "fail")
        self.assertEqual(checklist["forbidden-actions-no-write"]["status"], "fail")

    def test_policy_fails_closed_when_approval_actions_are_incomplete(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest = root / "manifest.json"
            mirror = root / "mirror.json"
            registry = root / "registry.json"
            manifest.write_text(
                self.module.json.dumps(
                    {
                        "summary": {"unclassified_count": 0, "source_candidate_count": 1, "excluded_by_default_count": 1},
                        "git_visibility": {
                            "automation_ignored": True,
                            "source_ignore_rule": ".gitignore:103:tools/automation/*",
                        },
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
                self.module.json.dumps({"ok": True, "summary": {"blocking_count": 0}, "findings": [{"kind": "derived-index-registered"}]}),
                encoding="utf-8",
            )
            registry.write_text(
                self.module.json.dumps(
                    {
                        "backupPolicy": {
                            "cadence": "before-push-and-weekly-local",
                            "retention": "keep-last-7-local-evidence-reports",
                            "backupScope": "classified-source-plus-local-runtime-evidence-manifest",
                            "restoreTarget": "source-only",
                            "runtimeLane": "separate-local-evidence-only",
                            "approvalRequiredFor": ["backup-write", "restore-write"],
                            "verificationCommands": [
                                "python3 scripts/automationctl manifest --check",
                                "python3 scripts/restore-rehearsal-policy.py",
                            ],
                        }
                    }
                ),
                encoding="utf-8",
            )

            report = self.module.build_report(manifest, mirror, registry)

        self.assertFalse(report["ok"])
        checks = {item["id"]: item for item in report["checks"]}
        self.assertEqual(checks["registry-backup-policy"]["status"], "fail")
        self.assertEqual(checks["approval-boundary"]["status"], "fail")
        self.assertIn("git-mutation", checks["approval-boundary"]["evidence"]["missing_approval_actions"])

    def test_policy_fails_closed_when_required_verification_command_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest = root / "manifest.json"
            mirror = root / "mirror.json"
            registry = root / "registry.json"
            manifest.write_text(
                self.module.json.dumps(
                    {
                        "summary": {"unclassified_count": 0, "source_candidate_count": 1, "excluded_by_default_count": 1},
                        "git_visibility": {
                            "automation_ignored": True,
                            "source_ignore_rule": ".gitignore:103:tools/automation/*",
                        },
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
                self.module.json.dumps({"ok": True, "summary": {"blocking_count": 0}, "findings": [{"kind": "derived-index-registered"}]}),
                encoding="utf-8",
            )
            registry.write_text(
                self.module.json.dumps(
                    {
                        "backupPolicy": {
                            "cadence": "before-push-and-weekly-local",
                            "retention": "keep-last-7-local-evidence-reports",
                            "backupScope": "classified-source-plus-local-runtime-evidence-manifest",
                            "restoreTarget": "source-only",
                            "runtimeLane": "separate-local-evidence-only",
                            "approvalRequiredFor": sorted(self.module.REQUIRED_APPROVAL_ACTIONS),
                            "verificationCommands": ["python3 scripts/automationctl manifest --check"],
                        }
                    }
                ),
                encoding="utf-8",
            )

            report = self.module.build_report(manifest, mirror, registry)

        self.assertFalse(report["ok"])
        checks = {item["id"]: item for item in report["checks"]}
        self.assertEqual(checks["registry-backup-policy"]["status"], "fail")
        self.assertIn(
            "python3 scripts/restore-rehearsal-policy.py",
            checks["registry-backup-policy"]["evidence"]["missing_verification_commands"],
        )
        checklist = {item["id"]: item for item in report["audit_checklist"]}
        self.assertEqual(checklist["backup-cadence-retention"]["status"], "fail")
        self.assertEqual(checklist["forbidden-actions-no-write"]["status"], "fail")


if __name__ == "__main__":
    unittest.main()
