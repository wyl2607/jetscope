from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT = Path("/Users/yumei/tools/automation/scripts/ai_task_router.py")
REGISTRY = Path("/Users/yumei/tools/automation/config/ai-assistants.registry.yaml")


def _load_module():
    spec = importlib.util.spec_from_file_location("ai_task_router_test_module", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class AiTaskRouterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = _load_module()

    def test_routes_complex_coding_to_core_assistant_with_reason(self) -> None:
        decision = self.module.route_task(
            {
                "task_complexity": "high",
                "risk_class": "medium_risk",
                "required_capabilities": ["complex_coding"],
                "privacy_class": "project_code_allowed",
                "estimated_tokens": 12000,
                "quota_remaining": {"*": "unknown"},
                "cost_sensitivity": "low",
            },
            registry_path=REGISTRY,
        )

        self.assertTrue(decision["ok"])
        self.assertEqual(decision["assistant"], "codex")
        self.assertEqual(decision["confidence"], "estimated")
        self.assertIn("quota confidence: estimated", decision["reason"])

    def test_high_risk_requires_human_approval(self) -> None:
        decision = self.module.route_task(
            {
                "task_complexity": "high",
                "risk_class": "high_risk",
                "required_capabilities": ["architecture"],
                "privacy_class": "project_code_allowed",
                "estimated_tokens": 8000,
                "quota_remaining": {"claude_code": 20000, "*": "unknown"},
                "cost_sensitivity": "low",
            },
            registry_path=REGISTRY,
        )

        self.assertTrue(decision["ok"])
        self.assertEqual(decision["assistant"], "claude_code")
        self.assertTrue(decision["requires_human_approval"])
        self.assertIn("human approval", decision["reason"])

    def test_free_dynamic_models_do_not_handle_restricted_tasks(self) -> None:
        decision = self.module.route_task(
            {
                "task_complexity": "low",
                "risk_class": "low_risk",
                "required_capabilities": ["summary", "secrets"],
                "privacy_class": "secrets_allowed",
                "estimated_tokens": 100,
                "quota_remaining": {"*": "unknown"},
                "cost_sensitivity": "high",
            },
            registry_path=REGISTRY,
        )

        self.assertFalse(decision["ok"])
        blocked = {item["id"]: item["reasons"] for item in decision["rejected"]}
        self.assertIn("free_dynamic_restricted_task:secrets,secrets_allowed", blocked["openrouter_free"])

    def test_free_dynamic_filter_reasons_name_restricted_task_types(self) -> None:
        decision = self.module.route_task(
            {
                "task_complexity": "high",
                "risk_class": "high_risk",
                "required_capabilities": ["production_deploy", "delete_files", "broad_refactor"],
                "privacy_class": "project_code_allowed",
                "estimated_tokens": 1000,
                "quota_remaining": {"*": "unknown"},
                "cost_sensitivity": "high",
            },
            registry_path=REGISTRY,
        )

        self.assertFalse(decision["ok"])
        blocked = {item["id"]: item["reasons"] for item in decision["rejected"]}
        self.assertIn(
            "free_dynamic_restricted_task:broad_refactor,delete_files,production_deploy",
            blocked["openrouter_free"],
        )
        self.assertIn("free_dynamic_high_risk:high_risk_requires_non_dynamic_assistant", blocked["openrouter_free"])

    def test_cost_sensitive_low_risk_docs_can_use_free_candidate(self) -> None:
        decision = self.module.route_task(
            {
                "task_complexity": "low",
                "risk_class": "low_risk",
                "required_capabilities": ["summary"],
                "privacy_class": "no_secrets",
                "estimated_tokens": 400,
                "quota_remaining": {"*": "unknown"},
                "cost_sensitivity": "high",
            },
            registry_path=REGISTRY,
        )

        self.assertTrue(decision["ok"])
        self.assertIn(decision["assistant"], {"gemini_flash", "kimi", "qwen", "openrouter_free"})
        self.assertFalse(decision["requires_human_approval"])

    def test_exact_quota_can_be_reported_when_known(self) -> None:
        decision = self.module.route_task(
            {
                "task_complexity": "medium",
                "risk_class": "low_risk",
                "required_capabilities": ["small_coding"],
                "privacy_class": "project_code_allowed",
                "estimated_tokens": 500,
                "quota_remaining": {"codex_spark": 2000, "*": "unknown"},
                "cost_sensitivity": "medium",
            },
            registry_path=REGISTRY,
        )

        self.assertTrue(decision["ok"])
        self.assertEqual(decision["assistant"], "codex_spark")
        self.assertEqual(decision["confidence"], "exact")


if __name__ == "__main__":
    unittest.main()
