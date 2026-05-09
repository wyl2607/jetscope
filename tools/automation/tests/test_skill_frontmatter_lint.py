from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path("/Users/yumei/tools/automation/scripts/skill-frontmatter-lint.py")


def _load_module():
    spec = importlib.util.spec_from_file_location("skill_frontmatter_lint_test_module", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class SkillFrontmatterLintTests(unittest.TestCase):
    def _skill(self, root: Path, rel: str, body: str) -> Path:
        path = root / rel / "SKILL.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding="utf-8")
        return path

    def test_block_scalar_description_with_content_is_valid(self) -> None:
        module = _load_module()
        with tempfile.TemporaryDirectory() as tmpdir:
            path = self._skill(
                Path(tmpdir),
                "valid-skill",
                """---
name: valid-skill
description: >
  Use when a deterministic validator needs to check
  multi-line descriptions without false positives.
chains:
  - feature-pr@step1
---

# Valid Skill
""",
            )

            self.assertEqual(module.lint_skill_file(path), [])

    def test_empty_block_scalar_description_fails(self) -> None:
        module = _load_module()
        with tempfile.TemporaryDirectory() as tmpdir:
            path = self._skill(
                Path(tmpdir),
                "empty-description",
                """---
name: empty-description
description: >
chains:
  - feature-pr@step1
---

# Empty Description
""",
            )

            errors = module.lint_skill_file(path)

        self.assertIn("missing_description", {error["code"] for error in errors})

    def test_missing_name_fails(self) -> None:
        module = _load_module()
        with tempfile.TemporaryDirectory() as tmpdir:
            path = self._skill(
                Path(tmpdir),
                "missing-name",
                """---
description: Use when a skill has no name.
---

# Missing Name
""",
            )

            errors = module.lint_skill_file(path)

        self.assertIn("missing_name", {error["code"] for error in errors})

    def test_scalar_chains_field_fails(self) -> None:
        module = _load_module()
        with tempfile.TemporaryDirectory() as tmpdir:
            path = self._skill(
                Path(tmpdir),
                "bad-chains",
                """---
name: bad-chains
description: Use when a skill has malformed chains metadata.
chains: feature-pr@step1
---

# Bad Chains
""",
            )

            errors = module.lint_skill_file(path)

        self.assertIn("invalid_chains", {error["code"] for error in errors})

    def test_inline_empty_chains_list_is_valid(self) -> None:
        module = _load_module()
        with tempfile.TemporaryDirectory() as tmpdir:
            path = self._skill(
                Path(tmpdir),
                "inline-chains",
                """---
name: inline-chains
description: Use when a skill intentionally has no chain bindings.
chains: []
---

# Inline Chains
""",
            )

            self.assertEqual(module.lint_skill_file(path), [])

    def test_archives_are_skipped_by_default(self) -> None:
        module = _load_module()
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self._skill(
                root,
                "_archive/old-skill",
                """# Historical note without frontmatter
""",
            )

            findings = module.lint_roots([root])

        self.assertEqual(findings, [])


if __name__ == "__main__":
    unittest.main()
