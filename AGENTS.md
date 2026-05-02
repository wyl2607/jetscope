# AGENTS.md — JetScope AI 入口指南

> **项目**: JetScope
> **角色**: AI 并行开发系统入口
> **版本**: v2.1

## 仓库角色边界（B 阶段，2026-05-02 起）

- 本仓 (`/Users/yumei`) 已声明为**双重身份**：workspace 治理层（活）+ jetscope 产品镜像（只读）。
- **jetscope 产品类改动**（`apps/`、`infra/`、`packages/`、`test/`、产品类 `scripts/*`）的唯一开发口：`~/projects/jetscope`。
- **workspace 治理类改动**（`tools/automation/`、`scripts/obsidian_*`、`scripts/ops_hub.sh` 等）继续在本仓维护，C 阶段会迁出。
- 详细分类与不可触碰路径见 `/Users/yumei/NOTICE.md`。
- 决策方案见 `~/.claude/plans/jetscope-dual-repo-convergence.md`。

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

## Dev-Harness Continuation Index

- 开始或恢复任一 `/Users/yumei/projects/*` 项目工作前，先读 `/Users/yumei/.claude/projects/-Users-yumei/dev-harness/INDEX.md`。
- 进入具体项目后，再读对应 `/Users/yumei/.claude/projects/-Users-yumei/dev-harness/projects/<project>.md`，用其中的 `Resume Hint`、风险、未完成项和 guard 约束决定下一步。
- `dev-harness/` 是私有本机开发台账，只能由 harness 脚本更新；不得提交、推送、同步、复制到公开仓库或写入项目源码目录。

## Harness Engineering

- Codex/OpenCode 可用 skills: `repo-onboarding`, `test-harness`, `pr-review-guard`, `migration-safety`, `browser-qa`, `harness-engineering-orchestrator`。
- 非琐碎实现任务先压成 `Goal / Context / Constraints / Done criteria`，再进入代码修改。
- Codex CLI 已启用 `/goal` 时，默认把它作为单任务执行模式：Claude/OpenCode 负责任务切分、边界、并发安全和最终验收；Codex `/goal` 负责按任务包闭环执行。
- Codex goal 任务包必须包含：目标、上下文、允许修改范围、禁止事项、验证命令、完成标准、交付摘要；默认 CLI-first，优先用文件、日志、测试和构建命令，不默认使用 Computer Use。
- 多个 Codex goal 只能并行处理文件范围不重叠的任务；涉及同一核心文件、数据模型、迁移、发布、节点同步或安全边界时，必须串行并由主控复审。
- 需要从 PRD 到架构、里程碑、任务、验证的完整开发流时，使用 `harness-engineering-orchestrator`；普通小修复优先使用 `repo-onboarding` + `test-harness`。
- 不要在 `/Users/yumei` 根目录随意运行 Harness setup。只在目标项目目录明确执行，常用形式：`bun /Users/yumei/.agents/skills/harness-engineering-orchestrator/scripts/harness-setup.ts --isGreenfield=false --skipGithub=true`。
- Harness 产生的规划、架构、进度、状态必须写回项目文件或 trace ledger，不能只留在聊天里。
- 修改代码后报告实际验证证据：运行过的命令、通过/失败结果、未运行原因、剩余风险。

## Codex Goal Task Packet

```text
/goal 完成 <任务名>

目标：
<一句话说明要完成什么>

上下文：
<项目、当前状态、相关文件或文档>

允许修改：
<文件/目录白名单>

禁止修改：
<不能触碰的路径、不能执行的操作>

执行方式：
默认 CLI-first：优先读取文件、运行测试/构建/日志命令；不要使用 Computer Use，除非本任务明确要求 GUI/视觉验证。

验证：
<必须运行的命令>

完成标准：
<通过条件>

交付：
最后报告改动文件、验证结果、剩余风险和建议下一步。
```
