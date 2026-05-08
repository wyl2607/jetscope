from __future__ import annotations

import json
import re
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path("/Users/yumei/tools/automation")
DASHBOARD_DIR = Path("/Users/yumei/tools/automation/runtime/skill-chains/dashboard")


class SkillChainDashboardStaticUiTests(unittest.TestCase):
    def test_dashboard_defaults_to_chinese(self) -> None:
        app_js = (DASHBOARD_DIR / "app.js").read_text(encoding="utf-8")
        html = (DASHBOARD_DIR / "index.html").read_text(encoding="utf-8")

        self.assertIn('<html lang="zh">', html)
        self.assertIn('return localStorage.getItem("skillChainDashboardLang") || "zh";', app_js)

    def test_chain_chip_returns_to_overview_and_closes_skill_drawer(self) -> None:
        app_js = (DASHBOARD_DIR / "app.js").read_text(encoding="utf-8")
        match = re.search(r"function focusChain\(chainName\) \{(?P<body>.*?)\n  \}", app_js, re.S)
        self.assertIsNotNone(match)
        body = match.group("body")

        self.assertIn('selectedSkillId = "";', body)
        self.assertIn("skillDrawerOpen = false;", body)
        self.assertIn('currentView = "overview";', body)
        self.assertIn('url.searchParams.set("view", "overview");', body)
        self.assertIn('url.searchParams.delete("skill");', body)

    def test_navigation_buttons_expose_active_state_to_accessibility_tree(self) -> None:
        app_js = (DASHBOARD_DIR / "app.js").read_text(encoding="utf-8")

        self.assertIn('button.setAttribute("aria-pressed", active ? "true" : "false");', app_js)
        self.assertIn('button.setAttribute("aria-current", "page");', app_js)

    def test_chinese_labels_are_not_left_as_skill_library_english(self) -> None:
        i18n = json.loads((DASHBOARD_DIR / "i18n.json").read_text(encoding="utf-8"))
        zh = i18n["zh"]

        self.assertEqual(zh["viewSkills"], "技能库")
        self.assertEqual(zh["skillLibraryTitle"], "技能库")
        self.assertEqual(zh["searchSkills"], "搜索技能")
        self.assertEqual(zh["dedupeWatchTitle"], "去重观察期")

    def test_dashboard_data_exposes_skill_duplicate_metadata_gate(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            subprocess.run(
                [
                    "python3",
                    str(ROOT / "scripts/skill-library.py"),
                    "--once",
                    "--out",
                    str(out_dir),
                ],
                check=True,
                cwd=str(ROOT),
                stdout=subprocess.DEVNULL,
            )
            subprocess.run(
                [
                    "python3",
                    str(ROOT / "scripts/skill-chain-dashboard.py"),
                    "--once",
                    "--out",
                    str(out_dir),
                    "--skill-library",
                    str(out_dir / "skills.json"),
                ],
                check=True,
                cwd=str(ROOT),
                stdout=subprocess.DEVNULL,
            )
            data = json.loads((out_dir / "data.json").read_text(encoding="utf-8"))
        skill_library = data["skill_library"]
        summary = skill_library["summary"]
        metadata = skill_library["duplicate_metadata"]

        self.assertEqual(summary["active_drift_risk_names"], 0)
        self.assertTrue(skill_library["gate"]["active_drift_risk_clear"])
        self.assertIn("duplicate_kinds", metadata)
        self.assertIn("copy_roles", metadata)
        self.assertIn("active_drift_risk_names", metadata)
        self.assertIn("intentional_variant_names", metadata)
        self.assertIn("archive_noise_names", metadata)
        self.assertIn("alias_or_system_noise_names", metadata)
        self.assertEqual(metadata["active_drift_risk_names"], [])

    def test_dashboard_data_exposes_model_router_health(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            out_dir = root / "out"
            out_dir.mkdir()
            model_state = root / "ai-model-router-state.json"
            now = 1_800_000_000
            model_state.write_text(
                json.dumps(
                    {
                        "models": {
                            "opencode-go/deepseek-v4-pro": {
                                "last_seen": now - 10,
                                "last_success": now - 20,
                                "failure_count": 0,
                            },
                            "cmd/deepseek-v4-pro": {
                                "last_seen": now - 5,
                                "last_failure": now - 5,
                                "last_failure_reason": "timeout",
                                "failure_count": 1,
                                "cooldown_until": now + 600,
                            },
                            "gpt-5.5": {
                                "last_seen": now - 1,
                                "fatal": True,
                                "last_failure_reason": "unauthorized",
                                "failure_count": 2,
                            },
                        }
                    },
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )
            subprocess.run(
                [
                    "python3",
                    str(ROOT / "scripts/skill-chain-dashboard.py"),
                    "--once",
                    "--out",
                    str(out_dir),
                    "--model-router-state",
                    str(model_state),
                ],
                check=True,
                cwd=str(ROOT),
                stdout=subprocess.DEVNULL,
            )
            data = json.loads((out_dir / "data.json").read_text(encoding="utf-8"))

        router = data["model_router"]
        self.assertFalse(router["missing"])
        self.assertEqual(router["summary"]["models"], 3)
        self.assertEqual(router["summary"]["cooldown"], 1)
        self.assertEqual(router["summary"]["fatal"], 1)
        self.assertEqual(router["summary"]["last_success"], 1)
        self.assertEqual(router["models"][0]["model"], "cmd/deepseek-v4-pro")
        statuses = {item["model"]: item["status"] for item in router["models"]}
        self.assertEqual(statuses["opencode-go/deepseek-v4-pro"], "ready")
        self.assertEqual(statuses["cmd/deepseek-v4-pro"], "cooldown")
        self.assertEqual(statuses["gpt-5.5"], "fatal")

    def test_skill_library_ui_renders_duplicate_metadata_panel(self) -> None:
        app_js = (DASHBOARD_DIR / "app.js").read_text(encoding="utf-8")
        i18n = json.loads((DASHBOARD_DIR / "i18n.json").read_text(encoding="utf-8"))

        self.assertIn('"skill-drift"', app_js)
        self.assertIn("skillDriftGreen", app_js)
        self.assertIn("summary-risk", app_js)
        self.assertIn("function renderDuplicateMetadataPanel(library)", app_js)
        self.assertIn("metadata.duplicate_kinds", app_js)
        self.assertIn("metadata.copy_roles", app_js)
        self.assertIn("metadata.active_drift_risk_names", app_js)
        self.assertIn("metadata.intentional_variant_names", app_js)
        self.assertIn("metadata.archive_noise_names", app_js)
        self.assertIn("metadata.alias_or_system_noise_names", app_js)
        self.assertEqual(i18n["zh"]["skillDrift"], "技能漂移")
        self.assertEqual(i18n["zh"]["skillDriftGreen"], "绿色：无活跃重复漂移")
        self.assertEqual(i18n["zh"]["duplicateGovernance"], "重复治理")
        self.assertEqual(i18n["zh"]["activeDriftClear"], "活跃漂移已清零")

    def test_assistant_ui_renders_model_router_health_panel(self) -> None:
        app_js = (DASHBOARD_DIR / "app.js").read_text(encoding="utf-8")
        i18n = json.loads((DASHBOARD_DIR / "i18n.json").read_text(encoding="utf-8"))

        self.assertIn("function renderModelRouterHealth", app_js)
        self.assertIn("data && data.model_router", app_js)
        self.assertIn("summary.cooldown", app_js)
        self.assertIn("summary.fatal", app_js)
        self.assertIn("model-router-health", app_js)
        self.assertEqual(i18n["zh"]["modelRouterHealth"], "模型路由健康")
        self.assertEqual(i18n["zh"]["modelCooldown"], "冷却")
        self.assertEqual(i18n["zh"]["modelFatal"], "致命")

    def test_skill_library_renders_duplicate_metadata_panel(self) -> None:
        app_js = (DASHBOARD_DIR / "app.js").read_text(encoding="utf-8")
        i18n = json.loads((DASHBOARD_DIR / "i18n.json").read_text(encoding="utf-8"))

        self.assertIn("function renderDuplicateMetadataPanel", app_js)
        self.assertIn("duplicate_metadata", app_js)
        self.assertIn("active_drift_risk_clear", app_js)
        self.assertEqual(i18n["zh"]["duplicateGovernance"], "重复治理")
        self.assertEqual(i18n["zh"]["activeDriftClear"], "活跃漂移已清零")

    def test_repo_evolver_grid_has_readable_responsive_breakpoints(self) -> None:
        styles = (DASHBOARD_DIR / "styles.css").read_text(encoding="utf-8")

        self.assertIn(".repo-evolver-grid", styles)
        self.assertRegex(styles, r"@media\s*\(max-width:\s*1100px\)[\s\S]*?\.repo-evolver-grid\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)")
        self.assertRegex(styles, r"@media\s*\(max-width:\s*680px\)[\s\S]*?\.repo-evolver-grid\s*\{[^}]*grid-template-columns:\s*1fr")
        self.assertRegex(styles, r"\.repo-evolver-(?:trace|evidence|next)[\s\S]*?overflow-wrap:\s*anywhere")
        self.assertRegex(styles, r"\.repo-evolver-(?:trace|evidence|next)[\s\S]*?word-break:\s*break-word")


if __name__ == "__main__":
    unittest.main()
