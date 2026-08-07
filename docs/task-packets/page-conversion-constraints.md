# P1.5 页面转换 — 可复用约束包

给 `codex exec` 用。每批只换最下面「本批任务」一节，上面的约束不动。

写这份东西的原因：前八批样式迁移里，codex 在**规则明确、量大、有精确对照表**的活上表现很好
（不擅自改测试、如实报失败、拿不准会上报），但在**需要判断"这个颜色代表什么意思"**的地方
反复犯同一类错。所以下面第 3 节是硬清单，不是提示语。

---

## 1. 唯一事实来源

- 风格契约：`docs/UI_CONTRACT.md`（**只读。功能 PR 里改契约 = 直接拒绝**）
- 模板层：`apps/web/components/page-template.tsx`、`panel.tsx`、`source-footer.tsx`
- 已转换的参考页（照着抄结构）：
  - `apps/web/app/reports/page.tsx` — 索引型页面
  - `apps/web/app/crisis/page.tsx` — 图件密集型页面
  - `apps/web/app/de/crisis/page.tsx` — 多语言 + 兜底时间戳处理

## 2. 每个页面必须产出的五件东西

契约第 2 节。缺一件就算没做完。

1. **一个决策问题**（`question=`）。是"读者拿这页做什么决定"，不是页面标题的改写。
   反例：「报告工作台」。正例：「这份报告现在能不能作为决策依据发出去？」
   要两句话才说得清 = 这是两个页面，上报，不要自己拆。
2. **as-of 戳**（`asOf=`）。取页面上最新那个数字的来源时间。
3. **SignalRow 结论行**（2–4 张 MetricCard）。**结论排第一张**，后面的解释"这个结论能信几分"。
   读者只看第一屏也要拿到答案。
4. **每个 Panel 一句 why**。写"读者为什么该关心这一块"，不是复述标题。
5. **SourceFooter**：来源 + basis + 方法链接 + 适用边界（limitations）。
   **没有来源的页面不上线。**

## 3. 硬约束（违反任意一条 = 打回，不接受"看起来更好看"作为理由）

### 3.1 语义颜色必须携带信息
- token 只有 `success / warning / danger / accent` 四个语义色。
- **不许给导航、链接、装饰染语义色。** 给"复核来源"入口染 warning，读者会以为来源出了问题。
- **不许把问题态洗成中性。** 未知来源、无置信度、未识别信号、兜底模式——
  这些的兜底分支必须仍然是 `danger` 或 `warning`，不许 fallthrough 到 `text-muted`。
  这是历史上最危险的一类缺陷：数据质量问题被静悄悄藏起来。
- **先数业务分类有几个。超过 4 个必须显式决定第 5 个怎么办**，不许让它默默和别人共用一个 token。

### 3.2 兜底数据不许伪装成实测
- read model 兜底时会用 `new Date()` 给自己盖戳。**兜底时 `asOf` 必须传 `null`。**
  - 有 `isFallback` 标记的：`const asOf = readModel.isFallback ? null : readModel.market.generated_at;`
  - crisis-brief 合约用 `error` 表示兜底：`const asOf = readModel.error ? null : (...);`
- SourceFooter 里对应来源的 `basis` 必须跟着变成 `'assumption'`，不许恒为 `'observed'`。
- 来源类型映射 basis：`official → observed`，`derived → derived`，
  **其他一律 `assumption`**（含人工估算）。默认值是 assumption，不是 observed。

### 3.3 图件不画自己的卡片
- 卡片、标题、why 句一律由外面的 `Panel` 提供。图件组件内部**不得**出现
  `rounded-2xl border ... p-6` 外壳，也不得重复写标题。
- **例外判据：容器的颜色是否携带信息。** 携带就留（如 `ResearchDecisionBriefCard`
  按研究状态染色、各组件的 empty/error 染色块），不携带就剥。
- 随数据变的东西留在组件里（滑块联动的徽标、当前指标说明、基准日期），标题归 Panel。
- 防回退测试：`apps/web/components/__tests__/artifact-chrome.test.tsx`。
  **新剥的组件要加进去。** 注意用**有数据的状态**渲染——空态本来就该返回染色卡片。

### 3.4 交互态不许坍缩
契约第 1 节规则 7 的表格照抄，不要自己推理：

| 元素 | 静止 | hover |
| --- | --- | --- |
| 中性控件 | `border-line bg-surface` | `border-accent bg-accent-soft` |
| accent 控件 | `border-accent bg-accent-soft` | `bg-accent-hover` |
| 选择组·未选中 | `border-line bg-surface` | `border-line-strong bg-surface-muted` |
| 选择组·已选中 | `border-accent bg-accent-soft` | — |
| **状态卡**（带语义底色） | `border-line bg-{语义}-soft` | `border-{语义}`，**底色不变** |
| **实心控件**（主按钮） | `bg-{语义} text-surface` | `bg-ink` |

- 实心填充只能配 `text-surface`（白字）。`bg-accent text-ink` = 2.76:1，过不了 WCAG，
  但它 lint 全绿、看起来还挺像样——已经误发过两次。
- 「未选中项 hover 用 surface-muted」**只适用于选择组**。套到状态卡上会把健康卡 hover 成灰色。

### 3.5 尺度只有这些值
- 圆角：`rounded-xl`（控件）/ `rounded-2xl`（卡片、面板）。**没有 rounded-md / rounded-lg。**
- eyebrow：`text-xs uppercase tracking-[0.18em]`。**不是 0.14em、0.15em、0.16em。**
- 节奏 `space-y-8`，栅格间距 `gap-6`，间距走 Tailwind 4px 刻度。
- **所有数字加 `tabular-nums`。**

### 3.6 死代码一起清
- 转换后没人用的 helper、type 字段（如只服务于旧染色的 `tone`）**必须删**，不许留着。

### 3.7 换掉一张卡不许把入口一起换掉（batch 3 新增）
SignalRow 只放 2–4 张，重排时经常要挤掉一张。**被挤掉的那张如果带 `cardHref` /
`valueHref`，那个入口必须在页面别处活下来**（放进相关 Panel 的 `action`，或另一个链接位）。
batch 3 里 `/scenarios` 就是这么整页消失的：它只挂在被替换掉的那张卡上，
gate 全绿、测试全绿，没有任何东西会报。
**自查**：转换前 `grep -o 'cardHref="[^"]*"\|valueHref={[^}]*}' 旧文件`，
转换后逐个确认还在。

### 3.8 同一个来源在所有页面必须同一个 basis（batch 3 新增）
`SourceFooter` 里 `id` 相同的来源（如 `scenario-store`、`dashboard-read-model`），
**`basis` 必须跨页一致**。batch 3 里 `scenario-store` 在 dashboard 标 `assumption`、
在三个 reports 页标 `observed` —— 同一个东西两种说法，正是这一期要消灭的不一致。
**自查**：`grep -rn "id: '<该 id>'" -A 4 apps/web/app | grep basis`，输出必须只有一种值。
已定的口径：情景库 = `assumption`（存了是事实，但被引用的是里面的数字）。

### 3.10 组件内部不许再套顶层 Panel（batch 5 新增）
一个**复合工作区**组件（内部本来就分好几块）如果在调用点被包进 `Panel`，
它内部的分块**不能再用共用的 `Panel`** —— 那就是卡里套同款卡，和 #286/#288 消掉的
是同一个东西。内部分块要用从属样式：小号大写标题、无阴影、更紧的 padding，
**并且组件名不要叫 Panel**（batch 5 里 `transition-readiness-dashboard.tsx`
本地定义了一个同名 `Panel` 遮蔽了共用的那个，删遮蔽是对的，
但直接换成共用 Panel 就把层级压平了）。
**自查**：`grep -l "components/panel" 组件文件` —— 被 Panel 包着的组件不该命中。

### 3.9 重排后要重新缩进（batch 3 新增）
把 `<section>` 换成 `<Panel>`、把外层 `<div>` 去掉之后，**子节点要跟着改缩进**。
codex 常见的做法是只改父节点、子节点留在原深度，结果文件参差不齐。
lint 和 gate 都不管这个，但评审时非常显眼。

## 4. 工程约束（踩过坑的）

- **不许用 Python 文本模式改写文件。** Windows 上 `open(p,'w')` 会把 LF 写成 CRLF，
  整个文件显示为重写，release dry run 的 `git diff --check` 直接红。
  要用 Python 就走 `open(p,'rb')` / `open(p,'wb')` 字节模式。
- **不许 `git checkout <file>` 撤销临时改动**——会把整个文件退回 HEAD，本轮编辑全没。
- 推之前必查：`git diff --numstat origin/main...HEAD`。改几行显示几行；
  出现"整文件行数"就是行尾写坏了。
- 设计基线只能降不能升。改完跑 `node scripts/design-system-lint.mjs --update`，
  **不要手改 JSON 里的数字。**
- 转换完的页面要加进 `test/page-template-adoption.test.mjs` 的 `CONVERTED_PAGES`。
- **不许改契约**（`docs/UI_CONTRACT.md`）。发现契约缺口就上报，不要自己造 token。

## 5. 允许 / 禁止修改

允许：本批点名的 `apps/web/app/**/page.tsx`、为满足 3.3 必须剥壳的
`apps/web/components/*.tsx`、对应的 `apps/web/components/__tests__/*.test.tsx`、
`test/page-template-adoption.test.mjs`、`scripts/design-system-baseline.json`（只能经 `--update` 生成）。

禁止：`docs/UI_CONTRACT.md`、`.github/**`、`scripts/release*`、`scripts/security_check.sh`、
`infra/**`、`docker-compose*`、任何 `.env*`、以及**本批未点名的任何页面**。

## 6. 执行方式

CLI-first。**不许 push / 开 PR / 部署 / SSH / rsync / 删除 / reset / 改 git 历史。**
只在工作区改文件并提交到当前分支。

调用方式（batch 3 实测）：

```bash
codex exec --cd <worktree> -s workspace-write "$(cat 本文件)"
```

**耗时**：三个页面 >10 分钟，六个页面约 25 分钟。前台调用会被 10 分钟命令超时切掉。
用 `nohup ... &` 放后台，然后轮询 `ps | grep codex-win32-x64` 的进程数判断是否收工
（注意：后台包装器会立刻报"完成"，那是包装器退出，不是 codex 退出——只能看进程数）。

**codex 在本仓库无法自己 commit**（worktree 元数据权限），它会如实报告并把改动留在
工作区。这是预期行为，接手的人提交即可。

**任务包写错了它会报**：batch 4 里我说 `SourceCoveragePanel` 已剥壳，其实没有，
codex 核对后指出不一致、剥了壳、补了回归测试。**所以任务包里的事实性描述写错不致命，
但别写成"你不用查"**——保留它自己核对的空间。

## 7. 验证（全绿才算完成）

```bash
npm run web:gate
npm test
git diff --check origin/main...HEAD
git diff --numstat origin/main...HEAD
```

`npm test` 里有 3 个 `release-approval-contract` 失败是 Windows 本地已知误报，
**只有这 3 个**算通过；多一个都要报告，不许自己改测试绕过去。

## 8. 交付

1. 改了哪些文件，每个文件一句话说明改了什么。
2. 上面四条验证命令的实际输出（贴原文，不要转述）。
3. **拿不准的映射**：列出来，不要自己拍板。
4. **发现的契约缺口**：列出来，不要自己加 token。
5. 已知残留风险。
6. **超出第 5 节允许范围的改动**（batch 5 新增）：即使它符合契约、即使放在共用组件里
   更合理，也**单列一节**说明改了什么、为什么、影响面多大。不要埋进「改了哪些文件」里。
   batch 5 给所有 `MetricCard` 加 `tabular-nums` 是对的，但它影响 26 个页面，
   这种事必须让人看见再决定留不留。

---
