#!/usr/bin/env python3
"""Rules-only /next recommender for the Telegram control surface."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


_SCRIPT_DIR = Path(__file__).resolve().parent
AUTOMATION = _SCRIPT_DIR.parent
OUT_PATH = AUTOMATION / "runtime" / "multi-agent" / "next-recommender.json"
TERMINAL = {"completed", "cancelled", "failed"}
PRANK = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
KRANK = {"wait_for_user": 0, "manual_dry_run": 1, "execute_local_gate": 2, "review_first_packet": 3, "apply_triage": 4, "cancel_dedup": 5}
DOC_DRIFT_SCANNER = Path("/Users/yumei/.agents/skills/doc-drift-auditor/scripts/scan_doc_drift.py")


def read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        for key in ("tasks", "recommendations", "candidates", "items", "quarantine", "suggestions"):
            if isinstance(value.get(key), list):
                return value[key]
    return []


def task_id_of(item: Any) -> str:
    if isinstance(item, str):
        return item.strip()
    if isinstance(item, dict):
        for key in ("task_id", "cancel_task_id", "suggested_cancel", "id"):
            value = str(item.get(key) or "").strip()
            if value:
                return value
    return ""


def compact(value: Any, limit: int = 240) -> str:
    text = " ".join(str(value or "").split())
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)].rstrip() + "..."


def packet_task_id(packet: dict[str, Any]) -> str:
    key = "|".join(
        compact(item, 200)
        for item in (
            packet.get("scanner"),
            packet.get("kind"),
            packet.get("path"),
            packet.get("target"),
            packet.get("goal"),
        )
    )
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:12]
    return f"packet-{digest}"


def packet_rows(path: Path) -> list[dict[str, Any]]:
    payload = read_json(path, {})
    rows = payload.get("task_packets") if isinstance(payload, dict) else []
    return [row for row in rows if isinstance(row, dict)]


def normalize_kind(value: Any) -> str:
    text = str(value or "").strip()
    return text[:-6] if text.endswith("-group") else text


def finding_path(value: Any, root: Path) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    path = Path(text)
    if not path.is_absolute():
        path = root / path
    try:
        return str(path.resolve())
    except Exception:
        return str(path)


def load_doc_drift_findings(root: Path, scanner_path: Path = DOC_DRIFT_SCANNER) -> dict[str, list[dict[str, Any]]]:
    if not scanner_path.exists():
        return {}
    try:
        result = subprocess.run(
            ["python3", str(scanner_path), "--root", str(root)],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        payload = json.loads(result.stdout)
    except Exception:
        return {}
    by_path: dict[str, list[dict[str, Any]]] = {}
    for finding in payload.get("findings") or []:
        if not isinstance(finding, dict):
            continue
        path = finding_path(finding.get("path"), root)
        if path:
            by_path.setdefault(path, []).append(finding)
    return by_path


def packet_path(packet: dict[str, Any], root: Path) -> str:
    value = packet.get("path")
    if not value and isinstance(packet.get("task_packet"), dict):
        value = packet["task_packet"].get("path")
    return finding_path(value, root)


def packet_matches_finding(packet: dict[str, Any], finding: dict[str, Any]) -> bool:
    packet_kind = normalize_kind(packet.get("kind"))
    finding_kind = normalize_kind(finding.get("kind"))
    if packet_kind and finding_kind and packet_kind != finding_kind:
        return False
    packet_semantic = str(packet.get("semantic_type") or "").strip()
    finding_semantic = str(finding.get("semantic_type") or "").strip()
    if packet_semantic and finding_semantic and packet_semantic != finding_semantic:
        return False
    packet_line = packet.get("line")
    if packet_line not in (None, "") and str(packet_line) != str(finding.get("line")):
        return False
    packet_targets = {
        str(packet.get(key) or "").strip()
        for key in ("target", "command_group")
        if str(packet.get(key) or "").strip()
    }
    packet_targets.update(str(value or "").strip() for value in packet.get("sample_targets") or [] if str(value or "").strip())
    if not packet_targets:
        return True
    finding_targets = {
        str(finding.get(key) or "").strip()
        for key in ("target", "command_group")
        if str(finding.get(key) or "").strip()
    }
    return bool(packet_targets & finding_targets)


def stale_status(packet: dict[str, Any], root: Path, findings_by_path: dict[str, list[dict[str, Any]]]) -> str:
    if str(packet.get("scanner") or "") != "doc-drift-auditor":
        return ""
    path = packet_path(packet, root)
    if not path:
        return ""
    if not Path(path).exists():
        return "stale_or_removed"
    current = findings_by_path.get(path, [])
    if not current:
        return "resolved"
    if not any(packet_matches_finding(packet, finding) for finding in current):
        return "stale"
    return ""


def stale_packet_record(packet: dict[str, Any], task_id: str, status: str, root: Path) -> dict[str, Any]:
    return {
        "task_id": task_id,
        "status": status,
        "scanner": str(packet.get("scanner") or ""),
        "kind": str(packet.get("kind") or ""),
        "path": packet_path(packet, root),
        "target": str(packet.get("target") or packet.get("command_group") or ""),
    }


def id_set(items: list[Any]) -> set[str]:
    return {task_id_of(item) for item in items if task_id_of(item)}


def active_tasks(state: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out = {}
    for task in as_list(state.get("tasks")):
        task_id = task_id_of(task)
        status = str(task.get("status") or "") if isinstance(task, dict) else ""
        if isinstance(task, dict) and task_id and status and status not in TERMINAL:
            out[task_id] = task
    return out


def all_task_ids(state: dict[str, Any]) -> set[str]:
    return {task_id_of(task) for task in as_list(state.get("tasks")) if task_id_of(task)}


def by_task_id(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {task_id_of(item): item for item in as_list(payload.get("tasks")) if isinstance(item, dict) and task_id_of(item)}


def from_sources(task_id: str, field: str, default: Any, *sources: dict[str, dict[str, Any]]) -> Any:
    for source in sources:
        value = (source.get(task_id) or {}).get(field)
        if value not in (None, ""):
            return value
    return default


def priority(task_id: str, tasks: dict[str, Any], enriched: dict[str, Any]) -> str:
    return str(from_sources(task_id, "priority", "P3", tasks, enriched))


def value_score(item: dict[str, Any], task_id: str, enriched: dict[str, Any]) -> int:
    for source in (item, enriched.get(task_id) or {}):
        try:
            return int(source.get("value_score"))
        except Exception:
            pass
    return 0


def title(task_id: str, tasks: dict[str, Any], enriched: dict[str, Any]) -> str:
    for field in ("title", "goal"):
        value = from_sources(task_id, field, "", tasks, enriched)
        if value:
            return str(value)
    return task_id


def add_rec(recs: list[dict[str, Any]], seen: set[str], skip: set[str], rec: dict[str, Any]) -> None:
    task_id = task_id_of(rec)
    key = f"{rec.get('kind')}:{task_id}"
    if key not in seen and not (task_id and task_id in skip):
        seen.add(key)
        recs.append(rec)


def rec(kind: str, task_id: str, reason: str, command: str, next_after: str,
        item: dict[str, Any], tasks: dict[str, Any], enriched: dict[str, Any]) -> dict[str, Any]:
    return {"kind": kind, "task_id": task_id, "reason": reason, "value_score": value_score(item, task_id, enriched), "priority": priority(task_id, tasks, enriched), "suggested_command": command, "next_after": next_after}


def load_inputs(root: Path) -> dict[str, Any]:
    runtime = root / "runtime"
    return {
        "state": read_json(runtime / "dev-control" / "state.json", {}),
        "board": read_json(runtime / "task-board" / "enriched-board.json", {}),
        "triage": read_json(runtime / "task-board" / "triage-recommendations.json", {}),
        "approval_inbox": read_json(runtime / "task-board" / "daily-approval-inbox.json", {}),
        "dry": read_json(runtime / "task-board" / "auto-dry-run-plan.json", {}),
        "quarantine": read_json(runtime / "multi-agent" / "quarantine.json", {}),
        "dedup": read_json(runtime / "multi-agent" / "dedup-cooldown.json", {}),
        "gate": read_json(runtime / "task-board" / "execute-local-gate.json", {}),
        "budget": read_json(runtime / "multi-agent" / "budget-state.json", {}),
    }


def add_decisions(recs, seen, skip, tasks, enriched) -> None:
    ordered = sorted(tasks.items(), key=lambda kv: (PRANK.get(str(kv[1].get("priority") or "P3"), 9), kv[0]))
    for task_id, task in ordered:
        merged = dict(enriched.get(task_id) or {})
        merged.update(task)
        pri = priority(task_id, tasks, enriched)
        approvals = set(merged.get("approvals") or [])
        status = str(merged.get("status") or "")
        plan_resolved = "plan" in approvals or status == "planned"
        needs_user = (
            merged.get("requires_user_decision") or merged.get("recommended_action") == "needs_user_decision"
        ) and not plan_resolved
        if pri in {"P0", "P1"} and needs_user:
            add_rec(recs, seen, skip, rec("wait_for_user", task_id, f"{pri} 需要人工决策：{title(task_id, tasks, enriched)}", f"/show {task_id}", "人工定方向后,下一步会推荐 dry-run 或清理动作", merged, tasks, enriched))


def add_dry_runs(recs, seen, skip, dry, tasks, enriched) -> None:
    for item in as_list(dry.get("candidates")) + as_list(dry.get("manual_candidates")):
        task_id = task_id_of(item)
        if task_id not in tasks:
            continue
        approvals = set((tasks.get(task_id) or {}).get("approvals") or [])
        if isinstance(item, dict) and task_id and "execute-local" not in approvals:
            add_rec(recs, seen, skip, rec("manual_dry_run", task_id, f"可先收集单任务 dry-run 证据：{title(task_id, tasks, enriched)}", f"/manual_dry_run {task_id}", "如果通过,下一步会推荐 /execute_local_gate <id>", item, tasks, enriched))


def add_review_first_packets(recs, seen, skip, inbox, existing_task_ids: set[str], root: Path, findings_by_path: dict[str, list[dict[str, Any]]], skipped_stale: list[dict[str, Any]]) -> None:
    decisions = inbox.get("decisions_today") if isinstance(inbox, dict) else {}
    artifacts = inbox.get("artifacts") if isinstance(inbox, dict) else {}
    packet_source = str((artifacts or {}).get("daily_evolution_task_packets") or "").strip()
    source_path = Path(packet_source) if packet_source else None
    source_rows = packet_rows(source_path) if source_path and source_path.exists() else []
    if source_rows:
        items = [
            {
                "task_id": packet_task_id(row),
                "priority": row.get("priority") or "P3",
                "reason": f"review-first task packet: {row.get('scanner')} finding in {row.get('path') or 'unknown-path'}",
                "task_packet": row,
            }
            for row in source_rows
            if row.get("mode") == "review-first" and row.get("priority") in {"P1", "P2", "P3"}
        ]
    else:
        items = as_list((decisions or {}).get("review_first_packets"))
    source_arg = f" --task-packets {packet_source}" if source_path and source_path.exists() else ""
    for item in items:
        if not isinstance(item, dict):
            continue
        task_id = task_id_of(item)
        if not task_id or task_id in existing_task_ids:
            continue
        packet_source = item.get("task_packet") if isinstance(item.get("task_packet"), dict) else item
        status = stale_status(packet_source, root, findings_by_path)
        if status:
            skipped_stale.append(stale_packet_record(packet_source, task_id, status, root))
            continue
        priority = str(item.get("priority") or "P3")
        packet = {
            "kind": "review_first_packet",
            "task_id": task_id,
            "reason": str(item.get("reason") or item.get("title") or "daily evolution review-first task packet"),
            "value_score": 0,
            "priority": priority,
            "suggested_command": f"python3 scripts/import-review-first-packets.py{source_arg} --task-id {task_id}",
            "next_after": "预览无误后加 --apply 导入 dev-control, 再走 plan/dry-run 审批",
        }
        add_rec(recs, seen, skip, packet)


def add_triage(recs, seen, skip, triage, tasks, enriched) -> None:
    for item in as_list(triage.get("recommendations")):
        action = str(item.get("recommended_action") or item.get("action") or "").lower() if isinstance(item, dict) else ""
        task_id = task_id_of(item)
        if task_id and ("cancel" in action or action in {"dedupe-cancel", "archive-noisy"}):
            add_rec(recs, seen, skip, rec("apply_triage", task_id, str(item.get("reason") or "清理建议可降低队列噪音"), f"/apply_triage {task_id}", "清理后重新运行 /next 收敛剩余入口", item, tasks, enriched))


def add_dedup(recs, seen, dedup, tasks, enriched) -> None:
    for item in as_list(dedup.get("suggestions")):
        task_id = task_id_of(item)
        if task_id and task_id in tasks:
            reason = f"疑似重复任务,保留 {item.get('keep_task_id', '主任务')}"
            add_rec(recs, seen, set(), rec("cancel_dedup", task_id, reason, f"/show {task_id}", "确认后用清理入口取消重复任务", {"value_score": 0}, tasks, enriched))


def add_exec_gate(recs, seen, skip, gate, tasks, enriched) -> None:
    for item in as_list(gate.get("candidates")):
        task_id = task_id_of(item)
        if task_id not in tasks:
            continue
        approvals = set((tasks.get(task_id) or {}).get("approvals") or [])
        if isinstance(item, dict) and task_id and item.get("can_apply") is not False and "execute-local" not in approvals:
            add_rec(recs, seen, skip, rec("execute_local_gate", task_id, "已有 fresh manual dry-run evidence,可预览 execute-local 审批门", f"/execute_local_gate {task_id}", "如果批准,下一步仍需 runner preview + 二段确认", item, tasks, enriched))


def summarize(recs: list[dict[str, Any]], blocked: list[dict[str, str]]) -> str:
    counts: dict[str, int] = {}
    for item in recs:
        counts[str(item.get("kind"))] = counts.get(str(item.get("kind")), 0) + 1
    parts = [f"{count} 个 {kind}" for kind, count in counts.items()]
    if blocked:
        parts.append(f"{len(blocked)} 个阻塞")
    return "推荐执行 " + " + ".join(parts) if parts else "当前没有可推荐动作"


def build(root: Path = AUTOMATION, queue_owner: str = "", scanner_path: Path = DOC_DRIFT_SCANNER) -> dict[str, Any]:
    data = load_inputs(root)
    tasks = active_tasks(data["state"])
    existing_task_ids = all_task_ids(data["state"])
    enriched = by_task_id(data["board"])
    skip = id_set(as_list(data["quarantine"])) | id_set(as_list(data["dedup"].get("suggestions"))) | id_set(as_list(data["dedup"].get("pairs")))
    budget = data["budget"]
    blocked = [{"reason": "budget_paused", "until": str(budget.get("paused_until") or budget.get("until") or "")}] if budget.get("paused") else []
    paused = bool(blocked)
    recs: list[dict[str, Any]] = []
    seen: set[str] = set()
    skipped_stale: list[dict[str, Any]] = []
    findings_by_path = load_doc_drift_findings(root, scanner_path)

    add_decisions(recs, seen, skip, tasks, enriched)
    add_review_first_packets(recs, seen, skip, data["approval_inbox"], existing_task_ids, root, findings_by_path, skipped_stale)
    if not paused:
        add_dry_runs(recs, seen, skip, data["dry"], tasks, enriched)
    add_triage(recs, seen, skip, data["triage"], tasks, enriched)
    if not paused:
        add_dedup(recs, seen, data["dedup"], tasks, enriched)
        add_exec_gate(recs, seen, skip, data["gate"], tasks, enriched)

    recs = sorted(recs, key=lambda r: (KRANK.get(str(r.get("kind")), 9), PRANK.get(str(r.get("priority") or "P3"), 9), -int(r.get("value_score") or 0), str(r.get("task_id") or "")))[:5]
    for index, item in enumerate(recs, start=1):
        item["rank"] = index
    if paused and not recs:
        recs.append({"rank": 1, "kind": "wait_for_user", "task_id": "", "reason": "预算暂停,只建议人工确认或清理队列", "value_score": 0, "priority": "P0", "suggested_command": "/tokens", "next_after": "预算恢复后再推荐 dry-run 或 execute-local"})
    return {"generated_at": datetime.now(timezone.utc).isoformat(), "queue_owner": queue_owner or os.environ.get("DEV_CONTROL_QUEUE_OWNER", "local"), "recommendations": recs, "blocked": blocked, "skipped_stale_count": len(skipped_stale), "skipped_stale_packets": skipped_stale, "summary": summarize(recs, blocked)}


def atomic_write(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
        os.replace(tmp_name, path)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)


def self_test() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        def wf(rel: str, payload: Any) -> None:
            path = root / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(payload), encoding="utf-8")
        packet_path = root / "runtime/self-evolution/task-packets.json"
        packet_path.parent.mkdir(parents=True, exist_ok=True)
        example_doc = root / "docs/example.md"
        example_doc.parent.mkdir(parents=True, exist_ok=True)
        example_doc.write_text("example\n", encoding="utf-8")
        packet = {
            "scanner": "doc-drift-auditor",
            "kind": "semantic-stale-risk-group",
            "path": str(example_doc),
            "target": "example",
            "goal": "Review packet source.",
            "priority": "P1",
            "mode": "review-first",
        }
        packet_path.write_text(json.dumps({"task_packets": [packet]}), encoding="utf-8")
        scanner = root / "scan_doc_drift.py"
        scanner.write_text(
            "#!/usr/bin/env python3\n"
            "import json, sys\n"
            f"print(json.dumps({{'findings': [{{'kind': 'semantic-stale-risk', 'semantic_type': 'command-example', 'path': {str(example_doc)!r}, 'target': 'example'}}]}}))\n",
            encoding="utf-8",
        )
        source_packet_id = packet_task_id(packet)
        wf("runtime/dev-control/state.json", {"tasks": [{"task_id": "p0", "priority": "P0", "status": "received", "requires_user_decision": True, "goal": "decide"}, {"task_id": "dry", "priority": "P2", "status": "planned", "goal": "dry"}, {"task_id": "skip", "priority": "P1", "status": "planned", "goal": "skip"}, {"task_id": "done", "priority": "P1", "status": "completed", "goal": "done"}, {"task_id": "missing", "priority": "P1", "goal": "missing status"}]})
        wf("runtime/task-board/enriched-board.json", {"tasks": [{"task_id": "dry", "value_score": 7}]})
        wf(
            "runtime/task-board/daily-approval-inbox.json",
            {
                "artifacts": {"daily_evolution_task_packets": str(packet_path)},
                "decisions_today": {"review_first_packets": [{"task_id": "stale-packet-a", "priority": "P1", "reason": "stale review packet"}, {"task_id": "done", "priority": "P1", "reason": "already imported"}]},
            },
        )
        wf("runtime/task-board/auto-dry-run-plan.json", {"candidates": [{"task_id": "dry", "value_score": 7}, {"task_id": "skip"}]})
        wf("runtime/task-board/triage-recommendations.json", {"recommendations": []})
        wf("runtime/multi-agent/quarantine.json", {"quarantine": [{"task_id": "skip"}]})
        wf("runtime/multi-agent/dedup-cooldown.json", {"suggestions": []})
        wf("runtime/task-board/execute-local-gate.json", {"candidates": []})
        wf("runtime/multi-agent/budget-state.json", {"paused": False})
        data = build(root, "fixture", scanner_path=scanner)
        assert data["recommendations"][0]["task_id"] == "p0"
        assert any(item["task_id"] == source_packet_id and item["kind"] == "review_first_packet" for item in data["recommendations"])
        assert not any(item["task_id"] == "stale-packet-a" for item in data["recommendations"])
        assert not any(item["task_id"] == "done" and item["kind"] == "review_first_packet" for item in data["recommendations"])
        source_rec = next(item for item in data["recommendations"] if item["task_id"] == source_packet_id)
        assert "--task-packets" in source_rec["suggested_command"]
        assert any(item["task_id"] == "dry" for item in data["recommendations"])
        assert not any(item["task_id"] == "skip" for item in data["recommendations"])
        assert not any(item["task_id"] in {"done", "missing"} for item in data["recommendations"])
    print("OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    data = build()
    atomic_write(OUT_PATH, data)
    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True))
    elif not args.quiet:
        print(OUT_PATH)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
