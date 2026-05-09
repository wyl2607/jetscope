import importlib.util
import json
import tempfile
import textwrap
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "next-action-recommender.py"
SPEC = importlib.util.spec_from_file_location("next_action_recommender", MODULE_PATH)
next_action = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(next_action)


class NextActionRecommenderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.packet_path = self.root / "runtime" / "self-evolution" / "task-packets.json"
        self.packet_path.parent.mkdir(parents=True)
        self.unresolved_doc = self.root / "docs" / "unresolved.md"
        self.resolved_doc = self.root / "docs" / "resolved.md"
        self.unresolved_doc.parent.mkdir(parents=True)
        self.unresolved_doc.write_text("still stale\n", encoding="utf-8")
        self.resolved_doc.write_text("clean now\n", encoding="utf-8")

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def write_json(self, rel: str, payload: object) -> None:
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload), encoding="utf-8")

    def write_base_runtime(self, packets: list[dict]) -> None:
        self.packet_path.write_text(json.dumps({"task_packets": packets}), encoding="utf-8")
        self.write_json("runtime/dev-control/state.json", {"tasks": []})
        self.write_json("runtime/task-board/enriched-board.json", {"tasks": []})
        self.write_json(
            "runtime/task-board/daily-approval-inbox.json",
            {"artifacts": {"daily_evolution_task_packets": str(self.packet_path)}, "decisions_today": {}},
        )
        self.write_json("runtime/task-board/auto-dry-run-plan.json", {"candidates": []})
        self.write_json("runtime/task-board/triage-recommendations.json", {"recommendations": []})
        self.write_json("runtime/multi-agent/quarantine.json", {"quarantine": []})
        self.write_json("runtime/multi-agent/dedup-cooldown.json", {"suggestions": []})
        self.write_json("runtime/task-board/execute-local-gate.json", {"candidates": []})
        self.write_json("runtime/multi-agent/budget-state.json", {"paused": False})

    def write_scanner(self, findings: list[dict]) -> Path:
        scanner = self.root / "fake_scan_doc_drift.py"
        scanner.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env python3
                import json
                import sys
                if "--query" in sys.argv:
                    raise SystemExit(99)
                print(json.dumps({{"scanner": "doc-drift-auditor", "findings": {json.dumps(findings)}}}))
                """
            ),
            encoding="utf-8",
        )
        scanner.chmod(0o755)
        return scanner

    def packet(self, path: Path, target: str = "stale target") -> dict:
        return {
            "scanner": "doc-drift-auditor",
            "kind": "semantic-stale-risk-group",
            "priority": "P1",
            "path": str(path),
            "target": target,
            "semantic_type": "command-example",
            "mode": "review-first",
            "goal": f"Review {path.name}",
        }

    def test_unresolved_packet_is_recommended(self) -> None:
        packet = self.packet(self.unresolved_doc)
        self.write_base_runtime([packet])
        scanner = self.write_scanner(
            [
                {
                    "kind": "semantic-stale-risk",
                    "semantic_type": "command-example",
                    "path": str(self.unresolved_doc),
                    "target": "stale target",
                }
            ]
        )

        data = next_action.build(self.root, scanner_path=scanner)

        self.assertEqual(data["skipped_stale_count"], 0)
        self.assertEqual([item["task_id"] for item in data["recommendations"]], [next_action.packet_task_id(packet)])

    def test_resolved_packet_is_skipped(self) -> None:
        packet = self.packet(self.resolved_doc)
        self.write_base_runtime([packet])
        scanner = self.write_scanner([])

        data = next_action.build(self.root, scanner_path=scanner)

        self.assertEqual(data["recommendations"], [])
        self.assertEqual(data["skipped_stale_count"], 1)
        self.assertEqual(data["skipped_stale_packets"][0]["status"], "resolved")

    def test_missing_file_packet_is_marked_stale_or_removed(self) -> None:
        missing = self.root / "docs" / "missing.md"
        packet = self.packet(missing)
        self.write_base_runtime([packet])
        scanner = self.write_scanner([])

        data = next_action.build(self.root, scanner_path=scanner)

        self.assertEqual(data["recommendations"], [])
        self.assertEqual(data["skipped_stale_count"], 1)
        self.assertEqual(data["skipped_stale_packets"][0]["status"], "stale_or_removed")

    def test_full_scan_fallback_marks_mismatched_source_stale(self) -> None:
        packet = self.packet(self.unresolved_doc, target="old target")
        self.write_base_runtime([packet])
        scanner = self.write_scanner(
            [
                {
                    "kind": "semantic-stale-risk",
                    "semantic_type": "command-example",
                    "path": str(self.unresolved_doc),
                    "target": "new target",
                }
            ]
        )

        data = next_action.build(self.root, scanner_path=scanner)

        self.assertEqual(data["recommendations"], [])
        self.assertEqual(data["skipped_stale_count"], 1)
        self.assertEqual(data["skipped_stale_packets"][0]["status"], "stale")

    def test_output_includes_skipped_stale_count(self) -> None:
        self.write_base_runtime([])
        scanner = self.write_scanner([])

        data = next_action.build(self.root, scanner_path=scanner)

        self.assertIn("skipped_stale_count", data)
        self.assertIn("skipped_stale_packets", data)


if __name__ == "__main__":
    unittest.main()
