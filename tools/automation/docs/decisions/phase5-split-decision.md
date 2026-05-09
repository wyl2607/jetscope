---
doc_id: adr-phase5-split-001
type: decision
owner: repo-evolver
canonical_path: docs/decisions/phase5-split-decision.md
last_verified: 2026-05-09
verification_level: evidence-backed
source_of_truth:
  - repo:runtime/task-board/source-runtime-manifest.json
  - repo:workspace-guides/automation-project-split-decision.md
  - repo:plan.md
staleness_policy: review_after_split
risk_if_wrong: extreme
decision_status: accepted
execution_status: deferred
split_allowed: false
automatic_split_allowed: false
approval_required_for:
  - git init
  - push
  - pr
  - launchd mutation
  - root gitignore mutation
---

# ADR: Phase 5 — tools/automation 拆分为独立仓库

**状态**：accepted（用户批准 2026-05-08）
**supersedes**：`workspace-guides/automation-project-split-decision.md` 原决策（不拆分）

## 背景

Phase 0-4 全部完成：

- source/runtime 边界已固化（744 source, 21866 excluded, 0 unclassified）
- 文档治理就绪（docs/ 5 索引含 frontmatter, 20 registry surfaces）
- 技能治理就绪（L1=6, 0 active drift risks, android-cli 已 symlink）
- 镜像治理就绪（2 对, 0 blocking）
- 恢复治理就绪（restore rehearsal policy 完整）

Phase 3 proposed mirror 已审批激活。唯一剩余指标 `open_queue=20` 为语义漂移常规维护 backlog：它必须继续在 audit/dashboard 中可见，但不阻塞 Phase 5 本地可审查闭环。

## 决定

将 `tools/automation` 拆分为独立私有 Git 仓库。原路径保留为操作副本。

## 可移植子集

以下目录和文件纳入新仓库的 source manifest：

| 目录 | 文件数 | 风险 | 说明 |
| --- | --- | --- | --- |
| `scripts/` | 171 | high_risk=23 | 核心脚本；高风险脚本保持审批门 |
| `workspace-guides/` | 428 | 无 | 文档、runbook、注册表、策略 |
| `tests/` | 22 | 无 | 单元测试 |
| `templates/` | 22 | 无 | 项目记录模板 |
| `auto-refactor-loop/` | 8 | 无 | 并行开发 pipeline |
| `.evolver/` | 5 | 无 | 治理元数据 |
| `docs/` | 5 | 无 | 结构化文档索引 |
| `agent-skills/` | 1 | 无 | 技能统一索引 |
| `ai-scheduler/` | 10 | 无 | AI 调度器 |
| `roles/` | 4 | 无 | 角色定义 |
| `config/` | 1 | 无 | 配置文件 |
| 根目录 .md/.json | 23 | 无 | AGENTS.md, plan.md, README 等 |

**总计可移植**：~700 文件

## 不可移植子集（保留本地）

| 目录 | 文件数 | 原因 |
| --- | --- | --- |
| `runtime/` | 21,000+ | 本地运行时证据、日志、报告 |
| `.agents/skills/` | 部分 | 符号链接到本地路径 |
| 机器特定路径引用 | — | `/Users/yumei` 硬编码路径 |

## 迁移步骤

### Step 1: 冻结 manifest（✅ 已完成）

- `runtime/task-board/source-runtime-manifest.json` 已生成
- `unclassified_count=0`

### Step 2: 创建本地私有仓库

```bash
cd /tmp
git init tools-automation
cd tools-automation
```

从 `/Users/yumei/tools/automation` 复制可移植文件，保持目录结构。

### Step 3: 参数化硬编码路径

替换所有 `/Users/yumei` 绝对路径为环境变量 `$AUTOMATION_ROOT` 或 `$HOME`：

- 搜索 `grep -r '/Users/yumei'` 确认影响范围
- 优先修 `scripts/` 和 `auto-refactor-loop/` 中的路径
- `workspace-guides/` 中的文档路径标记为历史引用

### Step 4: 添加验证命令

```bash
python3 -m unittest tests.test_source_runtime_manifest tests.test_evolution_registry
python3 scripts/automationctl manifest --check
python3 scripts/evolution-registry.py validate
python3 -m py_compile scripts/*.py
bash -n scripts/*.sh
```

### Step 5: 安全审计

```bash
bash scripts/security_check.sh
python3 scripts/source-runtime-manifest.py --self-test
```

### Step 6: 保持操作副本

`/Users/yumei/tools/automation` 继续作为本机操作副本。新仓库为发布/备份源。

### Step 7: 验证恢复演练

确保从新仓库恢复后，`runtime/` 排除正确，source manifest 和 restore rehearsal 仍然有效。

## 不可自动执行的操作

以下操作禁止 AI 执行，需人工操作：

- `git init` 新仓库
- `git push` 到任何 remote
- 创建 GitHub PR
- 修改 `launchd` 配置
- 修改 `.gitignore` 根规则
- 删除原 `tools/automation` 中的任何文件

## 验证

拆分为独立仓库后运行：

```bash
python3 scripts/automationctl manifest --check  # 确认 unclassified=0
python3 scripts/evolution-registry.py validate   # 确认注册表完整
python3 -m unittest discover tests -q            # 确认测试通过
python3 scripts/restore-rehearsal-policy.py      # 确认恢复演练策略有效
```

## 回滚

如拆分有问题：

1. 删除新仓库
2. 恢复至此 ADR 之前的状态（manifest 和 registry 未受影响）
3. 操作副本 `tools/automation` 不受影响
