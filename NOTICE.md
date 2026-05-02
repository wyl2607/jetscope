# Repository Role Notice

`/Users/yumei` 这个 git 仓库（`origin = wyl2607/jetscope`）当前同时承载两件不应混在一起的东西。本文档明确二者边界，作为 B 阶段（双仓单向角色）的治理依据。后续 C 阶段会把它们物理拆开。

修订日期：2026-05-02

---

## 1. 双重身份

### (A) Workspace 治理层 —— 活跃维护

下列内容是**本机 workspace 的治理实施**，由 launchd / cron 在 root 路径下直接调用，是当前生效的运行时：

- `tools/automation/`（含 `scripts/`、`runtime/`、`workspace-guides/`）
- `scripts/ops_hub.sh`
- `scripts/daily_ai_tools_update_check.py`
- `scripts/internal_device_update_orchestrator.py`
- `scripts/obsidian_vault_*.py`、`scripts/obsidian_workspace_bridge.py`
- `scripts/opencode-model-resolver.py`
- `scripts/probe-gpt55-authenticity.sh`
- `scripts/security_check.sh`、`scripts/review_push_guard.sh`
- 顶层 `AGENTS.md`、`PLANS.md`、`PROJECT_PROGRESS.md`、`docs/obsidian-local-bridge.md` 等治理文档

**对这些路径的修改可以继续在 root 仓提交。** 它们不属于 jetscope 产品的 git 历史，但目前借住在这个仓里——C 阶段会迁出到独立位置。

被 launchd 直接引用的入口（不要改路径）：
- `~/Library/LaunchAgents/com.yumei.ai-tools-update-check.plist` → `scripts/ops_hub.sh run-profile daily`
- `~/Library/LaunchAgents/com.yumei.ops-hub-weekly.plist` → `scripts/ops_hub.sh run-profile weekly`
- `~/Library/LaunchAgents/com.yumei.codex-p0-p1-loop.plist` → `scripts/codex_p0_p1_loop.sh`
- `~/Library/LaunchAgents/com.yumei.auto-refactor-loop.plist` → `tools/automation/scripts/run-auto-refactor-safe-local.sh`
- `~/Library/LaunchAgents/com.yumei.telegram-dev-bot{,-failover}.plist` → `tools/automation/scripts/telegram-dev-bot*`
- `~/Library/LaunchAgents/com.yumei.task-board-nightly.plist` → `tools/automation/scripts/run-task-board-nightly.sh`

### (B) jetscope 产品镜像 —— 只读

下列内容是 jetscope 产品仓的**历史镜像**，已落后于 `~/projects/jetscope`：

- `apps/`（`apps/web`、`apps/api`）
- `infra/`
- `packages/`
- `test/`
- `docs/`（jetscope 产品文档，不含 `obsidian-local-bridge.md` 这类治理文档）
- `scripts/release.sh`、`scripts/api-check.mjs`、`scripts/openapi-check.mjs`、`scripts/preflight-product-smoke.mjs`、`scripts/preflight-ui-e2e.mjs`、`scripts/auto-deploy.sh`、`scripts/rollback.sh`、`scripts/sync-*.sh`、`scripts/automation-*.mjs`、`scripts/pr-approval-gate.mjs`、`scripts/approval-token-ledger.sh`、`scripts/publish-to-github.sh`、`scripts/jetscope-env*`、`scripts/safenv*`
- 根 `package.json`、`tsconfig*.json`、`next.config*`、`README.md`（jetscope 产品 README）

**不要在 root 编辑这些文件**。jetscope 产品开发的唯一入口是：

```
~/projects/jetscope
```

如果你正在 root 跑 `npm run dev` / `npm run release` / `npm run preflight` 等命令，每次会看到 stderr 警告，这是 B 阶段的过渡软提示——它仍会执行，但请尽快迁去 `~/projects/jetscope`。

---

## 2. 当前 git 分叉状态（2026-05-02 快照）

| 仓 | HEAD | 共同祖先后独立 commit |
|----|------|----------------------|
| root (`/Users/yumei`) | `d820559` | 11 个：均为治理类（obsidian / ops_hub / dev-harness / 自动化） |
| `~/projects/jetscope` | `9ba310db` | 1 个：jetscope 产品类（release.sh 加固） |
| 共同祖先 | `ee908f23`（PR #41 合并） | — |

两边触及文件零重叠。这意味着：
- **root 上未来不会再有 jetscope 产品类 commit**——产品改动应去 `~/projects/jetscope` 提。
- **root 上的治理 commit 不会被 push 到 `wyl2607/jetscope`**——它们将在 C 阶段迁出到 `~/workspace-ops/` 或类似位置。

---

## 3. 给 AI / 协作者的指引

- 收到 jetscope 产品类任务（功能、API、UI、release、preflight、docker、test）→ `cd ~/projects/jetscope` 工作。
- 收到 workspace 治理类任务（obsidian、ops_hub、launchd、自动化、AI 工具）→ 在 root 工作。
- 不确定时：先问，或读 §1 的两份清单。
- **禁止**在 root 改 §1.B 列出的任何文件。这会污染 jetscope 产品的 git 历史（即使现在没 push）。
- 决策方案完整版见 `~/.claude/plans/jetscope-dual-repo-convergence.md`。

---

## 4. 后续

C 阶段会把 §1.A 的内容迁出到独立位置，然后删除 root 的 `.git`（root 退化为纯家目录 + workspace 治理工作树）。在那之前 B 是过渡态，约束就是不要让 jetscope 产品的事再回流到 root。
