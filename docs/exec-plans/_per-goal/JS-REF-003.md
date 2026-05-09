# JS-REF-003 — Lufthansa flight-cuts 长页面拆数据/常量

## 目标

把 `apps/web/app/analysis/lufthansa-flight-cuts-2026-04/page.tsx`（507 行）里的"数据/常量/长文案数组"抽到 sibling data 模块 `apps/web/app/analysis/lufthansa-flight-cuts-2026-04/data.ts`（或 `apps/web/lib/lufthansa-flight-cuts-data.ts`，由实现者按 import 频度决定，**只能选一个**）。页面文件应只保留 JSX + import，目标 ≤300 行。行为/渲染输出完全不变。

## 上下文

- 文件当前 507 行；顶部已有 `FACTS`、`BASELINE`、`LUFTHANSA_SHOCK_2026Q2` 三组明显的纯数据常量，外加大概率有大段中文文案数组。
- 这是一个深度营销文章页面，纯静态，无 API 调用，无 read-model 逻辑。最低风险 slice。
- `metadata` / `revalidate` 必须留在 page.tsx（Next.js 要求）。
- 不动 `<Shell>`、`<InfoCard>`、`<Link>` 这些组件 import；只搬数据。

## 允许修改

- `apps/web/app/analysis/lufthansa-flight-cuts-2026-04/page.tsx`
- `apps/web/app/analysis/lufthansa-flight-cuts-2026-04/data.ts` （新建，sibling 优先）
- 如确需放到 `apps/web/lib/`，则改为 `apps/web/lib/lufthansa-flight-cuts-data.ts` 并仅创建该一个文件
- 可新增一个最小冒烟测试 `test/lufthansa-flight-cuts-data.test.mjs`（可选，断言常量结构，作为 acceptance gate）

## 禁止修改

- `package.json` / lockfile
- 其他 analysis 页面
- `apps/web/components/`
- `apps/web/lib/seo.ts`（buildPageMetadata 不动）
- 任何远端/release/sync

## 执行方式

CLI-first。

## 验证

```bash
cd /Users/yumei/projects/jetscope

# 行数下限 gate（先 RED 再 GREEN）
wc -l apps/web/app/analysis/lufthansa-flight-cuts-2026-04/page.tsx

# typecheck + 现有测试不破
npm run web:typecheck
npm test

# 新增的 data 模块如有测试
[ -f test/lufthansa-flight-cuts-data.test.mjs ] && npm test -- test/lufthansa-flight-cuts-data.test.mjs

# diff check
git diff --check -- \
  apps/web/app/analysis/lufthansa-flight-cuts-2026-04/page.tsx \
  apps/web/app/analysis/lufthansa-flight-cuts-2026-04/data.ts
```

## 完成标准

- page.tsx ≤300 行（原 507）。
- 数据模块导出至少：`FACTS`、`BASELINE`、`LUFTHANSA_SHOCK_2026Q2`，以及任何被抽出的长文本数组。
- `metadata`、`revalidate`、`export default function` 仍在 page.tsx。
- `npm run web:typecheck` 全绿。
- `npm test` 总数与 baseline 一致或更多，无新增 failure。
- `git diff --check` 通过。

## 交付（Result，跑完后填）

- 改动文件：
- 验证结果：
- Token：
- 净 LOC：page.tsx <before> → <after>，data.ts = <new>
- 剩余风险：
- 下一步：JS-REF-004
