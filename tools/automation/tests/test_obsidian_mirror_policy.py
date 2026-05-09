from __future__ import annotations

import unittest
from pathlib import Path


POLICY = Path(__file__).resolve().parent.parent / "workspace-guides/obsidian-mirror-policy.md"


class ObsidianMirrorPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.text = POLICY.read_text(encoding="utf-8")

    def test_policy_keeps_git_as_canonical_truth(self) -> None:
        self.assertIn("Git-tracked project files remain the canonical truth.", self.text)
        self.assertIn("Obsidian must not become a second independent source of truth", self.text)
        self.assertIn("This is not a new sync platform.", self.text)

    def test_policy_names_current_registered_pairs(self) -> None:
        self.assertIn("workspace-project-index-derived", self.text)
        self.assertIn("tools-automation-progress-obsidian-mirror", self.text)
        self.assertIn("do-not-merge-derived-output-back", self.text)

    def test_policy_blocks_runtime_and_unapproved_sync(self) -> None:
        self.assertIn("`runtime/**` | Never mirror by default", self.text)
        self.assertIn("create, overwrite, or sync an Obsidian mirror target", self.text)
        self.assertIn("no automatic reverse merge", self.text)
        self.assertIn("drift is review-first until intentionally synchronized from source", self.text)

    def test_policy_requires_existing_validation_gates(self) -> None:
        self.assertIn("python3 /Users/yumei/tools/automation/scripts/mirror-drift-scan.py", self.text)
        self.assertIn("scripts/automationctl manifest --check", self.text)
        self.assertIn("proposed missing mirrors are non-blocking but must include an approval packet", self.text)


if __name__ == "__main__":
    unittest.main()
