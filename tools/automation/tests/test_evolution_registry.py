from __future__ import annotations

import importlib.util
import shutil
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path("/Users/yumei/tools/automation/scripts/evolution-registry.py")


def _load_module():
    if str(SCRIPT.parent) not in sys.path:
        sys.path.insert(0, str(SCRIPT.parent))
    spec = importlib.util.spec_from_file_location("evolution_registry_test_module", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class EvolutionRegistryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = _load_module()

    def test_validate_accepts_minimal_registry(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            skills = root / "skills"
            docs = root / "docs"
            project = root / "project"
            skills.mkdir()
            docs.mkdir()
            project.mkdir()
            registry = {
                "schemaVersion": "evolution-registry-1.0",
                "updatedAt": "2026-05-08",
                "skillRoots": [
                    {
                        "id": "skills",
                        "path": str(skills),
                        "role": "canonical-active",
                        "writePolicy": "review-first",
                    }
                ],
                "documentSurfaces": [
                    {
                        "id": "docs",
                        "source": str(docs),
                        "mirrors": [],
                        "role": "docs",
                    }
                ],
                "mirrorPairs": [
                    {
                        "id": "docs-mirror",
                        "source": str(docs),
                        "mirror": str(docs),
                        "status": "active",
                        "relationship": "mirror",
                        "sourceOfTruth": "project",
                        "direction": "project-to-obsidian",
                        "privacyGate": "required-before-publish",
                        "conflictPolicy": "project-wins-unless-human-promotes-obsidian-note",
                    }
                ],
                "projects": [
                    {
                        "id": "project",
                        "path": str(project),
                        "validationCommands": ["python3 -m unittest"],
                    }
                ],
                "backupPolicy": {
                    "id": "project-source-restore-rehearsal",
                    "cadence": "before-push-and-weekly-local",
                    "retention": "keep-last-7-local-evidence-reports",
                    "backupScope": "classified-source-plus-local-runtime-evidence-manifest",
                    "restoreTarget": "source-only",
                    "runtimeLane": "separate-local-evidence-only",
                    "approvalRequiredFor": [
                        "backup-write",
                        "restore-write",
                        "git-mutation",
                        "push",
                        "pr",
                        "remote-mutation",
                        "obsidian-write",
                        "destructive-cleanup",
                    ],
                    "verificationCommands": [
                        "python3 scripts/automationctl manifest --check",
                        "python3 scripts/restore-rehearsal-policy.py",
                    ],
                },
                "scannerRouting": [
                    {
                        "scanner": "doc-drift-auditor",
                        "priorities": {"P1": "review-first"},
                    }
                ],
                "applyPolicy": {"doc-drift-auditor": {"autoSafeKinds": ["missing-absolute-path"]}},
            }

            result = self.module.validate_registry(registry)
            self.assertTrue(result["ok"], result)
            self.assertEqual(result["counts"]["documentSurfaces"], 1)
            self.assertEqual(result["counts"]["mirrorPairs"], 1)
            self.assertEqual(result["counts"]["backupPolicy"], 1)
            self.assertEqual(self.module.summarize_registry(registry)["warningCount"], 0)

    def test_validate_rejects_duplicate_skill_root_ids(self) -> None:
        registry = {
            "schemaVersion": "evolution-registry-1.0",
            "updatedAt": "2026-05-08",
            "skillRoots": [
                {"id": "skills", "path": "/missing/a", "role": "canonical-active", "writePolicy": "review-first"},
                {"id": "skills", "path": "/missing/b", "role": "archive", "writePolicy": "approval-required"},
            ],
            "documentSurfaces": [],
            "mirrorPairs": [],
            "projects": [],
            "backupPolicy": {},
            "scannerRouting": [],
            "applyPolicy": {},
        }

        result = self.module.validate_registry(registry)
        self.assertFalse(result["ok"])
        self.assertIn("duplicate ids", "\n".join(result["errors"]))

    def test_proposed_mirror_may_be_missing_but_active_mirror_must_exist(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source.md"
            source.write_text("source", encoding="utf-8")
            registry = {
                "schemaVersion": "evolution-registry-1.0",
                "updatedAt": "2026-05-08",
                "skillRoots": [],
                "documentSurfaces": [],
                "mirrorPairs": [
                    {
                        "id": "proposed",
                        "source": str(source),
                        "mirror": str(root / "missing-proposed.md"),
                        "status": "proposed",
                        "relationship": "mirror",
                        "sourceOfTruth": "project",
                        "direction": "project-to-obsidian",
                        "privacyGate": "required-before-publish",
                        "conflictPolicy": "project-wins-unless-human-promotes-obsidian-note",
                    },
                    {
                        "id": "active",
                        "source": str(source),
                        "mirror": str(root / "missing-active.md"),
                        "status": "active",
                        "relationship": "mirror",
                        "sourceOfTruth": "project",
                        "direction": "project-to-obsidian",
                        "privacyGate": "required-before-publish",
                        "conflictPolicy": "project-wins-unless-human-promotes-obsidian-note",
                    },
                ],
                "projects": [],
                "backupPolicy": {},
                "scannerRouting": [],
                "applyPolicy": {},
            }

            result = self.module.validate_registry(registry)
            self.assertFalse(result["ok"])
            self.assertIn("active mirror pair target missing", "\n".join(result["errors"]))
            self.assertIn("proposed mirror target not created yet", "\n".join(result["warnings"]))

    def _base_mirror_registry(self) -> dict:
        root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, root)
        source = root / "source.md"
        mirror = root / "mirror.md"
        source.write_text("source", encoding="utf-8")
        mirror.write_text("mirror", encoding="utf-8")
        return {
            "schemaVersion": "evolution-registry-1.0",
            "updatedAt": "2026-05-08",
            "skillRoots": [],
            "documentSurfaces": [],
            "mirrorPairs": [
                {
                    "id": "mirror",
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
            "projects": [],
            "backupPolicy": {},
            "scannerRouting": [],
            "applyPolicy": {},
        }

    def test_mirror_pair_rejects_missing_source(self) -> None:
        registry = self._base_mirror_registry()
        registry["mirrorPairs"][0].pop("source")

        result = self.module.validate_registry(registry)

        self.assertFalse(result["ok"])
        self.assertIn("needs source", "\n".join(result["errors"]))

    def test_mirror_pair_rejects_invalid_direction(self) -> None:
        registry = self._base_mirror_registry()
        registry["mirrorPairs"][0]["direction"] = "bidirectional-sync"

        result = self.module.validate_registry(registry)

        self.assertFalse(result["ok"])
        self.assertIn("unknown direction", "\n".join(result["errors"]))

    def test_mirror_pair_requires_privacy_gate(self) -> None:
        registry = self._base_mirror_registry()
        registry["mirrorPairs"][0].pop("privacyGate")

        result = self.module.validate_registry(registry)

        self.assertFalse(result["ok"])
        self.assertIn("needs privacyGate", "\n".join(result["errors"]))

    def test_mirror_pair_requires_conflict_policy(self) -> None:
        registry = self._base_mirror_registry()
        registry["mirrorPairs"][0].pop("conflictPolicy")

        result = self.module.validate_registry(registry)

        self.assertFalse(result["ok"])
        self.assertIn("needs conflictPolicy", "\n".join(result["errors"]))

    def test_summary_exposes_mirror_policy_fields(self) -> None:
        registry = self._base_mirror_registry()

        summary = self.module.summarize_registry(registry)
        mirror = summary["mirrorPairs"][0]

        self.assertEqual(mirror["sourceOfTruth"], "project")
        self.assertEqual(mirror["direction"], "project-to-obsidian")
        self.assertEqual(mirror["privacyGate"], "required-before-publish")
        self.assertEqual(mirror["conflictPolicy"], "project-wins-unless-human-promotes-obsidian-note")

    def test_backup_policy_requires_cadence_retention_scope_and_approval(self) -> None:
        registry = self._base_mirror_registry()
        registry["backupPolicy"] = {
            "id": "policy",
            "cadence": "before-push-and-weekly-local",
            "retention": "keep-last-7-local-evidence-reports",
            "backupScope": "classified-source-plus-local-runtime-evidence-manifest",
            "restoreTarget": "source-only",
            "runtimeLane": "separate-local-evidence-only",
            "approvalRequiredFor": [
                "backup-write",
                "restore-write",
                "git-mutation",
                "push",
                "pr",
                "remote-mutation",
                "obsidian-write",
                "destructive-cleanup",
            ],
            "verificationCommands": [
                "python3 scripts/automationctl manifest --check",
                "python3 scripts/restore-rehearsal-policy.py",
            ],
        }

        result = self.module.validate_registry(registry)
        summary = self.module.summarize_registry(registry)

        self.assertTrue(result["ok"], result)
        self.assertEqual(summary["backupPolicy"]["restoreTarget"], "source-only")
        self.assertEqual(summary["backupPolicy"]["runtimeLane"], "separate-local-evidence-only")

    def test_backup_policy_rejects_missing_retention(self) -> None:
        registry = self._base_mirror_registry()
        registry["backupPolicy"] = {
            "id": "policy",
            "cadence": "before-push-and-weekly-local",
            "backupScope": "classified-source-plus-local-runtime-evidence-manifest",
            "restoreTarget": "source-only",
            "runtimeLane": "separate-local-evidence-only",
            "approvalRequiredFor": ["backup-write"],
            "verificationCommands": ["python3 scripts/restore-rehearsal-policy.py"],
        }

        result = self.module.validate_registry(registry)

        self.assertFalse(result["ok"])
        self.assertIn("backupPolicy needs retention", "\n".join(result["errors"]))

    def test_project_registry_classifies_core_document_surfaces(self) -> None:
        registry = self.module.load_registry(Path("/Users/yumei/tools/automation/workspace-guides/evolution-registry.json"))
        surfaces = {
            item.get("source"): item
            for item in registry.get("documentSurfaces", [])
            if isinstance(item, dict)
        }

        expected = {
            "/Users/yumei/tools/automation/AGENTS.md": ("tools-automation-agents", "source-policy"),
            "/Users/yumei/tools/automation/PLANS.md": ("tools-automation-plans", "project-plans"),
            "/Users/yumei/tools/automation/PROJECT_PROGRESS.md": ("tools-automation-progress", "project-progress"),
            "/Users/yumei/tools/automation/README.md": ("tools-automation-readme", "public-facing-local-doc"),
        }
        for source, (surface_id, role) in expected.items():
            self.assertIn(source, surfaces)
            self.assertEqual(surfaces[source].get("id"), surface_id)
            self.assertEqual(surfaces[source].get("role"), role)
            self.assertEqual(surfaces[source].get("scanner"), "doc-drift-auditor")


if __name__ == "__main__":
    unittest.main()
