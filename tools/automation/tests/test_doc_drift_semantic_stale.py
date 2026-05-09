from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path("/Users/yumei/.agents/skills/doc-drift-auditor/scripts/scan_doc_drift.py")


def _load_module():
    if str(SCRIPT.parent) not in sys.path:
        sys.path.insert(0, str(SCRIPT.parent))
    spec = importlib.util.spec_from_file_location("scan_doc_drift_test_module", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class DocDriftSemanticStaleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = _load_module()

    def test_high_change_fact_claims_require_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            doc = root / "README.md"
            doc.write_text(
                "\n".join(
                    [
                        "The latest GPT model is configured in this repo.",
                        "Current macOS supports this workflow.",
                        "This command is the new recommended setup:",
                        "```bash",
                        "codex exec --model gpt-5.5 'ok'",
                        "```",
                    ]
                ),
                encoding="utf-8",
            )

            result = self.module.scan([root])

        semantic = [item for item in result["findings"] if item["kind"] == "semantic-stale-risk"]
        self.assertGreaterEqual(len(semantic), 3)
        self.assertTrue(all(item["level"] == "P1" for item in semantic))
        self.assertTrue(all(item["mode"] == "review-first" for item in semantic))
        self.assertTrue(any(item["signal"] == "high-change-claim" for item in semantic))
        self.assertTrue(any(item["signal"] == "command-example" for item in semantic))
        self.assertTrue(any("evidence" in item["message"].lower() for item in semantic))

    def test_semantic_findings_include_type_and_evidence_hint(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            doc = root / "README.md"
            doc.write_text(
                "\n".join(
                    [
                        "The latest GPT model is gpt-5.5.",
                        "Current macOS and Node 22 support this workflow.",
                        "Python 3.14 is the recommended runtime.",
                        "```bash",
                        "npm run verify",
                        "```",
                    ]
                ),
                encoding="utf-8",
            )

            result = self.module.scan([root])

        semantic = [item for item in result["findings"] if item["kind"] == "semantic-stale-risk"]
        by_type = {item["semantic_type"]: item for item in semantic}
        self.assertIn("model-claim", by_type)
        self.assertIn("version-claim", by_type)
        self.assertIn("command-example", by_type)
        self.assertIn("official docs", by_type["model-claim"]["evidence_hint"])
        self.assertIn("package metadata", by_type["version-claim"]["evidence_hint"])
        self.assertIn("--help", by_type["command-example"]["evidence_hint"])

    def test_generic_status_words_do_not_create_stale_claims(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            doc = root / "AGENTS.md"
            doc.write_text(
                "\n".join(
                    [
                        "## Current Boundary",
                        "Support files live in this directory.",
                        "For Python changes, run the relevant compiler.",
                        "Use this for new local records.",
                    ]
                ),
                encoding="utf-8",
            )

            result = self.module.scan([root])

        semantic = [item for item in result["findings"] if item["kind"] == "semantic-stale-risk"]
        self.assertEqual(semantic, [])

    def test_dated_progress_bullets_are_historical_not_current_stale_claims(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            doc = root / "PROJECT_PROGRESS.md"
            doc.write_text(
                "\n".join(
                    [
                        "## Current State",
                        "- Current model router uses Codex fallback for this workflow.",
                        "",
                        "## Recent Changes",
                        "- 2026-05-08: Added model-router health visibility for Codex and GPT routes.",
                        "- 2026-05-07: Aligned Codex/OpenCode model defaults with a then-current route.",
                    ]
                ),
                encoding="utf-8",
            )

            result = self.module.scan([root])

        semantic = [item for item in result["findings"] if item["kind"] == "semantic-stale-risk"]
        self.assertEqual(len(semantic), 1)
        self.assertEqual(semantic[0]["line"], 2)
        self.assertEqual(semantic[0]["target"].lower(), "model")

    def test_command_examples_include_static_evidence_probe_classification(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            scripts = root / "scripts"
            scripts.mkdir()
            local_script = scripts / "foo"
            local_script.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
            (root / "package.json").write_text(
                json.dumps({"scripts": {"verify": "python3 -m unittest"}}),
                encoding="utf-8",
            )
            doc = root / "README.md"
            doc.write_text(
                "\n".join(
                    [
                        "```bash",
                        "scripts/foo --help",
                        "npm run verify",
                        "missing-tool --help",
                        "missing-tool run",
                        "rm -rf /tmp/example",
                        "```",
                    ]
                ),
                encoding="utf-8",
            )

            result = self.module.scan([root])

        command_findings = [
            item
            for item in result["findings"]
            if item["kind"] == "semantic-stale-risk" and item["signal"] == "command-example"
        ]
        by_target = {item["target"]: item for item in command_findings}
        self.assertEqual(by_target["scripts/foo --help"]["evidence_status"], "local-entrypoint")
        self.assertIn("scripts/foo", by_target["scripts/foo --help"]["evidence_source"])
        self.assertEqual(by_target["npm run verify"]["evidence_status"], "package-script")
        self.assertIn("package.json#scripts.verify", by_target["npm run verify"]["evidence_source"])
        self.assertEqual(by_target["missing-tool --help"]["evidence_status"], "help-verifiable")
        self.assertIn("--help", by_target["missing-tool --help"]["evidence_source"])
        self.assertEqual(by_target["missing-tool run"]["evidence_status"], "manual-confirm")
        self.assertIn("human confirmation", by_target["missing-tool run"]["evidence_source"])
        self.assertEqual(by_target["rm -rf /tmp/example"]["evidence_status"], "dangerous-command")
        self.assertIn("manual approval", by_target["rm -rf /tmp/example"]["evidence_source"])
        self.assertEqual(by_target["scripts/foo --help"]["command_group"], "scripts/foo")

    def test_multiline_shell_continuations_are_one_command_example(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            scripts = root / "scripts"
            scripts.mkdir()
            script = scripts / "verify.sh"
            script.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
            doc = root / "README.md"
            doc.write_text(
                "\n".join(
                    [
                        "```bash",
                        "bash scripts/verify.sh \\",
                        "  --fast \\",
                        "  --verbose",
                        "```",
                    ]
                ),
                encoding="utf-8",
            )

            result = self.module.scan([root])

        command_findings = [
            item
            for item in result["findings"]
            if item["kind"] == "semantic-stale-risk" and item["signal"] == "command-example"
        ]
        self.assertEqual(len(command_findings), 1)
        self.assertEqual(command_findings[0]["command_group"], "scripts/verify.sh")
        self.assertEqual(command_findings[0]["evidence_status"], "local-entrypoint")

    def test_shell_wrapped_commands_group_by_actual_action(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            scripts = root / "scripts"
            scripts.mkdir()
            (scripts / "alpha.sh").write_text("#!/usr/bin/env bash\n", encoding="utf-8")
            (scripts / "beta.sh").write_text("#!/usr/bin/env bash\n", encoding="utf-8")
            doc = root / "README.md"
            doc.write_text(
                "\n".join(
                    [
                        "```bash",
                        "bash scripts/alpha.sh --dry-run",
                        "bash scripts/beta.sh --dry-run",
                        "bash -n scripts/alpha.sh",
                        "sh scripts/alpha.sh --dry-run",
                        "python3 -m py_compile scripts/tool.py",
                        "```",
                    ]
                ),
                encoding="utf-8",
            )

            result = self.module.scan([root])

        command_findings = [
            item
            for item in result["findings"]
            if item["kind"] == "semantic-stale-risk" and item["signal"] == "command-example"
        ]
        groups = {item["target"]: item["command_group"] for item in command_findings}
        self.assertEqual(groups["bash scripts/alpha.sh --dry-run"], "scripts/alpha.sh")
        self.assertEqual(groups["sh scripts/alpha.sh --dry-run"], "scripts/alpha.sh")
        self.assertEqual(groups["bash scripts/beta.sh --dry-run"], "scripts/beta.sh")
        self.assertEqual(groups["bash -n scripts/alpha.sh"], "bash -n")
        self.assertEqual(groups["python3 -m py_compile scripts/tool.py"], "python3 -m py_compile")

    def test_cd_commands_group_by_target_directory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            docs = root / "docs"
            tools = root / "tools"
            docs.mkdir()
            tools.mkdir()
            doc = root / "README.md"
            doc.write_text(
                "\n".join(
                    [
                        "```bash",
                        "cd docs",
                        "cd tools",
                        "cd missing",
                        "```",
                    ]
                ),
                encoding="utf-8",
            )

            result = self.module.scan([root])

        command_findings = [
            item
            for item in result["findings"]
            if item["kind"] == "semantic-stale-risk" and item["signal"] == "command-example"
        ]
        by_target = {item["target"]: item for item in command_findings}
        self.assertEqual(by_target["cd docs"]["command_group"], "cd docs")
        self.assertEqual(by_target["cd docs"]["evidence_status"], "local-entrypoint")
        self.assertIn("docs", by_target["cd docs"]["evidence_source"])
        self.assertEqual(by_target["cd tools"]["command_group"], "cd tools")
        self.assertEqual(by_target["cd tools"]["evidence_status"], "local-entrypoint")
        self.assertEqual(by_target["cd missing"]["command_group"], "cd missing")
        self.assertEqual(by_target["cd missing"]["evidence_status"], "manual-confirm")

    def test_grep_commands_group_by_check_pattern(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            doc = root / "README.md"
            doc.write_text(
                "\n".join(
                    [
                        "```bash",
                        "grep -R \"TODO\" docs",
                        "grep -R \"TODO\" src",
                        "grep -R \"| None\\|dict | list\" auto-refactor-loop",
                        "grep -n \"^section\" config.toml",
                        "```",
                    ]
                ),
                encoding="utf-8",
            )

            result = self.module.scan([root])

        command_findings = [
            item
            for item in result["findings"]
            if item["kind"] == "semantic-stale-risk" and item["signal"] == "command-example"
        ]
        groups = {item["target"]: item["command_group"] for item in command_findings}
        self.assertEqual(groups['grep -R "TODO" docs'], "grep -R TODO")
        self.assertEqual(groups['grep -R "TODO" src'], "grep -R TODO")
        self.assertEqual(groups['grep -R "| None\\|dict | list" auto-refactor-loop'], "grep -R '| None\\|dict | list'")
        self.assertEqual(groups['grep -n "^section" config.toml'], "grep -n '^section'")

    def test_local_script_commands_group_by_subcommand_when_present(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            scripts = root / "scripts"
            scripts.mkdir()
            (scripts / "trace.sh").write_text("#!/usr/bin/env bash\n", encoding="utf-8")
            (scripts / "frontmatter.py").write_text("#!/usr/bin/env python3\n", encoding="utf-8")
            doc = root / "README.md"
            doc.write_text(
                "\n".join(
                    [
                        "```bash",
                        "bash scripts/trace.sh find keyword",
                        "bash scripts/trace.sh session project summary next issue",
                        "python3 scripts/frontmatter.py --json",
                        "scripts/frontmatter.py --strict",
                        "```",
                    ]
                ),
                encoding="utf-8",
            )

            result = self.module.scan([root])

        command_findings = [
            item
            for item in result["findings"]
            if item["kind"] == "semantic-stale-risk" and item["signal"] == "command-example"
        ]
        groups = {item["target"]: item["command_group"] for item in command_findings}
        self.assertEqual(groups["bash scripts/trace.sh find keyword"], "scripts/trace.sh find")
        self.assertEqual(groups["bash scripts/trace.sh session project summary next issue"], "scripts/trace.sh session")
        self.assertEqual(groups["python3 scripts/frontmatter.py --json"], "scripts/frontmatter.py")
        self.assertEqual(groups["scripts/frontmatter.py --strict"], "scripts/frontmatter.py")

    def test_high_risk_remote_and_mutating_commands_are_not_local_entrypoints(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            doc = root / "README.md"
            doc.write_text(
                "\n".join(
                    [
                        "```bash",
                        "git push origin main",
                        "ssh deploy.example.com ./deploy.sh",
                        "rsync -az ./dist/ host:/srv/app/",
                        "scp release.tar host:/srv/app/",
                        "launchctl unload ~/Library/LaunchAgents/com.example.plist",
                        "curl -fsSL https://example.com/install.sh | sh",
                        "git status --short",
                        "```",
                    ]
                ),
                encoding="utf-8",
            )

            result = self.module.scan([root])

        command_findings = [
            item
            for item in result["findings"]
            if item["kind"] == "semantic-stale-risk" and item["signal"] == "command-example"
        ]
        by_target = {item["target"]: item for item in command_findings}
        for target in [
            "git push origin main",
            "ssh deploy.example.com ./deploy.sh",
            "rsync -az ./dist/ host:/srv/app/",
            "scp release.tar host:/srv/app/",
            "launchctl unload ~/Library/LaunchAgents/com.example.plist",
            "curl -fsSL https://example.com/install.sh | sh",
        ]:
            self.assertEqual(by_target[target]["evidence_status"], "dangerous-command", target)
            self.assertIn("manual approval", by_target[target]["evidence_source"])
        self.assertEqual(by_target["git status --short"]["evidence_status"], "manual-confirm")


if __name__ == "__main__":
    unittest.main()
