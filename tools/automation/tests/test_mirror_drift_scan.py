from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path("/Users/yumei/tools/automation/scripts/mirror-drift-scan.py")


def _load_module():
    if str(SCRIPT.parent) not in sys.path:
        sys.path.insert(0, str(SCRIPT.parent))
    spec = importlib.util.spec_from_file_location("mirror_drift_scan_test_module", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class MirrorDriftScanTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = _load_module()

    def _registry(self, root: Path, pairs: list[dict]) -> Path:
        registry = root / "registry.json"
        registry.write_text(
            self.module.json.dumps(
                {
                    "schemaVersion": "evolution-registry-1.0",
                    "updatedAt": "2026-05-08",
                    "skillRoots": [],
                    "documentSurfaces": [],
                    "mirrorPairs": pairs,
                    "projects": [],
                    "scannerRouting": [],
                    "applyPolicy": {},
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        return registry

    def test_active_one_to_one_mirror_hash_drift_is_review_first(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source.md"
            mirror = root / "mirror.md"
            source.write_text("source\n", encoding="utf-8")
            mirror.write_text("mirror\n", encoding="utf-8")
            registry = self._registry(
                root,
                [
                    {
                        "id": "pair",
                        "source": str(source),
                        "mirror": str(mirror),
                        "status": "active",
                        "relationship": "mirror",
                        "sourceOfTruth": "project",
                        "direction": "project-to-obsidian",
                        "privacyGate": "required-before-publish",
                        "conflictPolicy": "project-wins-unless-human-promotes-obsidian-note",
                    }
                ],
            )

            report = self.module.scan_registry(registry)

        self.assertTrue(report["ok"])
        self.assertEqual(report["summary"]["drift_count"], 1)
        self.assertEqual(report["findings"][0]["kind"], "mirror-content-drift")
        self.assertEqual(report["findings"][0]["mode"], "review-first")

    def test_active_missing_mirror_is_blocking_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source.md"
            source.write_text("source\n", encoding="utf-8")
            registry = self._registry(
                root,
                [
                    {
                        "id": "pair",
                        "source": str(source),
                        "mirror": str(root / "missing.md"),
                        "status": "active",
                        "relationship": "mirror",
                        "sourceOfTruth": "project",
                        "direction": "project-to-obsidian",
                        "privacyGate": "required-before-publish",
                        "conflictPolicy": "project-wins-unless-human-promotes-obsidian-note",
                    }
                ],
            )

            report = self.module.scan_registry(registry)

        self.assertFalse(report["ok"])
        self.assertEqual(report["summary"]["blocking_count"], 1)
        self.assertIn("active-mirror-target-missing", {item["kind"] for item in report["findings"]})

    def test_proposed_missing_mirror_is_warning_only(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source.md"
            source.write_text("source\n", encoding="utf-8")
            registry = self._registry(
                root,
                [
                    {
                        "id": "pair",
                        "source": str(source),
                        "mirror": str(root / "missing.md"),
                        "status": "proposed",
                        "relationship": "mirror",
                        "sourceOfTruth": "project",
                        "direction": "project-to-obsidian",
                        "privacyGate": "required-before-publish",
                        "conflictPolicy": "project-wins-unless-human-promotes-obsidian-note",
                    }
                ],
            )

            report = self.module.scan_registry(registry)

        self.assertTrue(report["ok"])
        self.assertEqual(report["summary"]["warning_count"], 1)
        self.assertEqual(report["findings"][0]["kind"], "proposed-mirror-target-missing")
        self.assertEqual(report["findings"][0]["approval_required"], True)
        self.assertEqual(report["findings"][0]["source_of_truth"], "project")
        self.assertEqual(report["findings"][0]["privacy_gate"], "required-before-publish")
        self.assertEqual(report["findings"][0]["conflict_policy"], "project-wins-unless-human-promotes-obsidian-note")
        self.assertEqual(report["findings"][0]["next_action"], "request-human-approval-before-mirror-creation")

    def test_derived_index_requires_do_not_merge_back_policy(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source.md"
            mirror = root / "mirror.md"
            source.write_text("source\n", encoding="utf-8")
            mirror.write_text("derived\n", encoding="utf-8")
            registry = self._registry(
                root,
                [
                    {
                        "id": "pair",
                        "source": str(source),
                        "mirror": str(mirror),
                        "status": "active",
                        "relationship": "derived-index",
                        "sourceOfTruth": "project",
                        "direction": "project-to-obsidian-derived",
                        "privacyGate": "required-before-publish",
                        "conflictPolicy": "project-wins-unless-human-promotes-obsidian-note",
                    }
                ],
            )

            report = self.module.scan_registry(registry)

        self.assertFalse(report["ok"])
        self.assertIn("derived-index-policy-unsafe", {item["kind"] for item in report["findings"]})


if __name__ == "__main__":
    unittest.main()
