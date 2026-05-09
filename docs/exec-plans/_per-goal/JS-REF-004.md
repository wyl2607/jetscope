# JS-REF-004 — 抽 ResearchSignal 子系统出 portfolio-read-model.ts

## 目标

把 `apps/web/lib/portfolio-read-model.ts`（319 行）里"AI research signal 子系统"抽到独立模块 `apps/web/lib/research-signals-read-model.ts`：
- 类型：`ResearchSignal`、`ResearchSignalsResult`、`ResearchDecisionBrief`
- 常量：`AI_RESEARCH_ENABLED`
- 函数：`getResearchSignals`、`buildResearchDecisionBrief`

`portfolio-read-model.ts` 保留：`ReserveCoverage`、`TippingEvent`、`getEuReserveCoverage`、`getTippingPointEvents`，行为不变。

## 上下文

- 文件 319 行，明显有两个独立子系统：reserve/tipping events vs research signals。grep 确认它们之间没有交叉调用。
- caller 多半是 `apps/web/app/portfolio/**` 或 `apps/web/app/dashboard/page.tsx`。grep 后改 import 路径。
- 测试 loader 别名按需扩。

## 允许修改

- `apps/web/lib/research-signals-read-model.ts` （新建）
- `apps/web/lib/portfolio-read-model.ts`
- 任何 import 这些 research signal 符号的页面/组件文件
- `test/helpers/load-web-lib.mjs`
- 现有相关测试（如 `test/portfolio-read-model.test.mjs`，存在则更新 import；否则新增 `test/research-signals-read-model.test.mjs` 作为 acceptance gate）

## 禁止修改

- `package.json` / lockfile
- `infra/`、`scripts/release*`、`.env*`、`.github/`
- `apps/api/`、`apps/db/`、`packages/core/`
- 其他 read-model 文件（dashboard / sources / germany-jet-fuel / price-trend-chart）
- 任何 push / PR / SSH / VPS / launchd / rsync

## 执行方式

CLI-first。

## 验证

```bash
cd /Users/yumei/projects/jetscope

# 找 caller
rg -n "ResearchSignal|getResearchSignals|buildResearchDecisionBrief|AI_RESEARCH_ENABLED" apps/web

# acceptance gate（先 RED）
# 新增或更新测试断言：
#   import { getResearchSignals } from '@/lib/research-signals-read-model'
npm test -- <相关测试>

# 实现后
npm test
npm run web:typecheck
git diff --check -- apps/web/lib/research-signals-read-model.ts apps/web/lib/portfolio-read-model.ts test/helpers/load-web-lib.mjs
```

## 完成标准

- 新文件存在并导出 6 个符号（3 类型 + 1 常量 + 2 函数）。
- portfolio-read-model.ts 不再持有这些定义；行数下降 ≥120 行。
- 所有 caller 改用新路径。
- `npm test` 总数与 baseline 一致或更多。
- `npm run web:typecheck` 全绿。
- `git diff --check` 通过。

## 交付（Result，跑完后填）

- 改动文件：
- 验证结果：
- Token：
- 净 LOC：portfolio-read-model.ts <before> → <after>
- 剩余风险：
- 下一步：（早晨 aggregation；不自动追加新任务）
