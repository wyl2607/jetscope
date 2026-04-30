# AGENTS.md — JetScope AI 入口指南

> **项目**: JetScope
> **角色**: AI 并行开发系统入口
> **版本**: v2.1

## 快速开始

```bash
cd ~/projects/jetscope
source scripts/jetscope-env
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

- `APPROVE_JETSCOPE_RELEASE=<token> npm run release -- --approval-token <token>`（默认发布入口；会串联 preflight、GitHub 发布、VPS 部署；节点同步为显式 opt-in）
- `npm run preflight`
- `npm run web:gate`
- `npm run api:check`
- `./scripts/publish-to-github.sh`（局部重跑入口，非默认发布路径）
- `./scripts/sync-to-nodes.sh`（高风险节点同步，非默认发布路径）

## 当前架构重点

- `apps/web`: Next.js 前端
- `apps/api`: FastAPI 后端
- `packages/core`: 共享领域逻辑
- `docs/`: 产品、API、数据合同、AI 流水线与部署文档
- `scripts/`: 发布、预检、同步和部署脚本

## 仓库规则

- 不得提交 `.env*`、密钥、本地数据库、日志、构建产物、`node_modules/` 或内部交付归档
- 新增文档应面向公开仓库，避免写入私人机器路径、内部节点名或不可复现的本地流程
- 发布和部署规则以 `OPERATIONS.md` 为准
- 非琐碎任务开始前，先查 `/Users/yumei/tools/automation/runtime/ai-trace/*.jsonl`
- 新的稳定解法必须写回 ledger

## 发布安全边界

- 推送或发布前必须遵守 `/Users/yumei/.codex/memories/UNIVERSAL_AI_DEV_POLICY.md`
- 发布前先运行 `npm run preflight`
- 推送或默认发布必须先运行 `scripts/security_check.sh` 和 `scripts/review_push_guard.sh origin/main`；若 gate 缺失，发布脚本应 fail closed，不得自行伪造通过结果
- `.gitignore` 不等于节点同步安全边界；新增本地/敏感忽略规则时，也要同步检查 `scripts/sync-excludes.sh`

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

## Harness Engineering

- Codex/OpenCode 可用 skills: `repo-onboarding`, `test-harness`, `pr-review-guard`, `migration-safety`, `browser-qa`, `harness-engineering-orchestrator`。
- 非琐碎实现任务先压成 `Goal / Context / Constraints / Done criteria`，再进入代码修改。
- 需要从 PRD 到架构、里程碑、任务、验证的完整开发流时，使用 `harness-engineering-orchestrator`；普通小修复优先使用 `repo-onboarding` + `test-harness`。
- 不要在 `/Users/yumei` 根目录随意运行 Harness setup。只在目标项目目录明确执行，常用形式：`bun /Users/yumei/.agents/skills/harness-engineering-orchestrator/scripts/harness-setup.ts --isGreenfield=false --skipGithub=true`。
- Harness 产生的规划、架构、进度、状态必须写回项目文件或 trace ledger，不能只留在聊天里。
- 修改代码后报告实际验证证据：运行过的命令、通过/失败结果、未运行原因、剩余风险。
