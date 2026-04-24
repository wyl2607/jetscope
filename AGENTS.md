# AGENTS.md — JetScope AI 入口指南

> **项目**: JetScope (原 SAFvSoil / SAF vs Oil)
> **角色**: AI 并行开发系统入口
> **版本**: v2.1

## 快速开始

```bash
cd ~/projects/jetscope
source scripts/safenv
```

## 路径

- 本机: `~/projects/jetscope`
- GitHub: `wyl2607/jetscope`

## 默认规则

- 修改代码前先读本文件和根目录 `~/AGENTS.md`
- 发布前运行 `npm run preflight`
- 不得提交 `.env*`、内部交付文档、日志、`.automation/`、`.omx/`
- 多节点同步脚本和发布脚本属于高风险操作，修改后必须说明影响面

## 关键命令

- `npm run preflight`
- `npm run web:gate`
- `npm run api:check`
- `./scripts/publish-to-github.sh`
- `./scripts/sync-to-nodes.sh`

## 当前架构重点

- `apps/web`: Next.js 前端
- `apps/api`: FastAPI 后端
- `packages/core`: 共享领域逻辑
- `tools/workspace-data-bus`: 跨项目 JSONL 事件总线
- `tools/script-core`: 通用脚本工具入口

## 追踪规则

- 非琐碎任务开始前，先查 `tools/automation/runtime/ai-trace/*.jsonl`
- 新的稳定解法必须写回 ledger

## Cross-AI Traceability (Mandatory)

Before deep debugging or non-trivial implementation:

1. Read `/Users/yumei/tools/automation/workspace-guides/ai-collaboration-traceability-standard.md`.
2. Search shared ledgers first:
   - `/Users/yumei/tools/automation/runtime/ai-trace/issue-ledger.jsonl`
   - `/Users/yumei/tools/automation/runtime/ai-trace/solution-ledger.jsonl`
3. Then load this project's `INCIDENT_LOG.md` and `PROJECT_PROGRESS.md` if present.

Use:

```bash
bash /Users/yumei/tools/automation/scripts/ai-trace.sh find "<keyword>"
```

If a stable root cause or reusable fix is confirmed, write it back immediately:

```bash
bash /Users/yumei/tools/automation/scripts/ai-trace.sh issue "<scope>" "<symptom>" "<root_cause>" "<fix>" "<verification>" "<artifacts>"
bash /Users/yumei/tools/automation/scripts/ai-trace.sh solution "<scope>" "<problem_pattern>" "<solution_pattern>" "<verification>" "<artifacts>"
bash /Users/yumei/tools/automation/scripts/ai-trace.sh session "<scope>" "<summary>" "<next_step>" "<linked_issue>"
```
