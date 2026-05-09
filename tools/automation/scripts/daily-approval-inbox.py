#!/usr/bin/env python3
"""Build a compact daily approval inbox for the workspace controller.

This script is read-only with respect to dev-control: it does not approve,
execute, mutate Git, sync, deploy, or contact remote systems. It only reads
current runtime artifacts and writes a short JSON/Markdown inbox under
runtime/task-board so the user can approve tasks and set direction from one
place.
"""

from __future__ import annotations

import argparse
import json
import os
import hashlib
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Sequence


_SCRIPT_DIR = Path(__file__).resolve().parent
AUTOMATION = Path(os.environ.get("AUTOMATION_ROOT", str(_SCRIPT_DIR.parent))).expanduser()
RUNTIME = AUTOMATION / "runtime"
TASK_BOARD = RUNTIME / "task-board"
DEV_CONTROL = RUNTIME / "dev-control"
MULTI_AGENT = RUNTIME / "multi-agent"
DEFAULT_JSON = TASK_BOARD / "daily-approval-inbox.json"
DEFAULT_MD = TASK_BOARD / "daily-approval-inbox.md"
REPORT_VERSION = "daily-approval-inbox-1.0.1"
TERMINAL_STATUSES = {"completed", "cancelled", "failed"}
SECRET_RE = re.compile(
    r"([0-9]{8,}:[A-Za-z0-9_-]{20,}|\bsk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY|(?:api[_-]?key|token|secret|password|authorization)\s*[:=]\s*\S+)",
    re.IGNORECASE,
)


class InboxError(Exception):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default
    except json.JSONDecodeError:
        return default


def ensure_runtime_output(path: Path) -> Path:
    out = path.expanduser().resolve(strict=False)
    runtime = RUNTIME.resolve(strict=False)
    if out != runtime and runtime not in out.parents:
        raise InboxError(f"output must stay under {runtime}: {out}")
    return out


def atomic_write(path: Path, text: str) -> None:
    if SECRET_RE.search(text):
        raise InboxError("refusing to write secret-like output")
    out = ensure_runtime_output(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=str(out.parent), delete=False) as tmp:
        tmp.write(text)
        tmp_path = Path(tmp.name)
    tmp_path.replace(out)


def compact(text: Any, limit: int = 120) -> str:
    value = " ".join(str(text or "").split())
    if len(value) <= limit:
        return value
    return value[: max(0, limit - 1)].rstrip() + "..."


def safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def safe_list(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    return [compact(item, 60) for item in value]


def latest_task_packets_path() -> Path:
    self_evolution_dir = RUNTIME / "self-evolution"
    candidates = sorted(self_evolution_dir.glob("daily-evolution-20*-task-packets.json"))
    if candidates:
        return candidates[-1]
    return self_evolution_dir / "daily-evolution-unknown-task-packets.json"


def packet_task_id(packet: Dict[str, Any]) -> str:
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


def infer_project(path_value: Any) -> str:
    path = str(path_value or "").strip()
    if path.startswith(str(AUTOMATION)):
        return "tools/automation"
    if path:
        return Path(path).name or "unknown"
    return "unknown"


def packet_to_inbox(packet: Dict[str, Any], reason_prefix: str) -> Dict[str, Any]:
    return {
        "task_id": packet_task_id(packet),
        "project": infer_project(packet.get("path")),
        "priority": packet.get("priority") or "P3",
        "status": "packet-ready",
        "title": compact(packet.get("goal") or packet.get("scanner") or "Review-first packet", 140),
        "approvals": [],
        "reason": compact(f"{reason_prefix}: {packet.get('scanner')} finding in {packet.get('path') or 'unknown-path'}", 160),
        "suggested_action": "review packet and create task",
    }


def all_task_ids(state: Dict[str, Any]) -> set[str]:
    tasks = state.get("tasks") if isinstance(state.get("tasks"), list) else []
    return {str(task.get("task_id") or "") for task in tasks if isinstance(task, dict) and task.get("task_id")}


def packet_candidates(value: int = 8, existing_task_ids: set[str] | None = None) -> List[Dict[str, Any]]:
    existing = existing_task_ids or set()
    packets = read_json(latest_task_packets_path(), {})
    rows = packets.get("task_packets") if isinstance(packets.get("task_packets"), list) else []
    if not isinstance(rows, list):
        rows = []

    review_first = [
        row
        for row in rows
        if isinstance(row, dict) and row.get("mode") == "review-first" and row.get("priority") in {"P1", "P2", "P3"}
    ]

    enriched = [
        packet_to_inbox(row, "review-first task packet")
        for row in review_first
        if packet_task_id(row) not in existing
    ]
    enriched.sort(key=lambda item: (item.get("priority") or "", str(item.get("task_id") or "")))
    return enriched[:value]


def active_tasks(state: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [task for task in state.get("tasks") or [] if task.get("status") not in TERMINAL_STATUSES]


def task_index(tasks: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    return {str(task.get("task_id") or ""): task for task in tasks if task.get("task_id")}


def public_task(task: Dict[str, Any], reason: str, action: str = "") -> Dict[str, Any]:
    return {
        "task_id": task.get("task_id"),
        "project": task.get("project"),
        "priority": task.get("priority"),
        "status": task.get("status"),
        "title": compact(task.get("goal") or task.get("title"), 140),
        "approvals": sorted(task.get("approvals") or []),
        "reason": compact(reason, 160),
        "suggested_action": action,
    }


def runner_result_summary() -> Dict[str, Any]:
    summary_path = TASK_BOARD / "runner-result-summary.json"
    summary = read_json(summary_path, {})
    if summary:
        return summary
    results_dir = TASK_BOARD / "runner-confirm-results"
    rows: List[Dict[str, Any]] = []
    if results_dir.exists():
        for path in sorted(results_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)[:5]:
            row = read_json(path, {})
            if row:
                rows.append(row)
    return {
        "summary": {
            "result_count": len(rows),
            "failed_count": sum(1 for row in rows if safe_int(row.get("effective_rc") or row.get("apply_rc") or 0) != 0),
        },
        "results": rows,
    }


def value_candidates(value_board: Dict[str, Any], limit: int) -> List[Dict[str, Any]]:
    rows = value_board.get("tasks") or value_board.get("items") or []
    if not isinstance(rows, list):
        rows = []
    enriched = []
    for row in rows:
        score = safe_int(row.get("value_score") or 0)
        if score <= 0:
            continue
        enriched.append(
            {
                "task_id": row.get("task_id"),
                "project": row.get("project"),
                "priority": row.get("priority"),
                "status": row.get("status"),
                "title": compact(row.get("goal") or row.get("title"), 140),
                "value_score": score,
                "value_reasons": safe_list(row.get("value_reasons")),
            }
        )
    enriched.sort(key=lambda item: (-safe_int(item.get("value_score") or 0), str(item.get("task_id") or "")))
    return enriched[:limit]


def build_report(limit: int = 8) -> Dict[str, Any]:
    state = read_json(DEV_CONTROL / "state.json", {"tasks": []})
    tasks = active_tasks(state)
    existing_task_ids = all_task_ids(state)
    by_id = task_index(tasks)
    planning = read_json(TASK_BOARD / "canonical-planning-gate.json", {"candidates": [], "summary": {}})
    execute_gate = read_json(TASK_BOARD / "execute-local-gate.json", {"candidates": [], "summary": {}})
    auto_dry = read_json(TASK_BOARD / "auto-dry-run-plan.json", {"candidates": [], "manual_candidates": [], "summary": {}})
    unfinished = read_json(TASK_BOARD / "dev-control-unfinished-runs.json", {"alerts": [], "summary": {}})
    budget = read_json(MULTI_AGENT / "budget-state.json", {})
    dedup = read_json(MULTI_AGENT / "dedup-cooldown.json", {"summary": {}})
    quarantine = read_json(MULTI_AGENT / "quarantine.json", {"summary": {}})
    value_board = read_json(MULTI_AGENT / "value-scored-board.json", {})
    runner_summary = runner_result_summary()

    plan_approval = []
    for row in planning.get("candidates") or []:
        task = by_id.get(str(row.get("task_id") or ""), row)
        plan_approval.append(public_task(task, row.get("plan_summary") or "ready for plan approval", "approve plan"))

    execute_local = []
    for row in execute_gate.get("candidates") or []:
        if row.get("can_apply"):
            task = by_id.get(str(row.get("task_id") or ""), row)
            execute_local.append(public_task(task, "fresh manual dry-run evidence is available", "approve execute-local"))

    runner_confirm = []
    dry_ids = {str(row.get("task_id") or "") for row in (auto_dry.get("manual_candidates") or []) + (auto_dry.get("candidates") or [])}
    for task_id in sorted(dry_ids):
        task = by_id.get(task_id)
        if not task:
            continue
        approvals = set(task.get("approvals") or [])
        if "execute-local" in approvals:
            runner_confirm.append(public_task(task, "execute-local is already approved; runner still needs preview token + confirm", "runner preview/confirm"))

    direction_needed = []
    for task in tasks:
        if bool(task.get("requires_user_decision")):
            direction_needed.append(public_task(task, "task is marked requires_user_decision", "set direction or split"))
        elif task.get("status") in {"received", "clarifying"}:
            direction_needed.append(public_task(task, "task is not yet planned", "clarify goal or approve plan"))
    for alert in unfinished.get("alerts") or []:
        task = by_id.get(str(alert.get("task_id") or ""), alert)
        direction_needed.append(public_task(task, alert.get("alert_type") or "unfinished runner alert", "reconcile or split"))

    review_first_packets = packet_candidates(limit, existing_task_ids)

    risk_notes = []
    if budget.get("paused"):
        risk_notes.append("Token/cost budget is paused; do not start new model-heavy work.")
    q_count = safe_int((quarantine.get("summary") or {}).get("quarantined_count") or 0)
    if q_count:
        risk_notes.append(f"{q_count} task(s) are quarantined by failure policy.")
    d_count = safe_int((dedup.get("summary") or {}).get("suggestion_count") or 0)
    if d_count:
        risk_notes.append(f"{d_count} duplicate/cooldown suggestion(s) need review.")
    failed_results = safe_int((runner_summary.get("summary") or {}).get("failed_count") or 0)
    if failed_results:
        risk_notes.append(f"Latest runner result summary has {failed_results} failed result(s).")
    if not risk_notes:
        risk_notes.append("No budget pause, quarantine, or dedup pressure in current governance summaries.")

    recommended = []
    if plan_approval:
        recommended.append(f"Approve plan for {len(plan_approval)} received task(s), then let dry-run selector rank them.")
    if execute_local:
        recommended.append(f"Review and approve execute-local for {len(execute_local)} task(s) with fresh dry-run evidence.")
    if runner_confirm:
        recommended.append(f"Run two-stage runner confirm for {len(runner_confirm)} execute-approved task(s), one at a time.")
    if direction_needed:
        recommended.append(f"Set direction/split/reconcile {len(direction_needed)} blocked or stale item(s).")
    if review_first_packets:
        recommended.append(f"Review or import {len(review_first_packets)} daily evolution task packet(s) into dev-control.")
    if not recommended:
        recommended.append("No user approval is currently required; generate or import fresh low-risk tasks if more work is desired.")

    report = {
        "generated_at": utc_now(),
        "report_version": REPORT_VERSION,
        "safety": {
            "read_only": True,
            "approves_tasks": False,
            "executes_tasks": False,
            "git_mutation": False,
            "remote_mutation": False,
        },
        "summary": {
            "active_task_count": len(tasks),
            "plan_approval_count": len(plan_approval),
            "execute_local_count": len(execute_local),
            "runner_confirm_count": len(runner_confirm),
            "direction_needed_count": len(direction_needed),
            "review_first_packet_count": len(review_first_packets),
            "auto_dry_run_candidates": (auto_dry.get("summary") or {}).get("candidate_count", 0),
            "manual_dry_run_candidates": (auto_dry.get("summary") or {}).get("manual_candidate_count", 0),
        },
        "decisions_today": {
            "plan_approval": plan_approval[:limit],
            "execute_local": execute_local[:limit],
            "runner_confirm": runner_confirm[:limit],
            "direction_needed": direction_needed[:limit],
            "review_first_packets": review_first_packets[:limit],
        },
        "top_value_candidates": value_candidates(value_board, limit),
        "risk_notes": risk_notes[:limit],
        "recommended_user_actions": recommended[:limit],
        "artifacts": {
            "planning_gate": str(TASK_BOARD / "canonical-planning-gate.json"),
            "execute_local_gate": str(TASK_BOARD / "execute-local-gate.json"),
            "auto_dry_run": str(TASK_BOARD / "auto-dry-run-plan.json"),
            "daily_evolution_task_packets": str(latest_task_packets_path()),
        },
    }
    return report


def render_markdown(report: Dict[str, Any]) -> str:
    lines = [
        "# Daily Approval Inbox",
        "",
        f"Generated: {report.get('generated_at')}",
        "",
    ]
    summary = report.get("summary") or {}
    lines.append(
        "Summary: "
        f"active={summary.get('active_task_count', 0)}, "
        f"plan={summary.get('plan_approval_count', 0)}, "
        f"execute-local={summary.get('execute_local_count', 0)}, "
        f"runner-confirm={summary.get('runner_confirm_count', 0)}, "
        f"direction={summary.get('direction_needed_count', 0)}, "
        f"packets={summary.get('review_first_packet_count', 0)}"
    )
    lines.append("")

    def section(title: str, rows: List[Dict[str, Any]]) -> None:
        lines.append(f"## {title}")
        if not rows:
            lines.append("- None")
            lines.append("")
            return
        for row in rows:
            lines.append(
                f"- `{row.get('task_id')}` [{row.get('project')}] {row.get('title')} | action: {row.get('suggested_action')} | reason: {row.get('reason')}"
            )
        lines.append("")

    decisions = report.get("decisions_today") or {}
    section("Plan Approval", decisions.get("plan_approval") or [])
    section("Execute Local", decisions.get("execute_local") or [])
    section("Runner Confirm", decisions.get("runner_confirm") or [])
    section("Direction Needed", decisions.get("direction_needed") or [])
    section("Review-First Packets", decisions.get("review_first_packets") or [])

    lines.append("## Top Value Candidates")
    values = report.get("top_value_candidates") or []
    if not values:
        lines.append("- None")
    for row in values:
        lines.append(f"- `{row.get('task_id')}` value={row.get('value_score')} reasons={','.join(row.get('value_reasons') or [])} {row.get('title')}")
    lines.append("")

    lines.append("## Risk Notes")
    for note in report.get("risk_notes") or []:
        lines.append(f"- {note}")
    lines.append("")

    lines.append("## Recommended User Actions")
    for action in report.get("recommended_user_actions") or []:
        lines.append(f"- {action}")
    lines.append("")
    lines.append("Safety: read-only report; no approvals, execution, Git, deploy, sync, or remote mutation.")
    return "\n".join(lines).strip() + "\n"


def self_test() -> None:
    report = {
        "generated_at": utc_now(),
        "summary": {
            "active_task_count": 1,
            "plan_approval_count": 1,
            "execute_local_count": 0,
            "runner_confirm_count": 0,
            "direction_needed_count": 0,
            "review_first_packet_count": 1,
        },
        "decisions_today": {
            "plan_approval": [public_task({"task_id": "T1", "project": "tools/automation", "goal": "approve this", "status": "received"}, "ready", "approve plan")],
            "execute_local": [],
            "runner_confirm": [],
            "direction_needed": [],
            "review_first_packets": [packet_to_inbox({"scanner": "doc-drift-auditor", "kind": "semantic-stale-risk", "path": str(AUTOMATION / "README.md"), "goal": "review packet", "mode": "review-first"}, "review-first task packet")],
        },
        "top_value_candidates": [{"task_id": "T1", "value_score": 3, "value_reasons": ["test+3"], "title": "approve this"}],
        "risk_notes": ["No budget pause, quarantine, or dedup pressure in current governance summaries."],
        "recommended_user_actions": ["Approve plan for 1 received task(s), then let dry-run selector rank them."],
    }
    rendered = render_markdown(report)
    assert "Daily Approval Inbox" in rendered
    assert "Plan Approval" in rendered
    assert "Review-First Packets" in rendered
    assert "Safety: read-only" in rendered
    long_packet = {
        "scanner": "doc-drift-auditor",
        "kind": "semantic-stale-risk-group",
        "path": str(AUTOMATION / "workspace-guides/android-phone-ops/offline-library-system.md"),
        "target": "~/scripts/phone-offline-library.sh push",
        "goal": "x" * 260,
        "mode": "review-first",
        "priority": "P1",
    }
    assert packet_task_id(long_packet) == packet_to_inbox(long_packet, "review-first task packet")["task_id"]
    try:
        ensure_runtime_output(Path("/tmp/daily-approval-inbox.json"))
        raise AssertionError("outside runtime output accepted")
    except InboxError:
        pass


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a read-only daily approval inbox")
    parser.add_argument("--out", default=str(DEFAULT_JSON), help="JSON output path under runtime")
    parser.add_argument("--markdown-out", default=str(DEFAULT_MD), help="Markdown output path under runtime")
    parser.add_argument("--limit", type=int, default=8)
    parser.add_argument("--render", action="store_true", help="print markdown to stdout")
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.self_test:
            self_test()
            if not args.quiet:
                print("self-test ok")
            return 0
        report = build_report(max(1, args.limit))
        json_text = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
        md_text = render_markdown(report)
        atomic_write(Path(args.out), json_text)
        atomic_write(Path(args.markdown_out), md_text)
        if args.render:
            print(md_text, end="")
        elif not args.quiet:
            summary = report.get("summary") or {}
            print(
                f"daily approval inbox written: plan={summary.get('plan_approval_count', 0)} "
                f"execute={summary.get('execute_local_count', 0)} runner={summary.get('runner_confirm_count', 0)} "
                f"direction={summary.get('direction_needed_count', 0)}"
            )
        return 0
    except InboxError as exc:
        print(f"daily-approval-inbox error: {exc}", file=os.sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
