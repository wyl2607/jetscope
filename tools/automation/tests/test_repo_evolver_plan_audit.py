from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path("/Users/yumei/tools/automation/scripts/repo-evolver-plan-audit.py")


def _load_module():
    if str(SCRIPT.parent) not in sys.path:
        sys.path.insert(0, str(SCRIPT.parent))
    spec = importlib.util.spec_from_file_location("repo_evolver_plan_audit_test_module", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


PLAN_TEXT = """# tools/automation repo-evolver architecture plan

## 定位

- 这不是从零新建平台。
- 这份计划只讨论如何在 `tools/automation` 内复用现有系统。

## Current State

- `PROJECT_PROGRESS.md`
- `README.md`
- `workspace-guides/automation-source-runtime-classification.md`
- `workspace-guides/automation-project-split-decision.md`
- `runtime/self-evolution/daily-evolution-2026-05-08.json`
- `runtime/self-evolution/daily-evolution-2026-05-08-task-packets.json`

## Target Architecture

### 五条主线

1. Maintenance audit and continuous refactor queue
2. Documentation fact verification and stale-claim review
3. Agent skill lifecycle governance
4. Obsidian mirror policy with Git as canonical truth
5. Git backup, source manifest, runtime ignore, and restore governance

## Phase Plan

### Phase 0: Preserve boundary and inventory what exists
### Phase 1: Normalize architecture plan, manifests, and doc metadata
### Phase 2: Strengthen doc-drift and skill-drift as review-first workflows
### Phase 3: Add Obsidian mirror governance without a second source of truth
### Phase 4: Add Git backup and restore rehearsal policy
### Phase 5: Reconsider repo/package split only after the above is stable

## Execution Handoff

Codex CLI 执行 tight task packets。Claude 保留架构审查与最终验收。

## Public Interface

以下内容仅作为 proposal，不是已实现能力：`.evolver/`、`agent-skills/`、Obsidian mirror manifest、source/runtime publication manifest。

## Safety Rules

不做 push、PR、remote mutation、VPS mutation、Windows mutation、sync、deploy、install、uninstall。不得读取 secret。runtime 只是本地证据。

## Acceptance Criteria

- `plan.md` 明确写出这不是新平台，而是复用 `tools/automation` 现有系统。
- `plan.md` 准确引用并描述了 Current State 中列出的本地证据路径。
- `plan.md` 清楚定义了五条主线和六个阶段，没有把未来 proposal 写成已完成工作。
- `plan.md` 明确了执行分工：Codex CLI 负责 tight task packets，Claude 负责架构审查与验收。
- `plan.md` 明确了 Git canonical truth、Obsidian mirror 只是镜像、runtime 只是本地证据。
"""


class RepoEvolverPlanAuditTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = _load_module()

    def write_json(self, root: Path, name: str, payload: dict) -> Path:
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def write_fixture(self, root: Path, *, queue_count: int = 0, proposed_mirror: bool = False, inventory_complete: bool = True) -> dict[str, Path]:
        plan = root / "plan.md"
        plan.write_text(PLAN_TEXT, encoding="utf-8")
        entries = [
            {"path": "README.md", "classification": "source"},
            {"path": "runtime/task-board/source-runtime-manifest.json", "classification": "local-only-runtime"},
            {"path": "workspace-guides/windows-opencode-handoff.md", "classification": "source"},
            {"path": ".agents/skills/tdd/SKILL.md", "classification": "source"},
        ]
        if not inventory_complete:
            entries = [item for item in entries if "handoff" not in item["path"]]
        manifest = self.write_json(
            root,
            "manifest.json",
            {
                "summary": {
                    "source_candidate_count": 4,
                    "excluded_by_default_count": 2,
                    "high_risk_count": 1,
                    "unclassified_count": 0,
                    "by_classification": {
                        "source": 4,
                        "local-only-runtime": 2,
                        "generated-local-artifact": 1,
                    },
                },
                "entries": entries,
                "high_risk": [{"path": "scripts/parallel-sync.sh"}],
            },
        )
        daily = self.write_json(root, "daily.json", {"queue": [{"id": str(i)} for i in range(queue_count)]})
        packets = self.write_json(root, "packets.json", {"task_packets": [{"id": str(i)} for i in range(queue_count)]})
        findings = [
            {
                "kind": "derived-index-registered",
                "status": "active",
                "source_of_truth": "project",
            }
        ]
        if proposed_mirror:
            findings.append(
                {
                    "kind": "proposed-mirror-target-missing",
                    "pair_id": "proposed",
                    "status": "proposed",
                    "approval_required": True,
                    "source_of_truth": "project",
                }
            )
        mirror = self.write_json(
            root,
            "mirror.json",
            {
                "ok": True,
                "summary": {"blocking_count": 0, "drift_count": 0},
                "findings": findings,
            },
        )
        mirror_pairs = [
            {"id": "active", "status": "active", "sourceOfTruth": "project"},
        ]
        if proposed_mirror:
            mirror_pairs.append({"id": "proposed", "status": "proposed", "sourceOfTruth": "project"})
        registry = self.write_json(
            root,
            "registry.json",
            {
                "safety": {
                    "forbiddenWithoutApproval": [
                        "push",
                        "pr",
                        "deploy",
                        "remote-mutation",
                        "secret-access",
                        "destructive-cleanup",
                        "broad-sync",
                    ]
                },
                "skillRoots": [{"id": "agents-skills"}],
                "documentSurfaces": [{"id": "readme"}],
                "mirrorPairs": mirror_pairs,
                "backupPolicy": {"id": "backup"},
                "scannerRouting": [
                    {"scanner": "doc-drift-auditor"},
                    {"scanner": "skill-drift-auditor"},
                ],
                "projects": [{"lanes": ["daily-queue"]}],
            },
        )
        restore = self.write_json(root, "restore.json", {"ok": True})
        control = self.write_json(root, "control.json", {"summary": {"hard_gate_failed_count": 0}})
        return {
            "plan": plan,
            "manifest": manifest,
            "daily": daily,
            "packets": packets,
            "mirror": mirror,
            "registry": registry,
            "restore": restore,
            "control": control,
        }

    def build_report(self, paths: dict[str, Path]) -> dict:
        return self.module.build_report(
            plan_path=paths["plan"],
            manifest_path=paths["manifest"],
            daily_report_path=paths["daily"],
            task_packets_path=paths["packets"],
            mirror_path=paths["mirror"],
            registry_path=paths["registry"],
            restore_path=paths["restore"],
            control_path=paths["control"],
        )

    def test_happy_path_all_required_items_pass(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            report = self.build_report(self.write_fixture(Path(tmp)))

        self.assertTrue(report["ok"])
        self.assertEqual(report["gaps"], [])
        self.assertEqual(report["split_readiness"]["decision"], "ready-for-human-review")
        self.assertFalse(report["split_readiness"]["split_allowed"])
        self.assertIn("explicit user approval", report["split_readiness"]["reasons"])
        checklist = {item["id"]: item for item in report["checklist"]}
        required_ids = {
            "mainline-1-maintenance-audit-queue",
            "mainline-2-doc-fact-verification",
            "mainline-3-skill-lifecycle-governance",
            "mainline-4-obsidian-mirror-policy",
            "mainline-5-backup-restore-governance",
            "phase-0-inventory",
            "phase-1-architecture-manifests-metadata",
            "phase-2-doc-skill-review-first",
            "phase-3-obsidian-mirror-governance",
            "phase-4-backup-restore-policy",
            "phase-5-stability-before-split",
            "execution-handoff",
            "public-interface",
            "safety-rules",
            "acceptance-criteria-1",
            "acceptance-criteria-2",
            "acceptance-criteria-3",
            "acceptance-criteria-4",
            "acceptance-criteria-5",
        }
        self.assertEqual(set(checklist), required_ids)
        self.assertTrue(all(item["status"] == "pass" for item in checklist.values()))
        markdown = self.module.render_markdown(report)
        self.assertIn("## Split Readiness", markdown)
        self.assertIn("- decision: `ready-for-human-review`", markdown)
        self.assertIn("- split allowed: `false`", markdown)
        self.assertIn("## Checklist", markdown)
        self.assertIn("## Gaps", markdown)
        self.assertIn("- none", markdown)

    def test_inventory_missing_category_is_weak_and_blocks_ok(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            report = self.build_report(self.write_fixture(Path(tmp), inventory_complete=False))

        self.assertFalse(report["ok"])
        checklist = {item["id"]: item for item in report["checklist"]}
        self.assertEqual(checklist["phase-0-inventory"]["status"], "weak")
        self.assertIn("handoff-files", checklist["phase-0-inventory"]["note"])
        gaps = {item["id"]: item for item in report["gaps"]}
        self.assertIn("phase-0-inventory", gaps)

    def test_phase5_open_queue_and_proposed_mirror_defer_split_without_blocking_plan_coverage(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            report = self.build_report(self.write_fixture(Path(tmp), queue_count=2, proposed_mirror=True))

        self.assertTrue(report["ok"])
        self.assertEqual(report["gaps"], [])
        readiness = report["split_readiness"]
        self.assertEqual(readiness["decision"], "defer")
        self.assertFalse(readiness["split_allowed"])
        self.assertIn("open_queue=2", readiness["reasons"])
        self.assertIn("proposed_mirror_count=1", readiness["reasons"])
        self.assertEqual(len(readiness["approval_required"]), 1)
        self.assertEqual(readiness["approval_required"][0]["pair_id"], "proposed")
        checklist = {item["id"]: item for item in report["checklist"]}
        self.assertEqual(checklist["phase-5-stability-before-split"]["status"], "deferred")
        self.assertIn("open_queue=2", checklist["phase-5-stability-before-split"]["note"])
        self.assertIn("proposed_mirror_count=1", checklist["phase-5-stability-before-split"]["note"])
        self.assertEqual(checklist["phase-3-obsidian-mirror-governance"]["status"], "approval_required")
        gaps = {item["id"]: item for item in report["gaps"]}
        self.assertNotIn("phase-5-stability-before-split", gaps)
        markdown = self.module.render_markdown(report)
        self.assertIn("- decision: `defer`", markdown)
        self.assertIn("- approval required: `proposed`", markdown)


if __name__ == "__main__":
    unittest.main()
