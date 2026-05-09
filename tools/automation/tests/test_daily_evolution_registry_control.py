from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from unittest import mock


SCRIPT = Path("/Users/yumei/.agents/skills/daily-evolution-runner/scripts/daily_evolution_report.py")


def _load_module():
    if str(SCRIPT.parent) not in sys.path:
        sys.path.insert(0, str(SCRIPT.parent))
    spec = importlib.util.spec_from_file_location("daily_evolution_report_test_module", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class DailyEvolutionRegistryControlTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = _load_module()

    def test_registered_doc_surface_controls_allowed_files(self) -> None:
        registry = {
            "documentSurfaces": [
                {
                    "id": "docs",
                    "source": "/tmp/project/docs",
                    "role": "docs",
                    "syncMode": "manual-review",
                }
            ],
            "scannerRouting": [
                {
                    "scanner": "doc-drift-auditor",
                    "priorities": {"P1": "review-first"},
                }
            ],
        }
        queue, ignored = self.module.queue_from_results(
            [
                {
                    "scanner": "doc-drift-auditor",
                    "findings": [
                        {
                            "level": "P1",
                            "kind": "missing-absolute-path",
                            "path": "/tmp/project/docs/README.md",
                            "target": "/tmp/missing",
                            "message": "Missing path.",
                        }
                    ],
                }
            ],
            10,
            registry=registry,
        )

        self.assertEqual(ignored, [])
        self.assertEqual(queue[0]["mode"], "review-first")
        self.assertTrue(queue[0]["registry_control"]["registered"])
        self.assertEqual(queue[0]["registry_control"]["id"], "docs")
        self.assertEqual(queue[0]["task_packet"]["allowed_files"], ["/tmp/project/docs/README.md"])

    def test_unregistered_path_blocks_write_permissions(self) -> None:
        queue, _ = self.module.queue_from_results(
            [
                {
                    "scanner": "doc-drift-auditor",
                    "findings": [
                        {
                            "level": "P1",
                            "kind": "missing-absolute-path",
                            "path": "/tmp/outside/README.md",
                            "target": "/tmp/missing",
                            "message": "Missing path.",
                        }
                    ],
                }
            ],
            10,
            registry={"documentSurfaces": [], "scannerRouting": []},
        )

        packet = queue[0]["task_packet"]
        self.assertEqual(queue[0]["mode"], "approval-required")
        self.assertFalse(packet["registry_control"]["registered"])
        self.assertEqual(packet["allowed_files"], [])
        self.assertIn("Do not edit files until this path is classified in Evolution Registry.", packet["forbidden"])

    def test_project_registry_supplies_reshape_validation(self) -> None:
        registry = {
            "projects": [
                {
                    "id": "project",
                    "path": "/tmp/project",
                    "validationCommands": ["python3 -m unittest tests.test_evolution_registry"],
                }
            ],
            "scannerRouting": [
                {
                    "scanner": "reshape-refactor-loop",
                    "priorities": {"P3": "auto-safe"},
                }
            ],
        }
        queue, _ = self.module.queue_from_results(
            [
                {
                    "scanner": "reshape-refactor-loop",
                    "findings": [
                        {
                            "level": "P3",
                            "kind": "large-file",
                            "path": "/tmp/project/app.py",
                            "message": "Large file.",
                        }
                    ],
                }
            ],
            10,
            registry=registry,
        )

        self.assertEqual(queue[0]["registry_control"]["id"], "project")
        self.assertEqual(queue[0]["task_packet"]["validation"], ["python3 -m unittest tests.test_evolution_registry"])

    def test_manifest_gate_failure_stops_daily_report(self) -> None:
        failed_gate = {
            "ok": False,
            "command": ["/tmp/automationctl", "manifest", "--check"],
            "returncode": 1,
            "stdout": "manifest_check=FAIL unclassified_count=1",
            "stderr": "",
        }

        with mock.patch.object(self.module, "run_manifest_gate", return_value=failed_gate), mock.patch("builtins.print"):
            with self.assertRaises(SystemExit) as raised:
                self.module.require_manifest_gate()

        self.assertEqual(raised.exception.code, 1)

    def test_daily_report_carries_manifest_gate_summary(self) -> None:
        gate = {
            "ok": True,
            "command": ["/Users/yumei/tools/automation/scripts/automationctl", "manifest", "--check"],
            "returncode": 0,
            "stdout": "manifest_check=PASS",
            "stderr": "",
        }

        report = self.module.build_report(
            Path("/tmp/project"),
            Path("/tmp/skills"),
            10,
            evolution_registry=None,
            manifest_gate=gate,
        )

        self.assertEqual(report["manifest_gate"], gate)

    def test_registered_semantic_stale_doc_finding_is_review_first(self) -> None:
        registry = {
            "documentSurfaces": [
                {
                    "id": "docs",
                    "source": "/tmp/project/docs",
                    "role": "docs",
                    "syncMode": "manual-review",
                }
            ],
            "scannerRouting": [
                {
                    "scanner": "doc-drift-auditor",
                    "priorities": {"P1": "review-first"},
                }
            ],
        }
        queue, _ = self.module.queue_from_results(
            [
                {
                    "scanner": "doc-drift-auditor",
                    "findings": [
                        {
                            "level": "P1",
                            "kind": "semantic-stale-risk",
                            "path": "/tmp/project/docs/README.md",
                            "line": 42,
                            "target": "latest",
                            "semantic_type": "model-claim",
                            "evidence_hint": "Check model/provider claims against local routing config and official docs.",
                            "message": "High-change claim.",
                        }
                    ],
                }
            ],
            10,
            registry=registry,
        )

        self.assertEqual(queue[0]["mode"], "review-first")
        self.assertEqual(queue[0]["line"], 42)
        self.assertEqual(queue[0]["semantic_type"], "model-claim")
        self.assertIn("official docs", queue[0]["evidence_hint"])
        self.assertEqual(queue[0]["task_packet"]["mode"], "review-first")
        self.assertEqual(queue[0]["task_packet"]["line"], 42)
        self.assertEqual(queue[0]["task_packet"]["semantic_type"], "model-claim")
        self.assertTrue(any("Line: 42" in item for item in queue[0]["task_packet"]["context"]))
        self.assertTrue(any("Evidence hint: Check model/provider claims" in item for item in queue[0]["task_packet"]["context"]))
        self.assertEqual(queue[0]["task_packet"]["allowed_files"], ["/tmp/project/docs/README.md"])

    def test_command_examples_are_grouped_in_daily_queue(self) -> None:
        registry = {
            "documentSurfaces": [
                {
                    "id": "docs",
                    "source": "/tmp/project/docs",
                    "role": "docs",
                    "syncMode": "manual-review",
                }
            ],
            "scannerRouting": [
                {
                    "scanner": "doc-drift-auditor",
                    "priorities": {"P1": "review-first"},
                }
            ],
        }

        queue, _ = self.module.queue_from_results(
            [
                {
                    "scanner": "doc-drift-auditor",
                    "findings": [
                        {
                            "level": "P1",
                            "kind": "semantic-stale-risk",
                            "signal": "command-example",
                            "path": "/tmp/project/docs/README.md",
                            "line": 10,
                            "target": "npm run verify",
                            "semantic_type": "command-example",
                            "evidence_status": "package-script",
                            "evidence_source": "package.json#scripts.verify",
                            "command_group": "npm run verify",
                            "evidence_hint": "Check the command against package scripts.",
                            "message": "Command example.",
                        },
                        {
                            "level": "P1",
                            "kind": "semantic-stale-risk",
                            "signal": "command-example",
                            "path": "/tmp/project/docs/SETUP.md",
                            "line": 22,
                            "target": "npm run verify -- --watch",
                            "semantic_type": "command-example",
                            "evidence_status": "package-script",
                            "evidence_source": "package.json#scripts.verify",
                            "command_group": "npm run verify",
                            "evidence_hint": "Check the command against package scripts.",
                            "message": "Command example.",
                        },
                    ],
                }
            ],
            10,
            registry=registry,
        )

        self.assertEqual(len(queue), 1)
        item = queue[0]
        self.assertEqual(item["kind"], "semantic-stale-risk-group")
        self.assertEqual(item["command_group"], "npm run verify")
        self.assertEqual(item["evidence_status"], "package-script")
        self.assertEqual(item["group_count"], 2)
        self.assertEqual(item["task_packet"]["command_group"], "npm run verify")
        self.assertEqual(item["task_packet"]["group_count"], 2)
        self.assertTrue(any("Command group: npm run verify" in line for line in item["task_packet"]["context"]))

    def test_command_evidence_status_controls_queue_order(self) -> None:
        registry = {
            "documentSurfaces": [
                {
                    "id": "docs",
                    "source": "/tmp/project/docs",
                    "role": "docs",
                    "syncMode": "manual-review",
                }
            ],
            "scannerRouting": [
                {
                    "scanner": "doc-drift-auditor",
                    "priorities": {"P1": "review-first"},
                }
            ],
        }
        findings = []
        for index, status in enumerate(["local-entrypoint", "package-script", "help-verifiable", "manual-confirm", "dangerous-command"]):
            findings.append(
                {
                    "level": "P1",
                    "kind": "semantic-stale-risk",
                    "signal": "command-example",
                    "path": "/tmp/project/docs/README.md",
                    "line": index + 1,
                    "target": f"{status} command",
                    "semantic_type": "command-example",
                    "evidence_status": status,
                    "evidence_source": status,
                    "command_group": status,
                    "evidence_hint": "Check command evidence.",
                    "message": "Command example.",
                }
            )

        queue, _ = self.module.queue_from_results(
            [{"scanner": "doc-drift-auditor", "findings": findings}],
            10,
            registry=registry,
        )

        self.assertEqual(
            [item["evidence_status"] for item in queue],
            ["dangerous-command", "manual-confirm", "help-verifiable", "package-script", "local-entrypoint"],
        )


if __name__ == "__main__":
    unittest.main()
