# JS-REF-002 — 抽 PriceTrendChart read-model 出 product-read-model.ts

## 目标

把 `getPriceTrendChartReadModel` 及其专属类型（`PriceTrendChartData`、`PriceTrendChartReadModel`）从 `apps/web/lib/product-read-model.ts` 抽到独立模块 `apps/web/lib/price-trend-chart-read-model.ts`，行为完全保持不变。

## 上下文

- 必须在 JS-REF-001 之后执行（同一文件，串行）。
- 共享依赖：`fetchJson`、`MarketHistoryMetric`、`MarketHistory`、`metricLabel`、`finiteNumberOrNull`、`resolveHistoryMetric`、`finiteChangeOrNull` 仍由 product-read-model.ts 持有；新模块 import 即可，不复制。
- 找出当前 caller（grep `getPriceTrendChartReadModel` / `PriceTrendChartReadModel` / `PriceTrendChartData`），改成从 `@/lib/price-trend-chart-read-model` import。
- 测试 loader 别名按需扩展。

## 允许修改

- `apps/web/lib/price-trend-chart-read-model.ts` （新建）
- `apps/web/lib/product-read-model.ts`
- 任何 import 此 read-model 的页面或组件文件（grep 后列入；典型路径：`apps/web/app/prices/**/page.tsx`、`apps/web/app/de/prices/**/page.tsx`、相关 `client-*.tsx`）
- `test/helpers/load-web-lib.mjs`
- `test/product-read-model.test.mjs`

## 禁止修改

- `package.json` / `package-lock.json` / `pnpm-lock.yaml`
- `infra/`、`scripts/release*`、`scripts/jetscope-env`、`.env*`、`.github/`
- `apps/api/`、`apps/db/`、`packages/core/`
- JS-REF-001 抽出的 `dashboard-read-model.ts` 内容（不要二次改）
- 任何 push / PR / SSH / VPS / launchd / rsync

## 执行方式

CLI-first。

## 验证

```bash
cd /Users/yumei/projects/jetscope

# 找 caller
rg -n "getPriceTrendChartReadModel|PriceTrendChartReadModel|PriceTrendChartData" apps/web

# acceptance gate（先 RED）
# 在 test/product-read-model.test.mjs 增加：
#   import { getPriceTrendChartReadModel } from '@/lib/price-trend-chart-read-model'
npm test -- test/product-read-model.test.mjs

# 实现后
npm test -- test/product-read-model.test.mjs
npm run web:typecheck
git diff --check -- apps/web/lib/price-trend-chart-read-model.ts apps/web/lib/product-read-model.ts test/helpers/load-web-lib.mjs test/product-read-model.test.mjs
```

## 完成标准

- 新文件 `apps/web/lib/price-trend-chart-read-model.ts` 存在并导出三个符号。
- `product-read-model.ts` 不再含 `PriceTrendChart*` 定义。
- 所有 caller 改用新路径。
- focused 测试 + typecheck 全绿。
- `git diff --check` 通过。
- product-read-model.ts 行数继续下降。

## 交付（Result，跑完后填）

- 改动文件：
- 验证结果：
- Token：
- 净 LOC：product-read-model.ts <before> → <after>
- 剩余风险：
- 下一步：JS-REF-003
