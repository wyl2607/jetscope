from __future__ import annotations

import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT = Path("/Users/yumei/tools/automation/scripts/ai-model-router.py")


def _load_module():
    spec = importlib.util.spec_from_file_location("ai_model_router_test_module", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class AiModelRouterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = _load_module()

    def test_fast_probe_prefers_deepseek_flash(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            state_path = Path(tmpdir) / "state.json"
            decision = self.module.route_task({"task": "fast_probe"}, state_path=state_path)

        self.assertEqual(decision["lane"], "opencode-go")
        self.assertEqual(decision["model"], "opencode-go/deepseek-v4-flash")
        self.assertIn("opencode-go/deepseek-v4-pro", decision["fallback_models"])

    def test_hard_review_prefers_deepseek_pro(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            state_path = Path(tmpdir) / "state.json"
            decision = self.module.route_task({"task": "hard_review"}, state_path=state_path)

        self.assertEqual(decision["lane"], "opencode-go")
        self.assertEqual(decision["model"], "opencode-go/deepseek-v4-pro")
        self.assertEqual(decision["reasoning_effort"], "high")

    def test_large_implementation_prefers_kimi_then_codex(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            state_path = Path(tmpdir) / "state.json"
            decision = self.module.route_task({"task": "large_implementation"}, state_path=state_path)

        self.assertEqual(decision["model"], "opencode-go/kimi-k2.6")
        self.assertIn("gpt-5.5", decision["fallback_models"])

    def test_codex_execution_prefers_codex_cli_relay(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            state_path = Path(tmpdir) / "state.json"
            decision = self.module.route_task({"task": "codex_execution"}, state_path=state_path)

        self.assertEqual(decision["lane"], "codex-cli")
        self.assertEqual(decision["model"], "gpt-5.5")
        self.assertIn("gpt-5.3-codex", decision["fallback_models"])

    def test_codex_executor_uses_read_only_sandbox(self) -> None:
        argv = self.module.argv_for("gpt-5.5", "Return OK")

        self.assertEqual(argv[:5], ["codex", "exec", "-m", "gpt-5.5", "--sandbox"])
        self.assertIn("read-only", argv)

    def test_failed_models_are_demoted(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            state_path = Path(tmpdir) / "state.json"
            self.module.record_result("opencode-go/deepseek-v4-pro", False, "timeout", state_path=state_path)

            decision = self.module.route_task({"task": "hard_review"}, state_path=state_path)

        self.assertNotEqual(decision["model"], "opencode-go/deepseek-v4-pro")
        self.assertIn("opencode-go/deepseek-v4-pro", decision["fallback_models"])

    def test_fatal_failures_are_excluded(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            state_path = Path(tmpdir) / "state.json"
            self.module.record_result("opencode-go/deepseek-v4-pro", False, "unauthorized", state_path=state_path)

            decision = self.module.route_task({"task": "hard_review"}, state_path=state_path)

        all_models = [decision["model"], *decision["fallback_models"]]
        self.assertNotIn("opencode-go/deepseek-v4-pro", all_models)

    def test_dry_run_executor_redacts_prompt_and_does_not_call_subprocess(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            state_path = Path(tmpdir) / "state.json"
            prompt = "Review this. OPENAI_API_KEY=sk-live-secret token=abcd1234"

            with mock.patch.object(self.module.subprocess, "run") as run:
                result = self.module.execute_request(
                    {"task": "fast_probe", "prompt": prompt, "execute": False},
                    state_path=state_path,
                )

        run.assert_not_called()
        self.assertTrue(result["dry_run"])
        self.assertFalse(result["executed"])
        self.assertIn("<redacted:OPENAI_API_KEY>", result["redacted_prompt_preview"])
        self.assertIn("<redacted:token>", result["redacted_prompt_preview"])
        self.assertNotIn("sk-live-secret", result["redacted_prompt_preview"])
        self.assertIn("argv_preview", result)

    def test_execute_success_records_model_success(self) -> None:
        completed = subprocess.CompletedProcess(args=["cmd"], returncode=0, stdout="OK", stderr="")
        with tempfile.TemporaryDirectory() as tmpdir:
            state_path = Path(tmpdir) / "state.json"
            with mock.patch.object(self.module.subprocess, "run", return_value=completed) as run:
                result = self.module.execute_request(
                    {
                        "task": "fast_probe",
                        "prompt": "Return OK",
                        "execute": True,
                        "timeout_seconds": 3,
                    },
                    state_path=state_path,
                )
            state = self.module.load_state(state_path)

        run.assert_called_once()
        self.assertTrue(result["executed"])
        self.assertEqual(result["returncode"], 0)
        self.assertEqual(result["stdout"], "OK")
        self.assertEqual(state["models"]["opencode-go/deepseek-v4-flash"]["failure_count"], 0)

    def test_execute_sends_redacted_prompt_to_subprocess(self) -> None:
        completed = subprocess.CompletedProcess(args=["cmd"], returncode=0, stdout="OK", stderr="")
        with tempfile.TemporaryDirectory() as tmpdir:
            state_path = Path(tmpdir) / "state.json"
            with mock.patch.object(self.module.subprocess, "run", return_value=completed) as run:
                self.module.execute_request(
                    {
                        "task": "fast_probe",
                        "prompt": "Review. OPENAI_API_KEY=sk-live-secret",
                        "execute": True,
                    },
                    state_path=state_path,
                )

        argv = run.call_args.args[0]
        prompt_arg = argv[-1]
        self.assertIn("<redacted:OPENAI_API_KEY>", prompt_arg)
        self.assertNotIn("sk-live-secret", prompt_arg)

    def test_execute_timeout_records_cooldown_failure(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            state_path = Path(tmpdir) / "state.json"
            with mock.patch.object(
                self.module.subprocess,
                "run",
                side_effect=subprocess.TimeoutExpired(cmd=["cmd"], timeout=1),
            ):
                result = self.module.execute_request(
                    {
                        "task": "fast_probe",
                        "prompt": "Return OK",
                        "execute": True,
                        "timeout_seconds": 1,
                    },
                    state_path=state_path,
                )
            state = self.module.load_state(state_path)

        self.assertFalse(result["ok"])
        self.assertTrue(result["timed_out"])
        entry = state["models"]["opencode-go/deepseek-v4-flash"]
        self.assertEqual(entry["failure_count"], 1)
        self.assertIn("cooldown_until", entry)

    def test_execute_timeout_handles_bytes_stdout_and_stderr(self) -> None:
        timeout_exc = subprocess.TimeoutExpired(cmd=["cmd"], timeout=1)
        timeout_exc.stdout = b"stdout secret OPENAI_API_KEY=sk-timeout"
        timeout_exc.stderr = b"stderr token=abcd1234"

        with tempfile.TemporaryDirectory() as tmpdir:
            state_path = Path(tmpdir) / "state.json"
            with mock.patch.object(
                self.module.subprocess,
                "run",
                side_effect=timeout_exc,
            ):
                result = self.module.execute_request(
                    {
                        "task": "fast_probe",
                        "prompt": "Return OK",
                        "execute": True,
                        "timeout_seconds": 1,
                    },
                    state_path=state_path,
                )
            state = self.module.load_state(state_path)

        self.assertFalse(result["ok"])
        self.assertTrue(result["timed_out"])
        self.assertIsInstance(result["stdout"], str)
        self.assertIsInstance(result["stderr"], str)
        self.assertNotIn("sk-timeout", result["stdout"])
        self.assertNotIn("abcd1234", result["stderr"])
        self.assertIn("<redacted:OPENAI_API_KEY>", result["stdout"])
        self.assertIn("<redacted:token>", result["stderr"])
        self.assertEqual(state["models"]["opencode-go/deepseek-v4-flash"]["failure_count"], 1)
        self.assertIn("cooldown_until", state["models"]["opencode-go/deepseek-v4-flash"])


if __name__ == "__main__":
    unittest.main()
