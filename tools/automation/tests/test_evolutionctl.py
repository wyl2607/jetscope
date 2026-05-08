from __future__ import annotations

import importlib.util
import importlib.machinery
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT = Path("/Users/yumei/tools/automation/scripts/evolutionctl")


def _load_module():
    if str(SCRIPT.parent) not in sys.path:
        sys.path.insert(0, str(SCRIPT.parent))
    loader = importlib.machinery.SourceFileLoader("evolutionctl_test_module", str(SCRIPT))
    spec = importlib.util.spec_from_loader("evolutionctl_test_module", loader)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules["evolutionctl_test_module"] = module
    spec.loader.exec_module(module)
    return module


class EvolutionCtlTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = _load_module()

    def test_daily_plan_contains_expected_read_only_chain(self) -> None:
        plan = self.module.daily_plan(limit=5)
        names = [step.name for step in plan]

        self.assertEqual(
            names,
            [
                "manifest",
                "registry",
                "skill-dashboard",
                "mirror-drift",
                "restore-rehearsal-policy",
                "static-tool-probes",
                "doc-drift",
                "reshape-scan",
                "approval-inbox",
                "self-evolution-dashboard",
            ],
        )
        self.assertTrue(all(step.read_only for step in plan))

    def test_daily_writes_summary_and_preserves_failures(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            calls: list[list[str]] = []

            def fake_run_step(step):
                calls.append(step.argv)
                return {"name": step.name, "ok": step.name != "reshape-scan", "returncode": 1 if step.name == "reshape-scan" else 0}

            with mock.patch.object(self.module, "run_step", side_effect=fake_run_step):
                rc = self.module.run_daily(limit=3, out_dir=out_dir)

            report = self.module.read_json(out_dir / "daily-evolution-control.json")
            markdown_exists = (out_dir / "daily-evolution-control.md").exists()

        self.assertEqual(rc, 1)
        self.assertEqual(len(calls), 11)
        self.assertIn("self-evolution-dashboard.py", str(calls[-1][-1]))
        self.assertFalse(report["ok"])
        self.assertEqual(report["summary"]["failed_count"], 1)
        self.assertTrue(markdown_exists)

    def test_dashboard_subcommand_runs_dashboard_step(self) -> None:
        seen = []

        def fake_run_step(step):
            seen.append(step)
            return {"name": step.name, "ok": True, "returncode": 0}

        with mock.patch.object(self.module, "run_step", side_effect=fake_run_step):
            rc = self.module.parse_args(["dashboard"]).func(None)

        self.assertEqual(rc, 0)
        self.assertEqual(seen[0].name, "self-evolution-dashboard")
        self.assertIn("self-evolution-dashboard.py", str(seen[0].argv[-1]))


if __name__ == "__main__":
    unittest.main()
