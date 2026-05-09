from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path("/Users/yumei/tools/automation/scripts/skill-library.py")


def _load_module():
    spec = importlib.util.spec_from_file_location("skill_library_test_module", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class SkillLibraryMetadataTests(unittest.TestCase):
    def test_duplicate_metadata_and_gate_are_present(self) -> None:
        module = _load_module()
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            registry = root / "registry.json"
            trace = root / "trace.jsonl"
            registry.write_text('{"chains": {}}\n', encoding="utf-8")
            trace.write_text("", encoding="utf-8")

            payload = module.build_library(registry, [trace])

        metadata = payload["duplicate_metadata"]
        self.assertIn("duplicate_kinds", metadata)
        self.assertIn("copy_roles", metadata)
        self.assertIn("active_drift_risk_names", metadata)
        self.assertIn("intentional_variant_names", metadata)
        self.assertIn("archive_noise_names", metadata)
        self.assertIn("alias_or_system_noise_names", metadata)
        self.assertEqual(payload["gate"]["active_drift_risk_clear"], payload["summary"]["active_drift_risk_names"] == 0)


if __name__ == "__main__":
    unittest.main()
