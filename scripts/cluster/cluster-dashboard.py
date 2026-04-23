#!/usr/bin/env python3
"""
🚀 多设备集群实时监控仪表板
显示 7 个 Codex 任务在 coco, mac-mini, usa-vps 的分布式执行进度
"""

import json
import time
from pathlib import Path
from datetime import datetime
import re

LOG_FILE = Path("/Users/yumei/tools/automation/runtime/auto-refactor/2026-04-21.log")
BUILD_LOGS_DIR = Path("/Users/yumei/tools/automation/runtime/auto-refactor/build-logs")
STATE_FILE = Path("/Users/yumei/tools/automation/runtime/auto-refactor/.build-state.json")

# 已知任务及其目标节点（根据集群调度策略推断）
TASKS = {
    "meichen-web_dep-update_0": {"type": "dep-update", "project": "meichen-web"},
    "safvsoil_dep-update_1": {"type": "dep-update", "project": "safvsoil"},
    "sustainos_todo-resolve_2": {"type": "todo-resolve", "project": "sustainos"},
    "home-lab-app_todo-resolve_3": {"type": "todo-resolve", "project": "home-lab-app"},
    "esg-research-toolkit_todo-resolve_4": {"type": "todo-resolve", "project": "esg-research-toolkit"},
    "safvsoil_todo-resolve_5": {"type": "todo-resolve", "project": "safvsoil"},
    "esg-research-toolkit_refactor_6": {"type": "refactor", "project": "esg-research-toolkit"},
}

NODES = {
    "coco": {"role": "control+worker", "lanes": 1, "efficiency": 100.0},
    "mac-mini": {"role": "worker", "lanes": 2, "efficiency": 84.5},
    "usa-vps": {"role": "worker", "lanes": 1, "efficiency": 57.9},
}

def get_build_state():
    """从构建状态文件读取任务状态"""
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except:
            return {}
    return {}

def parse_task_status():
    """解析各任务的执行状态"""
    state = get_build_state()
    status = {}
    
    for task_id in TASKS:
        task_state = state.get("tasks", {}).get(task_id, {})
        task_status = task_state.get("status", "pending")
        
        if task_id in state.get("completed", []):
            status[task_id] = "✅ completed"
        elif task_id in state.get("failed", []):
            status[task_id] = "❌ failed"
        else:
            status[task_id] = f"⏳ {task_status}"
    
    return status

def get_node_allocation(status):
    """推断任务到节点的分配（第 1 批：4 个任务）"""
    batch1 = ["meichen-web_dep-update_0", "safvsoil_dep-update_1", 
              "sustainos_todo-resolve_2", "home-lab-app_todo-resolve_3"]
    
    allocation = {"coco": [], "mac-mini": [], "usa-vps": []}
    
    # 前 2 个任务 → coco（最优效率）
    allocation["coco"] = batch1[:2]
    
    # 后 2 个任务 → mac-mini（次优）
    allocation["mac-mini"] = batch1[2:4]
    
    return allocation

def print_dashboard():
    """打印实时监控仪表板"""
    status = parse_task_status()
    allocation = get_node_allocation(status)
    
    print("\033[2J\033[H")  # 清屏
    print("=" * 80)
    print("🚀 多设备集群实时执行监控仪表板")
    print("=" * 80)
    print(f"\n⏰ 时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"📊 状态文件: {STATE_FILE}")
    
    # 按节点显示
    print("\n" + "=" * 80)
    print("📍 节点分配情况")
    print("=" * 80)
    
    for node, tasks in allocation.items():
        node_info = NODES.get(node, {})
        print(f"\n🖥️  {node.upper()}")
        print(f"   角色: {node_info.get('role', '?')} | Lanes: {node_info.get('lanes', 0)} | 效率: {node_info.get('efficiency', 0)}%")
        
        if tasks:
            for task_id in tasks:
                task_status = status.get(task_id, "⏳ pending")
                task_info = TASKS.get(task_id, {})
                print(f"   {task_status} {task_id}")
                print(f"      项目: {task_info.get('project')} | 类型: {task_info.get('type')}")
        else:
            print(f"   (无任务分配或已完成)")
    
    # 任务统计
    print("\n" + "=" * 80)
    print("📈 任务统计")
    print("=" * 80)
    
    completed_count = sum(1 for s in status.values() if "completed" in s)
    failed_count = sum(1 for s in status.values() if "failed" in s)
    running_count = sum(1 for s in status.values() if "running" in s or s.startswith("⏳"))
    total = len(TASKS)
    
    print(f"\n✅ 已完成: {completed_count}/7")
    print(f"❌ 失败: {failed_count}/7")
    print(f"⏳ 执行中: {running_count}/7")
    print(f"⏸️  待启动: {7 - completed_count - failed_count - running_count}/7")
    
    # 进度条
    progress = completed_count * 100 // 7
    bar = "█" * (progress // 10) + "░" * (10 - progress // 10)
    print(f"\n📊 整体进度: [{bar}] {progress}%")
    
    # 第 1 批 vs 第 2 批
    batch1_ids = ["meichen-web_dep-update_0", "safvsoil_dep-update_1", 
                  "sustainos_todo-resolve_2", "home-lab-app_todo-resolve_3"]
    batch2_ids = ["esg-research-toolkit_todo-resolve_4", "safvsoil_todo-resolve_5", 
                  "esg-research-toolkit_refactor_6"]
    
    batch1_completed = sum(1 for tid in batch1_ids if "completed" in status.get(tid, ""))
    batch2_started = any(tid in str(status) for tid in batch2_ids)
    
    print(f"\n🔄 第 1 批 (4 个): {batch1_completed}/4 完成" + (" ✅" if batch1_completed == 4 else ""))
    print(f"🔄 第 2 批 (3 个): {'启动中' if batch2_started else '等待中'}")
    
    print("\n" + "=" * 80)
    print("💡 说明:")
    print("  - Coco: 控制平面 + 工作节点，1 个并发 lane (优先级最高)")
    print("  - Mac-mini: 工作节点，2 个并发 lanes (次优先)")
    print("  - USA-VPS: 备选节点，当前受限但可用")
    print("=" * 80 + "\n")

def main():
    """主监控循环"""
    print("🔄 启动集群监控...")
    print("按 Ctrl+C 停止\n")
    
    try:
        while True:
            print_dashboard()
            
            # 检查完成条件
            status = parse_task_status()
            completed_count = sum(1 for s in status.values() if "completed" in s)
            if completed_count == 7:
                print("✅ 所有 7 个任务已完成！")
                break
            
            time.sleep(10)  # 每 10 秒刷新一次
    except KeyboardInterrupt:
        print("\n⏹️  监控停止\n")

if __name__ == "__main__":
    main()
