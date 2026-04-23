#!/usr/bin/env bash
# 真实分发追踪：只读取 auto-refactor runtime 的状态与分发事件，不做“推断”
set -euo pipefail

RUNTIME_DIR="${RUNTIME_DIR:-/Users/yumei/tools/automation/runtime/auto-refactor}"
STATE_FILE="$RUNTIME_DIR/.build-state.json"
ALLOC_FILE="$RUNTIME_DIR/task-allocations.json"
EVENTS_FILE="$RUNTIME_DIR/dispatch-events.jsonl"
TASKS_FILE="$RUNTIME_DIR/tasks.txt"

if [[ ! -f "$TASKS_FILE" ]]; then
  echo "tasks.txt 不存在: $TASKS_FILE" >&2
  exit 1
fi

python3 - "$TASKS_FILE" "$STATE_FILE" "$ALLOC_FILE" "$EVENTS_FILE" <<'PY'
import json
import os
import sys
from typing import Dict, List

tasks_file, state_file, alloc_file, events_file = sys.argv[1:5]

def load_json(path: str, default):
    if not path or not os.path.exists(path):
        return default
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default

tasks: List[str] = []
with open(tasks_file, encoding="utf-8", errors="ignore") as f:
    for raw in f:
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("|", 4)
        if len(parts) < 5:
            continue
        tasks.append(parts[0])

state = load_json(state_file, {"tasks": {}, "completed": [], "failed": []})
alloc = load_json(alloc_file, {"allocations": []})
alloc_map: Dict[str, str] = {a.get("task_id", ""): a.get("node", "unknown") for a in alloc.get("allocations", [])}

event_map: Dict[str, Dict[str, str]] = {}
if os.path.exists(events_file):
    with open(events_file, encoding="utf-8", errors="ignore") as f:
        for raw in f:
            raw = raw.strip()
            if not raw:
                continue
            try:
                e = json.loads(raw)
            except Exception:
                continue
            tid = e.get("task_id")
            if not tid:
                continue
            event_map[tid] = {"event": str(e.get("event", "")), "node": str(e.get("node", ""))}

print("📋 任务执行表（真实数据）")
print("=" * 96)
print(f"{'#':<3} | {'Task ID':<38} | {'Node':<10} | {'State':<10} | {'Last Event':<10}")
print("-" * 96)
for i, tid in enumerate(tasks, start=1):
    st = state.get("tasks", {}).get(tid, {}).get("status", "pending")
    node = alloc_map.get(tid, "unknown")
    ev = event_map.get(tid, {}).get("event", "-")
    ev_node = event_map.get(tid, {}).get("node", "")
    if ev_node and node == "unknown":
        node = ev_node
    print(f"{i:<3} | {tid:<38} | {node:<10} | {st:<10} | {ev:<10}")

completed = len(state.get("completed", []))
failed = len(state.get("failed", []))
total = len(tasks)
running = sum(1 for t in tasks if state.get("tasks", {}).get(t, {}).get("status") == "running")
print("-" * 96)
print(f"总任务: {total} | completed: {completed} | failed: {failed} | running: {running}")
print(f"状态文件: {state_file}")
print(f"分发表: {alloc_file}")
print(f"分发事件: {events_file} {'(缺失)' if not os.path.exists(events_file) else ''}")
PY

