from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT = Path("/Users/yumei/tools/automation/scripts/skill-dedupe-approval-packet.py")


def _load_module():
    if str(SCRIPT.parent) not in sys.path:
        sys.path.insert(0, str(SCRIPT.parent))
    spec = importlib.util.spec_from_file_location("skill_dedupe_approval_packet_test_module", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class SkillDedupeApprovalPacketTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = _load_module()

    def test_packet_keeps_phase_c_closed_and_separates_archives(self) -> None:
        plan = {
            "summary": {"byte_identical_groups": 1, "requires_manual_merge": 1, "skipped_path_aliases": 2},
            "rollback_tarball_target": "/tmp/rollback.tar.gz",
            "validation_for_phase_c": ["revalidate hashes"],
            "actions": [
                {
                    "skill": "alpha",
                    "keep": {"path": "/Users/yumei/.agents/skills/alpha/SKILL.md", "verify_sha256": "abc"},
                    "duplicates": [
                        {
                            "from": "/Users/yumei/.agents/skills/beta/SKILL.md",
                            "to": "/Users/yumei/.agents/skills/alpha/SKILL.md",
                            "verify_sha256": "abc",
                        },
                        {
                            "from": "/Users/yumei/.agents/skills/_archive/alpha/SKILL.md",
                            "to": "/Users/yumei/.agents/skills/alpha/SKILL.md",
                            "verify_sha256": "abc",
                        },
                    ],
                }
            ],
            "requires_manual_merge": [{"skill": "drift"}],
        }

        packet = self.module.build_packet(plan, Path("/tmp/plan.json"))
        self.assertFalse(packet["phase_c_allowed"])
        self.assertEqual(packet["summary"]["proposed_symlinks"], 2)
        self.assertEqual(packet["summary"]["non_archive_proposed_symlinks"], 1)
        self.assertEqual(packet["summary"]["archive_proposed_symlinks"], 1)
        self.assertEqual(packet["rollback"]["tarball_target"], "/tmp/rollback.tar.gz")
        self.assertEqual(packet["allowed_after_approval"]["required_preflight"], ["revalidate hashes"])
        self.assertEqual(packet["blocked_without_separate_approval"]["manual_merge_groups"], [{"skill": "drift"}])

    def test_markdown_packet_is_human_readable_and_execution_closed(self) -> None:
        packet = {
            "generated_at": "2026-05-08T00:00:00Z",
            "phase_c_allowed": False,
            "plan_source": "/tmp/plan.json",
            "summary": {
                "byte_identical_groups": 1,
                "proposed_symlinks": 2,
                "non_archive_proposed_symlinks": 1,
                "archive_proposed_symlinks": 1,
                "requires_manual_merge": 1,
                "skipped_path_aliases": 2,
            },
            "rollback": {
                "tarball_target": "/tmp/rollback.tar.gz",
                "command_template": "tar -czf <tarball_target> <approved source roots/files>",
                "candidate_paths": [
                    "/Users/yumei/.agents/skills/beta/SKILL.md",
                    "/Users/yumei/.agents/skills/_archive/alpha/SKILL.md",
                ],
                "rule": "Create rollback tarball before mutation.",
            },
            "allowed_after_approval": {
                "byte_identical_symlink_candidates": [
                    {
                        "skill": "alpha",
                        "from": "/Users/yumei/.agents/skills/beta/SKILL.md",
                        "to": "/Users/yumei/.agents/skills/alpha/SKILL.md",
                        "archive_path": False,
                    },
                    {
                        "skill": "alpha",
                        "from": "/Users/yumei/.agents/skills/_archive/alpha/SKILL.md",
                        "to": "/Users/yumei/.agents/skills/alpha/SKILL.md",
                        "archive_path": True,
                    },
                ],
                "required_preflight": ["revalidate hashes"],
            },
            "blocked_without_separate_approval": {
                "archive_paths": [
                    {
                        "skill": "alpha",
                        "from": "/Users/yumei/.agents/skills/_archive/alpha/SKILL.md",
                        "to": "/Users/yumei/.agents/skills/alpha/SKILL.md",
                    }
                ],
                "manual_merge_groups": [{"skill": "drift"}],
                "rules": ["Do not mutate archive paths."],
            },
            "approval_questions": ["Approve non-archive byte-identical symlink candidates only?"],
        }

        markdown = self.module.render_markdown(packet)

        self.assertIn("Phase C execution is closed", markdown)
        self.assertIn("Non-archive candidates", markdown)
        self.assertIn("Archive candidates blocked", markdown)
        self.assertIn("/tmp/rollback.tar.gz", markdown)


if __name__ == "__main__":
    unittest.main()
