# 2026-05-07 AI UI Verification Chain

## Goal

固化 JetScope 的 Browser Use 人因审计、代码验证、记录写回和本地提交闭环，减少已验证改动长期停留在脏树里的情况。

## Context

- 最新提交 `323a15be feat(web): refine crisis briefing fallback UX` 已证明当前流程可行：Browser Use 真点击 `/crisis` 两条主路径，`npm run web:typecheck` 和相关 Node tests 通过，随后形成本地提交。
- JetScope 产品开发入口是 `/Users/yumei/projects/jetscope`；workspace 治理和 skill-chain 文档在 `/Users/yumei/tools/automation/workspace-guides/`。
- 根 workspace `/Users/yumei` 已有其他未提交改动，本轮 workspace 文档提交必须只 stage 本轮触碰文件。

## Scope

- `/Users/yumei/projects/jetscope/AGENTS.md`
- `/Users/yumei/projects/jetscope/PROJECT_PROGRESS.md`
- `/Users/yumei/projects/jetscope/docs/exec-plans/2026-05-07-ai-ui-verification-chain.md`
- `/Users/yumei/tools/automation/workspace-guides/skill-chains/plan-first-goal-chain-sop.md`
- `/Users/yumei/tools/automation/workspace-guides/skill-chains/plan-first-goal-chain-contract.json`
- `/Users/yumei/tools/automation/workspace-guides/skill-chains/checklists.md`

## Forbidden

- 不改产品运行代码、API、测试、发布、部署或同步脚本。
- 不提交 `.env*`、`.automation/`、`.omx/`、runtime state、私有 dev-harness 文件或生成日志。
- 不 push、不开 PR、不 release、不 deploy、不 sync nodes。
- 不把 `/Users/yumei` 根仓已有无关脏树混入本轮提交。

## Decision

采用“两层固化”：

- JetScope 项目层：在 `AGENTS.md` 写入 Browser Use UI lane 和验证后本地提交策略。
- Workspace skill-chain 层：在 plan-first SOP、machine contract 和 checklists 写入 UI/browser evidence、dirty-tree closure、Codex CLI worker guardrails。

## Implementation Order

1. 写入本计划并通过 plan-first 结构校验。
2. 更新 JetScope `AGENTS.md` 的项目执行规则。
3. 更新 workspace skill-chain SOP/contract/checklists。
4. 更新 `PROJECT_PROGRESS.md`，记录固化内容和验证证据。
5. 运行文档/JSON 校验，分别检查两个 repo 的 diff 和 status。
6. 若验证通过，分别在 JetScope repo 和 workspace root repo 只提交本轮文件。

## Acceptance Criteria

- 前端/UI 任务规则明确要求 Browser Use 证据：路径、点击动作、预期 UI 结果、console error 状态和残余风险。
- 已验证可提交的本地改动规则明确：先分类 dirty tree，再按目的提交；混合脏树不能自动全量 stage。
- Codex CLI `/goal` 委派规则明确：只有 bounded worker，可改 allowlist，不可扩大范围或远端操作。
- 本轮两个 repo 的提交都只包含本计划允许的文件。

## Verification

- `python3 /Users/yumei/tools/automation/workspace-guides/skill-chains/chain-gates/chain_gates.py plan-first-validate --plan docs/exec-plans/2026-05-07-ai-ui-verification-chain.md --sop /Users/yumei/tools/automation/workspace-guides/skill-chains/plan-first-goal-chain-sop.md --contract /Users/yumei/tools/automation/workspace-guides/skill-chains/plan-first-goal-chain-contract.json`
- `python3 -m json.tool /Users/yumei/tools/automation/workspace-guides/skill-chains/plan-first-goal-chain-contract.json >/dev/null`
- `git diff --check -- AGENTS.md PROJECT_PROGRESS.md docs/exec-plans/2026-05-07-ai-ui-verification-chain.md`
- `git -C /Users/yumei diff --check -- tools/automation/workspace-guides/skill-chains/plan-first-goal-chain-sop.md tools/automation/workspace-guides/skill-chains/plan-first-goal-chain-contract.json tools/automation/workspace-guides/skill-chains/checklists.md`

## Browser Evidence when frontend UI is touched

Not applicable to this docs-only workflow change. The rule being added requires future UI tasks to record entry URL, browser path, expected visible outcome or DOM assertion, console error status, API/data state, and residual UX risk.

## Review Findings

- Initial read-only subagent recommendation: update JetScope `AGENTS.md`, plan-first SOP/contract/checklists, and preserve manual judgment for UX taste, conflict resolution, and remote actions.
- Command Code second opinion: pending during plan creation; findings will be reconciled before final commit if returned in time.

## Approval State

Approval State: `approved_for_goal`

Evidence: user explicitly requested continuing autonomously with Codex/Codex CLI support and making the workflow durable; read-only planner subagent agreed with the file targets and guardrails.

## Goal Packets

```text
/goal Complete JetScope AI UI verification chain docs

Goal:
Document the Browser Use UI verification and validated local commit loop in JetScope and workspace skill-chain guidance.

Context:
Latest JetScope commit 323a15be is a verified crisis UI pass. Use this plan as the source of scope and verification.

Allowed:
AGENTS.md
PROJECT_PROGRESS.md
docs/exec-plans/2026-05-07-ai-ui-verification-chain.md
/Users/yumei/tools/automation/workspace-guides/skill-chains/plan-first-goal-chain-sop.md
/Users/yumei/tools/automation/workspace-guides/skill-chains/plan-first-goal-chain-contract.json
/Users/yumei/tools/automation/workspace-guides/skill-chains/checklists.md

Forbidden:
Product runtime code, tests, release/deploy/sync scripts, secrets, .env*, runtime state, git push, PR, release, deploy, sync.

Execution:
CLI-first docs-only edits. Browser Use is not required because this is process documentation, not a UI change.

Verification:
Run the commands listed in this plan.

Done:
Rules are documented, validators pass, diffs are scoped, and local commits are created only for the touched files.

Result Artifact:
This plan plus final git commits.

Budget:
One bounded docs slice.

Retry Policy:
If validation fails, revise only the affected docs and rerun the same gate.

Stop Policy:
Stop if required files are unexpectedly dirty from unrelated work, JSON validation fails in a non-obvious way, or a remote action would be needed.

Delivery:
Report changed files, validation, commit hashes, and remaining risks.
```

## Write-Back

- Update `PROJECT_PROGRESS.md`.
- Add an ai-trace session entry if this becomes a reusable workflow rule.
