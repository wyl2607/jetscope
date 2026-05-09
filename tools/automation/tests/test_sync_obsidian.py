from __future__ import annotations

import importlib.util
import tempfile
from pathlib import Path
import sys
import unittest


SCRIPT = Path("/Users/yumei/tools/automation/scripts/sync-obsidian.py")


def _load_module():
    if str(SCRIPT.parent) not in sys.path:
        sys.path.insert(0, str(SCRIPT.parent))
    spec = importlib.util.spec_from_file_location("sync_obsidian_test_module", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class SyncObsidianTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = _load_module()

    def test_sync_plan_reports_critical_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "source.md"
            mirror = Path(tmp) / "mirror.md"
            source.write_text("hello", encoding="utf-8")
            registry = {
                "mirrorPairs": [
                    {
                        "id": "active-project-mirror",
                        "source": str(source),
                        "mirror": str(mirror),
                        "status": "active",
                        "relationship": "mirror",
                        "direction": "project-to-obsidian",
                        "sourceOfTruth": "project",
                        "conflictPolicy": "project-wins-unless-human-promotes-obsidian-note",
                        "privacyGate": "required-before-publish",
                    }
                ]
            }
            result = self.module.sync_plan(registry, apply=False)
        self.assertEqual(len(result["actions"]), 1)
        action = result["actions"][0]
        self.assertEqual(action["pair_id"], "active-project-mirror")
        self.assertIn(action["action"], {"sync-needed", "in-sync"})
        self.assertEqual(action["sourceOfTruth"], "project")
        self.assertEqual(action["conflictPolicy"], "project-wins-unless-human-promotes-obsidian-note")
        self.assertEqual(action["direction"], "project-to-obsidian")
        self.assertEqual(action["privacyGate"], "required-before-publish")
        self.assertEqual(action["conflict_policy"], "project-wins-unless-human-promotes-obsidian-note")

    def test_sync_plan_skips_non_project_truth(self) -> None:
        registry = {
            "mirrorPairs": [
                {
                    "id": "obsidian-wins",
                    "source": "/tmp/project-source.md",
                    "mirror": "/tmp/obsidian-mirror.md",
                    "status": "active",
                    "relationship": "mirror",
                    "direction": "project-to-obsidian",
                    "sourceOfTruth": "obsidian",
                    "conflictPolicy": "project-wins-unless-human-promotes-obsidian-note",
                }
            ]
        }
        result = self.module.sync_plan(registry, apply=False)
        self.assertEqual(len(result["actions"]), 1)
        action = result["actions"][0]
        self.assertEqual(action["action"], "skip")
        self.assertEqual(action["sourceOfTruth"], "obsidian")
        self.assertIn("sourceOfTruth is obsidian", action["reason"])

    def test_sync_plan_uses_legacy_source_of_truth_field(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "source.md"
            mirror = Path(tmp) / "mirror.md"
            source.write_text("legacy truth", encoding="utf-8")
            registry = {
                "mirrorPairs": [
                    {
                        "id": "legacy-truth",
                        "source": str(source),
                        "mirror": str(mirror),
                        "status": "active",
                        "relationship": "mirror",
                        "direction": "project-to-obsidian",
                        "source_of_truth": "project",
                        "conflictPolicy": "project-wins",
                    }
                ]
            }
            result = self.module.sync_plan(registry, apply=False)
        self.assertEqual(result["actions"][0]["sourceOfTruth"], "project")


if __name__ == "__main__":
    unittest.main()
