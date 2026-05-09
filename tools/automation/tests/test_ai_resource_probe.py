from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path("/Users/yumei/tools/automation/scripts/ai_resource_probe.py")
REGISTRY = Path("/Users/yumei/tools/automation/config/ai-assistants.registry.yaml")


def _load_module():
    spec = importlib.util.spec_from_file_location("ai_resource_probe_test_module", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class AiResourceProbeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = _load_module()

    def test_registry_contains_required_assistants_and_fields(self) -> None:
        registry = self.module.load_registry(REGISTRY)
        assistants = {item["id"]: item for item in registry["assistants"]}

        for assistant_id in {
            "codex",
            "codex_spark",
            "claude_code",
            "kimi",
            "gemini_flash",
            "qwen",
            "openrouter_free",
            "local_lmstudio",
            "legacy_cli_placeholder",
        }:
            self.assertIn(assistant_id, assistants)
            self.assertFalse(self.module.REQUIRED_FIELDS - set(assistants[assistant_id]))

    def test_core_pinned_assistants_are_not_replacement_candidates(self) -> None:
        registry = self.module.load_registry(REGISTRY)
        core = {item["id"]: item for item in registry["assistants"] if item["lifecycle"] == "core_pinned"}

        self.assertEqual(set(core), {"codex", "claude_code"})
        for assistant in core.values():
            self.assertFalse(assistant["replacement_probe_enabled"])
            self.assertTrue(str(assistant["retirement_policy"]).startswith("core_pinned"))

    def test_probe_defaults_to_dry_run_and_writes_runtime_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "probe.json"
            result = self.module.run_probe(REGISTRY, output)
            self.assertTrue(output.exists())

        self.assertTrue(result["dry_run"])
        self.assertEqual(result["api_calls_performed"], 0)
        codex = next(item for item in result["assistants"] if item["id"] == "codex")
        self.assertEqual(codex["quota_probe"]["confidence"], "estimated")
        self.assertEqual(codex["replacement_probe"]["status"], "skipped_core_pinned")


if __name__ == "__main__":
    unittest.main()
