from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


WATCH_SCRIPT = Path("/Users/yumei/tools/automation/scripts/skill-dedupe-watch.py")


def _load_watch_module():
    spec = importlib.util.spec_from_file_location("skill_dedupe_watch_test_module", WATCH_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class SkillDedupeWatchTests(unittest.TestCase):
    def test_append_log_updates_dashboard_readable_copy(self) -> None:
        module = _load_watch_module()
        snapshot = {
            "ts": "2026-05-07T18:00:00Z",
            "anomalies_total": 0,
            "library_summary": {"unique_skills": 75},
            "skills": [],
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            module.LOG_PATH = root / "dedupe" / "watch-log.jsonl"
            module.DASHBOARD_LOG_PATH = root / "dashboard" / "watch-log.jsonl"
            module.DASHBOARD_LEGACY_LOG_PATH = root / "dashboard" / "dedupe" / "watch-log.jsonl"

            module.append_log(snapshot)

            self.assertTrue(module.LOG_PATH.is_file())
            self.assertTrue(module.DASHBOARD_LOG_PATH.is_file())
            self.assertTrue(module.DASHBOARD_LEGACY_LOG_PATH.is_file())
            self.assertEqual(
                json.loads(module.DASHBOARD_LOG_PATH.read_text(encoding="utf-8").strip()),
                snapshot,
            )


if __name__ == "__main__":
    unittest.main()
