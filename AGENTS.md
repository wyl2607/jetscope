# AGENTS.md - Workspace AI Entry

This repository has a dual role during the workspace transition. Treat this
file as the public, repository-local AI entrypoint.

## Canonical Flow

- Read this file before editing.
- `CLAUDE.md` imports and extends this file for Claude-specific behavior.
- Product work for JetScope belongs in `/Users/yumei/projects/jetscope`.
- Workspace governance work belongs in `/Users/yumei/tools/automation` during
  the transition and must stay local-first unless explicitly promoted.

## Repository Boundary

`/Users/yumei` is not a normal single-purpose product repo:

| Area | Paths | Default action |
|---|---|---|
| JetScope product mirror | `apps/`, `infra/`, `packages/`, `test/`, product docs/scripts | Read-only here; develop in `/Users/yumei/projects/jetscope` |
| Workspace governance | `tools/automation/`, guard scripts, AI maintenance docs | Local-first; classify before any publish |
| Runtime/private state | `runtime/`, `.claude/`, `.codex/`, `.omx/`, vaults, logs, caches | Never publish |

See `NOTICE.md` when deciding whether a file belongs to product, governance,
runtime, private, or public-candidate zones.

## Safety Rules

- No push, PR, merge, release, deploy, sync, SSH, rsync, launchd mutation, or
  destructive Git operation without explicit approval.
- Do not read, print, stage, or store secrets.
- Keep runtime/cache/log/tool-state/temp/archive/nested-repo artifacts out of
  commits.
- Split commits by purpose and risk surface.
- If the worktree is dirty, classify changes before staging.
- Unknown, private, generated, runtime, or deploy-adjacent files block publish.

## Required Gates

Before local commits, run the smallest relevant validation plus:

```bash
scripts/security_check.sh
```

Before any push or PR preparation, also run:

```bash
scripts/review_push_guard.sh origin/main
```

Do not bypass hooks or guards.

## Maintenance Pipeline

The repo-evolver direction is intentionally conservative:

- Daily automation should produce low-risk, reviewable maintenance candidates.
- Codex GitHub Action runs must be read-only unless explicitly approved.
- Static gates should report Semgrep, Vale, and markdownlint issues without
  mutating files.
- `.evolver/` stores small public-safe metadata and policy contracts only.
- Runtime memory, raw reports, local queues, vault-derived notes, and secrets
  remain outside `.evolver/` and outside public commits.

## Cross-AI Traceability

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

## Browser Use UI 验证闭环

- 任何影响前端 UI、导航、可读性、交互、fallback/error 文案或人因流程的任务，不能只靠截图或 CLI 测试宣称完成；必须用 Codex in-app Browser Use 做真实页面操作。
- Browser Use 证据至少包含：入口 URL、点击/输入/导航路径、预期 UI 结果、当前 URL 或 DOM 断言、console error 状态，以及残余风险。
- 如果 Browser Use 发现 Next `Link`、按钮、表单、滚动、焦点、移动端布局或 fallback 状态与 CLI 测试不一致，以浏览器证据为准，先修用户真实路径。
- 页面不要回退成重黑背景作为默认阅读体验；危机/风险语义应通过 badge、层级、文案和局部强调表达，而不是整页低对比暗色。

## 本地提交闭环

- 验证通过的非琐碎本地改动默认不长期留在脏树：先检查 `git status --short`、`git diff --stat`、`git diff --check`，按目的切分后本地 commit。
- 不允许在混合脏树里直接 `git add .`；必须先把改动分类为本轮任务、既有用户/worker 改动、文档记录、生成/runtime/private、高风险 ops 表面。
- 只提交本轮 allowlist 内且验证覆盖到的文件。若存在无关脏文件，保持未暂存并在交付中说明。
- push、PR、release、deploy、sync 和 auto-merge 不是自动闭环的一部分，仍然需要显式用户批准和发布/推送 guard。

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

For non-trivial implementation or debugging, search local trace ledgers first:

```bash
bash /Users/yumei/tools/automation/scripts/ai-trace.sh find "<keyword>"
```

Stable reusable findings should be written back with the same script.

## Codex Goal Packet

Use this shape for bounded delegated work:

```text
/goal 完成 <task>

目标：
<one sentence>

上下文：
<repo, current state, relevant files>

允许修改：
<exact allowlist>

禁止修改：
<private/runtime/generated/deploy paths and all unrelated files>

执行方式：
CLI-first. No push/PR/deploy/sync/SSH/rsync/delete/reset.

验证：
<focused commands>

完成标准：
<checkable done criteria>

交付：
changed files, validation, remaining risk.
```
