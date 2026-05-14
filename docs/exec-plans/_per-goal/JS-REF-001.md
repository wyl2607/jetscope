# JS-REF-001 — 抽 Dashboard read-model 出 product-read-model.ts

## 目标

把 `getDashboardReadModel` 及其专属类型（`DashboardReadModel`）、专属 helper（`computeFreshnessSignal`、`computeTopRiskSignal`、`fallbackReadModel`、`FRESHNESS_THRESHOLDS`、`FRESHNESS_DEFAULTS`、`envThreshold`）从 `apps/web/lib/product-read-model.ts` 抽到独立模块 `apps/web/lib/dashboard-read-model.ts`，行为完全保持不变。

## 上下文

- 项目：JetScope（`/Users/yumei/projects/jetscope`），active，工作树干净。
- 同一文件 `apps/web/lib/product-read-model.ts` 当前 490 行，今天 commit `4296aad3` 刚把 Germany Jet Fuel 抽出（665→490）。延续相同模式继续抽 Dashboard。
- 共享给 caller 的依赖：`MarketSnapshot`、`ReserveSignal`、`AirlineDecisionResponse`、`MarketHistory` 这些类型仍由 product-read-model.ts 持有；新模块 `dashboard-read-model.ts` 应 `import { ... } from './product-read-model'` 拿到，不要复制类型。
- caller 当前是：`apps/web/app/dashboard/page.tsx`、`apps/web/app/de/dashboard/page.tsx`。改完后它们应改成 `import { getDashboardReadModel, type DashboardReadModel } from '@/lib/dashboard-read-model'`。
- 测试 loader 需要支持新别名，同 Germany Jet Fuel slice 的做法（参考 commit `4296aad3` 中 `test/helpers/load-web-lib.mjs` 的 alias 规则）。
- 不动任何 release / sync / push / PR / lockfile / infra / `.env*`。

## 允许修改

- `apps/web/lib/dashboard-read-model.ts` （新建）
- `apps/web/lib/product-read-model.ts`
- `apps/web/app/dashboard/page.tsx`
- `apps/web/app/de/dashboard/page.tsx`
- `test/helpers/load-web-lib.mjs`（如需扩 alias）
- `test/product-read-model.test.mjs`（acceptance gate；如已覆盖 dashboard 则就地更新 import 路径）

## 禁止修改

- `package.json` / `package-lock.json` / `pnpm-lock.yaml`
- `infra/`、`scripts/release*`、`scripts/jetscope-env`、`.env*`、`.github/`
- `apps/api/`、`apps/db/`、`packages/core/`
- 任何 push / PR / SSH / VPS / launchd / rsync 命令

## 执行方式

CLI-first：编辑文件 + 运行 `npm test -- <focused>` + `npm run web:typecheck`。不需要浏览器/GUI。

## 验证

```bash
cd /Users/yumei/projects/jetscope

# acceptance gate（先 RED）
# 在 test/product-read-model.test.mjs 增加或修改一条断言：
#   import { getDashboardReadModel } from '@/lib/dashboard-read-model'
# RED：因模块不存在/import 失败而失败。
npm test -- test/product-read-model.test.mjs

# 实现后 GREEN
npm test -- test/product-read-model.test.mjs
npm run web:typecheck

# 越界检查
git diff --check -- \
  apps/web/lib/dashboard-read-model.ts \
  apps/web/lib/product-read-model.ts \
  apps/web/app/dashboard/page.tsx \
  apps/web/app/de/dashboard/page.tsx \
  test/helpers/load-web-lib.mjs \
  test/product-read-model.test.mjs
```

## 完成标准

- 新文件 `apps/web/lib/dashboard-read-model.ts` 存在，导出 `getDashboardReadModel`、`DashboardReadModel` 至少这两个符号。
- `product-read-model.ts` 不再包含 `DashboardReadModel` / `getDashboardReadModel` / `computeFreshnessSignal` / `computeTopRiskSignal` / `fallbackReadModel` / `FRESHNESS_*` 定义；如有 caller 仍需访问其中一个，再决定 re-export，但不复制实现。
- 两个 dashboard page 文件使用新 import 路径。
- `npm test -- test/product-read-model.test.mjs` 全绿（数量与之前持平或更多）。
- `npm run web:typecheck` 全绿。
- `git diff --check` 通过。
- product-read-model.ts 行数下降 ≥80 行。

## 交付（Result，跑完后填）

- 改动文件：
- 验证结果：
- Token：
- 净 LOC：product-read-model.ts <before> → <after>；dashboard-read-model.ts = <new>
- 剩余风险：
- 下一步：JS-REF-002（同一文件 PriceTrendChart 抽离）
