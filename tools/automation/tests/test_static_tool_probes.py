from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from unittest import mock


SCRIPT = Path("/Users/yumei/tools/automation/scripts/static-tool-probes.py")


def _load_module():
    if str(SCRIPT.parent) not in sys.path:
        sys.path.insert(0, str(SCRIPT.parent))
    spec = importlib.util.spec_from_file_location("static_tool_probes_test_module", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class StaticToolProbeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = _load_module()

    def test_missing_tools_are_warnings_not_failures(self) -> None:
        with mock.patch.object(self.module.shutil, "which", return_value=None):
            report = self.module.build_report()

        self.assertTrue(report["ok"])
        self.assertEqual(report["summary"]["available_count"], 0)
        self.assertEqual(report["summary"]["missing_count"], 3)
        self.assertEqual(report["summary"]["executed_count"], 0)
        self.assertEqual({item["status"] for item in report["tools"]}, {"missing"})
        self.assertTrue(all(item["mode"] == "warning" for item in report["tools"]))

    def test_available_tool_runs_read_only_probe_and_keeps_command_template(self) -> None:
        def fake_which(name: str) -> str | None:
            return f"/usr/local/bin/{name}" if name == "lychee" else None

        fake_proc = self.module.subprocess.CompletedProcess(["lychee"], 0, "ok", "")
        with mock.patch.object(self.module.shutil, "which", side_effect=fake_which), mock.patch.object(self.module.subprocess, "run", return_value=fake_proc) as run:
            report = self.module.build_report()

        lychee = next(item for item in report["tools"] if item["name"] == "lychee")
        self.assertEqual(lychee["status"], "available")
        self.assertEqual(lychee["scan"]["status"], "passed")
        self.assertIn("lychee", lychee["command_template"])
        self.assertEqual(report["summary"]["available_count"], 1)
        self.assertEqual(report["summary"]["executed_count"], 1)
        run.assert_called_once()

    def test_available_tool_scan_failure_is_warning_not_daily_failure(self) -> None:
        def fake_which(name: str) -> str | None:
            return f"/usr/local/bin/{name}" if name == "semgrep" else None

        fake_proc = self.module.subprocess.CompletedProcess(["semgrep"], 2, "", "ca-certs: empty trust anchors")
        with mock.patch.object(self.module.shutil, "which", side_effect=fake_which), mock.patch.object(self.module.subprocess, "run", return_value=fake_proc):
            report = self.module.build_report()

        semgrep = next(item for item in report["tools"] if item["name"] == "semgrep")
        self.assertTrue(report["ok"])
        self.assertEqual(semgrep["scan"]["status"], "failed")
        self.assertEqual(semgrep["mode"], "warning")
        self.assertIn("empty trust anchors", semgrep["scan"]["stderr_tail"])


if __name__ == "__main__":
    unittest.main()
