from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest import mock


MANIFEST_SCRIPT = Path("/Users/yumei/tools/automation/scripts/source-runtime-manifest.py")


def _load_module():
    spec = importlib.util.spec_from_file_location("source_runtime_manifest_test_module", MANIFEST_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class SourceRuntimeManifestTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = _load_module()

    def test_ignored_workspace_uses_filesystem_inventory(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "automation"
            (root / "scripts").mkdir(parents=True)
            (root / "runtime" / "task-board").mkdir(parents=True)
            (root / "README.md").write_text("# Local automation\n", encoding="utf-8")
            (root / "scripts" / "source.py").write_text("print('ok')\n", encoding="utf-8")
            (root / "runtime" / "task-board" / "state.json").write_text("{}\n", encoding="utf-8")
            (root / ".DS_Store").write_text("", encoding="utf-8")

            with mock.patch.object(self.module, "AUTOMATION", root), mock.patch.object(
                self.module, "run_git", return_value=["scripts/source.py"]
            ):
                files = self.module.list_files()

        self.assertIn("README.md", files)
        self.assertIn("scripts/source.py", files)
        self.assertIn("runtime/task-board/state.json", files)
        self.assertNotIn(".DS_Store", files)

    def test_git_visibility_detects_parent_ignore_rule(self) -> None:
        with mock.patch.object(self.module, "git_output", return_value="/Users/yumei"), mock.patch.object(
            self.module, "run_git", return_value=["tools/automation/scripts/source-runtime-manifest.py"]
        ), mock.patch.object(
            self.module, "first_ignore_rule",
            return_value=".gitignore:103:tools/automation/*\ttools/automation/plan.md",
        ):
            visibility = self.module.git_visibility()

        self.assertTrue(visibility["automation_ignored"])
        self.assertEqual(visibility["tracked_files_under_automation"], 1)
        self.assertIn("ignored", visibility["commit_boundary_note"])

    def test_repo_evolver_plan_and_local_skill_assets_are_classified(self) -> None:
        self.assertEqual(self.module.classify("plan.md")["classification"], "source")
        self.assertEqual(self.module.classify("PLANS.md")["classification"], "source")
        self.assertEqual(self.module.classify("skills-lock.json")["classification"], "source")
        self.assertEqual(self.module.classify(".agents/skills/tdd/SKILL.md")["classification"], "source")

    def test_skill_chain_dashboard_static_assets_are_source_exception(self) -> None:
        for path in [
            "runtime/skill-chains/dashboard/app.js",
            "runtime/skill-chains/dashboard/styles.css",
            "runtime/skill-chains/dashboard/i18n.json",
            "runtime/skill-chains/dashboard/i18n.js",
            "runtime/skill-chains/dashboard/index.html",
            "runtime/skill-chains/dashboard/modules/g9a-kpi.js",
            "runtime/skill-chains/dashboard/modules/g9a-kpi.css",
            "runtime/skill-chains/dashboard/modules/g9b-watch-drawer.js",
            "runtime/skill-chains/dashboard/modules/g9b-watch-drawer.css",
            "runtime/skill-chains/dashboard/modules/g9c-chain-drawer.js",
            "runtime/skill-chains/dashboard/modules/g9c-chain-drawer.css",
        ]:
            entry = self.module.classify(path)
            self.assertEqual(entry["classification"], "source-exception")
            self.assertEqual(entry["default_action"], "candidate-after-validation-and-secret-scan")

        for generated_path in [
            "runtime/skill-chains/dashboard/data.json",
            "runtime/skill-chains/dashboard/data.js",
            "runtime/skill-chains/dashboard/skills.json",
            "runtime/skill-chains/dashboard/skills.js",
            "runtime/skill-chains/dashboard/latest.json",
            "runtime/skill-chains/dashboard/latest.md",
            "runtime/skill-chains/dashboard/latest.html",
            "runtime/skill-chains/dashboard/watch-log.jsonl",
            "runtime/skill-chains/dashboard/qa/desktop.png",
        ]:
            self.assertEqual(
                self.module.classify(generated_path)["classification"],
                "local-only-runtime",
            )


if __name__ == "__main__":
    unittest.main()
