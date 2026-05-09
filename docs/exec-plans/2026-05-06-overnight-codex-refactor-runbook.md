# 2026-05-06 Overnight Codex Refactor Runbook — JetScope read-model 抽取

> 配套 SOP：`~/tools/automation/workspace-guides/overnight-codex-daily-sop.md`
> Skill 入口：`overnight-goal-runner`，输入本文件路径即可。
> 单 goal 协议：`goal-driven-execution`（8 字段任务包，见 `_per-goal/JS-REF-00X.md`）。
>
> 模式延续：今天（2026-05-06）刚刚成功合并的 Germany Jet Fuel read-model 抽取
> （commit `4296aad3`，product-read-model.ts 665→490 行），用同一套 RED→GREEN
> 模板继续把 product-read-model.ts 内残留的 Dashboard / PriceTrendChart 抽离，
> 再处理 portfolio-read-model 和 lufthansa-flight-cuts 长页面。

## Project & Model

- Project root: `/Users/yumei/projects/jetscope`
- Model: `gpt-5.5`（Codex CLI relay key_a，自动 fallback 到 key_b）
- 每日预算: $200/day（key_a 全 402 即停跑）
- Approval policy: `never`（CLI-first，禁止 push/PR/远程）

## Concurrency Plan

| 段 | Goals | 并行/串行 | 原因 |
|---|---|---|---|
| 1 | JS-REF-001 | 单跑 | product-read-model.ts 写集 |
| 2 | JS-REF-002 | 单跑（必须在 001 之后） | 同一文件 product-read-model.ts |
| 3 | JS-REF-003, JS-REF-004 | **可并行** | lufthansa 页 vs portfolio-read-model.ts 写集不重叠 |

> 实际队列今晚跑 **串行 001→002→003→004**，简化恢复路径。

## Order & Status Table

| # | GOAL | 描述 | per-goal 文件 | 状态 | 起止 | 备注 |
|---|---|---|---|---|---|---|
| 1 | JS-REF-001 | 抽 Dashboard read-model 出 product-read-model.ts | `_per-goal/JS-REF-001.md` | DONE | 22:32–22:36 | product-read-model.ts 490→296 (-194); dashboard-read-model.ts=231; 60 tests + typecheck + diff-check 全绿 |
| 2 | JS-REF-002 | 抽 PriceTrendChart read-model 出 product-read-model.ts | `_per-goal/JS-REF-002.md` | DONE | 22:36–07:00+1 | product-read-model.ts 296→247 (-49); price-trend-chart-read-model.ts=62; 62 tests + typecheck + diff-check 全绿 |
| 3 | JS-REF-003 | 抽 lufthansa-flight-cuts page 数据/常量到 sibling data 模块 | `_per-goal/JS-REF-003.md` | DONE | 07:00–08:16 | page.tsx 507→298, data.ts=191; 62 tests + typecheck + diff-check 全绿; ⚠ DOM 结构非字节级一致（RichP 包 span，行为一致） |
| 4 | JS-REF-004 | 抽 ResearchSignal 子系统出 portfolio-read-model.ts | `_per-goal/JS-REF-004.md` | DONE | 08:16–08:36 | portfolio-read-model.ts 319→111 (-208); research-signals-read-model.ts=267; 62 tests + typecheck + diff-check 全绿 |

> 状态枚举: `TODO` / `RUNNING` / `DONE` / `FAILED` / `BLOCKED` / `PARTIAL` / `CANCELLED`

## Hard Rules

1. **测试先行**：每个 goal 先把验收门测试改成会 RED 的形态（断言新模块导出存在或断言 page 行数下限），确认 RED，再写实现。
2. **白名单 only**：只改 per-goal 文件 `允许修改` 列出的路径；越界立即停。
3. **禁止破坏性**：不 push、不开 PR、不动 `infra/`、`scripts/release*`、`scripts/jetscope-env`、`.env*`、不动远端、不跑 SSH/VPS/launchd/rsync、不动 lockfile（`package-lock.json` 不重生成）。
4. **重试上限**：同一根因失败 3 次 → BLOCKED → 跳下一 goal。
5. **写回**：每个 goal 跑完更新
   - `_per-goal/<GOAL_ID>.md` 末尾的 **Result** 段
   - `PROJECT_PROGRESS.md` 顶部追加一行
   - 本 runbook **Status Table**
6. **行为不变**：read-model 抽取必须 100% 行为保持；现有测试和 typecheck 全绿才算 DONE。
7. **不重命名导出符号**：被抽出的函数/类型 import 路径会变，但符号名保持，避免 caller 改动放大。

## Pre-flight Check（开跑前 60 秒）

```bash
# 1. relay 健康
curl -s -o /dev/null -w "relay=%{http_code}\n" \
  -H "Authorization: Bearer $(jq -r .OPENAI_API_KEY ~/.codex-cli-relay/auth.json 2>/dev/null)" \
  https://relay.nf.video/v1/models

# 2. 工作树干净
cd /Users/yumei/projects/jetscope && git status --short

# 3. baseline 测试可跑（focused，避免拖时间）
cd /Users/yumei/projects/jetscope && \
  npm test -- test/product-read-model.test.mjs test/sources-read-model.test.mjs > /tmp/jetscope-baseline.txt 2>&1
echo "exit=$?"; tail -5 /tmp/jetscope-baseline.txt
```

三项任一失败 → 不开跑。

## Per-Cycle Workflow

1. 把对应行状态改成 `RUNNING`，填起始时间。
2. 打开 `_per-goal/<GOAL_ID>.md`，复制 **Codex Command** 整段贴进 Codex CLI（或 runner 自动执行）。
3. Codex 跑完后，由 Claude 本机重跑该 goal 的"验证命令"二次确认（Codex 自报不可信）：
   - `npm test -- <相关测试>`
   - `npm run web:typecheck`
   - `git diff --check -- <allowlist>`
4. 验证通过 → 把改动文件清单、token、净行数差、剩余风险写进 per-goal **Result** 段。
5. 把本 runbook 状态改为 `DONE` / `FAILED` / `BLOCKED`。
6. 追加一行到 `PROJECT_PROGRESS.md`。

## Morning Aggregation

跑完后写 `docs/exec-plans/2026-05-07-morning-report.md`，骨架按 SOP §C3。

## Stop / Resume

- 任何 goal `BLOCKED` 后继续下一 goal；不要为单个失败停整夜。
- `npm test` 出现 unrelated 失败 → 记录到 morning report 的 "Pre-existing failures" 段，不算本 goal 失败。
- 如果 02:00 前 4 个 goal 全部 DONE，**不要**自动追加新任务；进入 idle，等早晨 aggregation。
