# tools/automation repo-evolver architecture plan

## 定位

- 这不是从零新建平台。
- 这份计划只讨论如何在 `tools/automation` 内复用现有系统，逐步收敛成一个 Git-first 的 repo-evolver 维护流水线。
- 当前尚未执行独立 repo/package 拆分；Phase 5 ADR 已记录可拆分方向，但执行仍需人工操作和单独验证。

## Current State

- `PROJECT_PROGRESS.md` 记录了当前自演化队列、daily reports、task packets、以及 skill governance 的推进状态。
- `README.md` 说明了现有 automation entrypoints、目录边界、以及当前仍属于本地 workspace automation package 的定位。
- `workspace-guides/automation-source-runtime-classification.md` 已经把 source、runtime、generated evidence、hand-off material、high-risk tooling 做了分类。
- `workspace-guides/automation-project-split-decision.md` 是原始不拆分基线；当前已由 `docs/decisions/phase5-split-decision.md` 记录新的 Phase 5 决策，但执行仍 deferred。
- `runtime/self-evolution/daily-evolution-2026-05-08.json` 与 `.md` 展示了当前 drift queue、优先级分布、ignored findings 和 review-first task packets。
- `runtime/self-evolution/daily-evolution-2026-05-08-task-packets.json` 提供了可执行的 task packet 形态，说明现阶段已经具备 review-first 交接素材，但还没有自动修复型平台接口。
- `workspace-guides/repo-evolver-maintenance-system.md` 保存了 Git-first 维护系统规划：Codex 作为项目级自动化/PR/CI 执行支持，Claude Code 作为本地技能、记忆、复杂判断和风格维护支持；外部工具和 workflow 只作为候选集，执行前必须按当前官方来源和本地策略复核。

## Target Architecture

- 目标形态：`repo-evolver inside tools/automation for now`。
- 这个 repo-evolver 的职责不是扩张功能面，而是把现有 source、runtime、trace、handoff、review 流程收敛成稳定、可审计、可回放的维护流水线。

### 五条主线

1. Maintenance audit and continuous refactor queue
   - 以现有 runtime 和 task packets 为输入，形成持续重构队列。
   - 只做 review-first、bounded-scope、可验证的维护任务。

2. Documentation fact verification and stale-claim review
   - 把 doc-drift、stale claim、missing path、历史归档和当前事实分开处理。
   - 以本地证据和现有 source 文件为准，不用聊天记忆替代事实。

3. Agent skill lifecycle governance
   - 管理 skill 的增删改查、重复、漂移、归档、版本差异和治理节奏。
   - 技能本身是治理对象，不是默认可以无限复制的运行时资产。

4. Obsidian mirror policy with Git as canonical truth
   - Obsidian 只做镜像和阅读层。
   - Git 是 canonical truth，镜像不得反向成为主数据源。

5. Git backup, source manifest, runtime ignore, and restore governance
   - 用 source manifest、runtime ignore manifest、备份策略和 restore rehearsal 约束迁移与恢复。
   - 任何恢复都必须能回到 Git 事实和已分类 runtime 边界。

## Phase Plan

### Phase 0: Preserve boundary and inventory what exists

- 先保持当前 safety boundary 不变。
- 盘点现有 source、runtime、generated evidence、handoff files、high-risk scripts、skill assets、Obsidian 镜像候选。
- 不引入新执行器，不改远程行为，不改同步边界。

### Phase 1: Normalize architecture plan, manifests, and doc metadata

- 固化这份 architecture plan 为项目级导航入口。
- 建立或整理 source manifest 和 runtime manifest 的事实口径。
- 统一文档元数据，让 source、runtime、archive、proposal、historical note 的标记一致。

### Phase 2: Strengthen doc-drift and skill-drift as review-first workflows

- 把 doc-drift queue 维持为可重复审查流程，而不是一次性清理。
- 把 skill-drift / skill-governance 维持为 review-first 的生命周期管理。
- 所有改动仍以 tight task packets 驱动，先审后改。

### Phase 3: Add Obsidian mirror governance without a second source of truth

- 明确 Obsidian mirror 的生成方向和可见范围。
- 只允许镜像、索引、阅读和交叉引用，不允许把镜像写回成主真相。
- 任何镜像更新都必须可追溯到 Git source 和已分类 runtime evidence。

### Phase 4: Add Git backup and restore rehearsal policy

- 定义 Git backup 的节奏、范围、校验点和保留策略。
- 形成 restore rehearsal 规则，验证 source manifest、runtime ignore 和镜像关系不会在恢复后失真。
- 先做演练策略，再考虑自动化扩展。

### Phase 5: Reconsider repo/package split only after the above is stable

- **2026-05-08 更新**：Phase 0-4 全部通过，用户批准记录拆分决策。
- 已产出 `docs/decisions/phase5-split-decision.md`（ADR），包含可移植清单和 7 步迁移计划。
- 拆分执行仍为 deferred，需人工操作（`git init`、parameterization、push），不纳入自动 pipeline。
- `open_queue=20` 属于持续维护 backlog，必须在 audit/dashboard 中可见，但不阻塞 Phase 5 本地可审查闭环。
- `tools/automation` 继续作为操作副本；新仓库为发布源。

## Execution Handoff

- 实现和写作工作应由 Codex CLI 依据 tight task packets 执行。
- 父控制器 / Claude 保留架构判断、安全审查、边界裁定和最终验收。
- 任何单次执行都应是局部、可回滚、可验证的，不要求一次性把整条流水线全部落地。

## Public Interface

- 第一阶段不修改任何 script、CLI、automation runtime behavior、remote workflow 或同步行为。
- 这一步的唯一新界面就是 `plan.md`。
- 以下内容仅作为 proposal，不是已实现能力：
  - `.evolver/`
  - `agent-skills/`
  - Obsidian mirror manifest
  - source/runtime publication manifest
  - scheduled audit workflow

## Safety Rules

- 只在 `tools/automation` 现有边界内推进。
- 不做 push、PR、remote mutation、VPS mutation、Windows mutation、sync、deploy、install、uninstall。
- 不读取 secret，不把 runtime 当 source，不把镜像当主真相。
- 不为未来接口提前写实现细节，不把 proposal 写成事实。
- 不扩大范围到无关仓库、无关脚本或无关运行时状态。

## Acceptance Criteria

- `plan.md` 明确写出这不是新平台，而是复用 `tools/automation` 现有系统。
- `plan.md` 准确引用并描述了 Current State 中列出的本地证据路径。
- `plan.md` 清楚定义了五条主线和六个阶段，没有把未来 proposal 写成已完成工作。
- `plan.md` 明确了执行分工：Codex CLI 负责 tight task packets，Claude 负责架构审查与验收。
- `plan.md` 明确了 Git canonical truth、Obsidian mirror 只是镜像、runtime 只是本地证据。

## Verification

- `git diff --check -- /Users/yumei/tools/automation/plan.md`
  - 期望：无 whitespace 或 patch 格式错误。
- 手工检查 `plan.md`
  - 期望：引用了现有仓库组件，且没有声称未实现的 workflow 已经存在。

## Notes on Future Work

- 如果后续要真正落地 repo-evolver，优先顺序仍然是：边界 -> 清单 -> 审查队列 -> 镜像治理 -> 备份恢复。
- 任何下一步任务都应拆成最小 task packet，再进入执行。
