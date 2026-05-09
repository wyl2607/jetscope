from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from importlib.machinery import SourceFileLoader
from unittest import mock


DASHBOARD_SCRIPT = Path("/Users/yumei/tools/automation/scripts/spend-task-dashboard.py")
AUTOMATIONCTL_SCRIPT = Path("/Users/yumei/tools/automation/scripts/automationctl")


def _load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None:
        spec = importlib.util.spec_from_loader(name, SourceFileLoader(name, str(path)))
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class SpendTaskDashboardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = _load_module(DASHBOARD_SCRIPT, "spend_task_dashboard_test_module")

    def test_company_ocr_day_seeds_company_task_and_pool(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "automation"
            runtime = root / "runtime"
            (runtime / "task-board").mkdir(parents=True)
            (runtime / "multi-agent").mkdir(parents=True)
            (runtime / "spend-dashboard").mkdir(parents=True)
            (runtime / "task-board" / "enriched-board.json").write_text(
                json.dumps({"tasks": [{"task_id": "local", "project": "jetscope", "priority": "P2"}]}),
                encoding="utf-8",
            )
            (runtime / "multi-agent" / "next-recommender.json").write_text(
                json.dumps({"recommendations": [{"task_id": "local", "kind": "manual_dry_run"}]}),
                encoding="utf-8",
            )
            manual = runtime / "spend-dashboard" / "manual-spend.jsonl"
            manual.write_text(
                json.dumps({"date": "2026-05-01", "pool": "company_ocr", "cost_usd": 11.0}) + "\n",
                encoding="utf-8",
            )

            data = self.module.build_dashboard(
                root=root,
                config_path=runtime / "missing.json",
                manual_spend_path=manual,
                date_text="2026-05-01",
                company_ocr_day=True,
            )

            self.assertTrue(data["budget"]["pools"]["company_ocr"]["enabled"])
            self.assertFalse(data["budget"]["pools"]["company_ocr"]["parked"])
            self.assertEqual(data["budget"]["pools"]["company_ocr"]["spent_usd"], 11.0)
            self.assertEqual(data["tasks"]["recommendations"][0]["project"], "machine-label-ocr")
            self.assertEqual(data["tasks"]["recommendations"][0]["pool"], "company_ocr")
            self.assertEqual(data["after_work"]["company_ocr_default"], "parked")

    def test_disabled_company_pool_blocks_ocr_task_without_flag(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "automation"
            runtime = root / "runtime"
            (runtime / "task-board").mkdir(parents=True)
            (runtime / "multi-agent").mkdir(parents=True)
            (runtime / "task-board" / "enriched-board.json").write_text(
                json.dumps({"tasks": [{"task_id": "ocr", "project": "machine-label-ocr", "priority": "P1"}]}),
                encoding="utf-8",
            )
            (runtime / "multi-agent" / "next-recommender.json").write_text(
                json.dumps({"recommendations": [{"task_id": "ocr", "kind": "manual_dry_run"}]}),
                encoding="utf-8",
            )

            data = self.module.build_dashboard(
                root=root,
                config_path=runtime / "missing.json",
                manual_spend_path=runtime / "missing-spend.jsonl",
                date_text="2026-05-01",
                company_ocr_day=False,
            )
            self.assertTrue(data["budget"]["pools"]["company_ocr"]["parked"])
            task = data["tasks"]["recommendations"][0]
            self.assertEqual(task["pool"], "company_ocr")
            self.assertFalse(task["allowed"])
            self.assertIn("pool-disabled", task["blockers"])

    def test_runtime_output_guard_rejects_outside_path(self) -> None:
        with self.assertRaises(SystemExit):
            self.module.ensure_runtime_path(Path("/tmp/outside-dashboard.json"))

    def test_runtime_input_guard_rejects_outside_path(self) -> None:
        with self.assertRaises(SystemExit):
            self.module.ensure_runtime_input_path(Path("/tmp/outside-dashboard-config.json"))


class AutomationCtlDashboardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = _load_module(AUTOMATIONCTL_SCRIPT, "automationctl_test_module")

    def test_dashboard_parser_accepts_company_ocr_day(self) -> None:
        args = self.module.parse_args(["dashboard", "--company-ocr-day", "--date", "2026-05-01"])
        self.assertEqual(args.command, "dashboard")
        self.assertTrue(args.company_ocr_day)
        self.assertEqual(args.date, "2026-05-01")

    def test_manifest_parser_accepts_refresh_and_check_flags(self) -> None:
        args = self.module.parse_args(["manifest", "--refresh", "--check"])
        self.assertEqual(args.command, "manifest")
        self.assertTrue(args.refresh)
        self.assertTrue(args.check)

    def test_manifest_refresh_runs_source_runtime_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "automation"
            task_board = root / "runtime" / "task-board"
            task_board.mkdir(parents=True)
            manifest_path = task_board / "source-runtime-manifest.json"
            manifest_path.write_text(
                json.dumps(
                    {
                        "summary": {
                            "total_files": 3,
                            "source_candidate_count": 1,
                            "excluded_by_default_count": 2,
                            "high_risk_count": 0,
                            "unclassified_count": 0,
                        },
                        "git_visibility": {"automation_ignored": True},
                    }
                ),
                encoding="utf-8",
            )

            with mock.patch.object(self.module, "AUTOMATION", root), mock.patch.object(
                self.module, "TASK_BOARD", task_board
            ), mock.patch.object(self.module, "run_cmd") as run_cmd, mock.patch("builtins.print"):
                rc = self.module.manifest(self.module.parse_args(["manifest", "--refresh"]))

        self.assertEqual(rc, 0)
        self.assertEqual(run_cmd.call_count, 1)
        self.assertIn("source-runtime-manifest.py", run_cmd.call_args.args[0][1])

    def test_manifest_check_passes_for_clean_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            task_board = Path(tmpdir) / "runtime" / "task-board"
            task_board.mkdir(parents=True)
            (task_board / "source-runtime-manifest.json").write_text(
                json.dumps(
                    {
                        "summary": {
                            "total_files": 3,
                            "source_candidate_count": 1,
                            "excluded_by_default_count": 2,
                            "high_risk_count": 0,
                            "unclassified_count": 0,
                        },
                        "git_visibility": {
                            "automation_ignored": True,
                            "ignore_rule": ".gitignore:103:tools/automation/*\ttools/automation/plan.md",
                        },
                    }
                ),
                encoding="utf-8",
            )

            with mock.patch.object(self.module, "TASK_BOARD", task_board), mock.patch("builtins.print"):
                rc = self.module.manifest(self.module.parse_args(["manifest", "--check"]))

        self.assertEqual(rc, 0)

    def test_manifest_check_fails_for_missing_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            task_board = Path(tmpdir) / "runtime" / "task-board"
            task_board.mkdir(parents=True)

            with mock.patch.object(self.module, "TASK_BOARD", task_board), mock.patch("builtins.print"):
                rc = self.module.manifest(self.module.parse_args(["manifest", "--check"]))

        self.assertEqual(rc, 1)

    def test_manifest_check_fails_for_unclassified_entries(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            task_board = Path(tmpdir) / "runtime" / "task-board"
            task_board.mkdir(parents=True)
            (task_board / "source-runtime-manifest.json").write_text(
                json.dumps(
                    {
                        "summary": {
                            "total_files": 3,
                            "source_candidate_count": 1,
                            "excluded_by_default_count": 2,
                            "high_risk_count": 0,
                            "unclassified_count": 1,
                        },
                        "git_visibility": {
                            "automation_ignored": True,
                            "ignore_rule": ".gitignore:103:tools/automation/*\ttools/automation/plan.md",
                        },
                    }
                ),
                encoding="utf-8",
            )

            with mock.patch.object(self.module, "TASK_BOARD", task_board), mock.patch("builtins.print"):
                rc = self.module.manifest(self.module.parse_args(["manifest", "--check"]))

        self.assertEqual(rc, 1)

    def test_manifest_check_fails_when_root_ignore_boundary_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            task_board = Path(tmpdir) / "runtime" / "task-board"
            task_board.mkdir(parents=True)
            (task_board / "source-runtime-manifest.json").write_text(
                json.dumps(
                    {
                        "summary": {
                            "total_files": 3,
                            "source_candidate_count": 1,
                            "excluded_by_default_count": 2,
                            "high_risk_count": 0,
                            "unclassified_count": 0,
                        },
                        "git_visibility": {
                            "automation_ignored": False,
                            "ignore_rule": "",
                        },
                    }
                ),
                encoding="utf-8",
            )

            with mock.patch.object(self.module, "TASK_BOARD", task_board), mock.patch("builtins.print"):
                rc = self.module.manifest(self.module.parse_args(["manifest", "--check"]))

        self.assertEqual(rc, 1)


if __name__ == "__main__":
    unittest.main()
